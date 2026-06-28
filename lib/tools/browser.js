// ─── Browser Automation Tools ─────────────────────────────────────────────
// Desktop automation: click, type, press-key, scroll, move-mouse, drag, get-mouse-pos.
// Cross-platform: macOS (JXA/AppleScript) + Windows (PowerShell + .NET)

const { execSync } = require("child_process");

function register(mainWindow, store, auditLog) {
  const { ipcMain } = require("electron");

  ipcMain.handle("tool:click", async (_e, x, y, button = "left", doubleClick = false) => {
    const tier = store.get("file-access-tier", "standard");
    try {
      if (process.platform === "darwin") {
        const clickCmd = doubleClick ? 'double click' : 'click';
        const btn = button === 'right' ? '{button 2}' : '{button 1}';
        const script = `
          tell application "System Events"
            click at {${x}, ${y}}
          end tell
        `;
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const clickPs = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
          Start-Sleep -Milliseconds 50
          Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name 'Win32' -Namespace 'API'
          ${button === 'right' ? '[API.Win32]::mouse_event(8, 0, 0, 0, 0); [API.Win32]::mouse_event(16, 0, 0, 0, 0)' : doubleClick ? '[API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0); Start-Sleep -Milliseconds 100; [API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0)' : '[API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0)'}
        `;
        execSync(`powershell -NoProfile -Command "${clickPs.replace(/"/g, '\\"').replace(/\$/g, '')}"`);
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
    try {
      if (process.platform === "darwin") {
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        let script = `tell application "System Events" to keystroke "${escaped}"`;
        if (pressEnter) script += `\ntell application "System Events" to key code 36`;
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const escaped = text.replace(/[+^%~(){}]/g, '{$&}').replace(/\n/g, '{ENTER}');
        const enterSuffix = pressEnter ? '{ENTER}' : '';
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("${escaped}${enterSuffix}")
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\$/g, '')}"`);
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
        const modMap = { cmd: "command", ctrl: "control", alt: "option", shift: "shift" };
        const modStr = modifiers.map(m => `key ${modMap[m] || m} down`).join(', ');
        const keyCode = keyMap[key.toLowerCase()]?.mac || key.charCodeAt(0);
        let script = `tell application "System Events" to keystroke "${key}"`;
        if (modifiers.length > 0) {
          script = `tell application "System Events" to key code ${keyCode}${modStr ? ' using {' + modStr + '}' : ''}`;
        }
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const modPrefix = { cmd: '^', ctrl: '^', alt: '%', shift: '+' };
        let winKey = keyMap[key.toLowerCase()]?.win || key;
        let prefix = modifiers.map(m => modPrefix[m] || '').join('');
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("${prefix}${winKey}")
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\$/g, '')}"`);
      }
      auditLog("press-key", `${key} ${modifiers.join('+')}`, "OK", tier);
      return { success: true, key, modifiers };
    } catch (err) {
      auditLog("press-key", key, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:scroll", async (_e, x, y, deltaX = 0, deltaY = 0) => {
    const tier = store.get("file-access-tier", "standard");
    try {
      if (process.platform === "darwin") {
        const scrollLines = Math.round(deltaY / 40);
        const dir = scrollLines > 0 ? 'down' : 'up';
        const times = Math.abs(scrollLines) || 1;
        let script = `
          tell application "System Events"
            set {x, y} to {${x}, ${y}}
          end tell
        `;
        for (let i = 0; i < times; i++) {
          script += `\ntell application "System Events" to scroll ${dir} 1`;
        }
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const scrollAmount = -Math.round(deltaY / 120) * 120;
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
          Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern int SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);' -Name 'Win32' -Namespace 'API'
          $hwnd = [API.Win32]::SendMessage([System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle, 0x020A, [IntPtr]::new(${scrollAmount}), [IntPtr]::Zero)
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\$/g, '')}"`);
      }
      auditLog("scroll", `${x},${y} delta=${deltaY}`, "OK", tier);
      return { success: true, x, y, deltaX, deltaY };
    } catch (err) {
      auditLog("scroll", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:move-mouse", async (_e, x, y) => {
    const tier = store.get("file-access-tier", "standard");
    try {
      if (process.platform === "darwin") {
        const jxa = `
          ObjC.import('Cocoa');
          var moveEvent = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, $.CGPointMake(${x}, ${y}), $.kCGMouseButtonLeft);
          $.CGEventPost($.kCGHIDEventTap, moveEvent);
        `;
        execSync(`osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\$/g, '')}"`);
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
        const result = execSync(`osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}'`).toString().trim();
        return JSON.parse(result);
      } else if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          $pos = [System.Windows.Forms.Cursor]::Position
          Write-Output \"{\\\"x\\\": $($pos.X), \\\"y\\\": $($pos.Y)}\"
        `;
        const result = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\$/g, '')}"`).toString().trim();
        return JSON.parse(result);
      }
      return { error: "Mouse position not supported on this platform" };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:drag", async (_e, fromX, fromY, toX, toY, duration = 500) => {
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
        execSync(`osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name 'Win32' -Namespace 'API'
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${fromX}, ${fromY})
          Start-Sleep -Milliseconds 50
          [API.Win32]::mouse_event(2, 0, 0, 0, 0)
          Start-Sleep -Milliseconds 50
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${toX}, ${toY})
          Start-Sleep -Milliseconds 50
          [API.Win32]::mouse_event(4, 0, 0, 0, 0)
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\$/g, '')}"`);
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