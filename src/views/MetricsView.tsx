import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3, Clock, Wrench, Zap, TrendingUp,
  Activity, ArrowUp, ArrowDown, Calendar,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface MetricPoint {
  timestamp: number
  value: number
}

interface ToolUsage {
  name: string
  count: number
  color: string
}

interface DailyActivity {
  date: string
  count: number
}

interface MetricsData {
  responseTimes: MetricPoint[]
  toolUsage: ToolUsage[]
  tokenConsumption: MetricPoint[]
  dailyActivity: DailyActivity[]
  topTools: ToolUsage[]
}

// ─── Colors ──────────────────────────────────────────────────────────

const TOOL_COLORS = [
  '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#84CC16',
]

// ─── Mock Data Generator ─────────────────────────────────────────────

function generateMockData(): MetricsData {
  const now = Date.now()
  const HOUR = 3600_000
  const DAY = 86400_000

  // Response times: last 50 interactions, varying between 200ms and 3000ms
  const responseTimes: MetricPoint[] = Array.from({ length: 50 }, (_, i) => ({
    timestamp: now - (50 - i) * 6 * HOUR + Math.random() * HOUR,
    value: Math.round(400 + Math.random() * 1800 + Math.sin(i / 5) * 300),
  }))

  // Tool usage
  const toolNames = [
    'file_fetch', 'web_search', 'exec', 'read', 'write',
    'web_fetch', 'memory_store', 'browser', 'edit', 'nodes',
  ]
  const toolUsage: ToolUsage[] = toolNames.map((name, i) => ({
    name,
    count: Math.round(Math.random() * 150 + 10),
    color: TOOL_COLORS[i % TOOL_COLORS.length],
  })).sort((a, b) => b.count - a.count)

  // Token consumption over time (last 30 days, daily)
  const tokenConsumption: MetricPoint[] = Array.from({ length: 30 }, (_, i) => ({
    timestamp: now - (30 - i) * DAY,
    value: Math.round(50000 + Math.random() * 200000 + i * 3000 + Math.sin(i / 3) * 20000),
  }))

  // Daily activity heatmap (last 12 weeks = 84 days)
  const dailyActivity: DailyActivity[] = Array.from({ length: 84 }, (_, i) => {
    const dayOfWeek = new Date(now - (84 - i) * DAY).getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    return {
      date: new Date(now - (84 - i) * DAY).toISOString().split('T')[0],
      count: Math.round(Math.random() * (isWeekend ? 8 : 20) + (isWeekend ? 0 : 3)),
    }
  })

  return {
    responseTimes,
    toolUsage,
    tokenConsumption,
    dailyActivity,
    topTools: toolUsage.slice(0, 5),
  }
}

