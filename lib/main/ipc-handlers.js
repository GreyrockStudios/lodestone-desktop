// ─── Lodestone Desktop — IPC Handlers ────────────────────────────────────────
// All ipcMain.handle() registrations, organized by domain.

const { ipcMain, app, dialog, Notification, shell, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const https = require("https");
const http = require("http");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");

const { isDev } = require("./constants");
const { getMainWindow, showWindow, setIsQuitting, store } = require("./window");
const brain = require("../../brain");
const scheduler = require("../../scheduler");

// ─── Badge, File, Version, System-Info ────────────────────────────────────────
function registerCoreHandlers() {
  ipcMain.handle("set-badge-count", (_e, count) => {
    const mainWindow = getMainWindow();
    if (process.platform === "darwin") app.dock.setBadge(count > 0 ? String(count) : "");
    else if (process.platform === "win32" && count > 0 && mainWindow) { mainWindow.flashFrame(true); setTimeout(() => mainWindow && mainWindow.flashFrame(false), 3000); }
    return true;
  });

  ipcMain.handle("save-file", async (_e, content, filename, filters) => {
    const mainWindow = getMainWindow();
    const opts = { defaultPath: filename };
    if (filters && Array.isArray(filters)) opts.filters = filters.map((f) => ({ name: f.name, extensions: f.extensions }));
    const result = await dialog.showSaveDialog(mainWindow, opts);
    if (result.canceled || !result.filePath) return null;
    await fs.promises.writeFile(result.filePath, content, "utf-8");
    return result.filePath;
  });

  ipcMain.handle("read-file", async (_e, filePath) => await fs.promises.readFile(filePath, "utf-8"));

  ipcMain.handle("get-version", () => app.getVersion());

  ipcMain.handle("get-system-info", () => ({ os: process.platform, arch: process.arch, version: app.getVersion() }));
}

// ─── Notifications ─────────────────────────────────────────────────────────────
function registerNotificationHandlers() {
  ipcMain.handle("send-notification", (_e, { title, body, icon, clickAction } = {}) => {
    if (!Notification.isSupported()) return false;
    const notif = new Notification({
      title: title || "Lodestone",
      body: body || "",
      icon: icon ? path.join(__dirname, "..", "..", "assets", icon) : path.join(__dirname, "..", "..", "assets", "icon.png"),
      silent: false,
    });
    if (clickAction) {
      notif.on("click", () => {
        showWindow();
        const mainWindow = getMainWindow();
        if (clickAction.startsWith("#/")) mainWindow.webContents.executeJavaScript(`window.location.hash='${clickAction.replace("#/", "")}'`).catch(() => {});
        else if (clickAction.startsWith("http")) shell.openExternal(clickAction);
      });
    } else {
      notif.on("click", () => showWindow());
    }
    notif.show();
    return true;
  });

  ipcMain.handle("check-notification-permission", () => {
    if (process.platform === "darwin") {
      try {
        if (!Notification.isSupported()) return "denied";
        return "granted";
      } catch { return "not-determined"; }
    }
    return Notification.isSupported() ? "granted" : "denied";
  });

  ipcMain.handle("request-notification-permission", () => {
    if (!Notification.isSupported()) return "denied";
    const testNotif = new Notification({ title: "Lodestone", body: "Notifications enabled! You'll get reminders here." });
    testNotif.on("click", () => showWindow());
    testNotif.show();
    return "granted";
  });
}

// ─── Auto-Update ──────────────────────────────────────────────────────────────
function registerUpdateHandlers() {
  autoUpdater.on("update-available", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.executeJavaScript("document.dispatchEvent(new CustomEvent('update-available'))").catch(() => {});
  });

  autoUpdater.on("update-downloaded", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed())
      dialog.showMessageBox(mainWindow, { type: "info", title: "Update Available", message: "A new version of Lodestone is available.", detail: "It will be installed when you restart the app.", buttons: ["Restart Now", "Later"] }).then(({ response }) => {
        if (response === 0) {
          setIsQuitting(true);
          // Destroy all windows first to ensure clean exit on macOS
          BrowserWindow.getAllWindows().forEach(w => { if (!w.isDestroyed()) w.destroy(); });
          autoUpdater.quitAndInstall();
        }
      });
  });

  ipcMain.handle("check-for-updates", () => { if (isDev) return { update_available: false }; autoUpdater.checkForUpdates(); return { checking: true }; });
}

