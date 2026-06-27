// ─── Lodestone Brain — Identity System ────────────────────────────────────
// Builds layered system prompts from local identity files, mirroring
// OpenClaw's SOUL → IDENTITY → RULES → HEARTBEAT pattern.
// All identity data stored in local SQLite — no server dependency.

const db = require("../db");

// ─── Identity Layers (priority order, highest first) ────────────────────────
// Each layer overrides or supplements the ones below it.
// This matches OpenClaw's startup context injection pattern.

const IDENTITY_LAYERS = {
  soul: {
    table: "identity_soul",
    label: "Soul",
    description: "Core personality — who the agent is, its voice, its values. The immutable core.",
    priority: 100,
    maxTokens: 2000,
  },
  identity: {
    table: "identity_identity",
    label: "Identity",
    description: "Facts about the agent — name, role, capabilities, creation date.",
    priority: 90,
    maxTokens: 1000,
  },
  rules: {
    table: "identity_rules",
    label: "Rules",
    description: "Behavioral rules — what the agent should and shouldn't do. Operating constraints.",
    priority: 80,
    maxTokens: 3000,
  },
  heartbeat: {
    table: "identity_heartbeat",
    label: "Heartbeat",
    description: "Current state — active tasks, blockers, next steps. Updated frequently.",
    priority: 70,
    maxTokens: 1500,
  },
  user_profile: {
    table: "identity_user_profile",
    label: "User Profile",
    description: "Facts about the user — preferences, communication style, context.",
    priority: 60,
    maxTokens: 1000,
  },
  memories: {
    table: "memories",
    label: "Memories",
    description: "Ranked memories injected based on relevance to current context.",
    priority: 50,
    maxTokens: 2000,
  },
};

// ─── Database Migration ─────────────────────────────────────────────────────

