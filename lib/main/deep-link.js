// ─── Lodestone Desktop — Deep Link Handler ────────────────────────────────────
const { app } = require("electron");
const { DEEP_LINK_PROTOCOL } = require("./constants");
const { getMainWindow, showWindow } = require("./window");

function handleDeepLink(url) {
  const mainWindow = getMainWindow();
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

// Register as default protocol client — call once during app startup
function registerProtocol() {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}

module.exports = { handleDeepLink, registerProtocol };