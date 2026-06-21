import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowDown,
  Brain,
  Wrench,
  Database,
  FileText,
  AlertTriangle,
  XCircle,
  Loader2,
  Filter,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

export type ActivityType = 'thinking' | 'tool' | 'memory' | 'wiki' | 'safety' | 'error'

export interface ActivityEntry {
  id: string
  type: ActivityType
  message: string
  timestamp: number
  /** Optional expanded detail (e.g. tool call arguments) */
  detail?: string
}

interface ActivityFeedProps {
  entries: ActivityEntry[]
  onClear?: () => void
  /** Controlled collapsed state; if omitted, component manages internally */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** Max entries before oldest drop off */
  maxEntries?: number
}

// ─── Constants ────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ActivityType,
  { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; color: string; badgeBg: string }
> = {
  thinking: { icon: Brain,       label: 'Think',  color: '#A78BFA', badgeBg: 'rgba(167, 139, 250, 0.12)' },
  tool:     { icon: Wrench,      label: 'Tool',   color: '#06B6D4', badgeBg: 'rgba(6, 182, 212, 0.12)' },
  memory:   { icon: Database,    label: 'Memory', color: '#10B981', badgeBg: 'rgba(16, 185, 129, 0.12)' },
  wiki:     { icon: FileText,    label: 'Wiki',   color: '#F59E0B', badgeBg: 'rgba(245, 158, 11, 0.12)' },
  safety:   { icon: AlertTriangle, label: 'Safety', color: '#F97316', badgeBg: 'rgba(249, 115, 22, 0.12)' },
  error:    { icon: XCircle,     label: 'Error',  color: '#EF4444', badgeBg: 'rgba(239, 68, 68, 0.12)' },
}

type FilterType = 'all' | ActivityType

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'tool',    label: 'Tools' },
  { key: 'memory',  label: 'Memory' },
  { key: 'safety',  label: 'Safety' },
  { key: 'error',   label: 'Errors' },
]

const MAX_ENTRIES_DEFAULT = 500

// ─── Helpers ──────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

// ─── Feed Entry Row ───────────────────────────────────────────────────

