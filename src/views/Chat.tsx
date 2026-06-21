import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Sparkles, Copy, Pin, Download, Activity as ActivityIcon, ChevronUp, ChevronDown, Paperclip, X, FileText, Image as ImageIcon, Mic, FileDown, PanelRightClose, PanelRight, ChevronLeft, Tag as TagIcon, GitBranch, ArrowLeft } from 'lucide-react'
import { useStore, type ChatMessage } from '../store'
import { io, Socket } from 'socket.io-client'
import { marked } from 'marked'
import { ActivityFeed, type ActivityEntry } from '../components/ActivityFeed'
import { ToolExecutionModal } from '../components/ToolExecutionModal'
import { MessageTemplates } from '../components/MessageTemplates'
import { useVoiceInput } from '../hooks/useVoiceInput'

marked.setOptions({ breaks: true, gfm: true })

// ─── Toast ────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        padding: '10px 20px',
        borderRadius: 10,
        fontSize: 13,
        zIndex: 10000,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {message}
    </div>
  )
}

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
  onTag,
  onBranch,
}: {
  state: ContextMenuState
  onClose: () => void
  onCopy: (msg: ChatMessage) => void
  onCopyMarkdown: (msg: ChatMessage) => void
  onPin: (msg: ChatMessage) => void
  onExport: (msg: ChatMessage) => void
  onTag: (msg: ChatMessage) => void
  onBranch: (msg: ChatMessage) => void
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
    { label: 'Add Tag', icon: TagIcon, action: () => onTag(state.msg) },
    { label: 'Branch from here', icon: GitBranch, action: () => onBranch(state.msg) },
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
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>~\-]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// ─── Pinned Messages Panel ────────────────────────────────────────────

