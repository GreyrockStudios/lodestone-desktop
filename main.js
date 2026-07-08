// ─── Lodestone Desktop — Electron Main Process v0.5.8 ──────────────────────
// Application wrapper for heylodestone.com chat interface.
// Refactored into modules under lib/main/ for maintainability.

const { app, protocol } = require("electron");
const { DEEP_LINK_PROTOCOL } = require("./lib/main/constants");
const { getMainWindow } = require("./lib/main/window");
const { handleDeepLink } = require("./lib/main/deep-link");
const { onReady, onWindowAllClosed, onBeforeQuit, onWillQuit, onOpenUrl } = require("./lib/main/app-lifecycle");

// GPU crash workaround: some Windows GPU drivers cause Chromium to crash on startup.
// --disable-gpu uses software rendering; --in-process-gpu prevents the separate GPU
// process from crashing and taking the renderer with it.
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");

// Register custom scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lodestone",
    privileges: {
      standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
    },
  },
]);

// Single-instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const deepLink = commandLine.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
    if (deepLink) handleDeepLink(deepLink);
  });
}

// Wire up app lifecycle
app.whenReady().then(onReady);
app.on("window-all-closed", onWindowAllClosed);
app.on("before-quit", onBeforeQuit);
app.on("will-quit", onWillQuit);
app.on("open-url", onOpenUrl);