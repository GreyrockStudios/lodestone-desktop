// ─── Lodestone Brain — Sleep Cycle ─────────────────────────────────────────
// Nightly consolidation: promote staged memories, archive stale data,
// update heartbeat, clean up old conversations.
// Runs automatically (default 3am) via the scheduler.

const db = require("../db");

// ─── Consolidation ────────────────────────────────────────────────────────────

function runSleepCycle() {
  const database = db.getDb();
  const report = { promoted: 0, archived: 0, cleaned: 0, predictions_reviewed: 0 };

  // 1. Promote high-confidence staged memories
  const staged = database.prepare("SELECT * FROM staged_memories WHERE status = 'pending'").all();
  for (const mem of staged) {
    if (mem.importance >= 0.8) {
      // Auto-promote high-confidence memories
      database.prepare(`
        INSERT INTO memories (id, content, category, importance, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'auto_promoted', datetime('now'), datetime('now'))
      `).run(`mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, mem.content, mem.category, mem.importance);
      database.prepare("DELETE FROM staged_memories WHERE id = ?").run(mem.id);
      report.promoted++;
    } else if (mem.importance < 0.5) {
      // Discard very low-confidence
      database.prepare("UPDATE staged_memories SET status = 'rejected' WHERE id = ?").run(mem.id);
      report.archived++;
    }
  }

  // 2. Archive memories older than 90 days with low importance
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const stale = database.prepare(`
    SELECT id FROM memories 
    WHERE importance < 0.5 AND is_archived = 0 AND updated_at < ?
  `).all(ninetyDaysAgo);
  for (const mem of stale) {
    database.prepare("UPDATE memories SET is_archived = 1 WHERE id = ?").run(mem.id);
    report.archived++;
  }

  // 3. Deduplicate similar memories
  const allMemories = database.prepare("SELECT id, content, category FROM memories WHERE is_archived = 0").all();
  const toRemove = new Set();
  for (let i = 0; i < allMemories.length; i++) {
    if (toRemove.has(allMemories[i].id)) continue;
    for (let j = i + 1; j < allMemories.length; j++) {
      if (toRemove.has(allMemories[j].id)) continue;
      const similarity = jaccardSimilarity(allMemories[i].content, allMemories[j].content);
      if (similarity > 0.7) {
        // Keep the higher-importance one
        const impI = database.prepare("SELECT importance FROM memories WHERE id = ?").get(allMemories[i].id)?.importance || 0.5;
        const impJ = database.prepare("SELECT importance FROM memories WHERE id = ?").get(allMemories[j].id)?.importance || 0.5;
        const removeId = impI >= impJ ? allMemories[j].id : allMemories[i].id;
        toRemove.add(removeId);
        report.cleaned++;
      }
    }
  }
  for (const id of toRemove) {
    database.prepare("UPDATE memories SET is_archived = 1 WHERE id = ?").run(id);
  }

  // 4. Review overdue predictions
  const { checkOverduePredictions } = require("./self-improvement");
  const overdue = checkOverduePredictions();
  // Mark predictions that are more than 7 days overdue as expired
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  for (const pred of overdue) {
    if (pred.review_by < sevenDaysAgo) {
      database.prepare("UPDATE predictions SET status = 'expired' WHERE id = ?").run(pred.id);
      report.predictions_reviewed++;
    }
  }

  // 5. Update heartbeat with current state
  try {
    const { setHeartbeat, getHeartbeat } = require("./identity");
    const current = getHeartbeat();
    setHeartbeat({
      ...current,
      notes: current?.notes ? current.notes.replace(/⚠️.*overdue.*\n?/g, "") : "",
    });
  } catch (e) {
    // Heartbeat may not be set up yet
  }

  console.log(`[Brain Sleep Cycle] Promoted: ${report.promoted}, Archived: ${report.archived}, Cleaned: ${report.cleaned}, Predictions expired: ${report.predictions_reviewed}`);
  return report;
}

function jaccardSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

module.exports = { runSleepCycle };