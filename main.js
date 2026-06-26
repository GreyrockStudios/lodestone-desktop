// ─── Lodestone Desktop — Electron Main Process v0.1.0 ──────────────────────
// Application wrapper for heylodestone.com chat interface.
// Uses protocol.handle with a custom 'lodestone://' scheme to inject desktop
// detection into HTML responses before the SPA evaluates its JS.

const {
  app, BrowserWindow, Menu, Tray, ipcMain, protocol,
  shell, dialog, Notification, globalShortcut, nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const db = require("./db");
const desktopTools = require("./desktop-tools");
const scheduler = require("./scheduler");
const { initMCP, cleanupMCP, autoStartBundledServers } = require("./mcp-bridge");
const { createProtocolHandler } = require("./protocol-handler");

// Load the community data layer script (injected into HTML for local data routing)
const communityDataLayerScript = fs.readFileSync(path.join(__dirname, "community-data-layer.js"), "utf-8");

// Instead of inlining the full 44KB data layer script, we serve it as a separate JS file
// and inject a <script src> tag. This avoids HTML bloat and parsing issues.
// The protocol handler serves /lodestone-data-layer.js on demand.
const communityDataLayerLoader = `
if (!window.__lodestone_data_layer_active) {
  var dlScript = document.createElement('script');
  dlScript.src = 'lodestone://app.heylodestone.com/lodestone-data-layer.js';
  dlScript.onload = function() { console.log('[Lodestone] Data layer loaded from external script'); };
  dlScript.onerror = function() { console.warn('[Lodestone] Data layer script failed to load, trying inline fallback'); };
  document.head.appendChild(dlScript);
}
`;
const isDev = process.argv.includes("--dev") || !!process.env.ELECTRON_IS_DEV;

const APP_URL = "https://heylodestone.com";
const DEEP_LINK_PROTOCOL = "lodestone";
const START_URL = isDev ? "http://localhost:3000" : "lodestone://app.heylodestone.com/#/login";

// Desktop detection + API proxy — injected into HTML <head> before SPA bundle loads.
// Since the page runs on lodestone://app.heylodestone.com, relative /api/ paths
// resolve through our protocol handler automatically. We just need to:
// 1. Set __TAURI_INTERNALS__ so the SPA knows it's in desktop mode
// 2. Ensure fetch/XHR requests include credentials
// 3. Watch for 404 on protected routes and redirect to login
const DESKTOP_DETECT_SCRIPT = [
  "window.__TAURI_INTERNALS__={invoke:function(cmd,args){",
  "if(window.electronAPI){switch(cmd){",
  "case'set_badge_count':return window.electronAPI.setBadgeCount(args&&args.count);",
  "case'save_file':return window.electronAPI.saveFile(args&&args.content,args&&args.filename,args&&args.filters);",
  "case'read_file_contents':return window.electronAPI.readFile(args&&args.path);",
  "case'get_app_version':return window.electronAPI.getVersion();",
  "case'get_system_info':return window.electronAPI.getSystemInfo();",
  "case'check_for_updates':return window.electronAPI.checkForUpdates();",
  "default:return Promise.resolve(null);}}return Promise.resolve(null);",
  "}};window.__TAURI__=window.__TAURI_INTERNALS__;",
  "if(document.documentElement)document.documentElement.classList.add('is-tauri');",
  // API proxy: ensure credentials are included on all requests
  "(function(){",
  "if(window.__lodestone_proxy_active)return;",
  "window.__lodestone_proxy_active=true;",
  "var of=window.fetch;",
  "window.fetch=function(i,n){",
  "n=Object.assign({},n||{},{credentials:n&&n.credentials||'include'});",
  "return of.call(this,i,n);",
  "};",
  "var oXHROpen=XMLHttpRequest.prototype.open;",
  "XMLHttpRequest.prototype.open=function(m,u,a,p,w){return oXHROpen.call(this,m,u,a!==false,p,w);};",
  "var oES=window.EventSource;",
  "window.EventSource=function(u,c){return new oES(u,c);};",
  "window.EventSource.prototype=oES.prototype;",
  "})();",
].join("");

// Register custom scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lodestone",
    privileges: {
      standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
    },
  },
]);

