// ─── Lodestone Desktop — Fetch Helper ────────────────────────────────────────
// Uses Node's https module to avoid Electron net.fetch duplex bug.
// Only used for buffered (non-streaming) API requests.
// SSE streaming requests use Electron's net.fetch directly via protocol handler.

const https = require("https");

function fetchWithNode(url, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      headers: { ...headers, "User-Agent": "Lodestone-Desktop/1.0" },
    };
    if (body) options.headers["Content-Type"] = options.headers["Content-Type"] || "application/json";
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        return fetchWithNode(redirectUrl, method, body, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const respBody = Buffer.concat(chunks).toString("utf-8");
        const respHeaders = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (key.toLowerCase() !== "transfer-encoding") respHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
        }
        respHeaders["access-control-allow-origin"] = "*";
        resolve({ status: res.statusCode, headers: respHeaders, body: respBody, contentType: res.headers["content-type"] || "" });
      });
      res.on("error", reject);
    });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
    req.on("error", reject);
  });
}

module.exports = { fetchWithNode };