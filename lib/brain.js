// ─── Brain (Local Agent Intelligence) ──────────────────────────────────────
// All brain endpoints are local-first — no server sync needed.
// Identity, memory engine, commitment tracking, heartbeat, self-improvement.

module.exports = function initBrain(ctx) {

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