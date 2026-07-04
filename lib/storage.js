// ─── Storage Helpers ────────────────────────────────────────────────────────
// Thin wrappers around localStorage with the lodestone_ prefix convention.


module.exports = {
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
    return localStorage.getItem(LodestoneConfig.OLLAMA_URL_KEY) || null;
  },
  setOllamaUrl(url) {
    localStorage.setItem(LodestoneConfig.OLLAMA_URL_KEY, url);
  },
  getOllamaModel() {
    return localStorage.getItem(LodestoneConfig.LOCAL_MODEL_KEY) || null;
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