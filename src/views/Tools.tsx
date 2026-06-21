import { useState, useEffect, useCallback } from 'react'
import { Wrench, Search, ChevronDown, ChevronRight, Shield, ShieldAlert, Star, Clock, Package } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PackageManager } from '../components/PackageManager'

interface ToolInfo {
  name: string
  description: string
  category: string
  enabled: boolean
  risky?: boolean
  requiresAuth?: boolean
  params?: { name: string; type: string; required: boolean; description: string }[]
  example?: string
}

const DEFAULT_TOOLS: ToolInfo[] = [
  // Knowledge
  { name: 'wiki-resolve', description: 'Resolve wikilinks to file paths', category: 'Knowledge', enabled: true,
    params: [{ name: 'link', type: 'string', required: true, description: 'Wikilink text without brackets' }] },
  { name: 'wiki-search', description: 'Search wiki pages by title, slug, or tag', category: 'Knowledge', enabled: true,
    params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }, { name: 'limit', type: 'number', required: false, description: 'Max results (default 10)' }] },
  { name: 'wiki-write', description: 'Create or update wiki pages', category: 'Knowledge', enabled: true,
    params: [{ name: 'path', type: 'string', required: true, description: 'Wiki page path' }, { name: 'content', type: 'string', required: true, description: 'Page content in markdown' }] },
  { name: 'wiki-read', description: 'Read wiki page contents', category: 'Knowledge', enabled: true,
    params: [{ name: 'path', type: 'string', required: true, description: 'Wiki page path' }] },
  { name: 'smart-retrieve', description: 'Get wiki pages ranked by relevance to current task', category: 'Knowledge', enabled: true,
    params: [{ name: 'query', type: 'string', required: true, description: 'What you\'re looking for' }, { name: 'limit', type: 'number', required: false, description: 'Max results' }] },
  { name: 'decision-log', description: 'Record decisions with rationale to prevent re-litigating', category: 'Knowledge', enabled: true,
    params: [{ name: 'decision', type: 'string', required: true, description: 'What was decided' }, { name: 'rationale', type: 'string', required: true, description: 'Why this was chosen' }] },
  // Memory
  { name: 'memory-store', description: 'Save information in long-term memory', category: 'Memory', enabled: true,
    params: [{ name: 'text', type: 'string', required: true, description: 'Information to remember' }, { name: 'category', type: 'string', required: false, description: 'preference, fact, decision, entity, other' }] },
  { name: 'memory-recall', description: 'Search through long-term memories', category: 'Memory', enabled: true,
    params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }, { name: 'limit', type: 'number', required: false, description: 'Max results' }] },
  { name: 'resume-state', description: 'Save and resume task state across sessions', category: 'Memory', enabled: true,
    params: [{ name: 'currentTask', type: 'string', required: true, description: 'What you\'re working on' }, { name: 'progress', type: 'string', required: true, description: 'How far along' }] },
  // Monitoring
  { name: 'watchdog', description: 'Monitor expected outcomes and flag missed deadlines', category: 'Monitoring', enabled: true,
    params: [{ name: 'description', type: 'string', required: true, description: 'What should happen' }, { name: 'expectedBy', type: 'string', required: true, description: 'ISO timestamp' }] },
  { name: 'business-hours', description: 'Check if within business hours before sending messages', category: 'Monitoring', enabled: true },
  // Web
  { name: 'web-search', description: 'Search the web using configured provider', category: 'Web', enabled: true,
    params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }, { name: 'count', type: 'number', required: false, description: 'Result count' }] },
  { name: 'web-fetch', description: 'Fetch and extract readable content from URLs', category: 'Web', enabled: true,
    params: [{ name: 'url', type: 'string', required: true, description: 'HTTP(S) URL' }, { name: 'extractMode', type: 'string', required: false, description: 'markdown or text' }] },
  { name: 'http', description: 'Make HTTP requests to any endpoint', category: 'Web', enabled: true, risky: true,
    params: [{ name: 'url', type: 'string', required: true, description: 'Request URL' }, { name: 'method', type: 'string', required: false, description: 'GET, POST, PUT, DELETE' }] },
  { name: 'search-engine', description: 'DuckDuckGo/Brave search with structured results', category: 'Web', enabled: true,
    params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }] },
  { name: 'browser', description: 'Browser automation via CDP', category: 'Web', enabled: false, risky: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'Browser action' }] },
  // Code
  { name: 'code-exec', description: 'Execute code in sandboxed environment', category: 'Code', enabled: true, risky: true,
    params: [{ name: 'language', type: 'string', required: true, description: 'Programming language' }, { name: 'code', type: 'string', required: true, description: 'Code to execute' }] },
  { name: 'shell', description: 'Run shell commands on the host', category: 'Code', enabled: false, risky: true, requiresAuth: true,
    params: [{ name: 'command', type: 'string', required: true, description: 'Shell command to execute' }] },
  { name: 'process-manager', description: 'Manage running processes', category: 'Code', enabled: false, risky: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'list, poll, log, kill' }] },
  { name: 'diff-patch', description: 'Apply find-and-replace edits to files', category: 'Code', enabled: true,
    params: [{ name: 'path', type: 'string', required: true, description: 'File path' }, { name: 'edits', type: 'array', required: true, description: 'Array of {oldText, newText}' }] },
  { name: 'git', description: 'Git operations (status, diff, commit, push)', category: 'Code', enabled: false, risky: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'Git action' }] },
  { name: 'lsp', description: 'Language server protocol for code intelligence', category: 'Code', enabled: false,
    params: [{ name: 'action', type: 'string', required: true, description: 'LSP action' }] },
  // Files
  { name: 'file-ops', description: 'File read/write/list/move/delete operations', category: 'Files', enabled: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'File operation' }, { name: 'path', type: 'string', required: true, description: 'File path' }] },
  { name: 'archive', description: 'Zip/unzip files and directories', category: 'Files', enabled: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'zip or unzip' }, { name: 'path', type: 'string', required: true, description: 'Archive path' }] },
  { name: 'clipboard', description: 'System clipboard read/write', category: 'Files', enabled: false,
    params: [{ name: 'action', type: 'string', required: true, description: 'read or write' }] },
  { name: 'screenshot', description: 'Screen capture', category: 'Files', enabled: false, risky: true },
  // Comms
  { name: 'send-message', description: 'Send messages across channels (Telegram, Slack, etc.)', category: 'Comms', enabled: false, risky: true,
    params: [{ name: 'channel', type: 'string', required: true, description: 'Target channel' }, { name: 'message', type: 'string', required: true, description: 'Message content' }] },
  { name: 'notify', description: 'Push system notifications', category: 'Comms', enabled: true,
    params: [{ name: 'title', type: 'string', required: true, description: 'Notification title' }, { name: 'body', type: 'string', required: true, description: 'Notification body' }] },
  { name: 'voice', description: 'Text-to-speech audio output', category: 'Comms', enabled: false,
    params: [{ name: 'text', type: 'string', required: true, description: 'Text to speak' }] },
  // Data
  { name: 'database', description: 'SQLite + PostgreSQL query operations', category: 'Data', enabled: true, risky: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'DB action' }, { name: 'query', type: 'string', required: true, description: 'SQL query' }] },
  { name: 'secrets', description: 'Encrypted secret management', category: 'Data', enabled: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'get, set, list, delete' }, { name: 'key', type: 'string', required: true, description: 'Secret key' }] },
  // AI/ML
  { name: 'image-gen', description: 'Generate images with DALL-E or local models', category: 'AI/ML', enabled: false,
    params: [{ name: 'prompt', type: 'string', required: true, description: 'Image description' }] },
  { name: 'ocr', description: 'Extract text from images (Tesseract.js)', category: 'AI/ML', enabled: false,
    params: [{ name: 'imagePath', type: 'string', required: true, description: 'Path to image file' }] },
  { name: 'transcribe', description: 'Audio transcription via Whisper', category: 'AI/ML', enabled: false,
    params: [{ name: 'audioPath', type: 'string', required: true, description: 'Path to audio file' }] },
  { name: 'vision', description: 'Image analysis and description', category: 'AI/ML', enabled: false,
    params: [{ name: 'imagePath', type: 'string', required: true, description: 'Path to image file' }] },
  // Scheduling
  { name: 'scheduler', description: 'Cron job scheduling for recurring tasks', category: 'Scheduling', enabled: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'add, remove, list, run' }] },
  { name: 'calendar', description: 'Calendar access (read/create events)', category: 'Scheduling', enabled: false,
    params: [{ name: 'action', type: 'string', required: true, description: 'Calendar action' }] },
  // Orchestration
  { name: 'coordinator', description: 'Multi-agent coordination and task delegation', category: 'Orchestration', enabled: false, risky: true,
    params: [{ name: 'action', type: 'string', required: true, description: 'Coordinate action' }] },
  { name: 'mcp-client', description: 'Model Context Protocol client for external tools', category: 'Orchestration', enabled: false,
    params: [{ name: 'serverUrl', type: 'string', required: true, description: 'MCP server URL' }] },
]

