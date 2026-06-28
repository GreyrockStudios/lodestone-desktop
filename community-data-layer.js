// ─── Lodestone Local Data Layer ──────────────────────────────────────────
// AUTO-GENERATED — do not edit directly. Edit files in lib/ and run ./build-data-layer.sh
// Injected into the SPA via the protocol handler.
// ALL tiers are local-first — data lives in ~/.lodestone/local.db.
// Pro/Studio users can optionally sync to the cloud.
// Community users are local-only.
//
// Also routes LLM calls to local Ollama (Community) or passes through to server.


// ─── Module: config ────────────────────────────────────────────────
// ─── Config & Constants ───────────────────────────────────────────────────
// Shared constants, feature flags, and detection helpers.

const LodestoneConfig = {
  REFRESH_INTERVAL_MS: 14 * 60 * 1000, // 14 minutes (tokens expire at 15 min)
  REFRESH_ENDPOINT: '/api/auth/refresh',
  ACCESS_TOKEN_KEY: 'lodestone_access_token',
  REFRESH_TOKEN_KEY: 'lodestone_refresh_token',
  CLOUD_SYNC_KEY: 'lodestone_cloud_sync',
  OLLAMA_URL_KEY: 'lodestone_ollama_url',
  LOCAL_PROVIDER_KEY: 'lodestone_local_provider',
  LOCAL_MODEL_KEY: 'lodestone_local_model',
  LAST_SYNC_KEY: 'lodestone_last_sync_at',

  // Stop words for graph edge auto-generation
  STOP_WORDS: new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','can','shall',
    'must','need','i','me','my','we','our','you','your','he','him','his','she','her',
    'it','its','they','them','their','this','that','these','those','what','which','who',
    'whom','whose','when','where','why','how','all','each','every','both','few','more',
    'most','other','some','such','no','not','only','own','same','so','than','too','very',
    'just','because','but','and','or','if','then','else','while','for','in','on','at',
    'to','from','by','with','about','between','through','during','before','after',
    'above','below','up','down','out','off','over','under','again','further','once',
    'also','of'
  ]),

  // Category → graph node type mapping
  CATEGORY_TO_TYPE: {
    entity: 'entity',
    fact: 'fact',
    preference: 'identity',
    decision: 'decision',
    event: 'event',
    concept: 'concept',
    commitment: 'event',
    note: 'fact',
  },

  // Type → icon mapping
  TYPE_ICONS: {
    identity: '\u{1F52E}',
    entity: '\u{1F464}',
    concept: '\u{1F4A1}',
    event: '\u{1F4C5}',
    fact: '\u{1F4CC}',
  },

  // Default Ollama values
  DEFAULT_OLLAMA_URL: 'http://localhost:11434',
  DEFAULT_OLLAMA_MODEL: 'gemma3:4b',

  // Sync interval
  SYNC_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

  // Desktop tool definitions for the LLM
  DESKTOP_TOOLS: [
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
  ],

  // Scheduler cron presets
  SCHEDULER_PRESETS: {
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
  },
};
// ─── Module: storage ────────────────────────────────────────────────
// ─── Storage Helpers ────────────────────────────────────────────────────────
// Thin wrappers around localStorage with the lodestone_ prefix convention.


