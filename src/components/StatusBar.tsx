import { useState, useEffect, useCallback } from 'react'
import {
  Circle, Clock, Cpu, Database, FileText, Wrench,
  RefreshCw, AlertCircle, Loader2, ScrollText, Eye, Activity,
} from 'lucide-react'
import { useStore, type SocketStatus } from '../store'

// ─── Types ───────────────────────────────────────────────────────────

interface EngineStatusInfo {
  running: boolean
  port: number
}

interface DashboardStats {
  wikiCount: number
  memoryCount: number
  jobCount: number
  decisionCount: number
  model: string
  provider: string
  engineRunning: boolean
  uptime: number
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function tokenColor(n: number): string {
  if (n >= 8000) return '#EF4444' // red
  if (n >= 4000) return '#F59E0B' // amber
  return '#10B981' // green
}

// ─── Status Dot ───────────────────────────────────────────────────────

function StatusDot({ running, starting }: { running: boolean; starting: boolean }) {
  let color = '#6B7280' // stopped — gray
  if (running) color = '#10B981' // running — green
  else if (starting) color = '#F59E0B' // starting — yellow

  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: 7,
        height: 7,
        background: color,
        boxShadow: running ? `0 0 6px ${color}80` : 'none',
        flexShrink: 0,
      }}
    />
  )
}

// ─── Socket Status Indicator ─────────────────────────────────────────

