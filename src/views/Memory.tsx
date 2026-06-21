import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { marked } from 'marked'
import {
  Brain, FileText, Search, Trash2, Clock, Gavel, Filter,
  ArrowUpDown, X, ExternalLink, Calendar, Tag, ChevronRight,
  TrendingUp, Database, Hash, Sparkles,
} from 'lucide-react'
import { useStore } from '../store'
import { KnowledgeBrowser } from '../components/KnowledgeBrowser'
import { MemoryCompactor } from '../components/MemoryCompactor'

// ─── Types ───────────────────────────────────────────────────────────

type MemoryCategory = 'fact' | 'preference' | 'decision' | 'entity'

interface MemoryItem {
  id: string
  text: string
  category: MemoryCategory
  importance: number
  created: string
  tags?: string[]
}

interface WikiPage {
  slug: string
  title: string
  tags: string[]
  updated: string
  created: string
  status: string
  content?: string
}

interface DecisionItem {
  id: string
  decision: string
  rationale: string
  date: string
  tags: string[]
  status: 'active' | 'superseded'
  context?: string
}

type TabType = 'memories' | 'wiki' | 'timeline' | 'decisions' | 'knowledge'
type SortType = 'recent' | 'oldest' | 'az' | 'relevance'
type FilterType = 'all' | MemoryCategory

// ─── Category Colors ─────────────────────────────────────────────────

