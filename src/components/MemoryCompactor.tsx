import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, ArrowDown, Check, Sparkles } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface CompactionStats {
  raw: number
  duplicates: number
  compressed: number
  final: number
}

// ─── Mock initial data ───────────────────────────────────────────────

const INITIAL_STATS: CompactionStats = {
  raw: 1247,
  duplicates: 312,
  compressed: 578,
  final: 266,
}

// ─── Memory Compactor Component ──────────────────────────────────────

export function MemoryCompactor() {
  const [stats, setStats] = useState<CompactionStats>(INITIAL_STATS)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(false)

  const runCompaction = useCallback(() => {
    if (running) return
    setRunning(true)
    setCompleted(false)

    // Animate numbers decreasing step by step
    const steps = [
      { delay: 200, fn: (s: CompactionStats): CompactionStats => ({ ...s, duplicates: Math.round(s.duplicates * 0.7) }) },
      { delay: 400, fn: (s: CompactionStats): CompactionStats => ({ ...s, compressed: Math.round(s.compressed * 0.65) }) },
      { delay: 600, fn: (s: CompactionStats): CompactionStats => ({ ...s, raw: Math.round(s.raw * 0.8) }) },
      { delay: 800, fn: (s: CompactionStats): CompactionStats => ({ ...s, duplicates: Math.round(s.duplicates * 0.5) }) },
      { delay: 1000, fn: (s: CompactionStats): CompactionStats => ({ ...s, compressed: Math.round(s.compressed * 0.7) }) },
      { delay: 1200, fn: (s: CompactionStats): CompactionStats => ({ ...s, final: Math.round(s.final * 0.6) }) },
      { delay: 1400, fn: (s: CompactionStats): CompactionStats => ({ ...s, raw: Math.round(s.raw * 0.75), duplicates: Math.round(s.duplicates * 0.4) }) },
      { delay: 1600, fn: (s: CompactionStats): CompactionStats => ({ ...s, compressed: Math.round(s.compressed * 0.6), final: Math.round(s.final * 0.5) }) },
    ]

    let currentStats = { ...INITIAL_STATS }
    setStats(currentStats)

    steps.forEach(({ delay, fn }) => {
      setTimeout(() => {
        currentStats = fn(currentStats)
        setStats({ ...currentStats })
      }, delay)
    })

    setTimeout(() => {
      setRunning(false)
      setCompleted(true)
      setTimeout(() => setCompleted(false), 2500)
    }, 1800)
  }, [running])

  // ── Funnel layer data ──────────────────────────────────────────────

  const layers = [
    {
      label: 'Raw Memories',
      value: stats.raw,
      color: '#8B5CF6',
      bg: 'rgba(139, 92, 246, 0.12)',
      width: '100%',
      icon: Layers,
    },
    {
      label: 'Duplicates Removed',
      value: stats.duplicates,
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.12)',
      width: '78%',
      icon: ArrowDown,
    },
    {
      label: 'Compressed',
      value: stats.compressed,
      color: '#06B6D4',
      bg: 'rgba(6, 182, 212, 0.12)',
      width: '56%',
      icon: ArrowDown,
    },
    {
      label: 'Final Stored',
      value: stats.final,
      color: '#10B981',
      bg: 'rgba(16, 185, 129, 0.12)',
      width: '38%',
      icon: Check,
    },
  ]

  const reductionPct = stats.raw > 0 ? Math.round(((stats.raw - stats.final) / stats.raw) * 100) : 0

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-semibold">Memory Compaction</h3>
        </div>
        <button
          onClick={runCompaction}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: running ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
            color: running ? 'var(--text-dim)' : '#fff',
            border: 'none',
            cursor: running ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? 'Compacting...' : 'Run Compaction'}
        </button>
      </div>

      {/* Funnel Visualization */}
      <div className="space-y-2">
        {layers.map((layer, i) => {
          const Icon = layer.icon
          return (
            <motion.div
              key={layer.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              className="flex items-center gap-3"
            >
              {/* Label */}
              <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                <Icon className="w-3.5 h-3.5" style={{ color: layer.color }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {layer.label}
                </span>
              </div>

              {/* Bar */}
              <div className="flex-1 relative">
                <motion.div
                  className="rounded-lg flex items-center justify-end pr-3"
                  style={{
                    background: layer.bg,
                    border: `1px solid ${layer.color}30`,
                    height: 36,
                    width: layer.width,
                  }}
                  animate={running ? { scaleX: [1, 0.85, 1] } : { scaleX: 1 }}
                  transition={{ duration: 0.4, repeat: running ? 2 : 0 }}
                >
                  <motion.span
                    className="text-sm font-bold"
                    style={{ color: layer.color }}
                    key={layer.value}
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {layer.value.toLocaleString()}
                  </motion.span>
                </motion.div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: completed ? '#10B981' : running ? '#F59E0B' : 'var(--text-dim)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {completed ? 'Compaction complete' : running ? 'Compacting memories...' : 'Last compaction: 2h ago'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: 'var(--text-dim)' }}>
            Reduction: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{reductionPct}%</span>
          </span>
          <span style={{ color: 'var(--text-dim)' }}>
            Saved: <span style={{ color: '#10B981', fontWeight: 600 }}>{(stats.raw - stats.final).toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* Completion flash */}
      <AnimatePresence>
        {completed && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
          >
            <Check className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
            <span className="text-xs" style={{ color: '#10B981' }}>
              Compaction complete — {reductionPct}% reduction achieved
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}