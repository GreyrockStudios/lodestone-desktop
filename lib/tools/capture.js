// ─── Screenshot / Capture Tools ───────────────────────────────────────────
// Screenshots and screen-understand (screenshot + vision hint).

const { screen } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

function register(mainWindow, store, auditLog) {
  const { ipcMain } = require("electron");

  // ── Take Screenshot ──────────────────────────────────────────────────────

  ipcMain.handle("tool:take-screenshot", async () => {
    const tier = store.get("file-access-tier", "standard");
    try {
      const tmpPath = path.join(os.tmpdir(), `lodestone-screenshot-${Date.now()}.png`);
      if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen
          $bmp = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
          $g = [System.Drawing.Graphics]::FromImage($bmp)
          $g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
          $g.Dispose()
          $bmp.Save('${tmpPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
          $bmp.Dispose()
        `;
        await new Promise((resolve, reject) => {
          execFile("powershell", ["-NoProfile", "-Command", psScript], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } else {
        await new Promise((resolve, reject) => {
          execFile("screencapture", ["-x", "-t", "png", tmpPath], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      }
      const imgData = await fs.promises.readFile(tmpPath);
      const base64 = imgData.toString("base64");
      await fs.promises.unlink(tmpPath).catch(() => {});
      auditLog("take-screenshot", "", `OK: ${Math.round(imgData.length / 1024)}KB`, tier);
      return {
        success: true,
        image: `data:image/png;base64,${base64}`,
        width: screen.getPrimaryDisplay().size.width * screen.getPrimaryDisplay().scaleFactor,
        height: screen.getPrimaryDisplay().size.height * screen.getPrimaryDisplay().scaleFactor,
      };
    } catch (err) {
      auditLog("take-screenshot", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });

  // ── Screen Understand (screenshot + vision) ────────────────────────────────

  ipcMain.handle("tool:screen-understand", async (_e, question) => {
    const tier = store.get("file-access-tier", "standard");
    try {
      const tmpPath = path.join(os.tmpdir(), `lodestone-screen-${Date.now()}.png`);
      if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen
          $bmp = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
          $g = [System.Drawing.Graphics]::FromImage($bmp)
          $g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
          $g.Dispose()
          $bmp.Save('${tmpPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
          $bmp.Dispose()
        `;
        await new Promise((resolve, reject) => {
          execFile("powershell", ["-NoProfile", "-Command", psScript], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } else {
        await new Promise((resolve, reject) => {
          execFile("screencapture", ["-x", "-t", "png", tmpPath], (err) => {
            if (err) reject(err); else resolve();
          });
        });
      }
      const imgData = await fs.promises.readFile(tmpPath);
      const base64 = imgData.toString("base64");
      await fs.promises.unlink(tmpPath).catch(() => {});
      auditLog("screen-understand", question || "", `OK: ${Math.round(imgData.length / 1024)}KB`, tier);
      return {
        success: true,
        image: `data:image/png;base64,${base64}`,
        width: screen.getPrimaryDisplay().size.width * screen.getPrimaryDisplay().scaleFactor,
        height: screen.getPrimaryDisplay().size.height * screen.getPrimaryDisplay().scaleFactor,
        question: question || "Describe what you see on screen",
        hint: "Send this image to a vision model with the question for screen understanding"
      };
    } catch (err) {
      auditLog("screen-understand", "", `ERROR: ${err.message}`, tier);
      return { error: err.message };
    }
  });
}

module.exports = { register };