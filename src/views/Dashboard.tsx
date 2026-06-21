import { useState, useEffect, useRef, useCallback, type ReactNode, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import {
  MessageSquare, Brain, FileText, Wrench,
  Clock, Activity, Cpu, Timer,
  ChevronRight, ArrowRight, Sparkles, Search, Settings,
  User, CircleDot,
} from 'lucide-react'
import { useStore } from '../store'

// ─── Types ───────────────────────────────────────────────────────────

interface DashboardStats {
  wikiCount: number
  memoryCount: number
  jobCount: number
  decisionCount: number
  model: string
  provider: string
  engineRunning: boolean
  uptime: number
  schedules?: ScheduledJob[]
  conversationsCount?: number
  toolsEnabled?: number
}

interface ScheduledJob {
  id: string
  name: string
  schedule: string
  nextRun: string
  enabled: boolean
}

interface HistoryItem {
  id: string
  title: string
  preview: string
  timestamp: number
  type: 'chat' | 'tool' | 'schedule' | 'decision'
  messageCount?: number
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

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [uptime, setUptime] = useState(0)
  const [health, setHealth] = useState<HealthInfo>({
    memoryMB: 0,
    avgResponseMs: 0,
    errorCount: 0,
    lastError: null,
  })
  const [recentActivity, setRecentActivity] = useState<HistoryItem[]>([])
  const [schedules, setSchedules] = useState<ScheduledJob[]>([])
  const [toolsEnabled, setToolsEnabled] = useState(0)
  const [conversationsCount, setConversationsCount] = useState(0)
  const startTimeRef = useRef<number>(Date.now())

  // ── Fetch dashboard stats from IPC ──
  const fetchDashboardStats = useCallback(async () => {
    try {
      const dash = (await window.lodestone.dashboardStats()) as DashboardStats
      setStats(dash)
      setConversationsCount(dash.conversationsCount ?? 0)
      setToolsEnabled(dash.toolsEnabled ?? 0)
      if (dash.schedules) {
        setSchedules(dash.schedules.filter(j => j.enabled).slice(0, 4))
      }
    } catch {
      // IPC not available — use store values
      setConversationsCount(messages.length > 0 ? 1 : 0)
      setToolsEnabled(0)
    }
  }, [messages.length])

  // ── Fetch recent activity from IPC ──
  const fetchRecentActivity = useCallback(async () => {
    try {
      const history = await window.lodestone.listHistory()
      if (Array.isArray(history) && history.length > 0) {
        const items: HistoryItem[] = history.slice(0, 5).map((h: any) => ({
          id: h.id ?? String(Math.random()),
          title: h.title ?? h.preview ?? 'Untitled session',
          preview: h.preview ?? (h.messages?.[0]?.content?.slice(0, 80) ?? ''),
          timestamp: h.startTime ?? h.timestamp ?? Date.now(),
          type: (h.type as HistoryItem['type']) ?? 'chat',
          messageCount: h.messages?.length ?? h.messageCount,
        }))
        setRecentActivity(items)
      }
    } catch {
      // Fallback: derive from store messages
      if (messages.length > 0) {
        const recent = messages.slice(-5).reverse()
        setRecentActivity(recent.map((msg) => ({
          id: msg.id,
          title: msg.content.slice(0, 50) + (msg.content.length > 50 ? '…' : ''),
          preview: msg.content.slice(0, 100) + (msg.content.length > 100 ? '…' : ''),
          timestamp: msg.timestamp,
          type: msg.role === 'assistant' ? 'chat' : 'chat',
          messageCount: 1,
        })))
      }
    }
  }, [messages])

  // ── Fetch health from engine ──
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
      }
    } catch {
      // Engine not reachable
    }
  }, [engineRunning, enginePort])

  // ── Track uptime ──
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

  // ── Initial fetch + polling ──
  useEffect(() => {
    fetchDashboardStats()
    fetchRecentActivity()
    fetchHealth()
    const interval = setInterval(() => {
      fetchDashboardStats()
      fetchHealth()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchDashboardStats, fetchRecentActivity, fetchHealth])

  // ── Compute display values ──
  const displayMemories = stats?.memoryCount ?? memoryCount
  const displayWiki = stats?.wikiCount ?? wikiCount
  const displayTools = toolsEnabled
  const displayConversations = conversationsCount || (messages.length > 0 ? 1 : 0)
  const agentName = config?.agentName || 'Agent'
  const agentEmoji = config?.personality?.match(/\p{Emoji}/u)?.[0] ?? '🤖'
  const model = stats?.model || config?.model || 'unknown'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* ─── Hero Section ────────────────────────────────────────── */}
        <HeroSection
          greeting={greeting}
          agentName={agentName}
          dateStr={dateStr}
          engineRunning={engineRunning}
          model={model}
          uptime={uptime}
        />

        {/* ─── Stat Cards Row ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="grid grid-cols-4 gap-3">
            <StatCard icon={MessageSquare} label="Conversations" value={displayConversations} color="#8B5CF6" delay={0.15} />
            <StatCard icon={Brain} label="Memories" value={displayMemories} color="#F59E0B" delay={0.2} />
            <StatCard icon={FileText} label="Wiki Pages" value={displayWiki} color="#10B981" delay={0.25} />
            <StatCard icon={Wrench} label="Tools Enabled" value={displayTools} color="#06B6D4" delay={0.3} />
          </div>
        </motion.div>

        {/* ─── Quick Actions Row ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="grid grid-cols-4 gap-3">
            <QuickActionButton icon={MessageSquare} label="New Chat" color="#8B5CF6" onClick={() => setActiveView('chat')} />
            <QuickActionButton icon={Search} label="Search All" color="#06B6D4" onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', shiftKey: true, metaKey: true }))
            }} />
            <QuickActionButton icon={Brain} label="View Brain" color="#10B981" onClick={() => setActiveView('memory')} />
            <QuickActionButton icon={Settings} label="Settings" color="#F59E0B" onClick={() => setActiveView('settings')} />
          </div>
        </motion.div>

        {/* ─── Recent Activity + Active Schedules (2-col) ─────────── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <SectionLabel icon={Activity}>Recent Activity</SectionLabel>
            <div className="space-y-2">
              {recentActivity.length === 0 ? (
                <EmptyCard text="No recent activity. Start a conversation to see events here." />
              ) : (
                recentActivity.map((item, i) => (
                  <motion.button
                    key={item.id}
                    onClick={() => setActiveView('history')}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    className="card w-full p-3 text-left transition-all hover:border-violet-500/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <TypeBadge type={item.type} />
                          <span className="text-sm font-medium truncate">{item.title}</span>
                        </div>
                        {item.preview && (
                          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{item.preview}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatTimeAgo(item.timestamp)}</span>
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

        {/* ─── Agent Health + Personality (2-col) ─────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Agent Health */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <SectionLabel icon={Activity}>Agent Health</SectionLabel>
            <div className="card p-4 space-y-3">
              {/* Status row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: engineRunning ? '#10B981' : '#6B7280' }}
                    />
                    {engineRunning && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ background: '#10B981' }}
                        animate={{ opacity: [0.5, 0, 0.5], scale: [1, 2.5, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </div>
                  <span className="text-sm font-medium" style={{ color: engineRunning ? '#10B981' : 'var(--text-dim)' }}>
                    {engineRunning ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <Cpu className="w-3 h-3" />
                  {model}
                </div>
              </div>

              {/* Health metrics */}
              <div className="grid grid-cols-3 gap-2">
                <HealthMetric
                  icon={Timer}
                  label="Uptime"
                  value={engineRunning ? formatUptime(uptime) : '—'}
                  color={engineRunning ? '#10B981' : 'var(--text-dim)'}
                />
                <HealthMetric
                  icon={Activity}
                  label="Memory"
                  value={health.memoryMB > 0 ? `${health.memoryMB.toFixed(0)} MB` : '—'}
                  color="#8B5CF6"
                />
                <HealthMetric
                  icon={CircleDot}
                  label="Errors"
                  value={String(health.errorCount)}
                  color={health.errorCount > 0 ? '#EF4444' : '#10B981'}
                />
              </div>
            </div>
          </motion.div>

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
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))' }}
                >
                  {agentEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold mb-1">{agentName}</div>
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-muted)' }}>
                    {config?.personality
                      ? config.personality.length > 150
                        ? config.personality.slice(0, 150) + '…'
                        : config.personality
                      : 'No personality set. Configure your agent\u2019s identity to get started.'}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: 'var(--accent)' }}>
                    Edit in Identity
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </button>
          </motion.div>
        </div>

        {/* Bottom spacer */}
        <div className="h-2" />
      </div>
    </div>
  )
}

