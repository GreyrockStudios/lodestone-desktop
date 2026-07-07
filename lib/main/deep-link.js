// ─── Lodestone Desktop — Deep Link Handler ────────────────────────────────────
const { app } = require("electron");
const { DEEP_LINK_PROTOCOL } = require("./constants");
const { getMainWindow, showWindow } = require("./window");

// Sanitize a string for safe injection into executeJavaScript.
// Strips backticks, dollar signs (template literals), and closing script tags
// that could break out of the inline script context.
function sanitizeForJS(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/<\/script/gi, "<\\/script");
}

// Validate that a JSON string parses safely and returns the expected type.
function safeParseJSON(str, expectedType) {
  if (!str) return expectedType === "array" ? [] : undefined;
  try {
    const parsed = JSON.parse(str);
    if (expectedType === "array" && !Array.isArray(parsed)) return [];
    if (expectedType === "object" && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) return undefined;
    return parsed;
  } catch {
    return expectedType === "array" ? [] : undefined;
  }
}

function handleDeepLink(url) {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Validate URL format — only allow lodestone:// protocol
  if (!url || typeof url !== "string" || !url.startsWith(`${DEEP_LINK_PROTOCOL}://`)) {
    console.warn("[DeepLink] Invalid deep link URL rejected");
    return;
  }
  const p = url.slice(`${DEEP_LINK_PROTOCOL}://`.length);

  // Handle MCP install deep links: lodestone://mcp/install?id=...&name=...&command=...
  if (p.startsWith("mcp/install") || p.startsWith("mcp/install?")) {
    const qs = p.includes("?") ? p.slice(p.indexOf("?") + 1) : "";
    const params = new URLSearchParams(qs);
    const id = sanitizeForJS(params.get("id"));
    const name = sanitizeForJS(params.get("name"));
    const command = sanitizeForJS(params.get("command"));
    const args = safeParseJSON(params.get("args"), "array");
    const env = safeParseJSON(params.get("env"), "object");

    if (!id || !name || !command) {
      console.warn("[DeepLink] MCP install rejected: missing required params");
      return;
    }

    // Validate id is a simple string (no special chars)
    if (!/^[a-zA-Z0-9_-]+$/.test(params.get("id"))) {
      console.warn("[DeepLink] MCP install rejected: invalid id");
      return;
    }

    try {
      // Safe: all values are sanitized before injection
      const detail = JSON.stringify({ id, name, command, args: args || [], env: env || null });
      mainWindow.show(); mainWindow.focus();
      mainWindow.webContents.executeJavaScript(
        `if (window.electronAPI && window.electronAPI.mcp && window.electronAPI.mcp.connect) { window.dispatchEvent(new CustomEvent('mcp-install-request', { detail: ${detail} })); }`
      ).catch(() => {});
      console.debug(`[DeepLink] MCP install request: ${name} (${id})`);
    } catch (err) {
      console.error('[DeepLink] MCP install error:', err.message);
    }
    return;
  }

  // Navigation deep links — whitelist only known routes
  const validRoutes = {
    "": "#/chat",
    "chat": "#/chat",
    "chat/": "#/chat",
    "settings": "#/settings",
    "settings/": "#/settings",
    "brain": "#/brain",
    "brain/": "#/brain",
    "marketplace": "#/brain?tab=mcp",
    "mcp-marketplace": "#/brain?tab=mcp",
  };

  let h;
  if (validRoutes[p] !== undefined) {
    h = validRoutes[p];
  } else if (p.startsWith("chat/")) {
    // Only allow alphanumeric conversation IDs after chat/
    const convoId = p.slice(5).replace(/[?#].*/, "");
    if (!/^[a-zA-Z0-9_-]+$/.test(convoId)) {
      console.warn("[DeepLink] Invalid chat ID rejected:", convoId);
      return;
    }
    h = `#/chat/${convoId}`;
  } else if (p.startsWith("settings/")) {
    const settingPath = p.slice(9).replace(/[?#].*/, "");
    if (!/^[a-zA-Z0-9_/-]+$/.test(settingPath)) {
      console.warn("[DeepLink] Invalid settings path rejected:", settingPath);
      return;
    }
    h = `#/settings/${settingPath}`;
  } else {
    // Unknown route — default to chat instead of allowing arbitrary navigation
    console.warn("[DeepLink] Unknown route, redirecting to chat:", p);
    h = "#/chat";
  }

  mainWindow.show(); mainWindow.focus();
  // Safe: h is constructed from whitelisted values and validated alphanumeric segments only
  mainWindow.webContents.executeJavaScript(`window.location.hash='${h}'`).catch(() => {});
}

// Register as default protocol client — call once during app startup
function registerProtocol() {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}

module.exports = { handleDeepLink, registerProtocol };