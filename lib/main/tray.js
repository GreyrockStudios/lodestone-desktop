// ─── Lodestone Desktop — System Tray ──────────────────────────────────────────
const { app, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { getMainWindow, setIsQuitting, showWindow } = require("./window");

let tray = null;

function getTray() { return tray; }

function createTray(checkForUpdates) {
  const ic = path.join(__dirname, "..", "..", "assets", "tray-icon.png");
  const img = fs.existsSync(ic) ? nativeImage.createFromPath(ic) : nativeImage.createFromPath(path.join(__dirname, "..", "..", "assets", "icon.png"));
  tray = new Tray(img.resize({ width: 22, height: 22 }));
  tray.setToolTip("Lodestone — Your AI, always learning");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Lodestone", click: () => showWindow() },
    { label: "New Chat", click: () => { showWindow(); getMainWindow().webContents.executeJavaScript("window.location.hash='#/chat'").catch(() => {}); } },
    { type: "separator" },
    { label: "Start at Login", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: "separator" },
    { label: "Check for Updates…", click: () => checkForUpdates() },
    { type: "separator" },
    { label: "Quit Lodestone", click: () => { setIsQuitting(true); app.quit(); } },
  ]));
  tray.on("click", () => showWindow());
  return tray;
}

module.exports = { createTray, getTray };