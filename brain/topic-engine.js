// ─── Lodestone Brain — Topic Engine ────────────────────────────────────────
// Detects the current conversation topic and scopes memory retrieval.
// Invisible to the user — the brain quietly shifts context as topics change.
// No UI needed. The agent just "follows" the conversation naturally.

const { extractEntities, smartRetrieve } = require("./knowledge");
const db = require("../db");

// ─── Topic Detection ────────────────────────────────────────────────────────
// Analyzes recent messages to detect the active topic.
// Returns a topic object: { name, entities, confidence } or null.

function detectTopic(messages, options = {}) {
  if (!messages || messages.length === 0) return null;

  const { maxMessages = 6, minConfidence = 0.3 } = options;

  // Take last N messages for context
  const recent = messages.slice(-maxMessages);
  const text = recent
    .filter(m => m.role === "user")
    .map(m => m.content)
    .join(" ");

  if (text.length < 10) return null;

  // Extract entities from recent messages
  const entities = extractEntities(text);

  // Count word frequency (significant words only)
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  // Find dominant words (appear 2+ times)
  const dominantWords = Object.entries(freq)
    .filter(([_, count]) => count >= 2)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);

  // Determine topic name
  // Priority: entity name > dominant word > null
  const projectEntities = entities.filter(e => e.type === "project");
  const personEntities = entities.filter(e => e.type === "person");
  const toolEntities = entities.filter(e => e.type === "tool");

  let topicName = null;
  let topicType = null;
  let confidence = 0;

  if (projectEntities.length > 0) {
    // Project entity detected — high confidence
    topicName = projectEntities[0].name;
    topicType = "project";
    confidence = 0.9;
  } else if (personEntities.length > 0 && dominantWords.length > 0) {
    // Person + context — medium confidence
    topicName = `${personEntities[0].name}'s ${dominantWords[0]}`;
    topicType = "person";
    confidence = 0.6;
  } else if (dominantWords.length > 0) {
    // Just dominant words — lower confidence
    topicName = dominantWords.slice(0, 2).join(" ");
    topicType = "concept";
    confidence = 0.4;
  }

  if (!topicName || confidence < minConfidence) return null;

  return {
    name: topicName,
    type: topicType,
    entities: entities.map(e => e.name.toLowerCase()),
    keywords: dominantWords,
    confidence,
  };
}

// ─── Topic-Scoped Memory Retrieval ──────────────────────────────────────────
// Retrieves memories, boosted by topic relevance.
// If a topic is detected, memories matching the topic get a score boost.

function topicScopedRetrieve(topic, query, limit = 15) {
  const database = db.getDb();

  // Start with smart retrieve (relevance + importance + recency + entity matches)
  const baseResults = smartRetrieve(query, limit * 2);

  if (!topic) return baseResults.slice(0, limit);

  // Boost scores for topic-relevant memories
  const topicKeywords = new Set([
    ...topic.keywords,
    ...topic.entities,
    topic.name.toLowerCase(),
  ].filter(Boolean));

  const boosted = baseResults.map(mem => {
    let boost = 0;
    const memLower = mem.content.toLowerCase();

    // Direct keyword match
    for (const kw of topicKeywords) {
      if (memLower.includes(kw)) {
        boost += 5;
      }
    }

    // Category boost for topic type
    if (topic.type === "project" && mem.category === "decision") boost += 3;
    if (topic.type === "project" && mem.category === "commitment") boost += 2;
    if (topic.type === "person" && mem.category === "person") boost += 4;

    // Entity match boost (already scored by smartRetrieve, but double down)
    const memEntities = extractEntities(mem.content);
    for (const entity of topic.entities) {
      if (memEntities.some(me => me.name.toLowerCase() === entity)) {
        boost += 4;
      }
    }

    return { ...mem, score: (mem.score || 0) + boost };
  });

  // Re-sort by boosted score and return top results
  boosted.sort((a, b) => b.score - a.score);
  return boosted.slice(0, limit);
}

// ─── Topic Transition Detection ──────────────────────────────────────────────
// Detects when the user switches topics mid-conversation.
// Returns { transitioned: true, from, to } or { transitioned: false }.

function detectTransition(prevTopic, currentTopic) {
  if (!prevTopic || !currentTopic) return { transitioned: false };
  if (prevTopic.name === currentTopic.name) return { transitioned: false };

  // Check if the new topic is a genuine shift (not just entity overlap)
  const overlap = prevTopic.entities.filter(e => currentTopic.entities.includes(e));
  const similarity = overlap.length / Math.max(prevTopic.entities.length, currentTopic.entities.length, 1);

  if (similarity > 0.5) return { transitioned: false }; // Same topic, different framing

  return {
    transitioned: true,
    from: prevTopic.name,
    to: currentTopic.name,
  };
}

// ─── Auto-Tag Memories ───────────────────────────────────────────────────────
// When a memory is saved, auto-tag it with the current topic's entities.
// This makes future retrieval topic-aware without manual tagging.

function autoTagMemory(memoryId, content, topic) {
  const database = db.getDb();

  // Always extract entities and link them
  const { linkMemoryToEntities } = require("./knowledge");
  linkMemoryToEntities(memoryId, content);

  // If we have a topic, also tag the memory with topic keywords
  if (topic && topic.keywords.length > 0) {
    // Store topic tags as metadata in the memory's source field
    const existing = database.prepare("SELECT source FROM memories WHERE id = ?").get(memoryId);
    if (existing) {
      try {
        const sourceData = JSON.parse(existing.source || "{}");
        sourceData.topicTags = [...new Set([...(sourceData.topicTags || []), ...topic.keywords])];
        database.prepare("UPDATE memories SET source = ? WHERE id = ?").run(
          JSON.stringify(sourceData),
          memoryId
        );
      } catch {
        // Source isn't JSON — skip topic tagging
      }
    }
  }
}

module.exports = {
  detectTopic,
  topicScopedRetrieve,
  detectTransition,
  autoTagMemory,
};