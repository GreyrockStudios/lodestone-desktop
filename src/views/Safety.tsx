import { useState, useEffect, useCallback } from 'react'
import { Shield, ShieldAlert, ShieldCheck, Plus, Trash2, AlertTriangle, ToggleLeft, ToggleRight, Lock, Eye, Activity, Zap } from 'lucide-react'
import { useStore } from '../store'

interface RedLine {
  id: string
  text: string
  editable: boolean
}

interface NearMiss {
  id: string
  timestamp: number
  description: string
  severity: 'low' | 'medium' | 'high'
  resolved: boolean
}

interface LearnedConstraint {
  id: string
  text: string
  source: string
  created: string
}

interface SafetyConfig {
  autoCapture: boolean
  requireConfirmation: boolean
  redLines: RedLine[]
}

const DEFAULT_RED_LINES: RedLine[] = [
  { id: 'rl-1', text: 'Never delete files without explicit confirmation', editable: true },
  { id: 'rl-2', text: 'Never send emails or public messages without approval', editable: true },
  { id: 'rl-3', text: 'Never modify system configuration files without permission', editable: true },
  { id: 'rl-4', text: 'Never execute destructive shell commands (rm -rf, format, etc.)', editable: true },
  { id: 'rl-5', text: 'Never exfiltrate private data to external services', editable: true },
  { id: 'rl-6', text: 'Never disable firewall or security tools', editable: true },
]

const DEFAULT_NEAR_MISSES: NearMiss[] = [
  { id: 'nm-1', timestamp: Date.now() - 86400000 * 2, description: 'Attempted to run rm on a log directory — caught by confirmation gate', severity: 'high', resolved: true },
  { id: 'nm-2', timestamp: Date.now() - 86400000 * 5, description: 'Tried to send an email without user approval — blocked by red line check', severity: 'medium', resolved: true },
  { id: 'nm-3', timestamp: Date.now() - 86400000 * 7, description: 'Approached modifying a cron job — prompted for confirmation', severity: 'low', resolved: true },
]

const DEFAULT_CONSTRAINTS: LearnedConstraint[] = [
  { id: 'lc-1', text: 'Always clean dist/ before type checking to avoid stale errors', source: 'Reflection 2026-06-18', created: '2026-06-18' },
  { id: 'lc-2', text: 'Subagent tasks should be scoped to complete within timeout', source: 'Reflection 2026-06-19', created: '2026-06-19' },
  { id: 'lc-3', text: 'Verify fixes end-to-end: apply → activate → confirm second-order effects', source: 'Operating Rules', created: '2026-06-13' },
  { id: 'lc-4', text: 'Structure before tuning — check data correctness before parameters', source: 'Operating Rules', created: '2026-06-13' },
]

