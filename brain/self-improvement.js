// ─── Lodestone Brain — Self-Improvement Engine ──────────────────────────────
// Prediction journal, drift detection, behavioral learning.
// Mirrors OpenClaw's self-improvement stack adapted for desktop-first operation.

const db = require("../db");

// ─── Prediction Journal ────────────────────────────────────────────────────────
// Track predictions and verify them over time. Builds calibration.

function createPrediction({ content, confidence, reviewBy, category = "general" }) {
  const database = db.getDb();
  const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  database.prepare(`
    INSERT INTO predictions (id, content, confidence, category, status, created_at, review_by)
    VALUES (?, ?, ?, ?, 'active', datetime('now'), ?)
  `).run(id, content, confidence, category, reviewBy || null);
  return database.prepare("SELECT * FROM predictions WHERE id = ?").get(id);
}

function getPredictions(status = "active") {
  const database = db.getDb();
  if (status === "all") {
    return database.prepare("SELECT * FROM predictions ORDER BY created_at DESC").all();
  }
  return database.prepare("SELECT * FROM predictions WHERE status = ? ORDER BY created_at DESC").all(status);
}

function resolvePrediction(id, outcome, correct) {
  const database = db.getDb();
  database.prepare(`
    UPDATE predictions SET status = ?, outcome = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(correct ? "correct" : "incorrect", outcome, id);
  return database.prepare("SELECT * FROM predictions WHERE id = ?").get(id);
}

function getCalibration() {
  const database = db.getDb();
  const predictions = database.prepare("SELECT confidence, status FROM predictions WHERE status IN ('correct', 'incorrect')").all();
  if (predictions.length === 0) return { total: 0, correct: 0, avgConfidence: 0, accuracy: 0, calibrated: false };

  const correct = predictions.filter(p => p.status === "correct").length;
  const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
  const accuracy = correct / predictions.length;
  const calibrated = Math.abs(avgConfidence - accuracy) < 0.1; // Within 10%

  return { total: predictions.length, correct, avgConfidence: Math.round(avgConfidence * 100) / 100, accuracy: Math.round(accuracy * 100) / 100, calibrated };
}

function checkOverduePredictions() {
  const database = db.getDb();
  const overdue = database.prepare(`
    SELECT * FROM predictions 
    WHERE status = 'active' AND review_by IS NOT NULL AND review_by < datetime('now')
  `).all();
  return overdue;
}

// ─── Drift Detection ──────────────────────────────────────────────────────────
// Compare stated identity (rules, soul) against actual behavior.
// Detects when the agent's responses drift from its principles.

function detectDrift(recentMessages = []) {
  const database = db.getDb();
  const issues = [];

  // Get active rules
  const rules = database.prepare("SELECT rule, category FROM identity_rules WHERE enabled = 1 ORDER BY priority DESC").all();
  if (rules.length === 0) return { issues: [], score: 0 };

  // Simple drift checks based on recent messages
  for (const rule of rules) {
    const ruleLower = rule.rule.toLowerCase();

    // Check for rule violations in recent assistant messages
    if (recentMessages.length > 0) {
      const assistantMessages = recentMessages.filter(m => m.role === "assistant");

      // "Never fabricate" rule — check for hedging language that might indicate uncertainty
      if (ruleLower.includes("fabricat") || ruleLower.includes("verify")) {
        const hedging = assistantMessages.some(m =>
          /i think|i believe|maybe|perhaps|probably|might be/i.test(m.content || "")
        );
        if (hedging && assistantMessages.length > 5) {
          issues.push({ rule: rule.rule, category: rule.category, issue: "frequent_hedging", severity: "low" });
        }
      }

      // "Ask before acting" rule — check for external actions taken without confirmation
      if (ruleLower.includes("ask") && ruleLower.includes("external")) {
        const actions = assistantMessages.some(m =>
          /i (sent|posted|published|deleted|emailed|tweeted)/i.test(m.content || "")
        );
        if (actions) {
          issues.push({ rule: rule.rule, category: rule.category, issue: "acted_without_asking", severity: "medium" });
        }
      }
    }
  }

  const score = issues.reduce((sum, i) => sum + (i.severity === "high" ? 3 : i.severity === "medium" ? 2 : 1), 0);
  return { issues, score, rulesChecked: rules.length };
}

// ─── Behavioral Learning ──────────────────────────────────────────────────────
// Detect when the user corrects the agent and extract rules from corrections.

function detectCorrection(userMessage, previousAssistantMessage) {
  if (!userMessage || !previousAssistantMessage) return null;

  const lower = userMessage.toLowerCase();
  const correctionPatterns = [
    /(?:actually|no[,!]?\s*|that's wrong|incorrect|you're wrong|not quite|close but|almost but)\s+(.{10,100})/i,
    /(?:i (?:don't|do not) want|i prefer|instead[, ]+)(.{10,100})/i,
    /(?:don't|do not|never|stop)\s+(.{5,80})/i,
  ];

  for (const pattern of correctionPatterns) {
    const match = lower.match(pattern);
    if (match) {
      return {
        correction: match[0],
        extracted_rule: match[1] || match[0],
        context: previousAssistantMessage.substring(0, 200),
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

function learnFromCorrection(correction) {
  if (!correction) return null;
  const database = db.getDb();

  // Add as a staged rule for user approval
  try {
    database.prepare(`
      INSERT INTO staged_memories (id, user_id, content, category, importance, source, status, created_at)
      VALUES (?, 'local', ?, 'decision', 0.85, 'correction', 'pending', datetime('now'))
    `).run(
      `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      `Learned rule: ${correction.extracted_rule}`,
    );
  } catch (e) {
    // Staged memories table may not exist in all versions
  }

  // Also store as a high-importance memory
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  database.prepare(`
    INSERT INTO memories (id, content, category, importance, source_type, created_at, updated_at)
    VALUES (?, ?, 'decision', 0.9, 'correction', datetime('now'), datetime('now'))
  `).run(id, `User correction: ${correction.extracted_rule} (context: ${correction.context.substring(0, 80)})`);

  return { id, rule: correction.extracted_rule };
}

// ─── Migration ──────────────────────────────────────────────────────────────────

function migrateSelfImprovement(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      confidence REAL NOT NULL,
      category TEXT DEFAULT 'general',
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'correct', 'incorrect', 'expired')),
      outcome TEXT,
      review_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
    CREATE INDEX IF NOT EXISTS idx_predictions_review ON predictions(review_by);
  `);
}

module.exports = {
  createPrediction,
  getPredictions,
  resolvePrediction,
  getCalibration,
  checkOverduePredictions,
  detectDrift,
  detectCorrection,
  learnFromCorrection,
  migrateSelfImprovement,
};