// ─── Lodestone Desktop — Constants & Config ──────────────────────────────────
const path = require("path");
const fs = require("fs");

const isDev = process.argv.includes("--dev") || !!process.env.ELECTRON_IS_DEV;

const APP_URL = "https://heylodestone.com";
const API_URL = "https://api.heylodestone.com";
const DEEP_LINK_PROTOCOL = "lodestone";
const START_URL = isDev ? "http://localhost:3000" : "lodestone://app.heylodestone.com/#/login";

// Load the community data layer script (injected into HTML for local data routing)
const communityDataLayerScript = fs.readFileSync(
  path.join(__dirname, "..", "..", "community-data-layer.js"),
  "utf-8"
);

// Instead of inlining the full 44KB data layer script, we serve it as a separate JS file
// and inject a <script src> tag. This avoids HTML bloat and parsing issues.
// The protocol handler serves /lodestone-data-layer.js on demand.
const communityDataLayerLoader = `
if (!window.__lodestone_data_layer_active) {
  var dlScript = document.createElement('script');
  dlScript.src = 'lodestone://app.heylodestone.com/lodestone-data-layer.js';
  dlScript.onload = function() { console.log('[Lodestone] Data layer loaded from external script'); };
  dlScript.onerror = function() { console.warn('[Lodestone] Data layer script failed to load, trying inline fallback'); };
  document.head.appendChild(dlScript);
}
`;

// Desktop detection + API proxy — injected into HTML <head> before SPA bundle loads.
// Since the page runs on lodestone://app.heylodestone.com, relative /api/ paths
// resolve through our protocol handler automatically. We just need to:
// 1. Set __TAURI_INTERNALS__ so the SPA knows it's in desktop mode
// 2. Ensure fetch/XHR requests include credentials
// 3. Watch for 404 on protected routes and redirect to login
const DESKTOP_DETECT_SCRIPT = [
  "window.__TAURI_INTERNALS__={invoke:function(cmd,args){",
  "if(window.electronAPI){switch(cmd){",
  "case'set_badge_count':return window.electronAPI.setBadgeCount(args&&args.count);",
  "case'save_file':return window.electronAPI.saveFile(args&&args.content,args&&args.filename,args&&args.filters);",
  "case'read_file_contents':return window.electronAPI.readFile(args&&args.path);",
  "case'get_app_version':return window.electronAPI.getVersion();",
  "case'get_system_info':return window.electronAPI.getSystemInfo();",
  "case'check_for_updates':return window.electronAPI.checkForUpdates();",
  "default:return Promise.resolve(null);}}return Promise.resolve(null);",
  "}};window.__TAURI__=window.__TAURI_INTERNALS__;",
  "if(document.documentElement)document.documentElement.classList.add('is-tauri');",
  // API proxy: ensure credentials are included on all requests
  "(function(){",
  "if(window.__lodestone_proxy_active)return;",
  "window.__lodestone_proxy_active=true;",
  "var of=window.fetch;",
  "window.fetch=function(i,n){",
  "n=Object.assign({},n||{},{credentials:n&&n.credentials||'include'});",
  "return of.call(this,i,n);",
  "};",
  "var oXHROpen=XMLHttpRequest.prototype.open;",
  "XMLHttpRequest.prototype.open=function(m,u,a,p,w){return oXHROpen.call(this,m,u,a!==false,p,w);};",
  "var oES=window.EventSource;",
  "window.EventSource=function(u,c){return new oES(u,c);};",
  "window.EventSource.prototype=oES.prototype;",
  "})();",
].join("");

module.exports = {
  isDev,
  APP_URL,
  API_URL,
  DEEP_LINK_PROTOCOL,
  START_URL,
  communityDataLayerScript,
  communityDataLayerLoader,
  DESKTOP_DETECT_SCRIPT,
};