function FeedRow({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = TYPE_CONFIG[entry.type]
  const Icon = cfg.icon

  return (
    <div
      className="group"
      style={{
        padding: '4px 12px 4px 8px',
        borderBottom: '1px solid rgba(30, 30, 46, 0.4)',
        cursor: entry.detail ? 'pointer' : 'default',
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
        fontSize: 12,
        lineHeight: '20px',
      }}
      onClick={() => entry.detail && setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-2" style={{ minHeight: 20 }}>
        {/* Timestamp */}
        <span
          className="select-none flex-shrink-0"
          style={{ color: 'var(--text-dim)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
        >
          {formatTime(entry.timestamp)}
        </span>

        {/* Icon */}
        <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: cfg.color, opacity: 0.9 }} />

        {/* Type badge */}
        <span
          className="select-none flex-shrink-0"
          style={{
            color: cfg.color,
            background: cfg.badgeBg,
            borderRadius: 3,
            padding: '0 5px',
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '18px',
            letterSpacing: '0.02em',
          }}
        >
          {cfg.label}
        </span>

        {/* Message */}
        <span
          className="flex-1"
          style={{
            color: 'var(--text)',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {entry.message}
        </span>

        {/* Expand indicator */}
        {entry.detail && (
          <span className="select-none flex-shrink-0" style={{ color: 'var(--text-dim)', fontSize: 10 }}>
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && entry.detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <pre
              className="select-text"
              style={{
                margin: '4px 0 4px 28px',
                padding: '6px 8px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-muted)',
                fontSize: 11,
                lineHeight: '16px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {entry.detail}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Filter Button ────────────────────────────────────────────────────

function FilterButton({
  active,
  label,
  onClick,
  count,
}: {
  active: boolean
  label: string
  onClick: () => void
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-hover)' : 'var(--border)'}`,
        color: active ? 'var(--text)' : 'var(--text-muted)',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span style={{ marginLeft: 4, color: 'var(--text-dim)', fontSize: 10 }}>{count}</span>
      )}
    </button>
  )
}

// ─── ActivityFeed ─────────────────────────────────────────────────────

export function ActivityFeed({
  entries,
  onClear,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  maxEntries = MAX_ENTRIES_DEFAULT,
}: ActivityFeedProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [pulse, setPulse] = useState(false)

  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed
    if (onCollapsedChange) onCollapsedChange(next)
    else setInternalCollapsed(next)
  }, [collapsed, onCollapsedChange])

  // Trim entries to max
  const trimmed = useMemo(() => {
    if (entries.length <= maxEntries) return entries
    return entries.slice(entries.length - maxEntries)
  }, [entries, maxEntries])

  // Apply filter
  const filtered = useMemo(() => {
    if (filter === 'all') return trimmed
    return trimmed.filter((e) => e.type === filter)
  }, [trimmed, filter])

  // Counts per filter
  const counts = useMemo(() => {
    const c: Record<FilterType, number> = { all: 0, thinking: 0, tool: 0, memory: 0, wiki: 0, safety: 0, error: 0 }
    for (const e of trimmed) c[e.type]++
    c.all = trimmed.length
    return c
  }, [trimmed])

  // Auto-scroll to bottom when new entries arrive (if user is at bottom)
  useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered, atBottom])

  // Pulse on new entry
  useEffect(() => {
    if (trimmed.length === 0) return
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 600)
    return () => clearTimeout(t)
  }, [trimmed.length])

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    setAtBottom(isAtBottom)
  }, [])

  const jumpToLatest = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      setAtBottom(true)
    }
  }, [])

  // Counts for filter buttons
  const filterCount = (f: FilterType): number | undefined => {
    if (f === 'all') return counts.all
    const n = counts[f]
    return n > 0 ? n : undefined
  }

  // Header content (always visible)
  const header = (
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
        {/* Toggle button */}
        <button
          onClick={toggleCollapsed}
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
          <Activity
            className="w-3.5 h-3.5"
            style={{
              color: pulse ? 'var(--accent)' : 'var(--text-dim)',
              transition: 'color 0.3s',
            }}
          />
          <span style={{ fontWeight: 500 }}>Activity</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            {trimmed.length > 0 ? `${filtered.length} of ${trimmed.length}` : 'Idle'}
          </span>
          {collapsed ? (
            <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
          )}
        </button>

        {/* Thinking indicator */}
        {trimmed.length > 0 && trimmed[trimmed.length - 1].type === 'thinking' && (
          <div className="flex items-center gap-1" style={{ color: '#A78BFA', fontSize: 11 }}>
            <Loader2 className="w-3 h-3 animate-spin" style={{ animationDuration: '1.2s' }} />
            <span>Processing…</span>
          </div>
        )}
      </div>

      {/* Right side: filter buttons + clear */}
      {!collapsed && (
        <div className="flex items-center gap-1">
          {/* Filter buttons */}
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3" style={{ color: 'var(--text-dim)', marginRight: 2 }} />
            {FILTERS.map((f) => (
              <FilterButton
                key={f.key}
                active={filter === f.key}
                label={f.label}
                onClick={() => setFilter(f.key)}
                count={filterCount(f.key)}
              />
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

          {/* Clear button */}
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
        </div>
      )}
    </div>
  )

  return (
    <div style={{ flexShrink: 0 }}>
      {header}

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 220, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}
          >
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{
                height: 220,
                overflowY: 'auto',
                background: 'rgba(10, 10, 15, 0.4)',
              }}
            >
              {filtered.length === 0 ? (
                <div
                  className="flex items-center justify-center"
                  style={{ height: '100%', color: 'var(--text-dim)', fontSize: 12 }}
                >
                  {trimmed.length === 0
                    ? 'No activity yet. Events will appear here in real time.'
                    : 'No entries match this filter.'}
                </div>
              ) : (
                filtered.map((entry) => <FeedRow key={entry.id} entry={entry} />)
              )}
            </div>

            {/* Jump to latest */}
            <AnimatePresence>
              {!atBottom && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 16,
                    zIndex: 10,
                  }}
                >
                  <button
                    onClick={jumpToLatest}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-hover)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      color: 'var(--text)',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}
                  >
                    <ArrowDown className="w-3 h-3" />
                    Jump to latest
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}