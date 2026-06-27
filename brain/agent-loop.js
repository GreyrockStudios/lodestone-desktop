// ─── Lodestone Brain — Agent Loop ─────────────────────────────────────────
// Multi-iteration agent loop that can call tools, manage context, and
// produce final answers. Mirrors OpenClaw's tool execution model:
// LLM discovers tools → Lodestone executes them through the safety system.
// Runs locally in the Electron main process.

const { buildSystemPrompt } = require("./identity");
const { extractFromMessage, ingestMemories, deepExtract } = require("./memory-engine");
const db = require("../db");

const MAX_ITERATIONS = 5;
const MAX_CONTEXT_MESSAGES = 30;

// ─── Tool Definitions ────────────────────────────────────────────────────────
// These are the tools the agent can discover and the agent loop can execute.
// Tool execution goes through desktop-tools.js for safety enforcement.

const TOOL_DEFINITIONS = [
  {
    name: "memory_recall",
    description: "Search your memories for relevant information. Use keywords or natural language.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_store",
    description: "Save an important fact, preference, or decision to long-term memory.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to remember" },
        category: { type: "string", enum: ["fact", "preference", "decision", "commitment", "person"], description: "Type of memory" },
        importance: { type: "number", description: "Importance 0-1 (default 0.7)" },
      },
      required: ["content"],
    },
  },
  {
    name: "commitment_create",
    description: "Create a commitment or reminder for something the user needs to do.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "What needs to be done" },
        due_date: { type: "string", description: "When it's due (YYYY-MM-DD or relative like 'tomorrow')" },
      },
      required: ["content"],
    },
  },
  {
    name: "commitment_list",
    description: "List active commitments, optionally filtered by status.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "overdue", "completed"], description: "Filter by status" },
      },
    },
  },
  {
    name: "commitment_complete",
    description: "Mark a commitment as completed.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The commitment ID to complete" },
      },
      required: ["id"],
    },
  },
  {
    name: "schedule_create",
    description: "Create a scheduled task (reminder, check-in, report, or system check).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name" },
        task_type: { type: "string", enum: ["reminder", "check_in", "report", "system_check"], description: "Type of task" },
        cron_expr: { type: "string", description: "Cron expression for schedule" },
        message: { type: "string", description: "What to say or check" },
      },
      required: ["name", "task_type", "cron_expr"],
    },
  },
  {
    name: "system_info",
    description: "Get current system information (time, battery, disk space, etc).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read a file from the user's computer. Respects file access tier settings.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Respects file access tier settings.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "search_files",
    description: "Search for files by name pattern.",
    parameters: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Directory to search in" },
        pattern: { type: "string", description: "Glob pattern to match" },
      },
      required: ["dir", "pattern"],
    },
  },
  {
    name: "identity_update",
    description: "Update identity layers (soul, rules, heartbeat, user profile).",
    parameters: {
      type: "object",
      properties: {
        layer: { type: "string", enum: ["soul", "rules", "heartbeat", "user_profile"], description: "Which layer to update" },
        data: { type: "object", description: "The update data" },
      },
      required: ["layer", "data"],
    },
  },
  {
    name: "knowledge_search",
    description: "Search the knowledge graph for entities and their connections. Returns related memories and entities.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
];

// ─── Tool Execution ──────────────────────────────────────────────────────────
// Executes tools based on LLM tool calls. Goes through the safety system.

