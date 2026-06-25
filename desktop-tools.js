// ─── Lodestone Desktop Tools ──────────────────────────────────────────────
// System-level tools available only in the desktop app.
// File access governed by tiered permission system.
// Every tool call is logged for audit.

const { ipcMain, shell, dialog, clipboard, screen, nativeImage, app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const db = require("./db");

const HOME = os.homedir();

// ─── File Access Tiers ────────────────────────────────────────────────────
// none    → no file access at all
// minimal → Desktop, Documents, Downloads only (read)
// standard → Home directory, /tmp (read/write), /Applications (read)
// full    → Everything except explicitly blocked paths (read/write)
//
// Default: standard (good balance for most users)
// Stored in electron-store under "file-access-tier"

const FILE_TIERS = {
  none: {
    label: "None",
    description: "No file system access. The AI cannot read, write, or search any files.",
    dirs: [],
    blocked: [],
    writable: [],
  },
  minimal: {
    label: "Minimal",
    description: "Read-only access to Desktop, Documents, and Downloads folders.",
    dirs: [
      path.join(HOME, "Desktop"),
      path.join(HOME, "Documents"),
      path.join(HOME, "Downloads"),
    ],
    blocked: [],
    writable: [], // All read-only in minimal
  },
  standard: {
    label: "Standard",
    description: "Read/write your home directory, temp, and applications. Can't access secrets or system files.",
    dirs: [HOME, "/tmp", "/Applications"],
    blocked: [
      path.join(HOME, ".ssh"),
      path.join(HOME, ".gnupg"),
      path.join(HOME, ".keychain"),
      path.join(HOME, ".lodestone"),
      path.join(HOME, ".secrets"),
      "/etc/shadow",
      "/etc/ssh",
      "/private/var/db/dslocal",
      "/System",
      "/Library/System",
    ],
    writable: [HOME, "/tmp"],
  },
  full: {
    label: "Full Access",
    description: "Full read/write access to everything except a small blocklist of critical system paths.",
    dirs: ["/"], // Everything
    blocked: [
      "/etc/shadow",
      "/etc/ssh",
      path.join(HOME, ".ssh"),
      path.join(HOME, ".gnupg"),
      path.join(HOME, ".keychain"),
      path.join(HOME, ".lodestone/local.db"),
    ],
    writable: ["/"], // Can write anywhere not blocked
  },
};

// Extra folders the user explicitly grants (persistent)
function getExtraDirs(store) {
  return store.get("file-access-extra-dirs", []);
}

function addExtraDir(store, dir) {
  const dirs = getExtraDirs(store);
  if (!dirs.includes(dir)) {
    dirs.push(dir);
    store.set("file-access-extra-dirs", dirs);
  }
  return dirs;
}

function removeExtraDir(store, dir) {
  const dirs = getExtraDirs(store).filter(d => d !== dir);
  store.set("file-access-extra-dirs", dirs);
  return dirs;
}

// Check if a path is accessible under the current tier
function isPathAllowed(filePath, tier, extraDirs = []) {
  if (tier === "none") return false;

  const config = FILE_TIERS[tier] || FILE_TIERS.standard;
  const resolved = path.resolve(filePath);

  // Check blocklist first
  for (const b of config.blocked) {
    if (resolved.startsWith(b)) return false;
  }

  // Check allowed dirs
  const allDirs = [...config.dirs, ...extraDirs];
  for (const dir of allDirs) {
    if (resolved.startsWith(dir)) return true;
  }

  return false;
}

// Check if a path is writable under the current tier
function isPathWritable(filePath, tier, extraDirs = []) {
  if (tier === "none" || tier === "minimal") return false;

  const config = FILE_TIERS[tier] || FILE_TIERS.standard;
  const resolved = path.resolve(filePath);

  // Check blocklist
  for (const b of config.blocked) {
    if (resolved.startsWith(b)) return false;
  }

  // Check writable dirs
  const allWritable = [...config.writable, ...extraDirs];
  for (const dir of allWritable) {
    if (resolved.startsWith(dir)) return true;
  }

  return false;
}

// ─── Audit Logging ────────────────────────────────────────────────────────
const AUDIT_LOG = path.join(HOME, ".lodestone", "tool-audit.log");

function auditLog(tool, args, result, tier) {
  const entry = {
    timestamp: new Date().toISOString(),
    tool,
    tier: tier || "unknown",
    args: typeof args === "string" ? args : JSON.stringify(args),
    result: typeof result === "string" ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200),
  };
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  } catch (e) { /* non-critical */ }
}

