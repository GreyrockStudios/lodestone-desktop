// ─── Messages ──────────────────────────────────────────────────────────────
// Message CRUD, Ollama streaming, brain system prompt injection, and memory extraction.

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'memory_recall',
      description: 'Search your memories for relevant information. Use keywords or natural language.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_store',
      description: 'Save an important fact, preference, or decision to long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The information to remember' },
          category: { type: 'string', enum: ['fact', 'preference', 'decision', 'commitment', 'person'], description: 'Type of memory' },
          importance: { type: 'number', description: 'Importance 0-1 (default 0.7)' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'system_info',
      description: 'Get current system information (time, battery, disk space, etc).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the user\'s computer. Respects file access tier settings.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path to read' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Respects file access tier settings.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files by name pattern.',
      parameters: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Directory to search in' },
          pattern: { type: 'string', description: 'Glob pattern to match' },
        },
        required: ['dir', 'pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Evaluate a mathematical expression.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'The math expression to evaluate' } },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and read the content of a URL.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The URL to fetch' } },
        required: ['url'],
      },
    },
  },
];

const MAX_AGENT_ITERATIONS = 5;

module.exports = function initMessages(ctx) {

  // ─── Brain helpers ──────────────────────────────────────────────────────

  async function injectBrainSystemPrompt(messages, userMessage) {
    try {
      if (!window.electronAPI?.brain?.buildSystemPrompt) return messages;
      const systemPrompt = await window.electronAPI.brain.buildSystemPrompt(userMessage || '');
      if (!systemPrompt || systemPrompt.trim().length < 10) return messages;
      const existingSystemIdx = messages.findIndex(m => m.role === 'system');
      if (existingSystemIdx >= 0) {
        const merged = systemPrompt + '\n\n' + messages[existingSystemIdx].content;
        return messages.map((m, i) => i === existingSystemIdx ? { ...m, content: merged } : m);
      } else {
        return [{ role: 'system', content: systemPrompt }, ...messages];
      }
    } catch (err) {
      console.warn('[Brain] System prompt injection failed:', err);
      return messages;
    }
  }

  async function extractBrainMemories(userMessage, assistantMessage, conversationId) {
    try {
      if (!window.electronAPI?.brain?.extractMemories) return;
      const userExtracted = await window.electronAPI.brain.extractMemories(userMessage);
      const assistantExtracted = await window.electronAPI.brain.extractMemories(assistantMessage);
      const allExtracted = [...(userExtracted || []), ...(assistantExtracted || [])];
      if (allExtracted.length > 0) {
        await window.electronAPI.brain.ingestMemories(allExtracted);
        console.log(`[Brain] Extracted ${allExtracted.length} memories from conversation turn`);
      }
      // Deep extraction runs in background (non-blocking, uses cheap model)
      if (window.electronAPI?.brain?.deepExtract) {
        window.electronAPI.brain.deepExtract(
          [{ role: 'user', content: userMessage }, { role: 'assistant', content: assistantMessage }],
          null
        ).catch(err => console.warn('[Brain] Deep extraction failed:', err));
      }
      // Behavioral learning: detect corrections
      if (userMessage && assistantMessage && window.electronAPI?.brain?.detectCorrection) {
        const correction = await window.electronAPI.brain.detectCorrection(userMessage, assistantMessage);
        if (correction) {
          console.log(`[Brain] Detected correction: ${correction.extracted_rule}`);
          if (window.electronAPI?.brain?.learnFromCorrection) {
            await window.electronAPI.brain.learnFromCorrection(correction);
          }
        }
      }
    } catch (err) {
      console.warn('[Brain] Memory extraction failed:', err);
    }
  }

  // ─── Ollama streaming ───────────────────────────────────────────────────

  async function streamFromOllama(messages, model, onChunk, onDone, onError) {
    const ollamaUrl = storage.getOllamaUrl();
    const ollamaModel = model || storage.getOllamaModel();

    try {
      const res = await ctx.originalFetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ollamaModel, messages, stream: true }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama error ${res.status}: ${errText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullContent += parsed.message.content;
              onChunk(parsed.message.content);
            }
            if (parsed.done) { onDone(fullContent); return; }
          } catch (e) { /* skip malformed lines */ }
        }
      }
      onDone(fullContent);
    } catch (err) {
      onError(err);
    }
  }

  // ─── Execute a tool call locally via IPC ─────────────────────────────────

  async function executeToolLocally(toolName, args) {
    try {
      if (window.electronAPI?.executeTool) {
        const result = await window.electronAPI.executeTool(toolName, args);
        return result;
      }
      return { error: `Tool ${toolName} not available` };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ─── Ollama streaming with agentic tool loop ─────────────────────────────

  async function createOllamaStream(messages, model) {
    const encoder = new TextEncoder();
    const ollamaUrl = storage.getOllamaUrl();
    const ollamaModel = model || storage.getOllamaModel();

    function sse(type, data) {
      return encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    }

    return new ReadableStream({
      async start(controller) {
        const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
        let conversationId = 'local-' + crypto.randomUUID();
        let agenticMessages = [];

        try {
          // ─── Initial call with tools ────────────────────────────────────
          const systemPrompt = await (window.electronAPI?.brain?.buildSystemPrompt?.(userMessage) || '');
          const enrichedMessages = systemPrompt && systemPrompt.trim().length >= 10
            ? (() => {
                const existing = messages.findIndex(m => m.role === 'system');
                if (existing >= 0) {
                  return messages.map((m, i) => i === existing ? { ...m, content: systemPrompt + '\n\n' + m.content } : m);
                }
                return [{ role: 'system', content: systemPrompt }, ...messages];
              })()
            : messages;

          agenticMessages = [...enrichedMessages];

          for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
            const useTools = iteration < MAX_AGENT_ITERATIONS - 1;
            const requestBody = {
              model: ollamaModel,
              messages: agenticMessages,
              stream: true,
            };
            if (useTools) requestBody.tools = TOOL_DEFINITIONS;

            controller.enqueue(sse('agent_start', { iteration: iteration + 1, maxIterations: MAX_AGENT_ITERATIONS }));

            const res = await ctx.originalFetch(`${ollamaUrl}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            });

            if (!res.ok) {
              const errText = await res.text();
              controller.enqueue(sse('error', { error: `Ollama error: ${res.status}`, message: errText }));
              controller.close();
              return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let toolCalls = [];
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);

                  // Stream text content
                  if (parsed.message?.content) {
                    fullContent += parsed.message.content;
                    controller.enqueue(sse('content', { content: parsed.message.content, conversation_id: conversationId }));
                  }

                  // Parse tool calls from Ollama response
                  if (Array.isArray(parsed.message?.tool_calls)) {
                    for (const tc of parsed.message.tool_calls) {
                      if (tc.type === 'function' && tc.function) {
                        const tcArgs = typeof tc.function.arguments === 'string'
                          ? tc.function.arguments
                          : JSON.stringify(tc.function.arguments || {});
                        toolCalls.push({
                          id: tc.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                          name: tc.function.name || '',
                          arguments: tcArgs,
                        });
                      }
                    }
                  }

                  // On done, collect token counts and finalize this iteration
                  if (parsed.done) {
                    // Token counts available in done event
                    const promptTokens = parsed.prompt_eval_count || 0;
                    const completionTokens = parsed.eval_count || 0;

                    // If we have tool calls, execute them and continue the loop
                    if (toolCalls.length > 0) {
                      // Add assistant message with tool calls to conversation
                      agenticMessages.push({
                        role: 'assistant',
                        content: fullContent || '',
                        tool_calls: toolCalls.map(tc => ({
                          type: 'function',
                          function: { name: tc.name, arguments: tc.arguments },
                        })),
                      });

                      // Execute each tool and add results
                      for (const tc of toolCalls) {
                        let args = {};
                        try { args = JSON.parse(tc.arguments); } catch { args = {}; }

                        controller.enqueue(sse('tool_start', { tool: tc.name, args, iteration: iteration + 1 }));

                        const toolResult = await executeToolLocally(tc.name, args);
                        const resultContent = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

                        controller.enqueue(sse('tool_result', { tool: tc.name, content: resultContent, iteration: iteration + 1 }));

                        // Ollama format: { role: 'tool', tool_name: '...', content: '...' }
                        agenticMessages.push({
                          role: 'tool',
                          tool_name: tc.name,
                          content: resultContent,
                        });
                      }

                      // Reset for next iteration
                      fullContent = '';
                      toolCalls = [];
                      break; // Exit the stream reader loop, continue agentic loop
                    }

                    // No tool calls — final response. Save to DB.
                    if (window.electronAPI?.db && messages.length > 0) {
                      try {
                        const conv = await window.electronAPI.db.createConversation({
                          title: messages[0]?.content?.substring(0, 50) || 'New chat',
                          model: ollamaModel, provider: 'ollama',
                        });
                        conversationId = conv.id;
                        for (const msg of messages) {
                          await window.electronAPI.db.addMessage({
                            conversation_id: conv.id, role: msg.role, content: msg.content,
                            model: ollamaModel, provider: 'ollama',
                          });
                        }
                        await window.electronAPI.db.addMessage({
                          conversation_id: conv.id, role: 'assistant', content: fullContent,
                          model: ollamaModel, provider: 'ollama', tokens_used: completionTokens || null,
                        });
                        events.emit(events.CONVERSATIONS_CHANGED);
                        extractBrainMemories(userMessage, fullContent, conv.id);
                      } catch (dbErr) {
                        console.warn('[Lodestone] Failed to save chat to local DB:', dbErr);
                      }
                    }

                    controller.enqueue(sse('done', {
                      conversation_id: conversationId,
                      tokens: { prompt: promptTokens, completion: completionTokens },
                    }));
                    controller.close();
                    return;
                  }
                } catch (e) { /* skip malformed lines */ }
              }
            }

            // If we got here, we have tool calls to process — continue loop
            console.log(`[Ollama Agent] Iteration ${iteration + 1}: executed tools, continuing loop`);
          }

          // Max iterations reached — save whatever we have
          controller.enqueue(sse('content', { content: '\n\n[I have completed the available steps. Here is my summary:]\n\n', conversation_id: conversationId }));
          controller.enqueue(sse('done', { conversation_id: conversationId }));
          controller.close();
        } catch (err) {
          controller.enqueue(sse('error', { error: err.message }));
          controller.close();
        }
      },
    });
  }

  // ─── Message CRUD ───────────────────────────────────────────────────────

  // GET /api/chat/conversations/:id/messages
  async function listMessages(convId) {
    const msgs = await window.electronAPI.db.getMessages(convId);
    return new Response(JSON.stringify({ messages: msgs }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // POST /api/chat/conversations/:id/messages
  async function addMessage(convId, init) {
    const body = init?.body ? JSON.parse(init.body) : {};
    const msg = await window.electronAPI.db.addMessage({
      conversation_id: convId,
      role: body.role,
      content: body.content,
      model: body.model,
      provider: body.provider,
      tokens_used: body.tokens_used,
    });
    ctx.sync.syncToServer(`/api/chat/conversations/${convId}/messages`, 'POST', msg);

    // Brain: Extract memories from messages
    if (body.role === 'assistant' && body.content) {
      try {
        const msgs = await window.electronAPI.db.getMessages(convId);
        const lastUserMsg = msgs?.filter(m => m.role === 'user').pop()?.content || '';
        extractBrainMemories(lastUserMsg, body.content, convId);
      } catch (e) {
        extractBrainMemories('', body.content, convId);
      }
    }

    return new Response(JSON.stringify(msg), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ─── Chat helpers (Community fallback) ───────────────────────────────────

  async function getGreeting() {
    try {
      const memories = await window.electronAPI.db.listMemories({ limit: 50 });
      const identity = await window.electronAPI.brain?.getIdentity?.() || {};
      const hour = new Date().getHours();
      const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      const name = identity?.name || 'friend';
      const context = { recentTopics: memories?.slice(0, 5).map((m) => m.content?.split(' ').slice(0, 4).join(' ')).filter(Boolean) || [] };
      const suggestions = [
        { icon: '💡', label: 'Explain a concept', prompt: 'Explain ' },
        { icon: '🔍', label: 'Search the web', prompt: 'Search for ' },
        { icon: '🧠', label: 'Brainstorm ideas', prompt: 'Brainstorm ideas for ' },
        { icon: '⏰', label: 'Set a reminder', prompt: 'Remind me to ' },
      ];
      return new Response(JSON.stringify({
        greeting: `${timeGreeting}, ${name}!`, agentName: identity?.name || 'Lodestone', context, suggestions,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ greeting: 'Hello!', agentName: 'Lodestone', context: {}, suggestions: [] }), { headers: { 'content-type': 'application/json' } });
    }
  }

  return { injectBrainSystemPrompt, extractBrainMemories, streamFromOllama, createOllamaStream, listMessages, addMessage, getGreeting };
};