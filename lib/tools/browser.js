// ─── Browser Automation Tools ─────────────────────────────────────────────
// Desktop automation: click, type, press-key, scroll, move-mouse, drag, get-mouse-pos.
// Cross-platform: macOS (JXA/AppleScript) + Windows (PowerShell + .NET)
// Refactored: all shell calls use async execFile instead of blocking execSync.

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const SHELL_TIMEOUT = 5000;

async function runShell(platform, cmd, timeout = SHELL_TIMEOUT) {
  if (platform === "win32") {
    return execFileAsync("powershell", ["-NoProfile", "-Command", cmd], { timeout });
  } else {
    return execFileAsync("/bin/sh", ["-c", cmd], { timeout });
  }
}

function register(mainWindow, store, auditLog) {
  const { ipcMain } = require("electron");

  // Validate coordinates: must be finite numbers, non-negative, within reasonable bounds
  const MAX_COORD = 10000;
  function validateCoord(x, y) {
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || ny < 0 || nx > MAX_COORD || ny > MAX_COORD) {
      return { error: `Invalid coordinates: (${x}, ${y}). Must be 0-${MAX_COORD}.` };
    }
    return { x: nx, y: ny };
  }

  // Limit type-text input length to prevent hanging
  const MAX_TYPE_LENGTH = 5000;

  ipcMain.handle("tool:click", async (_e, x, y, button = "left", doubleClick = false) => {
    const coords = validateCoord(x, y);
    if (coords.error) return coords;
    ({ x, y } = coords);
    const tier = store.get("file-access-tier", "standard");
    try {
      if (process.platform === "darwin") {
        const clickCmd = doubleClick ? 'double click' : 'click';
        const script = `
          tell application "System Events"
            ${clickCmd} at {${x}, ${y}}
          end tell
        `;
        await runShell("darwin", `osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const clickPs = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
          Start-Sleep -Milliseconds 50
          Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name 'Win32' -Namespace 'API'
          ${button === 'right' ? '[API.Win32]::mouse_event(8, 0, 0, 0, 0); [API.Win32]::mouse_event(16, 0, 0, 0, 0)' : doubleClick ? '[API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0); Start-Sleep -Milliseconds 100; [API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0)' : '[API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0)'}
        `;
        await runShell("win32", clickPs);
      }
      auditLog("click", `${x},${y} ${button}${doubleClick ? ' double' : ''}`, "OK", tier);
      return { success: true, x, y, button, doubleClick };
    } catch (err) {
      auditLog("click", `${x},${y}`, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:type-text", async (_e, text, pressEnter = false) => {
    const tier = store.get("file-access-tier", "standard");
    if (typeof text !== 'string' || text.length === 0) return { error: 'Text must be a non-empty string' };
    if (text.length > MAX_TYPE_LENGTH) return { error: `Text too long: ${text.length} chars. Max ${MAX_TYPE_LENGTH}.` };
    try {
      if (process.platform === "darwin") {
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        let script = `tell application "System Events" to keystroke "${escaped}"`;
        if (pressEnter) script += `\ntell application "System Events" to key code 36`;
        await runShell("darwin", `osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const escaped = text.replace(/[+^%~(){}]/g, '{$&}').replace(/\n/g, '{ENTER}');
        const enterSuffix = pressEnter ? '{ENTER}' : '';
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("${escaped}${enterSuffix}")
        `;
        await runShell("win32", psScript);
      }
      auditLog("type-text", text.substring(0, 50), "OK", tier);
      return { success: true, text: text.substring(0, 50) + (text.length > 50 ? '...' : ''), pressEnter };
    } catch (err) {
      auditLog("type-text", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:press-key", async (_e, key, modifiers = []) => {
    const tier = store.get("file-access-tier", "standard");
    try {
      const keyMap = {
        enter: { mac: 36, win: '{ENTER}' },
        tab: { mac: 48, win: '{TAB}' },
        escape: { mac: 53, win: '{ESC}' },
        backspace: { mac: 51, win: '{BACKSPACE}' },
        delete: { mac: 51, win: '{DELETE}' },
        up: { mac: 126, win: '{UP}' },
        down: { mac: 125, win: '{DOWN}' },
        left: { mac: 123, win: '{LEFT}' },
        right: { mac: 124, win: '{RIGHT}' },
        home: { mac: 115, win: '{HOME}' },
        end: { mac: 119, win: '{END}' },
        pageup: { mac: 116, win: '{PGUP}' },
        pagedown: { mac: 121, win: '{PGDN}' },
        space: { mac: 49, win: ' ' },
        f1: { mac: 122, win: '{F1}' }, f2: { mac: 120, win: '{F2}' },
        f3: { mac: 99, win: '{F3}' }, f4: { mac: 118, win: '{F4}' },
        f5: { mac: 96, win: '{F5}' }, f6: { mac: 97, win: '{F6}' },
        f7: { mac: 98, win: '{F7}' }, f8: { mac: 100, win: '{F8}' },
        f9: { mac: 101, win: '{F9}' }, f10: { mac: 109, win: '{F10}' },
        f11: { mac: 103, win: '{F11}' }, f12: { mac: 111, win: '{F12}' },
      };

      if (process.platform === "darwin") {
        const modMap = { cmd: "command down", ctrl: "control down", alt: "option down", shift: "shift down" };
        const modStr = modifiers.map(m => modMap[m] || `${m} down`).join(', ');
        const keyCode = keyMap[key.toLowerCase()]?.mac || key.charCodeAt(0);
        let script;
        if (modifiers.length > 0) {
          script = `tell application "System Events" to key code ${keyCode} using {${modStr}}`;
        } else {
          script = `tell application "System Events" to keystroke "${key}"`;
        }
        await runShell("darwin", `osascript -e '${script}'`);
      } else if (process.platform === "win32") {
        const modPrefix = { cmd: '^', ctrl: '^', alt: '%', shift: '+' };
        let winKey = keyMap[key.toLowerCase()]?.win || key;
        let prefix = modifiers.map(m => modPrefix[m] || '').join('');
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("${prefix}${winKey}")
        `;
        await runShell("win32", psScript);
      }
      auditLog("press-key", `${key} ${modifiers.join('+')}`, "OK", tier);
      return { success: true, key, modifiers };
    } catch (err) {
      auditLog("press-key", key, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:scroll", async (_e, x, y, deltaX = 0, deltaY = 0) => {
    const coords = validateCoord(x, y);
    if (coords.error) return coords;
    ({ x, y } = coords);
    const tier = store.get("file-access-tier", "standard");
    try {
      if (process.platform === "darwin") {
        const scrollAmount = deltaY || deltaX || 0;
        if (scrollAmount === 0) return { success: true, x, y, deltaX, deltaY, scrolled: 0 };
        const lines = Math.round(deltaY / 40) || 1;
        const keyCode = deltaY >= 0 ? '125' : '126';
        const times = Math.min(Math.abs(lines), 20);
        const scriptParts = [];
        for (let i = 0; i < times; i++) {
          scriptParts.push(`key code ${keyCode}`);
        }
        const script = `tell application "System Events"\n${scriptParts.join('\n')}\nend tell`;
        await runShell("darwin", `osascript -e '${script}'`);
      } else if (process.platform === "win32") {
        const scrollAmount = -Math.round(deltaY / 120) * 120;
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
          Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern int SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);' -Name 'Win32' -Namespace 'API'
          $hwnd = [API.Win32]::SendMessage([System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle, 0x020A, [IntPtr]::new(${scrollAmount}), [IntPtr]::Zero)
        `;
        await runShell("win32", psScript);
      }
      auditLog("scroll", `${x},${y} delta=${deltaY}`, "OK", tier);
      return { success: true, x, y, deltaX, deltaY };
    } catch (err) {
      auditLog("scroll", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:move-mouse", async (_e, x, y) => {
    const coords = validateCoord(x, y);
    if (coords.error) return coords;
    ({ x, y } = coords);
    const tier = store.get("file-access-tier", "standard");
    try {
      if (process.platform === "darwin") {
        const jxa = `
          ObjC.import('Cocoa');
          var moveEvent = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, $.CGPointMake(${x}, ${y}), $.kCGMouseButtonLeft);
          $.CGEventPost($.kCGHIDEventTap, moveEvent);
        `;
        await runShell("darwin", `osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
        `;
        await runShell("win32", psScript);
      }
      auditLog("move-mouse", `${x},${y}`, "OK", tier);
      return { success: true, x, y };
    } catch (err) {
      auditLog("move-mouse", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:get-mouse-pos", async () => {
    try {
      if (process.platform === "darwin") {
        const jxa = `
          ObjC.import('Cocoa');
          var event = $.CGEventCreate(null);
          var loc = $.CGEventGetLocation(event);
          JSON.stringify({x: loc.x, y: loc.y});
        `;
        const { stdout } = await runShell("darwin", `osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}'`);
        return JSON.parse(stdout.trim());
      } else if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          $pos = [System.Windows.Forms.Cursor]::Position
          Write-Output "{\\"x\\": $($pos.X), \\"y\\": $($pos.Y)}"
        `;
        const { stdout } = await runShell("win32", psScript);
        return JSON.parse(stdout.trim());
      }
      return { error: "Mouse position not supported on this platform" };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:drag", async (_e, fromX, fromY, toX, toY, duration = 500) => {
    const from = validateCoord(fromX, fromY);
    if (from.error) return from;
    const to = validateCoord(toX, toY);
    if (to.error) return to;
    ({ x: fromX, y: fromY } = from);
    ({ x: toX, y: toY } = to);
    const tier = store.get("file-access-tier", "standard");
    try {
      if (process.platform === "darwin") {
        const jxa = `
          ObjC.import('Cocoa');
          var down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, $.CGPointMake(${fromX}, ${fromY}), $.kCGMouseButtonLeft);
          $.CGEventPost($.kCGHIDEventTap, down);
          var steps = 10;
          for (var i = 1; i <= steps; i++) {
            var frac = i / steps;
            var x = ${fromX} + (${toX} - ${fromX}) * frac;
            var y = ${fromY} + (${toY} - ${fromY}) * frac;
            var drag = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDragged, $.CGPointMake(x, y), $.kCGMouseButtonLeft);
            $.CGEventPost($.kCGHIDEventTap, drag);
          }
          var up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, $.CGPointMake(${toX}, ${toY}), $.kCGMouseButtonLeft);
          $.CGEventPost($.kCGHIDEventTap, up);
        `;
        await runShell("darwin", `osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name 'Win32' -Namespace 'API'
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${fromX}, ${fromY})
          Start-Sleep -Milliseconds 50
          [API.Win32]::mouse_event(2, 0, 0, 0, 0)
          Start-Sleep -Milliseconds 50
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${toX}, ${toY})
          Start-Sleep -Milliseconds 50
          [API.Win32]::mouse_event(4, 0, 0, 0, 0)
        `;
        await runShell("win32", psScript);
      }
      auditLog("drag", `${fromX},${fromY} -> ${toX},${toY}`, "OK", tier);
      return { success: true, fromX, fromY, toX, toY, duration };
    } catch (err) {
      auditLog("drag", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });
}

module.exports = { register };