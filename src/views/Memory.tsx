import { useState, useEffect } from 'react'
import { Brain, FileText, Search, Trash2 } from 'lucide-react'
import { useStore } from '../store'

interface MemoryItem {
  id: string
  text: string
  category: string
  importance: number
  created: string
}

interface WikiPage {
  slug: string
  title: string
  tags: string[]
  updated: string
  status: string
}

export function Memory() {
  const { setMemoryStats } = useStore()
  const [tab, setTab] = useState<'memories' | 'wiki'>('memories')
  const [search, setSearch] = useState('')
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMemories()
    loadWiki()
  }, [])

  const loadMemories = async () => {
    setLoading(true)
    try {
      // Read memory store from workspace
      const workspacePath = await window.lodestone.workspacePath()
      const response = await fetch(`http://localhost:${useStore.getState().enginePort}/api/memories?q=${search}`)
      if (response.ok) {
        const data = await response.json()
        setMemories(data.memories || [])
        setMemoryStats(data.memories?.length || 0, wikiPages.length)
      }
    } catch {
      // Fallback: read from file
      setMemories([])
    }
    setLoading(false)
  }

  const loadWiki = async () => {
    try {
      const response = await fetch(`http://localhost:${useStore.getState().enginePort}/api/wiki/pages`)
      if (response.ok) {
        const data = await response.json()
        setWikiPages(data.pages || [])
        setMemoryStats(memories.length, data.pages?.length || 0)
      }
    } catch {
      setWikiPages([])
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Memory</h2>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          <TabButton active={tab === 'memories'} onClick={() => setTab('memories')} label={`Memories (${memories.length})`} />
          <TabButton active={tab === 'wiki'} onClick={() => setTab('wiki')} label={`Wiki (${wikiPages.length})`} />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadMemories()}
            placeholder="Search memories..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        ) : tab === 'memories' ? (
          memories.length === 0 ? (
            <EmptyState icon={Brain} title="No memories yet" desc="Your agent will store memories as you chat with it." />
          ) : (
            <div className="space-y-2">
              {memories.map(m => <MemoryCard key={m.id} memory={m} />)}
            </div>
          )
        ) : (
          wikiPages.length === 0 ? (
            <EmptyState icon={FileText} title="No wiki pages yet" desc="Your agent will create wiki pages as it learns." />
          ) : (
            <div className="space-y-2">
              {wikiPages.map(p => <WikiCard key={p.slug} page={p} />)}
            </div>
          )
        )}
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

function MemoryCard({ memory }: { memory: MemoryItem }) {
  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          {memory.category}
        </span>
        <div className="flex items-center gap-1">
          {[1,2,3].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i <= memory.importance ? '#8B5CF6' : 'var(--border)' }} />
          ))}
        </div>
      </div>
      <p className="text-sm">{memory.text}</p>
      <span className="text-xs mt-1 block" style={{ color: 'var(--text-dim)' }}>{new Date(memory.created).toLocaleDateString()}</span>
    </div>
  )
}

function WikiCard({ page }: { page: WikiPage }) {
  return (
    <div className="card p-3 hover:border-violet-500/30 transition-all cursor-pointer">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{page.title}</span>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{new Date(page.updated).toLocaleDateString()}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {page.tags.map(t => (
          <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: '#A78BFA' }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <Icon className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
        <h3 className="text-sm font-medium mb-1">{title}</h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</p>
      </div>
    </div>
  )
}