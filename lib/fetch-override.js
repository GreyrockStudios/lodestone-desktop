// ─── Fetch Override Router ─────────────────────────────────────────────────
// The main window.fetch override that intercepts API calls and routes them
// to local DB, Ollama, or passes through to the server.


module.exports = function initFetchOverride(ctx) {

  async function handleFetch(input, init) {
    if (!window.electronAPI?.db) return ctx.originalFetch.call(this, input, init);

    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
    const method = (init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();

    // ─── Chat Streaming ──────────────────────────────────────────────────
    // POST /api/chat/stream → route to Ollama for local-first LLM
    if (url === '/api/chat/stream' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const useLocalLLM = !!localStorage.getItem(LodestoneConfig.OLLAMA_URL_KEY) || ctx.currentTier === 'community' || storage.isLocalProvider();

      if (useLocalLLM) {
        try {
          const messages = body.messages || [];
          const model = body.model || localStorage.getItem(LodestoneConfig.LOCAL_MODEL_KEY) || null;
          const stream = ctx.messages.createOllamaStream(messages, model);
          return new Response(stream, {
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          });
        } catch (err) {
          console.warn('[Lodestone] Local LLM failed, falling back to server:', err.message);
        }
      }
      return ctx.originalFetch.call(this, input, init);
    }

    // ─── Conversations ───────────────────────────────────────────────────

    // GET /api/chat/conversations
    if (url === '/api/chat/conversations' && method === 'GET') {
      return ctx.conversations.list(url, method);
    }

    // POST /api/chat/conversations (new conversation)
    if (url === '/api/chat/conversations' && method === 'POST') {
      return ctx.conversations.create(url, method, init);
    }

    // PATCH /api/chat/conversations/:id
    const convIdMatch = url.match(/^\/api\/chat\/conversations\/([^/]+)$/);
    if (convIdMatch && method === 'PATCH') {
      return ctx.conversations.update(url, method, init);
    }

    // DELETE /api/chat/conversations/:id
    if (convIdMatch && method === 'DELETE') {
      return ctx.conversations.remove(url, method, init);
    }

    // ─── Messages ────────────────────────────────────────────────────────

    // GET /api/chat/conversations/:id/messages
    const messagesMatch = url.match(/^\/api\/chat\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
      return ctx.messages.listMessages(messagesMatch[1]);
    }

    // POST /api/chat/conversations/:id/messages (save a message after streaming)
    if (messagesMatch && method === 'POST') {
      return ctx.messages.addMessage(messagesMatch[1], init);
    }

    // ─── Memories ──────────────────────────────────────────────────────────

    // GET /api/memory (non-graph)
    if (url.startsWith('/api/memory') && method === 'GET' && !url.includes('/graph')) {
      return ctx.memories.listMemories(url);
    }

    // POST /api/memory
    if (url === '/api/memory' && method === 'POST') {
      return ctx.memories.createMemory(init);
    }

    // DELETE /api/memory/:id
    const memMatch = url.match(/^\/api\/memory\/([^/]+)$/);
    if (memMatch && method === 'DELETE') {
      return ctx.memories.deleteMemory(url);
    }

    // GET /api/memory/graph
    if (url === '/api/memory/graph' && method === 'GET') {
      return ctx.memories.buildGraph();
    }

    // GET /api/knowledge-graph (alias)
    if (url === '/api/knowledge-graph' && method === 'GET') {
      const graphRes = await window.fetch('/api/memory/graph', { method: 'GET' });
      if (graphRes.ok) {
        const graphData = await graphRes.json();
        return new Response(JSON.stringify(graphData), { headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ nodes: [], edges: [] }), { headers: { 'content-type': 'application/json' } });
    }

    // ─── Chat helpers (Community fallback) ──────────────────────────────

    // GET /api/chat/greeting
    if (url === '/api/chat/greeting' && method === 'GET') {
      return ctx.messages.getGreeting();
    }

    // GET /api/chat/system-prompts
    if (url === '/api/chat/system-prompts' && method === 'GET') {
      return new Response(JSON.stringify({ prompts: [] }), { headers: { 'content-type': 'application/json' } });
    }

    // GET /api/chat/templates
    if (url === '/api/chat/templates' && method === 'GET') {
      return new Response(JSON.stringify({ templates: [] }), { headers: { 'content-type': 'application/json' } });
    }

    // GET /api/chat/recall
    if (url.startsWith('/api/chat/recall') && method === 'GET') {
      return ctx.memories.searchMemories(url);
    }

    // ─── Identity (Community) ────────────────────────────────────────────

    // GET /api/identity
    if (url === '/api/identity' && method === 'GET') {
      try {
        const identity = await window.electronAPI.brain?.getIdentity?.() || {};
        const soul = await window.electronAPI.brain?.getSoul?.() || {};
        return new Response(JSON.stringify({
          name: identity?.name || '',
          avatar_emoji: identity?.avatar_emoji || '\u{1FAA8}',
          profession: identity?.role || '',
          personality: soul?.content || identity?.description || '',
          tone: identity?.tone || 'balanced',
          custom_instructions: identity?.custom_instructions || '',
        }), { headers: { 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ name: '', avatar_emoji: '\u{1FAA8}', profession: '', personality: '', tone: 'balanced', custom_instructions: '' }), { headers: { 'content-type': 'application/json' } });
      }
    }

    // PUT /api/identity
    if (url === '/api/identity' && method === 'PUT') {
      try {
        const body = JSON.parse(init?.body || '{}');
        await window.electronAPI.brain?.setIdentity?.({
          name: body.name,
          role: body.profession,
          description: body.personality,
          tone: body.tone,
          custom_instructions: body.custom_instructions,
          avatar_emoji: body.avatar_emoji,
        });
        ctx.sync.syncToServer('/api/identity', 'PUT', body);
        return new Response(JSON.stringify({ success: true }), { headers: { 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to update identity' }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }

    // ─── Commitments ────────────────────────────────────────────────────

    // GET /api/chat/commitments
    if (url.startsWith('/api/chat/commitments') && method === 'GET') {
      return ctx.memories.listCommitments(url);
    }

    // POST /api/chat/commitments
    if (url === '/api/chat/commitments' && method === 'POST') {
      return ctx.memories.createCommitment(init);
    }

    // PATCH /api/chat/commitments/:id
    const commitMatch = url.match(/^\/api\/chat\/commitments\/([^/]+)$/);
    if (commitMatch && method === 'PATCH') {
      return ctx.memories.updateCommitment(url, init);
    }

    // DELETE /api/chat/commitments/:id
    if (commitMatch && method === 'DELETE') {
      return ctx.memories.deleteCommitment(url);
    }

    // ─── Brain endpoints ────────────────────────────────────────────────

    // Soul
    if (url === '/api/brain/soul' && method === 'GET') return ctx.brain.getSoul();
    if (url === '/api/brain/soul' && method === 'PUT') return ctx.brain.setSoul(init);

    // Identity
    if (url === '/api/brain/identity' && method === 'GET') return ctx.brain.getIdentity();
    if (url === '/api/brain/identity' && method === 'PUT') return ctx.brain.setIdentity(init);

    // Rules
    if (url === '/api/brain/rules' && method === 'GET') return ctx.brain.getRules();
    if (url === '/api/brain/rules' && method === 'POST') return ctx.brain.addRule(init);
    if (url.match(/^\/api\/brain\/rules\/(\d+)$/) && method === 'DELETE') return ctx.brain.removeRule(url);

    // Heartbeat
    if (url === '/api/brain/heartbeat' && method === 'GET') return ctx.brain.getHeartbeat();
    if (url === '/api/brain/heartbeat' && method === 'PUT') return ctx.brain.setHeartbeat(init);

    // User profile
    if (url === '/api/brain/user-profile' && method === 'GET') return ctx.brain.getUserProfile();
    if (url === '/api/brain/user-profile' && method === 'PUT') return ctx.brain.setUserProfile(init);

    // Dashboard
    if (url === '/api/brain/dashboard' && method === 'GET') return ctx.brain.getDashboard();

    // Knowledge
    if (url.startsWith('/api/brain/knowledge/search') && method === 'GET') return ctx.brain.searchKnowledge(url);
    if (url.match(/^\/api\/brain\/knowledge\/entities\/([^/]+)\/related$/) && method === 'GET') return ctx.brain.getRelatedEntities(url);
    if (url === '/api/brain/knowledge/extract' && method === 'POST') return ctx.brain.extractEntities(init);

    // Self-improvement
    if (url === '/api/brain/predictions' && method === 'POST') return ctx.brain.createPrediction(init);
    if (url.startsWith('/api/brain/predictions') && method === 'GET') return ctx.brain.getPredictions(url);
    if (url.match(/^\/api\/brain\/predictions\/([^/]+)\/resolve$/) && method === 'PATCH') return ctx.brain.resolvePrediction(url, init);
    if (url === '/api/brain/calibration' && method === 'GET') return ctx.brain.getCalibration();
    if (url === '/api/brain/drift-detection' && method === 'POST') return ctx.brain.detectDrift(init);
    if (url === '/api/brain/correction-detection' && method === 'POST') return ctx.brain.detectCorrection(init);
    if (url === '/api/brain/sleep-cycle' && method === 'POST') return ctx.brain.runSleepCycle();

    // ─── Folders ────────────────────────────────────────────────────────

    // GET /api/chat/folders
    if (url === '/api/chat/folders' && method === 'GET') {
      return ctx.conversations.listFolders();
    }

    // POST /api/chat/folders
    if (url === '/api/chat/folders' && method === 'POST') {
      return ctx.conversations.createFolder(url, method, init);
    }

    // ─── Settings & Usage ────────────────────────────────────────────────

    // GET /api/user/me/preferences
    if (url === '/api/user/me/preferences' && method === 'GET') {
      const prefs = {};
      const keys = ['theme', 'message_font', 'message_font_size', 'send_on_enter', 'compact_mode', 'sidebar_collapsed', 'language'];
      for (const key of keys) {
        const val = await window.electronAPI.db.getSetting(`pref_${key}`);
        if (val !== null) prefs[key] = val;
      }
      return new Response(JSON.stringify({ preferences: prefs }), { headers: { 'content-type': 'application/json' } });
    }

    // PATCH /api/user/me/preferences
    if (url === '/api/user/me/preferences' && method === 'PATCH') {
      const body = init?.body ? JSON.parse(init.body) : {};
      for (const [key, value] of Object.entries(body)) {
        await window.electronAPI.db.setSetting(`pref_${key}`, String(value));
      }
      ctx.sync.syncToServer('/api/user/me/preferences', 'PATCH', body);
      return new Response(JSON.stringify({ success: true, preferences: body }), { headers: { 'content-type': 'application/json' } });
    }

    // GET /api/keys
    if (url === '/api/keys' && method === 'GET') {
      return new Response(JSON.stringify({ keys: [] }), { headers: { 'content-type': 'application/json' } });
    }

    // GET /api/usage/credits
    if (url === '/api/usage/credits' && method === 'GET') {
      return new Response(JSON.stringify({ creditsUsed: 0, creditsRemaining: -1, monthlyCredits: -1 }), { headers: { 'content-type': 'application/json' } });
    }

    // GET /api/usage/tokens
    if (url === '/api/usage/tokens' && method === 'GET') {
      return new Response(JSON.stringify({ creditsUsed: 0, creditsRemaining: -1, monthlyCredits: -1 }), { headers: { 'content-type': 'application/json' } });
    }

    // GET /api/usage/provider-rates
    if (url === '/api/usage/provider-rates' && method === 'GET') {
      return new Response(JSON.stringify({ providers: [{ provider: 'ollama', inputPer1M: 0.084, outputPer1M: 0.084, isDefault: true }] }), { headers: { 'content-type': 'application/json' } });
    }

    // GET /api/storage/usage
    if (url === '/api/storage/usage' && method === 'GET') {
      try {
        const stats = await window.electronAPI.db?.getStats?.();
        return new Response(JSON.stringify({ used: stats?.totalSize || 0, limit: 1073741824, breakdown: { conversations: stats?.conversationsSize || 0, memories: stats?.memoriesSize || 0, files: stats?.filesSize || 0 } }), { headers: { 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ used: 0, limit: 1073741824, breakdown: { conversations: 0, memories: 0, files: 0 } }), { headers: { 'content-type': 'application/json' } });
      }
    }

    // ─── Desktop Tools ──────────────────────────────────────────────────

    // POST /api/tools
    if (url === '/api/tools' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const { calls } = body;
      if (calls && calls.length) {
        const results = [];
        for (const call of calls) {
          let args = {};
          try { args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : (call.arguments || {}); } catch { args = {}; }
          const result = await ctx.tools.execute(call.name, args);
          results.push({ id: call.id, name: call.name, content: result });
        }
        return new Response(JSON.stringify({ results }), { headers: { 'content-type': 'application/json' } });
      }
    }

    // ─── Pass through everything else ──────────────────────────────────
    // Auth, files, usage, keys, subscriptions, etc. go to the server
    // With 401 → refresh token → retry logic
    const response = await ctx.originalFetch.call(this, input, init);
    if (response.status === 401) {
      // Don't try to refresh auth endpoints
      if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')) {
        return response;
      }
      const retried = await ctx.auth.retryWithRefresh(input, init, ctx.originalFetch);
      if (retried) return retried;
      // Refresh failed, 401 stands
      return response;
    }
    return response;
  }

  return handleFetch;
};