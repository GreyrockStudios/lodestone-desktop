// ─── Lodestone Desktop — App Lifecycle ────────────────────────────────────────
const { app, BrowserWindow, globalShortcut, protocol, Notification } = require("electron");
const { autoUpdater } = require("electron-updater");

const { isDev, DESKTOP_DETECT_SCRIPT, communityDataLayerLoader, communityDataLayerScript } = require("./constants");
const { fetchWithNode, fetchWithNodeStreaming } = require("./fetch-helper");
const { createWindow, showWindow, getMainWindow, setIsQuitting, store } = require("./window");
const { handleDeepLink, registerProtocol } = require("./deep-link");
const { createTray, getTray } = require("./tray");
const { createMenu } = require("./menu");
const { registerAll: registerAllIpcHandlers } = require("./ipc-handlers");
const { createProtocolHandler } = require("../../protocol-handler");
const desktopTools = require("../../desktop-tools");
const scheduler = require("../../scheduler");
const brain = require("../../brain");
const proactive = require("../../brain/proactive");
const { initMCP, cleanupMCP, autoStartBundledServers } = require("../../mcp-bridge");
const db = require("../../db");

function setupAutoUpdater() {
  // Comprehensive logging + error handling for auto-updater
  autoUpdater.logger = {
    info: (...args) => console.log('[Updater]', ...args),
    warn: (...args) => console.warn('[Updater]', ...args),
    error: (...args) => console.error('[Updater]', ...args),
    debug: (...args) => console.log('[Updater:debug]', ...args),
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => console.log('[Updater] Checking for updates...'));
  autoUpdater.on('update-available', (info) => console.log(`[Updater] Update available: v${info.version}`));
  autoUpdater.on('update-not-available', (info) => console.log(`[Updater] No update available (current: v${info.version})`));
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Downloading: ${progress.percent.toFixed(1)}% (${(progress.transferred / 1048576).toFixed(1)}/${(progress.total / 1048576).toFixed(1)} MB)`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Update v${info.version} downloaded — will install on quit`);
  });
  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
  });
}

function onReady() {
  // Register deep link protocol
  registerProtocol();

  // Protocol handler: local-first architecture
  protocol.handle("lodestone", createProtocolHandler({
    fetchWithNode,
    fetchWithNodeStreaming,
    DESKTOP_DETECT_SCRIPT,
    communityDataLayerLoader,
    communityDataLayerScript,
  }));

  createWindow();
  createMenu(autoUpdater, isDev);
  createTray(require("./menu").checkForUpdates);
  registerAllIpcHandlers(db);
  globalShortcut.register("CommandOrControl+Shift+L", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  desktopTools.registerToolHandlers(getMainWindow(), store);
  scheduler.initScheduler(getMainWindow());
  brain.init();
  proactive.registerBrainTasks();

  // Initialize MCP bridge
  const mcpTools = desktopTools.getTools().map(t => ({
    name: t.name,
    description: t.description || "",
    inputSchema: t.inputSchema || { type: "object", properties: {} },
    handler: async (args) => { try { return await t.handler(args); } catch (e) { return { error: e.message }; } }
  }));
  initMCP(mcpTools);

  // Auto-start bundled MCP servers after a short delay
  setTimeout(async () => {
    try {
      const result = await autoStartBundledServers();
      console.debug(`[MCP] Bundled servers: ${result.started} started, ${result.failed} failed`);
    } catch (err) {
      console.error('[MCP] Bundled auto-start error:', err.message);
    }
  }, 3000);

  scheduler.startScheduler();
  if (Notification.isSupported() && process.platform === "win32") app.setAppUserModelId("com.heylodestone.app");
  if (!isDev) {
    setupAutoUpdater();
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 30000);
  }
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
}

function onWindowAllClosed() {
  if (process.platform !== "darwin") app.quit();
}

function onBeforeQuit() {
  setIsQuitting(true);
  globalShortcut.unregisterAll();
}

function onWillQuit() {
  cleanupMCP();
  const tray = getTray();
  if (tray && !tray.isDestroyed()) tray.destroy();
}

function onOpenUrl(_event, url) {
  handleDeepLink(url);
}

module.exports = {
  onReady,
  onWindowAllClosed,
  onBeforeQuit,
  onWillQuit,
  onOpenUrl,
};