const CATEGORIES = ['All', 'Knowledge', 'Memory', 'Monitoring', 'Web', 'Code', 'Files', 'Comms', 'Data', 'AI/ML', 'Scheduling', 'Orchestration']

const CATEGORY_COLORS: Record<string, string> = {
  Knowledge: '#06B6D4',
  Memory: '#8B5CF6',
  Monitoring: '#F59E0B',
  Web: '#10B981',
  Code: '#EF4444',
  Files: '#6B7280',
  Comms: '#EC4899',
  Data: '#14B8A6',
  'AI/ML': '#F97316',
  Scheduling: '#3B82F6',
  Orchestration: '#A855F7',
}

const FAVORITES_KEY = 'lodestone-tool-favorites'
const RECENT_KEY = 'lodestone-tool-recent'
const MAX_RECENT = 5

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch {}
  return new Set()
}

function saveFavorites(favs: Set<string>) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs])) } catch {}
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveRecent(recent: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)) } catch {}
}

export function Tools() {
  const [tools, setTools] = useState<ToolInfo[]>(DEFAULT_TOOLS)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)
  const [recent, setRecent] = useState<string[]>(loadRecent)

  const toggleFavorite = useCallback((name: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      saveFavorites(next)
      return next
    })
  }, [])

  const trackUse = useCallback((name: string) => {
    setRecent(prev => {
      const next = [name, ...prev.filter(n => n !== name)].slice(0, MAX_RECENT)
      saveRecent(next)
      return next
    })
  }, [])

  const filtered = tools.filter(t => {
    const matchSearch = t.name.includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || t.category === category
    return matchSearch && matchCat
  })

  const toggleTool = (name: string) => {
    setTools(tools.map(t => t.name === name ? { ...t, enabled: !t.enabled } : t))
    trackUse(name)
  }

  const favoriteTools = tools.filter(t => favorites.has(t.name))
  const recentTools = recent.map(name => tools.find(t => t.name === name)).filter(Boolean) as ToolInfo[]
  const enabledCount = tools.filter(t => t.enabled).length

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Tools</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {enabledCount} / {tools.length} enabled
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="px-2.5 py-1 rounded-lg text-xs transition-all"
              style={{
                background: category === c ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-elevated)',
                color: category === c ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${category === c ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Package Manager */}
      <div className="px-4 pb-4">
        <PackageManager />
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {/* Favorites section */}
          {favoriteTools.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-3.5 h-3.5" style={{ color: '#F59E0B', fill: '#F59E0B' }} />
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                  Favorites ({favoriteTools.length})
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
              <div className="flex flex-col gap-2">
                {favoriteTools.map(tool => (
                  <ToolCard
                    key={tool.name}
                    tool={tool}
                    expanded={expanded === tool.name}
                    onToggle={() => setExpanded(expanded === tool.name ? null : tool.name)}
                    onToggleEnabled={toggleTool}
                    isFavorite={favorites.has(tool.name)}
                    onToggleFavorite={() => toggleFavorite(tool.name)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recently Used section */}
          {recentTools.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5" style={{ color: '#06B6D4' }} />
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                  Recently Used
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
              <div className="flex flex-col gap-2">
                {recentTools.map(tool => (
                  <ToolCard
                    key={`recent-${tool.name}`}
                    tool={tool}
                    expanded={expanded === tool.name}
                    onToggle={() => setExpanded(expanded === tool.name ? null : tool.name)}
                    onToggleEnabled={toggleTool}
                    isFavorite={favorites.has(tool.name)}
                    onToggleFavorite={() => toggleFavorite(tool.name)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All tools */}
          <div>
            {(favoriteTools.length > 0 || recentTools.length > 0) && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                  All Tools
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              {filtered.map(tool => (
                <ToolCard
                  key={tool.name}
                  tool={tool}
                  expanded={expanded === tool.name}
                  onToggle={() => setExpanded(expanded === tool.name ? null : tool.name)}
                  onToggleEnabled={toggleTool}
                  isFavorite={favorites.has(tool.name)}
                  onToggleFavorite={() => toggleFavorite(tool.name)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tool Card ───────────────────────────────────────────────────────

function ToolCard({ tool, expanded, onToggle, onToggleEnabled, isFavorite, onToggleFavorite }: {
  tool: ToolInfo
  expanded: boolean
  onToggle: () => void
  onToggleEnabled: (name: string) => void
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  const catColor = CATEGORY_COLORS[tool.category] || '#6B7280'
  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div
        className="p-3 flex items-center justify-between cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${catColor}15` }}>
            {expanded ? <ChevronDown className="w-4 h-4" style={{ color: catColor }} /> : <ChevronRight className="w-4 h-4" style={{ color: catColor }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{tool.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${catColor}15`, color: catColor }}>
                {tool.category}
              </span>
              {tool.risky && (
                <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
                  <ShieldAlert className="w-3 h-3" /> risky
                </span>
              )}
              {tool.requiresAuth && (
                <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
                  <Shield className="w-3 h-3" /> auth
                </span>
              )}
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{tool.description}</p>
          </div>
        </div>

        {/* Star + Toggle */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleFavorite}
            className="p-1.5 rounded-lg transition-all"
            style={{ background: 'transparent' }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star
              className="w-4 h-4"
              style={{
                color: isFavorite ? '#F59E0B' : 'var(--text-dim)',
                fill: isFavorite ? '#F59E0B' : 'none',
              }}
            />
          </button>
          <Toggle on={tool.enabled} onClick={() => onToggleEnabled(tool.name)} />
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              {tool.params && tool.params.length > 0 ? (
                <>
                  <p className="text-xs font-medium mb-2 mt-2" style={{ color: 'var(--text-muted)' }}>Parameters</p>
                  <div className="flex flex-col gap-1.5">
                    {tool.params.map(p => (
                      <div key={p.name} className="flex items-start gap-2 text-xs" style={{ fontFamily: 'SF Mono, Fira Code, monospace' }}>
                        <span style={{ color: p.required ? '#EF4444' : 'var(--text-dim)' }}>
                          {p.required ? '*' : ' '} {p.name}:
                        </span>
                        <span style={{ color: '#06B6D4' }}>{p.type}</span>
                        <span style={{ color: 'var(--text-muted)' }}>— {p.description}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>No parameters required.</p>
              )}
              {tool.example && (
                <>
                  <p className="text-xs font-medium mb-1 mt-3" style={{ color: 'var(--text-muted)' }}>Example</p>
                  <pre className="text-xs p-2 rounded-lg overflow-x-auto" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontFamily: 'SF Mono, Fira Code, monospace' }}>
                    {tool.example}
                  </pre>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-10 h-5 rounded-full transition-all shrink-0 ml-3"
      style={{ background: on ? '#8B5CF6' : 'var(--border-hover)' }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
        style={{ left: on ? '22px' : '2px' }}
      />
    </button>
  )
}