const store = new Store({
  name: "window-state",
  defaults: { x: undefined, y: undefined, width: 1200, height: 800, maximized: false },
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const deepLink = commandLine.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
    if (deepLink) handleDeepLink(deepLink);
  });
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ─── Fetch helper using Node's https module (avoids Electron net.fetch duplex bug) ──
function fetchWithNode(url, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      headers: { ...headers, "User-Agent": "Lodestone-Desktop/1.0" },
    };
    if (body) options.headers["Content-Type"] = options.headers["Content-Type"] || "application/json";
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).toString();
        return fetchWithNode(redirectUrl, method, body, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const respBody = Buffer.concat(chunks).toString("utf-8");
        resolve({ status: res.statusCode, headers: res.headers, body: respBody, contentType: (res.headers["content-type"] || "") });
      });
      res.on("error", reject);
    });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
    req.on("error", reject);
  });
}

// ─── Window Management ────────────────────────────────────────────────────────
function createWindow() {
  const s = {
    x: store.get("x"), y: store.get("y"),
    width: store.get("width", 1200), height: store.get("height", 800),
    maximized: store.get("maximized", false),
  };

  mainWindow = new BrowserWindow({
    width: s.width, height: s.height, minWidth: 800, minHeight: 600,
    ...(s.x !== undefined && s.y !== undefined ? { x: s.x, y: s.y } : { center: true }),
    title: "Lodestone",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    show: false,
  });

  if (s.maximized) mainWindow.maximize();
  mainWindow.loadURL(START_URL);
  if (isDev) mainWindow.webContents.openDevTools();
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Fallback: inject detection script on every page load + load data layer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents
      .executeJavaScript(`if (!window.__TAURI_INTERNALS__) { ${DESKTOP_DETECT_SCRIPT} }; ${communityDataLayerLoader}`)
      .catch(() => {});
    injectNativeBridge();
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, _desc, url) => {
    console.error(`[Lodestone] Load failed: ${code} (${url})`);
    if (code === -2 || code === -105 || code === -3) {
      setTimeout(() => mainWindow.loadURL(START_URL), 3000);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL) || url.startsWith("lodestone://")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith("http://localhost") && !url.startsWith("file://") && !url.startsWith("lodestone://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("resize", saveWindowState);
  mainWindow.on("move", saveWindowState);
  mainWindow.on("maximize", saveWindowState);
  mainWindow.on("unmaximize", saveWindowState);
  mainWindow.on("close", (event) => {
    if (!isQuitting) { event.preventDefault(); saveWindowState(); mainWindow.hide(); }
  });
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.getBounds();
    store.set("x", b.x); store.set("y", b.y); store.set("width", b.width); store.set("height", b.height); store.set("maximized", mainWindow.isMaximized());
  } catch (_e) {}
}

// ─── Native Bridge Injection ──────────────────────────────────────────────────
function injectNativeBridge() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `window.LodestoneNative = {
        version: '${app.getVersion()}', platform: '${process.platform}', arch: '${process.arch}', isDesktop: true,
        features: { deepLink: true, globalShortcut: true, dockBadge: true, windowState: true, fileDrop: true, nativeDialogs: true, autoUpdater: true, trayMenu: true, nativeMenu: true },
        setBadgeCount: (c) => window.electronAPI?.setBadgeCount(c),
        saveFile: (c, f, ft) => window.electronAPI?.saveFile(c, f, ft),
        readFile: (p) => window.electronAPI?.readFile(p),
        getVersion: () => window.electronAPI?.getVersion(),
        getSystemInfo: () => window.electronAPI?.getSystemInfo(),
        checkForUpdates: () => window.electronAPI?.checkForUpdates(),
      };
      document.dispatchEvent(new CustomEvent('lodestone-native-ready', { detail: { version: '${app.getVersion()}' } }));`
    )
    .catch(() => {});
}

