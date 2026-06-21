import { useState, useRef } from 'react'
import { Workflow, Plus, Trash2, Play, Zap, ArrowRight, GitBranch } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface WorkflowNode {
  id: string
  type: 'trigger' | 'action' | 'condition'
  name: string
  tool: string
  params: string
}

interface WorkflowDef {
  id: string
  name: string
  nodes: WorkflowNode[]
  enabled: boolean
}

const MOCK_WORKFLOWS: WorkflowDef[] = [
  {
    id: '1',
    name: 'Daily Research Digest',
    enabled: true,
    nodes: [
      { id: 'n1', type: 'trigger', name: 'Every morning 9am', tool: 'scheduler', params: 'cron: 0 9 * * *' },
      { id: 'n2', type: 'action', name: 'Search web for topics', tool: 'web-search', params: 'query: "AI agents 2026"' },
      { id: 'n3', type: 'action', name: 'Summarize findings', tool: 'llm', params: 'prompt: "Summarize these articles..."' },
      { id: 'n4', type: 'action', name: 'Save to wiki', tool: 'wiki-write', params: 'page: "daily-digest"' },
    ],
  },
  {
    id: '2',
    name: 'Auto-respond to support',
    enabled: false,
    nodes: [
      { id: 'n1', type: 'trigger', name: 'New email received', tool: 'email-trigger', params: 'folder: inbox' },
      { id: 'n2', type: 'condition', name: 'Is support request?', tool: 'classifier', params: 'categories: [support, sales, other]' },
      { id: 'n3', type: 'action', name: 'Draft response', tool: 'llm', params: 'tone: helpful' },
      { id: 'n4', type: 'action', name: 'Send reply', tool: 'send-message', params: 'channel: email' },
    ],
  },
]

const NODE_COLORS: Record<string, string> = {
  trigger: '#10B981',
  action: '#8B5CF6',
  condition: '#F59E0B',
}

const NODE_ICONS: Record<string, any> = {
  trigger: Zap,
  action: ArrowRight,
  condition: GitBranch,
}

export function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState<WorkflowDef[]>(MOCK_WORKFLOWS)
  const [selected, setSelected] = useState<string | null>(MOCK_WORKFLOWS[0]?.id || null)

  const current = workflows.find(w => w.id === selected)

  const toggleWorkflow = (id: string) => {
    setWorkflows(workflows.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w))
  }

  const deleteWorkflow = (id: string) => {
    setWorkflows(workflows.filter(w => w.id !== id))
    if (selected === id) setSelected(null)
  }

  return (
    <div className="space-y-4">
      {/* Workflow list */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-medium" style={{ color: 'var(--text)' }}>Workflows</h3>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {workflows.filter(w => w.enabled).length} active
          </span>
        </div>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus className="w-3 h-3" /> New Workflow
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Workflow cards */}
        <div className="space-y-2">
          {workflows.map(wf => (
            <button
              key={wf.id}
              onClick={() => setSelected(wf.id)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected === wf.id ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-card)',
                border: `1px solid ${selected === wf.id ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{wf.name}</span>
                <div
                  onClick={(e) => { e.stopPropagation(); toggleWorkflow(wf.id) }}
                  className="relative w-9 h-5 rounded-full transition-all cursor-pointer"
                  style={{ background: wf.enabled ? '#8B5CF6' : 'var(--border-hover)' }}
                >
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: wf.enabled ? '20px' : '2px' }} />
                </div>
              </div>
              <div className="flex items-center gap-1">
                {wf.nodes.map((n, i) => (
                  <span key={n.id} className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {i > 0 && ' → '}{n.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Workflow detail — node chain */}
        {current && (
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium" style={{ color: 'var(--text)' }}>{current.name}</h4>
              <button
                onClick={() => deleteWorkflow(current.id)}
                className="p-1 rounded hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {current.nodes.map((node, i) => {
                const Icon = NODE_ICONS[node.type]
                const color = NODE_COLORS[node.type]
                return (
                  <div key={node.id}>
                    {i > 0 && (
                      <div className="flex justify-center my-0.5">
                        <div className="w-px h-4" style={{ background: 'var(--border)' }} />
                      </div>
                    )}
                    <div
                      className="flex items-center gap-2 p-2 rounded-lg"
                      style={{ background: 'var(--bg-elevated)', border: `1px solid var(--border)` }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{node.name}</p>
                        <p className="text-xs font-mono truncate" style={{ color: 'var(--text-dim)' }}>{node.tool}({node.params})</p>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color }}>
                        {node.type}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-all"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}
            >
              <Plus className="w-3 h-3" /> Add Node
            </button>
          </div>
        )}
      </div>
    </div>
  )
}