import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import { useStore, type ChatMessage } from '../store'
import { io, Socket } from 'socket.io-client'

export function Chat() {
  const { messages, addMessage, engineRunning, enginePort, config } = useStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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

      socket.on('message', (data: { role: string; content: string; tools?: string[] }) => {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.content,
          timestamp: Date.now(),
          tools: data.tools,
        })
        setSending(false)
      })

      socket.on('tool_call', (data: { tool: string; args: any }) => {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Using tool: ${data.tool}`,
          timestamp: Date.now(),
          tools: [data.tool],
        })
      })

      socket.on('error', (data: { message: string }) => {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Error: ${data.message}`,
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
  }, [messages])

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
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                {config?.agentName || 'Agent'} is thinking...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
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
            className="flex-1 px-4 py-3 rounded-xl text-sm resize-none"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              minHeight: '44px',
              maxHeight: '120px',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
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
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
        <Wrench className="w-3 h-3" />
        {msg.content}
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] px-4 py-3 rounded-2xl text-sm"
        style={{
          background: isUser ? 'linear-gradient(135deg, #8B5CF6, #7C3AED)' : 'var(--bg-card)',
          color: isUser ? 'white' : 'var(--text)',
          border: isUser ? 'none' : '1px solid var(--border)',
        }}
      >
        <div className="whitespace-pre-wrap">{msg.content}</div>
        {msg.tools && msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {msg.tools.map(t => (
              <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#A78BFA' }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { Wrench } from 'lucide-react'