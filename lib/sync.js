// ─── Sync (Pro/Studio only) ────────────────────────────────────────────────
// Bidirectional cloud sync: pull from server, push local-only records.
// Conflict resolution: last-write-wins based on updated_at timestamp.


module.exports = function initSync(ctx) {
  let lastSyncAt = null;
  let syncInProgress = false;

  async function syncToServer(path, method, body) {
    if (ctx.currentTier === 'community' || !ctx.syncEnabled) return;
    const token = storage.getAccessToken();
    if (!token) return;
    try {
      await ctx.originalFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      console.warn('[Lodestone] Sync failed:', e.message);
    }
  }

  async function pullFromServer() {
    if (ctx.currentTier === 'community' || !ctx.syncEnabled || syncInProgress) return;
    syncInProgress = true;
    const token = storage.getAccessToken();
    if (!token) { syncInProgress = false; return; }

    const since = lastSyncAt || storage.getLastSyncAt() || null;
    let pulled = 0;

    try {
      // ── Pull conversations + messages ──
      const convRes = await ctx.originalFetch('/api/chat/conversations?limit=100' + (since ? '&since=' + encodeURIComponent(since) : ''), {
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
            try {
              const msgRes = await ctx.originalFetch(`/api/chat/conversations/${conv.id}/messages`, {
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

      // ── Pull memories ──
      const memRes = await ctx.originalFetch('/api/memory?limit=100' + (since ? '&since=' + encodeURIComponent(since) : ''), {
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

      // ── Pull commitments ──
      const comRes = await ctx.originalFetch('/api/chat/commitments?limit=100' + (since ? '&since=' + encodeURIComponent(since) : ''), {
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
      storage.setLastSyncAt(now);
      console.debug('[Lodestone] Pull sync complete. Pulled', pulled, 'records.');
    } catch (e) {
      console.warn('[Lodestone] Pull sync failed:', e.message);
    } finally {
      syncInProgress = false;
    }
  }

  async function pushLocalOnly() {
    if (ctx.currentTier === 'community' || !ctx.syncEnabled || syncInProgress) return;
    const token = storage.getAccessToken();
    if (!token) return;

    let pushed = 0;

    try {
      // Push conversations that haven't been synced yet
      const localConvs = await window.electronAPI.db.listConversations({ limit: 100 });
      if (localConvs && localConvs.length) {
        const serverRes = await ctx.originalFetch('/api/chat/conversations?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (serverRes.ok) {
          const serverData = await serverRes.json();
          const serverIds = new Set((serverData.conversations || []).map(c => c.id));
          for (const conv of localConvs) {
            if (!serverIds.has(conv.id)) {
              await syncToServer('/api/chat/conversations', 'POST', conv);
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
          const memRes = await ctx.originalFetch('/api/memory?limit=100', {
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
          const comRes = await ctx.originalFetch('/api/chat/commitments?status=all', {
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

      // Push brain identity (Soul, Identity, Rules, Heartbeat, UserProfile)
      try {
        if (window.electronAPI?.brain) {
          const [soul, identity, rules, heartbeat, profile] = await Promise.all([
            window.electronAPI.brain.getSoul(),
            window.electronAPI.brain.getIdentity(),
            window.electronAPI.brain.getRules(),
            window.electronAPI.brain.getHeartbeat(),
            window.electronAPI.brain.getUserProfile(),
          ]);
          if (soul?.content) await syncToServer('/api/brain/soul', 'PUT', { content: soul.content });
          if (identity?.name || identity?.role || identity?.description) await syncToServer('/api/brain/identity', 'PUT', identity);
          if (heartbeat?.active_task || heartbeat?.next_steps || heartbeat?.services) await syncToServer('/api/brain/heartbeat', 'PUT', heartbeat);
          if (profile?.name || profile?.communication_style || profile?.timezone) await syncToServer('/api/brain/user-profile', 'PUT', profile);
          for (const rule of (rules || [])) {
            await syncToServer('/api/brain/rules', 'POST', { rule: rule.rule, category: rule.category, priority: rule.priority });
            pushed++;
          }
        }
      } catch (e) {
        console.warn('[Lodestone] Failed to push brain identity:', e.message);
      }

      // Pull brain identity from server
      try {
        if (window.electronAPI?.brain) {
          const [serverSoul, serverIdentity, serverRules, serverHeartbeat, serverProfile] = await Promise.all([
            ctx.originalFetch('/api/brain/soul', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
            ctx.originalFetch('/api/brain/identity', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
            ctx.originalFetch('/api/brain/rules', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
            ctx.originalFetch('/api/brain/heartbeat', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
            ctx.originalFetch('/api/brain/user-profile', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
          ]);
          if (serverSoul?.content) await window.electronAPI.brain.setSoul(serverSoul.content);
          if (serverIdentity?.name || serverIdentity?.role) await window.electronAPI.brain.setIdentity(serverIdentity);
          if (serverHeartbeat?.active_task) await window.electronAPI.brain.setHeartbeat(serverHeartbeat);
          if (serverProfile?.name || serverProfile?.communication_style) await window.electronAPI.brain.setUserProfile(serverProfile);
          if (serverRules?.rules) {
            const localRules = await window.electronAPI.brain.getRules();
            const localRuleTexts = new Set((localRules || []).map(r => r.rule));
            for (const rule of serverRules.rules) {
              if (!localRuleTexts.has(rule.rule)) {
                await window.electronAPI.brain.addRule(rule.rule, rule.category, rule.priority);
              }
            }
          }
          console.debug('[Lodestone] Brain identity sync: pulled from server');
        }
      } catch (e) {
        console.warn('[Lodestone] Failed to pull brain identity:', e.message);
      }

      console.debug('[Lodestone] Push sync complete. Pushed', pushed, 'records.');
    } catch (e) {
      console.warn('[Lodestone] Push sync failed:', e.message);
    }
  }

  async function enableSync() {
    if (ctx.currentTier === 'community') { ctx.syncEnabled = false; return; }
    ctx.syncEnabled = true;
    storage.setCloudSync(true);
    console.debug('[Lodestone] Cloud sync enabled for tier:', ctx.currentTier);
    await pullFromServer();
    await pushLocalOnly();
  }

  function disableSync() {
    ctx.syncEnabled = false;
    storage.setCloudSync(false);
    console.debug('[Lodestone] Cloud sync disabled');
  }

  // Auto-sync every 5 minutes when sync is enabled
  setInterval(() => {
    if (ctx.syncEnabled && !syncInProgress) pullFromServer();
  }, LodestoneConfig.SYNC_INTERVAL_MS);

  return { syncToServer, pullFromServer, pushLocalOnly, enableSync, disableSync };
};