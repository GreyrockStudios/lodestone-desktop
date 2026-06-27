// ─── Lodestone Brain — Memory Engine ──────────────────────────────────────
// Extracts structured memories from conversation turns.
// Two-tier extraction: fast regex patterns (instant) + LLM review (background).
// Mirrors OpenClaw's memory extraction but runs locally.

const db = require("../db");

// ─── Extraction Patterns ──────────────────────────────────────────────────────
// Fast patterns that run instantly on every message (no LLM call needed).

const EXTRACTION_PATTERNS = {
  preference: [
    { regex: /i (?:prefer|like|love|enjoy|favor|appreciate|always)\s+(.{5,120})/gi, importance: 0.8 },
    { regex: /i (?:don't like|hate|dislike|can't stand|avoid|never)\s+(.{5,120})/gi, importance: 0.8 },
    { regex: /my favorite\s+(?:\w+\s+)?(?:is|are)\s+(.{3,80})/gi, importance: 0.85 },
    { regex: /i (?:usually|always|tend to|always use|prefer using)\s+(.{5,80})/gi, importance: 0.75 },
  ],
  commitment: [
    { regex: /i(?:'ll| will| need to| should| have to| must| plan to| going to| ought to)\s+(.{5,150})/gi, importance: 0.9 },
    { regex: /remind (?:me|us)?\s+(?:to\s+)?(.{5,150})/gi, importance: 0.95 },
    { regex: /(?:let's|lets)\s+(.{5,120})/gi, importance: 0.7 },
  ],
  decision: [
    { regex: /i(?:'ve| have)?(?: decided| chose| picked| selected| settled on| went with)\s+(.{5,150})/gi, importance: 0.85 },
    { regex: /(?:let's|lets) (?:go with|use|choose|pick)\s+(.{5,120})/gi, importance: 0.8 },
    { regex: /we(?:'re| are)? (?:going with|using|sticking with)\s+(.{5,120})/gi, importance: 0.85 },
  ],
  fact: [
    { regex: /remember\s+(?:that\s+)?(.+)/gi, importance: 0.95 },
    { regex: /fwiw[:\s]+(.{5,150})/gi, importance: 0.6 },
    { regex: /just so you know[:\s]+(.{5,150})/gi, importance: 0.6 },
  ],
  person: [
    { regex: /(?:my|our)\s+(wife|husband|partner|boss|colleague|friend|mom|dad|mother|father|sister|brother|son|daughter|team)\s+(.{0,80})/gi, importance: 0.7 },
    { regex: /(?:told|spoke|talked|met|emailed|called)\s+(?:with|to)\s+(\w+)\s*(.{0,60})?/gi, importance: 0.65 },
  ],
};

// ─── Fast Extractor (runs on every message, no LLM) ─────────────────────────

function extractFromMessage(message, source = "chat") {
  if (!message || message.length < 5) return [];

  const extracted = [];
  const seen = new Set();

  for (const [category, patterns] of Object.entries(EXTRACTION_PATTERNS)) {
    for (const { regex, importance } of patterns) {
      let match;
      // Reset regex lastIndex for global patterns
      regex.lastIndex = 0;
      while ((match = regex.exec(message)) !== null) {
        const content = match[0].charAt(0).toUpperCase() + match[0].slice(1);
        const key = content.toLowerCase().trim().substring(0, 60);

        // Deduplicate within this extraction
        if (seen.has(key) || content.length < 5 || content.length > 300) continue;
        seen.add(key);

        // Extract due date for commitments
        let dueDate = null;
        if (category === "commitment") {
          dueDate = extractDueDate(match[1] || match[0]);
        }

        extracted.push({
          content,
          category,
          importance,
          source,
          source_type: "auto",
          due_date: dueDate,
        });
      }
    }
  }

  return extracted.slice(0, 8); // Cap per message
}

function extractDueDate(text) {
  const lower = text.toLowerCase();
  if (/tomorrow/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (/next week/i.test(lower) || /in a week/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }
  const daysMatch = lower.match(/in (\d+) days?/i);
  if (daysMatch) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(daysMatch[1]));
    return d.toISOString().split("T")[0];
  }
  return null;
}

// ─── Deduplication ─────────────────────────────────────────────────────────────
// Jaccard similarity on significant words (>3 chars). Threshold: 0.5 overlap.

function isDuplicate(content, existingMemories, threshold = 0.5) {
  const wordsA = new Set(content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0) return false;

  for (const mem of existingMemories) {
    const wordsB = new Set(mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (wordsB.size === 0) continue;

    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity >= threshold) return true;
  }

  return false;
}

// ─── Ingest Extracted Memories ────────────────────────────────────────────────
// High-confidence memories go straight in. Low-confidence get staged for review.

function ingestMemories(extracted, confidenceThreshold = 0.8) {
  const database = db.getDb();
  const { linkMemoryToEntities } = require("./knowledge");

  // Get existing memories for dedup
  const existing = database.prepare("SELECT content FROM memories WHERE is_archived = 0").all();
  const staged = database.prepare("SELECT content FROM staged_memories WHERE status = 'pending'").all();
  const allExisting = [...existing, ...staged];

  let directCount = 0;
  let stagedCount = 0;

  for (const mem of extracted) {
    if (isDuplicate(mem.content, allExisting)) continue;

    if (mem.importance >= confidenceThreshold) {
      // High confidence — ingest directly
      database.prepare(`
        INSERT INTO memories (id, content, category, importance, source_type, source_conversation_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        mem.content,
        mem.category,
        mem.importance,
        mem.source_type,
        mem.source || null
      );
      directCount++;
      // Auto-link entities to this memory in the knowledge graph
      try { linkMemoryToEntities(id, mem.content); } catch (e) { /* non-critical */ }
    } else {
      // Lower confidence — stage for review
      try {
        database.prepare(`
          INSERT INTO staged_memories (id, user_id, content, category, importance, source, status, created_at)
          VALUES (?, 'local', ?, ?, ?, ?, 'pending', datetime('now'))
        `).run(
          `staged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          mem.content,
          mem.category,
          mem.importance,
          mem.source || "auto"
        );
        stagedCount++;
      } catch (e) {
        // Table may not exist in older schemas — skip staging
      }
    }

    // Also create commitment if due date found
    if (mem.due_date && mem.category === "commitment") {
      database.prepare(`
        INSERT INTO commitments (id, content, due_date, status, created_at, source_conversation_id)
        VALUES (?, ?, ?, 'pending', datetime('now'), ?)
      `).run(
        `commit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        mem.content,
        mem.due_date,
        mem.source || null
      );
    }
  }

  return { direct: directCount, staged: stagedCount };
}

// ─── LLM-Powered Deep Extraction (background, uses cheap model) ───────────────
// Runs after conversation turns to catch things regex misses.
// Only extracts high-value items: complex preferences, multi-step commitments, decisions.

async function deepExtract(conversationMessages, llmCaller, apiKey) {
  if (!llmCaller || !apiKey) return [];

  const conversationText = conversationMessages
    .slice(-6) // Last 3 turns (6 messages)
    .map(m => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(-3000); // Stay within context budget

  if (conversationText.length < 50) return [];

  const prompt = `You are a memory extraction agent. Analyze the conversation and extract facts worth remembering that were NOT already captured by simple pattern matching.

Focus on:
- Complex preferences (nuanced, multi-part)
- Important decisions and their reasoning
- Commitments with specific details
- Key facts about people, projects, or context
- Corrections ("actually, I meant..." or "no, I prefer...")

Conversation:
${conversationText}

Extract ONLY new, non-obvious facts. If nothing new is worth remembering, return empty arrays.

Respond in JSON only:
{"memories": [{"content": "fact", "category": "fact|preference|decision|commitment|person", "importance": 0.0-1.0}], "corrections": [{"original": "what was thought before", "corrected": "what is actually true"}]}`;

  try {
    const result = await llmCaller(
      "ollama",
      [{ role: "user", content: prompt }],
      "glm-5.1:cloud",
      apiKey,
      prompt
    );

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const memories = (parsed.memories || []).map(m => ({
      content: m.content,
      category: m.category || "fact",
      importance: m.importance || 0.7,
      source: "deep_extract",
      source_type: "auto",
    }));

    // Handle corrections — update existing memories
    if (parsed.corrections && parsed.corrections.length > 0) {
      const database = db.getDb();
      for (const correction of parsed.corrections) {
        // Find and update the closest matching memory
        const existing = database.prepare("SELECT id, content FROM memories WHERE is_archived = 0").all();
        for (const mem of existing) {
          const similarity = jaccardSimilarity(correction.original, mem.content);
          if (similarity > 0.4) {
            database.prepare("UPDATE memories SET content = ?, updated_at = datetime('now') WHERE id = ?")
              .run(correction.corrected, mem.id);
            break; // Only update the best match
          }
        }
      }
    }

    return memories;
  } catch (err) {
    console.error("[Brain] Deep extraction error:", err.message);
    return [];
  }
}

function jaccardSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Commitment Tracker ────────────────────────────────────────────────────────
// Check for overdue commitments and surface them.

function getOverdueCommitments() {
  const database = db.getDb();
  const now = new Date().toISOString();

  // Mark overdue
  database.prepare(`
    UPDATE commitments 
    SET status = 'overdue' 
    WHERE status = 'pending' AND due_date IS NOT NULL AND due_date < ?
  `).run(now);

  return database.prepare(`
    SELECT id, content, due_date, status, source_conversation_id 
    FROM commitments 
    WHERE status IN ('pending', 'overdue') 
    ORDER BY due_date ASC NULLS LAST
  `).all();
}

function completeCommitment(id) {
  const database = db.getDb();
  database.prepare("UPDATE commitments SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);
}

module.exports = {
  extractFromMessage,
  ingestMemories,
  deepExtract,
  isDuplicate,
  getOverdueCommitments,
  completeCommitment,
};