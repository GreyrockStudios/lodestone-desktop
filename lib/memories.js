// ─── Memories & Commitments ────────────────────────────────────────────────
// Local-first memory/commitment CRUD and knowledge graph construction.


module.exports = function initMemories(ctx) {

  // ─── Memories ──────────────────────────────────────────────────────────

  // GET /api/memory
  async function listMemories(url) {
    const params = new URL(url, 'http://localhost').searchParams;
    const search = params.get('q');
    const memories = await window.electronAPI.db.listMemories({
      search: search || undefined,
      category: params.get('category') || undefined,
    });
    return new Response(JSON.stringify({ memories }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // POST /api/memory
  async function createMemory(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const mem = await window.electronAPI.db.createMemory({
      content: body.content,
      category: body.category,
      importance: body.importance,
      source_type: body.source_type || 'chat',
    });
    ctx.sync.syncToServer('/api/memory', 'POST', mem);
    return new Response(JSON.stringify(mem), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // DELETE /api/memory/:id
  async function deleteMemory(url) {
    const match = url.match(/^\/api\/memory\/([^/]+)$/);
    if (!match) return null;
    await window.electronAPI.db.deleteMemory(match[1]);
    ctx.sync.syncToServer(`/api/memory/${match[1]}`, 'DELETE');
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ─── Knowledge Graph ────────────────────────────────────────────────────

  async function buildGraph() {
    try {
      const token = storage.getAccessToken();
      console.debug('[Lodestone] Graph fetch — building locally from memories');

      const memories = await window.electronAPI.db.listMemories({ limit: 500 }) || [];
      const identityNodes = [];
      const extraEdges = [];

      // Add identity data as graph nodes
      try {
        const soul = await window.electronAPI.brain?.getSoul?.();
        if (soul?.content) {
          const soulId = 'identity-soul';
          identityNodes.push({ id: soulId, content: soul.content.substring(0, 80) + (soul.content.length > 80 ? '...' : ''), category: 'identity', importance: 1.0, created_at: soul.created_at || new Date().toISOString() });
          for (const m of memories) {
            if (m.category === 'identity' || m.category === 'preference') {
              extraEdges.push({ source: soulId, target: m.id, label: 'shapes', implicit: true, strength: 0.6 });
            }
          }
        }
        const identity = await window.electronAPI.brain?.getIdentity?.();
        if (identity?.name || identity?.role) {
          const idId = 'identity-profile';
          identityNodes.push({ id: idId, content: `${identity.name || 'Unnamed'} — ${identity.role || 'Assistant'}`, category: 'identity', importance: 0.95, created_at: new Date().toISOString() });
          if (soul?.content) extraEdges.push({ source: 'identity-soul', target: idId, label: 'embodies', implicit: true, strength: 0.8 });
        }
        const rules = await window.electronAPI.brain?.getRules?.() || [];
        for (const rule of rules) {
          const ruleId = `rule-${rule.id}`;
          identityNodes.push({ id: ruleId, content: rule.rule, category: 'decision', importance: 0.85, created_at: rule.created_at || new Date().toISOString() });
          if (soul?.content) extraEdges.push({ source: 'identity-soul', target: ruleId, label: 'rule', implicit: true, strength: 0.7 });
        }
        const heartbeat = await window.electronAPI.brain?.getHeartbeat?.();
        if (heartbeat?.active_task) {
          const hbId = 'heartbeat-active';
          identityNodes.push({ id: hbId, content: `Active: ${heartbeat.active_task}`, category: 'event', importance: 0.9, created_at: new Date().toISOString() });
          if (identity?.name) extraEdges.push({ source: 'identity-profile', target: hbId, label: 'working on', implicit: true, strength: 0.7 });
        }
        const profile = await window.electronAPI.brain?.getUserProfile?.();
        if (profile?.name) {
          const pId = 'user-profile';
          identityNodes.push({ id: pId, content: `User: ${profile.name}`, category: 'entity', importance: 0.9, created_at: new Date().toISOString() });
          if (identity?.name) extraEdges.push({ source: 'identity-profile', target: pId, label: 'serves', implicit: true, strength: 0.6 });
        }
      } catch (e) {
        console.debug('[Lodestone] Could not add identity nodes to graph:', e.message);
      }

      const allMemories = [...memories, ...identityNodes];

      if (allMemories.length === 0) {
        console.debug('[Lodestone] No memories or identity data for graph');
        return new Response(JSON.stringify({ nodes: [], edges: [] }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      // Try to get edges from server
      let edges = [];
      if (token) {
        try {
          const edgeRes = await ctx.originalFetch('/api/knowledge-graph/edges', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (edgeRes.ok) {
            const edgeData = await edgeRes.json();
            edges = edgeData.edges || edgeData || [];
          }
        } catch (e) {
          console.debug('[Lodestone] Could not fetch edges from server, generating locally');
        }
      }

      edges = [...edges, ...extraEdges];

      // Auto-generate edges from shared keywords if no server edges
      if (edges.length === 0) {
        const keywords = (text) => {
          if (!text) return [];
          return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !LodestoneConfig.STOP_WORDS.has(w));
        };
        for (let i = 0; i < allMemories.length; i++) {
          for (let j = i + 1; j < allMemories.length; j++) {
            const a = allMemories[i], b = allMemories[j];
            if (a.category === b.category) {
              edges.push({ source: a.id, target: b.id, label: 'related', implicit: true, strength: 0.3 });
            }
            const kwA = keywords(a.content), kwB = keywords(b.content);
            const shared = kwA.filter(k => kwB.includes(k));
            if (shared.length >= 2) {
              edges.push({ source: a.id, target: b.id, label: shared.slice(0, 2).join(', '), implicit: true, strength: 0.4 });
            }
          }
        }
      }

      // Force-directed layout
      const positions = new Map();
      const cx = 400, cy = 200, radius = Math.min(150, 30 * allMemories.length);
      allMemories.forEach((m, i) => {
        const angle = (2 * Math.PI * i) / allMemories.length - Math.PI / 2;
        positions.set(m.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
      });
      for (let iter = 0; iter < 50; iter++) {
        const forces = new Map(allMemories.map(m => [m.id, { x: 0, y: 0 }]));
        for (let i = 0; i < allMemories.length; i++) {
          for (let j = i + 1; j < allMemories.length; j++) {
            const a = positions.get(allMemories[i].id), b = positions.get(allMemories[j].id);
            let dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 5000 / (dist * dist);
            forces.get(allMemories[i].id).x += (dx / dist) * force;
            forces.get(allMemories[i].id).y += (dy / dist) * force;
            forces.get(allMemories[j].id).x -= (dx / dist) * force;
            forces.get(allMemories[j].id).y -= (dy / dist) * force;
          }
        }
        edges.forEach(e => {
          const pa = positions.get(e.source), pb = positions.get(e.target);
          if (!pa || !pb) return;
          let dx = pb.x - pa.x, dy = pb.y - pa.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = dist * 0.01;
          forces.get(e.source).x += (dx / dist) * force;
          forces.get(e.source).y += (dy / dist) * force;
          forces.get(e.target).x -= (dx / dist) * force;
          forces.get(e.target).y -= (dy / dist) * force;
        });
        const damping = 0.1;
        allMemories.forEach(m => {
          const f = forces.get(m.id), p = positions.get(m.id);
          p.x += f.x * damping;
          p.y += f.y * damping;
        });
      }

      const nodes = allMemories.map(m => ({
        id: m.id,
        label: (m.content || '').length > 40 ? (m.content || '').substring(0, 37) + '...' : (m.content || ''),
        fullContent: m.content,
        type: LodestoneConfig.CATEGORY_TO_TYPE[m.category] || 'fact',
        category: m.category,
        importance: m.importance || 0.5,
        x: positions.get(m.id)?.x || 0,
        y: positions.get(m.id)?.y || 0,
        createdAt: m.created_at || m.createdAt,
        updatedAt: m.updated_at || m.updatedAt,
      }));

      const formattedEdges = edges.map(e => ({
        id: e.id || `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: (e.label || e.relationship || '').replace(/_/g, ' '),
        type: e.type || e.relationship || 'related_to',
        strength: e.strength || 0.5,
        implicit: e.implicit ?? (e.strength < 0.3),
      }));

      console.debug('[Lodestone] Graph built locally:', nodes.length, 'nodes,', formattedEdges.length, 'edges');
      return new Response(JSON.stringify({ nodes, edges: formattedEdges }), {
        headers: { 'content-type': 'application/json' },
      });
    } catch (e) {
      console.error('[Lodestone] Graph build error:', e);
      return new Response(JSON.stringify({ nodes: [], edges: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ─── Commitments ────────────────────────────────────────────────────────

  // GET /api/chat/commitments
  async function listCommitments(url) {
    const params = new URL(url, 'http://localhost').searchParams;
    const status = params.get('status') || undefined;
    const commitments = await window.electronAPI.db.listCommitments(status);
    return new Response(JSON.stringify({ commitments }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // POST /api/chat/commitments
  async function createCommitment(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const com = await window.electronAPI.db.createCommitment({
      content: body.content,
      due_date: body.due_date,
    });
    ctx.sync.syncToServer('/api/chat/commitments', 'POST', com);
    return new Response(JSON.stringify(com), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // PATCH /api/chat/commitments/:id
  async function updateCommitment(url, init) {
    const match = url.match(/^\/api\/chat\/commitments\/([^/]+)$/);
    if (!match) return null;
    const body = init?.body ? JSON.parse(init.body) : {};
    const updated = await window.electronAPI.db.updateCommitment(match[1], body);
    ctx.sync.syncToServer(`/api/chat/commitments/${match[1]}`, 'PATCH', body);
    return new Response(JSON.stringify(updated), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // DELETE /api/chat/commitments/:id
  async function deleteCommitment(url) {
    const match = url.match(/^\/api\/chat\/commitments\/([^/]+)$/);
    if (!match) return null;
    await window.electronAPI.db.deleteCommitment(match[1]);
    ctx.sync.syncToServer(`/api/chat/commitments/${match[1]}`, 'DELETE');
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ─── Recall ────────────────────────────────────────────────────────────

  async function recall(url) {
    const params = new URL(url, 'http://localhost').searchParams;
    const q = params.get('q') || '';
    const limit = parseInt(params.get('limit') || '10');
    const memories = await window.electronAPI.db.listMemories({ search: q, limit });
    const commitments = await window.electronAPI.db.listCommitments('pending');
    return new Response(JSON.stringify({
      memories: memories.slice(0, limit),
      commitments: commitments.slice(0, 5),
    }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ─── Simple memory search (GET /api/chat/recall) ────────────────────────

  async function searchMemories(url) {
    const params = new URL(url, 'http://localhost').searchParams;
    const q = params.get('q') || '';
    const limit = parseInt(params.get('limit') || '10');
    try {
      const all = await window.electronAPI.db.listMemories({ limit: 200 });
      const qLower = q.toLowerCase();
      const results = (all || []).filter((m) => m.content?.toLowerCase().includes(qLower)).slice(0, limit);
      return new Response(JSON.stringify({ memories: results, total: results.length }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ memories: [], total: 0 }), { headers: { 'content-type': 'application/json' } });
    }
  }

  return {
    listMemories, createMemory, deleteMemory, buildGraph,
    listCommitments, createCommitment, updateCommitment, deleteCommitment,
    recall, searchMemories,
  };
};