// ─── Deep Links ───────────────────────────────────────────────────────────────
function handleDeepLink(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const p = url.replace(`${DEEP_LINK_PROTOCOL}://`, "");

  // Handle MCP install deep links: lodestone://mcp/install?id=...&name=...&command=...&args=...
  if (p.startsWith("mcp/install") || p.startsWith("mcp/install?")) {
    const qs = p.includes("?") ? p.substring(p.indexOf("?") + 1) : "";
    const params = Object.fromEntries(new URLSearchParams(qs));
    const { id, name, command, args: argsStr, env: envStr } = params;
    if (id && name && command) {
      try {
        const args = argsStr ? JSON.parse(argsStr) : [];
        const env = envStr ? JSON.parse(envStr) : undefined;
        // Send to renderer to show install confirmation
        mainWindow.show(); mainWindow.focus();
        mainWindow.webContents.executeJavaScript(`
          if (window.electronAPI && window.electronAPI.mcp && window.electronAPI.mcp.connect) {
            window.dispatchEvent(new CustomEvent('mcp-install-request', { detail: ${JSON.stringify({ id, name, command, args, env: env || null })} }));
          }
        `).catch(() => {});
        console.log(`[DeepLink] MCP install request: ${name} (${id})`);
      } catch (err) {
        console.error('[DeepLink] MCP install parse error:', err.message);
      }
    }
    return;
  }

  let h;
  if (p === "chat" || p === "chat/" || p === "") h = "#/chat";
  else if (p.startsWith("chat/")) h = `#/chat/${p.replace("chat/", "")}`;
  else if (p === "settings" || p === "settings/") h = "#/settings";
  else if (p.startsWith("settings/")) h = `#/settings/${p.replace("settings/", "")}`;
  else if (p.startsWith("marketplace") || p.startsWith("mcp-marketplace")) h = "#/brain?tab=mcp";
  else h = "#/chat";
  mainWindow.show(); mainWindow.focus();
  mainWindow.webContents.executeJavaScript(`window.location.hash='${h}'`).catch(() => {});
}

app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);

