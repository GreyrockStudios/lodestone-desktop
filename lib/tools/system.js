// ─── System Info Tools ─────────────────────────────────────────────────────
// OS info, processes, Wi-Fi, battery, volume, active window, open-external.

const { shell } = require("electron");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const HOME = os.homedir();

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
        const dfOutput = execSync(`df -h "${HOME}"`).toString();
        const lines = dfOutput.trim().split("\n");
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
      const output = process.platform === "win32"
        ? execSync("tasklist /FO CSV /NH").toString()
        : execSync("ps aux | head -50").toString();
      auditLog("list-processes", "", "OK", store.get("file-access-tier"));
      return { output };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:wifi-info", async () => {
    try {
      const wifiInfo = {};
      if (process.platform === "darwin") {
        try { wifiInfo.network = execSync("networksetup -getairportnetwork en0 2>/dev/null || echo 'Unknown'").toString().trim(); } catch { wifiInfo.network = "Unknown"; }
        try { wifiInfo.ip = execSync("ipconfig getifaddr en0 2>/dev/null || echo 'Unknown'").toString().trim(); } catch { wifiInfo.ip = "Unknown"; }
      } else if (process.platform === "win32") {
        try { wifiInfo.network = execSync("netsh wlan show interfaces").toString().split("\n").find(l => l.includes("SSID")).split(":")[1]?.trim() || "Unknown"; } catch { wifiInfo.network = "Unknown"; }
        try { wifiInfo.ip = execSync("ipconfig").toString().split("\n").find(l => l.includes("IPv4")).split(":")[1]?.trim() || "Unknown"; } catch { wifiInfo.ip = "Unknown"; }
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
        const pmset = execSync("pmset -g batt 2>/dev/null").toString().trim();
        const percent = pmset.match(/(\d+)%/)?.[1];
        const charging = pmset.includes("AC Power");
        const charged = pmset.includes("charged");
        return { percent: percent ? parseInt(percent) : null, charging, charged, raw: pmset };
      } else if (process.platform === "win32") {
        try {
          const psOutput = execSync('powershell -NoProfile -Command "Get-WmiObject -Class Win32_Battery | Select-Object -Property EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json"').toString().trim();
          const batt = JSON.parse(psOutput);
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
        const output = execSync("osascript -e 'output volume of (get volume settings)'").toString().trim();
        return { volume: parseInt(output) };
      } else if (process.platform === "win32") {
        try {
          const vol = execSync('powershell -NoProfile -Command "try { $wsh = New-Object -ComObject WScript.Shell; $vol = $wsh.RegRead(\'HKCU:\\Software\\Microsoft\\Multimedia\\Audio\\VolumeMaster\'); [math]::Round($vol / 50 * 100) } catch { -1 }"').toString().trim();
          return { volume: parseInt(vol) || 0 };
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
        execSync(`osascript -e 'set volume output volume ${safeLevel}'`);
      } else if (process.platform === "win32") {
        try {
          execSync(`nircmd.exe setsysvolume ${Math.round(safeLevel * 655.35)}`);
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
          const result = execSync(`osascript -e 'tell application "System Events" to get {name, name of first window} of first application process whose frontmost is true'`, { timeout: 5000 }).toString().trim();
          const parts = result.split(", ");
          windowInfo = { app: parts[0] || "unknown", window: parts[1] || "unknown" };
        } catch { windowInfo = { app: "unknown", window: "unknown" }; }
      } else if (process.platform === "win32") {
        try {
          const result = execSync('powershell -Command "(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1).ProcessName"', { timeout: 5000 }).toString().trim();
          windowInfo = { app: result };
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