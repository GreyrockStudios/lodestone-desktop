import { useState, useEffect, useCallback } from 'react'
import { Shield, ShieldAlert, ShieldCheck, Plus, Trash2, AlertTriangle, ToggleLeft, ToggleRight, Lock, Eye, Activity, Zap, FileWarning, Filter, X } from 'lucide-react'
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

interface Incident {
  id: string
  timestamp: number
  type: 'near-miss' | 'constraint-violation' | 'auto-capture'
  description: string
  severity: 'low' | 'medium' | 'high'
  resolved: boolean
}

const DEFAULT_INCIDENTS: Incident[] = [
  { id: 'inc-1', timestamp: Date.now() - 86400000 * 7, type: 'near-miss', description: 'Attempted to run rm -rf on log directory without confirmation — caught by red line gate', severity: 'high', resolved: true },
  { id: 'inc-2', timestamp: Date.now() - 86400000 * 5, type: 'constraint-violation', description: 'Sent email without user approval — red line violated, flagged for review', severity: 'high', resolved: true },
  { id: 'inc-3', timestamp: Date.now() - 86400000 * 4, type: 'auto-capture', description: 'Auto-captured knowledge from conversation about database design patterns', severity: 'low', resolved: true },
  { id: 'inc-4', timestamp: Date.now() - 86400000 * 3, type: 'near-miss', description: 'Approached modifying a cron job — prompted for confirmation, user denied', severity: 'medium', resolved: true },
  { id: 'inc-5', timestamp: Date.now() - 86400000 * 2, type: 'auto-capture', description: 'Auto-captured decision about clean-build verification workflow', severity: 'low', resolved: true },
  { id: 'inc-6', timestamp: Date.now() - 86400000 * 1.5, type: 'constraint-violation', description: 'Attempted to access environment variable containing API key — blocked by safety filter', severity: 'medium', resolved: true },
  { id: 'inc-7', timestamp: Date.now() - 3600000 * 6, type: 'near-miss', description: 'Tried to open external port for debug server — blocked by network safety rule', severity: 'medium', resolved: false },
  { id: 'inc-8', timestamp: Date.now() - 3600000 * 2, type: 'auto-capture', description: 'Auto-captured reflection on subagent context exhaustion patterns', severity: 'low', resolved: false },
]

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
  const [activeTab, setActiveTab] = useState<'redlines' | 'nearmisses' | 'constraints' | 'incidents'>('redlines')
  const [incidents, setIncidents] = useState<Incident[]>(DEFAULT_INCIDENTS)
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [showReportForm, setShowReportForm] = useState(false)
  const [newIncident, setNewIncident] = useState<{ type: Incident['type']; description: string; severity: Incident['severity'] }>({ type: 'near-miss', description: '', severity: 'low' })

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
          <TabButton active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')} label={`Incidents (${incidents.length})`} />
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

          {activeTab === 'incidents' && (
            <div className="space-y-3">
              {/* Filter and Report button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
                  {(['all', 'high', 'medium', 'low'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setIncidentFilter(f)}
                      className="px-2 py-1 rounded-lg text-xs transition-all"
                      style={{
                        background: incidentFilter === f ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                        color: incidentFilter === f ? 'var(--accent)' : 'var(--text-muted)',
                        border: `1px solid ${incidentFilter === f ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
                      }}
                    >
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowReportForm(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', color: 'var(--accent)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Report Incident
                </button>
              </div>

              {/* Incidents table */}
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)' }}>
                      <th className="px-3 py-2 text-xs font-medium text-left" style={{ color: 'var(--text-dim)' }}>Timestamp</th>
                      <th className="px-3 py-2 text-xs font-medium text-left" style={{ color: 'var(--text-dim)' }}>Type</th>
                      <th className="px-3 py-2 text-xs font-medium text-left" style={{ color: 'var(--text-dim)' }}>Description</th>
                      <th className="px-3 py-2 text-xs font-medium text-center" style={{ color: 'var(--text-dim)' }}>Severity</th>
                      <th className="px-3 py-2 text-xs font-medium text-center" style={{ color: 'var(--text-dim)' }}>Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents
                      .filter(inc => incidentFilter === 'all' || inc.severity === incidentFilter)
                      .map(inc => {
                        const color = severityColor(inc.severity)
                        return (
                          <tr key={inc.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                              {new Date(inc.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {inc.type === 'near-miss' ? 'Near-Miss' : inc.type === 'constraint-violation' ? 'Constraint Violation' : 'Auto-Capture'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text)' }}>
                              {inc.description}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: `${color}15`, color }}
>
                                {inc.severity}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {inc.resolved ? (
                                <ShieldCheck className="w-4 h-4 inline" style={{ color: '#10B981' }} />
                              ) : (
                                <FileWarning className="w-4 h-4 inline" style={{ color: '#F59E0B' }} />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Report Incident Modal */}
      {showReportForm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setShowReportForm(false)}
        >
          <div
            className="max-w-md w-full mx-4 p-6 rounded-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                <FileWarning className="w-5 h-5" style={{ color: '#EF4444' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Report Safety Incident</h3>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Document a safety event for tracking.</p>
              </div>
              <button onClick={() => setShowReportForm(false)} className="ml-auto p-1 rounded-lg" style={{ color: 'var(--text-dim)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Type</label>
                <select
                  value={newIncident.type}
                  onChange={(e) => setNewIncident({ ...newIncident, type: e.target.value as Incident['type'] })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <option value="near-miss">Near-Miss</option>
                  <option value="constraint-violation">Constraint Violation</option>
                  <option value="auto-capture">Auto-Capture</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Severity</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setNewIncident({ ...newIncident, severity: s })}
                      className="flex-1 py-2 rounded-lg text-sm capitalize transition-all"
                      style={{
                        background: newIncident.severity === s ? `${severityColor(s)}15` : 'var(--bg-elevated)',
                        color: newIncident.severity === s ? severityColor(s) : 'var(--text-muted)',
                        border: `1px solid ${newIncident.severity === s ? severityColor(s) : 'var(--border)'}`,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
                <textarea
                  value={newIncident.description}
                  onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
                  placeholder="Describe what happened..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowReportForm(false)} className="btn-secondary text-xs px-4 py-2">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (newIncident.description.trim()) {
                      setIncidents([
                        { id: `inc-${Date.now()}`, timestamp: Date.now(), type: newIncident.type, description: newIncident.description.trim(), severity: newIncident.severity, resolved: false },
                        ...incidents,
                      ])
                      setShowReportForm(false)
                      setNewIncident({ type: 'near-miss', description: '', severity: 'low' })
                    }
                  }}
                  className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-medium"
                  style={{ background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', opacity: newIncident.description.trim() ? 1 : 0.5 }}
                  disabled={!newIncident.description.trim()}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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