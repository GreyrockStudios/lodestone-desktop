// ─── Lodestone Desktop — Fetch Helper ────────────────────────────────────────
// Uses Node's https module to avoid Electron net.fetch duplex bug.
// Two modes: buffered (for regular API calls) and streaming (for SSE endpoints).

const https = require("https");

function fetchWithNode(url, method = "GET", body = null, headers = {}, timeoutMs = 0) {
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
        return fetchWithNode(redirectUrl, method, body, headers, timeoutMs).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const respBody = Buffer.concat(chunks).toString("utf-8");
        resolve({ status: res.statusCode, headers: res.headers, body: respBody, contentType: (res.headers["content-type"] || "") });
      });
      res.on("error", reject);
    });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
    req.on("error", reject);
    if (timeoutMs > 0) {
      req.setTimeout(timeoutMs, () => {
        console.debug(`[Lodestone] Request timeout after ${timeoutMs}ms for ${url.substring(0, 60)}`);
        req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
      });
    }
  });
}

// Streaming variant for SSE endpoints.
// Uses a pull-based ReadableStream with a queue to reliably deliver
// SSE data in Electron's protocol.handle context.
// The start() pattern doesn't work reliably — data events fire before
// the renderer starts consuming, causing chunks to be lost.
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

      const responseHeaders = {};
      for (const [key, value] of Object.entries(res.headers)) {
        if (key.toLowerCase() !== "transfer-encoding") responseHeaders[key] = value;
      }

      // Pull-based ReadableStream: queues chunks until the renderer pulls them.
      // This is the reliable pattern for Electron's protocol.handle.
      const chunkQueue = [];
      let streamDone = false;
      let streamError = null;
      let pullResolve = null;

      const tryEnqueue = () => {
        if (pullResolve) {
          if (chunkQueue.length > 0) {
            const chunk = chunkQueue.shift();
            pullResolve({ done: false, value: new Uint8Array(chunk) });
            pullResolve = null;
          } else if (streamDone) {
            pullResolve({ done: true });
            pullResolve = null;
          } else if (streamError) {
            pullReject(streamError);
            pullReject = null;
          }
        }
      };

      let pullReject = null;

      const stream = new ReadableStream({
        pull(controller) {
          return new Promise((resolve, reject) => {
            if (chunkQueue.length > 0) {
              const chunk = chunkQueue.shift();
              resolve({ done: false, value: new Uint8Array(chunk) });
            } else if (streamDone) {
              resolve({ done: true });
            } else if (streamError) {
              reject(streamError);
            } else {
              pullResolve = resolve;
              pullReject = reject;
            }
          });
        },
        cancel() {
          req.destroy();
        },
      });

      res.on("data", (chunk) => {
        chunkQueue.push(chunk);
        tryEnqueue();
      });

      res.on("end", () => {
        streamDone = true;
        tryEnqueue();
      });

      res.on("error", (err) => {
        streamError = err;
        tryEnqueue();
      });

      resolve({
        status: res.statusCode,
        headers: responseHeaders,
        stream,
        contentType: (res.headers["content-type"] || ""),
      });
    });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
    req.on("error", reject);
  });
}

module.exports = { fetchWithNode, fetchWithNodeStreaming };