function severityColor(sev: string): string {
  switch (sev) {
    case 'high': return '#EF4444'
    case 'medium': return '#F59E0B'
    case 'low': return '#06B6D4'
    default: return '#6B7280'
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const hours = diff / 3600000
  if (hours < 1) return `${Math.round(diff / 60000)}m ago`
  if (hours < 24) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function Safety() {
  const { config, setConfig } = useStore()
  const [redLines, setRedLines] = useState<RedLine[]>(DEFAULT_RED_LINES)
  const [nearMisses, setNearMisses] = useState<NearMiss[]>(DEFAULT_NEAR_MISSES)
  const [constraints, setConstraints] = useState<LearnedConstraint[]>(DEFAULT_CONSTRAINTS)
  const [autoCapture, setAutoCapture] = useState(true)
  const [requireConfirmation, setRequireConfirmation] = useState(true)
  const [newRedLine, setNewRedLine] = useState('')
  const [activeTab, setActiveTab] = useState<'redlines' | 'nearmisses' | 'constraints'>('redlines')

  // Load config from store on mount
  useEffect(() => {
    if (config) {
      // In a real app, these would come from the engine config
      // For now we use defaults
    }
  }, [config])

  const handleAddRedLine = () => {
    if (!newRedLine.trim()) return
    setRedLines([...redLines, { id: `rl-${Date.now()}`, text: newRedLine.trim(), editable: true }])
    setNewRedLine('')
  }

  const handleRemoveRedLine = (id: string) => {
    setRedLines(redLines.filter(r => r.id !== id))
  }

  const handleUpdateRedLine = (id: string, text: string) => {
    setRedLines(redLines.map(r => r.id === id ? { ...r, text } : r))
  }

  const handleToggleAutoCapture = () => {
    const next = !autoCapture
    setAutoCapture(next)
    if (config && setConfig) {
      setConfig({ ...config })
    }
  }

  const handleToggleRequireConfirmation = () => {
    const next = !requireConfirmation
    setRequireConfirmation(next)
    if (config && setConfig) {
      setConfig({ ...config })
    }
  }

  // Safety score: based on near-misses vs a baseline of total interactions
  const totalInteractions = 150 // would come from engine stats
  const resolvedCount = nearMisses.filter(n => n.resolved).length
  const unresolvedCount = nearMisses.length - resolvedCount
  const safetyScore = Math.max(0, Math.round(100 - (unresolvedCount * 15 + resolvedCount * 2)))
  const scoreColor = safetyScore >= 90 ? '#10B981' : safetyScore >= 70 ? '#F59E0B' : '#EF4444'

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Safety</h2>
        </div>

        {/* Safety score banner */}
        <div
          className="flex items-center gap-4 p-4 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke={scoreColor}
                strokeWidth="3"
                strokeDasharray={`${safetyScore} 100`}
                strokeLinecap="round"
                pathLength="100"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold" style={{ color: scoreColor }}>{safetyScore}</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium mb-0.5">Safety Score</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {safetyScore >= 90 ? 'Excellent — agent is operating within safe boundaries' :
                safetyScore >= 70 ? 'Good — minor incidents, all resolved' :
                'Needs attention — unresolved near-misses detected'}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                <AlertTriangle className="w-3 h-3" style={{ color: '#F59E0B' }} />
                {nearMisses.length} near-misses
              </span>
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                <ShieldCheck className="w-3 h-3" style={{ color: '#10B981' }} />
                {resolvedCount} resolved
              </span>
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                <Lock className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                {redLines.length} red lines
              </span>
            </div>
          </div>
        </div>

        {/* Config toggles */}
        <div className="flex gap-2 mt-3">
          <ConfigToggle
            icon={Zap}
            label="Auto-Capture"
            description="Auto-capture knowledge from conversations"
            on={autoCapture}
            onToggle={handleToggleAutoCapture}
          />
          <ConfigToggle
            icon={Lock}
            label="Require Confirmation"
            description="Confirm before destructive commands"
            on={requireConfirmation}
            onToggle={handleToggleRequireConfirmation}
          />
        </div>

        {/* Tab buttons */}
        <div className="flex gap-1 mt-3">
          <TabButton active={activeTab === 'redlines'} onClick={() => setActiveTab('redlines')} label={`Red Lines (${redLines.length})`} />
          <TabButton active={activeTab === 'nearmisses'} onClick={() => setActiveTab('nearmisses')} label={`Near-Misses (${nearMisses.length})`} />
          <TabButton active={activeTab === 'constraints'} onClick={() => setActiveTab('constraints')} label={`Constraints (${constraints.length})`} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto">
          {activeTab === 'redlines' && (
            <div className="space-y-2">
              {/* Add new red line */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={newRedLine}
                  onChange={(e) => setNewRedLine(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRedLine()}
                  placeholder="Add a new red line..."
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={handleAddRedLine}
                  disabled={!newRedLine.trim()}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0"
                  style={{
                    background: newRedLine.trim() ? 'linear-gradient(135deg, #8B5CF6, #7C3AED)' : 'var(--bg-elevated)',
                    border: 'none',
                    cursor: newRedLine.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Plus className="w-4 h-4" style={{ color: newRedLine.trim() ? 'white' : 'var(--text-dim)' }} />
                </button>
              </div>

              {/* Red lines list */}
              {redLines.map(rl => (
                <RedLineRow
                  key={rl.id}
                  redLine={rl}
                  onUpdate={(text) => handleUpdateRedLine(rl.id, text)}
                  onRemove={() => handleRemoveRedLine(rl.id)}
                />
              ))}
            </div>
          )}

          {activeTab === 'nearmisses' && (
            <div className="space-y-2">
              {nearMisses.length === 0 ? (
                <div className="text-center py-8">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
                  <h3 className="text-sm font-medium mb-1">No near-misses recorded</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your agent has been staying within safe boundaries.</p>
                </div>
              ) : (
                nearMisses.map(nm => <NearMissCard key={nm.id} nearMiss={nm} />)
              )}
            </div>
          )}

          {activeTab === 'constraints' && (
            <div className="space-y-2">
              {constraints.length === 0 ? (
                <div className="text-center py-8">
                  <Eye className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
                  <h3 className="text-sm font-medium mb-1">No learned constraints yet</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your agent will learn constraints as it operates.</p>
                </div>
              ) : (
                constraints.map(c => <ConstraintCard key={c.id} constraint={c} />)
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-sm transition-all"
      style={{
        background: active ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        border: `1px solid ${active ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  )
}

function ConfigToggle({ icon: Icon, label, description, on, onToggle }: {
  icon: any
  label: string
  description: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="flex-1 flex items-center gap-3 p-3 rounded-xl transition-all"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${on ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: on ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-elevated)' }}
      >
        <Icon className="w-4 h-4" style={{ color: on ? 'var(--accent)' : 'var(--text-dim)' }} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>{description}</div>
      </div>
      {on ? (
        <ToggleRight className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--accent)' }} />
      ) : (
        <ToggleLeft className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
      )}
    </button>
  )
}

function RedLineRow({ redLine, onUpdate, onRemove }: {
  redLine: RedLine
  onUpdate: (text: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(redLine.text)

  const handleSave = () => {
    onUpdate(text)
    setEditing(false)
  }

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
        <ShieldAlert className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
      </div>
      {editing ? (
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          autoFocus
          className="flex-1 px-2 py-1 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      ) : (
        <button
          onClick={() => { setText(redLine.text); setEditing(true) }}
          className="flex-1 text-left text-sm"
          style={{ color: 'var(--text)' }}
        >
          {redLine.text}
        </button>
      )}
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-red-500/10 transition-all flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
      </button>
    </div>
  )
}

function NearMissCard({ nearMiss }: { nearMiss: NearMiss }) {
  const sev = nearMiss.severity
  const color = severityColor(sev)

  return (
    <div className="card p-3">
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${color}15` }}
        >
          <AlertTriangle className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: `${color}15`, color }}
            >
              {sev}
            </span>
            {nearMiss.resolved && (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}
              >
                <ShieldCheck className="w-2.5 h-2.5" />
                Resolved
              </span>
            )}
            <span className="text-xs ml-auto" style={{ color: 'var(--text-dim)' }}>
              {timeAgo(nearMiss.timestamp)}
            </span>
          </div>
          <p className="text-sm">{nearMiss.description}</p>
        </div>
      </div>
    </div>
  )
}

function ConstraintCard({ constraint }: { constraint: LearnedConstraint }) {
  return (
    <div className="card p-3">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(6, 182, 212, 0.1)' }}>
          <Activity className="w-3.5 h-3.5" style={{ color: '#06B6D4' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm mb-1">{constraint.text}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              From: {constraint.source}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {new Date(constraint.created).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}