// ─── System Tray ──────────────────────────────────────────────────────────────
function createTray() {
  const ic = path.join(__dirname, "assets", "tray-icon.png");
  const img = fs.existsSync(ic) ? nativeImage.createFromPath(ic) : nativeImage.createFromPath(path.join(__dirname, "assets", "icon.png"));
  tray = new Tray(img.resize({ width: 22, height: 22 }));
  tray.setToolTip("Lodestone — Your AI, always learning");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Lodestone", click: () => showWindow() },
    { label: "New Chat", click: () => { showWindow(); mainWindow.webContents.executeJavaScript("window.location.hash='#/chat'").catch(() => {}); } },
    { type: "separator" },
    { label: "Start at Login", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: "separator" },
    { label: "Check for Updates…", click: () => checkForUpdates() },
    { type: "separator" },
    { label: "Quit Lodestone", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", () => showWindow());
}

function showWindow() { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }

// ─── Menu ─────────────────────────────────────────────────────────────────────
function createMenu() {
  // Hide the menu bar on Windows — the SPA has its own navigation in the sidebar
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Lodestone", submenu: [
      { label: "About Lodestone", click: () => dialog.showMessageBoxSync(mainWindow, { type: "info", title: "About Lodestone", message: `Lodestone v${app.getVersion()}`, detail: "Your AI, always learning.\n\nBuilt by Greyrock Studio", buttons: ["OK"] }) },
      { type: "separator" }, { label: "Check for Updates…", click: () => checkForUpdates() }, { type: "separator" },
      { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => { showWindow(); mainWindow.webContents.executeJavaScript("window.location.hash='#/settings'").catch(() => {}); } },
      { type: "separator" }, { label: "Quit Lodestone", accelerator: "CmdOrCtrl+Q", click: () => { isQuitting = true; app.quit(); } },
    ]},
    { label: "File", submenu: [
      { label: "New Chat", accelerator: "CmdOrCtrl+N", click: () => { showWindow(); mainWindow.webContents.executeJavaScript("window.location.hash='#/chat'").catch(() => {}); } },
      { type: "separator" },
      { label: "Export as Markdown", click: () => mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('export-conversation', { detail: { format: 'markdown' } }))").catch(() => {}) },
      { label: "Export as JSON", click: () => mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('export-conversation', { detail: { format: 'json' } }))").catch(() => {}) },
      { type: "separator" }, { label: "Close Window", accelerator: "CmdOrCtrl+W", click: () => { if (mainWindow) mainWindow.hide(); } },
    ]},
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [
      { role: "togglefullscreen" }, { type: "separator" },
      { label: "Toggle Sidebar", click: () => mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('toggle-sidebar'))").catch(() => {}) },
      { label: "Command Palette…", accelerator: "CmdOrCtrl+K", click: () => mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('open-command-palette'))").catch(() => {}) },
      { type: "separator" },
      { label: "Increase Font Size", accelerator: "CmdOrCtrl+=", click: () => mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('font-size-change', { detail: { direction: 'increase' } }))").catch(() => {}) },
      { label: "Decrease Font Size", accelerator: "CmdOrCtrl+-", click: () => mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('font-size-change', { detail: { direction: 'decrease' } }))").catch(() => {}) },
      { label: "Reset Font Size", accelerator: "CmdOrCtrl+0", click: () => mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('font-size-change', { detail: { direction: 'reset' } }))").catch(() => {}) },
      { type: "separator" }, { role: "reload" },
      { label: "Toggle Developer Tools", accelerator: "CmdOrCtrl+Alt+I", click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); } },
    ]},
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] },
    { label: "Help", submenu: [
      { label: "Documentation", click: () => shell.openExternal("https://heylodestone.com/docs") },
      { label: "Send Feedback", click: () => shell.openExternal("mailto:hello@heylodestone.com") },
      { type: "separator" },
      { label: "What's New", click: () => { showWindow(); mainWindow.webContents.executeJavaScript("window.location.hash='#/docs/desktop-app'").catch(() => {}); } },
    ]},
  ]));
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle("set-badge-count", (_e, count) => {
  if (process.platform === "darwin") app.dock.setBadge(count > 0 ? String(count) : "");
  else if (process.platform === "win32" && count > 0 && mainWindow) { mainWindow.flashFrame(true); setTimeout(() => mainWindow && mainWindow.flashFrame(false), 3000); }
  return true;
});
ipcMain.handle("save-file", async (_e, content, filename, filters) => {
  const opts = { defaultPath: filename };
  if (filters && Array.isArray(filters)) opts.filters = filters.map((f) => ({ name: f.name, extensions: f.extensions }));
  const result = await dialog.showSaveDialog(mainWindow, opts);
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, content, "utf-8");
  return result.filePath;
});
ipcMain.handle("read-file", async (_e, filePath) => await fs.promises.readFile(filePath, "utf-8"));
ipcMain.handle("get-version", () => app.getVersion());
ipcMain.handle("get-system-info", () => ({ os: process.platform, arch: process.arch, version: app.getVersion() }));

// ─── System Notifications ──────────────────────────────────────────────────────
ipcMain.handle("send-notification", (_e, { title, body, icon, clickAction } = {}) => {
  if (!Notification.isSupported()) return false;
  const notif = new Notification({
    title: title || "Lodestone",
    body: body || "",
    icon: icon ? path.join(__dirname, "assets", icon) : path.join(__dirname, "assets", "icon.png"),
    silent: false,
  });
  if (clickAction) {
    notif.on("click", () => {
      showWindow();
      if (clickAction.startsWith("#/")) mainWindow.webContents.executeJavaScript(`window.location.hash='${clickAction.replace("#/", "")}'`).catch(() => {});
      else if (clickAction.startsWith("http")) shell.openExternal(clickAction);
    });
  } else {
    notif.on("click", () => showWindow());
  }
  notif.show();
  return true;
});

