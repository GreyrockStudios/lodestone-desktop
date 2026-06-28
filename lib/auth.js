// ─── Auth & Token Management ───────────────────────────────────────────────
// Proactive token refresh (14-min interval), 401 retry, and tier detection.


module.exports = function initAuth(ctx) {
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