function loadMetrics(): MetricsData {
  try {
    const raw = localStorage.getItem('lodestone-metrics')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  const data = generateMockData()
  localStorage.setItem('lodestone-metrics', JSON.stringify(data))
  return data
}

// ─── SVG Line Chart ──────────────────────────────────────────────────

function LineChart({ data, color, label, unit }: { data: MetricPoint[]; color: string; label: string; unit: string }) {
  if (data.length === 0) return null
  const values = data.map(d => d.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  const W = 320
  const H = 120
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((d.value - min) / range) * (H - 20) - 10
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `0,${H} ${points} ${W},${H}`

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-xs" style={{ color }}>
          avg {Math.round(values.reduce((a, b) => a + b, 0) / values.length).toLocaleString()}{unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        <defs>
          <linearGradient id={`grad-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#grad-${label.replace(/\s/g, '')})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {data.length > 0 && (
          <circle
            cx={W}
            cy={H - ((data[data.length - 1].value - min) / range) * (H - 20) - 10}
            r="3"
            fill={color}
          />
        )}
      </svg>
    </div>
  )
}

// ─── SVG Area Chart ──────────────────────────────────────────────────

function AreaChart({ data, color, label }: { data: MetricPoint[]; color: string; label: string }) {
  if (data.length === 0) return null
  const values = data.map(d => d.value)
  const max = Math.max(...values)
  const range = max || 1

  const W = 320
  const H = 120
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - (d.value / range) * (H - 20) - 10
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `0,${H} ${points} ${W},${H}`

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-xs" style={{ color }}>
          {max >= 1_000_000 ? `${(max / 1_000_000).toFixed(1)}M` : max >= 1000 ? `${(max / 1000).toFixed(1)}K` : max} peak
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        <defs>
          <linearGradient id={`grad-area-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#grad-area-${label.replace(/\s/g, '')})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// ─── Pie Chart ───────────────────────────────────────────────────────

function PieChart({ data }: { data: ToolUsage[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1
  const R = 50
  const cx = 60
  const cy = 60

  let currentAngle = -90
  const slices = data.map((d) => {
    const angle = (d.count / total) * 360
    const startAngle = currentAngle
    currentAngle += angle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (currentAngle * Math.PI) / 180

    const x1 = cx + R * Math.cos(startRad)
    const y1 = cy + R * Math.sin(startRad)
    const x2 = cx + R * Math.cos(endRad)
    const y2 = cy + R * Math.sin(endRad)

    const largeArc = angle > 180 ? 1 : 0

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`

    return { ...d, path, pct: ((d.count / total) * 100).toFixed(1) }
  })

  return (
    <div className="flex items-start gap-4">
      <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, flexShrink: 0 }}>
        {slices.map((s) => (
          <path key={s.name} d={s.path} fill={s.color} stroke="var(--bg-card)" strokeWidth="1" />
        ))}
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        {slices.slice(0, 6).map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="truncate" style={{ color: 'var(--text-muted)' }}>{s.name}</span>
            <span className="ml-auto font-medium" style={{ color: 'var(--text)' }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Heatmap ─────────────────────────────────────────────────────────

function Heatmap({ data }: { data: DailyActivity[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const weeks = 12
  const days = 7

  // Organize into weeks
  const grid: (DailyActivity | null)[][] = []
  for (let w = 0; w < weeks; w++) {
    const week: (DailyActivity | null)[] = []
    for (let d = 0; d < days; d++) {
      const idx = w * days + d
      week.push(idx < data.length ? data[idx] : null)
    }
    grid.push(week)
  }

  function getColor(count: number): string {
    if (count === 0) return 'var(--bg-elevated)'
    const intensity = count / maxCount
    if (intensity < 0.25) return '#1a3a2a'
    if (intensity < 0.5) return '#166534'
    if (intensity < 0.75) return '#22c55e'
    return '#4ade80'
  }

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

  return (
    <div>
      <div className="flex gap-0.5">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1" style={{ marginTop: 18 }}>
          {dayLabels.map((label, i) => (
            <div key={i} style={{ height: 10, fontSize: 9, color: 'var(--text-dim)', lineHeight: '10px' }}>
              {label}
            </div>
          ))}
        </div>
        {/* Grid */}
        <div className="flex gap-0.5">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day ? `${day.date}: ${day.count} interactions` : ''}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: day ? getColor(day.count) : 'var(--bg-elevated)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: v === 0 ? 'var(--bg-elevated)' : getColor(v * maxCount),
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

// ─── Leaderboard ─────────────────────────────────────────────────────

function Leaderboard({ tools }: { tools: ToolUsage[] }) {
  const maxCount = tools.length > 0 ? tools[0].count : 1

  return (
    <div className="flex flex-col gap-2">
      {tools.map((tool, i) => (
        <div key={tool.name} className="flex items-center gap-3">
          <span className="text-xs font-bold w-5 text-right" style={{ color: tool.color }}>#{i + 1}</span>
          <span className="text-sm flex-shrink-0 w-28 truncate" style={{ color: 'var(--text)' }}>{tool.name}</span>
          <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(tool.count / maxCount) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="h-full rounded-full"
              style={{ background: tool.color, minWidth: 4 }}
            />
          </div>
          <span className="text-xs font-medium w-10 text-right" style={{ color: 'var(--text-muted)' }}>{tool.count}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, change, color }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  change?: number
  color: string
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          {change >= 0 ? (
            <ArrowUp className="w-3 h-3" style={{ color: '#10B981' }} />
          ) : (
            <ArrowDown className="w-3 h-3" style={{ color: '#EF4444' }} />
          )}
          <span className="text-xs" style={{ color: change >= 0 ? '#10B981' : '#EF4444' }}>
            {Math.abs(change).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────

export function MetricsView() {
  const [metrics, setMetrics] = useState<MetricsData>(loadMetrics)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')

  const handleRefresh = useCallback(() => {
    const data = generateMockData()
    localStorage.setItem('lodestone-metrics', JSON.stringify(data))
    setMetrics(data)
  }, [])

  useEffect(() => {
    // Auto-refresh metrics periodically
    const interval = setInterval(() => {
      setMetrics(loadMetrics())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const avgResponseTime = metrics.responseTimes.length > 0
    ? Math.round(metrics.responseTimes.reduce((s, d) => s + d.value, 0) / metrics.responseTimes.length)
    : 0

  const totalToolCalls = metrics.toolUsage.reduce((s, d) => s + d.count, 0)
  const totalTokens = metrics.tokenConsumption.reduce((s, d) => s + d.value, 0)

  const filteredResponseTimes = timeRange === '7d'
    ? metrics.responseTimes.slice(-10)
    : timeRange === '30d'
      ? metrics.responseTimes
      : metrics.responseTimes

  const filteredTokenConsumption = timeRange === '7d'
    ? metrics.tokenConsumption.slice(-7)
    : timeRange === '30d'
      ? metrics.tokenConsumption
      : metrics.tokenConsumption

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Metrics Dashboard</h2>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Performance analytics and usage insights</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: timeRange === range ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: timeRange === range ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${timeRange === range ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {range}
              </button>
            ))}
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard icon={Clock} label="Avg Response Time" value={`${avgResponseTime}ms`} change={-8.2} color="#8B5CF6" />
          <StatCard icon={Wrench} label="Total Tool Calls" value={totalToolCalls.toLocaleString()} change={12.5} color="#06B6D4" />
          <StatCard icon={Zap} label="Total Tokens" value={totalTokens >= 1_000_000 ? `${(totalTokens / 1_000_000).toFixed(1)}M` : `${(totalTokens / 1000).toFixed(0)}K`} change={5.3} color="#10B981" />
          <StatCard icon={Activity} label="Active Days" value={metrics.dailyActivity.filter(d => d.count > 0).length.toString()} change={2.1} color="#F59E0B" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Response Times */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Response Time</h3>
            <LineChart data={filteredResponseTimes} color="#8B5CF6" label="Latency" unit="ms" />
          </div>

          {/* Token Consumption */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Token Consumption</h3>
            <AreaChart data={filteredTokenConsumption} color="#06B6D4" label="Tokens" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Tool Usage Pie Chart */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Tool Usage Breakdown</h3>
            <PieChart data={metrics.toolUsage} />
          </div>

          {/* Activity Heatmap */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Daily Activity</h3>
            <Heatmap data={metrics.dailyActivity} />
          </div>

          {/* Top Tools Leaderboard */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Top Tools</h3>
            <Leaderboard tools={metrics.topTools} />
          </div>
        </div>

        {/* Recent metrics table */}
        <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Recent Interactions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-2 font-medium" style={{ color: 'var(--text-dim)' }}>Time</th>
                  <th className="text-left py-2 font-medium" style={{ color: 'var(--text-dim)' }}>Response</th>
                  <th className="text-left py-2 font-medium" style={{ color: 'var(--text-dim)' }}>Tokens</th>
                  <th className="text-left py-2 font-medium" style={{ color: 'var(--text-dim)' }}>Tools</th>
                </tr>
              </thead>
              <tbody>
                {metrics.responseTimes.slice(-10).reverse().map((point, i) => {
                  const tokens = metrics.tokenConsumption[Math.min(i, metrics.tokenConsumption.length - 1)]
                  const toolIdx = i % metrics.topTools.length
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2" style={{ color: 'var(--text-muted)' }}>
                        {new Date(point.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2">
                        <span style={{ color: point.value < 1000 ? '#10B981' : point.value < 2000 ? '#F59E0B' : '#EF4444' }}>
                          {point.value}ms
                        </span>
                      </td>
                      <td className="py-2" style={{ color: 'var(--text-muted)' }}>
                        {tokens ? tokens.value.toLocaleString() : '-'}
                      </td>
                      <td className="py-2" style={{ color: 'var(--accent)' }}>
                        {metrics.topTools[toolIdx]?.name || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}