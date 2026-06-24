// ─── Lodestone Local Data Layer ──────────────────────────────────────────
// Injected into the SPA via the protocol handler.
// ALL tiers are local-first — data lives in ~/.lodestone/local.db.
// Pro/Studio users can optionally sync to the cloud.
// Community users are local-only.
//
// Also routes LLM calls to local Ollama (Community) or passes through to server.

(function() {
  if (window.__lodestone_data_layer_active) return;
  window.__lodestone_data_layer_active = true;

  const isDesktop = !!window.electronAPI?.db;
  if (!isDesktop) return;

  let currentTier = null;
  let syncEnabled = false;
  let lastSyncAt = null; // ISO timestamp of last successful pull sync
  let syncInProgress = false;
  const originalFetch = window.__original_fetch || window.fetch;
  window.__original_fetch = originalFetch;

  // ─── Tier Detection ─────────────────────────────────────────────────────
  async function detectTier() {
    const token = localStorage.getItem('lodestone_access_token');
    if (!token) { currentTier = null; return; }
    try {
      const res = await originalFetch('/api/user/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentTier = data.tier || data.subscription?.tier_id || 'community';
      }
    } catch (e) {
      currentTier = 'community';
    }
    console.log('[Lodestone] Data layer: tier =', currentTier);
    // Enable cloud sync only if user has opted in
    if (localStorage.getItem('lodestone_cloud_sync') === 'true') {
      enableSync();
    }
  }

  detectTier();
  window.addEventListener('storage', (e) => {
    if (e.key === 'lodestone_access_token') {
      detectTier();
    }
  });

  // ─── Sync helpers (Pro/Studio only) ──────────────────────────────────────
  async function syncToServer(path, method, body) {
    if (currentTier === 'community' || !syncEnabled) return;
    const token = localStorage.getItem('lodestone_access_token');
    if (!token) return;
    try {
      await originalFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      console.warn('[Lodestone] Sync failed:', e.message);
    }
  }

  // ─── Bidirectional Cloud Sync (Pro/Studio) ───────────────────────────────
  // Pull: download new/updated records from server since last sync.
  // Push: upload local-only records to server.
  // Conflict: last-write-wins based on updated_at timestamp.

  async function pullFromServer() {
    if (currentTier === 'community' || !syncEnabled || syncInProgress) return;
    syncInProgress = true;
    const token = localStorage.getItem('lodestone_access_token');
    if (!token) { syncInProgress = false; return; }

    const since = lastSyncAt || localStorage.getItem('lodestone_last_sync_at') || null;
    let pulled = 0;

    try {
      // ── Pull conversations + messages ──
      const convRes = await originalFetch('/api/chat/conversations?limit=100' + (since ? '&since=' + encodeURIComponent(since) : ''), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (convRes.ok) {
        const data = await convRes.json();
        for (const conv of (data.conversations || [])) {
          const existing = await window.electronAPI.db.getConversation(conv.id);
          if (!existing || new Date(conv.updated_at) > new Date(existing.updated_at || 0)) {
            await window.electronAPI.db.createConversation({
              id: conv.id,
              title: conv.title,
              created_at: conv.created_at,
              updated_at: conv.updated_at,
              folder_id: conv.folder_id,
            });
            // Pull messages for this conversation
            try {
              const msgRes = await originalFetch(`/api/chat/conversations/${conv.id}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (msgRes.ok) {
                const msgData = await msgRes.json();
                for (const msg of (msgData.messages || [])) {
                  await window.electronAPI.db.addMessage({
                    id: msg.id,
                    conversation_id: conv.id,
                    role: msg.role,
                    content: msg.content,
                    created_at: msg.created_at,
                  });
                }
              }
            } catch (e) {
              console.warn('[Lodestone] Failed to pull messages for conv', conv.id, e.message);
            }
            pulled++;
          }
        }
      }

      // ── Pull memories �─
      const memRes = await originalFetch('/api/memory?limit=100' + (since ? '&since=' + encodeURIComponent(since) : ''), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (memRes.ok) {
        const data = await memRes.json();
        for (const mem of (data.entries || [])) {
          const existing = await window.electronAPI.db.getMemory(mem.id);
          if (!existing || new Date(mem.updated_at || mem.created_at) > new Date(existing.updated_at || existing.created_at || 0)) {
            await window.electronAPI.db.createMemory({
              id: mem.id,
              content: mem.content,
              type: mem.category || 'note',
              tags: mem.tags ? JSON.stringify(mem.tags) : null,
              created_at: mem.created_at,
              updated_at: mem.updated_at || mem.created_at,
            });
            pulled++;
          }
        }
      }

      // ── Pull commitments �─
      const comRes = await originalFetch('/api/chat/commitments?limit=100' + (since ? '&since=' + encodeURIComponent(since) : ''), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (comRes.ok) {
        const data = await comRes.json();
        for (const com of (data.commitments || [])) {
          try {
            await window.electronAPI.db.createCommitment({
              id: com.id,
              content: com.content,
              due_date: com.due_date,
              status: com.status,
              created_at: com.created_at,
              updated_at: com.updated_at || com.created_at,
            });
            pulled++;
          } catch (e) { /* may already exist */ }
        }
      }

      const now = new Date().toISOString();
      lastSyncAt = now;
      localStorage.setItem('lodestone_last_sync_at', now);
      console.log('[Lodestone] Pull sync complete. Pulled', pulled, 'records.');
    } catch (e) {
      console.warn('[Lodestone] Pull sync failed:', e.message);
    } finally {
      syncInProgress = false;
    }
  }

  async function pushLocalOnly() {
    if (currentTier === 'community' || !syncEnabled || syncInProgress) return;
    const token = localStorage.getItem('lodestone_access_token');
    if (!token) return;

    let pushed = 0;

    try {
      // Push conversations that haven't been synced yet
      // We check server to see which IDs exist, then push missing ones
      const localConvs = await window.electronAPI.db.listConversations({ limit: 100 });
      if (localConvs && localConvs.length) {
        const serverRes = await originalFetch('/api/chat/conversations?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (serverRes.ok) {
          const serverData = await serverRes.json();
          const serverIds = new Set((serverData.conversations || []).map(c => c.id));
          for (const conv of localConvs) {
            if (!serverIds.has(conv.id)) {
              await syncToServer('/api/chat/conversations', 'POST', conv);
              // Push messages for this conversation too
              try {
                const msgs = await window.electronAPI.db.getMessages(conv.id);
                if (msgs && msgs.length) {
                  for (const msg of msgs) {
                    await syncToServer(`/api/chat/conversations/${conv.id}/messages`, 'POST', msg);
                  }
                }
              } catch (e) {
                console.warn('[Lodestone] Failed to push messages for conv', conv.id, e.message);
              }
              pushed++;
            }
          }
        }
      }

      // Push memories that aren't on server
      try {
        const localMems = await window.electronAPI.db.listMemories({ limit: 100 });
        if (localMems && localMems.length) {
          const memRes = await originalFetch('/api/memory?limit=100', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (memRes.ok) {
            const memData = await memRes.json();
            const serverMemIds = new Set((memData.entries || []).map(m => m.id));
            for (const mem of localMems) {
              if (!serverMemIds.has(mem.id)) {
                await syncToServer('/api/memory', 'POST', { content: mem.content, category: mem.category || mem.type || 'note', importance: mem.importance || 0.7 });
                pushed++;
              }
            }
          }
        }
      } catch (e) {
        console.warn('[Lodestone] Failed to push memories:', e.message);
      }

      // Push commitments that aren't on server
      try {
        const localComs = await window.electronAPI.db.listCommitments('pending');
        if (localComs && localComs.length) {
          const comRes = await originalFetch('/api/chat/commitments?status=all', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (comRes.ok) {
            const comData = await comRes.json();
            const serverComIds = new Set((comData.commitments || []).map(c => c.id));
            for (const com of localComs) {
              if (!serverComIds.has(com.id)) {
                await syncToServer('/api/chat/commitments', 'POST', { content: com.content, due_date: com.due_date, status: com.status });
                pushed++;
              }
            }
          }
        }
      } catch (e) {
        console.warn('[Lodestone] Failed to push commitments:', e.message);
      }

      console.log('[Lodestone] Push sync complete. Pushed', pushed, 'records.');
    } catch (e) {
      console.warn('[Lodestone] Push sync failed:', e.message);
    }
  }

  // Enable sync — only Pro/Studio/Enterprise tiers
  async function enableSync() {
    if (currentTier === 'community') { syncEnabled = false; return; }
    syncEnabled = true;
    localStorage.setItem('lodestone_cloud_sync', 'true');
    console.log('[Lodestone] Cloud sync enabled for tier:', currentTier);
    await pullFromServer();
    await pushLocalOnly();
  }

  async function disableSync() {
    syncEnabled = false;
    localStorage.setItem('lodestone_cloud_sync', 'false');
    console.log('[Lodestone] Cloud sync disabled');
  }

  // Auto-sync every 5 minutes when sync is enabled
  setInterval(() => {
    if (syncEnabled && !syncInProgress) pullFromServer();
  }, 5 * 60 * 1000);

  // ─── Local Ollama proxy ──────────────────────────────────────────────────
  // Desktop app can call Ollama directly at http://localhost:11434
  // This routes /api/chat/stream to local Ollama for Community tier
  // or BYO key for Pro/Studio users who configure it.

  function getOllamaUrl() {
    return localStorage.getItem('lodestone_ollama_url') || 'http://localhost:11434';
  }

  function getOllamaModel() {
    return localStorage.getItem('lodestone_model') || 'gemma3:4b';
  }

  async function streamFromOllama(messages, model, onChunk, onDone, onError) {
    const ollamaUrl = getOllamaUrl();
    const ollamaModel = model || getOllamaModel();

    try {
      const res = await originalFetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: messages,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama error ${res.status}: ${errText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullContent += parsed.message.content;
              onChunk(parsed.message.content);
            }
            if (parsed.done) {
              onDone(fullContent);
              return;
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      }
      onDone(fullContent);
    } catch (err) {
      onError(err);
    }
  }

  // ─── SSE-compatible Ollama stream ─────────────────────────────────────────
  // The SPA expects Server-Sent Events from /api/chat/stream.
  // We intercept and convert Ollama's streaming JSON into SSE format.

  function createOllamaStream(messages, model) {
    const encoder = new TextEncoder();
    const ollamaUrl = getOllamaUrl();
    const ollamaModel = model || getOllamaModel();

    return new ReadableStream({
      async start(controller) {
        try {
          const res = await originalFetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: ollamaModel,
              messages: messages,
              stream: true,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            const errorEvent = `data: ${JSON.stringify({ error: `Ollama error: ${res.status}`, message: errText })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
            controller.close();
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let conversationId = 'local-' + crypto.randomUUID();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);

                if (parsed.message?.content) {
                  fullContent += parsed.message.content;
                  // Send as SSE event matching the SPA's expected format
                  const sseEvent = `data: ${JSON.stringify({
                    type: 'content',
                    content: parsed.message.content,
                    conversation_id: conversationId,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(sseEvent));
                }

                if (parsed.done) {
                  // Save messages to local DB
                  if (window.electronAPI?.db && messages.length > 0) {
                    try {
                      const conv = await window.electronAPI.db.createConversation({
                        title: messages[0]?.content?.substring(0, 50) || 'New chat',
                        model: ollamaModel,
                        provider: 'ollama',
                      });
                      conversationId = conv.id;

                      for (const msg of messages) {
                        await window.electronAPI.db.addMessage({
                          conversation_id: conv.id,
                          role: msg.role,
                          content: msg.content,
                          model: ollamaModel,
                          provider: 'ollama',
                        });
                      }
                      await window.electronAPI.db.addMessage({
                        conversation_id: conv.id,
                        role: 'assistant',
                        content: fullContent,
                        model: ollamaModel,
                        provider: 'ollama',
                        tokens_used: parsed.eval_count || null,
                      });
                      window.dispatchEvent(new CustomEvent('conversations-changed'));
                    } catch (dbErr) {
                      console.warn('[Lodestone] Failed to save chat to local DB:', dbErr);
                    }
                  }

                  // Send done event
                  const doneEvent = `data: ${JSON.stringify({
                    type: 'done',
                    conversation_id: conversationId,
                    tokens: { prompt: parsed.prompt_eval_count, completion: parsed.eval_count },
                  })}\n\n`;
                  controller.enqueue(encoder.encode(doneEvent));
                }
              } catch (e) {
                // Skip malformed lines
              }
            }
          }

          controller.close();
        } catch (err) {
          const errorEvent = `data: ${JSON.stringify({ error: err.message, type: 'error' })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      }
    });
  }

  // ─── Local-first fetch override ──────────────────────────────────────────
  window.fetch = async function(input, init) {
    if (!window.electronAPI?.db) return originalFetch.call(this, input, init);

    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
    const method = (init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();

    // ─── Chat Streaming ────────────────────────────────────────────────────
    // POST /api/chat/stream → route to Ollama for local-first LLM
    if (url === '/api/chat/stream' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const useLocalLLM = !!localStorage.getItem('lodestone_ollama_url') || currentTier === 'community' || localStorage.getItem('lodestone_local_provider') === 'true';

      if (useLocalLLM) {
        try {
          const messages = body.messages || [];
          const model = body.model || localStorage.getItem('lodestone_local_model') || null;

          // Return SSE stream from Ollama
          const stream = createOllamaStream(messages, model);
          return new Response(stream, {
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }
          });
        } catch (err) {
          // Fall through to server if Ollama fails
          console.warn('[Lodestone] Local LLM failed, falling back to server:', err.message);
        }
      }
      // Pro/Studio without local Ollama → pass through to server
      return originalFetch.call(this, input, init);
    }

    // ─── Conversations ───────────────────────────────────────────────────

    // GET /api/chat/conversations
    if (url === '/api/chat/conversations' && method === 'GET') {
      const convs = await window.electronAPI.db.listConversations({});
      return new Response(JSON.stringify({ conversations: convs }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // POST /api/chat/conversations (new conversation)
    if (url === '/api/chat/conversations' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const conv = await window.electronAPI.db.createConversation({
        title: body.title || 'New chat',
        model: body.model,
        provider: body.provider,
        system_prompt: body.system_prompt,
        folder_id: body.folder_id,
      });
      syncToServer('/api/chat/conversations', 'POST', conv);
      return new Response(JSON.stringify(conv), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // PATCH /api/chat/conversations/:id
    const convIdMatch = url.match(/^\/api\/chat\/conversations\/([^/]+)$/);
    if (convIdMatch && method === 'PATCH') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const updated = await window.electronAPI.db.updateConversation(convIdMatch[1], body);
      syncToServer(`/api/chat/conversations/${convIdMatch[1]}`, 'PATCH', body);
      return new Response(JSON.stringify(updated), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // DELETE /api/chat/conversations/:id
    if (convIdMatch && method === 'DELETE') {
      await window.electronAPI.db.deleteConversation(convIdMatch[1]);
      window.dispatchEvent(new CustomEvent('conversations-changed'));
      syncToServer(`/api/chat/conversations/${convIdMatch[1]}`, 'DELETE');
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // ─── Messages ────────────────────────────────────────────────────────

    // GET /api/chat/conversations/:id/messages
    const messagesMatch = url.match(/^\/api\/chat\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
      const msgs = await window.electronAPI.db.getMessages(messagesMatch[1]);
      return new Response(JSON.stringify({ messages: msgs }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // POST /api/chat/conversations/:id/messages (save a message after streaming)
    if (messagesMatch && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const msg = await window.electronAPI.db.addMessage({
        conversation_id: messagesMatch[1],
        role: body.role,
        content: body.content,
        model: body.model,
        provider: body.provider,
        tokens_used: body.tokens_used,
      });
      syncToServer(`/api/chat/conversations/${messagesMatch[1]}/messages`, 'POST', msg);
      return new Response(JSON.stringify(msg), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // ─── Memories ──────────────────────────────────────────────────────────

    // GET /api/memory
    if (url.startsWith('/api/memory') && method === 'GET' && !url.includes('/graph')) {
      const params = new URL(url, 'http://localhost').searchParams;
      const search = params.get('q');
      const memories = await window.electronAPI.db.listMemories({
        search: search || undefined,
        category: params.get('category') || undefined,
      });
      return new Response(JSON.stringify({ memories }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // POST /api/memory
    if (url === '/api/memory' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const mem = await window.electronAPI.db.createMemory({
        content: body.content,
        category: body.category,
        importance: body.importance,
        source_type: body.source_type || 'chat',
      });
      syncToServer('/api/memory', 'POST', mem);
      return new Response(JSON.stringify(mem), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // DELETE /api/memory/:id
    const memMatch = url.match(/^\/api\/memory\/([^/]+)$/);
    if (memMatch && method === 'DELETE') {
      await window.electronAPI.db.deleteMemory(memMatch[1]);
      syncToServer(`/api/memory/${memMatch[1]}`, 'DELETE');
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // GET /api/memory/graph — local-first: build graph from local memories, sync to server for edges
    if (url === '/api/memory/graph' && method === 'GET') {
      try {
        const token = localStorage.getItem('lodestone_access_token');
        console.log('[Lodestone] Graph fetch — building locally from memories');

        // Get local memories
        const memories = await window.electronAPI.db.listMemories({ limit: 500 });
        if (!memories || memories.length === 0) {
          console.log('[Lodestone] No local memories for graph');
          return new Response(JSON.stringify({ nodes: [], edges: [] }), {
            headers: { 'content-type': 'application/json' }
          });
        }

        // Try to get edges from server, but don't fail if unavailable
        let edges = [];
        if (token) {
          try {
            const edgeRes = await originalFetch('/api/knowledge-graph/edges', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (edgeRes.ok) {
              const edgeData = await edgeRes.json();
              edges = edgeData.edges || edgeData || [];
            }
          } catch (e) {
            console.log('[Lodestone] Could not fetch edges from server, generating locally');
          }
        }

        // If no server edges, auto-generate from shared keywords
        if (edges.length === 0) {
          const memMap = new Map(memories.map(m => [m.id, m]));
          const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','must','need','i','me','my','we','our','you','your','he','him','his','she','her','it','its','they','them','their','this','that','these','those','what','which','who','whom','whose','when','where','why','how','all','each','every','both','few','more','most','other','some','such','no','not','only','own','same','so','than','too','very','just','because','but','and','or','if','then','else','while','for','in','on','at','to','from','by','with','about','between','through','during','before','after','above','below','up','down','out','off','over','under','again','further','once','also','of']);
          const keywords = (text) => {
            if (!text) return [];
            return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
          };
          for (let i = 0; i < memories.length; i++) {
            for (let j = i + 1; j < memories.length; j++) {
              const a = memories[i], b = memories[j];
              // Same category = related
              if (a.category === b.category) {
                edges.push({ source: a.id, target: b.id, label: 'related', implicit: true, strength: 0.3 });
              }
              // Shared keywords = related
              const kwA = keywords(a.content), kwB = keywords(b.content);
              const shared = kwA.filter(k => kwB.includes(k));
              if (shared.length >= 2) {
                edges.push({ source: a.id, target: b.id, label: shared.slice(0,2).join(', '), implicit: true, strength: 0.4 });
              }
            }
          }
        }

        // Compute force-directed layout positions
        const positions = new Map();
        const cx = 400, cy = 200, radius = Math.min(150, 30 * memories.length);
        memories.forEach((m, i) => {
          const angle = (2 * Math.PI * i) / memories.length - Math.PI / 2;
          positions.set(m.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        });
        for (let iter = 0; iter < 50; iter++) {
          const forces = new Map(memories.map(m => [m.id, { x: 0, y: 0 }]));
          for (let i = 0; i < memories.length; i++) {
            for (let j = i + 1; j < memories.length; j++) {
              const a = positions.get(memories[i].id), b = positions.get(memories[j].id);
              let dx = a.x - b.x, dy = a.y - b.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = 5000 / (dist * dist);
              forces.get(memories[i].id).x += (dx / dist) * force;
              forces.get(memories[i].id).y += (dy / dist) * force;
              forces.get(memories[j].id).x -= (dx / dist) * force;
              forces.get(memories[j].id).y -= (dy / dist) * force;
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
          memories.forEach(m => {
            const f = forces.get(m.id), p = positions.get(m.id);
            p.x += f.x * damping;
            p.y += f.y * damping;
          });
        }

        const categoryToType = { entity: 'entity', fact: 'fact', preference: 'identity', decision: 'decision', event: 'event', concept: 'concept', commitment: 'event', note: 'fact' };
        const typeIcons = { identity: '\U0001f52e', entity: '\U0001f464', concept: '\U0001f4a1', event: '\U0001f4c5', fact: '\U0001f4cc' };

        const nodes = memories.map(m => ({
          id: m.id,
          label: (m.content || '').length > 40 ? (m.content || '').substring(0, 37) + '...' : (m.content || ''),
          fullContent: m.content,
          type: categoryToType[m.category] || 'fact',
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

        console.log('[Lodestone] Graph built locally:', nodes.length, 'nodes,', formattedEdges.length, 'edges');
        return new Response(JSON.stringify({ nodes, edges: formattedEdges }), {
          headers: { 'content-type': 'application/json' }
        });
      } catch (e) {
        console.error('[Lodestone] Graph build error:', e);
        return new Response(JSON.stringify({ nodes: [], edges: [] }), {
          headers: { 'content-type': 'application/json' }
        });
      }
    }

    // ─── Commitments ───────────────────────────────────────────────────────

    // GET /api/chat/commitments
    if (url.startsWith('/api/chat/commitments') && method === 'GET') {
      const params = new URL(url, 'http://localhost').searchParams;
      const status = params.get('status') || undefined;
      const commitments = await window.electronAPI.db.listCommitments(status);
      return new Response(JSON.stringify({ commitments }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // POST /api/chat/commitments
    if (url === '/api/chat/commitments' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const com = await window.electronAPI.db.createCommitment({
        content: body.content,
        due_date: body.due_date,
      });
      syncToServer('/api/chat/commitments', 'POST', com);
      return new Response(JSON.stringify(com), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // PATCH /api/chat/commitments/:id
    const commitMatch = url.match(/^\/api\/chat\/commitments\/([^/]+)$/);
    if (commitMatch && method === 'PATCH') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const updated = await window.electronAPI.db.updateCommitment(commitMatch[1], body);
      syncToServer(`/api/chat/commitments/${commitMatch[1]}`, 'PATCH', body);
      return new Response(JSON.stringify(updated), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // DELETE /api/chat/commitments/:id
    if (commitMatch && method === 'DELETE') {
      await window.electronAPI.db.deleteCommitment(commitMatch[1]);
      window.dispatchEvent(new CustomEvent('conversations-changed'));
      syncToServer(`/api/chat/commitments/${commitMatch[1]}`, 'DELETE');
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // ─── Folders ────────────────────────────────────────────────────────────

    // GET /api/chat/folders
    if (url === '/api/chat/folders' && method === 'GET') {
      const folders = await window.electronAPI.db.listFolders();
      return new Response(JSON.stringify({ folders }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // POST /api/chat/folders
    if (url === '/api/chat/folders' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const folder = await window.electronAPI.db.createFolder({
        name: body.name,
        parent_id: body.parent_id,
      });
      syncToServer('/api/chat/folders', 'POST', folder);
      return new Response(JSON.stringify(folder), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // ─── Recall ─────────────────────────────────────────────────────────────

    const recallMatch = url.match(/^\/api\/chat\/recall\?/);
    if (recallMatch && method === 'GET') {
      const params = new URL(url, 'http://localhost').searchParams;
      const q = params.get('q') || '';
      const limit = parseInt(params.get('limit') || '10');
      const memories = await window.electronAPI.db.listMemories({ search: q, limit });
      const commitments = await window.electronAPI.db.listCommitments('pending');
      return new Response(JSON.stringify({
        memories: memories.slice(0, limit),
        commitments: commitments.slice(0, 5),
      }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // ─── Settings ────────────────────────────────────────────────────────────

    // GET /api/user/me/preferences
    if (url === '/api/user/me/preferences' && method === 'GET') {
      const prefs = {};
      const keys = ['theme', 'message_font', 'message_font_size', 'send_on_enter', 'compact_mode', 'sidebar_collapsed', 'language'];
      for (const key of keys) {
        const val = await window.electronAPI.db.getSetting(`pref_${key}`);
        if (val !== null) prefs[key] = val;
      }
      return new Response(JSON.stringify({ preferences: prefs }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // PATCH /api/user/me/preferences
    if (url === '/api/user/me/preferences' && method === 'PATCH') {
      const body = init?.body ? JSON.parse(init.body) : {};
      for (const [key, value] of Object.entries(body)) {
        await window.electronAPI.db.setSetting(`pref_${key}`, String(value));
      }
      syncToServer('/api/user/me/preferences', 'PATCH', body);
      return new Response(JSON.stringify({ success: true, preferences: body }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // ─── Desktop-native Tools ──────────────────────────────────────────────
    // Intercept POST /api/tools for desktop-native tool execution.
    // Desktop tools: weather, execute_code, file operations, notifications, QR
    // Others (web_search, web_fetch, generate_image) still go to server.

    if (url === '/api/tools' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const { calls } = body;

      if (calls && calls.length) {
        const results = [];
        for (const call of calls) {
          let args = {};
          try { args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : (call.arguments || {}); } catch { args = {}; }

          const result = await executeDesktopTool(call.name, args);
          results.push({ id: call.id, name: call.name, content: result });
        }
        return new Response(JSON.stringify({ results }), {
          headers: { 'content-type': 'application/json' }
        });
      }
    }

    // ─── Pass through everything else ────────────────────────────────────────
    // Auth, files, usage, keys, subscriptions, etc. go to the server
    return originalFetch.call(this, input, init);
  };

  // ─── Desktop-native tool execution ────────────────────────────────────────
  // These run locally without needing the server.
  // Falls back to server if the tool isn't available locally.

  async function executeDesktopTool(name, args) {
    try {
      switch (name) {
        // ── Memory & Commitments (local DB) ──
        case 'save_memory': {
          const mem = await window.electronAPI.db.createMemory({
            content: args.content,
            category: args.category || 'fact',
            importance: args.importance || 0.7,
            source_type: 'chat',
          });
          syncToServer('/api/memory', 'POST', mem);
          return JSON.stringify({ success: true, id: mem.id, content: mem.content });
        }
        case 'search_memory': {
          const memories = await window.electronAPI.db.listMemories({
            search: args.query,
            limit: args.limit || 5,
          });
          return JSON.stringify({ memories });
        }
        case 'create_commitment': {
          const com = await window.electronAPI.db.createCommitment({
            content: args.content,
            due_date: args.due_date,
          });
          syncToServer('/api/chat/commitments', 'POST', com);
          return JSON.stringify({ success: true, id: com.id, content: com.content });
        }
        case 'set_reminder': {
          // Store as a commitment with due_date
          const reminder = await window.electronAPI.db.createCommitment({
            content: args.content,
            due_date: args.trigger_at,
          });
          // Also trigger a system notification at the right time (if supported)
          if (window.electronAPI?.sendNotification && args.trigger_at) {
            const triggerTime = new Date(args.trigger_at);
            const now = new Date();
            const delay = triggerTime.getTime() - now.getTime();
            if (delay > 0 && delay < 86400000) { // Within 24 hours
              setTimeout(() => {
                window.electronAPI.sendNotification({
                  title: 'Lodestone Reminder',
                  body: args.content,
                  clickAction: '#/chat',
                });
              }, delay);
            }
          }
          return JSON.stringify({ success: true, id: reminder.id, content: reminder.content, trigger_at: args.trigger_at });
        }
        case 'list_reminders': {
          const commitments = await window.electronAPI.db.listCommitments(args.status || 'pending');
          return JSON.stringify({ reminders: commitments.map(c => ({
            id: c.id, content: c.content, trigger_at: c.due_date, status: c.status, created_at: c.created_at,
          }))});
        }

        // ── Calculator (local JS) ──
        case 'calculator': {
          try {
            // Safe math evaluation — only allow numbers, operators, and math functions
            const expr = args.expression.replace(/[^0-9+\-*/().%\s^piePIEsincotaglqrtabflorpw]/g, '');
            const fn = new Function(`with(Math){return(${expr})}`);
            const result = fn();
            return JSON.stringify({ result: result, expression: args.expression });
          } catch (e) {
            return JSON.stringify({ error: `Could not evaluate: ${args.expression}` });
          }
        }

        // ── Execute Code (sandboxed via Electron IPC) ──
        case 'execute_code': {
          if (window.electronAPI?.executeCode) {
            const result = await window.electronAPI.executeCode(args.language, args.code, args.timeout);
            return JSON.stringify(result);
          }
          // Fallback: simple eval for JS only
          if (args.language === 'javascript') {
            try {
              const result = new Function(args.code)();
              return JSON.stringify({ output: String(result) });
            } catch (e) {
              return JSON.stringify({ error: e.message });
            }
          }
          return JSON.stringify({ error: 'Code execution not available locally' });
        }

        // ── Weather (needs API, pass through to server) ──
        case 'weather':
        // ── Web search/fetch (needs API, pass through) ──
        case 'web_search':
        case 'web_fetch':
        // ── File analysis (needs server-side processing) ──
        case 'analyze_file':
        // ── Image generation (needs DALL-E API) ──
        case 'generate_image':
        // ── QR generation (simple, can be local but server has it) ──
        case 'create_qr':
        // ── Notes (server-side feature) ──
        case 'create_note':
          // These tools require the server — fall through to original fetch
          return null; // Signal to caller to use server

        // ── Desktop System Tools ──────────────────────────────────────────
        case 'desktop_list_directory': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.listDirectory(args.path);
          return JSON.stringify(result);
        }
        case 'desktop_read_file': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.readFile(args.path, args.encoding);
          return JSON.stringify(result);
        }
        case 'desktop_write_file': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.writeFile(args.path, args.content, args.create_dirs);
          return JSON.stringify(result);
        }
        case 'desktop_search_files': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.searchFiles(args.directory, args.pattern, args.max_results);
          return JSON.stringify(result);
        }
        case 'desktop_system_info': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.systemInfo();
          return JSON.stringify(result);
        }
        case 'desktop_battery_info': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.batteryInfo();
          return JSON.stringify(result);
        }
        case 'desktop_wifi_info': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.wifiInfo();
          return JSON.stringify(result);
        }
        case 'desktop_screenshot': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.takeScreenshot();
          return JSON.stringify(result);
        }
        case 'desktop_clipboard_read': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.clipboardRead();
          return JSON.stringify(result);
        }
        case 'desktop_clipboard_write': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.clipboardWrite(args.text);
          return JSON.stringify(result);
        }
        case 'desktop_run_command': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.runCommand(args.command, args.timeout);
          return JSON.stringify(result);
        }
        case 'desktop_open_url': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.openExternal(args.url);
          return JSON.stringify(result);
        }
        case 'desktop_volume': {
          if (!window.electronAPI?.tools) return null;
          if (args.level !== undefined) {
            const result = await window.electronAPI.tools.setVolume(args.level);
            return JSON.stringify(result);
          }
          const result = await window.electronAPI.tools.getVolume();
          return JSON.stringify(result);
        }

        // ── Scheduler ──
        case 'scheduler_create': {
          if (!window.electronAPI?.scheduler) return null;
          const presets = {
            'every_minute': '* * * * *',
            'every_5_minutes': '*/5 * * * *',
            'every_15_minutes': '*/15 * * * *',
            'every_30_minutes': '*/30 * * * *',
            'hourly': '0 * * * *',
            'every_2_hours': '0 */2 * * *',
            'every_6_hours': '0 */6 * * *',
            'daily_morning': '0 8 * * *',
            'daily_evening': '0 18 * * *',
            'daily_noon': '0 12 * * *',
            'weekly_monday': '0 9 * * 1',
            'weekly_friday': '0 9 * * 5',
            'monthly_first': '0 9 1 * *',
            'weekdays_9am': '0 9 * * 1-5',
            'weekdays_5pm': '0 17 * * 1-5',
            'weekends_10am': '0 10 * * 0,6',
          };
          const cronExpr = presets[args.preset] || args.preset || '0 9 * * *'; // default: daily 9am
          const task = await window.electronAPI.scheduler.create({
            name: args.name,
            description: args.description,
            task_type: args.task_type || 'reminder',
            cron_expr: cronExpr,
            preset_id: args.preset,
            message: args.message,
          });
          return JSON.stringify({ success: true, task });
        }
        case 'scheduler_list': {
          if (!window.electronAPI?.scheduler) return null;
          const tasks = await window.electronAPI.scheduler.list(args.filter);
          return JSON.stringify({ tasks });
        }
        case 'scheduler_pause': {
          if (!window.electronAPI?.scheduler) return null;
          const paused = await window.electronAPI.scheduler.pause(args.id);
          return JSON.stringify({ success: true, task: paused });
        }
        case 'scheduler_resume': {
          if (!window.electronAPI?.scheduler) return null;
          const resumed = await window.electronAPI.scheduler.resume(args.id);
          return JSON.stringify({ success: true, task: resumed });
        }
        case 'scheduler_delete': {
          if (!window.electronAPI?.scheduler) return null;
          await window.electronAPI.scheduler.delete(args.id);
          return JSON.stringify({ success: true });
        }

        default:
          return null; // Unknown tool, fall through to server
      }
    } catch (err) {
      console.error('[Lodestone] Desktop tool error:', name, err);
      return JSON.stringify({ error: err.message });
    }
  }

  // ─── Ollama model listing ────────────────────────────────────────────────
  // Desktop can list available Ollama models for the model selector
  window.electronAPI = window.electronAPI || {};
  window.electronAPI.getOllamaModels = async function() {
    const ollamaUrl = localStorage.getItem('lodestone_ollama_url') || 'http://localhost:11434';
    try {
      const res = await originalFetch(`${ollamaUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        return (data.models || []).map(m => ({
          name: m.name,
          size: m.size,
          modified: m.modified_at,
          quantization: m.details?.quantization_level,
        }));
      }
    } catch (e) {
      console.warn('[Lodestone] Could not reach Ollama:', e.message);
    }
    return [];
  };

  // ─── Desktop-native tool definitions ──────────────────────────────────────
  // Register desktop tools so the LLM can use them.
  // These are added to the tools list when running in desktop mode.
  window.__lodestone_desktop_tools = [
    {
      type: 'function',
      function: {
        name: 'desktop_list_directory',
        description: 'List files and subdirectories in a directory on the user\'s computer. Use this to explore the file system, find files, or understand project structure.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute directory path to list (e.g. "/Users/jay/projects/my-app")' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_read_file',
        description: 'Read the contents of a file on the user\'s computer. Supports text files up to 1MB. Use this to read code, configs, logs, or documents.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute file path to read' },
            encoding: { type: 'string', description: 'File encoding (default: utf-8)', enum: ['utf-8', 'ascii', 'latin1'] },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_write_file',
        description: 'Write content to a file on the user\'s computer. Creates parent directories if needed. Use this to create or update files, configs, or scripts.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute file path to write' },
            content: { type: 'string', description: 'Content to write to the file' },
            create_dirs: { type: 'boolean', description: 'Create parent directories if they don\'t exist (default: false)' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_search_files',
        description: 'Search for files by name pattern in a directory. Use this to find specific files across a project.',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Directory to search in' },
            pattern: { type: 'string', description: 'Regex pattern to match filenames (e.g. ".*\\.tsx$" for React files)' },
            max_results: { type: 'number', description: 'Maximum results to return (default: 50)' },
          },
          required: ['directory', 'pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_system_info',
        description: 'Get system information: OS, CPU, memory, disk space, uptime. Use this when the user asks about their computer specs or available resources.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_battery_info',
        description: 'Get battery status: charge percentage, charging state. Use this when the user asks about their battery level or power status.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_wifi_info',
        description: 'Get current Wi-Fi network info: network name, IP address, signal. Use this when troubleshooting connectivity.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_screenshot',
        description: 'Take a screenshot of the user\'s primary display. Returns a base64-encoded PNG image. Use this when the user wants you to see their screen.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_clipboard_read',
        description: 'Read the current contents of the clipboard. Use this when the user says "check my clipboard" or "what did I copy?".',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_clipboard_write',
        description: 'Write text to the clipboard. Use this when the user wants to copy something to their clipboard.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to copy to clipboard' },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_run_command',
        description: 'Run a safe, read-only shell command on the user\'s computer. Only whitelisted commands are allowed (ls, pwd, cat, git status, etc). Dangerous commands are blocked. Use for system diagnostics and file inspection.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to run (must be in allowlist)' },
            timeout: { type: 'number', description: 'Timeout in seconds (default: 10, max: 30)' },
          },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_open_url',
        description: 'Open a URL in the user\'s default browser. Use this when the user wants to visit a website.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to open (http/https only)' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_volume',
        description: 'Get or set the system volume level (0-100, macOS only). Use this when the user wants to adjust their volume.',
        parameters: {
          type: 'object',
          properties: {
            level: { type: 'number', description: 'Volume level 0-100. Omit to get current volume.' },
          },
        },
      },
    },
    // ─── Scheduler Tools ───────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'scheduler_create',
        description: 'Create a scheduled task that runs repeatedly. Use this for reminders, check-ins, reports, or system checks that the user wants on a schedule.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Friendly name for this schedule (e.g. "Daily standup reminder", "Weekly report")' },
            task_type: { type: 'string', description: 'What to do when this fires', enum: ['reminder', 'check_in', 'report', 'system_check'] },
            preset: { type: 'string', description: 'How often to run', enum: ['every_minute', 'every_5_minutes', 'every_15_minutes', 'every_30_minutes', 'hourly', 'every_2_hours', 'every_6_hours', 'daily_morning', 'daily_evening', 'daily_noon', 'weekly_monday', 'weekly_friday', 'monthly_first', 'weekdays_9am', 'weekdays_5pm', 'weekends_10am'] },
            message: { type: 'string', description: 'What to say/ask when this fires (the prompt for check-ins, the text for reminders, etc.)' },
            description: { type: 'string', description: 'Optional longer description of what this task does' },
          },
          required: ['name', 'task_type', 'preset'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_list',
        description: 'List all scheduled tasks. Shows active and paused tasks with their next run time.',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string', description: 'Filter: "active", "inactive", or null for all', enum: ['active', 'inactive'] },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_pause',
        description: 'Pause a scheduled task. It won\'t fire until resumed.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task ID to pause' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_resume',
        description: 'Resume a paused scheduled task.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task ID to resume' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_delete',
        description: 'Delete a scheduled task permanently.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task ID to delete' },
          },
          required: ['id'],
        },
      },
    },
  ];

  // ─── Expose tier info ─────────────────────────────────────────────────────
  window.electronAPI.getTier = () => currentTier;
  window.electronAPI.isLocalFirst = () => true; // All tiers are local-first
  window.electronAPI.isSyncEnabled = () => syncEnabled;
  window.electronAPI.enableCloudSync = () => enableSync();
  window.electronAPI.disableCloudSync = () => disableSync();

  // ─── MCP Deep Link Install Handler ──────────────────────────────────────────
  // When the user clicks "Install" on the marketplace website, a deep link
  // lodestone://mcp/install?id=...&name=...&command=...&args=... opens the app.
  // The main process dispatches a 'mcp-install-request' event with the server details.
  // This listener auto-connects via electronAPI.mcp.connect.
  window.addEventListener('mcp-install-request', async (event) => {
    const { id, name, command, args, env } = event.detail;
    console.log(`[Lodestone] MCP install request: ${name} (${id})`);
    try {
      // Check if electronAPI.mcp is available
      if (window.electronAPI && window.electronAPI.mcp && window.electronAPI.mcp.connect) {
        const result = await window.electronAPI.mcp.connect(id, command, args || [], env || {});
        if (result && !result.error) {
          console.log(`[Lodestone] MCP server "${name}" connected successfully`);
          // Notify the UI
          window.dispatchEvent(new CustomEvent('mcp-install-complete', { detail: { id, name, success: true } }));
          // Show a toast notification
          if (window.__showToast) {
            window.__showToast(`Installed ${name}`, 'success');
          }
        } else {
          console.error(`[Lodestone] MCP connect failed:`, result?.error);
          window.dispatchEvent(new CustomEvent('mcp-install-complete', { detail: { id, name, success: false, error: result?.error } }));
          if (window.__showToast) {
            window.__showToast(`Failed to install ${name}: ${result?.error || 'Unknown error'}`, 'error');
          }
        }
      } else {
        console.warn('[Lodestone] MCP bridge not available — cannot install from marketplace');
        if (window.__showToast) {
          window.__showToast('MCP installation requires the desktop app', 'warning');
        }
      }
    } catch (err) {
      console.error('[Lodestone] MCP install error:', err);
      window.dispatchEvent(new CustomEvent('mcp-install-complete', { detail: { id, name, success: false, error: err.message } }));
    }
  });

  console.log('[Lodestone] Local-first data layer initialized. All tiers use local DB. Ollama routing active.');
})();