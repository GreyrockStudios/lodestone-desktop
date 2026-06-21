import { useState, useEffect } from 'react'
import { Wrench, Search } from 'lucide-react'

interface ToolInfo {
  name: string
  description: string
  category: string
  enabled: boolean
}

const DEFAULT_TOOLS: ToolInfo[] = [
  // Knowledge
  { name: 'wiki-resolve', description: 'Resolve wikilinks to file paths', category: 'Knowledge', enabled: true },
  { name: 'wiki-search', description: 'Search wiki pages by title, slug, or tag', category: 'Knowledge', enabled: true },
  { name: 'wiki-write', description: 'Create or update wiki pages', category: 'Knowledge', enabled: true },
  { name: 'wiki-read', description: 'Read wiki page contents', category: 'Knowledge', enabled: true },
  { name: 'smart-retrieve', description: 'Get wiki pages ranked by relevance', category: 'Knowledge', enabled: true },
  { name: 'decision-log', description: 'Record decisions with rationale', category: 'Knowledge', enabled: true },
  // Memory
  { name: 'memory-store', description: 'Save information in long-term memory', category: 'Memory', enabled: true },
  { name: 'memory-recall', description: 'Search through long-term memories', category: 'Memory', enabled: true },
  { name: 'resume-state', description: 'Save and resume task state', category: 'Memory', enabled: true },
  // Monitoring
  { name: 'watchdog', description: 'Monitor expected outcomes', category: 'Monitoring', enabled: true },
  { name: 'business-hours', description: 'Check if within business hours', category: 'Monitoring', enabled: true },
  // Web
  { name: 'web-search', description: 'Search the web', category: 'Web', enabled: true },
  { name: 'web-fetch', description: 'Fetch and extract content from URLs', category: 'Web', enabled: true },
  { name: 'http', description: 'Make HTTP requests', category: 'Web', enabled: true },
  { name: 'search-engine', description: 'DuckDuckGo/Brave search', category: 'Web', enabled: true },
  { name: 'browser', description: 'Browser automation', category: 'Web', enabled: true },
  // Code
  { name: 'code-exec', description: 'Execute code in sandbox', category: 'Code', enabled: true },
  { name: 'shell', description: 'Run shell commands', category: 'Code', enabled: false },
  { name: 'process-manager', description: 'Manage running processes', category: 'Code', enabled: false },
  { name: 'diff-patch', description: 'Apply find-and-replace edits to files', category: 'Code', enabled: true },
  { name: 'git', description: 'Git operations', category: 'Code', enabled: false },
  { name: 'lsp', description: 'Language server protocol', category: 'Code', enabled: false },
  // Files
  { name: 'file-ops', description: 'File read/write/list operations', category: 'Files', enabled: true },
  { name: 'archive', description: 'Zip/unzip files', category: 'Files', enabled: true },
  { name: 'clipboard', description: 'System clipboard access', category: 'Files', enabled: false },
  { name: 'screenshot', description: 'Screen capture', category: 'Files', enabled: false },
  // Comms
  { name: 'send-message', description: 'Send messages across channels', category: 'Comms', enabled: false },
  { name: 'notify', description: 'Push notifications', category: 'Comms', enabled: true },
  { name: 'voice', description: 'Text-to-speech output', category: 'Comms', enabled: false },
  // Data
  { name: 'database', description: 'SQLite + PostgreSQL operations', category: 'Data', enabled: true },
  { name: 'secrets', description: 'Secret management', category: 'Data', enabled: true },
  // AI/ML
  { name: 'image-gen', description: 'Generate images with DALL-E/local', category: 'AI/ML', enabled: false },
  { name: 'ocr', description: 'Extract text from images', category: 'AI/ML', enabled: false },
  { name: 'transcribe', description: 'Audio transcription', category: 'AI/ML', enabled: false },
  { name: 'vision', description: 'Image analysis', category: 'AI/ML', enabled: false },
  // Scheduling
  { name: 'scheduler', description: 'Cron job scheduling', category: 'Scheduling', enabled: true },
  { name: 'calendar', description: 'Calendar access', category: 'Scheduling', enabled: false },
  // Orchestration
  { name: 'coordinator', description: 'Multi-agent coordination', category: 'Orchestration', enabled: false },
  { name: 'mcp-client', description: 'MCP protocol client', category: 'Orchestration', enabled: false },
]

const CATEGORIES = ['All', 'Knowledge', 'Memory', 'Monitoring', 'Web', 'Code', 'Files', 'Comms', 'Data', 'AI/ML', 'Scheduling', 'Orchestration']

export function Tools() {
  const [tools, setTools] = useState<ToolInfo[]>(DEFAULT_TOOLS)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = tools.filter(t => {
    const matchSearch = t.name.includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || t.category === category
    return matchSearch && matchCat
  })

  const toggleTool = (name: string) => {
    setTools(tools.map(t => t.name === name ? { ...t, enabled: !t.enabled } : t))
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Tools</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {tools.filter(t => t.enabled).length} / {tools.length} enabled
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
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
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

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-2">
          {filtered.map(tool => (
            <div key={tool.name} className="card p-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{tool.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                    {tool.category}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tool.description}</p>
              </div>
              <Toggle on={tool.enabled} onClick={() => toggleTool(tool.name)} />
            </div>
          ))}
        </div>
      </div>
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