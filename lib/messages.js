// ─── Messages ──────────────────────────────────────────────────────────────
// Message CRUD, Ollama streaming, brain system prompt injection, and memory extraction.


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

  async function createOllamaStream(messages, model) {
    const encoder = new TextEncoder();
    const ollamaUrl = storage.getOllamaUrl();
    const ollamaModel = model || storage.getOllamaModel();

    return new ReadableStream({
      async start(controller) {
        try {
          const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
          const enrichedMessages = await injectBrainSystemPrompt(messages, userMessage);

          const res = await ctx.originalFetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: ollamaModel, messages: enrichedMessages, stream: true }),
          });

          if (!res.ok) {
            const errText = await res.text();
            const errorEvent = `data: ${JSON.stringify({ error: `Ollama error: ${res.status}`, message: errText })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
            controller.close();
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let conversationId = 'local-' + crypto.randomUUID();

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
                  const sseEvent = `data: ${JSON.stringify({
                    type: 'content', content: parsed.message.content, conversation_id: conversationId,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(sseEvent));
                }
                if (parsed.done) {
                  // Save messages to local DB
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
                        model: ollamaModel, provider: 'ollama', tokens_used: parsed.eval_count || null,
                      });
                      events.emit(events.CONVERSATIONS_CHANGED);
                      extractBrainMemories(userMessage, fullContent, conv.id);
                    } catch (dbErr) {
                      console.warn('[Lodestone] Failed to save chat to local DB:', dbErr);
                    }
                  }
                  const doneEvent = `data: ${JSON.stringify({
                    type: 'done', conversation_id: conversationId,
                    tokens: { prompt: parsed.prompt_eval_count, completion: parsed.eval_count },
                  })}\n\n`;
                  controller.enqueue(encoder.encode(doneEvent));
                }
              } catch (e) { /* skip */ }
            }
          }
          controller.close();
        } catch (err) {
          const errorEvent = `data: ${JSON.stringify({ error: err.message, type: 'error' })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
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