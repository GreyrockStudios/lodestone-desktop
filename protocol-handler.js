// ─── Lodestone Protocol Handler — Local-First Architecture ──────────────────
// Serves UI from bundled local files (ui/ directory).
// Only /api/ requests are proxied to the server.
// Falls back to network for missing local assets.

const path = require("path");
const fs = require("fs");

const UI_DIR = path.join(__dirname, "ui");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
};

function createProtocolHandler({ fetchWithNode, fetchWithNodeStreaming, DESKTOP_DETECT_SCRIPT, communityDataLayerLoader, communityDataLayerScript }) {
  // Pre-load and cache the local index.html with injected scripts
  let localIndexHtml = null;
  try {
    let html = fs.readFileSync(path.join(UI_DIR, "index.html"), "utf-8");
    html = html.replace(/<head([^>]*)>/i, `<head$1><script>${DESKTOP_DETECT_SCRIPT}<\/script><script>${communityDataLayerLoader}<\/script>`);
    localIndexHtml = html;
    console.debug("[Lodestone] Loaded local index.html with desktop detection injected");
  } catch (e) {
    console.error("[Lodestone] Failed to load local index.html:", e.message);
  }

  return async function handleProtocol(request) {
    // Serve the data layer JS file directly (avoids 44KB inline script)
    if (request.url.includes("lodestone-data-layer.js")) {
      // Serve the data layer JS file
      return new Response(communityDataLayerScript, {
        status: 200,
        headers: { "content-type": "application/javascript", "access-control-allow-origin": "*", "X-Content-Type-Options": "nosniff", "X-Content-Type-Options": "nosniff" },
      });
    }

    // Parse the URL to determine the path
    let urlPath = request.url.replace("lodestone://app.heylodestone.com", "");
    const hashIdx = urlPath.indexOf("#");
    if (hashIdx !== -1) urlPath = urlPath.substring(0, hashIdx);
    const queryIdx = urlPath.indexOf("?");
    if (queryIdx !== -1) urlPath = urlPath.substring(0, queryIdx);

    // ─── API requests: proxy to api.heylodestone.com ───
    if (urlPath.startsWith("/api/")) {
      let realUrl = request.url.replace("lodestone://app.heylodestone.com", "https://api.heylodestone.com");
      const hIdx = realUrl.indexOf("#");
      if (hIdx !== -1) realUrl = realUrl.substring(0, hIdx);

      // SSE/streaming endpoints — must stream incrementally, not buffer
      const isSSE = urlPath.includes("/stream") || urlPath.includes("/sse") || urlPath.includes("/events");

      try {
        let body = null;
        if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
          const reader = request.body.getReader();
          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          body = chunks.map(c => new TextDecoder().decode(c)).join("");
        }
        const reqHeaders = {};
        for (const [key, value] of request.headers.entries()) {
          if (key.toLowerCase() !== "host" && key.toLowerCase() !== "origin" && key.toLowerCase() !== "referer") {
            reqHeaders[key] = value;
          }
        }

        if (isSSE) {
          // SSE/streaming: two strategies depending on the endpoint.
          // chat/stream: buffer the full response (Electron's protocol.handle ReadableStream
          // doesn't deliver data to renderer reliably). The client parses SSE events from the body.
          // notifications/stream: this is a long-lived EventSource connection that must stay open.
          // We can't buffer it (it never completes). We also can't stream it through protocol.handle.
          // Instead, we make a long-lived connection but cap it at 60s, then reconnect.
          const isLongLivedStream = urlPath.includes("/notifications/stream") || urlPath.includes("/events");
          const res = await fetchWithNode(realUrl, request.method, body, reqHeaders, isLongLivedStream ? 60000 : 0);
          const headers = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (key.toLowerCase() !== "transfer-encoding") headers[key] = value;
          }
          headers["access-control-allow-origin"] = "*";
          headers["content-type"] = "text/event-stream";
          headers["cache-control"] = "no-cache";
          return new Response(res.body, { status: res.status, headers });
        } else {
          // Buffered: regular API call
          const res = await fetchWithNode(realUrl, request.method, body, reqHeaders);
          const headers = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (key.toLowerCase() !== "transfer-encoding") headers[key] = value;
          }
          headers["access-control-allow-origin"] = "*";
          return new Response(res.body, { status: res.status, headers });
        }
      } catch (e) {
        console.error("[Lodestone] API proxy error:", e.message);
        return new Response(JSON.stringify({ error: "Network error" }), {
          status: 502,
          headers: { "content-type": "application/json", "access-control-allow-origin": "*", "X-Content-Type-Options": "nosniff" },
        });
      }
    }

    // ─── Parse the full URL for path classification ───
    const parsedUrl = new URL(request.url.replace("lodestone://", "https://"));
    const isAssetRequest = parsedUrl.pathname.startsWith("/assets/") || parsedUrl.pathname.startsWith("/lodestone");
    const hasFileExtension = parsedUrl.pathname.includes(".") && !parsedUrl.pathname.endsWith("/");

    // ─── HTML page requests: serve local index.html ───
    // All non-API, non-asset paths serve index.html (SPA routing)
    if (!isAssetRequest && !hasFileExtension) {
      if (localIndexHtml) {
        return new Response(localIndexHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*", "X-Content-Type-Options": "nosniff" },
        });
      }
      // Fall through to network if local file not available
    }

    // ─── Static asset requests: serve from local ui/ directory ───
    if (isAssetRequest || hasFileExtension) {
      // Normalize the URL path to OS-specific separators for proper path resolution
      const normalizedPath = parsedUrl.pathname.replace(/\//g, path.sep);
      const localPath = path.resolve(UI_DIR, normalizedPath);
      // Prevent path traversal: resolved path must be within UI_DIR
      // Use case-insensitive comparison on Windows and normalize separators
      const normalizedLocal = path.normalize(localPath).toLowerCase();
      const normalizedUI = path.normalize(UI_DIR).toLowerCase();
      if (!normalizedLocal.startsWith(normalizedUI + path.sep) && normalizedLocal !== normalizedUI) {
        console.error("[Lodestone] Path traversal blocked:", localPath, "UI_DIR:", UI_DIR);
        return new Response("Forbidden", { status: 403 });
      }
      try {
        const stat = fs.statSync(localPath);
        if (stat.isFile()) {
          const ext = path.extname(localPath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          return new Response(fs.readFileSync(localPath), {
            status: 200,
            headers: { "content-type": contentType, "access-control-allow-origin": "*", "X-Content-Type-Options": "nosniff", "cache-control": "public, max-age=86400" },
          });
        }
      } catch (e) {
        // File not found locally — fall through to network fetch
      }
    }

    // ─── Network fallback: fetch from heylodestone.com (marketing site) ───
    let realUrl = request.url.replace("lodestone://app.", "https://");
    const rHashIdx = realUrl.indexOf("#");
    if (rHashIdx !== -1) realUrl = realUrl.substring(0, rHashIdx);

    // Only allow network fetches to known Lodestone hosts (prevent SSRF)
    const ALLOWED_HOSTS = ["heylodestone.com", "www.heylodestone.com", "api.heylodestone.com"];
    const netParsed = new URL(realUrl);
    if (!ALLOWED_HOSTS.includes(netParsed.hostname)) {
      return new Response("Forbidden: disallowed host", { status: 403 });
    }
    if (!netParsed.pathname.startsWith("/api/") && !netParsed.pathname.startsWith("/assets/") && !netParsed.pathname.startsWith("/lodestone") && netParsed.pathname !== "/" && !netParsed.pathname.includes(".")) {
      realUrl = `https://${netParsed.hostname}/`;
    }


    try {
      let body = null;
      if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
        const reader = request.body.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        body = chunks.map(c => new TextDecoder().decode(c)).join("");
      }
      const reqHeaders = {};
      for (const [key, value] of request.headers.entries()) {
        if (key.toLowerCase() !== "host" && key.toLowerCase() !== "origin" && key.toLowerCase() !== "referer") {
          reqHeaders[key] = value;
        }
      }
      const res = await fetchWithNode(realUrl, request.method, body, reqHeaders);

      if (res.contentType.includes("text/html")) {
        let html = res.body;
        // Only inject scripts if we don't have a local HTML cached
        if (!localIndexHtml) {
          html = html.replace(/<head([^>]*)>/i, `<head$1><script>${DESKTOP_DETECT_SCRIPT}<\/script><script>${communityDataLayerLoader}<\/script>`);
        }
        return new Response(html, {
          status: res.status,
          headers: { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*", "X-Content-Type-Options": "nosniff" },
        });
      }

      const headers = {};
      for (const [key, value] of Object.entries(res.headers)) {
        if (key.toLowerCase() !== "transfer-encoding") headers[key] = value;
      }
      headers["access-control-allow-origin"] = "*";
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      console.error("[Lodestone] Protocol error:", e.message || e);
      // If we have local HTML and the network is down, serve it as offline fallback
      if (localIndexHtml) {
        return new Response(localIndexHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*", "X-Content-Type-Options": "nosniff" },
        });
      }
      return new Response(
        `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#888;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh"><div><h2>Connection Error</h2><p>Could not load the app. Please check your internet connection and try again.</p></div></body></html>`,
        { status: 502, headers: { "content-type": "text/html" } }
      );
    }
  };
}

module.exports = { createProtocolHandler, UI_DIR };