import { useState } from 'react'
import { Cpu, Zap, Clock, Target, DollarSign, Award } from 'lucide-react'

interface ModelMetrics {
  model: string
  provider: string
  responseTime: number // ms
  tokenEfficiency: number // tokens per response (lower = better)
  toolAccuracy: number // percentage
  costPer1K: number // dollars
  contextWindow: number // tokens
}

const MOCK_MODELS: ModelMetrics[] = [
  { model: 'GPT-4o', provider: 'OpenAI', responseTime: 850, tokenEfficiency: 120, toolAccuracy: 94, costPer1K: 0.005, contextWindow: 128000 },
  { model: 'Claude 3.5 Sonnet', provider: 'Anthropic', responseTime: 720, tokenEfficiency: 98, toolAccuracy: 97, costPer1K: 0.003, contextWindow: 200000 },
  { model: 'GLM-5.2', provider: 'Ollama Cloud', responseTime: 1200, tokenEfficiency: 115, toolAccuracy: 89, costPer1K: 0.001, contextWindow: 128000 },
  { model: 'Llama 3.1 70B', provider: 'Groq', responseTime: 450, tokenEfficiency: 142, toolAccuracy: 85, costPer1K: 0.0007, contextWindow: 131072 },
]

function bestModel(metric: keyof ModelMetrics): string {
  let best = MOCK_MODELS[0]
  for (const m of MOCK_MODELS) {
    if (metric === 'responseTime' || metric === 'tokenEfficiency' || metric === 'costPer1K') {
      if (m[metric] < best[metric]) best = m
    } else if (metric === 'toolAccuracy') {
      if (m[metric] > best[metric]) best = m
    }
  }
  return best.model
}

function formatCost(cost: number): string {
  if (cost < 0.001) return `$${(cost * 1000).toFixed(2)}/M`
  return `$${cost.toFixed(3)}`
}

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return n.toString()
}

export function ModelComparison() {
  const [sortBy, setSortBy] = useState<keyof ModelMetrics>('toolAccuracy')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = [...MOCK_MODELS].sort((a, b) => {
    const av = a[sortBy]
    const bv = b[sortBy]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  const handleSort = (col: keyof ModelMetrics) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir(col === 'toolAccuracy' || col === 'contextWindow' ? 'desc' : 'asc')
    }
  }

  const bestResponseTime = bestModel('responseTime')
  const bestTokenEff = bestModel('tokenEfficiency')
  const bestToolAcc = bestModel('toolAccuracy')
  const bestCost = bestModel('costPer1K')

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-medium">Model Performance Comparison</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2 p-3" style={{ background: 'var(--bg-elevated)' }}>
        <SummaryCard icon={Clock} label="Fastest" value={bestResponseTime} color="#10B981" />
        <SummaryCard icon={Zap} label="Most Efficient" value={bestTokenEff} color="#06B6D4" />
        <SummaryCard icon={Target} label="Best Tool Use" value={bestToolAcc} color="#8B5CF6" />
        <SummaryCard icon={DollarSign} label="Cheapest" value={bestCost} color="#F59E0B" />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <SortHeader label="Model" col="model" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Provider" col="provider" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Response Time" col="responseTime" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Token Efficiency" col="tokenEfficiency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Tool Accuracy" col="toolAccuracy" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Cost / 1K tokens" col="costPer1K" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Context Window" col="contextWindow" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => (
              <tr key={m.model} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>
                  <div className="flex items-center gap-1.5">
                    {m.model}
                    {(m.model === bestResponseTime || m.model === bestTokenEff || m.model === bestToolAcc || m.model === bestCost) && (
                      <Award className="w-3 h-3" style={{ color: '#F59E0B' }} />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{m.provider}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: m.model === bestResponseTime ? '#10B981' : 'var(--text-muted)' }}>
                  {m.responseTime}ms
                </td>
                <td className="px-3 py-2.5 text-right" style={{ color: m.model === bestTokenEff ? '#06B6D4' : 'var(--text-muted)' }}>
                  {m.tokenEfficiency}t
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span style={{ color: m.model === bestToolAcc ? '#8B5CF6' : 'var(--text-muted)' }}>
                    {m.toolAccuracy}%
                  </span>
                  <div className="w-16 h-1 rounded-full mt-1 ml-auto" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${m.toolAccuracy}%`, background: m.toolAccuracy >= 90 ? '#10B981' : m.toolAccuracy >= 85 ? '#F59E0B' : '#EF4444' }}
                    />
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right" style={{ color: m.model === bestCost ? '#F59E0B' : 'var(--text-muted)' }}>
                  {formatCost(m.costPer1K)}
                </td>
                <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                  {formatNum(m.contextWindow)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="p-2.5 text-xs flex items-center gap-1.5" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
        <Award className="w-3 h-3" style={{ color: '#F59E0B' }} />
        <span>Highlighted values indicate best in category. Data is based on recent usage metrics.</span>
      </div>
    </div>
  )
}

function SortHeader({ label, col, sortBy, sortDir, onSort, align = 'left' }: {
  label: string
  col: keyof ModelMetrics
  sortBy: keyof ModelMetrics
  sortDir: 'asc' | 'desc'
  onSort: (col: keyof ModelMetrics) => void
  align?: 'left' | 'right'
}) {
  const active = sortBy === col
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2 text-xs font-medium cursor-pointer select-none whitespace-nowrap"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        textAlign: align,
      }}
    >
      {label}
      {active && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: any
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-card)' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{label}</div>
        <div className="text-xs font-medium truncate" style={{ color }}>{value}</div>
      </div>
    </div>
  )
}