const LodestoneStorage = {
  getToken(key) {
    return localStorage.getItem(key);
  },
  setToken(key, value) {
    return localStorage.setItem(key, value);
  },
  removeToken(key) {
    return localStorage.removeItem(key);
  },
  getAccessToken() {
    return localStorage.getItem(LodestoneConfig.ACCESS_TOKEN_KEY);
  },
  getRefreshToken() {
    return localStorage.getItem(LodestoneConfig.REFRESH_TOKEN_KEY);
  },
  setAccessToken(token) {
    localStorage.setItem(LodestoneConfig.ACCESS_TOKEN_KEY, token);
  },
  setRefreshToken(token) {
    localStorage.setItem(LodestoneConfig.REFRESH_TOKEN_KEY, token);
  },
  clearTokens() {
    localStorage.removeItem(LodestoneConfig.ACCESS_TOKEN_KEY);
    localStorage.removeItem(LodestoneConfig.REFRESH_TOKEN_KEY);
  },
  isCloudSyncEnabled() {
    return localStorage.getItem(LodestoneConfig.CLOUD_SYNC_KEY) === 'true';
  },
  setCloudSync(enabled) {
    localStorage.setItem(LodestoneConfig.CLOUD_SYNC_KEY, String(enabled));
  },
  getOllamaUrl() {
    return localStorage.getItem(LodestoneConfig.OLLAMA_URL_KEY) || LodestoneConfig.DEFAULT_OLLAMA_URL;
  },
  setOllamaUrl(url) {
    localStorage.setItem(LodestoneConfig.OLLAMA_URL_KEY, url);
  },
  getOllamaModel() {
    return localStorage.getItem(LodestoneConfig.LOCAL_MODEL_KEY) || LodestoneConfig.DEFAULT_OLLAMA_MODEL;
  },
  setOllamaModel(model) {
    localStorage.setItem(LodestoneConfig.LOCAL_MODEL_KEY, model);
  },
  isLocalProvider() {
    return localStorage.getItem(LodestoneConfig.LOCAL_PROVIDER_KEY) === 'true';
  },
  setLocalProvider(val) {
    localStorage.setItem(LodestoneConfig.LOCAL_PROVIDER_KEY, String(val));
  },
  getLastSyncAt() {
    return localStorage.getItem(LodestoneConfig.LAST_SYNC_KEY);
  },
  setLastSyncAt(iso) {
    localStorage.setItem(LodestoneConfig.LAST_SYNC_KEY, iso);
  },
};
// ─── Module: events ────────────────────────────────────────────────
// ─── Event Helpers ─────────────────────────────────────────────────────────
// Thin wrappers around window.dispatchEvent / CustomEvent for the data layer.

const LodestoneEvents = {
  emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
  },

  on(name, fn) {
    window.addEventListener(name, fn);
  },

  off(name, fn) {
    window.removeEventListener(name, fn);
  },

  // Standard event names used across the data layer
  CONVERSATIONS_CHANGED: 'conversations-changed',
  TOKEN_REFRESHED: 'lodestone:token-refreshed',
  TOKEN_EXPIRED: 'lodestone:token-expired',
  MCP_INSTALL_REQUEST: 'mcp-install-request',
  MCP_INSTALL_COMPLETE: 'mcp-install-complete',
};
// ─── Module: auth ────────────────────────────────────────────────
// ─── Auth & Token Management ───────────────────────────────────────────────
// Proactive token refresh (14-min interval), 401 retry, and tier detection.


function LodestoneAuth(ctx) {
  let refreshPromise = null;
  let refreshTimer = null;

  async function refreshAccessToken() {
    const refreshToken = storage.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const response = await ctx.originalFetch(LodestoneConfig.REFRESH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.accessToken && data.refreshToken) {
          storage.setAccessToken(data.accessToken);
          storage.setRefreshToken(data.refreshToken);
          window.dispatchEvent(new CustomEvent('lodestone:token-refreshed', {
            detail: { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user },
          }));
          return data.accessToken;
        }
      }
      // Refresh failed — clear tokens to force re-login
      storage.clearTokens();
      window.dispatchEvent(new CustomEvent('lodestone:token-expired'));
      return null;
    } catch (err) {
      console.error('[Lodestone] Token refresh error:', err);
      return null;
    }
  }

  async function getRefreshedToken() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = refreshAccessToken();
    const result = await refreshPromise;
    refreshPromise = null;
    return result;
  }

  function startProactiveRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      const refreshToken = storage.getRefreshToken();
      const accessToken = storage.getAccessToken();
      if (refreshToken && accessToken) {
        console.log('[Lodestone] Proactive token refresh');
        getRefreshedToken();
      }
    }, LodestoneConfig.REFRESH_INTERVAL_MS);
  }

  // Start proactive refresh when tokens exist
  startProactiveRefresh();

  window.addEventListener('storage', (e) => {
    if (e.key === LodestoneConfig.ACCESS_TOKEN_KEY || e.key === LodestoneConfig.REFRESH_TOKEN_KEY) {
      if (storage.getRefreshToken()) startProactiveRefresh();
    }
  });

  async function detectTier() {
    const token = storage.getAccessToken();
    if (!token) { ctx.currentTier = null; return; }
    try {
      const res = await ctx.originalFetch('/api/user/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        ctx.currentTier = data.tier || data.subscription?.tier_id || 'community';
      }
    } catch (e) {
      ctx.currentTier = 'community';
    }
    console.log('[Lodestone] Data layer: tier =', ctx.currentTier);
    if (storage.isCloudSyncEnabled()) {
      ctx.sync.enableSync();
    }
  }

  detectTier();
  window.addEventListener('storage', (e) => {
    if (e.key === LodestoneConfig.ACCESS_TOKEN_KEY) {
      detectTier();
    }
  });

  // 401 → refresh token → retry logic
  async function retryWithRefresh(input, init, originalFetch) {
    const refreshToken = storage.getRefreshToken();
    if (!refreshToken) {
      storage.clearTokens();
      window.dispatchEvent(new CustomEvent('lodestone:token-expired'));
      return null; // signal that refresh failed
    }
    console.log('[Lodestone] 401 detected, attempting token refresh');
    const newToken = await getRefreshedToken();
    if (newToken) {
      const newInit = { ...init };
      if (newInit.headers) {
        if (newInit.headers instanceof Headers) {
          newInit.headers = new Headers(newInit.headers);
          newInit.headers.set('Authorization', `Bearer ${newToken}`);
        } else if (typeof newInit.headers === 'object') {
          newInit.headers = { ...newInit.headers, Authorization: `Bearer ${newToken}` };
        }
      } else {
        newInit.headers = { Authorization: `Bearer ${newToken}` };
      }
      return originalFetch.call(window, input, newInit);
    }
    // Refresh failed
    storage.clearTokens();
    window.dispatchEvent(new CustomEvent('lodestone:token-expired'));
    return null;
  }

  return {
    refreshAccessToken,
    getRefreshedToken,
    startProactiveRefresh,
    detectTier,
    retryWithRefresh,
  };
};
// ─── Module: sync ────────────────────────────────────────────────
// ─── Sync (Pro/Studio only) ────────────────────────────────────────────────
// Bidirectional cloud sync: pull from server, push local-only records.
// Conflict resolution: last-write-wins based on updated_at timestamp.


