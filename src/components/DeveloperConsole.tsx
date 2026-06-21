import { useState } from 'react'
import { Terminal, Play, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface ConsoleEntry {
  id: string
  command: string
  output: string
  timestamp: number
}

const MOCK_OUTPUTS: Record<string, string> = {
  'help': `Available commands:
  help          - Show this help
  status        - Agent status
  tools         - List available tools
  memory list   - List memories
  wiki list     - List wiki pages
  clear         - Clear console`,
  'status': `Agent: Flint
Status: Running
Model: glm-5.2:cloud
Uptime: 2h 34m
Memory: 156 entries
Wiki: 42 pages
Tools: 39 registered`,
  'tools': `39 registered tools:
  Knowledge: wiki-resolve, wiki-search, wiki-write, wiki-read
  Memory: memory-store, memory-recall, smart-retrieve
  Monitoring: watchdog, business-hours, decision-log
  Web: web-search, web-fetch, browser, screenshot
  Code: shell, code-exec, diff-patch, git, lsp
  ...`,
  'memory list': `156 memories:
  [1] Agent name: Flint (fact)
  [2] User prefers dark mode (preference)
  [3] Use trash over rm (decision)
  ...`,
  'wiki list': `42 wiki pages:
  - flint.md (entity)
  - second-brain.md (concept)
  - openclaw-config.md (concept)
  - seo-strategy.md (concept)
  ...`,
}

export function DeveloperConsole() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([
    { id: '1', command: 'help', output: MOCK_OUTPUTS['help'] || '', timestamp: Date.now() - 60000 },
  ])
  const [input, setInput] = useState('')
  const [showConsole, setShowConsole] = useState(false)

  const runCommand = (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase()
    const output = MOCK_OUTPUTS[trimmed] || `Command not found: ${trimmed}\nType 'help' for available commands.`
    const entry: ConsoleEntry = {
      id: Date.now().toString(),
      command: cmd,
      output,
      timestamp: Date.now(),
    }
    setEntries(prev => [...prev, entry])
    setInput('')
  }

  const clear = () => setEntries([])

  const copyOutput = (id: string) => {
    const entry = entries.find(e => e.id === id)
    if (entry) navigator.clipboard.writeText(entry.output)
  }

  if (!showConsole) {
    return (
      <button
        onClick={() => setShowConsole(true)}
        className="fixed bottom-9 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        title="Developer Console"
      >
        <Terminal className="w-3.5 h-3.5" />
        Console
      </button>
    )
  }

  return (
    <div
      className="fixed bottom-9 right-3 z-40 w-96 rounded-xl overflow-hidden flex flex-col"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" style={{ color: '#10B981' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Developer Console</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clear} className="p-1 rounded hover:bg-red-500/10" title="Clear">
            <Trash2 className="w-3 h-3" style={{ color: '#EF4444' }} />
          </button>
          <button onClick={() => setShowConsole(false)} className="p-1 rounded" style={{ background: 'var(--bg-card)' }}>
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto p-2 max-h-64" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 12 }}>
        {entries.map(entry => (
          <div key={entry.id} className="mb-2 group">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span style={{ color: '#10B981' }}>$</span>
              <span style={{ color: 'var(--text)' }}>{entry.command}</span>
              <button onClick={() => copyOutput(entry.id)} className="opacity-0 group-hover:opacity-100 ml-auto p-0.5 rounded">
                <Copy className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
              </button>
            </div>
            <pre className="pl-3 whitespace-pre-wrap" style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{entry.output}</pre>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-1.5 p-2 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
        <span style={{ color: '#10B981', fontFamily: 'monospace', fontSize: 12 }}>$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runCommand(input)
            if (e.key === 'Escape') setShowConsole(false)
          }}
          placeholder="Type a command... (help, status, tools)"
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: 'var(--text)', fontFamily: "'SF Mono', monospace" }}
          autoFocus
        />
        <button
          onClick={() => runCommand(input)}
          className="p-1 rounded"
          style={{ background: 'var(--bg-card)' }}
        >
          <Play className="w-3 h-3" style={{ color: '#10B981' }} />
        </button>
      </div>
    </div>
  )
}