// ─── Hero Section ────────────────────────────────────────────────────

function HeroSection({ greeting, agentName, dateStr, engineRunning, model, uptime }: {
  greeting: string
  agentName: string
  dateStr: string
  engineRunning: boolean
  model: string
  uptime: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
      }}
    >
      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: 'linear-gradient(120deg, rgba(139, 92, 246, 0.3), rgba(6, 182, 212, 0.2), rgba(16, 185, 129, 0.15), rgba(139, 92, 246, 0.3))',
          backgroundSize: '300% 300%',
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Decorative glow */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          {/* Left: greeting */}
          <div>
            <h1 className="text-2xl font-bold">
              {greeting}, <span className="gradient-text">{agentName}</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{dateStr}</p>

            {/* Status badges */}
            <div className="flex items-center gap-3 mt-2">
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

              <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                <Cpu className="w-3 h-3" />
                {model}
              </div>

              {engineRunning && (
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <Timer className="w-3 h-3" />
                  {formatUptime(uptime)}
                </div>
              )}
            </div>
          </div>

          {/* Right: Sparkles */}
          <div className="hidden sm:flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="w-5 h-5" />
            </motion.div>
            <span className="text-xs">Dashboard</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Animated Stat Card ──────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, delay }: {
  icon: React.ComponentType<{ className?: string; style?: CSSProperties }>
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
      className="card p-4 relative overflow-hidden"
    >
      {/* Colored glow */}
      <div
        className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
      />

      <div className="flex items-center gap-2 mb-2 relative">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <span style={{ color }}><Icon className="w-4 h-4" /></span>
        </div>
      </div>
      <motion.div
        className="text-2xl font-bold relative"
        style={{ color }}
        key={displayValue}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
      >
        {displayValue.toLocaleString()}
      </motion.div>
      <div className="text-xs mt-1 relative" style={{ color: 'var(--text-dim)' }}>{label}</div>
    </motion.div>
  )
}

