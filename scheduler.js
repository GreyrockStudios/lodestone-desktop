// ─── Lodestone Scheduler ─────────────────────────────────────────────────
// Local cron-like scheduling for the desktop app.
// All tiers get local scheduling — no server dependency.
// Uses node-cron for expression parsing + persistent storage in SQLite.
// Friendly terminology for non-technical users.

const db = require("./db");
const { Notification } = require("electron");
const path = require("path");

// ─── Friendly Schedule Templates ──────────────────────────────────────────
// These map human-friendly concepts to cron expressions.

const SCHEDULE_PRESETS = {
  "every_minute":    { label: "Every minute",         cron: "* * * * *",       description: "Runs every single minute" },
  "every_5_minutes": { label: "Every 5 minutes",      cron: "*/5 * * * *",    description: "Runs every 5 minutes" },
  "every_15_minutes":{ label: "Every 15 minutes",     cron: "*/15 * * * *",   description: "Runs every 15 minutes" },
  "every_30_minutes":{ label: "Every 30 minutes",     cron: "*/30 * * * *",   description: "Runs every 30 minutes" },
  "hourly":         { label: "Every hour",            cron: "0 * * * *",       description: "Runs at the top of every hour" },
  "every_2_hours":   { label: "Every 2 hours",        cron: "0 */2 * * *",    description: "Runs every 2 hours" },
  "every_6_hours":   { label: "Every 6 hours",        cron: "0 */6 * * *",    description: "Runs every 6 hours" },
  "daily_morning":  { label: "Every morning",        cron: "0 8 * * *",      description: "Runs at 8:00 AM every day" },
  "daily_evening":  { label: "Every evening",         cron: "0 18 * * *",     description: "Runs at 6:00 PM every day" },
  "daily_noon":     { label: "Every day at noon",     cron: "0 12 * * *",    description: "Runs at 12:00 PM every day" },
  "weekly_monday":  { label: "Every Monday",          cron: "0 9 * * 1",      description: "Runs at 9:00 AM every Monday" },
  "weekly_friday":  { label: "Every Friday",          cron: "0 9 * * 5",      description: "Runs at 9:00 AM every Friday" },
  "monthly_first":  { label: "First of every month", cron: "0 9 1 * *",      description: "Runs at 9:00 AM on the 1st of each month" },
  "weekdays_9am":   { label: "Weekdays at 9 AM",     cron: "0 9 * * 1-5",    description: "Runs at 9:00 AM Monday through Friday" },
  "weekdays_5pm":   { label: "Weekdays at 5 PM",     cron: "0 17 * * 1-5",   description: "Runs at 5:00 PM Monday through Friday" },
  "weekends_10am":  { label: "Weekends at 10 AM",     cron: "0 10 * * 0,6",  description: "Runs at 10:00 AM on Saturday and Sunday" },
};

// ─── Task Types ────────────────────────────────────────────────────────────
// What a scheduled job can do when it fires.

const TASK_TYPES = {
  "reminder": {
    label: "🔔 Reminder",
    description: "Send me a notification",
    icon: "🔔",
  },
  "check_in": {
    label: "💬 Check-in",
    description: "Start a chat with me about something",
    icon: "💬",
  },
  "report": {
    label: "📊 Report",
    description: "Generate and show me a summary or report",
    icon: "📊",
  },
  "system_check": {
    label: "💻 System Check",
    description: "Check something on my computer and notify me",
    icon: "💻",
  },
};

// ─── Scheduler State ──────────────────────────────────────────────────────

let mainWindow = null;
let activeTimers = new Map(); // id → { timer, task }

// ─── Initialize ────────────────────────────────────────────────────────────
// Create the scheduled_tasks table and load all active tasks.

