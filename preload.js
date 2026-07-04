// ─── Lodestone Desktop — Electron Preload Script v0.1.4 ──────────────────────
// Uses contextBridge.exposeInMainWorld for security (contextIsolation: true).
// Desktop detection (__TAURI_INTERNALS__) is injected via the protocol handler.
// This preload adds electronAPI for IPC calls and desktop detection.

const { contextBridge, ipcRenderer } = require("electron");

// ─── Desktop Detection ───────────────────────────────────────────────────────
const tauriInternals = {
  invoke: (cmd, args) => {
    switch (cmd) {
      case "set_badge_count": return ipcRenderer.invoke("set-badge-count", args?.count);
      case "save_file": return ipcRenderer.invoke("save-file", args?.content, args?.filename, args?.filters);
      case "read_file_contents": return ipcRenderer.invoke("read-file", args?.path);
      case "get_app_version": return ipcRenderer.invoke("get-version");
      case "check_for_updates": return ipcRenderer.invoke("check-for-updates");
      default: return Promise.resolve(null);
    }
  },
};

// Set CSS class when DOM is ready
if (document.documentElement) {
  document.documentElement.classList.add("is-tauri");
} else {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("is-tauri");
  });
}

// ─── Electron API (exposed via contextBridge for security) ────────────────────
const electronAPI = {
  // Native features
  setBadgeCount: (count) => ipcRenderer.invoke("set-badge-count", count),
  saveFile: (content, filename, filters) => ipcRenderer.invoke("save-file", content, filename, filters),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  getVersion: () => ipcRenderer.invoke("get-version"),
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  sendNotification: (opts) => ipcRenderer.invoke("send-notification", opts),
  checkNotificationPermission: () => ipcRenderer.invoke("check-notification-permission"),
  requestNotificationPermission: () => ipcRenderer.invoke("request-notification-permission"),

  // Local database (Community tier)
  db: {
    listConversations: (opts) => ipcRenderer.invoke("db:list-conversations", opts),
    getConversation: (id) => ipcRenderer.invoke("db:get-conversation", id),
    createConversation: (data) => ipcRenderer.invoke("db:create-conversation", data),
    updateConversation: (id, data) => ipcRenderer.invoke("db:update-conversation", id, data),
    deleteConversation: (id) => ipcRenderer.invoke("db:delete-conversation", id),
    getMessages: (conversationId, limit, offset) => ipcRenderer.invoke("db:get-messages", conversationId, limit, offset),
    addMessage: (data) => ipcRenderer.invoke("db:add-message", data),
    listMemories: (opts) => ipcRenderer.invoke("db:list-memories", opts),
    getMemory: (id) => ipcRenderer.invoke("db:get-memory", id),
    createMemory: (data) => ipcRenderer.invoke("db:create-memory", data),
    deleteMemory: (id) => ipcRenderer.invoke("db:delete-memory", id),
    listCommitments: (status) => ipcRenderer.invoke("db:list-commitments", status),
    createCommitment: (data) => ipcRenderer.invoke("db:create-commitment", data),
    updateCommitment: (id, data) => ipcRenderer.invoke("db:update-commitment", id, data),
    deleteCommitment: (id) => ipcRenderer.invoke("db:delete-commitment", id),
    getSetting: (key) => ipcRenderer.invoke("db:get-setting", key),
    setSetting: (key, value) => ipcRenderer.invoke("db:set-setting", key, value),
    listFolders: () => ipcRenderer.invoke("db:list-folders"),
    createFolder: (data) => ipcRenderer.invoke("db:create-folder", data),
    deleteFolder: (id) => ipcRenderer.invoke("db:delete-folder", id),

    // Artifacts (canvas persistence)
    listArtifacts: (conversationId) => ipcRenderer.invoke("db:list-artifacts", conversationId),
    getArtifact: (id) => ipcRenderer.invoke("db:get-artifact", id),
    createArtifact: (data) => ipcRenderer.invoke("db:create-artifact", data),
    updateArtifact: (id, data) => ipcRenderer.invoke("db:update-artifact", id, data),
    deleteArtifact: (id) => ipcRenderer.invoke("db:delete-artifact", id),
    pinArtifact: (id, pinned) => ipcRenderer.invoke("db:pin-artifact", id, pinned),

    getStats: () => ipcRenderer.invoke("db:get-stats"),
    exportAll: () => ipcRenderer.invoke("db:export-all"),
    importAll: (data) => ipcRenderer.invoke("db:import-all", data),
    getDbPath: () => ipcRenderer.invoke("db:get-db-path"),
  },

  // ─── Generic Desktop Tool Executor ──────────────────────────────────────
  // Used by Socket.IO to execute desktop tools when the server sends a desktop:tool-call
  execute: async (toolName, args = {}) => {
    const map = {
      'desktop_screenshot': () => ipcRenderer.invoke('tool:screenshot', args?.question),
      'desktop_screen_understand': () => ipcRenderer.invoke('tool:screenshot', args?.question),
      'desktop_click': () => ipcRenderer.invoke('tool:click', args?.x, args?.y, args?.button, args?.doubleClick),
      'desktop_type_text': () => ipcRenderer.invoke('tool:type-text', args?.text, args?.pressEnter),
      'desktop_press_key': () => ipcRenderer.invoke('tool:press-key', args?.key, args?.modifiers),
      'desktop_scroll': () => ipcRenderer.invoke('tool:scroll', args?.x, args?.y, args?.deltaX, args?.deltaY),
      'desktop_move_mouse': () => ipcRenderer.invoke('tool:move-mouse', args?.x, args?.y),
      'desktop_get_mouse_pos': () => ipcRenderer.invoke('tool:get-mouse-pos'),
      'desktop_drag': () => ipcRenderer.invoke('tool:drag', args?.fromX, args?.fromY, args?.toX, args?.toY, args?.duration),
      'desktop_clipboard_read': () => ipcRenderer.invoke('tool:clipboard-read'),
      'desktop_clipboard_write': () => ipcRenderer.invoke('tool:clipboard-write', args?.text),
      'desktop_system_info': () => ipcRenderer.invoke('tool:system-info'),
      'desktop_battery_info': () => ipcRenderer.invoke('tool:battery-info'),
      'desktop_wifi_info': () => ipcRenderer.invoke('tool:wifi-info'),
      'desktop_volume': () => args?.level !== undefined ? ipcRenderer.invoke('tool:set-volume', args.level) : ipcRenderer.invoke('tool:get-volume'),
      'desktop_open_url': () => ipcRenderer.invoke('tool:open-url', args?.url),
      'desktop_browser_open': () => ipcRenderer.invoke('tool:open-url', args?.url),
      'desktop_active_window': () => ipcRenderer.invoke('tool:active-window'),
      'desktop_run_command': () => ipcRenderer.invoke('tool:run-command', args?.command, args?.timeout),
      'desktop_list_directory': () => ipcRenderer.invoke('tool:list-directory', args?.path),
      'desktop_read_file': () => ipcRenderer.invoke('tool:read-file', args?.path),
      'desktop_write_file': () => ipcRenderer.invoke('tool:write-file', args?.path, args?.content),
      'desktop_search_files': () => ipcRenderer.invoke('tool:search-files', args?.path, args?.pattern, args?.maxResults),
      'desktop_schedule_notification': () => ipcRenderer.invoke('tool:schedule-notification', args),
    }
    const handler = map[toolName]
    if (!handler) return { error: `Unknown desktop tool: ${toolName}` }
    return await handler()
  },

  // ─── Code Execution (sandboxed) ──────────────────────────────────────────
  executeCode: (language, code, timeout) => ipcRenderer.invoke("execute-code", language, code, timeout),

  // ─── Ollama (local LLM) ──────────────────────────────────────────────────
  ollamaListModels: () => ipcRenderer.invoke("ollama-list-models"),
  ollamaCheck: () => ipcRenderer.invoke("ollama-check"),
  ollamaSetUrl: (url) => ipcRenderer.invoke("ollama-set-url", url),

  // ─── Desktop Tools (system-level access) ─────────────────────────────────
  tools: {
    // File operations
    listDirectory: (path) => ipcRenderer.invoke("tool:list-directory", path),
    readFile: (path, encoding) => ipcRenderer.invoke("tool:read-file", path, encoding),
    writeFile: (path, content, createDirs) => ipcRenderer.invoke("tool:write-file", path, content, createDirs),
    moveFile: (src, dest) => ipcRenderer.invoke("tool:move-file", src, dest),
    deleteFile: (path) => ipcRenderer.invoke("tool:delete-file", path),
    searchFiles: (dir, pattern, max) => ipcRenderer.invoke("tool:search-files", dir, pattern, max),

    // Clipboard
    clipboardRead: () => ipcRenderer.invoke("tool:clipboard-read"),
    clipboardWrite: (text) => ipcRenderer.invoke("tool:clipboard-write", text),

    // System info
    systemInfo: () => ipcRenderer.invoke("tool:system-info"),
    batteryInfo: () => ipcRenderer.invoke("tool:battery-info"),
    wifiInfo: () => ipcRenderer.invoke("tool:wifi-info"),

    // Window control
    windowAction: (action) => ipcRenderer.invoke("tool:window-action", action),

    // Open external
    openExternal: (url) => ipcRenderer.invoke("tool:open-external", url),
    openInFinder: (path) => ipcRenderer.invoke("tool:open-in-finder", path),

    // Screenshot
    takeScreenshot: () => ipcRenderer.invoke("tool:take-screenshot"),

    // Process list
    listProcesses: () => ipcRenderer.invoke("tool:list-processes"),

    // Active window info
    activeWindow: () => ipcRenderer.invoke("tool:active-window"),

    // Run command (restricted allowlist)
    runCommand: (command, timeout) => ipcRenderer.invoke("tool:run-command", command, timeout),

    // Volume (macOS)
    getVolume: () => ipcRenderer.invoke("tool:get-volume"),
    setVolume: (level) => ipcRenderer.invoke("tool:set-volume", level),

    // Scheduled notification
    scheduleNotification: (opts) => ipcRenderer.invoke("tool:schedule-notification", opts),

    // Desktop automation (computer use)
    click: (x, y, button, doubleClick) => ipcRenderer.invoke("tool:click", x, y, button, doubleClick),
    typeText: (text, pressEnter) => ipcRenderer.invoke("tool:type-text", text, pressEnter),
    pressKey: (key, modifiers) => ipcRenderer.invoke("tool:press-key", key, modifiers),
    scroll: (x, y, deltaX, deltaY) => ipcRenderer.invoke("tool:scroll", x, y, deltaX, deltaY),
    moveMouse: (x, y) => ipcRenderer.invoke("tool:move-mouse", x, y),
    getMousePos: () => ipcRenderer.invoke("tool:get-mouse-pos"),
    drag: (fromX, fromY, toX, toY, duration) => ipcRenderer.invoke("tool:drag", fromX, fromY, toX, toY, duration),

    // Permissions & Audit
    getPermissions: () => ipcRenderer.invoke("tool:get-permissions"),
    setPermission: (tool, allowed) => ipcRenderer.invoke("tool:set-permission", tool, allowed),
    getAuditLog: (limit) => ipcRenderer.invoke("tool:get-audit-log", limit),
    getAllowedDirs: () => ipcRenderer.invoke("tool:get-allowed-dirs"),

    // File access tiers
    getFileTier: () => ipcRenderer.invoke("tool:get-file-tier"),
    setFileTier: (tier) => ipcRenderer.invoke("tool:set-file-tier", tier),
    addFileDir: (dir) => ipcRenderer.invoke("tool:add-file-dir", dir),
    removeFileDir: (dir) => ipcRenderer.invoke("tool:remove-file-dir", dir),
    pickFolder: () => ipcRenderer.invoke("tool:pick-folder"),
  },

  // ─── Scheduler (local cron) ──────────────────────────────────────────────
  scheduler: {
    listPresets: () => ipcRenderer.invoke("scheduler:list-presets"),
    listTaskTypes: () => ipcRenderer.invoke("scheduler:list-task-types"),
    list: (filter) => ipcRenderer.invoke("scheduler:list", filter),
    get: (id) => ipcRenderer.invoke("scheduler:get", id),
    create: (task) => ipcRenderer.invoke("scheduler:create", task),
    update: (id, updates) => ipcRenderer.invoke("scheduler:update", id, updates),
    delete: (id) => ipcRenderer.invoke("scheduler:delete", id),
    pause: (id) => ipcRenderer.invoke("scheduler:pause", id),
    resume: (id) => ipcRenderer.invoke("scheduler:resume", id),
    nextRun: (cronExpr) => ipcRenderer.invoke("scheduler:next-run", cronExpr),
  },
  // Brain (local agent intelligence)
  brain: {
    // Identity layers
    getSoul: () => ipcRenderer.invoke('brain:get-soul'),
    setSoul: (content) => ipcRenderer.invoke('brain:set-soul', content),
    getIdentity: () => ipcRenderer.invoke('brain:get-identity'),
    setIdentity: (data) => ipcRenderer.invoke('brain:set-identity', data),
    getRules: () => ipcRenderer.invoke('brain:get-rules'),
    addRule: (rule, category, priority) => ipcRenderer.invoke('brain:add-rule', rule, category, priority),
    removeRule: (id) => ipcRenderer.invoke('brain:remove-rule', id),
    toggleRule: (id, enabled) => ipcRenderer.invoke('brain:toggle-rule', id, enabled),
    getHeartbeat: () => ipcRenderer.invoke('brain:get-heartbeat'),
    setHeartbeat: (data) => ipcRenderer.invoke('brain:set-heartbeat', data),
    getUserProfile: () => ipcRenderer.invoke('brain:get-user-profile'),
    setUserProfile: (data) => ipcRenderer.invoke('brain:set-user-profile', data),

    // System prompt
    buildSystemPrompt: (currentMessage, options) => ipcRenderer.invoke('brain:build-system-prompt', currentMessage, options),

    // Memory engine
    extractMemories: (message) => ipcRenderer.invoke('brain:extract-memories', message),
    ingestMemories: (extracted) => ipcRenderer.invoke('brain:ingest-memories', extracted),
    deepExtract: (messages, apiKey) => ipcRenderer.invoke('brain:deep-extract', messages, apiKey),

    // Commitments
    getOverdueCommitments: () => ipcRenderer.invoke('brain:get-overdue-commitments'),
    completeCommitment: (id) => ipcRenderer.invoke('brain:complete-commitment', id),

    // Heartbeat
    heartbeat: () => ipcRenderer.invoke('brain:heartbeat'),

    // Knowledge engine
    smartRetrieve: (query, limit) => ipcRenderer.invoke('brain:smart-retrieve', query, limit),
    extractEntities: (text) => ipcRenderer.invoke('brain:extract-entities', text),
    linkMemoryEntities: (memoryId, content) => ipcRenderer.invoke('brain:link-memory-entities', memoryId, content),
    getRelatedEntities: (memoryId, depth) => ipcRenderer.invoke('brain:get-related-entities', memoryId, depth),
    detectTopic: (messages) => ipcRenderer.invoke('brain:detect-topic', messages),
    topicScopedRetrieve: (messages, query, limit) => ipcRenderer.invoke('brain:topic-scoped-retrieve', messages, query, limit),

    // Self-improvement
    createPrediction: (data) => ipcRenderer.invoke('brain:create-prediction', data),
    getPredictions: (status) => ipcRenderer.invoke('brain:get-predictions', status),
    resolvePrediction: (id, outcome, correct) => ipcRenderer.invoke('brain:resolve-prediction', id, outcome, correct),
    getCalibration: () => ipcRenderer.invoke('brain:get-calibration'),
    detectDrift: (messages) => ipcRenderer.invoke('brain:detect-drift', messages),
    detectCorrection: (userMsg, assistantMsg) => ipcRenderer.invoke('brain:detect-correction', userMsg, assistantMsg),
    learnFromCorrection: (correction) => ipcRenderer.invoke('brain:learn-from-correction', correction),

    // Sleep cycle
    runSleepCycle: () => ipcRenderer.invoke('brain:run-sleep-cycle'),

    // Agent loop
    agentLoop: (params) => ipcRenderer.invoke('brain:agent-loop', params),
    executeTool: (toolName, args) => ipcRenderer.invoke('brain:execute-tool', toolName, args),
  },

  // MCP
  mcp: {
    connect: (name, command, args, env) => ipcRenderer.invoke("mcp:connect", name, command, args, env),
    disconnect: (name) => ipcRenderer.invoke("mcp:disconnect", name),
    callTool: (serverName, toolName, args) => ipcRenderer.invoke("mcp:call-tool", serverName, toolName, args),
    listTools: () => ipcRenderer.invoke("mcp:list-tools"),
    listConnections: () => ipcRenderer.invoke("mcp:list-connections"),
  },
};

// ─── Expose APIs via contextBridge ──────────────────────────────────────────
// With contextIsolation: true, we must use contextBridge instead of directly
// assigning to window. This prevents renderer code from accessing Node/Electron APIs.
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
contextBridge.exposeInMainWorld("__TAURI_INTERNALS__", tauriInternals);
contextBridge.exposeInMainWorld("__TAURI__", tauriInternals);