async function executeTool(toolName, args, context = {}) {
  const database = db.getDb();

  switch (toolName) {
    case "memory_recall": {
      const limit = args.limit || 10;
      const query = args.query.toLowerCase();
      // Text search + importance ranking
      const results = database.prepare(`
        SELECT id, content, category, importance, created_at 
        FROM memories 
        WHERE is_archived = 0 AND (content LIKE '%' || ? || '%' OR category LIKE '%' || ? || '%')
        ORDER BY importance DESC NULLS LAST, updated_at DESC 
        LIMIT ?
      `).all(query, query, limit);
      return { success: true, data: results };
    }

    case "memory_store": {
      const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      database.prepare(`
        INSERT INTO memories (id, content, category, importance, source_type, source_conversation_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'manual', ?, datetime('now'), datetime('now'))
      `).run(id, args.content, args.category || "fact", args.importance || 0.7, context.conversationId || null);
      return { success: true, data: { id, content: args.content } };
    }

    case "commitment_create": {
      const id = `commit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let dueDate = args.due_date;
      if (dueDate === "tomorrow") {
        const d = new Date(); d.setDate(d.getDate() + 1);
        dueDate = d.toISOString().split("T")[0];
      } else if (dueDate === "next week") {
        const d = new Date(); d.setDate(d.getDate() + 7);
        dueDate = d.toISOString().split("T")[0];
      }
      database.prepare(`
        INSERT INTO commitments (id, content, due_date, status, created_at, source_conversation_id)
        VALUES (?, ?, ?, 'pending', datetime('now'), ?)
      `).run(id, args.content, dueDate || null, context.conversationId || null);
      return { success: true, data: { id, content: args.content, due_date: dueDate } };
    }

    case "commitment_list": {
      const status = args.status || "pending";
      const results = database.prepare(`
        SELECT id, content, due_date, status FROM commitments 
        WHERE status = ? OR ? = 'all'
        ORDER BY due_date ASC NULLS LAST
      `).all(status, status);
      return { success: true, data: results };
    }

    case "commitment_complete": {
      database.prepare("UPDATE commitments SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(args.id);
      return { success: true, data: { id: args.id, status: "completed" } };
    }

    case "schedule_create": {
      // Delegate to scheduler module
      if (context.createScheduledTask) {
        const task = await context.createScheduledTask({
          name: args.name,
          task_type: args.task_type,
          cron_expr: args.cron_expr,
          message: args.message,
        });
        return { success: true, data: task };
      }
      return { success: false, error: "Scheduler not available" };
    }

    case "system_info": {
      if (context.getSystemInfo) {
        const info = await context.getSystemInfo();
        return { success: true, data: info };
      }
      return { success: false, error: "System info not available" };
    }

    case "read_file": {
      if (context.readFile) {
        const content = await context.readFile(args.path);
        return { success: true, data: content };
      }
      return { success: false, error: "File access not available" };
    }

    case "write_file": {
      if (context.writeFile) {
        await context.writeFile(args.path, args.content);
        return { success: true, data: { path: args.path } };
      }
      return { success: false, error: "File access not available" };
    }

    case "search_files": {
      if (context.searchFiles) {
        const results = await context.searchFiles(args.dir, args.pattern);
        return { success: true, data: results };
      }
      return { success: false, error: "File search not available" };
    }

    case "identity_update": {
      const { getSoul, setSoul, getHeartbeat, setHeartbeat, getUserProfile, setUserProfile, addRule, removeRule } = require("./identity");
      switch (args.layer) {
        case "soul": return { success: true, data: setSoul(args.data.content) };
        case "heartbeat": return { success: true, data: setHeartbeat(args.data) };
        case "user_profile": return { success: true, data: setUserProfile(args.data) };
        case "rules": {
          if (args.data.action === "add") return { success: true, data: { id: addRule(args.data.rule, args.data.category) } };
          if (args.data.action === "remove") { removeRule(args.data.id); return { success: true }; }
          return { success: false, error: "Unknown rules action" };
        }
        default: return { success: false, error: `Unknown layer: ${args.layer}` };
      }
    }

    case "knowledge_search": {
      const { smartRetrieve } = require("./knowledge");
      const results = smartRetrieve(args.query || "", args.limit || 10);
      return { success: true, data: results };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ─── Agent Loop ────────────────────────────────────────────────────────────────
// The main loop: build prompt → call LLM → check for tool calls → execute → repeat
// Mirrors OpenClaw's agentic loop but simplified for local-first operation.

async function agentLoop({
  messages,          // Conversation history [{role, content}]
  userMessage,       // The new user message
  conversationId,    // Current conversation ID
  callLlm,           // async (messages, tools) => {content, toolCalls}
  context = {},      // Desktop tool context (readFile, writeFile, etc.)
  onStream,          // Callback for streaming tokens
  maxIterations = MAX_ITERATIONS,
}) {
  const database = db.getDb();

  // 1. Build system prompt from identity layers + relevant memories
  const systemPrompt = await buildSystemPrompt(null, userMessage, { maxTokens: 6000, conversationHistory: messages });

  // 2. Compress history to fit context window
  const historyMessages = compressHistory(messages, MAX_CONTEXT_MESSAGES);

  // 3. Add user message to history
  const fullMessages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: userMessage },
  ];

  // 4. Extract memories from user message (fast, synchronous)
  const extracted = extractFromMessage(userMessage);
  if (extracted.length > 0) {
    ingestMemories(extracted);
    // Auto-tag with current topic
    const { detectTopic, autoTagMemory } = require("./topic-engine");
    const topic = detectTopic(messages);
    if (topic) {
      for (const mem of extracted) {
        autoTagMemory(mem.id, mem.content, topic);
      }
    }
  }

  // 5. Agent loop
  let iterations = 0;
  let lastAssistantContent = "";
  const toolCallLog = [];

  while (iterations < maxIterations) {
    iterations++;

    // Call LLM with tools available
    const result = await callLlm(fullMessages, TOOL_DEFINITIONS);

    // Check for tool calls in the response
    if (result.toolCalls && result.toolCalls.length > 0) {
      // Execute each tool call
      for (const toolCall of result.toolCalls) {
        const toolResult = await executeTool(toolCall.name, toolCall.arguments, {
          ...context,
          conversationId,
        });

        toolCallLog.push({
          tool: toolCall.name,
          args: toolCall.arguments,
          result: toolResult,
        });

        // Add tool result to conversation
        fullMessages.push({
          role: "assistant",
          content: result.content || `[Calling ${toolCall.name}]`,
        });
        fullMessages.push({
          role: "tool",
          name: toolCall.name,
          content: JSON.stringify(toolResult),
        });
      }

      // Continue the loop — the LLM will see the tool results and decide next steps
      continue;
    }

    // No tool calls — we have a final answer
    lastAssistantContent = result.content;
    break;
  }

  // If we hit max iterations, use whatever we have
  if (!lastAssistantContent && fullMessages.length > 0) {
    const lastAssistant = [...fullMessages].reverse().find(m => m.role === "assistant");
    lastAssistantContent = lastAssistant?.content || "I reached my thinking limit. Could you try again with a simpler request?";
  }

  // 6. Extract memories from assistant response
  const responseExtracted = extractFromMessage(lastAssistantContent);
  if (responseExtracted.length > 0) {
    ingestMemories(responseExtracted);
  }

  // 7. Trigger deep extraction in background (non-blocking)
  if (context.llmCaller && context.apiKey) {
    deepExtract(
      [{ role: "user", content: userMessage }, { role: "assistant", content: lastAssistantContent }],
      context.llmCaller,
      context.apiKey
    ).catch(err => console.error("[Brain] Background deep extraction failed:", err.message));
  }

  return {
    content: lastAssistantContent,
    toolCalls: toolCallLog,
    iterations,
    memoriesExtracted: extracted.length + responseExtracted.length,
  };
}

// ─── Context Compression ────────────────────────────────────────────────────────
// When history exceeds max messages, summarize older messages and keep recent ones.

function compressHistory(messages, maxMessages) {
  if (messages.length <= maxMessages) return messages;

  // Keep the most recent messages
  const recent = messages.slice(-maxMessages);

  // If there are older messages, create a summary placeholder
  const older = messages.slice(0, -maxMessages);
  if (older.length > 0) {
    const summaryLine = `[Earlier in this conversation, ${older.length} messages were exchanged covering: ${older.slice(-3).map(m => m.content.substring(0, 50)).join("; ")}]`;
    return [{ role: "system", content: summaryLine }, ...recent];
  }

  return recent;
}

module.exports = {
  agentLoop,
  executeTool,
  TOOL_DEFINITIONS,
  compressHistory,
};