const CATEGORY_COLORS: Record<MemoryCategory, { color: string; bg: string; dot: string; label: string }> = {
  fact:       { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', dot: '#3B82F6', label: 'Fact' },
  preference: { color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.12)', dot: '#A78BFA', label: 'Preference' },
  decision:   { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', dot: '#FBBF24', label: 'Decision' },
  entity:     { color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.12)', dot: '#22D3EE', label: 'Entity' },
}

const DECISION_BORDER: Record<string, string> = {
  active: '#10B981',
  superseded: '#F59E0B',
}

// ─── Mock Data ───────────────────────────────────────────────────────

const MOCK_MEMORIES: MemoryItem[] = [
  { id: 'm1', text: 'User prefers dark mode and violet accent colors in all interfaces.', category: 'preference', importance: 3, created: '2026-06-21T02:00:00Z', tags: ['ui', 'theme'] },
  { id: 'm2', text: 'Lodestone project started on June 13, 2026. Tech stack: TypeScript, LanceDB, Electron.', category: 'fact', importance: 2, created: '2026-06-13T10:00:00Z', tags: ['lodestone', 'project'] },
  { id: 'm3', text: 'ADR-002: Product name chosen as "Lodestone" 🔮.', category: 'decision', importance: 3, created: '2026-06-14T14:30:00Z', tags: ['adr', 'naming'] },
  { id: 'm4', text: 'Jay is the founder of Greyrock Studio and primary user.', category: 'entity', importance: 3, created: '2026-06-13T09:00:00Z', tags: ['people', 'greyrock'] },
  { id: 'm5', text: 'Agent should never enable firewall blockall — breaks SSH and Screen Sharing.', category: 'decision', importance: 3, created: '2026-06-15T08:00:00Z', tags: ['security', 'safety'] },
  { id: 'm6', text: 'Subagent context exhaustion pattern discovered on 2026-06-19. Mitigation: break tasks into smaller steps.', category: 'fact', importance: 2, created: '2026-06-19T20:00:00Z', tags: ['subagent', 'context'] },
  { id: 'm7', text: 'User prefers concise summaries over verbose explanations.', category: 'preference', importance: 2, created: '2026-06-18T12:00:00Z', tags: ['communication'] },
  { id: 'm8', text: 'LanceDB selected as the vector database for memory storage.', category: 'fact', importance: 2, created: '2026-06-13T11:00:00Z', tags: ['tech', 'database'] },
  { id: 'm9', text: 'Weekly security audit schedule established — re-run every Monday.', category: 'decision', importance: 2, created: '2026-06-16T09:00:00Z', tags: ['security', 'schedule'] },
  { id: 'm10', text: 'Greyrock Studio is a software studio focused on AI agent tooling.', category: 'entity', importance: 1, created: '2026-06-13T09:05:00Z', tags: ['organization'] },
]

const MOCK_WIKI: WikiPage[] = [
  { slug: 'lodestone-overview', title: 'Lodestone Overview', tags: ['project', 'architecture'], updated: '2026-06-20T15:00:00Z', created: '2026-06-13T10:00:00Z', status: 'active',
    content: '# Lodestone Overview\n\nLodestone is a standalone agent engine that transforms any LLM into a self-improving agent.\n\n## Architecture\n\nThree layers:\n\n1. **Identity** — User-provided agent personality\n2. **Engine** — Memory + self-improvement + proactivity + skills\n3. **Runtime** — LLM orchestration + tool execution + streaming\n\n## Tech Stack\n\n- TypeScript\n- LanceDB\n- Electron\n- React + Vite\n\n## Milestones\n\n- Milestone 1: Docker Compose boots agent within 5 min\n- Milestone 2: Desktop Electron app\n\nSee [[architecture]] for details.' },
  { slug: 'memory-system', title: 'Memory System', tags: ['memory', 'architecture'], updated: '2026-06-19T18:00:00Z', created: '2026-06-13T12:00:00Z', status: 'active',
    content: '# Memory System\n\nThe memory system uses LanceDB for vector storage with markdown wiki pages for curated knowledge.\n\n## Categories\n\n- **fact** — Observed information\n- **preference** — User preferences\n- **decision** — Choices made with rationale\n- **entity** — People, companies, tools\n\n## Workflow\n\n1. Agent observes → stores raw memory\n2. Nightly consolidation → wiki pages\n3. Wiki cross-links build knowledge graph\n\nSee [[lodestone-overview]] for context.' },
  { slug: 'safety-rules', title: 'Safety Rules', tags: ['security', 'safety'], updated: '2026-06-16T09:00:00Z', created: '2026-06-15T08:00:00Z', status: 'active',
    content: '# Safety Rules\n\n## Red Lines\n\n- Never write secrets to logged surfaces\n- Never enable firewall blockall\n- `trash` > `rm`\n- Ask before external actions\n\n## Standing Rules\n\n1. Never echo tokens\n2. Alert on unexpected pairing requests\n3. Weekly security audit\n\n## Escalation\n\nMoney, reputation, or irreversible actions → ask Jay.' },
]

const MOCK_DECISIONS: DecisionItem[] = [
  { id: 'd1', decision: 'Use standalone runtime from day 1 (ADR-001)', rationale: 'Embedding in OpenClaw would create tight coupling and limit portability. Standalone allows independent evolution.', date: '2026-06-13T10:00:00Z', tags: ['architecture', 'adr'], status: 'active' },
  { id: 'd2', decision: 'Product name: Lodestone 🔮 (ADR-002)', rationale: 'Lodestone evokes navigation, magnetism, and attraction — fitting for an agent that guides and self-improves.', date: '2026-06-14T14:30:00Z', tags: ['naming', 'branding'], status: 'active' },
  { id: 'd3', decision: 'LanceDB as vector database', rationale: 'Embedded, no server needed, good TypeScript support, works in Electron context.', date: '2026-06-13T11:00:00Z', tags: ['tech', 'database'], status: 'active' },
  { id: 'd4', decision: 'Node-cron for scheduling instead of custom scheduler', rationale: 'Mature, well-tested, handles edge cases. Custom schedulers are a maintenance burden.', date: '2026-06-15T10:00:00Z', tags: ['scheduling'], status: 'superseded' },
  { id: 'd5', decision: 'Never enable firewall blockall or stealth mode', rationale: 'Breaks VS Code SSH and Screen Sharing. Recovery requires physical access.', date: '2026-06-15T08:00:00Z', tags: ['security', 'safety'], status: 'active' },
]

// ─── Main Component ──────────────────────────────────────────────────

export function Memory() {
  const { setMemoryStats } = useStore()
  const [tab, setTab] = useState<TabType>('memories')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('recent')
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([])
  const [decisions, setDecisions] = useState<DecisionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWiki, setSelectedWiki] = useState<WikiPage | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadMemories(), loadWiki(), loadDecisions()])
    setLoading(false)
  }

  const loadMemories = async () => {
    try {
      const api = window.lodestone as any
      if (api?.memoryList) {
        const data = await api.memoryList()
        setMemories(data || [])
      } else {
        setMemories(MOCK_MEMORIES)
      }
    } catch {
      setMemories(MOCK_MEMORIES)
    }
  }

  const loadWiki = async () => {
    try {
      const response = await fetch(`http://localhost:${useStore.getState().enginePort}/api/wiki/pages`)
      if (response.ok) {
        const data = await response.json()
        setWikiPages(data.pages || [])
      } else {
        setWikiPages(MOCK_WIKI)
      }
    } catch {
      setWikiPages(MOCK_WIKI)
    }
  }

  const loadDecisions = async () => {
    try {
      const api = window.lodestone as any
      if (api?.decisionList) {
        const data = await api.decisionList()
        setDecisions(data || [])
      } else {
        setDecisions(MOCK_DECISIONS)
      }
    } catch {
      setDecisions(MOCK_DECISIONS)
    }
  }

  // Update store stats when data changes
  useEffect(() => {
    setMemoryStats(memories.length, wikiPages.length)
  }, [memories.length, wikiPages.length, setMemoryStats])

  // ── Filtered + sorted memories ──
  const filteredMemories = useMemo(() => {
    let result = [...memories]
    if (filter !== 'all') {
      result = result.filter(m => m.category === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(m =>
        m.text.toLowerCase().includes(q) ||
        m.tags?.some(t => t.toLowerCase().includes(q))
      )
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'recent': return new Date(b.created).getTime() - new Date(a.created).getTime()
        case 'oldest': return new Date(a.created).getTime() - new Date(b.created).getTime()
        case 'az': return a.text.localeCompare(b.text)
        case 'relevance': {
          if (!search.trim()) return new Date(b.created).getTime() - new Date(a.created).getTime()
          const q = search.toLowerCase()
          const score = (m: MemoryItem) => {
            let s = 0
            if (m.text.toLowerCase().includes(q)) s += 3
            if (m.tags?.some(t => t.toLowerCase().includes(q))) s += 2
            if (m.text.toLowerCase().startsWith(q)) s += 1
            return s
          }
          return score(b) - score(a)
        }
      }
    })
    return result
  }, [memories, filter, search, sortBy])

  // ── Filtered wiki pages ──
  const filteredWiki = useMemo(() => {
    let result = [...wikiPages]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.tags?.some(t => t.toLowerCase().includes(q))
      )
    }
    result.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    return result
  }, [wikiPages, search])

  // ── Stats computation ──
  const stats = useMemo(() => {
    const byType: Record<MemoryCategory, number> = { fact: 0, preference: 0, decision: 0, entity: 0 }
    memories.forEach(m => {
      if (m.category in byType) byType[m.category]++
    })
    const lastCreated = memories.length > 0
      ? memories.reduce((latest, m) =>
          new Date(m.created) > new Date(latest) ? m.created : latest, memories[0].created)
      : null
    const sizeEstKB = Math.round(JSON.stringify(memories).length / 1024)
    return { total: memories.length, byType, lastCreated, sizeEstKB }
  }, [memories])

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Memory</h2>
        </div>

        {/* Stats Bar */}
        <StatsBar stats={stats} decisionsCount={decisions.length} wikiCount={wikiPages.length} />

        {/* Tabs */}
        <div className="flex gap-1 mb-3 mt-3 flex-wrap">
          <TabButton active={tab === 'memories'} onClick={() => setTab('memories')} label={`Memories (${memories.length})`} />
          <TabButton active={tab === 'wiki'} onClick={() => setTab('wiki')} label={`Wiki (${wikiPages.length})`} />
          <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')} label="Timeline" icon={Clock} />
          <TabButton active={tab === 'decisions'} onClick={() => setTab('decisions')} label={`Decisions (${decisions.length})`} icon={Gavel} />
          <TabButton active={tab === 'knowledge'} onClick={() => setTab('knowledge')} label="Knowledge" icon={FileText} />
        </div>

        {/* Search + Filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories, wiki, decisions..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {/* Filter buttons + Sort dropdown */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
              {(['all', 'fact', 'preference', 'decision', 'entity'] as FilterType[]).map(f => (
                <FilterButton
                  key={f}
                  active={filter === f}
                  onClick={() => setFilter(f)}
                  label={f === 'all' ? 'All' : CATEGORY_COLORS[f].label}
                  color={f === 'all' ? undefined : CATEGORY_COLORS[f].color}
                />
              ))}
            </div>
            <SortDropdown value={sortBy} onChange={setSortBy} />
          </div>
        </div>
      </div>

      {/* Memory Compactor Card */}
      <div className="px-4 pt-4">
        <MemoryCompactor />
      </div>

      {/* ─── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Loading...
            </motion.div>
          ) : tab === 'memories' ? (
            <motion.div key="memories" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {filteredMemories.length === 0 ? (
                <EmptyState icon={Brain} title="No memories found" desc="Try adjusting your search or filters." />
              ) : (
                <div className="space-y-2">
                  {filteredMemories.map((m, i) => (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: i * 0.02 }}>
                      <MemoryCard memory={m} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : tab === 'wiki' ? (
            <motion.div key="wiki" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {selectedWiki ? (
                <WikiViewer page={selectedWiki} onClose={() => setSelectedWiki(null)} />
              ) : filteredWiki.length === 0 ? (
                <EmptyState icon={FileText} title="No wiki pages found" desc="Your agent will create wiki pages as it learns." />
              ) : (
                <div className="space-y-2">
                  {filteredWiki.map((p, i) => (
                    <motion.div key={p.slug} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: i * 0.03 }}>
                      <WikiCard page={p} onClick={() => setSelectedWiki(p)} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : tab === 'timeline' ? (
            <motion.div key="timeline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <MemoryTimeline memories={filteredMemories} />
            </motion.div>
          ) : tab === 'knowledge' ? (
            <motion.div key="knowledge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="h-full">
              <KnowledgeBrowser />
            </motion.div>
          ) : (
            <motion.div key="decisions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <DecisionView decisions={decisions} search={search} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Stats Bar ───────────────────────────────────────────────────────

function StatsBar({ stats, decisionsCount, wikiCount }: {
  stats: { total: number; byType: Record<MemoryCategory, number>; lastCreated: string | null; sizeEstKB: number }
  decisionsCount: number
  wikiCount: number
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Total memories */}
      <StatChip icon={Database} label="Total" value={stats.total} color="#8B5CF6" />
      {/* By type mini bars */}
      <div className="flex items-center gap-1.5">
        {(Object.entries(stats.byType) as [MemoryCategory, number][]).map(([cat, count]) => {
          const c = CATEGORY_COLORS[cat]
          const max = Math.max(...Object.values(stats.byType), 1)
          const pct = (count / max) * 100
          return (
            <div key={cat} className="flex items-center gap-1.5" title={`${c.label}: ${count}`}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: c.bg }}>
                <div className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold" style={{ color: c.color }}>{count}</span>
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c.dot }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* Last created */}
      <StatChip icon={Clock} label="Last" value={stats.lastCreated ? formatRelative(stats.lastCreated) : '—'} color="#10B981" />
      {/* Storage */}
      <StatChip icon={Hash} label="Size" value={`${stats.sizeEstKB} KB`} color="#06B6D4" />
      {/* Wiki count */}
      <StatChip icon={FileText} label="Wiki" value={wikiCount} color="#F59E0B" />
      {/* Decisions */}
      <StatChip icon={Gavel} label="Decisions" value={decisionsCount} color="#6366F1" />
    </div>
  )
}

