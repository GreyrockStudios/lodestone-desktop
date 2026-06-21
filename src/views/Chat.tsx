import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Sparkles, Copy, Pin, Download, Activity as ActivityIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { useStore, type ChatMessage } from '../store'
import { io, Socket } from 'socket.io-client'
import { marked } from 'marked'
import { ActivityFeed, type ActivityEntry } from '../components/ActivityFeed'

marked.setOptions({ breaks: true, gfm: true })

// ─── Context Menu ─────────────────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  msg: ChatMessage
}

function ContextMenu({
  state,
  onClose,
  onCopy,
  onCopyMarkdown,
  onPin,
  onExport,
}: {
  state: ContextMenuState
  onClose: () => void
  onCopy: (msg: ChatMessage) => void
  onCopyMarkdown: (msg: ChatMessage) => void
  onPin: (msg: ChatMessage) => void
  onExport: (msg: ChatMessage) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const items = [
    { label: 'Copy', icon: Copy, action: () => onCopy(state.msg) },
    { label: 'Copy as Markdown', icon: Copy, action: () => onCopyMarkdown(state.msg) },
    { label: 'Pin to top', icon: Pin, action: () => onPin(state.msg) },
    { label: 'Export as .md file', icon: Download, action: () => onExport(state.msg) },
  ]

  // Clamp position to viewport
  const x = Math.min(state.x, window.innerWidth - 200)
  const y = Math.min(state.y, window.innerHeight - 200)

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        minWidth: 180,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: '4px',
        fontFamily: 'inherit',
      }}
    >
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={i}
            onClick={() => {
              item.action()
              onClose()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 13,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Mock Activity Entries ─────────────────────────────────────────────

function generateMockActivity(): ActivityEntry[] {
  const now = Date.now()
  return [
    {
      id: 'mock-1',
      type: 'thinking',
      message: 'Analyzing user query and searching memory for relevant context…',
      timestamp: now - 8000,
    },
    {
      id: 'mock-2',
      type: 'tool',
      message: 'memory.search(query="project status", limit=5)',
      timestamp: now - 6000,
      detail: '{\n  "query": "project status",\n  "results": [\n    { "id": "mem-42", "score": 0.89 },\n    { "id": "mem-17", "score": 0.72 }\n  ]\n}',
    },
    {
      id: 'mock-3',
      type: 'memory',
      message: 'Stored interaction to episodic memory (mem-128)',
      timestamp: now - 4000,
    },
    {
      id: 'mock-4',
      type: 'thinking',
      message: 'Composing response with 3 retrieved memories as context…',
      timestamp: now - 2000,
    },
    {
      id: 'mock-5',
      type: 'wiki',
      message: 'Updated wiki page: [[project-status]]',
      timestamp: now - 1000,
    },
  ]
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

function stripMarkdown(md: string): string {
  // Simple markdown-to-plain-text: remove common markers
  return md
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[#*_>~\-]/g, '') // formatting chars
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// ─── Main Chat Component ──────────────────────────────────────────────

export function Chat() {
  const { messages, addMessage, engineRunning, enginePort, config } = useStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showActivity, setShowActivity] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())

  const mockActivity = useMemo(() => generateMockActivity(), [])

  // Connect to engine via Socket.IO
  useEffect(() => {
    if (engineRunning && enginePort) {
      const socket = io(`http://localhost:${enginePort}`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
      })

      socket.on('connect', () => {
        console.log('Connected to Lodestone engine')
      })

      socket.on('connected', (data: { sessionId: string }) => {
        console.log('Session:', data.sessionId)
      })

      socket.on('response', (text: string) => {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        })
        setSending(false)
      })

      socket.on('agent_response', (data: { text: string; content: string }) => {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.content || data.text,
          timestamp: Date.now(),
        })
        setSending(false)
      })

      socket.on('stream', (text: string) => {
        setStreamingText(text)
      })

      socket.on('stream_end', (text: string) => {
        setStreamingText(null)
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        })
        setSending(false)
      })

      socket.on('error', (err: string) => {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Error: ${err}`,
          timestamp: Date.now(),
        })
        setSending(false)
      })

      socketRef.current = socket

      return () => {
        socket.disconnect()
        socketRef.current = null
      }
    }
  }, [engineRunning, enginePort])

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingText])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 22
    const maxHeight = lineHeight * 6 // 6 rows max
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }, [input])

  const handleSend = () => {
    if (!input.trim() || !socketRef.current) return
    setSending(true)

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    }
    addMessage(msg)
    socketRef.current.emit('message', { content: input.trim() })
    setInput('')
  }

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, msg: ChatMessage) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, msg })
  }, [])

  const handleCopy = useCallback((msg: ChatMessage) => {
    navigator.clipboard.writeText(stripMarkdown(msg.content))
  }, [])

  const handleCopyMarkdown = useCallback((msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content)
  }, [])

  const handlePin = useCallback((msg: ChatMessage) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(msg.id)) next.delete(msg.id)
      else next.add(msg.id)
      return next
    })
  }, [])

  const handleExport = useCallback((msg: ChatMessage) => {
    const blob = new Blob([msg.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `message-${msg.id}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Sorted: pinned first, then by time
  const sortedMessages = useMemo(() => {
    const pinned = messages.filter((m) => pinnedIds.has(m.id))
    const rest = messages.filter((m) => !pinnedIds.has(m.id))
    return [...pinned, ...rest]
  }, [messages, pinnedIds])

  if (!engineRunning) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-card)' }}>
            <Sparkles className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Agent is not running</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Start the engine to begin chatting with your agent.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-2 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Chat with {config?.agentName || 'your agent'}
          </h2>
        </div>
        <button
          onClick={() => setShowActivity((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
          style={{
            background: showActivity ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${showActivity ? 'var(--border)' : 'transparent'}`,
            color: showActivity ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <ActivityIcon className="w-3.5 h-3.5" />
          <span>Activity</span>
          {showActivity ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-medium mb-1">Chat with {config?.agentName || 'your agent'}</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Ask anything. Your agent has memory, tools, and learns from every interaction.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {sortedMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                pinned={pinnedIds.has(msg.id)}
                onContextMenu={handleContextMenu}
              />
            ))}
            {streamingText && (
              <div className="flex justify-start">
                <div
                  className="max-w-[80%] px-4 py-3 rounded-2xl text-sm opacity-80 prose-chat"
                  style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  dangerouslySetInnerHTML={{ __html: marked.parse(streamingText) as string }}
                />
              </div>
            )}
            {sending && !streamingText && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <TypingDots name={config?.agentName || 'Agent'} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      {showActivity && (
        <ActivityFeed entries={mockActivity} onClear={() => {}} />
      )}

      {/* Input */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Send a message..."
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl text-sm resize-none overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              minHeight: '44px',
              lineHeight: '22px',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
            style={{
              background: input.trim() ? 'linear-gradient(135deg, #8B5CF6, #7C3AED)' : 'var(--bg-elevated)',
              border: 'none',
              cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
            }}
          >
            <Send className="w-4 h-4" style={{ color: input.trim() ? 'white' : 'var(--text-dim)' }} />
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onCopyMarkdown={handleCopyMarkdown}
          onPin={handlePin}
          onExport={handleExport}
        />
      )}
    </div>
  )
}

// ─── Typing Dots Indicator ─────────────────────────────────────────────

function TypingDots({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--text-muted)',
              animation: `typingPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <span>{name} is thinking...</span>
      <style>{`
        @keyframes typingPulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}

// ─── Message Bubble ────────────────────────────────────────────────────

function MessageBubble({
  msg,
  pinned,
  onContextMenu,
}: {
  msg: ChatMessage
  pinned: boolean
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage) => void
}) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
        <span>{msg.content}</span>
      </div>
    )
  }

  return (
    <div
      className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onContextMenu={(e) => onContextMenu(e, msg)}
    >
      <div className="flex flex-col" style={{ maxWidth: '80%' }}>
        {/* Timestamp tooltip */}
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 mb-0.5"
          style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: isUser ? 'right' : 'left' }}
        >
          {pinned && <span style={{ color: 'var(--accent)', marginRight: 4 }}>📌 Pinned</span>}
          {getRelativeTime(msg.timestamp)}
        </div>
        {/* Bubble */}
        <div
          className="px-4 py-3 rounded-2xl text-sm"
          style={{
            background: isUser ? 'linear-gradient(135deg, #8B5CF6, #7C3AED)' : 'var(--bg-card)',
            color: isUser ? 'white' : 'var(--text)',
            border: isUser ? 'none' : '1px solid var(--border)',
            cursor: 'context-menu',
          }}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{msg.content}</div>
          ) : (
            <div
              className="prose-chat"
              dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }}
            />
          )}
          {msg.tools && msg.tools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {msg.tools.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#A78BFA' }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}