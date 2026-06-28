// ─── Lodestone Desktop — Application Menu ─────────────────────────────────────
const { app, Menu, dialog, shell } = require("electron");
const { getMainWindow, showWindow } = require("./window");

function checkForUpdates(autoUpdater, isDev) {
  const mainWindow = getMainWindow();
  if (isDev) { dialog.showMessageBox(mainWindow, { type: "info", title: "Updates", message: "Update checks are disabled in development mode.", buttons: ["OK"] }); return; }
  autoUpdater.checkForUpdatesAndNotify();
}

function createMenu(autoUpdater, isDev) {
  const mainWindow = getMainWindow();

  // Hide the menu bar on Windows — the SPA has its own navigation in the sidebar
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Lodestone", submenu: [
      { label: "About Lodestone", click: () => dialog.showMessageBoxSync(mainWindow, { type: "info", title: "About Lodestone", message: `Lodestone v${app.getVersion()}`, detail: "Your AI, always learning.\n\nBuilt by Greyrock Studio", buttons: ["OK"] }) },
      { type: "separator" }, { label: "Check for Updates…", click: () => checkForUpdates(autoUpdater, isDev) }, { type: "separator" },
      { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => { showWindow(); mainWindow.webContents.executeJavaScript("window.location.hash='#/settings'").catch(() => {}); } },
      { type: "separator" }, { label: "Quit Lodestone", accelerator: "CmdOrCtrl+Q", click: () => { setIsQuitting(true); app.quit(); } },
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

module.exports = { createMenu, checkForUpdates };