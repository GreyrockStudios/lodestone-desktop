// ─── Lodestone Desktop — Window Management ────────────────────────────────────
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const Store = require("electron-store");

const { isDev, START_URL, APP_URL, API_URL, DESKTOP_DETECT_SCRIPT, communityDataLayerLoader } = require("./constants");

const store = new Store({
  name: "window-state",
  defaults: { x: undefined, y: undefined, width: 1200, height: 800, maximized: false },
});

let mainWindow = null;
let isQuitting = false;

function getMainWindow() { return mainWindow; }
function setIsQuitting(val) { isQuitting = val; }
function getIsQuitting() { return isQuitting; }

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.getBounds();
    store.set("x", b.x); store.set("y", b.y); store.set("width", b.width); store.set("height", b.height); store.set("maximized", mainWindow.isMaximized());
  } catch (_e) {}
}

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
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload.js"),
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
    if (url.startsWith(APP_URL) || url.startsWith(API_URL) || url.startsWith("lodestone://")) return { action: "allow" };
    // Only open http/https URLs externally — block file:// and other protocols
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith(API_URL) && !url.startsWith("http://localhost") && !url.startsWith("file://") && !url.startsWith("lodestone://")) {
      event.preventDefault();
      // Only open http/https URLs externally
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.on("resize", saveWindowState);
  mainWindow.on("move", saveWindowState);
  mainWindow.on("maximize", saveWindowState);
  mainWindow.on("unmaximize", saveWindowState);
  mainWindow.on("close", (event) => {
    if (!isQuitting) { event.preventDefault(); saveWindowState(); mainWindow.hide(); }
  });

  return mainWindow;
}

function showWindow() { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }

module.exports = {
  createWindow,
  saveWindowState,
  showWindow,
  injectNativeBridge,
  getMainWindow,
  setIsQuitting,
  getIsQuitting,
  store,
};