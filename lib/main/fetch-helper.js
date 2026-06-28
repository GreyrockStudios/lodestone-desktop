// ─── Lodestone Desktop — Fetch Helper ────────────────────────────────────────
// Uses Node's https module for API proxy requests.
// fetchWithNode: buffered (for normal API calls)
// fetchWithNodeStreaming: returns Node Readable stream (for SSE)

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

// Streaming version — returns the raw Node.js http.IncomingMessage stream
// Used for SSE endpoints where tokens must flow in real-time.
function fetchWithNodeStreaming(url, method = "GET", body = null, headers = {}) {
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
        return fetchWithNodeStreaming(redirectUrl, method, body, headers).then(resolve).catch(reject);
      }
      const respHeaders = {};
      for (const [key, value] of Object.entries(res.headers)) {
        if (key.toLowerCase() !== "transfer-encoding") respHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
      }
      respHeaders["access-control-allow-origin"] = "*";
      respHeaders["cache-control"] = "no-cache";
      respHeaders["x-accel-buffering"] = "no";
      // Return the stream directly — caller converts to web ReadableStream
      resolve({ status: res.statusCode, headers: respHeaders, stream: res });
    });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
    req.on("error", reject);
  });
}

module.exports = { fetchWithNode, fetchWithNodeStreaming };