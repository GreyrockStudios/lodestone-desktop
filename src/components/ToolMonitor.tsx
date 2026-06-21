import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, CheckCircle2, XCircle, Loader2, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

type ToolStatus = 'pending' | 'success' | 'error'

interface ToolCallEntry {
  id: string
  timestamp: number
  toolName: string
  status: ToolStatus
  duration?: number // ms
  detail?: string
}

// ─── Mock generator ──────────────────────────────────────────────────

const MOCK_TOOL_NAMES = [
  'memory-recall', 'wiki-search', 'web-search', 'web-fetch',
  'decision-log', 'watchdog', 'file-ops', 'smart-retrieve',
  'wiki-write', 'memory-store',
]

function generateMockEntry(): ToolCallEntry {
  const rand = Math.random()
  const status: ToolStatus = rand < 0.7 ? 'success' : rand < 0.9 ? 'pending' : 'error'
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    toolName: MOCK_TOOL_NAMES[Math.floor(Math.random() * MOCK_TOOL_NAMES.length)],
    status,
    duration: status === 'pending' ? undefined : Math.floor(Math.random() * 2500) + 50,
  }
}

// ─── Status config ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<ToolStatus, {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
  bg: string
  label: string
}> = {
  pending: { icon: Loader2, color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', label: 'Pending' },
  success: { icon: CheckCircle2, color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)', label: 'Success' },
  error:   { icon: XCircle, color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)', label: 'Error' },
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// ─── Component ───────────────────────────────────────────────────────

interface ToolMonitorProps {
  entries: ToolCallEntry[]
  onClear?: () => void
  maxEntries?: number
}

export function ToolMonitor({ entries, onClear, maxEntries = 50 }: ToolMonitorProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    setAutoScroll(isAtBottom)
  }, [])

  const trimmed = entries.length > maxEntries ? entries.slice(entries.length - maxEntries) : entries

  const stats = {
    total: trimmed.length,
    pending: trimmed.filter(e => e.status === 'pending').length,
    success: trimmed.filter(e => e.status === 'success').length,
    error: trimmed.filter(e => e.status === 'error').length,
  }

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Header */}
      <div
        className="flex items-center justify-between select-none"
        style={{
          padding: '0 12px 0 10px',
          height: 32,
          flexShrink: 0,
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(v => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'inherit',
              fontSize: 12,
            }}
          >
            <Activity className="w-3.5 h-3.5" style={{ color: '#06B6D4' }} />
            <span style={{ fontWeight: 500 }}>Tool Monitor</span>
            {/* Stats badges */}
            {stats.total > 0 && (
              <div className="flex items-center gap-1.5">
                {stats.success > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', fontSize: 10 }}>
                    {stats.success} ✓
                  </span>
                )}
                {stats.pending > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B', fontSize: 10 }}>
                    {stats.pending} ⏳
                  </span>
                )}
                {stats.error > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', fontSize: 10 }}>
                    {stats.error} ✗
                  </span>
                )}
              </div>
            )}
            {collapsed ? (
              <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
            )}
          </button>
        </div>

        {!collapsed && (
          <div className="flex items-center gap-1">
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(v => !v)}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{
                background: autoScroll ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                color: autoScroll ? 'var(--accent)' : 'var(--text-dim)',
                border: `1px solid ${autoScroll ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
              title="Toggle auto-scroll"
            >
              Auto-scroll
            </button>

            {/* Clear button */}
            {onClear && (
              <button
                onClick={onClear}
                disabled={trimmed.length === 0}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: trimmed.length > 0 ? 'pointer' : 'default',
                  padding: '2px 6px',
                  fontSize: 11,
                  borderRadius: 4,
                  fontFamily: 'inherit',
                  opacity: trimmed.length > 0 ? 1 : 0.4,
                }}
                onMouseEnter={(e) => { if (trimmed.length > 0) e.currentTarget.style.color = '#EF4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                title="Clear all entries"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tool call list */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 180, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden', background: 'rgba(10, 10, 15, 0.4)', position: 'relative' }}
          >
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{ height: 180, overflowY: 'auto' }}
            >
              {trimmed.length === 0 ? (
                <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                  No tool calls yet. Activity will appear here in real time.
                </div>
              ) : (
                trimmed.map(entry => <ToolCallRow key={entry.id} entry={entry} />)
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Tool Call Row ───────────────────────────────────────────────────

function ToolCallRow({ entry }: { entry: ToolCallEntry }) {
  const cfg = STATUS_CONFIG[entry.status]
  const Icon = cfg.icon
  const isPending = entry.status === 'pending'

  return (
    <div
      style={{
        padding: '3px 12px 3px 8px',
        borderBottom: '1px solid rgba(30, 30, 46, 0.4)',
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 12,
        lineHeight: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Timestamp */}
      <span className="select-none flex-shrink-0" style={{ color: 'var(--text-dim)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(entry.timestamp)}
      </span>

      {/* Status icon */}
      <Icon
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: cfg.color, animation: isPending ? 'spin 1.2s linear infinite' : 'none' }}
      />

      {/* Tool name */}
      <span className="flex-1" style={{ color: 'var(--text)', fontWeight: 500 }}>
        {entry.toolName}
      </span>

      {/* Status badge */}
      <span
        className="select-none flex-shrink-0"
        style={{
          color: cfg.color,
          background: cfg.bg,
          borderRadius: 3,
          padding: '0 5px',
          fontSize: 10,
          fontWeight: 600,
          lineHeight: '18px',
        }}
      >
        {cfg.label}
      </span>

      {/* Duration */}
      {entry.duration !== undefined && (
        <span className="select-none flex-shrink-0" style={{ color: 'var(--text-dim)', fontSize: 11 }}>
          {formatDuration(entry.duration)}
        </span>
      )}
    </div>
  )
}

// ─── Hook for generating mock entries ────────────────────────────────

export function useMockToolMonitor(intervalMs = 5000) {
  const [entries, setEntries] = useState<ToolCallEntry[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Generate a few initial entries
    const initial = Array.from({ length: 5 }, () => {
      const entry = generateMockEntry()
      // All initial entries should be completed
      if (entry.status === 'pending') {
        entry.status = 'success'
        entry.duration = Math.floor(Math.random() * 2500) + 50
      }
      return entry
    }).sort((a, b) => a.timestamp - b.timestamp)
    setEntries(initial)

    // Periodically add new entries
    intervalRef.current = setInterval(() => {
      setEntries(prev => [...prev, generateMockEntry()].slice(-50))
    }, intervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [intervalMs])

  const clear = useCallback(() => setEntries([]), [])

  return { entries, clear }
}

export type { ToolCallEntry, ToolStatus }