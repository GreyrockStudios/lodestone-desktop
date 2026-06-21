import { MessageSquare, Brain, Wrench, Clock, User, Settings, FolderOpen, Power } from 'lucide-react'
import { useStore } from '../store'

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'schedule', label: 'Schedule', icon: Clock },
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const { activeView, setActiveView, engineRunning, config, memoryCount, wikiCount } = useStore()

  const handleOpenWorkspace = async () => {
    await window.lodestone.openInFinder()
  }

  const handleStopEngine = async () => {
    await window.lodestone.stopEngine()
    useStore.setState({ engineRunning: false })
  }

  return (
    <div className="w-60 flex flex-col h-full" style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}>
      {/* Agent header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
            <span className="text-sm font-bold text-white">{config?.agentName?.[0]?.toUpperCase() || 'A'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{config?.agentName || 'Agent'}</div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: engineRunning ? '#10B981' : '#6B7280' }} />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{engineRunning ? 'Running' : 'Stopped'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
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