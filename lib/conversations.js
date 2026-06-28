// ─── Conversations ─────────────────────────────────────────────────────────
// Local-first conversation CRUD. Syncs to server for Pro/Studio tiers.


module.exports = function initConversations(ctx) {
  // GET /api/chat/conversations
  async function list(url, method) {
    const convs = await window.electronAPI.db.listConversations({});
    return new Response(JSON.stringify({ conversations: convs }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // POST /api/chat/conversations (new conversation)
  async function create(url, method, init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const conv = await window.electronAPI.db.createConversation({
      title: body.title || 'New chat',
      model: body.model,
      provider: body.provider,
      system_prompt: body.system_prompt,
      folder_id: body.folder_id,
    });
    ctx.sync.syncToServer('/api/chat/conversations', 'POST', conv);
    return new Response(JSON.stringify(conv), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // PATCH /api/chat/conversations/:id
  async function update(url, method, init) {
    const match = url.match(/^\/api\/chat\/conversations\/([^/]+)$/);
    if (!match) return null;
    const id = match[1];
    const body = init?.body ? JSON.parse(init.body) : {};
    const updated = await window.electronAPI.db.updateConversation(id, body);
    ctx.sync.syncToServer(`/api/chat/conversations/${id}`, 'PATCH', body);
    return new Response(JSON.stringify(updated), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // DELETE /api/chat/conversations/:id
  async function remove(url, method, init) {
    const match = url.match(/^\/api\/chat\/conversations\/([^/]+)$/);
    if (!match) return null;
    const id = match[1];
    await window.electronAPI.db.deleteConversation(id);
    events.emit(events.CONVERSATIONS_CHANGED);
    ctx.sync.syncToServer(`/api/chat/conversations/${id}`, 'DELETE');
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ─── Folders ────────────────────────────────────────────────────────────

  // GET /api/chat/folders
  async function listFolders() {
    const folders = await window.electronAPI.db.listFolders();
    return new Response(JSON.stringify({ folders }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // POST /api/chat/folders
  async function createFolder(url, method, init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const folder = await window.electronAPI.db.createFolder({
      name: body.name,
      parent_id: body.parent_id,
    });
    ctx.sync.syncToServer('/api/chat/folders', 'POST', folder);
    return new Response(JSON.stringify(folder), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return { list, create, update, remove, listFolders, createFolder };
};