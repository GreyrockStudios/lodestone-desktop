// ─── System Info Tools ─────────────────────────────────────────────────────
// OS info, processes, Wi-Fi, battery, volume, active window, open-external.
// Refactored: all shell calls use async execFile instead of blocking execSync.

const { shell } = require("electron");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const HOME = os.homedir();

// Timeout for shell commands (5 seconds default, prevents UI freezes)
const SHELL_TIMEOUT = 5000;

async function runShell(platform, cmd, args = [], timeout = SHELL_TIMEOUT) {
  if (platform === "win32") {
    return execFileAsync("powershell", ["-NoProfile", "-Command", cmd], { timeout });
  } else {
    return execFileAsync("/bin/sh", ["-c", cmd], { timeout });
  }
}

function register(mainWindow, store, auditLog) {
  const { ipcMain, app } = require("electron");

  ipcMain.handle("tool:system-info", async () => {
    try {
      const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
      const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024);
      const cpuCount = os.cpus().length;
      const cpuModel = os.cpus()[0]?.model || "Unknown";
      const uptime = Math.round(os.uptime() / 3600);

      let diskInfo = {};
      try {
        const { stdout } = await runShell(process.platform, `df -h "${HOME}"`);
        const lines = stdout.trim().split("\n");
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          diskInfo = { total: parts[1], used: parts[2], available: parts[3], usePercent: parts[4] };
        }
      } catch { /* ignore */ }

      return {
        os: process.platform,
        osVersion: os.version(),
        arch: process.arch,
        hostname: os.hostname(),
        cpu: { model: cpuModel, cores: cpuCount },
        memory: { totalGB: totalMem, freeGB: freeMem },
        disk: diskInfo,
        uptime: `${uptime}h`,
        homedir: HOME,
        appVersion: app.getVersion(),
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:list-processes", async () => {
    try {
      const cmd = process.platform === "win32" ? "tasklist /FO CSV /NH" : "ps aux | head -50";
      const { stdout } = await runShell(process.platform, cmd);
      auditLog("list-processes", "", "OK", store.get("file-access-tier"));
      return { output: stdout };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:wifi-info", async () => {
    try {
      const wifiInfo = {};
      if (process.platform === "darwin") {
        let wifiIface = null;
        for (const iface of ['en0', 'en1', 'en2']) {
          try {
            const { stdout } = await runShell("darwin", `networksetup -getairportnetwork ${iface} 2>/dev/null`);
            if (!stdout.includes('not a Wi-Fi') && !stdout.includes('Error')) {
              wifiIface = iface;
              wifiInfo.network = stdout.trim().replace('Current Wi-Fi Network: ', '');
              break;
            }
          } catch { /* not a wifi interface, try next */ }
        }
        if (!wifiIface) wifiInfo.network = 'No Wi-Fi adapter found';
        const ipIface = wifiIface || 'en0';
        try {
          const { stdout } = await runShell("darwin", `ipconfig getifaddr ${ipIface} 2>/dev/null`);
          wifiInfo.ip = stdout.trim() || 'Unknown';
        } catch { wifiInfo.ip = 'Unknown'; }
      } else if (process.platform === "win32") {
        try {
          const { stdout } = await runShell("win32", "netsh wlan show interfaces");
          wifiInfo.network = stdout.split("\n").find(l => l.includes("SSID"))?.split(":")[1]?.trim() || "Unknown";
        } catch { wifiInfo.network = "Unknown"; }
        try {
          const { stdout } = await runShell("win32", "ipconfig");
          wifiInfo.ip = stdout.split("\n").find(l => l.includes("IPv4"))?.split(":")[1]?.trim() || "Unknown";
        } catch { wifiInfo.ip = "Unknown"; }
      } else {
        return { error: "Wi-Fi info only available on macOS and Windows" };
      }
      return wifiInfo;
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:battery-info", async () => {
    try {
      if (process.platform === "darwin") {
        const { stdout } = await runShell("darwin", "pmset -g batt 2>/dev/null");
        const percent = stdout.match(/(\d+)%/)?.[1];
        const charging = stdout.includes("AC Power");
        const charged = stdout.includes("charged");
        return { percent: percent ? parseInt(percent) : null, charging, charged, raw: stdout.trim() };
      } else if (process.platform === "win32") {
        try {
          const { stdout } = await runShell("win32", 'Get-WmiObject -Class Win32_Battery | Select-Object -Property EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json');
          const batt = JSON.parse(stdout.trim());
          const percent = batt.EstimatedChargeRemaining;
          const charging = batt.BatteryStatus === 2 || batt.BatteryStatus === 3;
          const charged = batt.BatteryStatus === 3;
          return { percent, charging, charged };
        } catch {
          return { percent: null, charging: false, charged: false };
        }
      }
      return { error: "Battery info only available on macOS and Windows" };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:get-volume", async () => {
    try {
      if (process.platform === "darwin") {
        const { stdout } = await runShell("darwin", "osascript -e 'output volume of (get volume settings)'");
        return { volume: parseInt(stdout.trim()) };
      } else if (process.platform === "win32") {
        try {
          const { stdout } = await runShell("win32", 'try { $wsh = New-Object -ComObject WScript.Shell; $vol = $wsh.RegRead(\'HKCU:\\Software\\Microsoft\\Multimedia\\Audio\\VolumeMaster\'); [math]::Round($vol / 50 * 100) } catch { -1 }');
          return { volume: parseInt(stdout.trim()) || 0 };
        } catch {
          return { volume: -1, note: "Volume detection requires nircmd on Windows" };
        }
      }
      return { error: "Volume control only available on macOS and Windows" };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:set-volume", async (_e, level) => {
    try {
      const safeLevel = Math.max(0, Math.min(100, parseInt(level)));
      if (process.platform === "darwin") {
        await runShell("darwin", `osascript -e 'set volume output volume ${safeLevel}'`);
      } else if (process.platform === "win32") {
        try {
          await runShell("win32", `nircmd.exe setsysvolume ${Math.round(safeLevel * 655.35)}`);
        } catch {
          return { success: true, volume: safeLevel, note: "Precise volume control requires nircmd on Windows" };
        }
      }
      auditLog("set-volume", String(safeLevel), "OK", store.get("file-access-tier"));
      return { success: true, volume: safeLevel };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:active-window", async () => {
    try {
      let windowInfo = {};
      if (process.platform === "darwin") {
        try {
          const { stdout: appName } = await runShell("darwin", `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`, [], 5000);
          let windowTitle = "unknown";
          try {
            // Sanitize appName: remove single quotes and backslashes to prevent AppleScript injection
            const safeAppName = appName.trim().replace(/[\\']/g, "");
            const { stdout: title } = await runShell("darwin", `osascript -e 'tell application "${safeAppName}" to get name of front window'`, [], 5000);
            windowTitle = title.trim();
          } catch { /* some apps don't expose window titles */ }
          windowInfo = { app: appName.trim() || "unknown", window: windowTitle };
        } catch { windowInfo = { app: "unknown", window: "unknown" }; }
      } else if (process.platform === "win32") {
        try {
          const { stdout } = await runShell("win32", '(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1).ProcessName', [], 5000);
          windowInfo = { app: stdout.trim() };
        } catch { windowInfo = { app: "unknown" }; }
      }
      auditLog("active-window", "", JSON.stringify(windowInfo), store.get("file-access-tier"));
      return { success: true, ...windowInfo, platform: process.platform };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:open-external", async (_e, url) => {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      auditLog("open-external", url, "BLOCKED: non-http URL", store.get("file-access-tier"));
      return { error: "Only http/https URLs allowed" };
    }
    auditLog("open-external", url, "OK", store.get("file-access-tier"));
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:browser-open", async (_e, url) => {
    try {
      await shell.openExternal(url);
      auditLog("browser-open", url, "OK", store.get("file-access-tier"));
      return { success: true, message: `Opened ${url} in default browser` };
    } catch (err) {
      return { error: err.message };
    }
  });
}

module.exports = { register };