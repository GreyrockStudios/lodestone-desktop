import { useState, useMemo, useEffect } from 'react'
import { History as HistoryIcon, Search, Download, ChevronDown, ChevronRight, MessageSquare, Wrench, Calendar, Trash2, Inbox } from 'lucide-react'
import { useStore, type ChatMessage } from '../store'

interface Session {
  id: string
  messages: ChatMessage[]
  startTime: number
  endTime: number
  toolCount: number
}

const MOCK_SESSIONS: Session[] = []

function groupSessionsByDate(sessions: Session[]): { label: string; sessions: Session[] }[] {
  const now = Date.now()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  const groups: Record<string, Session[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  }

  for (const s of sessions) {
    const t = s.startTime
    if (t >= todayStart.getTime()) {
      groups.Today.push(s)
    } else if (t >= yesterdayStart.getTime()) {
      groups.Yesterday.push(s)
    } else if (t >= weekStart.getTime()) {
      groups['This Week'].push(s)
    } else {
      groups.Older.push(s)
    }
  }

  return ['Today', 'Yesterday', 'This Week', 'Older']
    .filter(label => groups[label].length > 0)
    .map(label => ({ label, sessions: groups[label] }))
}

function getSessionPreview(s: Session): string {
  const first = s.messages.find(m => m.role === 'user' || m.role === 'assistant')
  if (!first) return '(empty session)'
  const text = first.content.trim()
  return text.length > 120 ? text.slice(0, 120) + '...' : text
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function exportSessionAsMarkdown(s: Session): string {
  const lines: string[] = []
  lines.push(`# Conversation Export`)
  lines.push('')
  lines.push(`**Date:** ${new Date(s.startTime).toLocaleString()}`)
  lines.push(`**Messages:** ${s.messages.length}`)
  lines.push(`**Tools used:** ${s.toolCount}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const m of s.messages) {
    const role = m.role === 'user' ? '👤 **You**' : m.role === 'assistant' ? '🤖 **Agent**' : '⚙️ **System**'
    const time = new Date(m.timestamp).toLocaleTimeString()
    lines.push(`### ${role} — ${time}`)
    lines.push('')
    lines.push(m.content)
    if (m.tools && m.tools.length > 0) {
      lines.push('')
      lines.push(`*Tools: ${m.tools.join(', ')}*`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function History() {
  const { messages, engineRunning } = useStore()
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>(MOCK_SESSIONS)

  // Build sessions from current messages (for live view)
  useEffect(() => {
    if (messages.length > 0) {
      // Treat current messages as one session
      const liveSession: Session = {
        id: 'current',
        messages,
        startTime: messages[0]?.timestamp ?? Date.now(),
        endTime: messages[messages.length - 1]?.timestamp ?? Date.now(),
        toolCount: messages.filter(m => m.tools && m.tools.length > 0).reduce((acc, m) => acc + (m.tools?.length ?? 0), 0),
      }
      setSessions(prev => {
        const filtered = prev.filter(s => s.id !== 'current')
        return [liveSession, ...filtered]
      })
    }
  }, [messages])

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(s =>
      s.messages.some(m => m.content.toLowerCase().includes(q))
    )
  }, [sessions, search])

  const grouped = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])

  const handleExport = (s: Session) => {
    const md = exportSessionAsMarkdown(s)
    const date = new Date(s.startTime).toISOString().split('T')[0]
    downloadMarkdown(`conversation-${date}-${s.id}.md`, md)
  }

  if (!engineRunning && sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-card)' }}>
            <HistoryIcon className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No history yet</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Start chatting with your agent to build conversation history.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <HistoryIcon className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">History</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredSessions.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Inbox className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
              <h3 className="text-sm font-medium mb-1">No matching conversations</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Try a different search term.</p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {grouped.map(group => (
              <div key={group.label}>
                {/* Date group label */}
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                    {group.label}
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>

                {/* Sessions in group */}
                <div className="space-y-2">
                  {group.sessions.map(s => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      expanded={expandedId === s.id}
                      onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      onExport={() => handleExport(s)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SessionCard({ session, expanded, onToggle, onExport }: {
  session: Session
  expanded: boolean
  onToggle: () => void
  onExport: () => void
}) {
  const userMessages = session.messages.filter(m => m.role === 'user').length
  const assistantMessages = session.messages.filter(m => m.role === 'assistant').length

  return (
    <div className="card overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-start gap-3 text-left"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
          <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{getSessionPreview(session)}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatTime(session.startTime)}</span>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{session.messages.length} msgs</span>
            {session.toolCount > 0 && (
              <>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>·</span>
                <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--text-dim)' }}>
                  <Wrench className="w-2.5 h-2.5" />
                  {session.toolCount}
                </span>
              </>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--text-dim)' }} />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--text-dim)' }} />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Action bar */}
          <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {userMessages} user · {assistantMessages} agent
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={onExport}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}
              >
                <Download className="w-3 h-3" />
                Export
              </button>
            </div>
          </div>

          {/* Full messages */}
          <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
            {session.messages.map(msg => (
              <div key={msg.id}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: msg.role === 'user' ? '#8B5CF6' : msg.role === 'system' ? '#6B7280' : '#06B6D4',
                    }}
                  >
                    {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'Agent'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className="text-sm rounded-xl px-3 py-2"
                  style={{
                    background: msg.role === 'user' ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-elevated)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(139, 92, 246, 0.15)' : 'var(--border)'}`,
                  }}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.tools && msg.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.tools.map(t => (
                        <span key={t} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#A78BFA' }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}