function SocketStatusIndicator({ status }: { status: SocketStatus }) {
  const config: Record<SocketStatus, { color: string; label: string; spin: boolean }> = {
    connected: { color: '#10B981', label: 'Connected', spin: false },
    connecting: { color: '#F59E0B', label: 'Reconnecting...', spin: true },
    disconnected: { color: '#6B7280', label: 'Disconnected', spin: false },
    error: { color: '#EF4444', label: 'Connection error', spin: false },
  }
  const { color, label, spin } = config[status]

  return (
    <div className="flex items-center gap-1" title={`Socket: ${label}`}>
      {spin ? (
        <Loader2 className="w-3 h-3 animate-spin" style={{ color, animationDuration: '1s' }} />
      ) : (
        <span
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: color, boxShadow: status === 'connected' ? `0 0 5px ${color}80` : 'none', flexShrink: 0 }}
        />
      )}
      <span style={{ color, fontSize: 11, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────

function Badge({
  icon: Icon,
  label,
  value,
  onClick,
  title,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string | number
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
      style={{
        background: 'transparent',
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
        color: 'var(--text-dim)',
        fontSize: 11,
        lineHeight: 1,
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = 'var(--bg-elevated)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon className="w-3 h-3" style={{ opacity: 0.7 }} />
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{value}</span>
    </button>
  )
}

// ─── StatusBar ───────────────────────────────────────────────────────

export function StatusBar({ onToggleLogViewer, onToggleFileWatcher, onToggleProfiler }: { onToggleLogViewer?: () => void; onToggleFileWatcher?: () => void; onToggleProfiler?: () => void }) {
  const { engineRunning, enginePort, config, setActiveView, socketStatus, inputTokens, totalTokens } = useStore()
  const [uptime, setUptime] = useState(0)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(false)
  const [toolCallCount, setToolCallCount] = useState(0)

  // Poll engine status + dashboard stats every 5 seconds
  const poll = useCallback(async () => {
    setSyncing(true)
    setSyncError(false)
    try {
      const [statusInfo, dashStats] = await Promise.all([
        window.lodestone.engineStatus(),
        window.lodestone.dashboardStats(),
      ])

      const status = statusInfo as EngineStatusInfo
      const dash = dashStats as DashboardStats

      setStats(dash)
      setUptime(Math.floor((dash.uptime || 0) / 1000))

      // Sync engine port from status if available
      if (status.port && status.port !== enginePort) {
        useStore.setState({ enginePort: status.port })
      }

      // Sync engine running state if there's a mismatch
      if (dash.engineRunning !== undefined && dash.engineRunning !== engineRunning) {
        useStore.setState({ engineRunning: dash.engineRunning })
      }

      // Try to fetch tool call count from the engine health endpoint
      if (status.running && status.port) {
        try {
          const healthRes = await fetch(`http://localhost:${status.port}/api/health`)
          if (healthRes.ok) {
            const healthData = await healthRes.json()
            setToolCallCount(healthData.toolsUsedToday ?? 0)
          }
        } catch {
          // Health endpoint not available — keep last value
        }
      }
    } catch {
      setSyncError(true)
    } finally {
      setSyncing(false)
    }
  }, [engineRunning])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [poll])

  // Update uptime every second when running
  useEffect(() => {
    if (!engineRunning) {
      setUptime(0)
      return
    }
    const interval = setInterval(() => {
      window.lodestone.engineUptime().then((ms: number) => {
        setUptime(Math.floor(ms / 1000))
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [engineRunning])

  const model = stats?.model || config?.model || 'unknown'
  const port = enginePort || 0
  const running = engineRunning || stats?.engineRunning || false
  const memCount = stats?.memoryCount ?? 0
  const wikiCount = stats?.wikiCount ?? 0
  const decisionCount = stats?.decisionCount ?? 0

  return (
    <div
      className="flex items-center justify-between px-3 select-none"
      style={{
        height: 28,
        background: 'rgba(18, 18, 26, 0.6)',
        borderTop: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
        fontSize: 11,
        color: 'var(--text-dim)',
        flexShrink: 0,
      }}
    >
      {/* Left: Engine status + Socket status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <StatusDot running={running} starting={false} />
          <span style={{ color: running ? 'var(--text-muted)' : 'var(--text-dim)' }}>
            {running ? `Running on :${port}` : 'Stopped'}
          </span>
        </div>
        {running && uptime > 0 && (
          <div className="flex items-center gap-1" style={{ opacity: 0.7 }}>
            <Clock className="w-3 h-3" style={{ opacity: 0.5 }} />
            <span>{formatUptime(uptime)}</span>
          </div>
        )}
        {running && (
          <div className="flex items-center" style={{ opacity: 0.8 }}>
            <span style={{ color: 'var(--border)', margin: '0 2px' }}>|</span>
            <SocketStatusIndicator status={socketStatus} />
          </div>
        )}
      </div>

      {/* Center: Model name + Token counter */}
      <div className="flex items-center gap-3" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3 h-3" style={{ opacity: 0.5 }} />
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{model}</span>
        </div>
        {running && totalTokens > 0 && (
          <div className="flex items-center gap-1.5" title="Input / Total tokens (approx)">
            <span style={{ color: tokenColor(inputTokens), fontWeight: 500 }}>{formatTokenCount(inputTokens)}</span>
            <span style={{ color: 'var(--text-dim)', opacity: 0.5 }}>/</span>
            <span style={{ color: tokenColor(totalTokens), fontWeight: 500 }}>{formatTokenCount(totalTokens)}</span>
            <span style={{ color: 'var(--text-dim)', opacity: 0.6 }}>tokens</span>
          </div>
        )}
      </div>

      {/* Right: Badges */}
      <div className="flex items-center gap-1">
        <Badge
          icon={Database}
          label="Mem"
          value={memCount}
          onClick={() => setActiveView('memory')}
          title="Memory entries — click to open Memory view"
        />
        <Badge
          icon={FileText}
          label="Wiki"
          value={wikiCount}
          onClick={() => setActiveView('memory')}
          title="Wiki pages — click to open Memory view"
        />
        {decisionCount > 0 && (
          <Badge
            icon={AlertCircle}
            label="Dec"
            value={decisionCount}
            onClick={() => setActiveView('brain')}
            title="Decisions logged — click to open Brain view"
          />
        )}
        <Badge
          icon={Wrench}
          label="Tools"
          value={toolCallCount}
          onClick={() => setActiveView('tools')}
          title="Tool calls — click to open Tools view"
        />

        {/* Log Viewer toggle */}
        {onToggleLogViewer && (
          <button
            onClick={onToggleLogViewer}
            title="Open Log Viewer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              fontSize: 11,
              lineHeight: 1,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <ScrollText className="w-3 h-3" style={{ opacity: 0.7 }} />
            <span style={{ opacity: 0.6 }}>Logs</span>
          </button>
        )}

        {/* File Watcher toggle */}
        {onToggleFileWatcher && (
          <button
            onClick={onToggleFileWatcher}
            title="Open File Watcher"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              fontSize: 11,
              lineHeight: 1,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Eye className="w-3 h-3" style={{ opacity: 0.7 }} />
            <span style={{ opacity: 0.6 }}>Watch</span>
          </button>
        )}

        {/* Profiler toggle */}
        {onToggleProfiler && (
          <button
            onClick={onToggleProfiler}
            title="Toggle Performance Profiler"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              fontSize: 11,
              lineHeight: 1,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Activity className="w-3 h-3" style={{ opacity: 0.7 }} />
            <span style={{ opacity: 0.6 }}>Profile</span>
          </button>
        )}

        {/* Sync indicator */}
        <div className="flex items-center ml-1" style={{ opacity: 0.5 }}>
          {syncing ? (
            <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '1s' }} />
          ) : syncError ? (
            <AlertCircle className="w-3 h-3" style={{ color: '#EF4444' }} />
          ) : (
            <Circle className="w-2.5 h-2.5" style={{ color: '#10B981', fill: '#10B981' }} />
          )}
        </div>
      </div>
    </div>
  )
}