// ─── Database CRUD ────────────────────────────────────────────────────────────
// Local database for Community tier — conversations, messages, memories, commitments.
function registerDbHandlers(db) {
  // Conversations
  ipcMain.handle("db:list-conversations", (_e, opts) => db.listConversations(opts?.folderId, opts?.includeArchived));
  ipcMain.handle("db:get-conversation", (_e, id) => db.getConversation(id));
  ipcMain.handle("db:create-conversation", (_e, data) => db.createConversation(data || {}));
  ipcMain.handle("db:update-conversation", (_e, id, data) => db.updateConversation(id, data));
  ipcMain.handle("db:delete-conversation", (_e, id) => db.deleteConversation(id));

  // Messages
  ipcMain.handle("db:get-messages", (_e, conversationId, limit, offset) => db.getMessages(conversationId, limit, offset));
  ipcMain.handle("db:add-message", (_e, data) => db.addMessage(data));

  // Memories
  ipcMain.handle("db:list-memories", (_e, opts) => db.listMemories(opts || {}));
  ipcMain.handle("db:get-memory", (_e, id) => db.getMemory(id));
  ipcMain.handle("db:create-memory", (_e, data) => db.createMemory(data));
  ipcMain.handle("db:delete-memory", (_e, id) => db.deleteMemory(id));

  // Commitments
  ipcMain.handle("db:list-commitments", (_e, status) => db.listCommitments(status));
  ipcMain.handle("db:create-commitment", (_e, data) => db.createCommitment(data));
  ipcMain.handle("db:update-commitment", (_e, id, data) => db.updateCommitment(id, data));
  ipcMain.handle("db:delete-commitment", (_e, id) => db.deleteCommitment(id));

  // Settings
  ipcMain.handle("db:get-setting", (_e, key) => db.getSetting(key));
  ipcMain.handle("db:set-setting", (_e, key, value) => db.setSetting(key, value));

  // Folders
  ipcMain.handle("db:list-folders", () => db.listFolders());
  ipcMain.handle("db:create-folder", (_e, data) => db.createFolder(data));
  ipcMain.handle("db:delete-folder", (_e, id) => db.deleteFolder(id));

  // Artifacts (canvas persistence)
  ipcMain.handle("db:list-artifacts", (_e, conversationId) => db.listArtifacts(conversationId));
  ipcMain.handle("db:get-artifact", (_e, id) => db.getArtifact(id));
  ipcMain.handle("db:create-artifact", (_e, data) => db.createArtifact(data));
  ipcMain.handle("db:update-artifact", (_e, id, data) => db.updateArtifact(id, data));
  ipcMain.handle("db:delete-artifact", (_e, id) => db.deleteArtifact(id));
  ipcMain.handle("db:pin-artifact", (_e, id, pinned) => db.pinArtifact(id, pinned));

  // Stats & Export
  ipcMain.handle("db:get-stats", () => db.getStats());
  ipcMain.handle("db:export-all", () => db.exportAll());
  ipcMain.handle("db:import-all", (_e, data) => db.importAll(data));

  // Tier Detection — DB path
  ipcMain.handle("db:get-db-path", () => path.join(os.homedir(), ".lodestone", "local.db"));
}

