// ─── Lodestone Local Database ──────────────────────────────────────────────
// SQLite database for Community-tier local storage.
// Stores conversations, messages, memories, commitments, and settings locally.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const os = require("os");

const DB_DIR = path.join(os.homedir(), ".lodestone");
const DB_PATH = path.join(DB_DIR, "local.db");

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      model TEXT,
      provider TEXT,
      system_prompt TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      folder_id TEXT,
      is_archived INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      model TEXT,
      provider TEXT,
      tokens_used INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'fact',
      importance REAL DEFAULT 0.7,
      source_type TEXT DEFAULT 'manual',
      source_conversation_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS commitments (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','overdue')),
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      source_conversation_id TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);
    CREATE INDEX IF NOT EXISTS idx_conversations_folder ON conversations(folder_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT DEFAULT '',
      code TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      conversation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_conversation ON artifacts(conversation_id);

    -- FTS5 index for memory recall search
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, category, source_type, content='memories', content_rowid='rowid');

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, category, source_type) VALUES (new.rowid, new.content, new.category, new.source_type);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category, source_type) VALUES ('delete', old.rowid, old.content, old.category, old.source_type);
    END;

    CREATE TRIGGER IF NOT EXISTS conversations_updated AFTER UPDATE ON conversations BEGIN
      UPDATE conversations SET updated_at = datetime('now'), message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = NEW.id) WHERE id = NEW.id;
    END;
  `);
}

// ─── Conversations ──────────────────────────────────────────────────────────

function listConversations(folderId = null, includeArchived = false) {
  const d = getDb();
  let query = "SELECT * FROM conversations WHERE 1=1";
  const params = [];
  if (!includeArchived) { query += " AND is_archived = 0"; }
  if (folderId) { query += " AND folder_id = ?"; params.push(folderId); }
  else if (folderId === null) { query += " AND folder_id IS NULL"; }
  query += " ORDER BY updated_at DESC";
  return d.prepare(query).all(...params);
}

function getConversation(id) {
  return getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(id);
}

function createConversation({ id, title, model, provider, system_prompt, folder_id }) {
  const d = getDb();
  const convId = id || crypto.randomUUID();
  d.prepare("INSERT INTO conversations (id, title, model, provider, system_prompt, folder_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(convId, title || "New chat", model || null, provider || null, system_prompt || null, folder_id || null);
  return d.prepare("SELECT * FROM conversations WHERE id = ?").get(convId);
}

function updateConversation(id, updates) {
  const d = getDb();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (["title", "model", "provider", "system_prompt", "folder_id", "is_archived"].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return getConversation(id);
  values.push(id);
  d.prepare(`UPDATE conversations SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getConversation(id);
}

