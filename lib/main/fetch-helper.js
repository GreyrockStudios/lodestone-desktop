// ─── Lodestone Desktop — Fetch Helper ────────────────────────────────────────
// Uses Node's https module to avoid Electron net.fetch duplex bug.
// Supports both buffered and streaming responses.

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

      // For SSE/streaming responses, return a ReadableStream instead of buffering
      const contentType = res.headers["content-type"] || "";
      const isStreaming = contentType.includes("text/event-stream") || contentType.includes("text/plain");

      if (isStreaming) {
        // Create a ReadableStream from the Node.js response
        const readable = new ReadableStream({
          start(controller) {
            res.on("data", (chunk) => controller.enqueue(chunk));
            res.on("end", () => controller.close());
            res.on("error", (err) => controller.error(err));
          },
        });

        const respHeaders = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (key.toLowerCase() !== "transfer-encoding") {
            respHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
          }
        }
        respHeaders["access-control-allow-origin"] = "*";

        resolve({
          status: res.statusCode,
          headers: respHeaders,
          body: readable,
          contentType,
        });
      } else {
        // Buffered response (original behavior)
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const respBody = Buffer.concat(chunks).toString("utf-8");
          const respHeaders = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (key.toLowerCase() !== "transfer-encoding") respHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
          }
          respHeaders["access-control-allow-origin"] = "*";
          resolve({ status: res.statusCode, headers: respHeaders, body: respBody, contentType });
        });
        res.on("error", reject);
      }
    });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
    req.on("error", reject);
  });
}

module.exports = { fetchWithNode };