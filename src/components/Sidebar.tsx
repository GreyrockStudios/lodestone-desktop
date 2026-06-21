import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { LayoutDashboard, MessageSquare, Brain, Wrench, Clock, User, Settings, FolderOpen, Power, Network, History, Shield, ChevronDown, Plus, Settings2, Check, Terminal, GitBranch } from 'lucide-react'
import { useStore } from '../store'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'brain', label: 'Brain', icon: Network },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'history', label: 'History', icon: History },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'host', label: 'Host Control', icon: Terminal },
  { id: 'schedule', label: 'Schedule', icon: Clock },
  { id: 'safety', label: 'Safety', icon: Shield },
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
]

// ─── Agent types ──────────────────────────────────────────────────────

interface SavedAgent {
  id: string
  name: string
  emoji: string
  configId?: string
}

function loadAgents(): SavedAgent[] {
  try {
    const raw = localStorage.getItem('lodestone-agents')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // ignore
  }
  return []
}

function saveAgents(agents: SavedAgent[]) {
  try {
    localStorage.setItem('lodestone-agents', JSON.stringify(agents))
  } catch {
    // ignore
  }
}

// ─── Multi-Agent Switcher ─────────────────────────────────────────────

function AgentSwitcher({
  agentName,
  agentEmoji,
  agents,
  currentAgentId,
  onSelectAgent,
  onCreateAgent,
  onManageAgents,
  mood,
}: {
  agentName: string
  agentEmoji: string
  agents: SavedAgent[]
  currentAgentId: string
  onSelectAgent: (agent: SavedAgent) => void
  onCreateAgent: (name: string) => void
  onManageAgents: () => void
  mood: { emoji: string; label: string; color: string }
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setCreating(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEsc)
    }
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const handleCreate = () => {
    const name = newName.trim()
    if (name) {
      onCreateAgent(name)
      setNewName('')
      setCreating(false)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Current agent display (clickable) */}
      <button
        data-tour-agent-name
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-2 rounded-lg transition-all"
        style={{
          background: open ? 'var(--bg-elevated)' : 'transparent',
          border: '1px solid transparent',
          cursor: 'pointer',
        }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
          <span className="text-sm font-bold text-white">{agentEmoji || agentName?.[0]?.toUpperCase() || 'A'}</span>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{agentName || 'Agent'}</div>
            <span
              title={mood.label}
              style={{ fontSize: 12, lineHeight: 1, cursor: 'help' }}
            >
              {mood.emoji}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: mood.color }} />
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{mood.label}</span>
          </div>
        </div>
        <ChevronDown
          className="w-4 h-4 transition-transform"
          style={{
            color: 'var(--text-dim)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: 4,
            zIndex: 100,
          }}
        >
          {/* Agent list */}
          {!creating && agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                onSelectAgent(agent)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all"
              style={{
                background: agent.id === currentAgentId ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                border: 'none',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span className="text-base">{agent.emoji}</span>
              <span className="text-sm flex-1 truncate">{agent.name}</span>
              {agent.id === currentAgentId && (
                <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              )}
            </button>
          ))}

          {/* Create new agent form */}
          {creating && (
            <div style={{ padding: 6 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') {
                    setCreating(false)
                    setNewName('')
                  }
                }}
                placeholder="Agent name..."
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--accent)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <button
                  onClick={handleCreate}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setCreating(false)
                    setNewName('')
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Divider */}
          {!creating && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}

          {/* Actions */}
          {!creating && (
            <>
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-card)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <Plus className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                Create New Agent
              </button>
              <button
                onClick={() => {
                  onManageAgents()
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-card)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <Settings2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                Manage Agents
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────

export function Sidebar() {
  const { activeView, setActiveView, engineRunning, config, memoryCount, wikiCount, socketStatus, sending } = useStore()
  const [agents, setAgents] = useState<SavedAgent[]>([])
  const [currentAgentId, setCurrentAgentId] = useState('default')

  // Load agents from localStorage on mount
  useEffect(() => {
    const loaded = loadAgents()
    if (loaded.length === 0 && config?.agentName) {
      // Initialize with current agent
      const defaultAgent: SavedAgent = {
        id: 'default',
        name: config.agentName,
        emoji: config.agentEmoji || '🤖',
      }
      saveAgents([defaultAgent])
      setAgents([defaultAgent])
      setCurrentAgentId('default')
    } else {
      setAgents(loaded)
      // Find matching agent by name
      const match = loaded.find((a) => a.name === config?.agentName)
      if (match) setCurrentAgentId(match.id)
    }
  }, [config?.agentName, config?.agentEmoji])

  const handleOpenWorkspace = async () => {
    await window.lodestone.openInFinder()
  }

  const handleStopEngine = async () => {
    await window.lodestone.stopEngine()
    useStore.setState({ engineRunning: false })
  }

  const handleSelectAgent = useCallback((agent: SavedAgent) => {
    setCurrentAgentId(agent.id)
    // In a real app, this would switch configs. For now just update the ID.
  }, [])

  const handleCreateAgent = useCallback((name: string) => {
    const newAgent: SavedAgent = {
      id: crypto.randomUUID(),
      name,
      emoji: '🤖',
    }
    const updated = [...agents, newAgent]
    setAgents(updated)
    saveAgents(updated)
    setCurrentAgentId(newAgent.id)
  }, [agents])

  const handleManageAgents = useCallback(() => {
    setActiveView('identity')
  }, [setActiveView])

  const agentEmoji = config?.agentEmoji || agents.find((a) => a.id === currentAgentId)?.emoji || '🤖'
  const agentName = config?.agentName || agents.find((a) => a.id === currentAgentId)?.name || 'Agent'

  // Compute agent mood/state
  const agentMood = useMemo(() => {
    if (!engineRunning) return { emoji: '⚪', label: 'Idle', color: '#6B7280' }
    if (socketStatus === 'error') return { emoji: '🔴', label: 'Error', color: '#EF4444' }
    if (sending) return { emoji: '🟡', label: 'Thinking', color: '#F59E0B' }
    return { emoji: '🟢', label: 'Active', color: '#10B981' }
  }, [engineRunning, socketStatus, sending])

  return (
    <div className="w-60 flex flex-col h-full" style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}>
      {/* Agent header with switcher */}
      <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <AgentSwitcher
          agentName={agentName}
          agentEmoji={agentEmoji}
          agents={agents}
          currentAgentId={currentAgentId}
          onSelectAgent={handleSelectAgent}
          onCreateAgent={handleCreateAgent}
          onManageAgents={handleManageAgents}
          mood={agentMood}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              data-tour-nav-item={item.id}
              onClick={() => setActiveView(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-1"
              style={{
                background: active ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: active ? 500 : 400,
              }}
            >
              <Icon className="w-4 h-4" />
              {item.label}
              {item.id === 'memory' && (memoryCount > 0 || wikiCount > 0) && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                  {memoryCount + wikiCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={handleOpenWorkspace}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
          style={{ color: 'var(--text-muted)' }}
        >
          <FolderOpen className="w-4 h-4" />
          Open Workspace
        </button>
        {engineRunning && (
          <button
            onClick={handleStopEngine}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
            style={{ color: '#EF4444' }}
          >
            <Power className="w-4 h-4" />
            Stop Agent
          </button>
        )}
      </div>
    </div>
  )
}