// ─── Brain Module ─────────────────────────────────────────────────────────────
function registerBrainHandlers() {
  // Identity
  ipcMain.handle("brain:get-soul", () => brain.getSoul());
  ipcMain.handle("brain:set-soul", (_e, content) => brain.setSoul(content));
  ipcMain.handle("brain:get-identity", () => brain.getIdentity());
  ipcMain.handle("brain:set-identity", (_e, data) => brain.setIdentity(data));
  ipcMain.handle("brain:get-rules", () => brain.getRules());
  ipcMain.handle("brain:add-rule", (_e, rule, category, priority) => brain.addRule(rule, category, priority));
  ipcMain.handle("brain:remove-rule", (_e, id) => brain.removeRule(id));
  ipcMain.handle("brain:toggle-rule", (_e, id, enabled) => brain.toggleRule(id, enabled));
  ipcMain.handle("brain:get-heartbeat", () => brain.getHeartbeat());
  ipcMain.handle("brain:set-heartbeat", (_e, data) => brain.setHeartbeat(data));
  ipcMain.handle("brain:get-user-profile", () => brain.getUserProfile());
  ipcMain.handle("brain:set-user-profile", (_e, data) => brain.setUserProfile(data));

  // System prompt
  ipcMain.handle("brain:build-system-prompt", async (_e, currentMessage, options) => {
    return brain.buildSystemPrompt(null, currentMessage || "", options || {});
  });

  // Memory engine
  ipcMain.handle("brain:extract-memories", (_e, message) => brain.extractFromMessage(message));
  ipcMain.handle("brain:ingest-memories", (_e, extracted) => brain.ingestMemories(extracted));
  ipcMain.handle("brain:deep-extract", async (_e, messages, apiKey) => brain.deepExtract(messages, null, apiKey));

  // Commitments
  ipcMain.handle("brain:get-overdue-commitments", () => brain.getOverdueCommitments());
  ipcMain.handle("brain:complete-commitment", (_e, id) => brain.completeCommitment(id));

  // Heartbeat
  ipcMain.handle("brain:heartbeat", () => brain.heartbeat());

  // Knowledge engine
  ipcMain.handle("brain:smart-retrieve", (_e, query, limit) => brain.smartRetrieve(query, limit));
  ipcMain.handle("brain:extract-entities", (_e, text) => brain.extractEntities(text));
  ipcMain.handle("brain:link-memory-entities", (_e, memoryId, content) => brain.linkMemoryToEntities(memoryId, content));
  ipcMain.handle("brain:get-related-entities", (_e, memoryId, depth) => brain.getRelatedEntities(memoryId, depth));
  ipcMain.handle("brain:topic-scoped-retrieve", (_e, messages, query, limit) => { const { detectTopic, topicScopedRetrieve } = require("../../brain/topic-engine"); const topic = detectTopic(messages); return topicScopedRetrieve(topic, query, limit); });

  // Self-improvement
  ipcMain.handle("brain:create-prediction", (_e, data) => brain.createPrediction(data));
  ipcMain.handle("brain:get-predictions", (_e, status) => brain.getPredictions(status));
  ipcMain.handle("brain:resolve-prediction", (_e, id, outcome, correct) => brain.resolvePrediction(id, outcome, correct));
  ipcMain.handle("brain:get-calibration", () => brain.getCalibration());
  ipcMain.handle("brain:detect-drift", (_e, messages) => brain.detectDrift(messages));
  ipcMain.handle("brain:detect-correction", (_e, userMsg, assistantMsg) => brain.detectCorrection(userMsg, assistantMsg));
  ipcMain.handle("brain:learn-from-correction", (_e, correction) => brain.learnFromCorrection(correction));

  // Sleep cycle
  ipcMain.handle("brain:run-sleep-cycle", () => brain.runSleepCycle());

  // Agent loop
  ipcMain.handle("brain:agent-loop", async (_e, params) => {
    const { messages, userMessage, conversationId } = params;
    const systemPrompt = await brain.buildSystemPrompt(null, userMessage || "");
    return {
      systemPrompt,
      tools: brain.TOOL_DEFINITIONS,
      maxIterations: 5,
    };
  });

  // Tool execution
  ipcMain.handle("brain:execute-tool", async (_e, toolName, args) => {
    const mainWindow = getMainWindow();
    return brain.executeTool(toolName, args, {
      getSystemInfo: () => mainWindow.webContents.executeJavaScript('window.electronAPI?.getSystemInfo?.() || null').catch(() => null),
      readFile: (filePath) => mainWindow.webContents.executeJavaScript(`window.electronAPI?.readFile?.(${JSON.stringify(filePath)}) || null`).catch(() => null),
      writeFile: (filePath, content) => mainWindow.webContents.executeJavaScript(`window.electronAPI?.saveFile?.(${JSON.stringify(content)}, ${JSON.stringify(filePath)})`).catch(() => null),
      searchFiles: (dir, pattern) => mainWindow.webContents.executeJavaScript(`window.electronAPI?.tools?.searchFiles?.(${JSON.stringify(dir)}, ${JSON.stringify(pattern)}) || []`).catch(() => []),
      conversationId: args?._conversationId,
    });
  });
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
function registerSchedulerHandlers() {
  ipcMain.handle("scheduler:list-presets", () => {
    return Object.entries(scheduler.SCHEDULE_PRESETS).map(([id, p]) => ({ id, ...p }));
  });

  ipcMain.handle("scheduler:list-task-types", () => {
    return Object.entries(scheduler.TASK_TYPES).map(([id, t]) => ({ id, ...t }));
  });

  ipcMain.handle("scheduler:list", (_e, filter) => scheduler.listTasks(filter));
  ipcMain.handle("scheduler:get", (_e, id) => scheduler.getTask(id));

  ipcMain.handle("scheduler:create", (_e, task) => {
    if (task.preset_id && !task.cron_expr) {
      const preset = scheduler.SCHEDULE_PRESETS[task.preset_id];
      if (preset) task.cron_expr = preset.cron;
    }
    if (!task.cron_expr) task.cron_expr = "0 9 * * *";
    return scheduler.createTask(task);
  });

  ipcMain.handle("scheduler:update", (_e, id, updates) => scheduler.updateTask(id, updates));
  ipcMain.handle("scheduler:delete", (_e, id) => scheduler.deleteTask(id));
  ipcMain.handle("scheduler:pause", (_e, id) => scheduler.pauseTask(id));
  ipcMain.handle("scheduler:resume", (_e, id) => scheduler.resumeTask(id));
  ipcMain.handle("scheduler:next-run", (_e, cronExpr) => {
    const next = scheduler.calculateNextRun(cronExpr);
    return next ? next.toISOString() : null;
  });
}

// ─── Ollama Models ────────────────────────────────────────────────────────────
function registerOllamaHandlers(storeInstance) {
  ipcMain.handle("ollama-list-models", async () => {
    const ollamaUrl = storeInstance.get("ollama_url", "http://localhost:11434");
    const url = new URL("/api/tags", ollamaUrl);
    const client = url.protocol === "https:" ? https : http;
    return new Promise((resolve) => {
      const req = client.get(url, { timeout: 5000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve((parsed.models || []).map(m => ({
              name: m.name, size: m.size, modified: m.modified_at, quantization: m.details?.quantization_level,
            })));
          } catch { resolve([]); }
        });
      });
      req.on("error", () => resolve([]));
      req.on("timeout", () => { req.destroy(); resolve([]); });
    });
  });

  ipcMain.handle("ollama-check", async () => {
    const ollamaUrl = storeInstance.get("ollama_url", "http://localhost:11434");
    const url = new URL("/api/version", ollamaUrl);
    const client = url.protocol === "https:" ? https : http;
    return new Promise((resolve) => {
      const req = client.get(url, { timeout: 3000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          try { resolve({ available: true, version: JSON.parse(data).version }); }
          catch { resolve({ available: true }); }
        });
      });
      req.on("error", () => resolve({ available: false }));
      req.on("timeout", () => { req.destroy(); resolve({ available: false }); });
    });
  });

  ipcMain.handle("ollama-set-url", (_e, url) => {
    storeInstance.set("ollama_url", url);
    return true;
  });
}