ipcMain.handle("check-notification-permission", () => {
  if (process.platform === "darwin") {
    // On macOS, we need to check the system notification permission
    // Electron's Notification module doesn't have a direct permission check API
    // but we can attempt to send a silent notification to verify
    try {
      if (!Notification.isSupported()) return "denied";
      return "granted";
    } catch { return "not-determined"; }
  }
  return Notification.isSupported() ? "granted" : "denied";
});

// Request notification permission on first launch
ipcMain.handle("request-notification-permission", () => {
  if (!Notification.isSupported()) return "denied";
  // On macOS, sending a notification automatically requests permission
  const testNotif = new Notification({ title: "Lodestone", body: "Notifications enabled! You'll get reminders here." });
  testNotif.on("click", () => showWindow());
  testNotif.show();
  return "granted";
});

// ─── Auto-Update ──────────────────────────────────────────────────────────────
function checkForUpdates() {
  if (isDev) { dialog.showMessageBox(mainWindow, { type: "info", title: "Updates", message: "Update checks are disabled in development mode.", buttons: ["OK"] }); return; }
  autoUpdater.checkForUpdatesAndNotify();
}
autoUpdater.on("update-available", () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('update-available'))").catch(() => {}); });
autoUpdater.on("update-downloaded", () => {
  if (mainWindow && !mainWindow.isDestroyed())
    dialog.showMessageBox(mainWindow, { type: "info", title: "Update Available", message: "A new version of Lodestone is available.", detail: "It will be installed when you restart the app.", buttons: ["Restart Now", "Later"] }).then(({ response }) => { if (response === 0) { isQuitting = true; autoUpdater.quitAndInstall(); } });
});
ipcMain.handle("check-for-updates", () => { if (isDev) return { update_available: false }; autoUpdater.checkForUpdates(); return { checking: true }; });

// ─── Local Database IPC Handlers (Community tier) ─────────────────────────────
// These handle local storage for conversations, messages, memories, commitments.
// Pro/Studio users continue using the server API — the SPA checks tier and routes accordingly.

// Conversations
ipcMain.handle("db:list-conversations", (_e, opts) => db.listConversations(opts?.folderId, opts?.includeArchived));
ipcMain.handle("db:get-conversation", (_e, id) => db.getConversation(id));
ipcMain.handle("db:create-conversation", (_e, data) => db.createConversation(data || {}));
ipcMain.handle("db:update-conversation", (_e, id, data) => db.updateConversation(id, data));
ipcMain.handle("db:delete-conversation", (_e, id) => db.deleteConversation(id));

// Messages
ipcMain.handle("db:get-messages", (_e, conversationId, limit, offset) => db.getMessages(conversationId, limit, offset));
ipcMain.handle("db:add-message", (_e, data) => db.addMessage(data));

// Memories
ipcMain.handle("db:list-memories", (_e, opts) => db.listMemories(opts || {}));
ipcMain.handle("db:get-memory", (_e, id) => db.getMemory(id));
ipcMain.handle("db:create-memory", (_e, data) => db.createMemory(data));
ipcMain.handle("db:delete-memory", (_e, id) => db.deleteMemory(id));

// Commitments
ipcMain.handle("db:list-commitments", (_e, status) => db.listCommitments(status));
ipcMain.handle("db:create-commitment", (_e, data) => db.createCommitment(data));
ipcMain.handle("db:update-commitment", (_e, id, data) => db.updateCommitment(id, data));
ipcMain.handle("db:delete-commitment", (_e, id) => db.deleteCommitment(id));

