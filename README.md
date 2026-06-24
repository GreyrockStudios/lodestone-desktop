# Lodestone Desktop — Electron

Electron-based desktop app for Lodestone. Replaces the Tauri (Rust) version with a pure JavaScript implementation that's easier to maintain, debug, and extend.

## What's Included

All features from Tauri v0.4.0, reimplemented in JS:

| Feature | Tauri (Rust) | Electron (JS) |
|---------|-------------|----------------|
| Window state persistence | `tauri-plugin-store` + Rust | `electron-store` |
| System tray | Rust `TrayIconBuilder` | Electron `Tray` |
| Native menus | Rust `Menu` builder | Electron `Menu` |
| Deep linking (`lodestone://`) | `tauri-plugin-deep-link` | `app.setAsDefaultProtocolClient` |
| Badge count | `objc2` / `NSDockTile` | `app.dock.setBadge()` |
| Single instance | `tauri-plugin-single-instance` | `app.requestSingleInstanceLock()` |
| Global shortcut (⌘⇧L) | `tauri-plugin-global-shortcut` | `globalShortcut.register()` |
| File save dialog | `tauri-plugin-dialog` | `dialog.showSaveDialog()` |
| Auto-update | `tauri-plugin-updater` | `electron-updater` |
| Auto-start at login | `tauri-plugin-autostart` | `app.setLoginItemSettings()` |
| Notifications | `tauri-plugin-notification` | Electron `Notification` |
| Close-to-tray | Rust `on_window_event` | `mainWindow.on('close')` |
| API proxy | Rust `initialization_script` | `webContents.executeJavaScript()` |
| Native bridge | Rust `invoke_handler` | Preload + `contextBridge` |
| File drop | Rust `tauri://file-drop` | HTML5 drag/drop (automatic) |

## Quick Start

```bash
# Install dependencies
npm install

# Pull latest frontend from server
npm run pull-ui

# Run in dev mode
npm start

# Build DMG for macOS
npm run build:mac
```

## Architecture

```
main.js          — Electron main process (replaces lib.rs)
preload.js        — Context bridge (replaces __TAURI_INTERNALS__)
ui/               — Frontend assets (pulled from server, same as before)
assets/           — App icons (icon.icns, icon.ico, icon.png, tray-icon.png)
```

## Why Electron?

1. **Pure TypeScript** — No Rust compilation, no `cargo` fights, no cross-language debugging
2. **Battle-tested ecosystem** — Every native feature has mature npm packages
3. **Shared codebase** — Same React frontend, same API, zero WebView compatibility headaches
4. **Code signing** — `electron-builder` handles macOS notarization out of the box
5. **Auto-update** — `electron-updater` just works

The trade-off: ~150MB bundle vs ~10MB for Tauri. For a paid desktop AI app, that's acceptable.

## Deploying to Jay's MacBook

```bash
# Build DMG
npm run build:mac

# Copy to Jay's MacBook
scp dist/Lodestone-0.5.0-universal.dmg jaybureau@100.81.24.105:~/Desktop/

# Or install directly
# On Jay's MacBook: open the DMG, drag to Applications
```

## Migration Notes

The frontend at heylodestone.com already checks for `window.LodestoneNative` and falls back gracefully. The Electron version injects the same `LodestoneNative` object via `preload.js` + `contextBridge`, so the web app can't tell the difference.

If you need to check whether the bridge is available:
```js
if (window.LodestoneNative?.isDesktop) {
  // Running in desktop app
}
```