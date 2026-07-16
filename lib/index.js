// ─── Lodestone Local Data Layer ──────────────────────────────────────────
// Modular entry point. Wires all lib/ modules into a single IIFE that
// intercepts window.fetch for local-first data routing.
//
// Built by concatenating this file + all lib/*.js into community-data-layer.js.
// See build-data-layer.sh.

(function() {
  if (window.__lodestone_data_layer_active) return;
  window.__lodestone_data_layer_active = true;

  const isDesktop = !!window.electronAPI?.db;
  if (!isDesktop) return;

  // ─── Context shared across all modules ─────────────────────────────────
  // Capture the best available fetch before we override window.fetch.
  // Use a getter so that if token-refresh.js wraps fetch later (adding 401
  // retry logic), the data layer picks up the wrapped version instead of
  // staying stuck on the original native fetch captured at load time.
  // To avoid infinite recursion, we stash the pre-override fetch in
  // _preDataLayerFetch and always reference that as fallback.
  const _preDataLayerFetch = (window.__original_fetch || window.fetch).bind(window);
  window.__original_fetch = _preDataLayerFetch;
  const ctx = {
    currentTier: null,
    syncEnabled: false,
    get originalFetch() {
      // Always resolve dynamically: if token-refresh.js or another module
      // has updated __original_fetch to a better wrapper, use that;
      // otherwise fall back to the fetch we captured before our override.
      return window.__original_fetch || _preDataLayerFetch;
    },
  };

  // ─── Initialize modules ────────────────────────────────────────────────
  // Each module receives ctx and attaches its methods for cross-module access.
  const auth = LodestoneAuth(ctx);         ctx.auth = auth;
  const sync = LodestoneSync(ctx);         ctx.sync = sync;
  const conversations = LodestoneConversations(ctx);  ctx.conversations = conversations;
  const messages = LodestoneMessages(ctx); ctx.messages = messages;
  const memories = LodestoneMemories(ctx);  ctx.memories = memories;
  const brain = LodestoneBrain(ctx);        ctx.brain = brain;
  const tools = LodestoneTools(ctx);        ctx.tools = tools;

  // ─── Install fetch override ─────────────────────────────────────────────
  const handleFetch = LodestoneFetchOverride(ctx);
  window.fetch = handleFetch;

  // ─── Ollama model listing ──────────────────────────────────────────────
  window.electronAPI = window.electronAPI || {};
  window.electronAPI.getOllamaModels = async function() {
    const rawUrl = localStorage.getItem('lodestone_ollama_url') || 'http://localhost:11434';
    let ollamaUrl;
    try {
      const parsed = new URL(rawUrl);
      if (['http:', 'https:'].includes(parsed.protocol) && parsed.hostname !== '0.0.0.0' && parsed.hostname !== '') {
        ollamaUrl = rawUrl;
      } else {
        ollamaUrl = 'http://localhost:11434';
      }
    } catch { ollamaUrl = 'http://localhost:11434'; }
    try {
      const res = await ctx.originalFetch(`${ollamaUrl}/api/tags`);
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

  // ─── Desktop-native tool definitions ───────────────────────────────────
  window.__lodestone_desktop_tools = LodestoneConfig.DESKTOP_TOOLS;

  // ─── Expose tier info ──────────────────────────────────────────────────
  window.electronAPI.getTier = () => ctx.currentTier;
  window.electronAPI.isLocalFirst = () => true;
  window.electronAPI.isSyncEnabled = () => ctx.syncEnabled;
  window.electronAPI.enableCloudSync = () => sync.enableSync();
  window.electronAPI.disableCloudSync = () => sync.disableSync();

  // ─── MCP Deep Link Install Handler ────────────────────────────────────
  window.addEventListener('mcp-install-request', async (event) => {
    const { id, name, command, args, env } = event.detail;
    console.log(`[Lodestone] MCP install request: ${name} (${id})`);
    try {
      if (window.electronAPI && window.electronAPI.mcp && window.electronAPI.mcp.connect) {
        const result = await window.electronAPI.mcp.connect(id, command, args || [], env || {});
        if (result && !result.error) {
          console.log(`[Lodestone] MCP server "${name}" connected successfully`);
          window.dispatchEvent(new CustomEvent('mcp-install-complete', { detail: { id, name, success: true } }));
          if (window.__showToast) window.__showToast(`Installed ${name}`, 'success');
        } else {
          console.error('[Lodestone] MCP connect failed:', result?.error);
          window.dispatchEvent(new CustomEvent('mcp-install-complete', { detail: { id, name, success: false, error: result?.error } }));
          if (window.__showToast) window.__showToast(`Failed to install ${name}: ${result?.error || 'Unknown error'}`, 'error');
        }
      } else {
        console.warn('[Lodestone] MCP bridge not available — cannot install from marketplace');
        if (window.__showToast) window.__showToast('MCP installation requires the desktop app', 'warning');
      }
    } catch (err) {
      console.error('[Lodestone] MCP install error:', err);
      window.dispatchEvent(new CustomEvent('mcp-install-complete', { detail: { id, name, success: false, error: err.message } }));
    }
  });

  console.debug('[Lodestone] Local-first data layer initialized. All tiers use local DB. Ollama routing active.');
})();