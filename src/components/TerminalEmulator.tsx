import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, ChevronRight } from 'lucide-react'

// ─── ANSI Color Parsing ─────────────────────────────────────────────

const ANSI_COLORS: Record<string, string> = {
  '0': 'var(--text)',        // reset
  '31': '#EF4444',          // red
  '32': '#10B981',          // green
  '33': '#F59E0B',          // yellow
  '34': '#3B82F6',          // blue
  '35': '#A855F7',          // magenta
  '36': '#06B6D4',          // cyan
  '1': 'var(--text)',       // bold (handled separately)
}

interface AnsiSegment {
  text: string
  color: string
  bold: boolean
}

function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  const ansiRegex = /\x1b\[([0-9;]*)m/g
  let lastIndex = 0
  let currentColor = 'var(--text)'
  let isBold = false
  let match: RegExpExecArray | null

  while ((match = ansiRegex.exec(text)) !== null) {
    // Push text before this escape
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), color: currentColor, bold: isBold })
    }

    const codes = match[1].split(';')
    for (const code of codes) {
      if (code === '0') {
        currentColor = 'var(--text)'
        isBold = false
      } else if (code === '1') {
        isBold = true
      } else if (ANSI_COLORS[code]) {
        currentColor = ANSI_COLORS[code]
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), color: currentColor, bold: isBold })
  }

  return segments
}

// ─── Tab Completion ──────────────────────────────────────────────────

const KNOWN_COMMANDS = [
  'ls', 'cd', 'pwd', 'cat', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'chmod',
  'git', 'npm', 'node', 'python3', 'docker', 'ssh', 'curl', 'wget',
  'grep', 'find', 'ps', 'top', 'kill', 'df', 'du', 'echo', 'env',
  'pip', 'cargo', 'go', 'make', 'tar', 'gzip', 'head', 'tail', 'less',
]

function tabComplete(input: string): string[] {
  if (!input.trim()) return []
  const parts = input.split(/\s+/)
  const lastPart = parts[parts.length - 1]
  if (parts.length === 1) {
    return KNOWN_COMMANDS.filter(c => c.startsWith(lastPart)).slice(0, 8)
  }
  // For arguments, suggest common flags
  const cmd = parts[0]
  const flags: Record<string, string[]> = {
    'git': ['status', 'add', 'commit', 'push', 'pull', 'log', 'diff', 'branch', 'checkout', 'merge'],
    'npm': ['install', 'run', 'build', 'test', 'start', 'init', 'list'],
    'docker': ['ps', 'run', 'build', 'stop', 'rm', 'images', 'exec', 'logs'],
  }
  if (flags[cmd]) {
    return flags[cmd].filter(f => f.startsWith(lastPart)).slice(0, 8)
  }
  return []
}

// ─── Types ───────────────────────────────────────────────────────────

interface TerminalTab {
  id: string
  name: string
  history: string[]
  historyIndex: number
  cwd: string
  lines: TerminalLine[]
  input: string
  completionOptions: string[]
}

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'system'
  content: string
  ansi?: string
  timestamp: number
}

// ─── Terminal Emulator Panel ──────────────────────────────────────────

