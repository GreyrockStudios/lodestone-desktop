import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  MessageSquare,
  Network,
  Brain as BrainIcon,
  History as HistoryIcon,
  Wrench,
  Clock,
  Shield,
  User,
  Settings as SettingsIcon,
  Plus,
  Play,
  Square,
  FolderOpen,
  RefreshCw,
  Download,
  ToggleLeft,
  ToggleRight,
  Lock,
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '../store'

// ---- Types ----

type CommandCategory = 'Navigation' | 'Actions' | 'Config'

interface Command {
  id: string
  label: string
  category: CommandCategory
  icon: LucideIcon
  shortcut?: string
  action: () => void | Promise<void>
}

// ---- Hook ----

let openListeners: ((open: boolean) => void)[] = []

function setOpenGlobal(open: boolean) {
  openListeners.forEach((fn) => fn(open))
}

export function useCommandPalette() {
  const [open, setOpenState] = useState(false)

  useEffect(() => {
    const listener = (val: boolean) => setOpenState(val)
    openListeners.push(listener)
    return () => {
      openListeners = openListeners.filter((fn) => fn !== listener)
    }
  }, [])

  const setOpen = useCallback((val: boolean) => {
    if (val) {
      setOpenState(true)
    } else {
      setOpenState(false)
    }
    setOpenGlobal(val)
  }, [])

  return { open, setOpen }
}

// ---- Fuzzy search ----

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  // Exact match → highest
  if (t === q) return 1000
  // Starts with → high
  if (t.startsWith(q)) return 500
  // Contains → medium
  if (t.includes(q)) return 200
  // Fuzzy sequence match → low
  let qi = 0
  let score = 0
  let consecutive = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      consecutive++
      score += consecutive * 10
    } else {
      consecutive = 0
    }
  }
  return qi === q.length ? score : -1
}

