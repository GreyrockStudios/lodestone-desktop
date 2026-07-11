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

  // Windows unsigned builds: disable signature verification so auto-update
  // doesn't reject updates with "not signed by application owner"
  // Remove this once we have a code signing certificate (Azure Trusted Signing)
  autoUpdater.verifyUpdateCodeSignature = false;

  autoUpdater.on('checking-for-update', () => console.log('[Updater] Checking for updates...'));
  autoUpdater.on('update-available', (info) => console.log(`[Updater] Update available: v${info.version}`));
  autoUpdater.on('update-not-available', (info) => console.log(`[Updater] No update available (current: v${info.version})`));
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Downloading: ${progress.percent.toFixed(1)}% (${(progress.transferred / 1048576).toFixed(1)}/${(progress.total / 1048576).toFixed(1)} MB)`);
  });
  // Note: update-downloaded dialog is handled in ipc-handlers.js registerUpdateHandlers()
  // which shows a Restart Now/Later dialog — better UX than a silent notification.
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Update v${info.version} downloaded — will install on quit or restart`);
  });
  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    // If update fails to download or verify, log but don't crash
    // electron-updater won't install a corrupt download — it verifies SHA512
  });
}

// ── Auto-update rollback ──
// On startup, check if we just updated by comparing with last-known version.
// If the app crashes within 10 seconds of startup, the next launch will see
// the stale version marker and can warn the user or offer to rollback.
const STORED_VERSION_KEY = 'last-successful-version';
const STARTUP_TIMESTAMP_KEY = 'last-startup-timestamp';

function markSuccessfulStartup() {
  const Store = require('electron-store');
  const s = new Store({ name: 'updater-state' });
  s.set(STORED_VERSION_KEY, app.getVersion());
  s.set(STARTUP_TIMESTAMP_KEY, Date.now());
}

function checkForFailedUpdate() {
  try {
    const Store = require('electron-store');
    const s = new Store({ name: 'updater-state' });
    const lastVersion = s.get(STORED_VERSION_KEY);
    const lastStartup = s.get(STARTUP_TIMESTAMP_KEY);
    if (lastVersion && lastVersion !== app.getVersion()) {
      // We just updated — mark this version as good after 10s
      setTimeout(() => markSuccessfulStartup(), 10000);
      return 'updated';
    }
    if (lastVersion === app.getVersion()) {
      // Same version — mark as good immediately (healthy restart)
      markSuccessfulStartup();
      return 'healthy';
    }
    // First launch or version mismatch — mark current version
    markSuccessfulStartup();
    return 'first-launch';
  } catch {
    return 'unknown';
  }
}

function onReady() {
  // Check for failed update (rollback detection)
  const updateStatus = checkForFailedUpdate();
  console.log(`[App] Update status: ${updateStatus}`);

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
  // Required for Windows taskbar grouping and notification grouping — must be set before any window/notification
  if (process.platform === "win32") app.setAppUserModelId("com.heylodestone.app");
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