export function TerminalEmulator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    createTab('main'),
  ])
  const [activeTabId, setActiveTabId] = useState('main')
  const [cursorVisible, setCursorVisible] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Blink cursor
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(interval)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Scroll to bottom on new lines
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [tabs, activeTabId])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 't') {
        e.preventDefault()
        handleNewTab()
      }
      if (e.metaKey && e.key === 'w') {
        e.preventDefault()
        handleCloseTab(activeTabId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, tabs, activeTabId])

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  const handleNewTab = useCallback(() => {
    const id = `tab-${Date.now()}`
    const newTab = createTab(id)
    setTabs(prev => [...prev, newTab])
    setActiveTabId(id)
  }, [])

  const handleCloseTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(t => t.id === id)
      const newTabs = prev.filter(t => t.id !== id)
      if (id === activeTabId) {
        setActiveTabId(newTabs[Math.min(idx, newTabs.length - 1)].id)
      }
      return newTabs
    })
  }, [activeTabId])

  const handleInputChange = useCallback((value: string) => {
    // Check for completions
    const completions = tabComplete(value)
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, input: value, completionOptions: completions } : t
    ))
  }, [activeTabId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab) return

    if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = tab.input.trim()
      if (!cmd) {
        // Just add empty prompt
        setTabs(prev => prev.map(t =>
          t.id === activeTabId ? { ...t, input: '', historyIndex: -1, completionOptions: [] } : t
        ))
        return
      }

      // Add to history
      const newHistory = [...tab.history, cmd]
      const inputLine: TerminalLine = { type: 'input', content: `${tab.cwd} $ ${cmd}`, timestamp: Date.now() }
      let outputLines: TerminalLine[] = []

      // Execute command
      const execPromise = async () => {
        try {
          if (window.lodestone?.execCommand) {
            const result = await window.lodestone.execCommand(cmd, tab.cwd)
            if (result.stdout) {
              outputLines.push({ type: 'output', content: result.stdout, timestamp: Date.now() })
            }
            if (result.stderr) {
              outputLines.push({ type: 'error', content: result.stderr, timestamp: Date.now() })
            }
            if (!result.stdout && !result.stderr && result.exitCode === 0) {
              outputLines.push({ type: 'system', content: '(no output)', timestamp: Date.now() })
            }
            if (result.exitCode !== 0 && result.exitCode !== null) {
              outputLines.push({ type: 'error', content: `Exit code: ${result.exitCode}`, timestamp: Date.now() })
            }
          } else {
            // Mock output for demo
            outputLines = mockCommand(cmd, tab.cwd)
          }
        } catch {
          outputLines.push({ type: 'error', content: 'Command execution failed', timestamp: Date.now() })
        }
      }

      execPromise().then(() => {
        // Handle cd command
        let newCwd = tab.cwd
        const cmdParts = cmd.split(/\s+/)
        if (cmdParts[0] === 'cd' && cmdParts[1]) {
          if (cmdParts[1] === '~') newCwd = '/Users'
          else if (cmdParts[1].startsWith('/')) newCwd = cmdParts[1]
          else newCwd = tab.cwd === '/' ? `/${cmdParts[1]}` : `${tab.cwd}/${cmdParts[1]}`.replace(/\/+/g, '/')
        }

        setTabs(prev => prev.map(t =>
          t.id === activeTabId ? {
            ...t,
            input: '',
            history: newHistory,
            historyIndex: newHistory.length,
            lines: [...t.lines, inputLine, ...outputLines],
            completionOptions: [],
            cwd: newCwd,
          } : t
        ))
      })

      // Add input line immediately
      setTabs(prev => prev.map(t =>
        t.id === activeTabId ? {
          ...t,
          input: '',
          history: newHistory,
          historyIndex: newHistory.length,
          lines: [...t.lines, inputLine],
          completionOptions: [],
        } : t
      ))
      return
    }

    // Command history navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = Math.max(0, tab.historyIndex - 1)
      if (tab.history[idx]) {
        setTabs(prev => prev.map(t =>
          t.id === activeTabId ? { ...t, input: tab.history[idx], historyIndex: idx } : t
        ))
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = Math.min(tab.history.length, tab.historyIndex + 1)
      setTabs(prev => prev.map(t =>
        t.id === activeTabId ? {
          ...t,
          input: idx >= tab.history.length ? '' : tab.history[idx],
          historyIndex: idx,
        } : t
      ))
      return
    }

    // Tab completion
    if (e.key === 'Tab') {
      e.preventDefault()
      if (tab.completionOptions.length === 1) {
        const parts = tab.input.split(/\s+/)
        parts[parts.length - 1] = tab.completionOptions[0]
        setTabs(prev => prev.map(t =>
          t.id === activeTabId ? { ...t, input: parts.join(' '), completionOptions: [] } : t
        ))
      }
      return
    }

    // Ctrl+C
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      setTabs(prev => prev.map(t =>
        t.id === activeTabId ? { ...t, input: '', completionOptions: [] } : t
      ))
      return
    }

    // Ctrl+L (clear)
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setTabs(prev => prev.map(t =>
        t.id === activeTabId ? { ...t, lines: [] } : t
      ))
      return
    }
  }, [activeTabId, tabs])

  const handleCompletionClick = useCallback((completion: string) => {
    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab) return
    const parts = tab.input.split(/\s+/)
    parts[parts.length - 1] = completion
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, input: parts.join(' ') + ' ', completionOptions: [] } : t
    ))
    inputRef.current?.focus()
  }, [activeTabId, tabs])

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 400, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 400, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            position: 'fixed',
            bottom: 28,
            left: 240,
            right: 0,
            height: 360,
            background: 'var(--bg-card)',
            borderTop: '1px solid var(--border)',
            borderBottom: 'none',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* Tab bar */}
          <div
            className="flex items-center px-2"
            style={{
              height: 32,
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              flexShrink: 0,
            }}
          >
            <div className="flex items-center gap-1 flex-1 overflow-x-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-t text-xs cursor-pointer"
                  style={{
                    background: tab.id === activeTabId ? 'var(--bg-card)' : 'transparent',
                    color: tab.id === activeTabId ? 'var(--text)' : 'var(--text-dim)',
                    border: tab.id === activeTabId ? '1px solid var(--border)' : '1px solid transparent',
                    borderBottom: tab.id === activeTabId ? 'none' : '1px solid transparent',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => { setActiveTabId(tab.id); inputRef.current?.focus() }}
                >
                  <span>{tab.name}</span>
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--text-dim)' }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleNewTab}
                className="flex items-center justify-center w-6 h-6 rounded"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                title="New Tab (Cmd+T)"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 rounded ml-2"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
              title="Close Terminal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Terminal content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3"
            style={{ background: '#0D0D14', fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace", fontSize: 12, lineHeight: 1.5 }}
          >
            {activeTab.lines.length === 0 && (
              <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>
                Lodestone Terminal v1.0 — Type 'help' for available commands.
              </div>
            )}
            {activeTab.lines.map((line, i) => (
              <div key={i}>
                {line.type === 'input' ? (
                  <div style={{ color: '#06B6D4' }}>
                    <span style={{ color: '#10B981' }}>{line.content.split(' $ ')[0]}</span>
                    <span style={{ color: '#6B7280' }}> $ </span>
                    <span style={{ color: 'var(--text)' }}>{line.content.split(' $ ')[1]}</span>
                  </div>
                ) : line.type === 'error' ? (
                  <div style={{ color: '#EF4444', whiteSpace: 'pre-wrap' }}>{line.content}</div>
                ) : line.type === 'system' ? (
                  <div style={{ color: '#6B7280', fontStyle: 'italic' }}>{line.content}</div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {parseAnsi(line.content).map((seg, si) => (
                      <span key={si} style={{ color: seg.color, fontWeight: seg.bold ? 700 : 400 }}>{seg.text}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Completion suggestions */}
            {activeTab.completionOptions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 mb-1">
                {activeTab.completionOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleCompletionClick(opt)}
                    className="px-2 py-0.5 rounded text-xs"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Input line */}
            <div className="flex items-center" style={{ minHeight: 20 }}>
              <span style={{ color: '#10B981', whiteSpace: 'nowrap' }}>{activeTab.cwd}</span>
              <span style={{ color: '#6B7280', margin: '0 4px' }}>$</span>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  ref={inputRef}
                  value={activeTab.input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    outline: 'none',
                    width: '100%',
                    caretColor: cursorVisible ? 'var(--accent)' : 'transparent',
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function createTab(id: string): TerminalTab {
  return {
    id,
    name: id === 'main' ? 'Terminal' : `Tab ${id.slice(-3)}`,
    history: [],
    historyIndex: -1,
    cwd: '~',
    lines: [],
    input: '',
    completionOptions: [],
  }
}

function mockCommand(cmd: string, cwd: string): TerminalLine[] {
  const parts = cmd.split(/\s+/)
  const command = parts[0]
  const timestamp = Date.now()

  switch (command) {
    case 'ls':
      return [{ type: 'output', content: '\x1b[34mbin\x1b[0m  \x1b[34metc\x1b[0m  \x1b[32mhome\x1b[0m  \x1b[34musr\x1b[0m  \x1b[33mvar\x1b[0m  tmp', timestamp }]
    case 'pwd':
      return [{ type: 'output', content: cwd === '~' ? '/Users/agent' : cwd, timestamp }]
    case 'whoami':
      return [{ type: 'output', content: 'agent', timestamp }]
    case 'date':
      return [{ type: 'output', content: new Date().toString(), timestamp }]
    case 'echo':
      return [{ type: 'output', content: parts.slice(1).join(' '), timestamp }]
    case 'help':
      return [{ type: 'output', content: 'Available commands: ls, cd, pwd, whoami, date, echo, git, npm, docker, ssh, curl, clear, help', timestamp }]
    case 'git':
      if (parts[1] === 'status') return [{ type: 'output', content: 'On branch main\nYour branch is up to date with \'origin/main\'.\n\nnothing to commit, working tree clean', timestamp }]
      if (parts[1] === 'log') return [{ type: 'output', content: '\x1b[33mabc1234\x1b[0m feat: add metrics dashboard\n\x1b[33mdef5678\x1b[0m fix: terminal emulator colors\n\x1b[33mghi9012\x1b[0m chore: update dependencies', timestamp }]
      return [{ type: 'output', content: `git: '${parts[1] || ''}' is not a git command.`, timestamp }]
    case 'npm':
      if (parts[1] === 'test') return [{ type: 'output', content: '\x1b[32m✓\x1b[0m 12 tests passed', timestamp }]
      return [{ type: 'output', content: `npm ${parts.slice(1).join(' ')}`, timestamp }]
    case 'clear':
      return []  // handled separately
    default:
      return [{ type: 'error', content: `command not found: ${command}`, timestamp }]
  }
}