// ─── Code Execution (sandboxed) ──────────────────────────────────────────────
function registerCodeExecutionHandlers() {
  ipcMain.handle("execute-code", async (_e, language, code, timeout = 10) => {
    const timeoutMs = Math.min((timeout || 10) * 1000, 30000);
    const tmpDir = path.join(os.tmpdir(), "lodestone-exec");
    fs.mkdirSync(tmpDir, { recursive: true });

    if (language === "python") {
      const scriptPath = path.join(tmpDir, `exec-${Date.now()}.py`);
      fs.writeFileSync(scriptPath, code);
      try {
        const result = await new Promise((resolve, reject) => {
          const proc = execFile("python3", [scriptPath], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            fs.unlink(scriptPath, () => {});
            if (err) reject(new Error(stderr || err.message));
            else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
          });
          proc.on("error", reject);
        });
        return { output: result.stdout, error: result.stderr || null, exitCode: 0 };
      } catch (err) {
        return { output: "", error: err.message, exitCode: 1 };
      }
    } else if (language === "javascript") {
      try {
        const fn = new Function(`"use strict"; const console = { log: (...a) => a.join(' '), error: (...a) => a.join(' ') }; return (function() { ${code} })();`);
        const result = fn();
        return { output: String(result), error: null, exitCode: 0 };
      } catch (err) {
        return { output: "", error: err.message, exitCode: 1 };
      }
    }
    return { output: "", error: `Unsupported language: ${language}`, exitCode: 1 };
  });
}

// ─── Register All ─────────────────────────────────────────────────────────────
function registerAll(db) {
  registerCoreHandlers();
  registerNotificationHandlers();
  registerUpdateHandlers();
  registerDbHandlers(db);
  registerBrainHandlers();
  registerSchedulerHandlers();
  registerOllamaHandlers(store);
  registerCodeExecutionHandlers();
}

module.exports = {
  registerCoreHandlers,
  registerNotificationHandlers,
  registerUpdateHandlers,
  registerDbHandlers,
  registerBrainHandlers,
  registerSchedulerHandlers,
  registerOllamaHandlers,
  registerCodeExecutionHandlers,
  registerAll,
};