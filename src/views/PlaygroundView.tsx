import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  FlaskConical, Send, ChevronDown, Trophy,
  Clock, Hash, Trash2, Columns2, Columns3,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface ModelOption {
  id: string
  name: string
  provider: string
  color: string
}

interface ChatColumn {
  id: string
  model: ModelOption
  messages: PlayMessage[]
  input: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  isStreaming: boolean
  responseTime: number | null
  tokenCount: number
  voted: boolean
}

interface PlayMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

// ─── Constants ────────────────────────────────────────────────────────

const MODELS: ModelOption[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', color: '#10B981' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', color: '#8B5CF6' },
  { id: 'glm-5.2', name: 'GLM-5.2', provider: 'Ollama', color: '#06B6D4' },
  { id: 'qwen3', name: 'Qwen3', provider: 'Local', color: '#F59E0B' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', color: '#34D399' },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic', color: '#A78BFA' },
]

const DEMO_RESPONSES: Record<string, string[]> = {
  'gpt-4o': [
    "I'd approach this systematically. First, let me break down the key considerations...\n\nThe most important factor is consistency. When you establish a regular pattern, the system becomes more predictable and easier to optimize.\n\nHere are three actionable steps:\n1. Define clear boundaries for each component\n2. Measure performance at every layer\n3. Iterate based on data, not assumptions",
    "Great question! The answer involves multiple dimensions.\n\n**Key insight:** Most solutions overlook the feedback loop. When you close the loop, the system self-corrects.\n\nLet me walk through the reasoning:\n- Start with the simplest viable approach\n- Add complexity only when measurements demand it\n- Validate each step against your success criteria",
  ],
  'claude-3.5-sonnet': [
    "This is a nuanced topic. Let me share my analysis.\n\nThe core challenge is balancing speed with accuracy. Research shows that iterative refinement outperforms single-shot approaches by 15-30% on complex tasks.\n\nMy recommendation:\n- Use a multi-pass strategy for critical decisions\n- Single-pass is fine for routine operations\n- Always validate against ground truth when available",
    "Interesting problem. Here's how I'd think about it:\n\nThe fundamental trade-off is between exploration and exploitation. Too much exploration wastes resources; too much exploitation misses opportunities.\n\nA practical framework:\n1. **Phase 1** (Week 1-2): Broad exploration\n2. **Phase 2** (Week 3-4): Focused refinement\n3. **Phase 3** (Week 5+): Stable deployment",
  ],
  'glm-5.2': [
    "Let me analyze this step by step.\n\nThe key observation is that most systems fail not because of individual component failures, but because of integration issues.\n\nProposed approach:\n- Verify each component independently first\n- Then test pairwise interactions\n- Finally, validate the full system\n\nThis reduces debugging time by approximately 60%.",
    "Here's my analysis:\n\nThe data suggests a clear pattern. When we look at the top-performing configurations, they all share three properties:\n1. Low latency response loops\n2. Clear separation of concerns\n3. Comprehensive error handling\n\nI'd recommend prioritizing these in order of impact.",
  ],
  'qwen3': [
    "Good question. Let me provide a structured response.\n\nThe optimal strategy depends on your constraints. In most cases, a hybrid approach works best:\n\n- **Short-term**: Quick wins that build momentum\n- **Medium-term**: Structural improvements\n- **Long-term**: Fundamental changes\n\nEach phase builds on the previous one, so start with the short-term wins.",
    "I'll break this down systematically.\n\nThe core principle is **incremental value delivery**. Rather than waiting for a perfect solution, ship small improvements frequently.\n\nThis approach has three benefits:\n1. Faster feedback cycles\n2. Reduced risk per deployment\n3. Better team morale (seeing progress)",
  ],
  'default': [
    "Here's my response to your prompt.\n\nI've considered multiple angles and here's what I think works best...",
    "Let me think about this carefully.\n\nThe approach I'd recommend involves several key steps...",
  ],
}

// ─── Column Component ────────────────────────────────────────────────

function ModelColumn({
  column,
  onUpdate,
  onVote,
}: {
  column: ChatColumn
  onUpdate: (id: string, updates: Partial<ChatColumn>) => void
  onVote: (id: string) => void
}) {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const handleSend = useCallback(() => {
    if (!column.input.trim()) return

    const userMsg: PlayMessage = {
      role: 'user',
      content: column.input,
      timestamp: Date.now(),
    }

    // Simulate streaming response
    const responseKey = column.model.id in DEMO_RESPONSES ? column.model.id : 'default'
    const responses = DEMO_RESPONSES[responseKey]
    const responseContent = responses[Math.floor(Math.random() * responses.length)]
    const startTime = Date.now()

    const assistantMsg: PlayMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }

    onUpdate(column.id, {
      messages: [...column.messages, userMsg, assistantMsg],
      input: '',
      isStreaming: true,
      responseTime: null,
    })

    // Simulate token-by-token streaming
    let currentText = ''
    const chunkSize = Math.max(1, Math.floor(responseContent.length / (30 + Math.random() * 20)))
    let idx = 0

    const streamInterval = setInterval(() => {
      idx += chunkSize
      currentText = responseContent.slice(0, idx)

      onUpdate(column.id, {
        messages: column.messages.concat([
          userMsg,
          { ...assistantMsg, content: currentText },
        ]),
      })

      if (idx >= responseContent.length) {
        clearInterval(streamInterval)
        onUpdate(column.id, {
          isStreaming: false,
          responseTime: Date.now() - startTime,
          tokenCount: Math.round(responseContent.length / 4),
          messages: column.messages.concat([
            userMsg,
            { ...assistantMsg, content: responseContent },
          ]),
        })
      }
    }, 30 + Math.random() * 40)
  }, [column, onUpdate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
      >
        <div className="flex items-center gap-2">
          {/* Model selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: column.model.color }} />
              {column.model.name}
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
            </button>
            {modelDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  zIndex: 50,
                  minWidth: 180,
                }}
              >
                {MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onUpdate(column.id, { model })
                      setModelDropdownOpen(false)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs"
                    style={{
                      background: model.id === column.model.id ? 'rgba(139,92,246,0.1)' : 'transparent',
                      border: 'none',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { if (model.id !== column.model.id) e.currentTarget.style.background = 'var(--bg-card)' }}
                    onMouseLeave={(e) => { if (model.id !== column.model.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: model.color }} />
                    <span className="font-medium">{model.name}</span>
                    <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>{model.provider}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3">
          {column.responseTime !== null && (
            <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              <Clock className="w-3 h-3" />
              {column.responseTime}ms
            </div>
          )}
          {column.tokenCount > 0 && (
            <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              <Hash className="w-3 h-3" />
              {column.tokenCount} tokens
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 0 }}>
        {column.messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center" style={{ color: 'var(--text-dim)' }}>
              <FlaskConical className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
              <p className="text-sm">Send a prompt to compare responses</p>
            </div>
          </div>
        )}
        {column.messages.map((msg, i) => (
          <div
            key={i}
            className="rounded-lg p-3 text-sm"
            style={{
              background: msg.role === 'user' ? 'rgba(139,92,246,0.1)' : 'var(--bg-elevated)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(139,92,246,0.2)' : 'var(--border)'}`,
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
            }}
          >
            <div className="text-xs font-medium mb-1" style={{ color: msg.role === 'user' ? 'var(--accent)' : column.model.color }}>
              {msg.role === 'user' ? 'You' : column.model.name}
            </div>
            {msg.content || (column.isStreaming ? '▍' : '')}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Vote button */}
      {column.messages.some(m => m.role === 'assistant') && !column.isStreaming && (
        <div className="px-3 py-1" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => onVote(column.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium w-full justify-center"
            style={{
              background: column.voted ? 'rgba(139,92,246,0.15)' : 'var(--bg-elevated)',
              border: `1px solid ${column.voted ? 'var(--accent)' : 'var(--border)'}`,
              color: column.voted ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Trophy className="w-3.5 h-3.5" />
            {column.voted ? 'Best Response ✓' : 'Vote Best Response'}
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <input
            value={column.input}
            onChange={(e) => onUpdate(column.id, { input: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="Enter prompt..."
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontFamily: 'inherit',
            }}
            disabled={column.isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={column.isStreaming || !column.input.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{
              background: column.isStreaming || !column.input.trim() ? 'var(--bg-elevated)' : 'var(--accent)',
              border: 'none',
              cursor: column.isStreaming || !column.input.trim() ? 'not-allowed' : 'pointer',
              color: '#fff',
              opacity: column.isStreaming || !column.input.trim() ? 0.5 : 1,
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────

export function PlaygroundView() {
  const [columnCount, setColumnCount] = useState(2)
  const [columns, setColumns] = useState<ChatColumn[]>([
    createColumn('col-1', MODELS[0]),
    createColumn('col-2', MODELS[1]),
  ])
  const [globalPrompt, setGlobalPrompt] = useState('')
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('')
  const [globalTemp, setGlobalTemp] = useState(0.7)
  const [globalMaxTokens, setGlobalMaxTokens] = useState(4096)

  const handleUpdateColumn = useCallback((id: string, updates: Partial<ChatColumn>) => {
    setColumns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }, [])

  const handleVote = useCallback((id: string) => {
    setColumns(prev => prev.map(c => ({
      ...c,
      voted: c.id === id ? true : c.voted ? false : false,  // only one vote
    })))
  }, [])

  const handleAddColumn = useCallback(() => {
    if (columnCount >= 3) return
    const nextModel = MODELS[columnCount]
    setColumns(prev => [...prev, createColumn(`col-${columnCount + 1}`, nextModel)])
    setColumnCount(prev => prev + 1)
  }, [columnCount])

  const handleRemoveColumn = useCallback((id: string) => {
    if (columnCount <= 1) return
    setColumns(prev => prev.filter(c => c.id !== id))
    setColumnCount(prev => prev - 1)
  }, [columnCount])

  const handleSendAll = useCallback(() => {
    const prompt = globalPrompt
    if (!prompt.trim()) return
    setGlobalPrompt('')
    columns.forEach((col) => {
      handleUpdateColumn(col.id, { input: prompt })
      // The column's own send will handle it
    })
  }, [globalPrompt, columns, handleUpdateColumn])

  const handleClear = useCallback(() => {
    setColumns(prev => prev.map(c => ({
      ...c,
      messages: [],
      responseTime: null,
      tokenCount: 0,
      voted: false,
    })))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Agent Playground</h2>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Compare models side by side</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setColumnCount(2)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs"
              style={{
                background: columnCount === 2 ? 'var(--accent)' : 'var(--bg-elevated)',
                color: columnCount === 2 ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${columnCount === 2 ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Columns2 className="w-3.5 h-3.5" />
              2
            </button>
            <button
              onClick={() => {
                if (columnCount < 3) handleAddColumn()
                setColumnCount(3)
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs"
              style={{
                background: columnCount === 3 ? 'var(--accent)' : 'var(--bg-elevated)',
                color: columnCount === 3 ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${columnCount === 3 ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Columns3 className="w-3.5 h-3.5" />
              3
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
        </div>

        {/* Global settings */}
        <div
          className="mb-4 p-3 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                System Prompt
              </label>
              <textarea
                value={globalSystemPrompt}
                onChange={(e) => setGlobalSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
                className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                rows={2}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div className="flex flex-col gap-2 w-48">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Temperature: {globalTemp.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={globalTemp}
                  onChange={(e) => setGlobalTemp(parseFloat(e.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Max Tokens: {globalMaxTokens}
                </label>
                <input
                  type="range"
                  min="256"
                  max="8192"
                  step="256"
                  value={globalMaxTokens}
                  onChange={(e) => setGlobalMaxTokens(parseInt(e.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Columns */}
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)`, height: 'calc(100vh - 380px)', minHeight: 400 }}>
          {columns.map((col) => (
            <ModelColumn
              key={col.id}
              column={{ ...col, systemPrompt: globalSystemPrompt, temperature: globalTemp, maxTokens: globalMaxTokens }}
              onUpdate={handleUpdateColumn}
              onVote={handleVote}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function createColumn(id: string, model: ModelOption): ChatColumn {
  return {
    id,
    model,
    messages: [],
    input: '',
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 4096,
    isStreaming: false,
    responseTime: null,
    tokenCount: 0,
    voted: false,
  }
}