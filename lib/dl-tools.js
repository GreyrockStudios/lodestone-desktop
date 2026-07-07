// ─── Desktop Tool Execution ────────────────────────────────────────────────
// Runs local tools without hitting the server. Falls back to server for tools
// that need API access (weather, web_search, generate_image, etc.).


module.exports = function initTools(ctx) {

  async function execute(name, args) {
    try {
      switch (name) {
        // ── Memory & Commitments (local DB) ──
        case 'save_memory': {
          const mem = await window.electronAPI.db.createMemory({
            content: args.content,
            category: args.category || 'fact',
            importance: args.importance || 0.7,
            source_type: 'chat',
          });
          ctx.sync.syncToServer('/api/memory', 'POST', mem);
          return JSON.stringify({ success: true, id: mem.id, content: mem.content });
        }
        case 'search_memory': {
          const memories = await window.electronAPI.db.listMemories({
            search: args.query,
            limit: args.limit || 5,
          });
          return JSON.stringify({ memories });
        }
        case 'create_commitment': {
          const com = await window.electronAPI.db.createCommitment({
            content: args.content,
            due_date: args.due_date,
          });
          ctx.sync.syncToServer('/api/chat/commitments', 'POST', com);
          return JSON.stringify({ success: true, id: com.id, content: com.content });
        }
        case 'set_reminder': {
          // Store as a commitment with due_date
          const reminder = await window.electronAPI.db.createCommitment({
            content: args.content,
            due_date: args.trigger_at,
          });
          // Also trigger a system notification at the right time (if supported)
          if (window.electronAPI?.sendNotification && args.trigger_at) {
            const triggerTime = new Date(args.trigger_at);
            const now = new Date();
            const delay = triggerTime.getTime() - now.getTime();
            if (delay > 0 && delay < 86400000) { // Within 24 hours
              setTimeout(() => {
                window.electronAPI.sendNotification({
                  title: 'Lodestone Reminder',
                  body: args.content,
                  clickAction: '#/chat',
                });
              }, delay);
            }
          }
          return JSON.stringify({ success: true, id: reminder.id, content: reminder.content, trigger_at: args.trigger_at });
        }
        case 'list_reminders': {
          const commitments = await window.electronAPI.db.listCommitments(args.status || 'pending');
          return JSON.stringify({ reminders: commitments.map(c => ({
            id: c.id, content: c.content, trigger_at: c.due_date, status: c.status, created_at: c.created_at,
          }))});
        }

        // ── Calculator (local JS, safe eval) ──
        case 'calculator': {
          try {
            // Safe math evaluation — only allow numbers, operators, and math functions
            const expr = args.expression.replace(/[^0-9+\-*/().%\s^piePIEsincotaglqrtabflorpw]/g, '');
            // Use explicit Math object instead of with(Math) for security and strict mode compatibility
            const mathExpr = expr
              .replace(/\bsin\b/g, 'Math.sin')
              .replace(/\bcos\b/g, 'Math.cos')
              .replace(/\btan\b/g, 'Math.tan')
              .replace(/\basin\b/g, 'Math.asin')
              .replace(/\bacos\b/g, 'Math.acos')
              .replace(/\batan\b/g, 'Math.atan')
              .replace(/\blog\b/g, 'Math.log')
              .replace(/\bln\b/g, 'Math.log')
              .replace(/\bsqrt\b/g, 'Math.sqrt')
              .replace(/\babs\b/g, 'Math.abs')
              .replace(/\bfloor\b/g, 'Math.floor')
              .replace(/\bceil\b/g, 'Math.ceil')
              .replace(/\bround\b/g, 'Math.round')
              .replace(/\bpow\b/g, 'Math.pow')
              .replace(/\bPI\b/g, 'Math.PI')
              .replace(/\bE\b/g, 'Math.E')
              .replace(/\^/g, '**');
            const fn = new Function(`"use strict"; return(${mathExpr})`);
            const result = fn();
            return JSON.stringify({ result: result, expression: args.expression });
          } catch (e) {
            return JSON.stringify({ error: `Could not evaluate: ${args.expression}` });
          }
        }

        // ── Execute Code (sandboxed via Electron IPC) ──
        case 'execute_code': {
          if (window.electronAPI?.executeCode) {
            const result = await window.electronAPI.executeCode(args.language, args.code, args.timeout);
            return JSON.stringify(result);
          }
          // Fallback: restricted eval for JS only — no access to require, process, __dirname, etc.
          if (args.language === 'javascript') {
            try {
              // Create a sandboxed function with restricted globals
              const sandboxedFn = new Function(
                '"use strict";' +
                'const require=undefined,process=undefined,__dirname=undefined,__filename=undefined,globalThis=undefined,' +
                'module=undefined,exports=undefined,setTimeout=undefined,setInterval=undefined,setImmediate=undefined,' +
                'clearTimeout=undefined,clearInterval=undefined,clearImmediate=undefined,' +
                'Buffer=undefined,URL=undefined,URLSearchParams=undefined,' +
                'fetch=undefined,XMLHttpRequest=undefined,WebSocket=undefined,EventSource=undefined,' +
                'Worker=undefined,SharedArrayBuffer=undefined,Atomics=undefined;' +
                'const console={log:(...a)=>a.join(" "),error:(...a)=>a.join(" "),warn:(...a)=>a.join(" ")};' +
                'return (function(){' + args.code + '})();'
              );
              const result = sandboxedFn();
              return JSON.stringify({ output: String(result) });
            } catch (e) {
              return JSON.stringify({ error: e.message });
            }
          }
          return JSON.stringify({ error: 'Code execution not available locally' });
        }

        // ── Server-only tools (fall through) ──
        case 'weather':
        case 'web_search':
        case 'web_fetch':
        case 'analyze_file':
        case 'generate_image':
        case 'create_qr':
        case 'create_note':
          return null; // Signal to caller to use server

        // ── Desktop System Tools ──
        case 'desktop_list_directory': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.listDirectory(args.path);
          return JSON.stringify(result);
        }
        case 'desktop_read_file': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.readFile(args.path, args.encoding);
          return JSON.stringify(result);
        }
        case 'desktop_write_file': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.writeFile(args.path, args.content, args.create_dirs);
          return JSON.stringify(result);
        }
        case 'desktop_search_files': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.searchFiles(args.directory, args.pattern, args.max_results);
          return JSON.stringify(result);
        }
        case 'desktop_system_info': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.systemInfo();
          return JSON.stringify(result);
        }
        case 'desktop_battery_info': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.batteryInfo();
          return JSON.stringify(result);
        }
        case 'desktop_wifi_info': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.wifiInfo();
          return JSON.stringify(result);
        }
        case 'desktop_screenshot': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.takeScreenshot();
          return JSON.stringify(result);
        }
        case 'desktop_clipboard_read': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.clipboardRead();
          return JSON.stringify(result);
        }
        case 'desktop_clipboard_write': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.clipboardWrite(args.text);
          return JSON.stringify(result);
        }
        case 'desktop_run_command': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.runCommand(args.command, args.timeout);
          return JSON.stringify(result);
        }
        case 'desktop_open_url': {
          if (!window.electronAPI?.tools) return null;
          const result = await window.electronAPI.tools.openExternal(args.url);
          return JSON.stringify(result);
        }
        case 'desktop_volume': {
          if (!window.electronAPI?.tools) return null;
          if (args.level !== undefined) {
            const result = await window.electronAPI.tools.setVolume(args.level);
            return JSON.stringify(result);
          }
          const result = await window.electronAPI.tools.getVolume();
          return JSON.stringify(result);
        }

        // ── Desktop Automation Tools ──
        case 'desktop_click': {
          if (!window.electronAPI?.tools) return null;
          const clickResult = await window.electronAPI.tools.click(args.x, args.y, args.button, args.doubleClick);
          return JSON.stringify(clickResult);
        }
        case 'desktop_type_text': {
          if (!window.electronAPI?.tools) return null;
          const typeResult = await window.electronAPI.tools.typeText(args.text, args.pressEnter);
          return JSON.stringify(typeResult);
        }
        case 'desktop_press_key': {
          if (!window.electronAPI?.tools) return null;
          const keyResult = await window.electronAPI.tools.pressKey(args.key, args.modifiers);
          return JSON.stringify(keyResult);
        }
        case 'desktop_scroll': {
          if (!window.electronAPI?.tools) return null;
          const scrollResult = await window.electronAPI.tools.scroll(args.x, args.y, args.deltaX, args.deltaY);
          return JSON.stringify(scrollResult);
        }
        case 'desktop_move_mouse': {
          if (!window.electronAPI?.tools) return null;
          const moveResult = await window.electronAPI.tools.moveMouse(args.x, args.y);
          return JSON.stringify(moveResult);
        }
        case 'desktop_get_mouse_pos': {
          if (!window.electronAPI?.tools) return null;
          const posResult = await window.electronAPI.tools.getMousePos();
          return JSON.stringify(posResult);
        }
        case 'desktop_drag': {
          if (!window.electronAPI?.tools) return null;
          const dragResult = await window.electronAPI.tools.drag(args.fromX, args.fromY, args.toX, args.toY, args.duration);
          return JSON.stringify(dragResult);
        }
        case 'desktop_active_window': {
          if (!window.electronAPI?.tools) return null;
          const awResult = await window.electronAPI.tools.activeWindow();
          return JSON.stringify(awResult);
        }
        case 'desktop_browser_open': {
          if (!window.electronAPI?.tools) return null;
          const boResult = await window.electronAPI.tools.openExternal(args.url);
          return JSON.stringify(boResult);
        }
        case 'desktop_screen_understand': {
          if (!window.electronAPI?.tools) return null;
          const suResult = await window.electronAPI.tools.takeScreenshot();
          return JSON.stringify({ ...suResult, question: args.question || 'Describe what you see' });
        }
        case 'desktop_schedule_notification': {
          if (!window.electronAPI?.tools) return null;
          const notifResult = await window.electronAPI.tools.scheduleNotification({
            title: args.title,
            body: args.body,
            delayMs: args.delayMs,
          });
          return JSON.stringify(notifResult);
        }

        // ── Scheduler ──
        case 'scheduler_create': {
          if (!window.electronAPI?.scheduler) return null;
          const cronExpr = LodestoneConfig.SCHEDULER_PRESETS[args.preset] || args.preset || '0 9 * * *'; // default: daily 9am
          const task = await window.electronAPI.scheduler.create({
            name: args.name,
            description: args.description,
            task_type: args.task_type || 'reminder',
            cron_expr: cronExpr,
            preset_id: args.preset,
            message: args.message,
          });
          return JSON.stringify({ success: true, task });
        }
        case 'scheduler_list': {
          if (!window.electronAPI?.scheduler) return null;
          const tasks = await window.electronAPI.scheduler.list(args.filter);
          return JSON.stringify({ tasks });
        }
        case 'scheduler_pause': {
          if (!window.electronAPI?.scheduler) return null;
          const paused = await window.electronAPI.scheduler.pause(args.id);
          return JSON.stringify({ success: true, task: paused });
        }
        case 'scheduler_resume': {
          if (!window.electronAPI?.scheduler) return null;
          const resumed = await window.electronAPI.scheduler.resume(args.id);
          return JSON.stringify({ success: true, task: resumed });
        }
        case 'scheduler_delete': {
          if (!window.electronAPI?.scheduler) return null;
          await window.electronAPI.scheduler.delete(args.id);
          return JSON.stringify({ success: true });
        }

        default:
          return null; // Unknown tool, fall through to server
      }
    } catch (err) {
      console.error('[Lodestone] Desktop tool error:', name, err);
      return JSON.stringify({ error: err.message });
    }
  }

  return { execute };
};