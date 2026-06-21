import { useState, useMemo } from 'react'
import {
  MessageSquare,
  Wrench,
  Brain,
  FileText,
  Shield,
  GitCommit,
  Calendar,
} from 'lucide-react'

interface JournalEntry {
  id: string
  timestamp: number
  type: 'conversation' | 'tool' | 'memory' | 'wiki' | 'decision' | 'safety'
  description: string
  detail?: string
}

const MOCK_ENTRIES: JournalEntry[] = [
  // 2 days ago
  { id: 'j-1', timestamp: Date.now() - 86400000 * 2 - 3600000 * 8, type: 'conversation', description: 'Started new conversation', detail: 'Topic: Knowledge base architecture review' },
  { id: 'j-2', timestamp: Date.now() - 86400000 * 2 - 3600000 * 7, type: 'tool', description: 'Executed web_search', detail: 'Query: "LCS diff algorithm typescript implementation"' },
  { id: 'j-3', timestamp: Date.now() - 86400000 * 2 - 3600000 * 6, type: 'wiki', description: 'Updated wiki page: knowledge-base-architecture', detail: 'Added section on enforcement layer' },
  { id: 'j-4', timestamp: Date.now() - 86400000 * 2 - 3600000 * 5, type: 'memory', description: 'Saved memory: Build hygiene pattern', detail: 'Stale dist artifacts mask real compilation errors' },
  { id: 'j-5', timestamp: Date.now() - 86400000 * 2 - 3600000 * 4, type: 'decision', description: 'Decision: Adopt clean-build verification', detail: 'Always rm -rf dist/ before tsc --noEmit' },
  { id: 'j-6', timestamp: Date.now() - 86400000 * 2 - 3600000 * 3, type: 'tool', description: 'Executed exec command', detail: 'npx tsc --noEmit — 0 errors after clean build' },
  { id: 'j-7', timestamp: Date.now() - 86400000 * 2 - 3600000 * 2, type: 'safety', description: 'Near-miss: attempted rm without confirmation', detail: 'Blocked by red line check — resolved' },
  { id: 'j-8', timestamp: Date.now() - 86400000 * 2 - 3600000 * 1, type: 'conversation', description: 'Conversation ended', detail: '12 messages exchanged, 3 tools used' },

  // Yesterday
  { id: 'j-9', timestamp: Date.now() - 86400000 - 3600000 * 10, type: 'conversation', description: 'Started new conversation', detail: 'Topic: Subagent orchestration improvements' },
  { id: 'j-10', timestamp: Date.now() - 86400000 - 3600000 * 9, type: 'tool', description: 'Spawned subagent: feature-builder', detail: 'Task: Build safety incident report component' },
  { id: 'j-11', timestamp: Date.now() - 86400000 - 3600000 * 8, type: 'memory', description: 'Saved memory: Subagent context exhaustion', detail: 'Subagents hit context window limits before time limits' },
  { id: 'j-12', timestamp: Date.now() - 86400000 - 3600000 * 7, type: 'wiki', description: 'Created wiki page: subagent-orchestration', detail: 'Patterns for parallel subagent spawning' },
  { id: 'j-13', timestamp: Date.now() - 86400000 - 3600000 * 6, type: 'decision', description: 'Decision: Scope subagent tasks to 17min', detail: 'Well-scoped tasks complete reliably; open-ended ones fail' },
  { id: 'j-14', timestamp: Date.now() - 86400000 - 3600000 * 5, type: 'tool', description: 'Executed file_write', detail: 'Wrote 4 component files to src/components/' },
  { id: 'j-15', timestamp: Date.now() - 86400000 - 3600000 * 4, type: 'tool', description: 'Executed tsc --noEmit', detail: 'Type check passed — 0 errors' },
  { id: 'j-16', timestamp: Date.now() - 86400000 - 3600000 * 3, type: 'safety', description: 'Constraint learned: verify from clean state', detail: 'Clean dist/ before type checking' },
  { id: 'j-17', timestamp: Date.now() - 86400000 - 3600000 * 2, type: 'wiki', description: 'Updated wiki page: subagent-orchestration', detail: 'Added contrastive learning section' },
  { id: 'j-18', timestamp: Date.now() - 86400000 - 3600000 * 1, type: 'conversation', description: 'Conversation ended', detail: '8 messages exchanged, 4 tools used' },

  // Today
  { id: 'j-19', timestamp: Date.now() - 3600000 * 3, type: 'conversation', description: 'Started new conversation', detail: 'Topic: Desktop app feature sprint' },
  { id: 'j-20', timestamp: Date.now() - 3600000 * 2.5, type: 'tool', description: 'Spawned subagent: ui-builder', detail: 'Task: Build 6 UI features for Lodestone Desktop' },
  { id: 'j-21', timestamp: Date.now() - 3600000 * 2, type: 'memory', description: 'Saved memory: Component architecture pattern', detail: 'CSS vars for all theming, card class for containers' },
  { id: 'j-22', timestamp: Date.now() - 3600000 * 1, type: 'decision', description: 'Decision: Use mock data for all new components', detail: 'Components are self-contained with default mock data' },
  { id: 'j-23', timestamp: Date.now() - 3600000 * 0.5, type: 'wiki', description: 'Updated wiki page: desktop-architecture', detail: 'Added section on component patterns' },
]

