// ─── Shell / Command Execution Tools ──────────────────────────────────────
// Restricted command execution with shell injection protection.

const { execFile } = require("child_process");
const { FILE_TIERS } = require("./filesystem");

const ALLOWED_COMMANDS = [
  "ls", "pwd", "whoami", "date", "uptime", "df", "du", "cat", "head", "tail",
  "wc", "echo", "which", "env", "printenv", "hostname", "uname", "sw_vers",
  "system_profiler", "networksetup", "ifconfig", "ping", "curl", "wget",
  "git status", "git log", "git diff", "git branch",
  "node -v", "python3 --version", "npm -v", "brew list",
];

function register(mainWindow, store, auditLog) {
  const { ipcMain } = require("electron");

  ipcMain.handle("tool:run-command", async (_e, command, timeout = 10) => {
    const tier = store.get("file-access-tier", "standard");
    const fullCmd = command.trim();

    // Block dangerous patterns
    const blockedPatterns = [
      /\brm\s+-rf\s+\//, /\brm\s+-rf\s+~/, /\bdd\s/, /\bmkfs/,
      /\bformat\b/i, /\bshutdown\b/, /\breboot\b/, /\bhalt\b/,
      />\s*\/etc\//, /\bchmod\s+777/, /\bchown\b/,
      /\bcurl\s+.*\|\s*sh/, /\bwget\s+.*\|\s*sh/,
      /`.*`/, /\$\(.*\)/,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(fullCmd)) {
        auditLog("run-command", fullCmd, "BLOCKED: dangerous pattern", tier);
        return { error: "Command blocked: contains potentially destructive pattern" };
      }
    }

    // Parse the first word (command binary) and check against allowlist
    // This prevents "git status; rm -rf /" bypassing the git status check
    const firstWord = fullCmd.split(/\s+/)[0];
    const isAllowed = ALLOWED_COMMANDS.some(ac => {
      const acCmd = ac.split(/\s+/)[0];
      return firstWord === acCmd || fullCmd === ac;
    });
    if (!isAllowed) {
      auditLog("run-command", fullCmd, `BLOCKED: not in allowlist`, tier);
      return { error: `Command not allowed: ${fullCmd.split(" ")[0]}. Allowed: ${ALLOWED_COMMANDS.join(", ")}` };
    }

    // Block shell metacharacters to prevent injection
    // (already checked blockedPatterns above, but also strip from execution)
    const sanitizedCmd = fullCmd.replace(/[;&|`$()]/g, '');
    if (sanitizedCmd !== fullCmd) {
      auditLog("run-command", fullCmd, "BLOCKED: shell metacharacters", tier);
      return { error: "Command blocked: contains shell metacharacters (;, &, |, `, $, parentheses)" };
    }

    // Minimal tier: no commands
    if (tier === "minimal" || tier === "none") {
      return { error: `Command execution not available under "${FILE_TIERS[tier]?.label}" tier.` };
    }

    const timeoutMs = Math.min((timeout || 10) * 1000, 30000);

    try {
      const output = await new Promise((resolve, reject) => {
        execFile("sh", ["-c", fullCmd], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
      });
      auditLog("run-command", fullCmd, `OK: ${(output.stdout || "").substring(0, 100)}`, tier);
      return { output: output.stdout, error: output.stderr || null, exitCode: 0 };
    } catch (err) {
      auditLog("run-command", fullCmd, `ERROR: ${err.message}`, tier);
      return { error: err.message, exitCode: 1 };
    }
  });
}

module.exports = { register, ALLOWED_COMMANDS };