import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Workflow, Plus, Play, Trash2, ChevronDown, ChevronRight,
  Download, Upload, Clock, FileText, Globe, MessageSquare,
  Zap, Terminal, ArrowRight, Settings, X,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

type TriggerType = 'schedule' | 'file_change' | 'webhook' | 'agent_message' | 'system_startup'
type ActionType = 'run_tool' | 'send_message' | 'execute_command' | 'call_api' | 'wait' | 'condition'

interface Trigger {
  id: string
  type: TriggerType
  config: Record<string, string>
}

interface Action {
  id: string
  type: ActionType
  config: Record<string, string>
  enabled: boolean
}

interface Automation {
  id: string
  name: string
  description: string
  trigger: Trigger
  actions: Action[]
  enabled: boolean
  createdAt: number
  lastRun: number | null
  runCount: number
}

// ─── Constants ────────────────────────────────────────────────────────

const TRIGGER_TYPES: { type: TriggerType; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }[] = [
  { type: 'schedule', label: 'Schedule (Cron)', icon: Clock, color: '#8B5CF6' },
  { type: 'file_change', label: 'File Change', icon: FileText, color: '#06B6D4' },
  { type: 'webhook', label: 'Webhook', icon: Globe, color: '#10B981' },
  { type: 'agent_message', label: 'Agent Message', icon: MessageSquare, color: '#F59E0B' },
  { type: 'system_startup', label: 'System Startup', icon: Zap, color: '#EF4444' },
]

const ACTION_TYPES: { type: ActionType; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }[] = [
  { type: 'run_tool', label: 'Run Tool', icon: Settings, color: '#8B5CF6' },
  { type: 'send_message', label: 'Send Message', icon: MessageSquare, color: '#06B6D4' },
  { type: 'execute_command', label: 'Execute Command', icon: Terminal, color: '#10B981' },
  { type: 'call_api', label: 'Call API', icon: Globe, color: '#F59E0B' },
  { type: 'wait', label: 'Wait', icon: Clock, color: '#6B7280' },
  { type: 'condition', label: 'Condition', icon: ArrowRight, color: '#EC4899' },
]

const TRIGGER_FIELDS: Record<TriggerType, { key: string; label: string; placeholder: string }[]> = {
  schedule: [
    { key: 'cron', label: 'Cron Expression', placeholder: '0 */6 * * * (every 6 hours)' },
    { key: 'timezone', label: 'Timezone', placeholder: 'America/Toronto' },
  ],
  file_change: [
    { key: 'path', label: 'Watch Path', placeholder: '/workspace/data/*.json' },
    { key: 'events', label: 'Events', placeholder: 'create,modify,delete' },
  ],
  webhook: [
    { key: 'endpoint', label: 'Endpoint Path', placeholder: '/hooks/my-automation' },
    { key: 'method', label: 'HTTP Method', placeholder: 'POST' },
  ],
  agent_message: [
    { key: 'pattern', label: 'Message Pattern', placeholder: 'error|fail|crash' },
    { key: 'source', label: 'Source Filter', placeholder: 'any' },
  ],
  system_startup: [],
}

const ACTION_FIELDS: Record<ActionType, { key: string; label: string; placeholder: string }[]> = {
  run_tool: [
    { key: 'tool', label: 'Tool Name', placeholder: 'web_search' },
    { key: 'args', label: 'Arguments (JSON)', placeholder: '{"query": "example"}' },
  ],
  send_message: [
    { key: 'channel', label: 'Channel', placeholder: 'telegram' },
    { key: 'message', label: 'Message Template', placeholder: 'Alert: {{event.type}} detected' },
  ],
  execute_command: [
    { key: 'command', label: 'Command', placeholder: 'npm run build' },
    { key: 'cwd', label: 'Working Directory', placeholder: '/workspace/project' },
  ],
  call_api: [
    { key: 'url', label: 'URL', placeholder: 'https://api.example.com/webhook' },
    { key: 'method', label: 'Method', placeholder: 'POST' },
    { key: 'body', label: 'Body (JSON)', placeholder: '{"event": "{{event.type}}"}' },
  ],
  wait: [
    { key: 'duration', label: 'Duration (ms)', placeholder: '5000' },
  ],
  condition: [
    { key: 'field', label: 'Field', placeholder: 'event.type' },
    { key: 'operator', label: 'Operator', placeholder: 'equals' },
    { key: 'value', label: 'Value', placeholder: 'error' },
  ],
}