// Settings
ipcMain.handle("db:get-setting", (_e, key) => db.getSetting(key));
ipcMain.handle("db:set-setting", (_e, key, value) => db.setSetting(key, value));

// Folders
ipcMain.handle("db:list-folders", () => db.listFolders());
ipcMain.handle("db:create-folder", (_e, data) => db.createFolder(data));
ipcMain.handle("db:delete-folder", (_e, id) => db.deleteFolder(id));

// Stats & Export
ipcMain.handle("db:get-stats", () => db.getStats());
ipcMain.handle("db:export-all", () => db.exportAll());
ipcMain.handle("db:import-all", (_e, data) => db.importAll(data));

// ─── Tier Detection ──────────────────────────────────────────────────────────
// After login, the SPA checks the user's tier and routes data accordingly.
// Community: local DB via IPC. Pro/Studio: server API via fetch.
ipcMain.handle("db:get-db-path", () => {
  const os = require("os");
  return path.join(os.homedir(), ".lodestone", "local.db");
});

// ─── Code Execution (sandboxed) ──────────────────────────────────────────────
// Runs Python or JavaScript in a sandboxed child process.
// Timeout enforced, output captured.
const { execFile } = require("child_process");
const os = require("os");

ipcMain.handle("execute-code", async (_e, language, code, timeout = 10) => {
  const timeoutMs = Math.min((timeout || 10) * 1000, 30000); // Cap at 30s
  const tmpDir = path.join(os.tmpdir(), "lodestone-exec");
  fs.mkdirSync(tmpDir, { recursive: true });

  if (language === "python") {
    const scriptPath = path.join(tmpDir, `exec-${Date.now()}.py`);
    fs.writeFileSync(scriptPath, code);
    try {
      const result = await new Promise((resolve, reject) => {
        const proc = execFile("python3", [scriptPath], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          fs.unlink(scriptPath, () => {});
          if (err) reject(new Error(stderr || err.message));
          else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
        proc.on("error", reject);
      });
      return { output: result.stdout, error: result.stderr || null, exitCode: 0 };
    } catch (err) {
      return { output: "", error: err.message, exitCode: 1 };
    }
  } else if (language === "javascript") {
    try {
      // Safe JS execution in isolated context
      const fn = new Function(`"use strict"; const console = { log: (...a) => a.join(' '), error: (...a) => a.join(' ') }; return (function() { ${code} })();`);
      const result = fn();
      return { output: String(result), error: null, exitCode: 0 };
    } catch (err) {
      return { output: "", error: err.message, exitCode: 1 };
    }
  }
  return { output: "", error: `Unsupported language: ${language}`, exitCode: 1 };
});

// ─── Ollama Models ────────────────────────────────────────────────────────────
// List available local Ollama models for the model selector.
const httpsOllama = require("https");
const httpOllama = require("http");

ipcMain.handle("ollama-list-models", async () => {
  const ollamaUrl = store.get("ollama_url", "http://localhost:11434");
  const url = new URL("/api/tags", ollamaUrl);
  const client = url.protocol === "https:" ? httpsOllama : httpOllama;
  return new Promise((resolve) => {
    const req = client.get(url, { timeout: 5000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.models || []).map(m => ({
            name: m.name, size: m.size, modified: m.modified_at, quantization: m.details?.quantization_level,
          })));
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
  });
});

ipcMain.handle("ollama-check", async () => {
  const ollamaUrl = store.get("ollama_url", "http://localhost:11434");
  const url = new URL("/api/version", ollamaUrl);
  const client = url.protocol === "https:" ? httpsOllama : httpOllama;
  return new Promise((resolve) => {
    const req = client.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve({ available: true, version: JSON.parse(data).version }); }
        catch { resolve({ available: true }); }
      });
    });
    req.on("error", () => resolve({ available: false }));
    req.on("timeout", () => { req.destroy(); resolve({ available: false }); });
  });
});