function PinnedMessagesPanel({
  pinnedMessages,
  onScrollToMessage,
  onUnpin,
  onClose,
}: {
  pinnedMessages: ChatMessage[]
  onScrollToMessage: (msg: ChatMessage) => void
  onUnpin: (msg: ChatMessage) => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pin style={{ width: 14, height: 14, color: 'var(--accent)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Pinned</span>
          <span
            style={{
              fontSize: 10,
              background: 'var(--bg-elevated)',
              color: 'var(--text-dim)',
              padding: '1px 6px',
              borderRadius: 10,
            }}
          >
            {pinnedMessages.length}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            borderRadius: 4,
          }}
          title="Close pinned panel"
        >
          <ChevronLeft style={{ width: 16, height: 16, color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Pinned messages list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {pinnedMessages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 12px',
              color: 'var(--text-dim)',
              fontSize: 12,
            }}
          >
            <Pin style={{ width: 24, height: 24, margin: '0 auto 8px', opacity: 0.3 }} />
            No pinned messages yet.
            <br />
            Right-click a message to pin it.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pinnedMessages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onClick={() => onScrollToMessage(msg)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      color: msg.role === 'user' ? '#8B5CF6' : '#06B6D4',
                    }}
                  >
                    {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Agent' : 'System'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onUnpin(msg)
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      opacity: 0.4,
                    }}
                    title="Unpin"
                  >
                    <X style={{ width: 12, height: 12, color: 'var(--text-dim)' }} />
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {stripMarkdown(msg.content).slice(0, 120)}
                  {msg.content.length > 120 ? '…' : ''}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                  {getRelativeTime(msg.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Chat Component ──────────────────────────────────────────────

export function Chat() {
  const { messages, addMessage, engineRunning, enginePort, config, sending, setSending } = useStore()
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showActivity, setShowActivity] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [showPinnedPanel, setShowPinnedPanel] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const dragCounter = useRef(0)
  const [toast, setToast] = useState<string | null>(null)
  const [toolModal, setToolModal] = useState<string | null>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  // Tags state: message id -> array of tags
  const [messageTags, setMessageTags] = useState<Map<string, string[]>>(new Map())
  const [tagInputMsgId, setTagInputMsgId] = useState<string | null>(null)
  const [tagInputValue, setTagInputValue] = useState('')
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Branching state
  const [branches, setBranches] = useState<Map<string, ChatMessage[]>>(new Map())
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)
  // When in a branch, show messages from branches.get(activeBranchId), else from store
  const [mainMessagesSnapshot, setMainMessagesSnapshot] = useState<ChatMessage[]>([])

  // Ref to always have current activeBranchId in socket handlers
  const activeBranchIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeBranchIdRef.current = activeBranchId
  }, [activeBranchId])

  // Voice input
  const { listening: voiceListening, supported: voiceSupported, toggle: toggleVoice } = useVoiceInput(
    useCallback((text: string, _isFinal: boolean) => {
      setInput(text)
      // Focus textarea after receiving transcript
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }, []),
  )

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
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        }
        addMessage(assistantMsg)
        if (activeBranchIdRef.current) {
          setBranches(prev => {
            const next = new Map(prev)
            const branchMsgs = next.get(activeBranchIdRef.current!) || []
            next.set(activeBranchIdRef.current!, [...branchMsgs, assistantMsg])
            return next
          })
        }
        setSending(false)
      })

      socket.on('agent_response', (data: { text: string; content: string }) => {
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.content || data.text,
          timestamp: Date.now(),
        }
        addMessage(assistantMsg)
        if (activeBranchIdRef.current) {
          setBranches(prev => {
            const next = new Map(prev)
            const branchMsgs = next.get(activeBranchIdRef.current!) || []
            next.set(activeBranchIdRef.current!, [...branchMsgs, assistantMsg])
            return next
          })
        }
        setSending(false)
      })

      socket.on('stream', (text: string) => {
        setStreamingText(text)
      })

      socket.on('stream_end', (text: string) => {
        setStreamingText(null)
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        }
        addMessage(assistantMsg)
        if (activeBranchIdRef.current) {
          setBranches(prev => {
            const next = new Map(prev)
            const branchMsgs = next.get(activeBranchIdRef.current!) || []
            next.set(activeBranchIdRef.current!, [...branchMsgs, assistantMsg])
            return next
          })
        }
        setSending(false)
      })

      socket.on('error', (err: string) => {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content: `Error: ${err}`,
          timestamp: Date.now(),
        }
        addMessage(errorMsg)
        if (activeBranchIdRef.current) {
          setBranches(prev => {
            const next = new Map(prev)
            const branchMsgs = next.get(activeBranchIdRef.current!) || []
            next.set(activeBranchIdRef.current!, [...branchMsgs, errorMsg])
            return next
          })
        }
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
    const maxHeight = lineHeight * 6
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }, [input])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setAttachments((prev) => [...prev, ...files])
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setAttachments((prev) => [...prev, ...files])
    }
    e.target.value = ''
  }, [])

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || !socketRef.current) return
    setSending(true)

    let content = input.trim()
    if (attachments.length > 0) {
      const fileList = attachments.map(f => `[Attached: ${f.name} (${(f.size / 1024).toFixed(1)}KB)]`).join('\n')
      content = content ? `${content}\n${fileList}` : fileList
    }

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    addMessage(msg)
    // Also add to active branch if in a branch
    if (activeBranchId) {
      setBranches(prev => {
        const next = new Map(prev)
        const branchMsgs = next.get(activeBranchIdRef.current!) || []
        next.set(activeBranchIdRef.current!, [...branchMsgs, msg])
        return next
      })
    }
    socketRef.current.emit('message', { content })
    setInput('')
    setAttachments([])
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
      if (next.has(msg.id)) {
        next.delete(msg.id)
      } else {
        next.add(msg.id)
        // Show panel when first message is pinned
        if (next.size === 1) {
          setShowPinnedPanel(true)
        }
      }
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

  const handleTag = useCallback((msg: ChatMessage) => {
    setTagInputMsgId(msg.id)
    setTagInputValue('')
    setTimeout(() => tagInputRef.current?.focus(), 50)
  }, [])

  const handleBranch = useCallback((msg: ChatMessage) => {
    // Snapshot current main messages up to and including the branched message
    const branchPoint = messages.indexOf(msg)
    if (branchPoint === -1) return
    const branchedMessages = messages.slice(0, branchPoint + 1)
    const branchId = `branch-${Date.now()}`
    setBranches(prev => {
      const next = new Map(prev)
      next.set(branchId, [...branchedMessages])
      return next
    })
    // Save main messages to restore later
    setMainMessagesSnapshot(messages)
    setActiveBranchId(branchId)
    setToast(`Branched from message #${branchPoint + 1}`)
  }, [messages])

  const handleBackToMain = useCallback(() => {
    setActiveBranchId(null)
    setToast('Back to main conversation')
  }, [])

  // Active messages: either from branch or store
  const activeMessages = activeBranchId ? (branches.get(activeBranchId) || []) : messages

  const handleAddTag = useCallback(() => {
    if (!tagInputMsgId || !tagInputValue.trim()) return
    const tag = tagInputValue.trim().toLowerCase()
    setMessageTags(prev => {
      const next = new Map(prev)
      const existing = next.get(tagInputMsgId) || []
      if (!existing.includes(tag)) {
        next.set(tagInputMsgId, [...existing, tag])
      }
      return next
    })
    setTagInputValue('')
    setTagInputMsgId(null)
  }, [tagInputMsgId, tagInputValue])

  const handleRemoveTag = useCallback((msgId: string, tag: string) => {
    setMessageTags(prev => {
      const next = new Map(prev)
      const existing = next.get(msgId) || []
      next.set(msgId, existing.filter(t => t !== tag))
      if (next.get(msgId)?.length === 0) next.delete(msgId)
      return next
    })
  }, [])

  // All unique tags across all messages
  const allTags = useMemo(() => {
    const set = new Set<string>()
    messageTags.forEach(tags => tags.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [messageTags])

  const handleExportConversation = useCallback(() => {
    const md = messages.map(m => {
      const role = m.role === 'user' ? '**You**' : m.role === 'assistant' ? `**${config?.agentName || 'Agent'}**` : '*System*'
      return `### ${role} — ${new Date(m.timestamp).toLocaleString()}\n\n${m.content}\n`
    }).join('\n---\n\n')
    const header = `# Conversation with ${config?.agentName || 'Agent'}\n# ${new Date().toLocaleString()}\n\n`
    const blob = new Blob([header + md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages, config])

  const handleMicClick = useCallback(() => {
    if (!voiceSupported) {
      setToast('Voice input not supported in this browser')
      return
    }
    toggleVoice()
  }, [voiceSupported, toggleVoice])

  const handleScrollToMessage = useCallback((msg: ChatMessage) => {
    const el = messageRefs.current.get(msg.id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Brief highlight
      el.style.transition = 'background 0.3s'
      const orig = el.style.background
      el.style.background = 'rgba(139, 92, 246, 0.1)'
      setTimeout(() => {
        el.style.background = orig
      }, 1000)
    }
  }, [])

  // Sorted: pinned first, then by time
  const sortedMessages = useMemo(() => {
    let result = activeMessages
    if (activeTagFilter) {
      result = result.filter(m => (messageTags.get(m.id) || []).includes(activeTagFilter))
    }
    const pinned = result.filter((m) => pinnedIds.has(m.id))
    const rest = result.filter((m) => !pinnedIds.has(m.id))
    return [...pinned, ...rest]
  }, [activeMessages, pinnedIds, activeTagFilter, messageTags])

  const pinnedMessages = useMemo(() => {
    return activeMessages.filter((m) => pinnedIds.has(m.id))
  }, [activeMessages, pinnedIds])

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
    <div
      className="flex-1 flex h-full relative"
      style={{ background: 'var(--bg)' }}
    >
      {/* Pinned Messages Panel */}
      {showPinnedPanel && (
        <PinnedMessagesPanel
          pinnedMessages={pinnedMessages}
          onScrollToMessage={handleScrollToMessage}
          onUnpin={handlePin}
          onClose={() => setShowPinnedPanel(false)}
        />
      )}

      {/* Main Chat Area */}
      <div
        className="flex-1 flex flex-col h-full relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(139, 92, 246, 0.1)', backdropFilter: 'blur(4px)' }}
          >
            <div className="text-center" style={{ background: 'var(--bg-card)', border: '2px dashed var(--accent)', borderRadius: 16, padding: '32px 48px' }}>
              <Paperclip className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
              <p className="text-base font-medium" style={{ color: 'var(--text)' }}>Drop files to attach</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>PDF, images, code, text files</p>
            </div>
          </div>
        )}

        {/* Branch indicator */}
        {activeBranchId && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              background: 'rgba(139, 92, 246, 0.08)',
              borderBottom: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span style={{ fontWeight: 500 }}>Branched conversation</span>
            <button
              onClick={handleBackToMain}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'transparent',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: 6,
                padding: '2px 8px',
                color: 'var(--accent)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginLeft: 'auto',
              }}
              title="Back to main conversation"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to main conversation
            </button>
          </div>
        )}

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-2 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Chat with {config?.agentName || 'your agent'}
            </h2>
            {pinnedIds.size > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  background: 'rgba(139, 92, 246, 0.12)',
                  color: '#A78BFA',
                  padding: '1px 8px',
                  borderRadius: 10,
                  fontWeight: 500,
                }}
              >
                <Pin style={{ width: 10, height: 10 }} />
                {pinnedIds.size}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Pinned panel toggle */}
            {pinnedIds.size > 0 && (
              <button
                onClick={() => setShowPinnedPanel((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
                style={{
                  background: showPinnedPanel ? 'var(--bg-elevated)' : 'transparent',
                  border: `1px solid ${showPinnedPanel ? 'var(--border)' : 'transparent'}`,
                  color: showPinnedPanel ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                title="Toggle pinned panel"
              >
                {showPinnedPanel ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              onClick={handleExportConversation}
              disabled={messages.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: messages.length > 0 ? 'pointer' : 'not-allowed',
                opacity: messages.length > 0 ? 1 : 0.4,
                fontFamily: 'inherit',
              }}
              title="Export conversation as Markdown"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
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
        </div>

        {/* Tag Filter Bar */}
        {allTags.length > 0 && (
          <div
            className="flex items-center gap-2 px-6 py-2 border-b overflow-x-auto"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', flexShrink: 0 }}
          >
            <TagIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
            <button
              onClick={() => setActiveTagFilter(null)}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs transition-all"
              style={{
                background: !activeTagFilter ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                color: !activeTagFilter ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${!activeTagFilter ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              All
            </button>
            {allTags.map(tag => {
              const tagColors: Record<string, { bg: string; color: string }> = {
                important: { bg: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' },
                todo: { bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' },
                reference: { bg: 'rgba(6, 182, 212, 0.12)', color: '#06B6D4' },
              }
              const c = tagColors[tag] || { bg: 'rgba(139, 92, 246, 0.12)', color: '#A78BFA' }
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs transition-all"
                  style={{
                    background: activeTagFilter === tag ? c.bg : 'transparent',
                    color: activeTagFilter === tag ? c.color : 'var(--text-muted)',
                    border: `1px solid ${activeTagFilter === tag ? c.color + '40' : 'var(--border)'}`,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  #{tag}
                </button>
              )
            })}
            {activeTagFilter && (
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Filtering: {sortedMessages.length} message(s)
              </span>
            )}
          </div>
        )}

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
                <div
                  key={msg.id}
                  ref={(el) => { messageRefs.current.set(msg.id, el) }}
                >
                  <MessageBubble
                    msg={msg}
                    pinned={pinnedIds.has(msg.id)}
                    tags={messageTags.get(msg.id) || []}
                    onContextMenu={handleContextMenu}
                    onToolClick={(toolName: string) => setToolModal(toolName)}
                    onRemoveTag={(tag: string) => handleRemoveTag(msg.id, tag)}
                  />
                  {tagInputMsgId === msg.id && (
                    <div className="flex justify-start mb-2">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <TagIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                        <input
                          ref={tagInputRef}
                          type="text"
                          value={tagInputValue}
                          onChange={(e) => setTagInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleAddTag() }
                            if (e.key === 'Escape') { setTagInputMsgId(null); setTagInputValue('') }
                          }}
                          placeholder="Enter tag name..."
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', width: 140, fontFamily: 'inherit' }}
                        />
                        <button
                          onClick={handleAddTag}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setTagInputMsgId(null); setTagInputValue('') }}
                          className="text-xs px-1 py-1 rounded"
                          style={{ background: 'transparent', color: 'var(--text-dim)', border: 'none', cursor: 'pointer' }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
          <div className="max-w-3xl mx-auto">
            {/* Attachments bar */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    {file.type.startsWith('image/') ? (
                      <ImageIcon className="w-3.5 h-3.5" style={{ color: '#06B6D4' }} />
                    ) : (
                      <FileText className="w-3.5 h-3.5" style={{ color: '#A78BFA' }} />
                    )}
                    <span className="text-xs" style={{ color: 'var(--text)' }}>{file.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{(file.size / 1024).toFixed(0)}KB</span>
                    <button onClick={() => removeAttachment(idx)} className="p-0.5 rounded hover:bg-red-500/10">
                      <X className="w-3 h-3" style={{ color: '#EF4444' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Voice listening indicator */}
            {voiceListening && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#EF4444',
                    animation: 'voicePulse 1.2s ease-in-out infinite',
                  }}
                />
                <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }}>Listening…</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Speak now. Click mic again to stop.</span>
                <style>{`
                  @keyframes voicePulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(1.3); }
                  }
                `}</style>
              </div>
            )}

            <div className="flex items-end gap-2">
              <input type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} id="file-input" />
              <button
                onClick={() => document.getElementById('file-input')?.click()}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                title="Attach files"
              >
                <Paperclip className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
              <button
                onClick={handleMicClick}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
                style={{
                  background: voiceListening ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-elevated)',
                  border: voiceListening ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)',
                }}
                title="Voice input"
              >
                <Mic
                  className="w-4 h-4"
                  style={{
                    color: voiceListening ? '#EF4444' : 'var(--text-muted)',
                    animation: voiceListening ? 'micPulse 1.2s ease-in-out infinite' : 'none',
                  }}
                />
                {voiceListening && (
                  <style>{`
                    @keyframes micPulse {
                      0%, 100% { opacity: 1; }
                      50% { opacity: 0.4; }
                    }
                  `}</style>
                )}
              </button>
              <MessageTemplates onInsert={(text) => {
                setInput(text)
                if (textareaRef.current) textareaRef.current.focus()
              }} currentInput={input} />
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
                placeholder={voiceListening ? 'Listening…' : 'Send a message...'}
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
                disabled={(!input.trim() && attachments.length === 0) || sending}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
                style={{
                  background: (input.trim() || attachments.length > 0) ? "linear-gradient(135deg, #8B5CF6, #7C3AED)" : "var(--bg-elevated)",
                  border: 'none',
                  cursor: ((input.trim() || attachments.length > 0) && !sending) ? 'pointer' : 'not-allowed',
                }}
              >
                <Send className="w-4 h-4" style={{ color: (input.trim() || attachments.length > 0) ? 'white' : 'var(--text-dim)' }} />
              </button>
            </div>
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
            onTag={handleTag}
            onBranch={handleBranch}
          />
        )}

        {/* Toast */}
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}

        {/* Tool Execution Modal */}
        {toolModal && (
          <ToolExecutionModal toolName={toolModal} onClose={() => setToolModal(null)} />
        )}
      </div>
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
  tags,
  onContextMenu,
  onToolClick,
  onRemoveTag,
  dimmed = false,
  highlightQuery = '',
}: {
  msg: ChatMessage
  pinned: boolean
  tags: string[]
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage) => void
  onToolClick: (toolName: string) => void
  onRemoveTag: (tag: string) => void
  dimmed?: boolean
  highlightQuery?: string
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
      style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.2s' }}
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
                <button
                  key={t}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToolClick(t)
                  }}
                  className="text-xs px-2 py-0.5 rounded-full transition-all"
                  style={{
                    background: 'rgba(139, 92, 246, 0.15)',
                    color: '#A78BFA',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.25)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'
                  }}
                  title={`View details for ${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Tag badges */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5" style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {tags.map(tag => {
              const tagColors: Record<string, { bg: string; color: string }> = {
                important: { bg: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' },
                todo: { bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' },
                reference: { bg: 'rgba(6, 182, 212, 0.12)', color: '#06B6D4' },
              }
              const c = tagColors[tag] || { bg: 'rgba(139, 92, 246, 0.12)', color: '#A78BFA' }
              return (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}
                >
                  #{tag}
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveTag(tag) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.5 }}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}