// ─── Health Metric ───────────────────────────────────────────────────

function HealthMetric({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string; style?: CSSProperties }>
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex flex-col items-center text-center gap-1">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15` }}
      >
        <span style={{ color }}><Icon className="w-3.5 h-3.5" /></span>
      </div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{label}</div>
    </div>
  )
}

// ─── Quick Action Button ─────────────────────────────────────────────

function QuickActionButton({ icon: Icon, label, color, onClick }: {
  icon: React.ComponentType<{ className?: string; style?: CSSProperties }>
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      className="card p-3 flex flex-col items-center gap-2 transition-all hover:border-violet-500/30"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </motion.button>
  )
}

// ─── Type Badge ──────────────────────────────────────────────────────

function TypeBadge({ type }: { type: HistoryItem['type'] }) {
  const config = {
    chat: { label: 'Chat', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
    tool: { label: 'Tool', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)' },
    schedule: { label: 'Cron', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)' },
    decision: { label: 'Decision', color: '#6366F1', bg: 'rgba(99, 102, 241, 0.15)' },
  }
  const c = config[type] ?? config.chat
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ color: c.color, background: c.bg }}
    >
      {c.label}
    </span>
  )
}

// ─── Section Label ────────────────────────────────────────────────────

function SectionLabel({ children, icon: Icon }: {
  children: ReactNode
  icon?: React.ComponentType<{ className?: string; style?: CSSProperties }>
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {Icon && <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />}
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