function groupByDay(entries: JournalEntry[]): { label: string; entries: JournalEntry[] }[] {
  const now = new Date()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const groups: Record<string, JournalEntry[]> = {}

  for (const entry of entries) {
    const d = new Date(entry.timestamp)
    let label: string
    if (d >= todayStart) {
      label = 'Today'
    } else if (d >= yesterdayStart) {
      label = 'Yesterday'
    } else {
      label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    }
    if (!groups[label]) groups[label] = []
    groups[label].push(entry)
  }

  return Object.entries(groups).map(([label, items]) => ({
    label,
    entries: items.sort((a, b) => b.timestamp - a.timestamp),
  }))
}

function entryIcon(type: JournalEntry['type']) {
  switch (type) {
    case 'conversation': return { Icon: MessageSquare, color: '#8B5CF6' }
    case 'tool': return { Icon: Wrench, color: '#06B6D4' }
    case 'memory': return { Icon: Brain, color: '#F59E0B' }
    case 'wiki': return { Icon: FileText, color: '#10B981' }
    case 'decision': return { Icon: GitCommit, color: '#EC4899' }
    case 'safety': return { Icon: Shield, color: '#EF4444' }
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function AgentJournal() {
  const [filter, setFilter] = useState<JournalEntry['type'] | 'all'>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return MOCK_ENTRIES
    return MOCK_ENTRIES.filter(e => e.type === filter)
  }, [filter])

  const grouped = useMemo(() => groupByDay(filtered), [filtered])

  const filterOptions: { value: JournalEntry['type'] | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'conversation', label: 'Conversations' },
    { value: 'tool', label: 'Tools' },
    { value: 'memory', label: 'Memories' },
    { value: 'wiki', label: 'Wiki' },
    { value: 'decision', label: 'Decisions' },
    { value: 'safety', label: 'Safety' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap mb-4">
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className="px-2.5 py-1 rounded-lg text-xs transition-all"
            style={{
              background: filter === opt.value ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-elevated)',
              color: filter === opt.value ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${filter === opt.value ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-4">
          {grouped.map(group => (
            <div key={group.label}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                  {group.label}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  ({group.entries.length})
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>

              {/* Entries */}
              <div className="space-y-1.5">
                {group.entries.map((entry, idx) => {
                  const { Icon, color } = entryIcon(entry.type)
                  const isLast = idx === group.entries.length - 1
                  return (
                    <div key={entry.id} className="flex gap-3 group">
                      {/* Timeline line + dot */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: `${color}15` }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color }} />
                        </div>
                        {!isLast && (
                          <div className="w-px flex-1 mt-1" style={{ background: 'var(--border)' }} />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-3'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
                            {formatTime(entry.timestamp)}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider"
                            style={{ background: `${color}15`, color }}
                          >
                            {entry.type}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--text)' }}>
                          {entry.description}
                        </p>
                        {entry.detail && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {entry.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}