function LodestoneSync(ctx) {
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
      console.log('[Lodestone] Pull sync complete. Pulled', pulled, 'records.');
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
          console.log('[Lodestone] Brain identity sync: pulled from server');
        }
      } catch (e) {
        console.warn('[Lodestone] Failed to pull brain identity:', e.message);
      }

      console.log('[Lodestone] Push sync complete. Pushed', pushed, 'records.');
    } catch (e) {
      console.warn('[Lodestone] Push sync failed:', e.message);
    }
  }

  async function enableSync() {
    if (ctx.currentTier === 'community') { ctx.syncEnabled = false; return; }
    ctx.syncEnabled = true;
    storage.setCloudSync(true);
    console.log('[Lodestone] Cloud sync enabled for tier:', ctx.currentTier);
    await pullFromServer();
    await pushLocalOnly();
  }

  function disableSync() {
    ctx.syncEnabled = false;
    storage.setCloudSync(false);
    console.log('[Lodestone] Cloud sync disabled');
  }

  // Auto-sync every 5 minutes when sync is enabled
  setInterval(() => {
    if (ctx.syncEnabled && !syncInProgress) pullFromServer();
  }, LodestoneConfig.SYNC_INTERVAL_MS);

  return { syncToServer, pullFromServer, pushLocalOnly, enableSync, disableSync };
};
// ─── Module: conversations ────────────────────────────────────────────────
// ─── Conversations ─────────────────────────────────────────────────────────
// Local-first conversation CRUD. Syncs to server for Pro/Studio tiers.


