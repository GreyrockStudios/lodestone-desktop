import { useState, useMemo } from 'react'
import {
  Brain, FileText, Gavel, Wrench, ChevronDown, ChevronRight,
  Search, BookOpen, X, Tag, Calendar, Lightbulb, Cpu, Clock,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ───────────────────────────────────────────────────────────

type NodeType = 'category' | 'item'

interface TreeNode {
  id: string
  label: string
  type: NodeType
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  category?: KnowledgeCategory
  children?: TreeNode[]
  preview?: KnowledgePreview
}

type KnowledgeCategory = 'Memories' | 'Wiki Pages' | 'Decisions' | 'Skills'

interface KnowledgePreview {
  title: string
  content: string
  tags?: string[]
  date?: string
  meta?: { label: string; value: string }[]
}

// ─── Mock Data ───────────────────────────────────────────────────────

const MOCK_TREE: TreeNode[] = [
  {
    id: 'memories',
    label: 'Memories',
    type: 'category',
    icon: Brain,
    category: 'Memories',
    children: [
      {
        id: 'mem-pref',
        label: 'Preferences (3)',
        type: 'category',
        children: [
          {
            id: 'mem-1',
            label: 'Dark mode preference',
            type: 'item',
            preview: {
              title: 'Dark mode preference',
              content: 'User prefers dark mode and violet accent colors in all interfaces.',
              tags: ['ui', 'theme'],
              date: '2026-06-21T02:00:00Z',
              meta: [{ label: 'Category', value: 'preference' }, { label: 'Importance', value: '3/3' }],
            },
          },
          {
            id: 'mem-2',
            label: 'Concise summaries',
            type: 'item',
            preview: {
              title: 'Concise communication',
              content: 'User prefers concise summaries over verbose explanations.',
              tags: ['communication'],
              date: '2026-06-18T12:00:00Z',
              meta: [{ label: 'Category', value: 'preference' }, { label: 'Importance', value: '2/3' }],
            },
          },
        ],
      },
      {
        id: 'mem-fact',
        label: 'Facts (4)',
        type: 'category',
        children: [
          {
            id: 'mem-3',
            label: 'Lodestone project info',
            type: 'item',
            preview: {
              title: 'Lodestone Project',
              content: 'Lodestone project started on June 13, 2026. Tech stack: TypeScript, LanceDB, Electron. Milestone 1 complete, moving to M2+M3+M4.',
              tags: ['lodestone', 'project'],
              date: '2026-06-13T10:00:00Z',
              meta: [{ label: 'Category', value: 'fact' }, { label: 'Importance', value: '2/3' }],
            },
          },
          {
            id: 'mem-4',
            label: 'Subagent context pattern',
            type: 'item',
            preview: {
              title: 'Subagent Context Exhaustion',
              content: 'Subagent context exhaustion pattern discovered on 2026-06-19. 3 of 4 subagents failed due to context limits. Mitigation: break tasks into smaller steps, increase timeout proportional to context usage.',
              tags: ['subagent', 'context'],
              date: '2026-06-19T20:00:00Z',
              meta: [{ label: 'Category', value: 'fact' }, { label: 'Importance', value: '2/3' }],
            },
          },
        ],
      },
      {
        id: 'mem-ent',
        label: 'Entities (2)',
        type: 'category',
        children: [
          {
            id: 'mem-5',
            label: 'Jay / Greyrock Studio',
            type: 'item',
            preview: {
              title: 'Jay — Greyrock Studio',
              content: 'Jay is the founder of Greyrock Studio and primary user. Greyrock Studio is a software studio focused on AI agent tooling.',
              tags: ['people', 'greyrock'],
              date: '2026-06-13T09:00:00Z',
              meta: [{ label: 'Category', value: 'entity' }, { label: 'Importance', value: '3/3' }],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'wiki',
    label: 'Wiki Pages',
    type: 'category',
    icon: FileText,
    category: 'Wiki Pages',
    children: [
      {
        id: 'wiki-1',
        label: 'Lodestone Overview',
        type: 'item',
        preview: {
          title: 'Lodestone Overview',
          content: 'Lodestone is a standalone agent engine that transforms any LLM into a self-improving agent. Three layers: Identity (user-provided), Engine (memory + self-improvement + proactivity + skills), Runtime (LLM orchestration + tool execution + streaming).',
          tags: ['project', 'architecture'],
          date: '2026-06-20T15:00:00Z',
          meta: [{ label: 'Status', value: 'active' }, { label: 'Slug', value: 'lodestone-overview' }],
        },
      },
      {
        id: 'wiki-2',
        label: 'Memory System',
        type: 'item',
        preview: {
          title: 'Memory System',
          content: 'The memory system uses LanceDB for vector storage with markdown wiki pages for curated knowledge. Categories: fact, preference, decision, entity. Workflow: observe → store raw → nightly consolidation → wiki pages.',
          tags: ['memory', 'architecture'],
          date: '2026-06-19T18:00:00Z',
          meta: [{ label: 'Status', value: 'active' }, { label: 'Slug', value: 'memory-system' }],
        },
      },
      {
        id: 'wiki-3',
        label: 'Safety Rules',
        type: 'item',
        preview: {
          title: 'Safety Rules',
          content: 'Red lines: Never write secrets to logged surfaces. Never enable firewall blockall. trash > rm. Ask before external actions. Standing rules: never echo tokens, alert on unexpected pairing, weekly security audit.',
          tags: ['security', 'safety'],
          date: '2026-06-16T09:00:00Z',
          meta: [{ label: 'Status', value: 'active' }, { label: 'Slug', value: 'safety-rules' }],
        },
      },
    ],
  },
  {
    id: 'decisions',
    label: 'Decisions',
    type: 'category',
    icon: Gavel,
    category: 'Decisions',
    children: [
      {
        id: 'dec-1',
        label: 'ADR-001: Standalone runtime',
        type: 'item',
        preview: {
          title: 'ADR-001: Standalone Runtime',
          content: 'Decision: Use standalone runtime from day 1. Rationale: Embedding in OpenClaw would create tight coupling and limit portability. Standalone allows independent evolution.',
          tags: ['architecture', 'adr'],
          date: '2026-06-13T10:00:00Z',
          meta: [{ label: 'Status', value: 'active' }],
        },
      },
      {
        id: 'dec-2',
        label: 'ADR-002: Name "Lodestone"',
        type: 'item',
        preview: {
          title: 'ADR-002: Product Name "Lodestone"',
          content: 'Decision: Product name chosen as "Lodestone" 🔮. Rationale: Lodestone evokes navigation, magnetism, and attraction — fitting for an agent that guides and self-improves.',
          tags: ['naming', 'branding'],
          date: '2026-06-14T14:30:00Z',
          meta: [{ label: 'Status', value: 'active' }],
        },
      },
      {
        id: 'dec-3',
        label: 'LanceDB as vector DB',
        type: 'item',
        preview: {
          title: 'LanceDB as Vector Database',
          content: 'Decision: Use LanceDB as the vector database. Rationale: Embedded, no server needed, good TypeScript support, works in Electron context.',
          tags: ['tech', 'database'],
          date: '2026-06-13T11:00:00Z',
          meta: [{ label: 'Status', value: 'active' }],
        },
      },
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    type: 'category',
    icon: Wrench,
    category: 'Skills',
    children: [
      {
        id: 'skill-1',
        label: 'Memory Management',
        type: 'item',
        preview: {
          title: 'Memory Management Skill',
          content: 'Handles storing, retrieving, and consolidating memories. Includes episodic memory, semantic memory, and nightly wiki consolidation. Manages LanceDB vector storage.',
          tags: ['memory', 'core'],
          meta: [{ label: 'Version', value: '1.0.0' }, { label: 'Status', value: 'enabled' }],
        },
      },
      {
        id: 'skill-2',
        label: 'Self-Improvement',
        type: 'item',
        preview: {
          title: 'Self-Improvement Skill',
          content: 'Predicts outcomes, journals predictions, detects drift between expected and actual results, and evolves skill parameters. Runs nightly consolidation cycle.',
          tags: ['meta', 'improvement'],
          meta: [{ label: 'Version', value: '0.8.0' }, { label: 'Status', value: 'beta' }],
        },
      },
      {
        id: 'skill-3',
        label: 'Proactive Scheduling',
        type: 'item',
        preview: {
          title: 'Proactive Scheduling Skill',
          content: 'Uses node-cron for recurring tasks. Manages heartbeat checks, security audits, wiki linting, and inbox processing. Schedules are configurable per-agent.',
          tags: ['scheduling', 'cron'],
          meta: [{ label: 'Version', value: '1.0.0' }, { label: 'Status', value: 'enabled' }],
        },
      },
    ],
  },
]

// ─── Category Icons ───────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Memories: Brain,
  'Wiki Pages': FileText,
  Decisions: Gavel,
  Skills: Wrench,
}

const CATEGORY_COLORS: Record<string, string> = {
  Memories: '#8B5CF6',
  'Wiki Pages': '#F59E0B',
  Decisions: '#6366F1',
  Skills: '#06B6D4',
}

// ─── Component ───────────────────────────────────────────────────────

export function KnowledgeBrowser() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['memories']))
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [search, setSearch] = useState('')

  // Flatten all items for search
  const allItems = useMemo(() => {
    const items: { node: TreeNode; path: string }[] = []
    for (const cat of MOCK_TREE) {
      for (const child of cat.children || []) {
        if (child.type === 'item') {
          items.push({ node: child, path: cat.label })
        } else {
          for (const grandchild of child.children || []) {
            if (grandchild.type === 'item') {
              items.push({ node: grandchild, path: `${cat.label} > ${child.label}` })
            }
          }
        }
      }
    }
    return items
  }, [])

  const searchResults = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return allItems.filter(({ node }) =>
      node.label.toLowerCase().includes(q) ||
      node.preview?.content.toLowerCase().includes(q) ||
      node.preview?.tags?.some(t => t.toLowerCase().includes(q))
    )
  }, [search, allItems])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      {/* Tree Panel */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Search */}
        <div className="relative mb-3 sticky top-0 p-3" style={{ background: 'var(--bg)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search knowledge base..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        </div>

        {searchResults ? (
          /* Search results */
          <div className="px-3 pb-3 space-y-1">
            <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>
            {searchResults.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No results found</p>
              </div>
            ) : (
              searchResults.map(({ node, path }) => (
                <button
                  key={node.id}
                  onClick={() => setSelected(node)}
                  className="w-full text-left p-2 rounded-lg transition-all"
                  style={{
                    background: selected?.id === node.id ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-card)',
                    border: `1px solid ${selected?.id === node.id ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{node.label}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{path}</p>
                </button>
              ))
            )}
          </div>
        ) : (
          /* Tree view */
          <div className="px-3 pb-3">
            {MOCK_TREE.map(node => (
              <TreeCategory
                key={node.id}
                node={node}
                expanded={expanded}
                onToggle={toggleExpand}
                onSelect={setSelected}
                selectedId={selected?.id}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Panel */}
      {selected && selected.preview && (
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 20, opacity: 0 }}
          className="w-80 border-l flex flex-col overflow-hidden flex-shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        >
          {/* Preview header */}
          <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Preview</span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-dim)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview content */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {selected.preview.title}
            </h3>

            {/* Tags */}
            {selected.preview.tags && selected.preview.tags.length > 0 && (
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <Tag className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                {selected.preview.tags.map(t => (
                  <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#A78BFA' }}>
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Content */}
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
              {selected.preview.content}
            </p>

            {/* Meta */}
            {selected.preview.meta && selected.preview.meta.length > 0 && (
              <div className="space-y-1.5 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                {selected.preview.meta.map(m => (
                  <div key={m.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{m.label}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{m.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Date */}
            {selected.preview.date && (
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <Calendar className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {new Date(selected.preview.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Tree Category (recursive) ──────────────────────────────────────

function TreeCategory({
  node,
  expanded,
  onToggle,
  onSelect,
  selectedId,
  depth,
}: {
  node: TreeNode
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (node: TreeNode) => void
  selectedId?: string
  depth: number
}) {
  const isOpen = expanded.has(node.id)
  const isItem = node.type === 'item'
  const Icon = node.icon || (isItem ? ChevronRight : null)
  const color = node.category ? CATEGORY_COLORS[node.category] : undefined

  return (
    <div>
      <button
        onClick={() => isItem ? onSelect(node) : onToggle(node.id)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-all text-left"
        style={{
          background: selectedId === node.id ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
          color: selectedId === node.id ? 'var(--accent)' : 'var(--text)',
          paddingLeft: `${8 + depth * 16}px`,
        }}
      >
        {/* Expand/collapse */}
        {!isItem && (
          <span style={{ color: 'var(--text-dim)', width: 12, flexShrink: 0 }}>
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        )}
        {/* Icon */}
        {Icon && !isItem && (
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: color || 'var(--text-muted)' }} />
        )}
        {/* Label */}
        <span className="text-sm truncate" style={{ fontWeight: isItem ? 400 : 500 }}>
          {node.label}
        </span>
        {/* Count badge for categories */}
        {!isItem && node.children && (
          <span className="text-xs px-1.5 py-0.5 rounded-full ml-auto" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
            {node.children.length}
          </span>
        )}
      </button>

      {/* Children */}
      <AnimatePresence>
        {isOpen && node.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {node.children.map(child => (
              <TreeCategory
                key={child.id}
                node={child}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                selectedId={selectedId}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export type { KnowledgeCategory }