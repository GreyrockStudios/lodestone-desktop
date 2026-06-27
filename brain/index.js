// ─── Lodestone Brain ───────────────────────────────────────────────────────
// Main entry point. Initializes all brain modules, runs migrations,
// and exports the unified API for the desktop app to use.
//
// Architecture:
//   identity.js       → Layered system prompt (SOUL → IDENTITY → RULES → HEARTBEAT → USER → MEMORIES)
//   memory-engine.js  → Fast regex extraction + background LLM review + commitment tracking
//   agent-loop.js      → Multi-iteration tool-calling loop with context management
//
// This mirrors OpenClaw's architecture but runs locally in Electron.
// Cloud sync is optional — the brain works offline.

const db = require("../db");
const { migrateIdentityTables, buildSystemPrompt, ...identityApi } = require("./identity");
const memoryEngine = require("./memory-engine");
const { agentLoop, executeTool, TOOL_DEFINITIONS } = require("./agent-loop");

let initialized = false;

// ─── Initialize ────────────────────────────────────────────────────────────────
// Run migrations and set up tables. Call once on app startup.

function init() {
  if (initialized) return;

  const database = db.getDb();

  // Run identity table migrations
  migrateIdentityTables(database);

  // Ensure staged_memories table exists (for memory review queue)
  database.exec(`
    CREATE TABLE IF NOT EXISTS staged_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'local',
      content TEXT NOT NULL,
      category TEXT DEFAULT 'fact',
      importance REAL DEFAULT 0.7,
      source TEXT DEFAULT 'auto',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Ensure knowledge graph tables exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      strength REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id, relationship)
    );
    CREATE INDEX IF NOT EXISTS idx_edges_source ON memory_edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON memory_edges(target_id);
  `);

  // Ensure commitments table has all needed columns
  try {
    database.exec(`ALTER TABLE commitments ADD COLUMN source_conversation_id TEXT`);
  } catch (e) { /* Column already exists */ }

  initialized = true;
  console.log("[Brain] Initialized — identity, memory engine, agent loop ready");
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────
// Called on app start and periodically. Updates heartbeat with overdue commitments
// and current state. Mirrors OpenClaw's heartbeat pattern.

function heartbeat() {
  const database = db.getDb();
  const { getHeartbeat, setHeartbeat } = require("./identity");

  // Check overdue commitments
  const overdue = memoryEngine.getOverdueCommitments();
  const currentHeartbeat = getHeartbeat();

  let notes = currentHeartbeat?.notes || "";
  if (overdue.length > 0) {
    const overdueNote = `⚠️ ${overdue.length} overdue commitment(s)`;
    if (!notes.includes("overdue")) {
      notes = notes ? `${notes}\n${overdueNote}` : overdueNote;
    }
  }

  return {
    overdueCommitments: overdue,
    heartbeat: currentHeartbeat,
    memoryCount: database.prepare("SELECT COUNT(*) as count FROM memories WHERE is_archived = 0").get().count,
    commitmentCount: database.prepare("SELECT COUNT(*) as count FROM commitments WHERE status IN ('pending', 'overdue')").get().count,
    stagedCount: database.prepare("SELECT COUNT(*) as count FROM staged_memories WHERE status = 'pending'").get().count,
  };
}

// ─── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  init,
  heartbeat,
  // Identity
  buildSystemPrompt,
  ...identityApi,
  // Memory
  ...memoryEngine,
  // Agent
  agentLoop,
  executeTool,
  TOOL_DEFINITIONS,
};