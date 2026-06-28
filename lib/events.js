// ─── Event Helpers ─────────────────────────────────────────────────────────
// Thin wrappers around window.dispatchEvent / CustomEvent for the data layer.

module.exports = {
  emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
  },

  on(name, fn) {
    window.addEventListener(name, fn);
  },

  off(name, fn) {
    window.removeEventListener(name, fn);
  },

  // Standard event names used across the data layer
  CONVERSATIONS_CHANGED: 'conversations-changed',
  TOKEN_REFRESHED: 'lodestone:token-refreshed',
  TOKEN_EXPIRED: 'lodestone:token-expired',
  MCP_INSTALL_REQUEST: 'mcp-install-request',
  MCP_INSTALL_COMPLETE: 'mcp-install-complete',
};