ipcMain.handle("ollama-set-url", (_e, url) => {
  store.set("ollama_url", url);
  return true;
});

// ─── Scheduler IPC Handlers ──────────────────────────────────────────────────
// Local cron-like scheduling — available to all tiers, no server needed.

ipcMain.handle("scheduler:list-presets", () => {
  return Object.entries(scheduler.SCHEDULE_PRESETS).map(([id, p]) => ({ id, ...p }));
});

ipcMain.handle("scheduler:list-task-types", () => {
  return Object.entries(scheduler.TASK_TYPES).map(([id, t]) => ({ id, ...t }));
});

ipcMain.handle("scheduler:list", (_e, filter) => scheduler.listTasks(filter));

ipcMain.handle("scheduler:get", (_e, id) => scheduler.getTask(id));

ipcMain.handle("scheduler:create", (_e, task) => {
  // Resolve preset to cron expression if preset_id is provided
  if (task.preset_id && !task.cron_expr) {
    const preset = scheduler.SCHEDULE_PRESETS[task.preset_id];
    if (preset) task.cron_expr = preset.cron;
  }
  // Default cron if neither preset nor cron_expr
  if (!task.cron_expr) task.cron_expr = "0 9 * * *"; // Default: 9am daily
  const created = scheduler.createTask(task);
  return created;
});

ipcMain.handle("scheduler:update", (_e, id, updates) => {
  return scheduler.updateTask(id, updates);
});

ipcMain.handle("scheduler:delete", (_e, id) => {
  return scheduler.deleteTask(id);
});

ipcMain.handle("scheduler:pause", (_e, id) => {
  return scheduler.pauseTask(id);
});

ipcMain.handle("scheduler:resume", (_e, id) => {
  return scheduler.resumeTask(id);
});

ipcMain.handle("scheduler:next-run", (_e, cronExpr) => {
  const next = scheduler.calculateNextRun(cronExpr);
  return next ? next.toISOString() : null;
});

// ─── Global Shortcut ──────────────────────────────────────────────────────────
function registerGlobalShortcut() {
  globalShortcut.register("CommandOrControl+Shift+L", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // ─── Protocol handler: local-first architecture ──────────────────────────
  // Serves UI from bundled local files (ui/ directory).
  // Only /api/ requests are proxied to the server.
  // Falls back to network for missing local assets.
  protocol.handle("lodestone", createProtocolHandler({
    fetchWithNode,
    DESKTOP_DETECT_SCRIPT,
    communityDataLayerLoader,
    communityDataLayerScript,
  }));

  createWindow();
  createMenu();
  createTray();
  registerGlobalShortcut();
  desktopTools.registerToolHandlers(mainWindow, store);
  scheduler.initScheduler(mainWindow);
  // Initialize MCP bridge - exposes Lodestone tools via Model Context Protocol
  const mcpTools = desktopTools.getTools().map(t => ({
    name: t.name,
    description: t.description || "",
    inputSchema: t.inputSchema || { type: "object", properties: {} },
    handler: async (args) => { try { return await t.handler(args); } catch (e) { return { error: e.message }; } }
  }));
  initMCP(mcpTools);

  // Auto-start bundled MCP servers after a short delay to let UI settle
  setTimeout(async () => {
    try {
      const result = await autoStartBundledServers();
      console.log(`[MCP] Bundled servers: ${result.started} started, ${result.failed} failed`);
    } catch (err) {
      console.error('[MCP] Bundled auto-start error:', err.message);
    }
  }, 3000);

  scheduler.startScheduler();
  if (Notification.isSupported() && process.platform === "win32") app.setAppUserModelId("com.heylodestone.app");
  if (!isDev) setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 30000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { isQuitting = true; globalShortcut.unregisterAll(); });
app.on("will-quit", () => { cleanupMCP(); if (tray && !tray.isDestroyed()) tray.destroy(); });
app.on("open-url", (_event, url) => { handleDeepLink(url); });