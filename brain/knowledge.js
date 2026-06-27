// ─── Lodestone Brain — Knowledge Engine ─────────────────────────────────────
// Knowledge compounding: auto-extract entities, create edges, smart retrieve.
// Mirrors OpenClaw's wiki pattern but simpler — flat memories + relationships.

const db = require("../db");

// ─── Entity Extraction ────────────────────────────────────────────────────────
// Extracts named entities from text (people, projects, tools, concepts).
// Simple pattern matching — no NLP dependency needed for the local-first version.

const ENTITY_PATTERNS = {
  person: [
    /(?:my|our|the)\s+(wife|husband|partner|boss|colleague|friend|mom|dad|mother|father|sister|brother|son|daughter|team|client|developer|designer)\s+(\w+)/gi,
    /(?:told|spoke|talked|met|emailed|called|worked with)\s+(?:with|to)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    /@(\w+)/g, // @mentions
  ],
  project: [
    /(?:the|our|my)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:project|app|site|platform|system|service)/gi,
    /(?:working on|building|shipping|launching|deploying)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  ],
  tool: [
    /(?:using|with|in|on)\s+((?:React|Vue|Angular|Svelte|Next\.js|Astro|Tailwind|TypeScript|Python|Node|Docker|Kubernetes|AWS|GCP|Azure|Vercel|Netlify|Cloudflare|GitHub|GitLab|Figma|Notion|Slack|Discord))/gi,
  ],
  concept: [
    /(?:learning about|exploring|researching|studying)\s+([a-z]+(?:\s+[a-z]+){0,3})/gi,
  ],
};

function extractEntities(text) {
  const entities = [];
  const seen = new Set();

  for (const [type, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = (match[1] || match[0]).trim();
        if (name.length < 2 || name.length > 80) continue;
        const key = `${type}:${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entities.push({ name, type });
      }
    }
  }

  return entities;
}

// ─── Edge Creation ─────────────────────────────────────────────────────────────
// When a memory mentions an entity, create an edge (relationship) in the
// knowledge graph. This enables "show me everything about X" queries.

function linkMemoryToEntities(memoryId, memoryContent) {
  const database = db.getDb();
  const entities = extractEntities(memoryContent);

  for (const entity of entities) {
    // Find or create the entity as a memory node
    let entityId;
    const existing = database.prepare(
      "SELECT id FROM memories WHERE content LIKE ? AND category = ? LIMIT 1"
    ).get(`%${entity.name}%`, entity.type);

    if (existing) {
      entityId = existing.id;
    } else {
      // Create entity as a memory
      entityId = `entity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      database.prepare(`
        INSERT INTO memories (id, content, category, importance, source_type, created_at, updated_at)
        VALUES (?, ?, ?, 0.5, 'entity', datetime('now'), datetime('now'))
      `).run(entityId, entity.name, entity.type);
    }

    // Create edge
    try {
      database.prepare(`
        INSERT INTO memory_edges (source_id, target_id, relationship, strength, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(memoryId, entityId, `mentions_${entity.type}`, 0.6);
    } catch (e) {
      // Edge may already exist (UNIQUE constraint)
    }
  }

  return entities;
}

// ─── Smart Retrieve ────────────────────────────────────────────────────────────
// Ranks memories by: relevance to query * importance * recency * entity matches.
// This is the "recall" function that powers /recall and system prompt injection.

function smartRetrieve(query, limit = 10) {
  const database = db.getDb();

  // 1. Get candidate memories (importance-filtered)
  const candidates = database.prepare(`
    SELECT id, content, category, importance, source_type, created_at, updated_at
    FROM memories
    WHERE is_archived = 0
    ORDER BY importance DESC NULLS LAST, updated_at DESC
    LIMIT ?
  `).all(limit * 3);

  if (!query || query.length < 2) {
    return candidates.slice(0, limit);
  }

  // 2. Extract query entities
  const queryEntities = extractEntities(query);
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  // 3. Score each candidate
  const scored = candidates.map(mem => {
    let score = 0;

    // Text similarity (Jaccard on significant words)
    const memWords = new Set(mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const overlap = [...queryWords].filter(w => memWords.has(w)).length;
    const union = new Set([...queryWords, ...memWords]).size;
    const jaccard = union > 0 ? overlap / union : 0;
    score += jaccard * 30;

    // Category boost
    const categoryBoosts = { preference: 15, decision: 12, commitment: 10, person: 8, fact: 5 };
    score += categoryBoosts[mem.category] || 3;

    // Entity match boost
    const memEntities = extractEntities(mem.content);
    for (const qe of queryEntities) {
      if (memEntities.some(me => me.name.toLowerCase() === qe.name.toLowerCase() || me.type === qe.type)) {
        score += 20;
      }
    }

    // Importance weight
    score += (mem.importance || 0.5) * 15;

    // Recency boost
    const ageDays = (Date.now() - new Date(mem.updated_at || mem.created_at).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 10 - ageDays);

    // Edge boost (memories with more connections are more important)
    const edgeCount = database.prepare("SELECT COUNT(*) as count FROM memory_edges WHERE source_id = ? OR target_id = ?").get(mem.id, mem.id).count;
    score += Math.min(edgeCount * 2, 10);

    return { ...mem, score };
  });

  // 4. Sort by score and return top results
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ─── Knowledge Graph ──────────────────────────────────────────────────────────
// Get all entities connected to a given memory or entity.

function getRelatedEntities(memoryId, depth = 2) {
  const database = db.getDb();
  const visited = new Set();
  const results = [];
  const queue = [{ id: memoryId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth: currentDepth } = queue.shift();
    if (visited.has(id) || currentDepth > depth) continue;
    visited.add(id);

    // Get edges from this node
    const edges = database.prepare(
      "SELECT target_id, relationship, strength FROM memory_edges WHERE source_id = ?"
    ).all(id);

    for (const edge of edges) {
      if (!visited.has(edge.target_id)) {
        const targetMem = database.prepare("SELECT id, content, category FROM memories WHERE id = ?").get(edge.target_id);
        if (targetMem) {
          results.push({
            entity: targetMem,
            relationship: edge.relationship,
            strength: edge.strength,
            depth: currentDepth + 1,
          });
          queue.push({ id: edge.target_id, depth: currentDepth + 1 });
        }
      }
    }
  }

  return results;
}

module.exports = {
  extractEntities,
  linkMemoryToEntities,
  smartRetrieve,
  getRelatedEntities,
};