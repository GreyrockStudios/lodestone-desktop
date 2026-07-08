// ─── Desktop-Specific Tools ───────────────────────────────────────────────
// Window actions, notifications, clipboard, permissions, audit log reader.

const { clipboard, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

function register(mainWindow, store, auditLog, AUDIT_LOG) {
  const { ipcMain } = require("electron");

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
    if (typeof text !== 'string') return { error: 'Text must be a string' };
    if (text.length > 100000) return { error: 'Text too long (max 100KB)' };
    auditLog("clipboard-write", text.substring(0, 100), "OK", tier);
    try {
      clipboard.writeText(text);
      return { success: true };
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

  // ── Scheduled Notification ──────────────────────────────────────────────────

  ipcMain.handle("tool:schedule-notification", async (_e, { title, body, delayMs, clickAction }) => {
    try {
      setTimeout(() => {
        const notif = new Notification({
          title: title || "Lodestone",
          body: body || "",
          icon: path.join(__dirname, "..", "assets", "icon.png"),
          silent: false,
        });
        notif.on("click", () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
            if (clickAction) {
              // Validate clickAction: only allow hash routes with alphanumeric/slash/hyphen
              const sanitized = clickAction.replace(/^#\/+/, '');
              if (/^[a-zA-Z0-9_/-]+$/.test(sanitized)) {
                mainWindow.webContents.executeJavaScript(`window.location.hash='#/${sanitized}'`).catch(() => {});
              }
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
}

module.exports = { register };