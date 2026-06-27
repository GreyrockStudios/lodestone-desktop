// ─── Lodestone Brain — Proactive Intelligence ──────────────────────────────
// Scheduled tasks that make the agent proactive, not just reactive.
// Uses the existing scheduler.js for timing.
// Mirrors OpenClaw's heartbeat, watchdog, and morning brief patterns.

const { Notification } = require("electron");
const path = require("path");
const db = require("../db");
const brain = require("./index");

// ─── Morning Brief ────────────────────────────────────────────────────────────
// Generates a daily brief from heartbeat state + commitments + recent memories.
// Runs every morning at user-configured time (default 8am).

function generateMorningBrief() {
  const database = db.getDb();

  // Get heartbeat state
  const heartbeat = brain.getHeartbeat();

  // Get overdue commitments
  const overdueCommitments = brain.getOverdueCommitments();

  // Get recent memories (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentMemories = database.prepare(`
    SELECT content, category, importance FROM memories 
    WHERE is_archived = 0 AND updated_at > ? 
    ORDER BY importance DESC NULLS LAST, updated_at DESC LIMIT 10
  `).all(sevenDaysAgo);

  // Get pending commitments
  const pendingCommitments = database.prepare(`
    SELECT content, due_date, status FROM commitments 
    WHERE status = 'pending' 
    ORDER BY due_date ASC NULLS LAST LIMIT 5
  `).all();

  // Build brief
  const parts = [];

  if (heartbeat?.active_task) parts.push(`🎯 Active: ${heartbeat.active_task}`);
  if (heartbeat?.blockers) parts.push(`🚫 Blocked: ${heartbeat.blockers}`);
  if (heartbeat?.next_steps) parts.push(`➡️ Next: ${heartbeat.next_steps}`);

  if (overdueCommitments.length > 0) {
    parts.push(`\n⚠️ Overdue (${overdueCommitments.length}):`);
    overdueCommitments.slice(0, 3).forEach(c => parts.push(`  - ${c.content}${c.due_date ? ` (due ${c.due_date})` : ""}`));
  }

  if (pendingCommitments.length > 0) {
    parts.push(`\n📋 Upcoming (${pendingCommitments.length}):`);
    pendingCommitments.forEach(c => parts.push(`  - ${c.content}${c.due_date ? ` (due ${c.due_date})` : ""}`));
  }

  if (recentMemories.length > 0) {
    parts.push(`\n🧠 Recent memories:`);
    recentMemories.slice(0, 5).forEach(m => parts.push(`  - [${m.category}] ${m.content.substring(0, 80)}`));
  }

  if (parts.length === 0) {
    parts.push("Good morning! No active tasks or commitments. Ready when you are.");
  }

  return parts.join("\n");
}

// ─── Commitment Watchdog ───────────────────────────────────────────────────────
// Checks for overdue commitments and alerts the user.

function checkOverdueCommitments() {
  const overdue = brain.getOverdueCommitments();

  if (overdue.length === 0) return null;

  // Create notification for overdue items
  const newOverdue = overdue.filter(c => c.status === "overdue");

  if (newOverdue.length > 0) {
    const title = `⚠️ ${newOverdue.length} overdue commitment${newOverdue.length > 1 ? "s" : ""}`;
    const body = newOverdue.slice(0, 3).map(c => c.content.substring(0, 50)).join("\n");

    const notif = new Notification({
      title,
      body,
      icon: path.join(__dirname, "..", "assets", "icon.png"),
      silent: false,
    });

    notif.on("click", () => {
      // Signal the SPA to show commitments view
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.show();
        global.mainWindow.focus();
        global.mainWindow.webContents.executeJavaScript(
          `window.location.hash='#/brain?tab=commitments'`
        ).catch(() => {});
      }
    });

    notif.show();
  }

  return overdue;
}

// ─── Heartbeat Update ───────────────────────────────────────────────────────────
// Called periodically (every 30 min) to refresh heartbeat state.
// Checks: overdue commitments count, memory count, staged memory count.

function updateHeartbeat() {
  const hb = brain.heartbeat();
  // Return the dashboard data — the SPA can poll this via /api/brain/dashboard
  return hb;
}

// ─── Register Brain Scheduled Tasks ────────────────────────────────────────────
// Called from main.js after scheduler init.
// Creates default scheduled tasks if they don't exist.

function registerBrainTasks() {
  const database = db.getDb();

  // Morning Brief — 8am daily
  const existingBrief = database.prepare("SELECT id FROM scheduled_tasks WHERE name = ?").get("Morning Brief");
  if (!existingBrief) {
    database.prepare(`
      INSERT INTO scheduled_tasks (id, name, description, task_type, cron_expr, message, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(
      "brain_morning_brief",
      "Morning Brief",
      "Daily summary of active tasks, overdue commitments, and recent memories",
      "report",
      "0 8 * * *",
      "Generate morning brief from heartbeat, commitments, and memories"
    );
  }

  // Commitment Watchdog — every hour
  const existingWatchdog = database.prepare("SELECT id FROM scheduled_tasks WHERE name = ?").get("Commitment Watchdog");
  if (!existingWatchdog) {
    database.prepare(`
      INSERT INTO scheduled_tasks (id, name, description, task_type, cron_expr, message, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(
      "brain_commitment_watchdog",
      "Commitment Watchdog",
      "Check for overdue commitments and alert",
      "system_check",
      "0 * * * *",
      "Check overdue commitments"
    );
  }
}

module.exports = {
  generateMorningBrief,
  checkOverdueCommitments,
  updateHeartbeat,
  registerBrainTasks,
};