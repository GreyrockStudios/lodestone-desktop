// ─── Filesystem Tools ──────────────────────────────────────────────────────
// File read/write/list/search/move/delete, tier-gated access, folder picker.

const { dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const HOME = os.homedir();

// ─── File Access Tiers ────────────────────────────────────────────────────
const FILE_TIERS = {
  none: {
    label: "None",
    description: "No file system access. The AI cannot read, write, or search any files.",
    dirs: [],
    blocked: [],
    writable: [],
  },
  minimal: {
    label: "Minimal",
    description: "Read-only access to Desktop, Documents, and Downloads folders.",
    dirs: [
      path.join(HOME, "Desktop"),
      path.join(HOME, "Documents"),
      path.join(HOME, "Downloads"),
    ],
    blocked: [],
    writable: [],
  },
  standard: {
    label: "Standard",
    description: "Read/write your home directory, temp, and applications. Can't access secrets or system files.",
    dirs: [HOME, "/tmp", "/Applications"],
    blocked: [
      path.join(HOME, ".ssh"),
      path.join(HOME, ".gnupg"),
      path.join(HOME, ".keychain"),
      path.join(HOME, ".lodestone"),
      path.join(HOME, ".secrets"),
      "/etc/shadow",
      "/etc/ssh",
      "/private/var/db/dslocal",
      "/System",
      "/Library/System",
    ],
    writable: [HOME, "/tmp"],
  },
  full: {
    label: "Full Access",
    description: "Full read/write access to everything except a small blocklist of critical system paths.",
    dirs: ["/"],
    blocked: [
      "/etc/shadow",
      "/etc/ssh",
      path.join(HOME, ".ssh"),
      path.join(HOME, ".gnupg"),
      path.join(HOME, ".keychain"),
      path.join(HOME, ".lodestone/local.db"),
    ],
    writable: ["/"],
  },
};

// Extra folders the user explicitly grants (persistent)
function getExtraDirs(store) {
  return store.get("file-access-extra-dirs", []);
}

function addExtraDir(store, dir) {
  const dirs = getExtraDirs(store);
  if (!dirs.includes(dir)) {
    dirs.push(dir);
    store.set("file-access-extra-dirs", dirs);
  }
  return dirs;
}

function removeExtraDir(store, dir) {
  const dirs = getExtraDirs(store).filter(d => d !== dir);
  store.set("file-access-extra-dirs", dirs);
  return dirs;
}

// Check if a path is accessible under the current tier
// Normalize file paths for cross-platform compatibility
// On Windows, forward slashes in user-provided paths need to be normalized
function normalizePath(filePath) {
  // Ensure the path uses the platform's separator and resolve any relative parts
  return path.resolve(path.normalize(filePath));
}

function isPathAllowed(filePath, tier, extraDirs = []) {
  if (tier === "none") return false;
  const config = FILE_TIERS[tier] || FILE_TIERS.standard;
  const resolved = normalizePath(filePath);
  for (const b of config.blocked) {
    if (resolved.toLowerCase().startsWith(b.toLowerCase())) return false;
  }
  const allDirs = [...config.dirs, ...extraDirs];
  for (const dir of allDirs) {
    if (resolved.toLowerCase().startsWith(dir.toLowerCase())) return true;
  }
  return false;
}

// Check if a path is writable under the current tier
function isPathWritable(filePath, tier, extraDirs = []) {
  if (tier === "none" || tier === "minimal") return false;
  const config = FILE_TIERS[tier] || FILE_TIERS.standard;
  const resolved = normalizePath(filePath);
  for (const b of config.blocked) {
    if (resolved.toLowerCase().startsWith(b.toLowerCase())) return false;
  }
  const allWritable = [...config.writable, ...extraDirs];
  for (const dir of allWritable) {
    if (resolved.toLowerCase().startsWith(dir.toLowerCase())) return true;
  }
  return false;
}

function register(mainWindow, store, auditLog) {
  // ── File Access Tier Management ──────────────────────────────────────────

  const { ipcMain } = require("electron");

  ipcMain.handle("tool:get-file-tier", async () => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    return {
      tier,
      config: FILE_TIERS[tier],
      extraDirs,
      allTiers: Object.entries(FILE_TIERS).map(([key, val]) => ({
        id: key,
        label: val.label,
        description: val.description,
        dirs: val.dirs,
        writable: val.writable,
      })),
    };
  });

  ipcMain.handle("tool:set-file-tier", async (_e, tier) => {
    if (!FILE_TIERS[tier]) return { error: `Invalid tier: ${tier}. Use: none, minimal, standard, full` };
    store.set("file-access-tier", tier);
    auditLog("set-file-tier", tier, "OK", tier);
    return { success: true, tier, config: FILE_TIERS[tier] };
  });

  ipcMain.handle("tool:add-file-dir", async (_e, dir) => {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) return { error: `Directory does not exist: ${resolved}` };
    const dirs = addExtraDir(store, resolved);
    auditLog("add-file-dir", resolved, "OK", store.get("file-access-tier"));
    return { success: true, extraDirs: dirs };
  });

  ipcMain.handle("tool:remove-file-dir", async (_e, dir) => {
    const dirs = removeExtraDir(store, path.resolve(dir));
    auditLog("remove-file-dir", dir, "OK", store.get("file-access-tier"));
    return { success: true, extraDirs: dirs };
  });

  // ── File Operations (tier-gated) ──────────────────────────────────────────

  ipcMain.handle("tool:list-directory", async (_e, dirPath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(dirPath, tier, extraDirs)) {
      auditLog("list-directory", dirPath, "BLOCKED", tier);
      return { error: `Access denied: path not allowed under "${FILE_TIERS[tier]?.label}" tier. Go to Settings > Privacy to increase file access.` };
    }
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const result = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : e.isFile() ? "file" : "other",
        path: path.join(dirPath, e.name),
      }));
      auditLog("list-directory", dirPath, `OK: ${result.length} entries`, tier);
      return { entries: result };
    } catch (err) {
      auditLog("list-directory", dirPath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:read-file", async (_e, filePath, encoding = "utf-8") => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    const resolvedPath = normalizePath(filePath);
    if (!isPathAllowed(resolvedPath, tier, extraDirs)) {
      auditLog("read-file", resolvedPath, "BLOCKED", tier);
      return { error: `Access denied: read not allowed under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.size > 1024 * 1024) {
        return { error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB. Max 1MB.` };
      }
      const content = await fs.promises.readFile(resolvedPath, encoding);
      auditLog("read-file", resolvedPath, `OK: ${content.length} bytes`, tier);
      return { content, size: stat.size, modified: stat.mtime.toISOString() };
    } catch (err) {
      auditLog("read-file", resolvedPath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:write-file", async (_e, filePath, content, createDirs = false) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    const resolvedPath = normalizePath(filePath);
    if (!isPathWritable(resolvedPath, tier, extraDirs)) {
      auditLog("write-file", resolvedPath, "BLOCKED", tier);
      if (tier === "minimal" || tier === "none") {
        return { error: `Write access denied: "${FILE_TIERS[tier]?.label}" tier does not allow file writes. Go to Settings > Privacy to increase file access.` };
      }
      return { error: `Access denied: path not writable under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      // Limit content size to 10MB to prevent memory exhaustion
      const MAX_WRITE_SIZE = 10 * 1024 * 1024;
      if (typeof content === 'string' && content.length > MAX_WRITE_SIZE) {
        return { error: `Content too large: ${(content.length / 1024 / 1024).toFixed(1)}MB. Max 10MB.` };
      }
      if (createDirs) {
        await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
      }
      await fs.promises.writeFile(resolvedPath, content, "utf-8");
      auditLog("write-file", resolvedPath, `OK: ${content.length} bytes`, tier);
      return { success: true, path: resolvedPath };
    } catch (err) {
      auditLog("write-file", resolvedPath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:move-file", async (_e, srcPath, destPath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(srcPath, tier, extraDirs) || !isPathWritable(destPath, tier, extraDirs)) {
      auditLog("move-file", `${srcPath} → ${destPath}`, "BLOCKED", tier);
      return { error: "Access denied: path outside allowed directories" };
    }
    try {
      // Check if destination exists to prevent silent overwrite
      try {
        await fs.promises.access(destPath);
        return { error: `Destination already exists: ${destPath}. Use a different path or delete the existing file first.` };
      } catch { /* destination doesn't exist, proceed */ }
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.rename(srcPath, destPath);
      auditLog("move-file", `${srcPath} → ${destPath}`, "OK", tier);
      return { success: true };
    } catch (err) {
      auditLog("move-file", `${srcPath} → ${destPath}`, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:delete-file", async (_e, filePath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathWritable(filePath, tier, extraDirs)) {
      auditLog("delete-file", filePath, "BLOCKED", tier);
      return { error: `Delete not allowed under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      await shell.trashItem(filePath);
      auditLog("delete-file", filePath, "OK: moved to trash", tier);
      return { success: true };
    } catch (err) {
      auditLog("delete-file", filePath, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  ipcMain.handle("tool:search-files", async (_e, dirPath, pattern, maxResults = 50) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(dirPath, tier, extraDirs)) {
      return { error: `Access denied under "${FILE_TIERS[tier]?.label}" tier.` };
    }
    try {
      const results = [];
      // Convert glob pattern (e.g. "*.md") to regex, or use as-is if it looks like regex
      let regex;
      // Limit pattern length to prevent ReDoS
      const MAX_PATTERN_LENGTH = 200;
      if (pattern.length > MAX_PATTERN_LENGTH) {
        return { error: `Pattern too long: ${pattern.length} chars. Max ${MAX_PATTERN_LENGTH}.` };
      }
      try {
        // If pattern contains glob characters, convert them
        const regexPattern = pattern
          .replace(/\./g, '\\.')  // Escape dots
          .replace(/\*/g, '.*')    // * becomes .*
          .replace(/\?/g, '.');      // ? becomes .
        regex = new RegExp(regexPattern, 'i');
      } catch {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }

      async function walk(dir, depth = 0) {
        if (depth > 5 || results.length >= maxResults) return;
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          if (entry.name.startsWith(".")) continue;
          const fullPath = path.join(dir, entry.name);
          if (regex.test(entry.name)) {
            try {
              const stat = await fs.promises.stat(fullPath);
              results.push({ name: entry.name, path: fullPath, size: stat.size, isDirectory: entry.isDirectory() });
            } catch { /* skip inaccessible */ }
          }
          if (entry.isDirectory()) {
            await walk(fullPath, depth + 1);
          }
        }
      }

      await walk(dirPath);
      auditLog("search-files", `${dirPath}/${pattern}`, `OK: ${results.length} results`, tier);
      return { results };
    } catch (err) {
      auditLog("search-files", `${dirPath}/${pattern}`, `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  // ── Pick Folder Dialog (for adding extra dirs) ─────────────────────────────

  ipcMain.handle("tool:pick-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Folder for AI Access",
      buttonLabel: "Grant Access",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const dir = result.filePaths[0];
    const dirs = addExtraDir(store, dir);
    auditLog("pick-folder", dir, "OK: added to extra dirs", store.get("file-access-tier"));
    return { path: dir, extraDirs: dirs };
  });

  // ── Open in Finder ────────────────────────────────────────────────────────

  ipcMain.handle("tool:open-in-finder", async (_e, filePath) => {
    const tier = store.get("file-access-tier", "standard");
    const extraDirs = getExtraDirs(store);
    if (!isPathAllowed(filePath, tier, extraDirs)) {
      return { error: "Access denied" };
    }
    try {
      await shell.showItemInFolder(filePath);
      auditLog("open-in-finder", filePath, "OK", tier);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Allowed Dirs ───────────────────────────────────────────────────────────

  ipcMain.handle("tool:get-allowed-dirs", async () => {
    const tier = store.get("file-access-tier", "standard");
    const config = FILE_TIERS[tier];
    const extraDirs = getExtraDirs(store);
    return { tier, dirs: config.dirs, writable: config.writable, blocked: config.blocked, extraDirs };
  });
}

module.exports = { register, isPathAllowed, isPathWritable, FILE_TIERS, getExtraDirs };