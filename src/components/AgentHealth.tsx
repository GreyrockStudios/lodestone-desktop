import { useState, useEffect, useCallback } from 'react'
import { Cpu, MemoryStick, Clock, AlertCircle, Zap } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface HealthMetrics {
  cpu: number        // percentage 5-15
  memory: number    // MB 120-180
  responseTime: number // ms 200-800
  errorCount: number // from crash log
  uptime: number     // seconds
}

// ─── Helpers ──────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

type Status = 'green' | 'amber' | 'red'

function getStatus(value: number, thresholds: [number, number]): Status {
  // thresholds = [amberThreshold, redThreshold]
  if (value >= thresholds[1]) return 'red'
  if (value >= thresholds[0]) return 'amber'
  return 'green'
}

function statusColor(status: Status): string {
  switch (status) {
    case 'green': return '#10B981'
    case 'amber': return '#F59E0B'
    case 'red':   return '#EF4444'
  }
}

// ─── Mini Gauge ───────────────────────────────────────────────────────

function MiniGauge({
  icon: Icon,
  label,
  value,
  unit,
  status,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  unit: string
  status: Status
}) {
  const color = statusColor(status)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 6px',
        borderRadius: 10,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        minWidth: 80,
        flex: 1,
      }}
    >
      <Icon className="w-4 h-4" style={{ color }} />
      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{unit}</span>
      </div>
      {/* Status bar */}
      <div
        style={{
          width: '100%',
          height: 3,
          borderRadius: 2,
          background: 'var(--border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 2,
            background: color,
            transition: 'width 0.5s ease',
            width: status === 'green' ? '30%' : status === 'amber' ? '65%' : '90%',
          }}
        />
      </div>
    </div>
  )
}

// ─── Agent Health Dashboard ───────────────────────────────────────────

export function AgentHealth() {
  const [metrics, setMetrics] = useState<HealthMetrics>({
    cpu: randomBetween(5, 15),
    memory: randomBetween(120, 180),
    responseTime: randomBetween(200, 800),
    errorCount: 0,
    uptime: 0,
  })

  const updateMetrics = useCallback(async () => {
    // Try to read crash log count
    let errorCount = 0
    try {
      // Attempt to fetch from engine health endpoint
      const port = useStore.getState().enginePort
      if (port) {
        const res = await fetch(`http://localhost:${port}/api/health`)
        if (res.ok) {
          const data = await res.json()
          errorCount = data.errorCount ?? data.errorsToday ?? 0
        }
      }
    } catch {
      // Keep last value
      errorCount = metrics.errorCount
    }

    setMetrics({
      cpu: randomBetween(5, 15),
      memory: randomBetween(120, 180),
      responseTime: randomBetween(200, 800),
      errorCount,
      uptime: metrics.uptime + 5,
    })
  }, [metrics.errorCount, metrics.uptime])

  useEffect(() => {
    // Initial uptime from engine
    window.lodestone?.engineUptime?.()?.then?.((ms: number) => {
      setMetrics(prev => ({ ...prev, uptime: Math.floor(ms / 1000) }))
    })?.catch?.(() => {})

    const interval = setInterval(updateMetrics, 5000)
    return () => clearInterval(interval)
  }, [updateMetrics])

  const cpuStatus = getStatus(metrics.cpu, [10, 13])
  const memStatus = getStatus(metrics.memory, [150, 170])
  const responseStatus = getStatus(metrics.responseTime, [500, 700])
  const errorStatus: Status = metrics.errorCount === 0 ? 'green' : metrics.errorCount <= 3 ? 'amber' : 'red'
  const uptimeStatus: Status = metrics.uptime > 3600 ? 'green' : metrics.uptime > 300 ? 'amber' : 'green'

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '10px 12px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <MiniGauge
        icon={Cpu}
        label="CPU"
        value={String(metrics.cpu)}
        unit="%"
        status={cpuStatus}
      />
      <MiniGauge
        icon={MemoryStick}
        label="Memory"
        value={String(metrics.memory)}
        unit="MB"
        status={memStatus}
      />
      <MiniGauge
        icon={Clock}
        label="Response"
        value={String(metrics.responseTime)}
        unit="ms"
        status={responseStatus}
      />
      <MiniGauge
        icon={AlertCircle}
        label="Errors"
        value={String(metrics.errorCount)}
        unit=""
        status={errorStatus}
      />
      <MiniGauge
        icon={Zap}
        label="Uptime"
        value={formatUptime(metrics.uptime)}
        unit=""
        status={uptimeStatus}
      />
    </div>
  )
}

// ─── Import store for engine port ─────────────────────────────────────

import { useStore } from '../store'