// ─── Storage ──────────────────────────────────────────────────────────

function loadAutomations(): Automation[] {
  try {
    const raw = localStorage.getItem('lodestone-automations')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveAutomations(automations: Automation[]) {
  localStorage.setItem('lodestone-automations', JSON.stringify(automations))
}

// ─── Automation Editor ────────────────────────────────────────────────

function AutomationEditor({
  automation,
  onSave,
  onCancel,
}: {
  automation: Automation
  onSave: (a: Automation) => void
  onCancel: () => void
}) {
  const [edit, setEdit] = useState<Automation>(automation)
  const [showActionMenu, setShowActionMenu] = useState(false)

  const updateTrigger = useCallback((key: string, value: string) => {
    setEdit(prev => ({
      ...prev,
      trigger: { ...prev.trigger, config: { ...prev.trigger.config, [key]: value } },
    }))
  }, [])

  const updateAction = useCallback((actionId: string, key: string, value: string) => {
    setEdit(prev => ({
      ...prev,
      actions: prev.actions.map(a =>
        a.id === actionId ? { ...a, config: { ...a.config, [key]: value } } : a
      ),
    }))
  }, [])

  const toggleAction = useCallback((actionId: string) => {
    setEdit(prev => ({
      ...prev,
      actions: prev.actions.map(a =>
        a.id === actionId ? { ...a, enabled: !a.enabled } : a
      ),
    }))
  }, [])

  const addAction = useCallback((type: ActionType) => {
    const actionDef = ACTION_TYPES.find(a => a.type === type)!
    setEdit(prev => ({
      ...prev,
      actions: [...prev.actions, {
        id: `action-${Date.now()}`,
        type,
        config: {},
        enabled: true,
      }],
    }))
    setShowActionMenu(false)
  }, [])

  const removeAction = useCallback((actionId: string) => {
    setEdit(prev => ({
      ...prev,
      actions: prev.actions.filter(a => a.id !== actionId),
    }))
  }, [])

  const triggerDef = TRIGGER_TYPES.find(t => t.type === edit.trigger.type)!
  const TriggerIcon = triggerDef.icon

  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Name & Description */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <input
            value={edit.name}
            onChange={(e) => setEdit(prev => ({ ...prev, name: e.target.value }))}
            className="w-full text-base font-semibold px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
            placeholder="Automation name"
          />
          <input
            value={edit.description}
            onChange={(e) => setEdit(prev => ({ ...prev, description: e.target.value }))}
            className="w-full text-xs mt-1 px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'inherit' }}
            placeholder="Description (optional)"
          />
        </div>
      </div>

      {/* Trigger */}
      <div className="mb-4">
        <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>TRIGGER</h4>
        <div
          className="p-3 rounded-lg"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <TriggerIcon className="w-4 h-4" style={{ color: triggerDef.color }} />
            <select
              value={edit.trigger.type}
              onChange={(e) => setEdit(prev => ({
                ...prev,
                trigger: { ...prev.trigger, type: e.target.value as TriggerType, config: {} },
              }))}
              className="text-sm font-medium px-2 py-1 rounded-lg outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
            >
              {TRIGGER_TYPES.map(t => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
          </div>
          {TRIGGER_FIELDS[edit.trigger.type].map(field => (
            <div key={field.key} className="mt-2">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-dim)' }}>{field.label}</label>
              <input
                value={edit.trigger.config[field.key] || ''}
                onChange={(e) => updateTrigger(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>ACTIONS</h4>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowActionMenu(!showActionMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Plus className="w-3 h-3" />
              Add Action
            </button>
            <AnimatePresence>
              {showActionMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    zIndex: 50,
                    minWidth: 160,
                  }}
                >
                  {ACTION_TYPES.map(a => {
                    const Icon = a.icon
                    return (
                      <button
                        key={a.type}
                        onClick={() => addAction(a.type)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: a.color }} />
                        {a.label}
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-2">
          {edit.actions.map((action, idx) => {
            const actionDef = ACTION_TYPES.find(a => a.type === action.type)!
            const ActionIcon = actionDef.icon
            return (
              <div
                key={action.id}
                className="p-3 rounded-lg"
                style={{
                  background: action.enabled ? 'var(--bg-elevated)' : 'rgba(107,114,128,0.1)',
                  border: `1px solid ${action.enabled ? 'var(--border)' : 'rgba(107,114,128,0.2)'}`,
                  opacity: action.enabled ? 1 : 0.6,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAction(action.id)}
                      className="flex items-center gap-1"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: action.enabled ? actionDef.color : 'var(--text-dim)' }} />
                    </button>
                    <ActionIcon className="w-4 h-4" style={{ color: actionDef.color }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {idx + 1}. {actionDef.label}
                    </span>
                  </div>
                  <button
                    onClick={() => removeAction(action.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-dim)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {ACTION_FIELDS[action.type].map(field => (
                  <div key={field.key} className="ml-6 mb-1">
                    <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-dim)' }}>{field.label}</label>
                    <input
                      value={action.config[field.key] || ''}
                      onChange={(e) => updateAction(action.id, field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-2 py-1 rounded text-xs outline-none"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                    />
                  </div>
                ))}
              </div>
            )
          })}
          {edit.actions.length === 0 && (
            <div className="text-center py-4 text-xs" style={{ color: 'var(--text-dim)' }}>
              No actions yet. Click "Add Action" to get started.
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave(edit)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Save Automation
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────

export function AutomationView() {
  const [automations, setAutomations] = useState<Automation[]>(loadAutomations)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleSave = useCallback((automation: Automation) => {
    setAutomations(prev => {
      const idx = prev.findIndex(a => a.id === automation.id)
      const updated = idx >= 0
        ? prev.map(a => a.id === automation.id ? automation : a)
        : [...prev, automation]
      saveAutomations(updated)
      return updated
    })
    setEditing(null)
    setCreating(false)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setAutomations(prev => {
      const updated = prev.filter(a => a.id !== id)
      saveAutomations(updated)
      return updated
    })
  }, [])

  const handleToggle = useCallback((id: string) => {
    setAutomations(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a)
      saveAutomations(updated)
      return updated
    })
  }, [])

  const handleRunNow = useCallback((id: string) => {
    setAutomations(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, lastRun: Date.now(), runCount: a.runCount + 1 } : a)
      saveAutomations(updated)
      return updated
    })
  }, [])

  const handleNew = useCallback(() => {
    setCreating(true)
  }, [])

  const handleExport = useCallback(() => {
    const yaml = automations.map(a => {
      const lines = [
        `name: "${a.name}"`,
        `description: "${a.description}"`,
        `enabled: ${a.enabled}`,
        `trigger:`,
        `  type: ${a.trigger.type}`,
        ...Object.entries(a.trigger.config).map(([k, v]) => `  ${k}: "${v}"`),
        `actions:`,
        ...a.actions.map(action => [
          `  - type: ${action.type}`,
          `    enabled: ${action.enabled}`,
          ...Object.entries(action.config).map(([k, v]) => `    ${k}: "${v}"`),
        ].join('\n')),
      ]
      return lines.join('\n')
    }).join('\n---\n')

    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'automations.yml'
    a.click()
    URL.revokeObjectURL(url)
  }, [automations])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yml,.yaml'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      // Simple YAML parse (key: "value" format)
      const blocks = text.split('---')
      const imported: Automation[] = []
      for (const block of blocks) {
        const nameMatch = block.match(/name:\s*"([^"]+)"/)
        const descMatch = block.match(/description:\s*"([^"]+)"/)
        const enabledMatch = block.match(/enabled:\s*(true|false)/)
        const triggerTypeMatch = block.match(/trigger:[\s\S]*?type:\s*(\w+)/)
        if (nameMatch) {
          imported.push({
            id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: nameMatch[1],
            description: descMatch?.[1] || '',
            trigger: { id: `trig-${Date.now()}`, type: (triggerTypeMatch?.[1] || 'schedule') as TriggerType, config: {} },
            actions: [],
            enabled: enabledMatch?.[1] === 'true',
            createdAt: Date.now(),
            lastRun: null,
            runCount: 0,
          })
        }
      }
      setAutomations(prev => {
        const updated = [...prev, ...imported]
        saveAutomations(updated)
        return updated
      })
    }
    input.click()
  }, [])

  const newAutomation: Automation = {
    id: `auto-${Date.now()}`,
    name: '',
    description: '',
    trigger: { id: `trig-${Date.now()}`, type: 'schedule', config: {} },
    actions: [],
    enabled: true,
    createdAt: Date.now(),
    lastRun: null,
    runCount: 0,
  }

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Workflow className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Automations</h2>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Build trigger-action recipes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={automations.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: automations.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: automations.length > 0 ? 1 : 0.5 }}
            >
              <Download className="w-3 h-3" />
              Export
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Upload className="w-3 h-3" />
              Import
            </button>
            <button
              onClick={handleNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Plus className="w-3.5 h-3.5" />
              New Automation
            </button>
          </div>
        </div>

        {/* Create new automation */}
        {creating && (
          <div className="mb-4">
            <AutomationEditor
              automation={newAutomation}
              onSave={handleSave}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}

        {/* Automation list */}
        {automations.length === 0 && !creating ? (
          <div className="text-center py-16">
            <Workflow className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-dim)', opacity: 0.3 }} />
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No automations yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Create one to automate repetitive tasks</p>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((auto) => {
              if (editing === auto.id) {
                return (
                  <div key={auto.id}>
                    <AutomationEditor
                      automation={auto}
                      onSave={handleSave}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                )
              }

              const triggerDef = TRIGGER_TYPES.find(t => t.type === auto.trigger.type)!
              const TriggerIcon = triggerDef.icon
              const isExpanded = expandedId === auto.id

              return (
                <motion.div
                  key={auto.id}
                  className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  layout
                >
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : auto.id)}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggle(auto.id) }}
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        background: auto.enabled ? '#10B981' : 'var(--text-dim)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <TriggerIcon className="w-3.5 h-3.5" style={{ color: triggerDef.color }} />
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{auto.name || 'Untitled'}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                          {triggerDef.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          → {auto.actions.length} action{auto.actions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {auto.description && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>{auto.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {auto.lastRun && (
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          Last run: {new Date(auto.lastRun).toLocaleTimeString()}
                        </span>
                      )}
                      {auto.runCount > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                          {auto.runCount}×
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRunNow(auto.id) }}
                        className="p-1 rounded"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                        title="Run Now"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
                      ) : (
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
                          <div className="mt-2">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Actions:</span>
                            {auto.actions.length === 0 ? (
                              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>No actions configured</p>
                            ) : (
                              <div className="space-y-1 mt-1">
                                {auto.actions.map((action, idx) => {
                                  const actionDef = ACTION_TYPES.find(a => a.type === action.type)!
                                  const ActionIcon = actionDef.icon
                                  return (
                                    <div key={action.id} className="flex items-center gap-2 text-xs">
                                      <span className="w-4 text-center" style={{ color: 'var(--text-dim)' }}>{idx + 1}.</span>
                                      <ActionIcon className="w-3 h-3" style={{ color: actionDef.color }} />
                                      <span style={{ color: 'var(--text-muted)' }}>{actionDef.label}</span>
                                      {Object.keys(action.config).length > 0 && (
                                        <span className="truncate" style={{ color: 'var(--text-dim)', maxWidth: 200 }}>
                                          {Object.entries(action.config).map(([k, v]) => `${k}=${v}`).join(', ')}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              onClick={() => setEditing(auto.id)}
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(auto.id)}
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              <Trash2 className="w-3 h-3 inline mr-1" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}