// ---- Component ----

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const store = useStore()

  // Build commands list
  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'nav-dashboard', label: 'Go to Dashboard', category: 'Navigation', icon: LayoutDashboard, shortcut: '⌘1', action: () => store.setActiveView('dashboard') },
      { id: 'nav-chat', label: 'Go to Chat', category: 'Navigation', icon: MessageSquare, shortcut: '⌘2', action: () => store.setActiveView('chat') },
      { id: 'nav-brain', label: 'Go to Brain', category: 'Navigation', icon: Network, shortcut: '⌘3', action: () => store.setActiveView('brain') },
      { id: 'nav-memory', label: 'Go to Memory', category: 'Navigation', icon: BrainIcon, shortcut: '⌘4', action: () => store.setActiveView('memory') },
      { id: 'nav-history', label: 'Go to History', category: 'Navigation', icon: HistoryIcon, shortcut: '⌘5', action: () => store.setActiveView('history') },
      { id: 'nav-tools', label: 'Go to Tools', category: 'Navigation', icon: Wrench, shortcut: '⌘6', action: () => store.setActiveView('tools') },
      { id: 'nav-schedule', label: 'Go to Schedule', category: 'Navigation', icon: Clock, shortcut: '⌘7', action: () => store.setActiveView('schedule') },
      { id: 'nav-safety', label: 'Go to Safety', category: 'Navigation', icon: Shield, shortcut: '⌘8', action: () => store.setActiveView('safety') },
      { id: 'nav-identity', label: 'Go to Identity', category: 'Navigation', icon: User, shortcut: '⌘9', action: () => store.setActiveView('identity') },
      { id: 'nav-settings', label: 'Go to Settings', category: 'Navigation', icon: SettingsIcon, shortcut: '⌘,', action: () => store.setActiveView('settings') },
    ]

    const actions: Command[] = [
      {
        id: 'act-new-chat',
        label: 'New Chat',
        category: 'Actions',
        icon: Plus,
        shortcut: '⌘N',
        action: () => {
          store.clearMessages()
          store.setActiveView('chat')
        },
      },
      {
        id: 'act-start-engine',
        label: 'Start Engine',
        category: 'Actions',
        icon: Play,
        action: async () => {
          if (store.config) {
            const result = await window.lodestone.startEngine(store.config)
            if (result.success) {
              store.setEngineState(true, result.port)
            }
          }
        },
      },
      {
        id: 'act-stop-engine',
        label: 'Stop Engine',
        category: 'Actions',
        icon: Square,
        action: async () => {
          await window.lodestone.stopEngine()
          store.setEngineState(false, 0)
        },
      },
      {
        id: 'act-open-workspace',
        label: 'Open Workspace',
        category: 'Actions',
        icon: FolderOpen,
        action: async () => {
          await window.lodestone.openInFinder()
        },
      },
      {
        id: 'act-refresh-brain',
        label: 'Refresh Brain Data',
        category: 'Actions',
        icon: RefreshCw,
        action: async () => {
          try {
            const result = await window.lodestone.scanBrain()
            store.setMemoryStats(result.stats?.memoryCount ?? 0, result.stats?.wikiCount ?? 0)
          } catch {
            // scan failed silently
          }
        },
      },
      {
        id: 'act-export-all',
        label: 'Export All Data',
        category: 'Actions',
        icon: Download,
        action: async () => {
          await window.lodestone.exportAllData()
        },
      },
    ]

    const config: Command[] = [
      {
        id: 'cfg-toggle-autocapture',
        label: 'Toggle autoCapture',
        category: 'Config',
        icon: ToggleLeft,
        action: async () => {
          // Best-effort toggle — safety settings update via IPC
          try {
            const current = await window.lodestone.getConstraints()
            const currentAuto = (current as any)?.autoCapture || true
            const currentConfirm = (current as any)?.requireConfirmation || true
            await window.lodestone.updateSafety({
              autoCapture: !currentAuto,
              requireConfirmation: currentConfirm,
            })
          } catch {
            // Fallback: navigate to Safety view
            store.setActiveView('safety')
          }
        },
      },
      {
        id: 'cfg-toggle-confirmation',
        label: 'Toggle requireConfirmation',
        category: 'Config',
        icon: ToggleRight,
        action: async () => {
          try {
            const current = await window.lodestone.getConstraints()
            const currentAuto = (current as any)?.autoCapture || true
            const currentConfirm = (current as any)?.requireConfirmation || true
            await window.lodestone.updateSafety({
              autoCapture: currentAuto,
              requireConfirmation: !currentConfirm,
            })
          } catch {
            store.setActiveView('safety')
          }
        },
      },
      {
        id: 'cfg-edit-identity',
        label: 'Edit Identity',
        category: 'Config',
        icon: Lock,
        action: () => store.setActiveView('identity'),
      },
    ]

    return [...nav, ...actions, ...config]
  }, [store])

  // Filter commands by fuzzy search
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    return commands
      .map((cmd) => ({ cmd, score: fuzzyScore(query, cmd.label) }))
      .filter(({ cmd, score }) => score > 0 && fuzzyMatch(query, cmd.label))
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd)
  }, [commands, query])

  // Group filtered commands by category for display
  const grouped = useMemo(() => {
    const groups: Record<CommandCategory, Command[]> = {
      Navigation: [],
      Actions: [],
      Config: [],
    }
    for (const cmd of filtered) {
      groups[cmd.category].push(cmd)
    }
    return groups
  }, [filtered])

  // Flat list for keyboard navigation (matches displayed order)
  const flatList = useMemo(() => {
    return [...grouped.Navigation, ...grouped.Actions, ...grouped.Config]
  }, [grouped])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input when open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return
    const selected = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Global Cmd/Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setOpen])

  // Keyboard navigation within palette (React event type for JSX onKeyDown)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, flatList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = flatList[selectedIndex]
        if (cmd) {
          cmd.action()
          setOpen(false)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    },
    [flatList, selectedIndex, setOpen],
  )

  // Category badge colors
  const categoryColor = (cat: CommandCategory): string => {
    switch (cat) {
      case 'Navigation': return 'var(--accent)'
      case 'Actions': return '#06B6D4'
      case 'Config': return '#F59E0B'
    }
  }

  const categoryBg = (cat: CommandCategory): string => {
    switch (cat) {
      case 'Navigation': return 'rgba(139, 92, 246, 0.12)'
      case 'Actions': return 'rgba(6, 182, 212, 0.12)'
      case 'Config': return 'rgba(245, 158, 11, 0.12)'
    }
  }

  let runningIndex = 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-dim)' }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands..."
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text)' }}
                onKeyDown={handleKeyDown}
              />
              <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto p-2">
              {flatList.length === 0 && (
                <div className="py-8 text-center">
                  <Search className="w-6 h-6 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-dim)' }} />
                  <div className="text-sm" style={{ color: 'var(--text-dim)' }}>No commands found</div>
                </div>
              )}

              {(Object.keys(grouped) as CommandCategory[]).map((cat) => {
                const items = grouped[cat]
                if (items.length === 0) return null
                return (
                  <div key={cat} className="mb-1">
                    <div
                      className="text-xs font-medium uppercase tracking-wider px-3 py-1.5"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      {cat}
                    </div>
                    {items.map((cmd) => {
                      const idx = runningIndex++
                      const isSelected = idx === selectedIndex
                      const Icon = cmd.icon
                      return (
                        <div
                          key={cmd.id}
                          data-index={idx}
                          onClick={() => {
                            cmd.action()
                            setOpen(false)
                          }}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                          style={{
                            background: isSelected ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                          }}
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: categoryBg(cmd.category) }}
                          >
                            <Icon className="w-3.5 h-3.5" style={{ color: categoryColor(cmd.category) }} />
                          </div>
                          <span
                            className="text-sm flex-1"
                            style={{
                              color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                              fontWeight: isSelected ? 500 : 400,
                            }}
                          >
                            {cmd.label}
                          </span>
                          {/* Category badge */}
                          <span
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                            style={{
                              background: categoryBg(cmd.category),
                              color: categoryColor(cmd.category),
                            }}
                          >
                            {cmd.category}
                          </span>
                          {/* Shortcut */}
                          {cmd.shortcut && (
                            <kbd
                              className="text-xs px-1.5 py-0.5 rounded shrink-0"
                              style={{
                                background: 'var(--bg-elevated)',
                                color: 'var(--text-dim)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-4 py-2 border-t text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
            >
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <ArrowUp className="w-3 h-3" />
                  <ArrowDown className="w-3 h-3" />
                  Navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <CornerDownLeft className="w-3 h-3" />
                  Execute
                </span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {flatList.length} command{flatList.length !== 1 ? 's' : ''}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}