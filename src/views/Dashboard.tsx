import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  MessageSquare, Wrench, Brain, FileText, Clock, GitBranch,
  Activity, Zap, AlertCircle, User, ArrowRight, Sparkles,
  Cpu, Timer, ChevronRight,
} from 'lucide-react'
import { useStore } from '../store'

// ─── Types ───────────────────────────────────────────────────────────

interface Conversation {
  id: string
  title: string
  preview: string
  timestamp: number
  messageCount: number
}

interface ScheduledJob {
  id: string
  name: string
  schedule: string
  nextRun: string
  enabled: boolean
}

interface HealthInfo {
  memoryMB: number
  avgResponseMs: number
  errorCount: number
  lastError: string | null
}

// ─── Dashboard ───────────────────────────────────────────────────────

export function Dashboard() {
  const { config, engineRunning, enginePort, memoryCount, wikiCount, messages, setActiveView } = useStore()
  const [uptime, setUptime] = useState(0)
  const [health, setHealth] = useState<HealthInfo>({
    memoryMB: 0,
    avgResponseMs: 0,
    errorCount: 0,
    lastError: null,
  })
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [schedules, setSchedules] = useState<ScheduledJob[]>([])
  const [decisionsLogged, setDecisionsLogged] = useState(0)
  const [toolsUsedToday, setToolsUsedToday] = useState(0)
  const startTimeRef = useRef<number>(Date.now())

  // Track uptime
  useEffect(() => {
    if (!engineRunning) {
      setUptime(0)
      return
    }
    startTimeRef.current = Date.now()
    const interval = setInterval(() => {
      setUptime(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [engineRunning])

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    if (!engineRunning || !enginePort) return
    try {
      const res = await fetch(`http://localhost:${enginePort}/api/health`)
      if (res.ok) {
        const data = await res.json()
        setHealth({
          memoryMB: data.memoryMB ?? 0,
          avgResponseMs: data.avgResponseMs ?? 0,
          errorCount: data.errorCount ?? 0,
          lastError: data.lastError ?? null,
        })
        setToolsUsedToday(data.toolsUsedToday ?? 0)
        setDecisionsLogged(data.decisionsLogged ?? 0)
      }
    } catch {
      // Engine not reachable — keep defaults
    }
  }, [engineRunning, enginePort])

  // Fetch conversations (derive from messages in store)
  useEffect(() => {
    if (messages.length === 0) {
      setConversations([])
      return
    }
    // Group messages into conversations (simple: treat all current messages as one conversation)
    // In a real app, we'd have multiple sessions — for now, derive from recent messages
    const recent = messages.slice(-3).reverse()
    const convos: Conversation[] = recent.map((msg, i) => ({
      id: msg.id,
      title: msg.content.slice(0, 40) + (msg.content.length > 40 ? '...' : ''),
      preview: msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : ''),
      timestamp: msg.timestamp,
      messageCount: messages.length - i,
    }))
    setConversations(convos)
  }, [messages])

  // Fetch schedules
  useEffect(() => {
    if (!engineRunning || !enginePort) return
    fetch(`http://localhost:${enginePort}/api/schedule/jobs`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.jobs) {
          setSchedules(data.jobs.filter((j: ScheduledJob) => j.enabled).slice(0, 3))
        }
      })
      .catch(() => {
        // Fallback mock data
        setSchedules([
          { id: '1', name: 'Morning Brief', schedule: '0 9 * * *', nextRun: '2026-06-21 09:00', enabled: true },
          { id: '2', name: 'Wiki Lint', schedule: '0 6 * * *', nextRun: '2026-06-22 06:00', enabled: true },
        ])
      })
  }, [engineRunning, enginePort])

  // Poll health every 10 seconds
  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 10000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const messagesToday = messages.filter(m => {
    const d = new Date(m.timestamp)
    const now = new Date()
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* ─── Hero Section ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <HeroSection
            agentName={config?.agentName || 'Agent'}
            model={config?.model || 'unknown'}
            engineRunning={engineRunning}
            uptime={uptime}
          />
        </motion.div>

        {/* ─── Quick Stats Grid (2x3) ──────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <SectionLabel>Quick Stats</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={MessageSquare} label="Messages Today" value={messagesToday} color="#8B5CF6" delay={0.15} />
            <StatCard icon={Wrench} label="Tools Used Today" value={toolsUsedToday} color="#06B6D4" delay={0.2} />
            <StatCard icon={Brain} label="Memories Stored" value={memoryCount} color="#F59E0B" delay={0.25} />
            <StatCard icon={FileText} label="Wiki Pages" value={wikiCount} color="#10B981" delay={0.3} />
            <StatCard icon={Clock} label="Scheduled Jobs" value={schedules.length} color="#EC4899" delay={0.35} />
            <StatCard icon={GitBranch} label="Decisions Logged" value={decisionsLogged} color="#6366F1" delay={0.4} />
          </div>
        </motion.div>

        {/* ─── Two-column layout: Conversations + Schedules ────── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Recent Conversations */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <SectionLabel icon={MessageSquare}>Recent Conversations</SectionLabel>
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <EmptyCard text="No conversations yet. Start chatting with your agent." />
              ) : (
                conversations.map((conv, i) => (
                  <motion.button
                    key={conv.id}
                    onClick={() => setActiveView('chat')}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    className="card w-full p-3 text-left transition-all hover:border-violet-500/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{conv.title}</div>
                        <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{conv.preview}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatTimeAgo(conv.timestamp)}</span>
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
                      </div>
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>

          {/* Active Schedules */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <SectionLabel icon={Clock}>Active Schedules</SectionLabel>
            <div className="space-y-2">
              {schedules.length === 0 ? (
                <EmptyCard text="No scheduled jobs. Create one in the Schedule view." />
              ) : (
                schedules.map((job, i) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    className="card p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-sm font-medium">{job.name}</span>
                      </div>
                      <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                        {job.schedule}
                      </code>
                    </div>
                    {job.nextRun && (
                      <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                        <Timer className="w-3 h-3" />
                        Next: {formatNextRun(job.nextRun)}
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </div>

        {/* ─── Agent Health ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <SectionLabel icon={Activity}>Agent Health</SectionLabel>
          <div className="grid grid-cols-4 gap-3">
            <HealthCard icon={Cpu} label="Memory" value={health.memoryMB > 0 ? `${health.memoryMB.toFixed(0)} MB` : '—'} color="#8B5CF6" />
            <HealthCard icon={Zap} label="Avg Response" value={health.avgResponseMs > 0 ? `${health.avgResponseMs.toFixed(0)} ms` : '—'} color="#06B6D4" />
            <HealthCard icon={AlertCircle} label="Errors" value={String(health.errorCount)} color={health.errorCount > 0 ? '#EF4444' : '#10B981'} />
            <HealthCard
              icon={AlertCircle}
              label="Last Error"
              value={health.lastError ? health.lastError.slice(0, 20) + '...' : 'None'}
              color={health.lastError ? '#EF4444' : '#10B981'}
              isText
            />
          </div>
        </motion.div>

        {/* ─── Personality Preview + Quick Actions ─────────────── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Personality Preview */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <SectionLabel icon={User}>Personality</SectionLabel>
            <button
              onClick={() => setActiveView('identity')}
              className="card w-full p-4 text-left transition-all hover:border-violet-500/30"
            >
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {config?.personality
                  ? config.personality.length > 150
                    ? config.personality.slice(0, 150) + '...'
                    : config.personality
                  : 'No personality set. Configure your agent\'s identity to get started.'}
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs" style={{ color: 'var(--accent)' }}>
                Edit in Identity
                <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <SectionLabel>Quick Actions</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <QuickActionButton icon={MessageSquare} label="New Chat" onClick={() => setActiveView('chat')} />
              <QuickActionButton icon={Brain} label="Browse Memory" onClick={() => setActiveView('memory')} />
              <QuickActionButton icon={Wrench} label="View Tools" onClick={() => setActiveView('tools')} />
              <QuickActionButton icon={User} label="Edit Identity" onClick={() => setActiveView('identity')} />
            </div>
          </motion.div>
        </div>

        {/* Bottom spacer */}
        <div className="h-2" />
      </div>
    </div>
  )
}

// ─── Hero Section ────────────────────────────────────────────────────

function HeroSection({ agentName, model, engineRunning, uptime }: {
  agentName: string
  model: string
  engineRunning: boolean
  uptime: number
}) {
  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(6, 182, 212, 0.1) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
      }}
    >
      {/* Decorative glow */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }}
      />

      <div className="flex items-center justify-between relative">
        {/* Left: agent info */}
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
          >
            <span className="text-xl font-bold text-white">{agentName[0]?.toUpperCase() || 'A'}</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold">{agentName}</h1>
            <div className="flex items-center gap-3 mt-1">
              {/* Status badge */}
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: engineRunning ? '#10B981' : '#6B7280' }}
                  />
                  {engineRunning && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ background: '#10B981' }}
                      animate={{ opacity: [0.5, 0, 0.5], scale: [1, 2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                </div>
                <span className="text-xs font-medium" style={{ color: engineRunning ? '#10B981' : 'var(--text-dim)' }}>
                  {engineRunning ? 'Running' : 'Stopped'}
                </span>
              </div>

              {/* Model badge */}
              <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                <Cpu className="w-3 h-3" />
                {model}
              </div>

              {/* Uptime */}
              {engineRunning && (
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <Timer className="w-3 h-3" />
                  {formatUptime(uptime)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Sparkles decoration */}
        <div className="hidden sm:flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
          <Sparkles className="w-5 h-5" />
          <span className="text-xs">Dashboard</span>
        </div>
      </div>
    </div>
  )
}

// ─── Animated Stat Card ──────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, delay }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: number
  color: string
  delay: number
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (value === 0) {
      setDisplayValue(0)
      return
    }
    const duration = 800
    const steps = 30
    const stepValue = value / steps
    let current = 0
    const interval = setInterval(() => {
      current += stepValue
      if (current >= value) {
        setDisplayValue(value)
        clearInterval(interval)
      } else {
        setDisplayValue(Math.floor(current))
      }
    }, duration / steps)
    return () => clearInterval(interval)
  }, [value])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      className="card p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <span style={{ color }}><Icon className="w-4 h-4" /></span>
        </div>
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {displayValue.toLocaleString()}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{label}</div>
    </motion.div>
  )
}

// ─── Health Card ──────────────────────────────────────────────────────

function HealthCard({ icon: Icon, label, value, color, isText }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  color: string
  isText?: boolean
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <span style={{ color }}><Icon className="w-3.5 h-3.5" /></span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{label}</span>
      </div>
      <div
        className={isText ? 'text-sm font-medium' : 'text-lg font-bold'}
        style={{ color }}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

// ─── Quick Action Button ─────────────────────────────────────────────

function QuickActionButton({ icon: Icon, label, onClick }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="card p-3 flex flex-col items-center gap-2 transition-all hover:border-violet-500/30 hover:scale-[1.02]"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: 'rgba(139, 92, 246, 0.1)' }}
      >
        <Icon className="w-5 h-5 text-violet-400" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

// ─── Section Label ────────────────────────────────────────────────────

function SectionLabel({ children, icon: Icon }: {
  children: React.ReactNode
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" />}
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
        {children}
      </span>
    </div>
  )
}

// ─── Empty Card ───────────────────────────────────────────────────────

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{text}</p>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ${seconds % 60}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = diff / 60000
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.round(mins)}m ago`
  const hours = mins / 60
  if (hours < 24) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function formatNextRun(nextRun: string): string {
  try {
    const date = new Date(nextRun)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    if (diff < 0) return 'overdue'
    const hours = diff / 3600000
    if (hours < 1) return `in ${Math.round(diff / 60000)}m`
    if (hours < 24) return `in ${Math.round(hours)}h`
    return `in ${Math.round(hours / 24)}d`
  } catch {
    return nextRun
  }
}