function StatChip({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
      <Icon className="w-3 h-3" style={{ color }} />
      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span className="text-xs font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

// ─── Filter Button ──────────────────────────────────────────────────

function FilterButton({ active, onClick, label, color }: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-xs transition-all"
      style={{
        background: active ? (color ? `${color}1A` : 'rgba(139, 92, 246, 0.1)') : 'transparent',
        color: active ? (color || 'var(--accent)') : 'var(--text-muted)',
        border: `1px solid ${active ? (color ? `${color}40` : 'rgba(139, 92, 246, 0.3)') : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  )
}

// ─── Sort Dropdown ───────────────────────────────────────────────────

function SortDropdown({ value, onChange }: { value: SortType; onChange: (v: SortType) => void }) {
  const [open, setOpen] = useState(false)
  const options: { value: SortType; label: string }[] = [
    { value: 'recent', label: 'Recent' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'az', label: 'A-Z' },
    { value: 'relevance', label: 'Relevance' },
  ]
  const current = options.find(o => o.value === value)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
        style={{
          background: 'var(--bg-elevated)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}
      >
        <ArrowUpDown className="w-3 h-3" />
        {current?.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden min-w-[120px]"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
          >
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-elevated)] transition-colors"
                style={{
                  color: opt.value === value ? 'var(--accent)' : 'var(--text)',
                  background: opt.value === value ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                }}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        </>
      )}
    </div>
  )
}

// ─── Memory Card ─────────────────────────────────────────────────────

function MemoryCard({ memory }: { memory: MemoryItem }) {
  const c = CATEGORY_COLORS[memory.category] || CATEGORY_COLORS.fact
  return (
    <div className="card p-3 transition-all hover:border-violet-500/20" style={{ borderLeft: `3px solid ${c.dot}` }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.color }}>
          {c.label}
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i <= memory.importance ? c.dot : 'var(--border)' }} />
          ))}
        </div>
      </div>
      <p className="text-sm">{memory.text}</p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{new Date(memory.created).toLocaleDateString()}</span>
        {memory.tags && memory.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {memory.tags.map(t => (
              <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Wiki Card ───────────────────────────────────────────────────────

function WikiCard({ page, onClick }: { page: WikiPage; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="card p-3 hover:border-violet-500/30 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{page.title}</span>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatRelative(page.updated)}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {page.tags.map(t => (
          <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: '#A78BFA' }}>
            #{t}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
        <ChevronRight className="w-3 h-3" />
        Click to read
      </div>
    </div>
  )
}

// ─── Wiki Viewer ─────────────────────────────────────────────────────

function WikiViewer({ page, onClose }: { page: WikiPage; onClose: () => void }) {
  const html = useMemo(() => {
    const content = page.content || 'No content available for this page.'
    return marked.parse(content) as string
  }, [page.content])

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
      className="card p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{page.title}</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-elevated)]"
          style={{ color: 'var(--text-dim)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 mb-4 flex-wrap text-xs">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-dim)' }}>
          <Calendar className="w-3 h-3" />
          Created: {new Date(page.created).toLocaleDateString()}
        </div>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-dim)' }}>
          <Clock className="w-3 h-3" />
          Updated: {new Date(page.updated).toLocaleDateString()}
        </div>
        {page.status && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: page.status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: page.status === 'active' ? '#10B981' : '#F59E0B',
            }}>
            {page.status}
          </span>
        )}
      </div>

      {/* Tags */}
      {page.tags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <Tag className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
          {page.tags.map(t => (
            <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#A78BFA' }}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div
        className="prose-chat text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => console.log('[Lodestone] Open in editor:', page.slug)}
          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in editor
        </button>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>slug: {page.slug}</span>
      </div>
    </motion.div>
  )
}

// ─── Memory Timeline ────────────────────────────────────────────────

function MemoryTimeline({ memories }: { memories: MemoryItem[] }) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (memories.length === 0) {
    return <EmptyState icon={Clock} title="No timeline data" desc="Memories will appear here chronologically." />
  }

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, MemoryItem[]>()
    const sorted = [...memories].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    for (const m of sorted) {
      const dateKey = new Date(m.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(m)
    }
    return Array.from(map.entries())
  }, [memories])

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div
        className="absolute left-2 top-2 bottom-2 w-0.5"
        style={{ background: 'var(--border)' }}
      />

      {grouped.map(([dateLabel, items], groupIdx) => (
        <motion.div
          key={dateLabel}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: groupIdx * 0.1 }}
          className="mb-6"
        >
          {/* Date label */}
          <div className="flex items-center gap-2 mb-3 relative">
            <div
              className="absolute -left-[20px] w-3 h-3 rounded-full border-2"
              style={{
                background: 'var(--bg)',
                borderColor: 'var(--accent)',
                boxShadow: '0 0 8px rgba(139, 92, 246, 0.3)',
              }}
            />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
              {dateLabel}
            </span>
          </div>

          {/* Memory items */}
          <div className="space-y-2">
            {items.map((m, i) => {
              const c = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.fact
              const isHovered = hovered === m.id
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: groupIdx * 0.1 + i * 0.03 }}
                  onMouseEnter={() => setHovered(m.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="relative"
                >
                  {/* Dot */}
                  <div
                    className="absolute -left-[20px] top-3 w-2.5 h-2.5 rounded-full border-2 transition-all"
                    style={{
                      background: c.dot,
                      borderColor: 'var(--bg)',
                      transform: isHovered ? 'scale(1.4)' : 'scale(1)',
                      boxShadow: isHovered ? `0 0 10px ${c.color}80` : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  />

                  {/* Card */}
                  <div
                    className="card p-2.5 transition-all"
                    style={{
                      borderLeft: `3px solid ${c.dot}`,
                      opacity: isHovered ? 1 : 0.85,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.color }}>
                        {c.label}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        {new Date(m.created).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <AnimatePresence>
                      {isHovered && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="text-sm overflow-hidden"
                        >
                          {m.text}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    {!isHovered && (
                      <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
                        {m.text}
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Decision View ───────────────────────────────────────────────────

function DecisionView({ decisions, search }: { decisions: DecisionItem[]; search: string }) {
  const filtered = useMemo(() => {
    let result = [...decisions]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        d.decision.toLowerCase().includes(q) ||
        d.rationale.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return result
  }, [decisions, search])

  if (filtered.length === 0) {
    return <EmptyState icon={Gavel} title="No decisions found" desc="Decisions made by your agent will appear here." />
  }

  return (
    <div className="space-y-2">
      {filtered.map((d, i) => {
        const borderColor = DECISION_BORDER[d.status] || DECISION_BORDER.active
        return (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            className="card p-3"
            style={{ borderLeft: `3px solid ${borderColor}` }}
          >
            {/* Decision text */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-semibold flex-1">{d.decision}</p>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                style={{
                  background: d.status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  color: borderColor,
                }}
              >
                {d.status}
              </span>
            </div>

            {/* Rationale */}
            <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-muted)' }}>
              {d.rationale}
            </p>

            {/* Footer: date + tags */}
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {new Date(d.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              {d.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {d.tags.map(t => (
                    <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── Tab Button ──────────────────────────────────────────────────────

function TabButton({ active, onClick, label, icon: Icon }: {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
      style={{
        background: active ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        border: `1px solid ${active ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
      }}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, desc }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  title: string
  desc: string
}) {
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

// ─── Helpers ─────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = diff / 60000
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.round(mins)}m ago`
  const hours = mins / 60
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = hours / 24
  if (days < 7) return `${Math.round(days)}d ago`
  return new Date(dateStr).toLocaleDateString()
}