// ─── Lodestone Desktop Tools ──────────────────────────────────────────────
// System-level tools available only in the desktop app.
// All functionality has been refactored into lib/tools/ modules.
// This file re-exports the public API for backward compatibility.

const tools = require("./lib/tools");

module.exports = {
  registerToolHandlers: tools.registerToolHandlers,
  isPathAllowed: tools.isPathAllowed,
  isPathWritable: tools.isPathWritable,
  FILE_TIERS: tools.FILE_TIERS,
  getTools: tools.getTools,
};