function LodestoneConversations(ctx) {
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
// ─── Module: messages ────────────────────────────────────────────────
// ─── Messages ──────────────────────────────────────────────────────────────
// Message CRUD, Ollama streaming, brain system prompt injection, and memory extraction.


function LodestoneMessages(ctx) {

  // ─── Brain helpers ──────────────────────────────────────────────────────

  async function injectBrainSystemPrompt(messages, userMessage) {
    try {
      if (!window.electronAPI?.brain?.buildSystemPrompt) return messages;
      const systemPrompt = await window.electronAPI.brain.buildSystemPrompt(userMessage || '');
      if (!systemPrompt || systemPrompt.trim().length < 10) return messages;
      const existingSystemIdx = messages.findIndex(m => m.role === 'system');
      if (existingSystemIdx >= 0) {
        const merged = systemPrompt + '\n\n' + messages[existingSystemIdx].content;
        return messages.map((m, i) => i === existingSystemIdx ? { ...m, content: merged } : m);
      } else {
        return [{ role: 'system', content: systemPrompt }, ...messages];
      }
    } catch (err) {
      console.warn('[Brain] System prompt injection failed:', err);
      return messages;
    }
  }

  async function extractBrainMemories(userMessage, assistantMessage, conversationId) {
    try {
      if (!window.electronAPI?.brain?.extractMemories) return;
      const userExtracted = await window.electronAPI.brain.extractMemories(userMessage);
      const assistantExtracted = await window.electronAPI.brain.extractMemories(assistantMessage);
      const allExtracted = [...(userExtracted || []), ...(assistantExtracted || [])];
      if (allExtracted.length > 0) {
        await window.electronAPI.brain.ingestMemories(allExtracted);
        console.log(`[Brain] Extracted ${allExtracted.length} memories from conversation turn`);
      }
      // Deep extraction runs in background (non-blocking, uses cheap model)
      if (window.electronAPI?.brain?.deepExtract) {
        window.electronAPI.brain.deepExtract(
          [{ role: 'user', content: userMessage }, { role: 'assistant', content: assistantMessage }],
          null
        ).catch(err => console.warn('[Brain] Deep extraction failed:', err));
      }
      // Behavioral learning: detect corrections
      if (userMessage && assistantMessage && window.electronAPI?.brain?.detectCorrection) {
        const correction = await window.electronAPI.brain.detectCorrection(userMessage, assistantMessage);
        if (correction) {
          console.log(`[Brain] Detected correction: ${correction.extracted_rule}`);
          if (window.electronAPI?.brain?.learnFromCorrection) {
            await window.electronAPI.brain.learnFromCorrection(correction);
          }
        }
      }
    } catch (err) {
      console.warn('[Brain] Memory extraction failed:', err);
    }
  }

  // ─── Ollama streaming ───────────────────────────────────────────────────

  async function streamFromOllama(messages, model, onChunk, onDone, onError) {
    const ollamaUrl = storage.getOllamaUrl();
    const ollamaModel = model || storage.getOllamaModel();

    try {
      const res = await ctx.originalFetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ollamaModel, messages, stream: true }),
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
            if (parsed.done) { onDone(fullContent); return; }
          } catch (e) { /* skip malformed lines */ }
        }
      }
      onDone(fullContent);
    } catch (err) {
      onError(err);
    }
  }

  async function createOllamaStream(messages, model) {
    const encoder = new TextEncoder();
    const ollamaUrl = storage.getOllamaUrl();
    const ollamaModel = model || storage.getOllamaModel();

    return new ReadableStream({
      async start(controller) {
        try {
          const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
          const enrichedMessages = await injectBrainSystemPrompt(messages, userMessage);

          const res = await ctx.originalFetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: ollamaModel, messages: enrichedMessages, stream: true }),
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
                  const sseEvent = `data: ${JSON.stringify({
                    type: 'content', content: parsed.message.content, conversation_id: conversationId,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(sseEvent));
                }
                if (parsed.done) {
                  // Save messages to local DB
                  if (window.electronAPI?.db && messages.length > 0) {
                    try {
                      const conv = await window.electronAPI.db.createConversation({
                        title: messages[0]?.content?.substring(0, 50) || 'New chat',
                        model: ollamaModel, provider: 'ollama',
                      });
                      conversationId = conv.id;
                      for (const msg of messages) {
                        await window.electronAPI.db.addMessage({
                          conversation_id: conv.id, role: msg.role, content: msg.content,
                          model: ollamaModel, provider: 'ollama',
                        });
                      }
                      await window.electronAPI.db.addMessage({
                        conversation_id: conv.id, role: 'assistant', content: fullContent,
                        model: ollamaModel, provider: 'ollama', tokens_used: parsed.eval_count || null,
                      });
                      events.emit(events.CONVERSATIONS_CHANGED);
                      extractBrainMemories(userMessage, fullContent, conv.id);
                    } catch (dbErr) {
                      console.warn('[Lodestone] Failed to save chat to local DB:', dbErr);
                    }
                  }
                  const doneEvent = `data: ${JSON.stringify({
                    type: 'done', conversation_id: conversationId,
                    tokens: { prompt: parsed.prompt_eval_count, completion: parsed.eval_count },
                  })}\n\n`;
                  controller.enqueue(encoder.encode(doneEvent));
                }
              } catch (e) { /* skip */ }
            }
          }
          controller.close();
        } catch (err) {
          const errorEvent = `data: ${JSON.stringify({ error: err.message, type: 'error' })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      },
    });
  }

  // ─── Message CRUD ───────────────────────────────────────────────────────

  // GET /api/chat/conversations/:id/messages
  async function listMessages(convId) {
    const msgs = await window.electronAPI.db.getMessages(convId);
    return new Response(JSON.stringify({ messages: msgs }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // POST /api/chat/conversations/:id/messages
  async function addMessage(convId, init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const msg = await window.electronAPI.db.addMessage({
      conversation_id: convId,
      role: body.role,
      content: body.content,
      model: body.model,
      provider: body.provider,
      tokens_used: body.tokens_used,
    });
    ctx.sync.syncToServer(`/api/chat/conversations/${convId}/messages`, 'POST', msg);

    // Brain: Extract memories from messages
    if (body.role === 'assistant' && body.content) {
      try {
        const msgs = await window.electronAPI.db.getMessages(convId);
        const lastUserMsg = msgs?.filter(m => m.role === 'user').pop()?.content || '';
        extractBrainMemories(lastUserMsg, body.content, convId);
      } catch (e) {
        extractBrainMemories('', body.content, convId);
      }
    }

    return new Response(JSON.stringify(msg), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ─── Chat helpers (Community fallback) ───────────────────────────────────

  async function getGreeting() {
    try {
      const memories = await window.electronAPI.db.listMemories({ limit: 50 });
      const identity = await window.electronAPI.brain?.getIdentity?.() || {};
      const hour = new Date().getHours();
      const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      const name = identity?.name || 'friend';
      const context = { recentTopics: memories?.slice(0, 5).map((m) => m.content?.split(' ').slice(0, 4).join(' ')).filter(Boolean) || [] };
      const suggestions = [
        { icon: '💡', label: 'Explain a concept', prompt: 'Explain ' },
        { icon: '🔍', label: 'Search the web', prompt: 'Search for ' },
        { icon: '🧠', label: 'Brainstorm ideas', prompt: 'Brainstorm ideas for ' },
        { icon: '⏰', label: 'Set a reminder', prompt: 'Remind me to ' },
      ];
      return new Response(JSON.stringify({
        greeting: `${timeGreeting}, ${name}!`, agentName: identity?.name || 'Lodestone', context, suggestions,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ greeting: 'Hello!', agentName: 'Lodestone', context: {}, suggestions: [] }), { headers: { 'content-type': 'application/json' } });
    }
  }

  return { injectBrainSystemPrompt, extractBrainMemories, streamFromOllama, createOllamaStream, listMessages, addMessage, getGreeting };
};
// ─── Module: memories ────────────────────────────────────────────────
// ─── Memories & Commitments ────────────────────────────────────────────────
// Local-first memory/commitment CRUD and knowledge graph construction.


function LodestoneMemories(ctx) {

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
      console.log('[Lodestone] Graph fetch — building locally from memories');

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
        console.log('[Lodestone] Could not add identity nodes to graph:', e.message);
      }

      const allMemories = [...memories, ...identityNodes];

      if (allMemories.length === 0) {
        console.log('[Lodestone] No memories or identity data for graph');
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
          console.log('[Lodestone] Could not fetch edges from server, generating locally');
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

      console.log('[Lodestone] Graph built locally:', nodes.length, 'nodes,', formattedEdges.length, 'edges');
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
// ─── Module: brain ────────────────────────────────────────────────
// ─── Brain (Local Agent Intelligence) ──────────────────────────────────────
// All brain endpoints are local-first — no server sync needed.
// Identity, memory engine, commitment tracking, heartbeat, self-improvement.

function LodestoneBrain(ctx) {

  // ─── Soul ──────────────────────────────────────────────────────────────

  async function getSoul() {
    const soul = await window.electronAPI.brain.getSoul();
    return new Response(JSON.stringify(soul || { content: '' }), { headers: { 'content-type': 'application/json' } });
  }

  async function setSoul(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const soul = await window.electronAPI.brain.setSoul(body.content);
    return new Response(JSON.stringify(soul), { headers: { 'content-type': 'application/json' } });
  }

  // ─── Identity ──────────────────────────────────────────────────────────

  async function getIdentity() {
    const identity = await window.electronAPI.brain.getIdentity();
    return new Response(JSON.stringify(identity || {}), { headers: { 'content-type': 'application/json' } });
  }

  async function setIdentity(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const identity = await window.electronAPI.brain.setIdentity(body);
    return new Response(JSON.stringify(identity), { headers: { 'content-type': 'application/json' } });
  }

  // ─── Rules ─────────────────────────────────────────────────────────────

  async function getRules() {
    const rules = await window.electronAPI.brain.getRules();
    return new Response(JSON.stringify({ rules }), { headers: { 'content-type': 'application/json' } });
  }

  async function addRule(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const id = await window.electronAPI.brain.addRule(body.rule, body.category, body.priority);
    return new Response(JSON.stringify({ id }), { headers: { 'content-type': 'application/json' } });
  }

  async function removeRule(url) {
    const match = url.match(/^\/api\/brain\/rules\/(\d+)$/);
    if (!match) return null;
    await window.electronAPI.brain.removeRule(parseInt(match[1]));
    return new Response(JSON.stringify({ success: true }), { headers: { 'content-type': 'application/json' } });
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────

  async function getHeartbeat() {
    const heartbeat = await window.electronAPI.brain.getHeartbeat();
    return new Response(JSON.stringify(heartbeat || {}), { headers: { 'content-type': 'application/json' } });
  }

  async function setHeartbeat(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const heartbeat = await window.electronAPI.brain.setHeartbeat(body);
    return new Response(JSON.stringify(heartbeat), { headers: { 'content-type': 'application/json' } });
  }

  // ─── User Profile ──────────────────────────────────────────────────────

  async function getUserProfile() {
    const profile = await window.electronAPI.brain.getUserProfile();
    return new Response(JSON.stringify(profile || {}), { headers: { 'content-type': 'application/json' } });
  }

  async function setUserProfile(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const profile = await window.electronAPI.brain.setUserProfile(body);
    return new Response(JSON.stringify(profile), { headers: { 'content-type': 'application/json' } });
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────

  async function getDashboard() {
    const dashboard = await window.electronAPI.brain.heartbeat();
    return new Response(JSON.stringify(dashboard), { headers: { 'content-type': 'application/json' } });
  }

  // ─── Knowledge ─────────────────────────────────────────────────────────

  async function searchKnowledge(url) {
    const params = new URL(url, 'http://localhost').searchParams;
    const query = params.get('q') || '';
    const limit = parseInt(params.get('limit') || '10');
    const results = await window.electronAPI.brain.smartRetrieve(query, limit);
    return new Response(JSON.stringify({ results }), { headers: { 'content-type': 'application/json' } });
  }

  async function getRelatedEntities(url) {
    const match = url.match(/^\/api\/brain\/knowledge\/entities\/([^/]+)\/related$/);
    if (!match) return null;
    const depth = parseInt(new URL(url, 'http://localhost').searchParams.get('depth') || '2');
    const related = await window.electronAPI.brain.getRelatedEntities(match[1], depth);
    return new Response(JSON.stringify({ related }), { headers: { 'content-type': 'application/json' } });
  }

  async function extractEntities(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const entities = await window.electronAPI.brain.extractEntities(body.text || '');
    return new Response(JSON.stringify({ entities }), { headers: { 'content-type': 'application/json' } });
  }

  // ─── Self-Improvement ───────────────────────────────────────────────────

  async function createPrediction(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const pred = await window.electronAPI.brain.createPrediction(body);
    return new Response(JSON.stringify(pred), { headers: { 'content-type': 'application/json' } });
  }

  async function getPredictions(url) {
    const params = new URL(url, 'http://localhost').searchParams;
    const status = params.get('status') || 'active';
    const predictions = await window.electronAPI.brain.getPredictions(status);
    return new Response(JSON.stringify({ predictions }), { headers: { 'content-type': 'application/json' } });
  }

  async function resolvePrediction(url, init) {
    const match = url.match(/^\/api\/brain\/predictions\/([^/]+)\/resolve$/);
    if (!match) return null;
    const body = init?.body ? JSON.parse(init.body) : {};
    const resolved = await window.electronAPI.brain.resolvePrediction(match[1], body.outcome, body.correct);
    return new Response(JSON.stringify(resolved), { headers: { 'content-type': 'application/json' } });
  }

  async function getCalibration() {
    const calibration = await window.electronAPI.brain.getCalibration();
    return new Response(JSON.stringify(calibration), { headers: { 'content-type': 'application/json' } });
  }

  async function detectDrift(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const drift = await window.electronAPI.brain.detectDrift(body.messages || []);
    return new Response(JSON.stringify(drift), { headers: { 'content-type': 'application/json' } });
  }

  async function detectCorrection(init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const correction = await window.electronAPI.brain.detectCorrection(body.userMessage, body.assistantMessage);
    if (correction) {
      const learned = await window.electronAPI.brain.learnFromCorrection(correction);
      return new Response(JSON.stringify({ correction, learned }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ correction: null }), { headers: { 'content-type': 'application/json' } });
  }

  async function runSleepCycle() {
    const report = await window.electronAPI.brain.runSleepCycle();
    return new Response(JSON.stringify(report), { headers: { 'content-type': 'application/json' } });
  }

  return {
    getSoul, setSoul,
    getIdentity, setIdentity,
    getRules, addRule, removeRule,
    getHeartbeat, setHeartbeat,
    getUserProfile, setUserProfile,
    getDashboard,
    searchKnowledge, getRelatedEntities, extractEntities,
    createPrediction, getPredictions, resolvePrediction,
    getCalibration, detectDrift, detectCorrection, runSleepCycle,
  };
};
// ─── Module: dl-tools ────────────────────────────────────────────────
// ─── Desktop Tool Execution ────────────────────────────────────────────────
// Runs local tools without hitting the server. Falls back to server for tools
// that need API access (weather, web_search, generate_image, etc.).


function LodestoneTools(ctx) {

  async function execute(name, args) {
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
          ctx.sync.syncToServer('/api/memory', 'POST', mem);
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
          ctx.sync.syncToServer('/api/chat/commitments', 'POST', com);
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

        // ── Calculator (local JS, safe eval) ──
        case 'calculator': {
          try {
            // Safe math evaluation — only allow numbers, operators, and math functions
            const expr = args.expression.replace(/[^0-9+\-*/().%\s^piePIEsincotaglqrtabflorpw]/g, '');
            // Use explicit Math object instead of with(Math) for security and strict mode compatibility
            const mathExpr = expr
              .replace(/\bsin\b/g, 'Math.sin')
              .replace(/\bcos\b/g, 'Math.cos')
              .replace(/\btan\b/g, 'Math.tan')
              .replace(/\basin\b/g, 'Math.asin')
              .replace(/\bacos\b/g, 'Math.acos')
              .replace(/\batan\b/g, 'Math.atan')
              .replace(/\blog\b/g, 'Math.log')
              .replace(/\bln\b/g, 'Math.log')
              .replace(/\bsqrt\b/g, 'Math.sqrt')
              .replace(/\babs\b/g, 'Math.abs')
              .replace(/\bfloor\b/g, 'Math.floor')
              .replace(/\bceil\b/g, 'Math.ceil')
              .replace(/\bround\b/g, 'Math.round')
              .replace(/\bpow\b/g, 'Math.pow')
              .replace(/\bPI\b/g, 'Math.PI')
              .replace(/\bE\b/g, 'Math.E')
              .replace(/\^/g, '**');
            const fn = new Function(`"use strict"; return(${mathExpr})`);
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

        // ── Server-only tools (fall through) ──
        case 'weather':
        case 'web_search':
        case 'web_fetch':
        case 'analyze_file':
        case 'generate_image':
        case 'create_qr':
        case 'create_note':
          return null; // Signal to caller to use server

        // ── Desktop System Tools ──
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
          const cronExpr = LodestoneConfig.SCHEDULER_PRESETS[args.preset] || args.preset || '0 9 * * *'; // default: daily 9am
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

  return { execute };
};
// ─── Module: fetch-override ────────────────────────────────────────────────
// ─── Fetch Override Router ─────────────────────────────────────────────────
// The main window.fetch override that intercepts API calls and routes them
// to local DB, Ollama, or passes through to the server.


function LodestoneFetchOverride(ctx) {

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
// ─── Entry point ────────────────────────────────────────────────────────
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
  const ctx = {
    currentTier: null,
    syncEnabled: false,
    originalFetch: window.__original_fetch || window.fetch,
  };
  window.__original_fetch = ctx.originalFetch;

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
    const ollamaUrl = localStorage.getItem('lodestone_ollama_url') || 'http://localhost:11434';
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

  console.log('[Lodestone] Local-first data layer initialized. All tiers use local DB. Ollama routing active.');
})();