function migrateIdentityTables(database) {
  // Soul — single row per user, long-form text
  database.exec(`
    CREATE TABLE IF NOT EXISTS identity_soul (
      id TEXT PRIMARY KEY DEFAULT 'default',
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO identity_soul (id, content) VALUES ('default', '');
  `);

  // Identity — single row per user
  database.exec(`
    CREATE TABLE IF NOT EXISTS identity_identity (
      id TEXT PRIMARY KEY DEFAULT 'default',
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO identity_identity (id, name, role, description) VALUES ('default', '', '', '');
  `);

  // Rules — multiple rows, ordered
  database.exec(`
    CREATE TABLE IF NOT EXISTS identity_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Heartbeat — single row, frequently updated
  database.exec(`
    CREATE TABLE IF NOT EXISTS identity_heartbeat (
      id TEXT PRIMARY KEY DEFAULT 'default',
      active_task TEXT DEFAULT '',
      blockers TEXT DEFAULT '',
      next_steps TEXT DEFAULT '',
      services TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO identity_heartbeat (id) VALUES ('default');
  `);

  // User profile — single row per user
  database.exec(`
    CREATE TABLE IF NOT EXISTS identity_user_profile (
      id TEXT PRIMARY KEY DEFAULT 'default',
      name TEXT DEFAULT '',
      preferences TEXT DEFAULT '[]',
      communication_style TEXT DEFAULT '',
      timezone TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO identity_user_profile (id) VALUES ('default');
  `);
}

// ─── Build System Prompt ─────────────────────────────────────────────────────
// Constructs the full system prompt from identity layers + relevant memories.
// Mirrors OpenClaw's startup context injection: SOUL → IDENTITY → RULES → HEARTBEAT → USER → MEMORIES

async function buildSystemPrompt(userId = null, currentMessage = "", options = {}) {
  const database = db.getDb();
  const sections = [];
  const { smartRetrieve } = require("./knowledge");

  // 1. Soul — core personality
  const soul = database.prepare("SELECT content FROM identity_soul WHERE id = ?").get("default");
  if (soul?.content) {
    sections.push({ header: "Identity — Soul", content: soul.content, priority: IDENTITY_LAYERS.soul.priority });
  }

  // 2. Identity — name, role, description
  const identity = database.prepare("SELECT name, role, description FROM identity_identity WHERE id = ?").get("default");
  if (identity?.name || identity?.role || identity?.description) {
    const parts = [];
    if (identity.name) parts.push(`Name: ${identity.name}`);
    if (identity.role) parts.push(`Role: ${identity.role}`);
    if (identity.description) parts.push(identity.description);
    sections.push({ header: "Identity", content: parts.join("\n"), priority: IDENTITY_LAYERS.identity.priority });
  }

  // 3. Rules — behavioral constraints
  const rules = database.prepare("SELECT rule, category FROM identity_rules WHERE enabled = 1 ORDER BY priority DESC, id ASC").all();
  if (rules.length > 0) {
    const rulesText = rules.map(r => `- ${r.rule}`).join("\n");
    sections.push({ header: "Rules", content: rulesText, priority: IDENTITY_LAYERS.rules.priority });
  }

  // 4. Heartbeat — current state
  const heartbeat = database.prepare("SELECT active_task, blockers, next_steps, services, notes FROM identity_heartbeat WHERE id = ?").get("default");
  if (heartbeat) {
    const parts = [];
    if (heartbeat.active_task) parts.push(`Active: ${heartbeat.active_task}`);
    if (heartbeat.blockers) parts.push(`Blocked: ${heartbeat.blockers}`);
    if (heartbeat.next_steps) parts.push(`Next: ${heartbeat.next_steps}`);
    if (heartbeat.services) parts.push(`Services: ${heartbeat.services}`);
    if (heartbeat.notes) parts.push(heartbeat.notes);
    if (parts.length > 0) {
      sections.push({ header: "Current State", content: parts.join("\n"), priority: IDENTITY_LAYERS.heartbeat.priority });
    }
  }

  // 5. User profile — who the user is
  const profile = database.prepare("SELECT name, preferences, communication_style, timezone, notes FROM identity_user_profile WHERE id = ?").get("default");
  if (profile) {
    const parts = [];
    if (profile.name) parts.push(`User: ${profile.name}`);
    if (profile.timezone) parts.push(`Timezone: ${profile.timezone}`);
    if (profile.communication_style) parts.push(`Communication style: ${profile.communication_style}`);
    try {
      const prefs = JSON.parse(profile.preferences || "[]");
      if (prefs.length > 0) parts.push(`Preferences:\n${prefs.map(p => `- ${p}`).join("\n")}`);
    } catch {}
    if (profile.notes) parts.push(profile.notes);
    if (parts.length > 1) {
      sections.push({ header: "User Profile", content: parts.join("\n"), priority: IDENTITY_LAYERS.user_profile.priority });
    }
  }

  // 6. Relevant memories — smart-ranked by recency, importance, entity matches
  const memories = smartRetrieve(currentMessage, 15);
  if (memories.length > 0) {
    const memText = memories.map(m => `- [${m.category}] ${m.content} (importance: ${m.importance})`).join("\n");
    sections.push({ header: "Memories", content: memText, priority: IDENTITY_LAYERS.memories.priority });
  }

  // 7. Commitments — pending and overdue
  const commitments = database.prepare(`
    SELECT content, due_date, status FROM commitments 
    WHERE status IN ('pending', 'overdue') 
    ORDER BY due_date ASC NULLS LAST LIMIT 10
  `).all();
  if (commitments.length > 0) {
    const commitText = commitments.map(c => {
      const due = c.due_date ? ` (due: ${c.due_date})` : "";
      const status = c.status === "overdue" ? " ⚠️ OVERDUE" : "";
      return `- ${c.content}${due}${status}`;
    }).join("\n");
    sections.push({ header: "Active Commitments", content: commitText, priority: 55 });
  }

  // Sort by priority (highest first) and assemble
  sections.sort((a, b) => b.priority - a.priority);

  // Assemble with headers, respecting token budget
  const maxTotalTokens = options.maxTokens || 8000;
  let totalLength = 0;
  const assembled = [];

  for (const section of sections) {
    const header = `\n## ${section.header}\n`;
    const content = section.content + "\n";
    const sectionLength = header.length + content.length;
    // Rough token estimate: ~4 chars per token
    const sectionTokens = Math.ceil(sectionLength / 4);

    if (totalLength + sectionLength > maxTotalTokens * 4) {
      // Skip sections that exceed budget (lower priority ones first since sorted)
      continue;
    }

    assembled.push(header + content);
    totalLength += sectionLength;
  }

  return assembled.join("\n");
}

// ─── Memory Retrieval ────────────────────────────────────────────────────────
// Ranks memories by: importance * relevance_to_current_message * recency_decay

function getRelevantMemories(database, currentMessage = "", limit = 15) {
  // Base query: get top memories by importance
  let query = `
    SELECT id, content, category, importance, source_type, created_at, updated_at
    FROM memories
    WHERE is_archived = 0
    ORDER BY importance DESC NULLS LAST, updated_at DESC
    LIMIT ?
  `;
  const candidates = database.prepare(query).all(limit * 3); // Get more than needed, then rank

  if (candidates.length === 0) return [];

  // Score by relevance to current message
  if (!currentMessage || currentMessage.length < 3) {
    return candidates.slice(0, limit);
  }

  const msgWords = new Set(
    currentMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  );

  const scored = candidates.map(mem => {
    let relevanceScore = 0;

    // Word overlap score
    const memWords = new Set(
      mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );
    const overlap = [...msgWords].filter(w => memWords.has(w)).length;
    const union = new Set([...msgWords, ...memWords]).size;
    const jaccard = union > 0 ? overlap / union : 0;
    relevanceScore += jaccard * 40;

    // Category boost
    const categoryBoosts = {
      preference: 15,
      decision: 12,
      commitment: 10,
      fact: 5,
      person: 8,
    };
    relevanceScore += categoryBoosts[mem.category] || 0;

    // Recency boost (newer = higher score, decay over 30 days)
    const created = new Date(mem.created_at || mem.updated_at || Date.now());
    const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 10 - ageDays); // 10 points for today, decaying
    relevanceScore += recencyBoost;

    // Importance weight
    relevanceScore += (mem.importance || 0.5) * 20;

    return { ...mem, score: relevanceScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ─── Identity CRUD ────────────────────────────────────────────────────────────

function getSoul() {
  const database = db.getDb();
  return database.prepare("SELECT content, updated_at FROM identity_soul WHERE id = ?").get("default");
}

function setSoul(content) {
  const database = db.getDb();
  database.prepare("UPDATE identity_soul SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, "default");
  return getSoul();
}

function getIdentity() {
  const database = db.getDb();
  return database.prepare("SELECT name, role, description, updated_at FROM identity_identity WHERE id = ?").get("default");
}

function setIdentity({ name, role, description }) {
  const database = db.getDb();
  database.prepare("UPDATE identity_identity SET name = ?, role = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name || "", role || "", description || "", "default");
  return getIdentity();
}

function getRules() {
  const database = db.getDb();
  return database.prepare("SELECT id, rule, category, priority, enabled FROM identity_rules ORDER BY priority DESC, id ASC").all();
}

function addRule(rule, category = "general", priority = 0) {
  const database = db.getDb();
  // Deduplicate: don't add the same rule text twice
  const existing = database.prepare("SELECT id FROM identity_rules WHERE rule = ? AND category = ?").get(rule, category);
  if (existing) return existing.id;
  const result = database.prepare("INSERT INTO identity_rules (rule, category, priority) VALUES (?, ?, ?)").run(rule, category, priority);
  return result.lastInsertRowid;
}

function removeRule(id) {
  const database = db.getDb();
  database.prepare("DELETE FROM identity_rules WHERE id = ?").run(id);
}

function toggleRule(id, enabled) {
  const database = db.getDb();
  database.prepare("UPDATE identity_rules SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

function getHeartbeat() {
  const database = db.getDb();
  return database.prepare("SELECT active_task, blockers, next_steps, services, notes, updated_at FROM identity_heartbeat WHERE id = ?").get("default");
}

function setHeartbeat({ active_task, blockers, next_steps, services, notes }) {
  const database = db.getDb();
  database.prepare(`
    UPDATE identity_heartbeat 
    SET active_task = ?, blockers = ?, next_steps = ?, services = ?, notes = ?, updated_at = datetime('now') 
    WHERE id = ?
  `).run(active_task || "", blockers || "", next_steps || "", services || "", notes || "", "default");
  return getHeartbeat();
}

function getUserProfile() {
  const database = db.getDb();
  return database.prepare("SELECT name, preferences, communication_style, timezone, notes, updated_at FROM identity_user_profile WHERE id = ?").get("default");
}

function setUserProfile({ name, preferences, communication_style, timezone, notes }) {
  const database = db.getDb();
  const prefsJson = Array.isArray(preferences) ? JSON.stringify(preferences) : preferences || "[]";
  database.prepare(`
    UPDATE identity_user_profile 
    SET name = ?, preferences = ?, communication_style = ?, timezone = ?, notes = ?, updated_at = datetime('now') 
    WHERE id = ?
  `).run(name || "", prefsJson, communication_style || "", timezone || "", notes || "", "default");
  return getUserProfile();
}

module.exports = {
  IDENTITY_LAYERS,
  migrateIdentityTables,
  buildSystemPrompt,
  getRelevantMemories,
  // CRUD
  getSoul, setSoul,
  getIdentity, setIdentity,
  getRules, addRule, removeRule, toggleRule,
  getHeartbeat, setHeartbeat,
  getUserProfile, setUserProfile,
};