function initScheduler(window) {
  mainWindow = window;

  // Create table if not exists
  const d = db.getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL DEFAULT 'reminder',
      cron_expr TEXT NOT NULL,
      preset_id TEXT,
      message TEXT,
      is_active INTEGER DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      run_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next ON scheduled_tasks(next_run);
  `);

  // Load and start all active tasks
  const tasks = d.prepare("SELECT * FROM scheduled_tasks WHERE is_active = 1").all();
  for (const task of tasks) {
    scheduleTask(task);
  }

  // Recover missed tasks: if a task's next_run is in the past, fire it
  const now = new Date();
  let recoveredCount = 0;
  for (const task of tasks) {
    if (task.next_run) {
      const nextRun = new Date(task.next_run);
      // If next_run was more than 5 minutes ago, we missed it
      if (nextRun.getTime() < now.getTime() - 5 * 60 * 1000) {
        console.log(`[Lodestone] Recovering missed task: ${task.name} (was due at ${task.next_run})`);
        // Only recover if we haven't already run it recently
        if (!task.last_run || new Date(task.last_run).getTime() < nextRun.getTime()) {
          fireTask(task);
          recoveredCount++;
        }
      }
    }
  }

  console.log(`[Lodestone] Scheduler initialized with ${tasks.length} active tasks${recoveredCount > 0 ? `, recovered ${recoveredCount} missed tasks` : ''}`);
}

// ─── Simple cron matcher ─────────────────────────────────────────────────
// We don't need a full cron parser. Instead, we check every minute
// whether the current time matches the cron expression.

function matchesCron(cronExpr, date) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const dMinute = date.getMinutes();
  const dHour = date.getHours();
  const dDayOfMonth = date.getDate();
  const dMonth = date.getMonth() + 1; // JS months are 0-based
  const dDayOfWeek = date.getDay(); // 0 = Sunday

  function matches(field, value) {
    if (field === "*") return true;
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2));
      return value % step === 0;
    }
    if (field.includes(",")) {
      return field.split(",").some(f => matches(f, value));
    }
    if (field.includes("-")) {
      const [start, end] = field.split("-").map(Number);
      return value >= start && value <= end;
    }
    return parseInt(field) === value;
  }

  return matches(minute, dMinute) &&
         matches(hour, dHour) &&
         matches(dayOfMonth, dDayOfMonth) &&
         matches(month, dMonth) &&
         matches(dayOfWeek, dDayOfWeek);
}

// ─── Schedule a task ──────────────────────────────────────────────────────
// Checks every 30 seconds whether any task's cron expression matches now.

let schedulerInterval = null;

function startScheduler() {
  if (schedulerInterval) return;

  schedulerInterval = setInterval(() => {
    const now = new Date();
    // Only check on the minute mark (within 30s window)
    if (now.getSeconds() < 30) {
      checkAndFireTasks(now);
    }
  }, 30 * 1000); // Check every 30 seconds

  // Also check immediately
  checkAndFireTasks(new Date());
}

function checkAndFireTasks(now) {
  const d = db.getDb();
  const tasks = d.prepare("SELECT * FROM scheduled_tasks WHERE is_active = 1").all();

  for (const task of tasks) {
    if (matchesCron(task.cron_expr, now)) {
      // Don't re-fire if we already ran this minute
      const lastRun = task.last_run ? new Date(task.last_run) : null;
      if (lastRun && lastRun.getTime() > now.getTime() - 60000) {
        continue;
      }

      fireTask(task);
    }
  }
}

function scheduleTask(task) {
  // Store the task info for when it fires
  activeTimers.set(task.id, { task });
}

// ─── Fire a task ──────────────────────────────────────────────────────────

function fireTask(task) {
  const d = db.getDb();

  // Update last_run and run_count
  const now = new Date().toISOString();
  d.prepare("UPDATE scheduled_tasks SET last_run = ?, run_count = run_count + 1, updated_at = ? WHERE id = ?")
    .run(now, now, task.id);

  // Calculate next_run
  const nextRun = calculateNextRun(task.cron_expr);
  if (nextRun) {
    d.prepare("UPDATE scheduled_tasks SET next_run = ? WHERE id = ?")
      .run(nextRun.toISOString(), task.id);
  }

  console.log(`[Lodestone] Firing scheduled task: ${task.name} (${task.task_type})`);

  // Fire based on task type
  switch (task.task_type) {
    case "reminder":
      fireReminder(task);
      break;
    case "check_in":
      fireCheckIn(task);
      break;
    case "report":
      fireReport(task);
      break;
    case "system_check":
      fireSystemCheck(task);
      break;
    default:
      fireReminder(task);
  }
}

function fireReminder(task) {
  const notif = new Notification({
    title: `🔔 ${task.name}`,
    body: task.message || "Your scheduled reminder",
    icon: path.join(__dirname, "assets", "icon.png"),
    silent: false,
  });

  notif.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      // Navigate to chat with the reminder message
      mainWindow.webContents.executeJavaScript(`
        window.location.hash = '#/chat';
        // Inject the reminder as a new conversation prompt
        if (window.location.hash.includes('chat')) {
          const input = document.querySelector('textarea, input[type="text"]');
          if (input) {
            input.value = ${JSON.stringify(task.message || task.name)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      `).catch(() => {});
    }
  });

  notif.show();

  // Also save as a commitment in the local DB
  d = db.getDb();
  d.prepare("INSERT INTO commitments (id, content, status, source_conversation_id, created_at) VALUES (?, ?, 'pending', ?, ?)")
    .run(`sched_${task.id}_${Date.now()}`, task.message || task.name, task.id, new Date().toISOString());
}

function fireCheckIn(task) {
  // Show notification and auto-start a chat
  const notif = new Notification({
    title: `💬 Check-in: ${task.name}`,
    body: task.message || "Time to check in!",
    icon: path.join(__dirname, "assets", "icon.png"),
    silent: false,
  });

  notif.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.executeJavaScript(`
        window.location.hash = '#/chat';
        // Pre-fill the check-in message
        setTimeout(() => {
          const input = document.querySelector('textarea, input[type="text"]');
          if (input) {
            input.value = ${JSON.stringify(task.message || `Check-in: ${task.name}`)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 500);
      `).catch(() => {});
    }
  });

  notif.show();
}

function fireReport(task) {
  // Check if this is the brain morning brief
  let reportBody = task.message || "Your scheduled report is ready";
  let navigateTo = '#/chat';

  try {
    const proactive = require("./brain/proactive");
    if (task.id === "brain_morning_brief" || task.name === "Morning Brief") {
      reportBody = proactive.generateMorningBrief();
      navigateTo = '#/brain?tab=dashboard';
    }
  } catch (e) {
    // Brain not available, use default
  }

  const notif = new Notification({
    title: `📊 Report: ${task.name}`,
    body: reportBody,
    icon: path.join(__dirname, "assets", "icon.png"),
    silent: false,
  });

  notif.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.executeJavaScript(`
        window.location.hash = '${navigateTo}';
        setTimeout(() => {
          const input = document.querySelector('textarea, input[type="text"]');
          if (input) {
            input.value = ${JSON.stringify(`Show me my morning brief`)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 500);
      `).catch(() => {});
    }
  });

  notif.show();
}

function fireSystemCheck(task) {
  // Check if this is the commitment watchdog
  if (task.id === "brain_commitment_watchdog" || task.name === "Commitment Watchdog") {
    try {
      const proactive = require("./brain/proactive");
      const result = proactive.checkOverdueCommitments();
      // checkOverdueCommitments already shows notifications for overdue items
      // Nothing more to do — if there are no overdue items, result is null
      return;
    } catch (e) {
      // Brain not available, fall through to generic system check
    }
  }

  // Default system check
  const os = require("os");
  const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024);
  const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const memPercent = Math.round((1 - os.freemem() / os.totalmem()) * 100);
  const uptime = Math.round(os.uptime() / 3600);

  const notif = new Notification({
    title: `💻 System Check: ${task.name}`,
    body: `Memory: ${memPercent}% used (${freeMem}GB free of ${totalMem}GB) · Uptime: ${uptime}h`,
    icon: path.join(__dirname, "assets", "icon.png"),
    silent: false,
  });

  notif.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  notif.show();
}

// ─── Calculate next run time ──────────────────────────────────────────────

function calculateNextRun(cronExpr) {
  const now = new Date();
  // Start checking from the next minute
  const next = new Date(now.getTime() + 60000);
  next.setSeconds(0, 0);

  // Try up to 525600 minutes (1 year) to find next match
  for (let i = 0; i < 525600; i++) {
    if (matchesCron(cronExpr, next)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  return null; // No match found within a year
}

// ─── CRUD Operations ──────────────────────────────────────────────────────

function createTask({ name, description, task_type, cron_expr, preset_id, message }) {
  const d = db.getDb();
  const id = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const nextRun = calculateNextRun(cron_expr);

  d.prepare(`
    INSERT INTO scheduled_tasks (id, name, description, task_type, cron_expr, preset_id, message, next_run)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || null, task_type || "reminder", cron_expr, preset_id || null, message || null, nextRun ? nextRun.toISOString() : null);

  const task = d.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id);
  scheduleTask(task);
  return task;
}

function updateTask(id, updates) {
  const d = db.getDb();
  const fields = [];
  const values = [];
  const allowedFields = ["name", "description", "task_type", "cron_expr", "preset_id", "message", "is_active"];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return d.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id);

  // Recalculate next_run if cron_expr changed
  if (updates.cron_expr) {
    const nextRun = calculateNextRun(updates.cron_expr);
    fields.push("next_run = ?");
    values.push(nextRun ? nextRun.toISOString() : null);
  }

  values.push(id);
  d.prepare(`UPDATE scheduled_tasks SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);

  // Re-schedule if active
  const task = d.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id);
  if (task.is_active) {
    scheduleTask(task);
  } else {
    activeTimers.delete(id);
  }

  return task;
}

function deleteTask(id) {
  activeTimers.delete(id);
  return db.getDb().prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
}

function listTasks(filter = null) {
  const d = db.getDb();
  if (filter === "active") return d.prepare("SELECT * FROM scheduled_tasks WHERE is_active = 1 ORDER BY next_run ASC").all();
  if (filter === "inactive") return d.prepare("SELECT * FROM scheduled_tasks WHERE is_active = 0 ORDER BY created_at DESC").all();
  return d.prepare("SELECT * FROM scheduled_tasks ORDER BY is_active DESC, next_run ASC").all();
}

function getTask(id) {
  return db.getDb().prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id);
}

function pauseTask(id) {
  activeTimers.delete(id);
  const d = db.getDb();
  d.prepare("UPDATE scheduled_tasks SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  return d.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id);
}

function resumeTask(id) {
  const d = db.getDb();
  const task = d.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id);
  if (!task) return null;

  // Recalculate next_run
  const nextRun = calculateNextRun(task.cron_expr);
  d.prepare("UPDATE scheduled_tasks SET is_active = 1, next_run = ?, updated_at = datetime('now') WHERE id = ?")
    .run(nextRun ? nextRun.toISOString() : null, id);

  const updated = d.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id);
  scheduleTask(updated);
  return updated;
}

module.exports = {
  initScheduler,
  startScheduler,
  createTask,
  updateTask,
  deleteTask,
  listTasks,
  getTask,
  pauseTask,
  resumeTask,
  SCHEDULE_PRESETS,
  TASK_TYPES,
  calculateNextRun,
};