function deleteConversation(id) {
  return getDb().prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

// ─── Messages ────────────────────────────────────────────────────────────────

function getMessages(conversationId, limit = 100, offset = 0) {
  return getDb().prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?")
    .all(conversationId, limit, offset);
}

function addMessage({ id, conversation_id, role, content, model, provider, tokens_used }) {
  const d = getDb();
  const msgId = id || crypto.randomUUID();
  d.prepare("INSERT INTO messages (id, conversation_id, role, content, model, provider, tokens_used) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(msgId, conversation_id, role, content || "", model || null, provider || null, tokens_used || null);
  return d.prepare("SELECT * FROM messages WHERE id = ?").get(msgId);
}

// ─── Memories ────────────────────────────────────────────────────────────────

function listMemories({ category, search, limit = 100 } = {}) {
  const d = getDb();
  if (search) {
    return d.prepare("SELECT * FROM memories WHERE id IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?) ORDER BY updated_at DESC LIMIT ?")
      .all(search, limit);
  }
  let query = "SELECT * FROM memories WHERE is_archived = 0";
  const params = [];
  if (category) { query += " AND category = ?"; params.push(category); }
  query += " ORDER BY updated_at DESC LIMIT ?";
  params.push(limit);
  return d.prepare(query).all(...params);
}

function getMemory(id) {
  return getDb().prepare("SELECT * FROM memories WHERE id = ?").get(id);
}

function createMemory({ id, content, category, importance, source_type, source_conversation_id }) {
  const d = getDb();
  const memId = id || crypto.randomUUID();
  d.prepare("INSERT INTO memories (id, content, category, importance, source_type, source_conversation_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(memId, content, category || "fact", importance ?? 0.7, source_type || "manual", source_conversation_id || null);
  return d.prepare("SELECT * FROM memories WHERE id = ?").get(memId);
}

function deleteMemory(id) {
  return getDb().prepare("DELETE FROM memories WHERE id = ?").run(id);
}

// ─── Commitments ─────────────────────────────────────────────────────────────

function listCommitments(status = null) {
  const d = getDb();
  if (status) return d.prepare("SELECT * FROM commitments WHERE status = ? ORDER BY due_date ASC").all(status);
  return d.prepare("SELECT * FROM commitments ORDER BY due_date ASC").all();
}

function createCommitment({ id, content, due_date, status, source_conversation_id }) {
  const d = getDb();
  const comId = id || crypto.randomUUID();
  d.prepare("INSERT INTO commitments (id, content, due_date, status, source_conversation_id) VALUES (?, ?, ?, ?, ?)")
    .run(comId, content, due_date || null, status || "pending", source_conversation_id || null);
  return d.prepare("SELECT * FROM commitments WHERE id = ?").get(comId);
}

function updateCommitment(id, updates) {
  const d = getDb();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (["content", "due_date", "status", "completed_at"].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return d.prepare("SELECT * FROM commitments WHERE id = ?").get(id);
  values.push(id);
  d.prepare(`UPDATE commitments SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return d.prepare("SELECT * FROM commitments WHERE id = ?").get(id);
}

function deleteCommitment(id) {
  return getDb().prepare("DELETE FROM commitments WHERE id = ?").run(id);
}

// ─── Settings ────────────────────────────────────────────────────────────────

function getSetting(key) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  return value;
}

// ─── Folders ─────────────────────────────────────────────────────────────────

function listFolders() {
  return getDb().prepare("SELECT * FROM folders ORDER BY name ASC").all();
}

function createFolder({ id, name, parent_id }) {
  const d = getDb();
  const folderId = id || crypto.randomUUID();
  d.prepare("INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)")
    .run(folderId, name, parent_id || null);
  return d.prepare("SELECT * FROM folders WHERE id = ?").get(folderId);
}

function deleteFolder(id) {
  return getDb().prepare("DELETE FROM folders WHERE id = ?").run(id);
}

// ─── Graph (for memory visualization) ────────────────────────────────────────

function getMemoryGraph() {
  const d = getDb();
  const memories = d.prepare("SELECT id, content, category, importance, created_at FROM memories WHERE is_archived = 0").all();
  // Simple node list — no edges for now, edges can be computed client-side
  return { nodes: memories, edges: [] };
}

// ─── Artifacts ────────────────────────────────────────────────────────────────

function listArtifacts(conversationId) {
  const d = getDb();
  if (conversationId) return d.prepare("SELECT * FROM artifacts WHERE conversation_id = ? ORDER BY created_at DESC").all(conversationId);
  return d.prepare("SELECT * FROM artifacts ORDER BY created_at DESC").all();
}

function getArtifact(id) {
  return getDb().prepare("SELECT * FROM artifacts WHERE id = ?").get(id);
}

function createArtifact({ id, type, title, code, pinned, conversation_id }) {
  const d = getDb();
  const artId = id || crypto.randomUUID();
  d.prepare("INSERT INTO artifacts (id, type, title, code, pinned, conversation_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(artId, type, title || '', code, pinned ? 1 : 0, conversation_id || null);
  return d.prepare("SELECT * FROM artifacts WHERE id = ?").get(artId);
}

function updateArtifact(id, updates) {
  const d = getDb();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (["type", "title", "code", "pinned", "conversation_id"].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(key === "pinned" ? (value ? 1 : 0) : value);
    }
  }
  if (fields.length === 0) return getArtifact(id);
  values.push(id);
  d.prepare(`UPDATE artifacts SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  return getArtifact(id);
}

function deleteArtifact(id) {
  return getDb().prepare("DELETE FROM artifacts WHERE id = ?").run(id);
}

function pinArtifact(id, pinned) {
  const d = getDb();
  d.prepare("UPDATE artifacts SET pinned = ?, updated_at = datetime('now') WHERE id = ?").run(pinned ? 1 : 0, id);
  return getArtifact(id);
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function getStats() {
  const d = getDb();
  return {
    conversations: d.prepare("SELECT COUNT(*) as count FROM conversations").get().count,
    messages: d.prepare("SELECT COUNT(*) as count FROM messages").get().count,
    memories: d.prepare("SELECT COUNT(*) as count FROM memories WHERE is_archived = 0").get().count,
    commitments: d.prepare("SELECT COUNT(*) as count FROM commitments WHERE status = 'pending'").get().count,
  };
}

// ─── Export/Import (for backup/migration) ────────────────────────────────────

function exportAll() {
  const d = getDb();
  return {
    conversations: d.prepare("SELECT * FROM conversations").all(),
    messages: d.prepare("SELECT * FROM messages").all(),
    memories: d.prepare("SELECT * FROM memories WHERE is_archived = 0").all(),
    commitments: d.prepare("SELECT * FROM commitments").all(),
    settings: d.prepare("SELECT * FROM settings").all(),
    folders: d.prepare("SELECT * FROM folders").all(),
    artifacts: d.prepare("SELECT * FROM artifacts").all(),
  };
}

function importAll(data) {
  const d = getDb();
  const insertConv = d.prepare("INSERT OR REPLACE INTO conversations (id, title, model, provider, system_prompt, created_at, updated_at, folder_id, is_archived, message_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertMsg = d.prepare("INSERT OR REPLACE INTO messages (id, conversation_id, role, content, model, provider, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertMem = d.prepare("INSERT OR REPLACE INTO memories (id, content, category, importance, source_type, source_conversation_id, created_at, updated_at, is_archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertCom = d.prepare("INSERT OR REPLACE INTO commitments (id, content, due_date, status, created_at, completed_at, source_conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertSet = d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const insertFld = d.prepare("INSERT OR REPLACE INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)");
  const insertArt = d.prepare("INSERT OR REPLACE INTO artifacts (id, type, title, code, pinned, created_at, updated_at, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

  d.transaction(() => {
    for (const c of (data.conversations || [])) insertConv.run(c.id, c.title, c.model, c.provider, c.system_prompt, c.created_at, c.updated_at, c.folder_id, c.is_archived, c.message_count);
    for (const m of (data.messages || [])) insertMsg.run(m.id, m.conversation_id, m.role, m.content, m.model, m.provider, m.tokens_used, m.created_at);
    for (const m of (data.memories || [])) insertMem.run(m.id, m.content, m.category, m.importance, m.source_type, m.source_conversation_id, m.created_at, m.updated_at, m.is_archived);
    for (const c of (data.commitments || [])) insertCom.run(c.id, c.content, c.due_date, c.status, c.created_at, c.completed_at, c.source_conversation_id);
    for (const s of (data.settings || [])) insertSet.run(s.key, s.value);
    for (const f of (data.folders || [])) insertFld.run(f.id, f.name, f.parent_id, f.created_at);
    for (const a of (data.artifacts || [])) insertArt.run(a.id, a.type, a.title, a.code, a.pinned, a.created_at, a.updated_at, a.conversation_id);
  })();
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = {
  getDb, close,
  listConversations, getConversation, createConversation, updateConversation, deleteConversation,
  getMessages, addMessage,
  listMemories, getMemory, createMemory, deleteMemory,
  listCommitments, createCommitment, updateCommitment, deleteCommitment,
  getSetting, setSetting,
  listFolders, createFolder, deleteFolder,
  listArtifacts, getArtifact, createArtifact, updateArtifact, deleteArtifact, pinArtifact,
  getMemoryGraph, getStats,
  exportAll, importAll,
};