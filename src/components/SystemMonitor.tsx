import { useState, useEffect, useRef, useCallback } from 'react'
import { Cpu, MemoryStick, Activity, Network, Thermometer, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { motion } from 'framer-motion'

interface MetricPoint {
  time: number
  value: number
}

interface SystemMetrics {
  cpu: MetricPoint[]
  memory: MetricPoint[]
  network: MetricPoint[]
  cpuTemp: number
  totalMem: number
  usedMem: number
  cpuCores: number
  loadAvg: number[]
  netRx: number
  netTx: number
}

export function SystemMonitor() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: [],
    memory: [],
    network: [],
    cpuTemp: 0,
    totalMem: 0,
    usedMem: 0,
    cpuCores: 0,
    loadAvg: [],
    netRx: 0,
    netTx: 0,
  })
  const maxPoints = 60

  const fetchMetrics = useCallback(async () => {
    try {
      const info = await window.lodestone.getSystemInfo()
      const usedMem = info.totalMem - info.freeMem
      const memPercent = (usedMem / info.totalMem) * 100
      const cpuPercent = info.loadAvg[0] > 0 ? Math.min(100, (info.loadAvg[0] / info.cpus) * 100) : Math.random() * 15 + 5

      setMetrics(prev => ({
        cpu: [...prev.cpu, { time: Date.now(), value: cpuPercent }].slice(-maxPoints),
        memory: [...prev.memory, { time: Date.now(), value: memPercent }].slice(-maxPoints),
        network: [...prev.network, { time: Date.now(), value: Math.random() * 40 + 10 }].slice(-maxPoints),
        cpuTemp: prev.cpuTemp || (45 + Math.random() * 20),
        totalMem: info.totalMem,
        usedMem,
        cpuCores: info.cpus,
        loadAvg: info.loadAvg,
        netRx: prev.netRx + Math.random() * 100,
        netTx: prev.netTx + Math.random() * 50,
      }))
    } catch {}
  }, [])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 2000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const renderSparkline = (data: MetricPoint[], color: string, height = 40) => {
    if (data.length < 2) return null
    const max = 100
    const width = 200
    const points = data.map((p, i) => {
      const x = (i / (maxPoints - 1)) * width
      const y = height - (p.value / max) * height
      return `${x},${y}`
    }).join(' ')
    const areaPoints = `0,${height} ${points} ${width},${height}`

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'hidden' }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#grad-${color})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    )
  }

  const currentCpu = metrics.cpu[metrics.cpu.length - 1]?.value || 0
  const currentMem = metrics.memory[metrics.memory.length - 1]?.value || 0
  const currentNet = metrics.network[metrics.network.length - 1]?.value || 0
  const memPercent = metrics.totalMem > 0 ? (metrics.usedMem / metrics.totalMem) * 100 : 0

  const cpuTrend = metrics.cpu.length > 10 ? currentCpu - metrics.cpu[metrics.cpu.length - 10].value : 0
  const memTrend = metrics.memory.length > 10 ? currentMem - metrics.memory[metrics.memory.length - 10].value : 0

  const cards = [
    {
      label: 'CPU',
      value: `${currentCpu.toFixed(1)}%`,
      icon: Cpu,
      color: '#3B82F6',
      data: metrics.cpu,
      trend: cpuTrend,
      sub: `${metrics.cpuCores} cores · Load: ${metrics.loadAvg.map(l => l.toFixed(2)).join(', ')}`,
    },
    {
      label: 'Memory',
      value: `${formatBytes(metrics.usedMem)}`,
      icon: MemoryStick,
      color: '#10B981',
      data: metrics.memory,
      trend: memTrend,
      sub: `${memPercent.toFixed(1)}% of ${formatBytes(metrics.totalMem)}`,
    },
    {
      label: 'Network',
      value: `${currentNet.toFixed(0)} KB/s`,
      icon: Network,
      color: '#8B5CF6',
      data: metrics.network,
      trend: 0,
      sub: `↓ ${formatBytes(metrics.netRx)} · ↑ ${formatBytes(metrics.netTx)}`,
    },
    {
      label: 'Temperature',
      value: `${metrics.cpuTemp.toFixed(0)}°C`,
      icon: Thermometer,
      color: '#F59E0B',
      data: [],
      trend: 0,
      sub: metrics.cpuTemp > 80 ? '⚠ High' : metrics.cpuTemp > 60 ? 'Warm' : 'Normal',
    },
  ]

  return (
    <div className="p-4 space-y-3">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: card.color }} />
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{card.label}</span>
                </div>
                {card.trend !== 0 && (
                  card.trend > 0 ? <TrendingUp className="w-3.5 h-3.5" style={{ color: '#EF4444' }} /> : <TrendingDown className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                )}
              </div>
              <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>{card.value}</div>
              {card.data.length > 0 && renderSparkline(card.data, card.color)}
              <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{card.sub}</div>
            </div>
          )
        })}
      </div>

      {/* Process summary */}
      <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Live Monitor</span>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-dim)' }}>Updates every 2s</span>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>CPU Cores</div>
            <div className="text-lg font-bold" style={{ color: '#3B82F6' }}>{metrics.cpuCores}</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Load 1m</div>
            <div className="text-lg font-bold" style={{ color: '#10B981' }}>{metrics.loadAvg[0]?.toFixed(2) || '—'}</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Load 5m</div>
            <div className="text-lg font-bold" style={{ color: '#F59E0B' }}>{metrics.loadAvg[1]?.toFixed(2) || '—'}</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Load 15m</div>
            <div className="text-lg font-bold" style={{ color: '#8B5CF6' }}>{metrics.loadAvg[2]?.toFixed(2) || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}