// ─── Register Tool IPC Handlers ────────────────────────────────────────────

function registerToolHandlers(mainWindow, store) {

  // ── File Access Tier Management ──────────────────────────────────────────

  ipcMain.handle("tool:get-file-tier", async () => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    return {
      tier,
      config: FILE_TIERS[tier],
      extraDirs,
      allTiers: Object.entries(FILE_TIERS).map(([key, val]) => ({
        id: key,
        label: val.label,
        description: val.description,
        dirs: val.dirs,
        writable: val.writable,
      })),
    };
  });

  ipcMain.handle("tool:set-file-tier", async (_e, tier) => {
    if (!FILE_TIERS[tier]) return { error: `Invalid tier: ${tier}. Use: none, minimal, standard, full` };
    store.set("file-access-tier", tier);
    auditLog("set-file-tier", tier, "OK", tier);
    return { success: true, tier, config: FILE_TIERS[tier] };
  });

  ipcMain.handle("tool:add-file-dir", async (_e, dir) => {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) return { error: `Directory does not exist: ${resolved}` };
    const dirs = addExtraDir(store, resolved);
    auditLog("add-file-dir", resolved, "OK", store.get("file-access-tier"));
    return { success: true, extraDirs: dirs };
  });

  ipcMain.handle("tool:remove-file-dir", async (_e, dir) => {
    const dirs = removeExtraDir(store, path.resolve(dir));
    auditLog("remove-file-dir", dir, "OK", store.get("file-access-tier"));
    return { success: true, extraDirs: dirs };
  });

  // ── File Operations (tier-gated) ──────────────────────────────────────────

  ipcMain.handle("tool:list-directory", async (_e, dirPath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(dirPath, tier, extraDirs)) {
      auditLog("list-directory", dirPath, "BLOCKED", tier);
      return { error: `Access denied: path not allowed under "${FILE_TIERS[tier]?.label}" tier. Go to Settings > Privacy to increase file access.` };
    }
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const result = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : e.isFile() ? "file" : "other",
        path: path.join(dirPath, e.name),
      }));
      auditLog("list-directory", dirPath, `OK: ${result.length} entries`, tier);
      return { entries: result };
    } catch (err) {
      auditLog("list-directory", dirPath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:read-file", async (_e, filePath, encoding = "utf-8") => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(filePath, tier, extraDirs)) {
      auditLog("read-file", filePath, "BLOCKED", tier);
      return { error: `Access denied: read not allowed under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > 1024 * 1024) {
        return { error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB. Max 1MB.` };
      }
      const content = await fs.promises.readFile(filePath, encoding);
      auditLog("read-file", filePath, `OK: ${content.length} bytes`, tier);
      return { content, size: stat.size, modified: stat.mtime.toISOString() };
    } catch (err) {
      auditLog("read-file", filePath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:write-file", async (_e, filePath, content, createDirs = false) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathWritable(filePath, tier, extraDirs)) {
      auditLog("write-file", filePath, "BLOCKED", tier);
      if (tier === "minimal" || tier === "none") {
        return { error: `Write access denied: "${FILE_TIERS[tier]?.label}" tier does not allow file writes. Go to Settings > Privacy to increase file access.` };
      }
      return { error: `Access denied: path not writable under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      if (createDirs) {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      }
      await fs.promises.writeFile(filePath, content, "utf-8");
      auditLog("write-file", filePath, `OK: ${content.length} bytes`, tier);
      return { success: true, path: filePath };
    } catch (err) {
      auditLog("write-file", filePath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:move-file", async (_e, srcPath, destPath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(srcPath, tier, extraDirs) || !isPathWritable(destPath, tier, extraDirs)) {
      auditLog("move-file", `${srcPath} → ${destPath}`, "BLOCKED", tier);
      return { error: "Access denied: path outside allowed directories" };
    }
    try {
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.rename(srcPath, destPath);
      auditLog("move-file", `${srcPath} → ${destPath}`, "OK", tier);
      return { success: true };
    } catch (err) {
      auditLog("move-file", `${srcPath} → ${destPath}`, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:delete-file", async (_e, filePath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathWritable(filePath, tier, extraDirs)) {
      auditLog("delete-file", filePath, "BLOCKED", tier);
      return { error: `Delete not allowed under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      await shell.trashItem(filePath);
      auditLog("delete-file", filePath, "OK: moved to trash", tier);
      return { success: true };
    } catch (err) {
      auditLog("delete-file", filePath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:search-files", async (_e, dirPath, pattern, maxResults = 50) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(dirPath, tier, extraDirs)) {
      return { error: `Access denied under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      const results = [];
      const regex = new RegExp(pattern, "i");

      async function walk(dir, depth = 0) {
        if (depth > 5 || results.length >= maxResults) return;
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          if (entry.name.startsWith(".")) continue;
          const fullPath = path.join(dir, entry.name);
          if (regex.test(entry.name)) {
            try {
              const stat = await fs.promises.stat(fullPath);
              results.push({ name: entry.name, path: fullPath, size: stat.size, isDirectory: entry.isDirectory() });
            } catch { /* skip inaccessible */ }
          }
          if (entry.isDirectory()) {
            await walk(fullPath, depth + 1);
          }
        }
      }

      await walk(dirPath);
      auditLog("search-files", `${dirPath}/${pattern}`, `OK: ${results.length} results`, tier);
      return { results };
    } catch (err) {
      auditLog("search-files", `${dirPath}/${pattern}`, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  // ── Pick Folder Dialog (for adding extra dirs) ─────────────────────────────

  ipcMain.handle("tool:pick-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Folder for AI Access",
      buttonLabel: "Grant Access",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const dir = result.filePaths[0];
    const dirs = addExtraDir(store, dir);
    auditLog("pick-folder", dir, "OK: added to extra dirs", store.get("file-access-tier"));
    return { path: dir, extraDirs: dirs };
  });

  // ── Clipboard ─────────────────────────────────────────────────────────────

  ipcMain.handle("tool:clipboard-read", async () => {
    const tier = store.get("file-access-tier", "standard");
    auditLog("clipboard-read", "", "OK", tier);
    try {
      const text = clipboard.readText();
      const image = clipboard.readImage();
      return { text: text || null, hasImage: !image.isEmpty() };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:clipboard-write", async (_e, text) => {
    const tier = store.get("file-access-tier", "standard");
    auditLog("clipboard-write", text?.substring(0, 100), "OK", tier);
    try {
      clipboard.writeText(text);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── System Information ────────────────────────────────────────────────────

  ipcMain.handle("tool:system-info", async () => {
    try {
      const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
      const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024);
      const cpuCount = os.cpus().length;
      const cpuModel = os.cpus()[0]?.model || "Unknown";
      const uptime = Math.round(os.uptime() / 3600);

      let diskInfo = {};
      try {
        const { execSync } = require("child_process");
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

  // ── App / Window Control ───────────────────────────────────────────────────

  ipcMain.handle("tool:window-action", async (_e, action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { error: "No window" };
    try {
      switch (action) {
        case "minimize": mainWindow.minimize(); break;
        case "maximize": mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); break;
        case "close": mainWindow.hide(); break;
        case "show": mainWindow.show(); mainWindow.focus(); break;
        case "toggle-fullscreen": mainWindow.setFullScreen(!mainWindow.isFullScreen()); break;
        default: return { error: `Unknown action: ${action}` };
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Open External ──────────────────────────────────────────────────────────

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

  // ── Open in Finder ────────────────────────────────────────────────────────

  ipcMain.handle("tool:open-in-finder", async (_e, filePath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(filePath, tier, extraDirs)) {
      return { error: "Access denied" };
    }
    try {
      await shell.showItemInFolder(filePath);
      auditLog("open-in-finder", filePath, "OK", tier);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Screenshots ────────────────────────────────────────────────────────────

  ipcMain.handle("tool:take-screenshot", async () => {
    const tier = store.get("file-access-tier", "standard");
    try {
      const tmpPath = path.join(os.tmpdir(), `lodestone-screenshot-${Date.now()}.png`);
      if (process.platform === "win32") {
        // Windows: use PowerShell + .NET Screen capture
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen
          $bmp = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
          $g = [System.Drawing.Graphics]::FromImage($bmp)
          $g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
          $g.Dispose()
          $bmp.Save('${tmpPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
          $bmp.Dispose()
        `;
        await new Promise((resolve, reject) => {
          execFile("powershell", ["-NoProfile", "-Command", psScript], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } else {
        // macOS: use screencapture
        await new Promise((resolve, reject) => {
          execFile("screencapture", ["-x", "-t", "png", tmpPath], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      }
      const imgData = await fs.promises.readFile(tmpPath);
      const base64 = imgData.toString("base64");
      await fs.promises.unlink(tmpPath).catch(() => {});
      auditLog("take-screenshot", "", `OK: ${Math.round(imgData.length / 1024)}KB`, tier);
      return {
        success: true,
        image: `data:image/png;base64,${base64}`,
        width: screen.getPrimaryDisplay().size.width * screen.getPrimaryDisplay().scaleFactor,
        height: screen.getPrimaryDisplay().size.height * screen.getPrimaryDisplay().scaleFactor,
      };
    } catch (err) {
      auditLog("take-screenshot", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  // ── Process List ───────────────────────────────────────────────────────────

  ipcMain.handle("tool:list-processes", async () => {
    try {
      const { execSync } = require("child_process");
      const output = process.platform === "win32"
        ? execSync("tasklist /FO CSV /NH").toString()
        : execSync("ps aux | head -50").toString();
      auditLog("list-processes", "", "OK", store.get("file-access-tier"));
      return { output };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Terminal Command (restricted) ──────────────────────────────────────────

  const ALLOWED_COMMANDS = [
    "ls", "pwd", "whoami", "date", "uptime", "df", "du", "cat", "head", "tail",
    "wc", "echo", "which", "env", "printenv", "hostname", "uname", "sw_vers",
    "system_profiler", "networksetup", "ifconfig", "ping", "curl", "wget",
    "git status", "git log", "git diff", "git branch",
    "node -v", "python3 --version", "npm -v", "brew list",
  ];

  ipcMain.handle("tool:run-command", async (_e, command, timeout = 10) => {
    const tier = store.get("file-access-tier", "standard");
    const fullCmd = command.trim();

    // Block dangerous patterns
    const blockedPatterns = [
      /\brm\s+-rf\s+\//, /\brm\s+-rf\s+~/, /\bdd\s/, /\bmkfs/,
      /\bformat\b/i, /\bshutdown\b/, /\breboot\b/, /\bhalt\b/,
      />\s*\/etc\//, /\bchmod\s+777/, /\bchown\b/,
      /\bcurl\s+.*\|\s*sh/, /\bwget\s+.*\|\s*sh/,
      /`.*`/, /\$\(.*\)/,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(fullCmd)) {
        auditLog("run-command", fullCmd, "BLOCKED: dangerous pattern", tier);
        return { error: "Command blocked: contains potentially destructive pattern" };
      }
    }

    // Parse the first word (command binary) and check against allowlist
    // This prevents "git status; rm -rf /" bypassing the git status check
    const firstWord = fullCmd.split(/\s+/)[0];
    const isAllowed = ALLOWED_COMMANDS.some(ac => {
      const acCmd = ac.split(/\s+/)[0]; // e.g. "git" from "git status"
      return firstWord === acCmd || fullCmd === ac;
    });
    if (!isAllowed) {
      auditLog("run-command", fullCmd, `BLOCKED: not in allowlist`, tier);
      return { error: `Command not allowed: ${fullCmd.split(" ")[0]}. Allowed: ${ALLOWED_COMMANDS.join(", ")}` };
    }

    // Block shell metacharacters to prevent injection
    // (already checked blockedPatterns above, but also strip from execution)
    const sanitizedCmd = fullCmd.replace(/[;&|`$()]/g, '');
    if (sanitizedCmd !== fullCmd) {
      auditLog("run-command", fullCmd, "BLOCKED: shell metacharacters", tier);
      return { error: "Command blocked: contains shell metacharacters (;, &, |, `, $, parentheses)" };
    }

    // Minimal tier: no commands
    if (tier === "minimal" || tier === "none") {
      return { error: `Command execution not available under "${FILE_TIERS[tier]?.label}" tier.` };
    }

    const timeoutMs = Math.min((timeout || 10) * 1000, 30000);

    try {
      const output = await new Promise((resolve, reject) => {
        execFile("sh", ["-c", fullCmd], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
      });
      auditLog("run-command", fullCmd, `OK: ${(output.stdout || "").substring(0, 100)}`, tier);
      return { output: output.stdout, error: output.stderr || null, exitCode: 0 };
    } catch (err) {
      auditLog("run-command", fullCmd, `ERROR: ${err.message}`, tier);
      return { error: err.message, exitCode: 1 };
    }
  });

  // ── Scheduled Notification ──────────────────────────────────────────────────

  ipcMain.handle("tool:schedule-notification", async (_e, { title, body, delayMs, clickAction }) => {
    try {
      setTimeout(() => {
        const notif = new Notification({
          title: title || "Lodestone",
          body: body || "",
          icon: path.join(__dirname, "assets", "icon.png"),
          silent: false,
        });
        notif.on("click", () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
            if (clickAction) {
              mainWindow.webContents.executeJavaScript(`window.location.hash='${clickAction.replace("#/", "")}'`).catch(() => {});
            }
          }
        });
        notif.show();
      }, delayMs || 0);
      return { success: true, scheduledAt: new Date(Date.now() + (delayMs || 0)).toISOString() };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Wi-Fi Info ─────────────────────────────────────────────────────────────

  ipcMain.handle("tool:wifi-info", async () => {
    try {
      const { execSync } = require("child_process");
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

  // ── Battery Info ───────────────────────────────────────────────────────────

  ipcMain.handle("tool:battery-info", async () => {
    try {
      const { execSync } = require("child_process");
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
          // BatteryStatus: 1=Discharging, 2=AC, 3=Charged, 4=Low, 5=Critical
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

  // ── Volume Control ─────────────────────────────────────────────────────────

  ipcMain.handle("tool:get-volume", async () => {
    try {
      const { execSync } = require("child_process");
      if (process.platform === "darwin") {
        const output = execSync("osascript -e 'output volume of (get volume settings)'").toString().trim();
        return { volume: parseInt(output) };
      } else if (process.platform === "win32") {
        try {
          // Try nircmd first, then PowerShell registry fallback
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
      const { execSync } = require("child_process");
      if (process.platform === "darwin") {
        execSync(`osascript -e 'set volume output volume ${safeLevel}'`);
      } else if (process.platform === "win32") {
        // Use nircmd if available, otherwise note limitation
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

  // ── Desktop Automation (click, type, press-key, scroll, move-mouse, drag) ───
  // Cross-platform: macOS (JXA/AppleScript) + Windows (PowerShell + .NET)

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
        // PowerShell + .NET SendKeys for clicking
        // Use System.Windows.Forms for mouse events
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
          Start-Sleep -Milliseconds 50
          ${button === 'right' ? '[System.Windows.Forms.SendKeys]::SendWait("{CLICKRIGHT}")' : doubleClick ? '[System.Windows.Forms.SendKeys]::SendWait("{CLICK2}")' : '$mouseEvent = [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms"); Add-Type -MemberDefinition "[DllImport(\"user32.dll\")]public static extern void mouse_event(int flags, int dx, int dy, int data, int info);" -Name U32 -Namespace Win; [Win.U32]::mouse_event(2,0,0,0,0); [Win.U32]::mouse_event(4,0,0,0,0)"'}
        `;
        // Simpler approach: move cursor then click via user32
        const clickPs = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
          Start-Sleep -Milliseconds 50
          Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name 'Win32' -Namespace 'API'
          ${button === 'right' ? '[API.Win32]::mouse_event(8, 0, 0, 0, 0); [API.Win32]::mouse_event(16, 0, 0, 0, 0)' : doubleClick ? '[API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0); Start-Sleep -Milliseconds 100; [API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0)' : '[API.Win32]::mouse_event(2, 0, 0, 0, 0); [API.Win32]::mouse_event(4, 0, 0, 0, 0)'}
        `;
        execSync(`powershell -NoProfile -Command "${clickPs.replace(/"/g, '\"').replace(/\$/g, '')}"`);
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
        // Escape special SendKeys characters: + ^ % ~ ( ) { }
        const escaped = text.replace(/[+^%~(){}]/g, '{$&}').replace(/\n/g, '{ENTER}');
        const enterSuffix = pressEnter ? '{ENTER}' : '';
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("${escaped}${enterSuffix}")
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\"').replace(/\$/g, '')}"`);
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
      // Key name mapping for cross-platform
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
        // macOS: use key code with modifiers
        const modMap = { cmd: "command", ctrl: "control", alt: "option", shift: "shift" };
        const modStr = modifiers.map(m => `key ${modMap[m] || m} down`).join(', ');
        const keyCode = keyMap[key.toLowerCase()]?.mac || key.charCodeAt(0);
        let script = `tell application "System Events" to keystroke "${key}"`;
        if (modifiers.length > 0) {
          script = `tell application "System Events" to key code ${keyCode}${modStr ? ' using {' + modStr + '}' : ''}`;
        }
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      } else if (process.platform === "win32") {
        // Windows: use SendKeys with modifier prefixes
        const modPrefix = { cmd: '^', ctrl: '^', alt: '%', shift: '+' };
        let winKey = keyMap[key.toLowerCase()]?.win || key;
        let prefix = modifiers.map(m => modPrefix[m] || '').join('');
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("${prefix}${winKey}")
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\"').replace(/\$/g, '')}"`);
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
        // macOS: move mouse to position, then scroll
        const scrollLines = Math.round(deltaY / 40); // ~40px per scroll line
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
        // Windows: move cursor to position, then scroll via user32
        const scrollAmount = -Math.round(deltaY / 120) * 120; // WHEEL_DELTA = 120
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y})
          Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern int SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);' -Name 'Win32' -Namespace 'API'
          $hwnd = [API.Win32]::SendMessage([System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle, 0x020A, [IntPtr]::new(${scrollAmount}), [IntPtr]::Zero)
        `;
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\"').replace(/\$/g, '')}"`);
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
        // macOS: JXA to move cursor
        const script = `tell application "System Events" to set {x, y} to {${x}, ${y}}`;
        // Use CGEvent for precise positioning
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
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\"').replace(/\$/g, '')}"`);
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
        // macOS: CGEvent to get cursor position
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
        const result = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\"').replace(/\$/g, '')}"`).toString().trim();
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
        // macOS: CGEvent-based drag
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
        // Windows: move to start, mouse down, move in steps, mouse up
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
        execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\"').replace(/\$/g, '')}"`);
      }
      auditLog("drag", `${fromX},${fromY} -> ${toX},${toY}`, "OK", tier);
      return { success: true, fromX, fromY, toX, toY, duration };
    } catch (err) {
      auditLog("drag", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  // ── Permission Management ─────────────────────────────────────────────────

  ipcMain.handle("tool:get-permissions", async () => {
    return store.get("tool-permissions", {});
  });

  ipcMain.handle("tool:set-permission", async (_e, tool, allowed) => {
    const perms = store.get("tool-permissions", {});
    perms[tool] = allowed;
    store.set("tool-permissions", perms);
    return { success: true };
  });

  // ── Audit Log Reader ──────────────────────────────────────────────────────

  ipcMain.handle("tool:get-audit-log", async (_e, limit = 100) => {
    try {
      const data = await fs.promises.readFile(AUDIT_LOG, "utf-8");
      const lines = data.trim().split("\n").slice(-(limit));
      return { entries: lines.map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } }) };
    } catch (err) {
      return { entries: [], error: err.message };
    }
  });

// ── Screen Understanding (screenshot + vision) ───────────────────────────
  ipcMain.handle("tool:screen-understand", async (_e, question) => {
    const tier = store.get("file-access-tier", "standard");
    try {
      // Take screenshot first
      const tmpPath = path.join(os.tmpdir(), `lodestone-screen-${Date.now()}.png`);
      if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen
          $bmp = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
          $g = [System.Drawing.Graphics]::FromImage($bmp)
          $g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
          $g.Dispose()
          $bmp.Save('${tmpPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
          $bmp.Dispose()
        `;
        await new Promise((resolve, reject) => {
          execFile("powershell", ["-NoProfile", "-Command", psScript], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } else {
        await new Promise((resolve, reject) => {
          execFile("screencapture", ["-x", "-t", "png", tmpPath], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      }
      const imgData = await fs.promises.readFile(tmpPath);
      const base64 = imgData.toString("base64");
      await fs.promises.unlink(tmpPath).catch(() => {});
      auditLog("screen-understand", question || "", `OK: ${Math.round(imgData.length / 1024)}KB`, tier);
      // Return screenshot + question for the LLM to interpret
      return {
        success: true,
        image: `data:image/png;base64,${base64}`,
        width: screen.getPrimaryDisplay().size.width * screen.getPrimaryDisplay().scaleFactor,
        height: screen.getPrimaryDisplay().size.height * screen.getPrimaryDisplay().scaleFactor,
        question: question || "Describe what you see on screen",
        hint: "Send this image to a vision model with the question for screen understanding"
      };
    } catch (err) {
      auditLog("screen-understand", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  // ── Active Window Info ────────────────────────────────────────────────────
  ipcMain.handle("tool:active-window", async () => {
    try {
      const { execSync } = require("child_process");
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

  // ── Browser Actions (open URL in default browser) ──────────────────────────
  ipcMain.handle("tool:browser-open", async (_e, url) => {
    try {
      await shell.openExternal(url);
      auditLog("browser-open", url, "OK", store.get("file-access-tier"));
      return { success: true, message: `Opened ${url} in default browser` };
    } catch (err) {
      return { error: err.message };
    }
  });


  // ── Allowed Dirs ───────────────────────────────────────────────────────────

  ipcMain.handle("tool:get-allowed-dirs", async () => {
    const tier = store.get("file-access-tier", "standard");
    const config = FILE_TIERS[tier];
    const extraDirs = getExtraDirs(store);
    return { tier, dirs: config.dirs, writable: config.writable, blocked: config.blocked, extraDirs };
  });
}

// ── Tool Definitions for MCP Bridge ────────────────────────────────────────────
function getTools() {
  return [
    { name: "read-file", description: "Read file contents", inputSchema: { type: "object", properties: { path: { type: "string" }, encoding: { type: "string", default: "utf-8" } }, required: ["path"] } },
    { name: "write-file", description: "Write content to a file", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, createDirs: { type: "boolean" } }, required: ["path", "content"] } },
    { name: "list-directory", description: "List directory contents", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "delete-file", description: "Delete a file or directory", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "move-file", description: "Move or rename a file", inputSchema: { type: "object", properties: { src: { type: "string" }, dest: { type: "string" } }, required: ["src", "dest"] } },
    { name: "search-files", description: "Search for files by pattern", inputSchema: { type: "object", properties: { dir: { type: "string" }, pattern: { type: "string" }, maxResults: { type: "number" } }, required: ["dir", "pattern"] } },
    { name: "system-info", description: "Get system information", inputSchema: { type: "object", properties: {} } },
    { name: "clipboard-read", description: "Read clipboard contents", inputSchema: { type: "object", properties: {} } },
    { name: "clipboard-write", description: "Write text to clipboard", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
    { name: "take-screenshot", description: "Take a screenshot", inputSchema: { type: "object", properties: {} } },
    { name: "open-external", description: "Open URL in default browser", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
    { name: "open-in-finder", description: "Reveal file in Finder", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "window-action", description: "Control window (minimize, maximize, close, etc)", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["minimize", "maximize", "close", "fullscreen", "reload"] } }, required: ["action"] } },
    { name: "run-command", description: "Run a shell command", inputSchema: { type: "object", properties: { command: { type: "string" }, timeout: { type: "number" } }, required: ["command"] } },
    { name: "battery-info", description: "Get battery status", inputSchema: { type: "object", properties: {} } },
    { name: "wifi-info", description: "Get WiFi information", inputSchema: { type: "object", properties: {} } },
    { name: "get-volume", description: "Get system volume level", inputSchema: { type: "object", properties: {} } },
    { name: "set-volume", description: "Set system volume level", inputSchema: { type: "object", properties: { level: { type: "number" } }, required: ["level"] } },
    { name: "schedule-notification", description: "Schedule a desktop notification", inputSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, delayMs: { type: "number" } }, required: ["title", "body"] } },
    { name: "pick-folder", description: "Open native folder picker", inputSchema: { type: "object", properties: {} } },
    { name: "get-file-tier", description: "Get current file access tier", inputSchema: { type: "object", properties: {} } },
    { name: "set-file-tier", description: "Set file access tier", inputSchema: { type: "object", properties: { tier: { type: "string", enum: ["none", "minimal", "standard", "full"] } }, required: ["tier"] } },
    { name: "add-file-dir", description: "Add directory to allowed list", inputSchema: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] } },
    { name: "remove-file-dir", description: "Remove directory from allowed list", inputSchema: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] } },
    { name: "get-allowed-dirs", description: "Get list of allowed directories", inputSchema: { type: "object", properties: {} } },
    { name: "list-processes", description: "List running processes", inputSchema: { type: "object", properties: {} } },
    { name: "screen-understand", description: "Take a screenshot and prepare it for vision analysis. Returns the screenshot as base64 along with a question for the AI to interpret.", inputSchema: { type: "object", properties: { question: { type: "string", description: "What to ask about the screen (default: describe what you see)" } }, required: [] } },
    { name: "click", description: "Click at screen coordinates", inputSchema: { type: "object", properties: { x: { type: "number", description: "X coordinate" }, y: { type: "number", description: "Y coordinate" }, button: { type: "string", enum: ["left", "right"], description: "Mouse button" }, doubleClick: { type: "boolean", description: "Double-click" } }, required: ["x", "y"] } },
    { name: "type-text", description: "Type text at the current cursor position", inputSchema: { type: "object", properties: { text: { type: "string", description: "Text to type" }, pressEnter: { type: "boolean", description: "Press Enter after typing" } }, required: ["text"] } },
    { name: "press-key", description: "Press a key or key combination", inputSchema: { type: "object", properties: { key: { type: "string", description: "Key to press (e.g. enter, tab, a, f5)" }, modifiers: { type: "array", items: { type: "string", enum: ["cmd", "ctrl", "alt", "shift"] }, description: "Key modifiers" } }, required: ["key"] } },
    { name: "scroll", description: "Scroll at screen position", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, deltaY: { type: "number", description: "Scroll amount (negative = up)" } } } },
    { name: "move-mouse", description: "Move mouse to screen coordinates", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] } },
    { name: "get-mouse-pos", description: "Get current mouse position", inputSchema: { type: "object", properties: {} } },
    { name: "drag", description: "Drag from one point to another", inputSchema: { type: "object", properties: { fromX: { type: "number" }, fromY: { type: "number" }, toX: { type: "number" }, toY: { type: "number" }, duration: { type: "number", description: "Duration in ms" } }, required: ["fromX", "fromY", "toX", "toY"] } },
    { name: "active-window", description: "Get information about the currently active window (app name, window title). Useful for context-aware assistance.", inputSchema: { type: "object", properties: {} } },
    { name: "browser-open", description: "Open a URL in the user's default browser.", inputSchema: { type: "object", properties: { url: { type: "string", description: "URL to open" } }, required: ["url"] } },
    { name: "get-permissions", description: "Get tool permission settings", inputSchema: { type: "object", properties: {} } },
    { name: "set-permission", description: "Set tool permission", inputSchema: { type: "object", properties: { tool: { type: "string" }, allowed: { type: "boolean" } }, required: ["tool", "allowed"] } },
  ];
}

module.exports = { registerToolHandlers, isPathAllowed, isPathWritable, FILE_TIERS, getTools };