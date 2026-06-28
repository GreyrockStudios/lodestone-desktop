// ─── Tool Modules Index ────────────────────────────────────────────────────
// Registers all tool IPC handlers by delegating to category modules.

const path = require("path");
const fs = require("fs");
const os = require("os");

const filesystem = require("./filesystem");
const shell = require("./shell");
const browser = require("./browser");
const system = require("./system");
const desktop = require("./desktop");
const calculator = require("./calculator");
const capture = require("./capture");

const HOME = os.homedir();
const AUDIT_LOG = path.join(HOME, ".lodestone", "tool-audit.log");

// ─── Audit Logging ────────────────────────────────────────────────────────

function auditLog(tool, args, result, tier) {
  const entry = {
    timestamp: new Date().toISOString(),
    tool,
    tier: tier || "unknown",
    args: typeof args === "string" ? args : JSON.stringify(args),
    result: typeof result === "string" ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200),
  };
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  } catch (e) { /* non-critical */ }
}

// ─── Register All Tool Handlers ────────────────────────────────────────────

function registerToolHandlers(mainWindow, store) {
  filesystem.register(mainWindow, store, auditLog);
  shell.register(mainWindow, store, auditLog);
  browser.register(mainWindow, store, auditLog);
  system.register(mainWindow, store, auditLog);
  desktop.register(mainWindow, store, auditLog, AUDIT_LOG);
  calculator.register(mainWindow, store, auditLog);
  capture.register(mainWindow, store, auditLog);
}

// ─── Tool Definitions for MCP Bridge ────────────────────────────────────────

function getTools() {
  return [
    { name: "read-file", description: "Read file contents", inputSchema: { type: "object", properties: { path: { type: "string" }, encoding: { type: "string", default: "utf-8" } }, required: ["path"] } },
    { name: "write-file", description: "Write content to a file", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, createDirs: { type: "boolean" } }, required: ["path", "content"] } },
    { name: "list-directory", description: "List directory contents", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "delete-file", description: "Delete a file or directory", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "move-file", description: "Move or rename a file", inputSchema: { type: "object", properties: { src: { type: "string" }, dest: { type: "string" } }, required: ["src", "dest"] } },
    { name: "search-files", description: "Search for files by pattern", inputSchema: { type: "object", properties: { dir: { type: "string" }, pattern: { type: "string" }, maxResults: { type: "number" } }, required: ["dir", "pattern"] } },
    { name: "system-info", description: "Get system information", inputSchema: { type: "object", properties: {} } },
    { name: "clipboard-read", description: "Read clipboard contents", inputSchema: { type: "object", properties: {} } },
    { name: "clipboard-write", description: "Write text to clipboard", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
    { name: "take-screenshot", description: "Take a screenshot", inputSchema: { type: "object", properties: {} } },
    { name: "open-external", description: "Open URL in default browser", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
    { name: "open-in-finder", description: "Reveal file in Finder", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "window-action", description: "Control window (minimize, maximize, close, etc)", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["minimize", "maximize", "close", "fullscreen", "reload"] } }, required: ["action"] } },
    { name: "run-command", description: "Run a shell command", inputSchema: { type: "object", properties: { command: { type: "string" }, timeout: { type: "number" } }, required: ["command"] } },
    { name: "battery-info", description: "Get battery status", inputSchema: { type: "object", properties: {} } },
    { name: "wifi-info", description: "Get WiFi information", inputSchema: { type: "object", properties: {} } },
    { name: "get-volume", description: "Get system volume level", inputSchema: { type: "object", properties: {} } },
    { name: "set-volume", description: "Set system volume level", inputSchema: { type: "object", properties: { level: { type: "number" } }, required: ["level"] } },
    { name: "schedule-notification", description: "Schedule a desktop notification", inputSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, delayMs: { type: "number" } }, required: ["title", "body"] } },
    { name: "pick-folder", description: "Open native folder picker", inputSchema: { type: "object", properties: {} } },
    { name: "get-file-tier", description: "Get current file access tier", inputSchema: { type: "object", properties: {} } },
    { name: "set-file-tier", description: "Set file access tier", inputSchema: { type: "object", properties: { tier: { type: "string", enum: ["none", "minimal", "standard", "full"] } }, required: ["tier"] } },
    { name: "add-file-dir", description: "Add directory to allowed list", inputSchema: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] } },
    { name: "remove-file-dir", description: "Remove directory from allowed list", inputSchema: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] } },
    { name: "get-allowed-dirs", description: "Get list of allowed directories", inputSchema: { type: "object", properties: {} } },
    { name: "list-processes", description: "List running processes", inputSchema: { type: "object", properties: {} } },
    { name: "screen-understand", description: "Take a screenshot and prepare it for vision analysis. Returns the screenshot as base64 along with a question for the AI to interpret.", inputSchema: { type: "object", properties: { question: { type: "string", description: "What to ask about the screen (default: describe what you see)" } }, required: [] } },
    { name: "click", description: "Click at screen coordinates", inputSchema: { type: "object", properties: { x: { type: "number", description: "X coordinate" }, y: { type: "number", description: "Y coordinate" }, button: { type: "string", enum: ["left", "right"], description: "Mouse button" }, doubleClick: { type: "boolean", description: "Double-click" } }, required: ["x", "y"] } },
    { name: "type-text", description: "Type text at the current cursor position", inputSchema: { type: "object", properties: { text: { type: "string", description: "Text to type" }, pressEnter: { type: "boolean", description: "Press Enter after typing" } }, required: ["text"] } },
    { name: "press-key", description: "Press a key or key combination", inputSchema: { type: "object", properties: { key: { type: "string", description: "Key to press (e.g. enter, tab, a, f5)" }, modifiers: { type: "array", items: { type: "string", enum: ["cmd", "ctrl", "alt", "shift"] }, description: "Key modifiers" } }, required: ["key"] } },
    { name: "scroll", description: "Scroll at screen position", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, deltaY: { type: "number", description: "Scroll amount (negative = up)" } } } },
    { name: "move-mouse", description: "Move mouse to screen coordinates", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] } },
    { name: "get-mouse-pos", description: "Get current mouse position", inputSchema: { type: "object", properties: {} } },
    { name: "drag", description: "Drag from one point to another", inputSchema: { type: "object", properties: { fromX: { type: "number" }, fromY: { type: "number" }, toX: { type: "number" }, toY: { type: "number" }, duration: { type: "number", description: "Duration in ms" } }, required: ["fromX", "fromY", "toX", "toY"] } },
    { name: "active-window", description: "Get information about the currently active window (app name, window title). Useful for context-aware assistance.", inputSchema: { type: "object", properties: {} } },
    { name: "browser-open", description: "Open a URL in the user's default browser.", inputSchema: { type: "object", properties: { url: { type: "string", description: "URL to open" } }, required: ["url"] } },
    { name: "get-permissions", description: "Get tool permission settings", inputSchema: { type: "object", properties: {} } },
    { name: "set-permission", description: "Set tool permission", inputSchema: { type: "object", properties: { tool: { type: "string" }, allowed: { type: "boolean" } }, required: ["tool", "allowed"] } },
  ];
}

module.exports = { registerToolHandlers, isPathAllowed: filesystem.isPathAllowed, isPathWritable: filesystem.isPathWritable, FILE_TIERS: filesystem.FILE_TIERS, getTools };