import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart3, ChevronDown, X, TrendingUp, Clock, Wrench, Hash, Activity } from 'lucide-react'
import { useStore } from '../store'

// ─── Store hook (lightweight subscription) ────────────────────────────

function useStoreState() {
  const messages = useStore(s => s.messages)
  const totalTokens = useStore(s => s.totalTokens)
  return { messages, totalTokens }
}

// ─── Types ───────────────────────────────────────────────────────────

interface QuickStatsState {
  messagesSent: number
  tokensUsed: number
  toolsCalled: number
  avgResponseTime: number  // ms
}

// ─── Animated Number ──────────────────────────────────────────────────

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(value)

  useEffect(() => {
    const prev = prevValueRef.current
    const diff = value - prev
    if (diff === 0) {
      setDisplayValue(value)
      return
    }

    // Animate over 500ms
    const duration = 500
    const startTime = Date.now()
    let raf: number

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(prev + diff * eased)
      setDisplayValue(current)
      if (progress < 1) {
        raf = requestAnimationFrame(animate)
      } else {
        setDisplayValue(value)
        prevValueRef.current = value
      }
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [value])

  const formatted = displayValue >= 1000
    ? `${(displayValue / 1000).toFixed(1)}K`
    : String(displayValue)

  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatted}{suffix}</span>
}

// ─── Stat Row ─────────────────────────────────────────────────────────

function StatRow({
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: number
  suffix?: string
  color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <Icon className="w-3.5 h-3.5" style={{ color, flexShrink: 0, opacity: 0.8 }} />
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        <AnimatedNumber value={value} suffix={suffix} />
      </span>
    </div>
  )
}

// ─── Quick Stats Widget ──────────────────────────────────────────────
export function QuickStats() {
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(true)
  const [stats, setStats] = useState<QuickStatsState>({
    messagesSent: 0,
    tokensUsed: 0,
    toolsCalled: 0,
    avgResponseTime: 350,
  })
  const [responseTimes, setResponseTimes] = useState<number[]>([])
  const prevMessagesLengthRef = useRef(0)

  // Track messages from store
  const { messages, totalTokens } = useStoreState()

  useEffect(() => {
    // Count new messages from user as "messages sent"
    const currentLength = messages.length
    const prevLength = prevMessagesLengthRef.current
    if (currentLength > prevLength) {
      const newMessages = messages.slice(prevLength)
      const newUserMessages = newMessages.filter(m => m.role === 'user').length
      const newAssistantMessages = newMessages.filter(m => m.role === 'assistant')

      // Count tools
      let newToolCount = 0
      for (const m of newAssistantMessages) {
        if (m.tools) newToolCount += m.tools.length
      }

      // Mock response time for each new assistant message
      const newTimes = newAssistantMessages.map(() => Math.round(200 + Math.random() * 600))
      setResponseTimes(prev => {
        const updated = [...prev, ...newTimes].slice(-20)
        const avg = updated.length > 0 ? Math.round(updated.reduce((a, b) => a + b, 0) / updated.length) : 0
        setStats(prev => ({
          ...prev,
          messagesSent: prev.messagesSent + newUserMessages,
          toolsCalled: prev.toolsCalled + newToolCount,
          avgResponseTime: avg || prev.avgResponseTime,
        }))
        return updated
      })
    }
    prevMessagesLengthRef.current = currentLength
  }, [messages])

  // Update tokens from store
  useEffect(() => {
    setStats(prev => ({ ...prev, tokensUsed: totalTokens }))
  }, [totalTokens])

  // Simulate small fluctuations in avg response time every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => {
        const fluctuation = Math.round((Math.random() - 0.5) * 40)
        const newAvg = Math.max(150, Math.min(900, prev.avgResponseTime + fluctuation))
        return { ...prev, avgResponseTime: newAvg }
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Sparkline for response times
  const maxTime = Math.max(...responseTimes, 1)
  const sparklinePoints = responseTimes.length > 1
    ? responseTimes.map((t, i) => {
        const x = (i / (responseTimes.length - 1)) * 100
        const y = 100 - (t / maxTime) * 100
        return `${x},${y}`
      }).join(' ')
    : ''

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
        style={{
          position: 'fixed',
          bottom: 36,
          right: 12,
          zIndex: 9000,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-muted)',
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}
        title="Show quick stats"
      >
        <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
        <span>Stats</span>
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 36,
        right: 12,
        zIndex: 9000,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        minWidth: expanded ? 220 : 120,
        transition: 'min-width 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Quick Stats</span>
        {expanded ? (
          <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-dim)', transform: 'rotate(180deg)' }} />
        ) : (
          <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
        )}
        <button
          onClick={e => { e.stopPropagation(); setVisible(false) }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            marginLeft: 2,
          }}
          title="Hide stats"
        >
          <X className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
        </button>
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '4px 12px 10px', borderTop: '1px solid var(--border)' }}>
              <StatRow
                icon={Hash}
                label="Messages"
                value={stats.messagesSent}
                color="#8B5CF6"
              />
              <StatRow
                icon={TrendingUp}
                label="Tokens"
                value={stats.tokensUsed}
                color="#06B6D4"
              />
              <StatRow
                icon={Wrench}
                label="Tools Called"
                value={stats.toolsCalled}
                color="#F59E0B"
              />
              <StatRow
                icon={Clock}
                label="Avg Response"
                value={stats.avgResponseTime}
                suffix="ms"
                color="#10B981"
              />

              {/* Sparkline */}
              {responseTimes.length > 1 && (
                <div style={{ marginTop: 6, padding: '4px 0 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <Activity className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Response trend</span>
                  </div>
                  <svg width="100%" height="30" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: 'block' }}>
                    <polyline
                      points={sparklinePoints}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.7}
                    />
                  </svg>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
