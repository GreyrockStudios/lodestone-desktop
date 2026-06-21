import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Eye, Plus, Trash2, X, Filter, Activity, FolderOpen
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface WatchEvent {
  id: string
  path: string
  event: 'created' | 'modified' | 'deleted' | 'renamed'
  timestamp: number
}

const STORAGE_KEY = 'lodestone-watch-paths'
const MAX_EVENTS = 500

const EVENT_COLORS: Record<WatchEvent['event'], string> = {
  created: '#10B981',
  modified: '#F59E0B',
  deleted: '#EF4444',
  renamed: '#8B5CF6',
}

const EVENT_ICONS: Record<WatchEvent['event'], string> = {
  created: '+',
  modified: '~',
  deleted: '×',
  renamed: '→',
}

type EventType = WatchEvent['event'] | 'all'
const ALL_EVENTS: WatchEvent['event'][] = ['created', 'modified', 'deleted', 'renamed']

function loadPaths(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function savePaths(paths: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
  } catch { /* ignore */ }
}

export function FileWatcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [watchPaths, setWatchPaths] = useState<string[]>(loadPaths)
  const [newPath, setNewPath] = useState('')
  const [events, setEvents] = useState<WatchEvent[]>([])
  const [activeFilter, setActiveFilter] = useState<EventType>('all')
  const eventCounterRef = useRef(0)

  // Persist watch paths
  useEffect(() => {
    savePaths(watchPaths)
  }, [watchPaths])

  // Start/stop watching paths via IPC
  useEffect(() => {
    if (!open) return

    // Listen for file events from main process
    const handler = (_: any, data: { path: string; event: WatchEvent['event'] }) => {
      setEvents(prev => {
        const newEvent: WatchEvent = {
          id: `evt-${++eventCounterRef.current}`,
          path: data.path,
          event: data.event,
          timestamp: Date.now(),
        }
        const all = [...prev, newEvent]
        return all.slice(-MAX_EVENTS)
      })
    }

    // Register handler and start watching
    const cleanup = (window as any).lodestone?.onFileEvent?.(handler)

    // Start watching all configured paths
    for (const p of watchPaths) {
      window.lodestone.watchPath?.(p).catch(() => {})
    }

    return () => {
      // Cleanup listener
      if (cleanup) cleanup()
      // Stop watching
      for (const p of watchPaths) {
        window.lodestone.unwatchPath?.(p).catch(() => {})
      }
    }
  }, [open, watchPaths]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddPath = async () => {
    if (!newPath.trim()) return
    const path = newPath.trim()
    if (watchPaths.includes(path)) return
    setWatchPaths(prev => [...prev, path])
    await window.lodestone.watchPath?.(path).catch(() => {})
    setNewPath('')
  }

  const handleBrowse = async () => {
    const result = await window.lodestone.execCommand(
      `osascript -e 'tell application "Finder" to set selectedFolder to choose folder' -e 'POSIX path of selectedFolder' 2>/dev/null || echo ""`,
      undefined,
      60000
    )
    if (result.success && result.stdout.trim()) {
      const folder = result.stdout.trim().split('\n').pop()?.trim() || ''
      if (folder && !watchPaths.includes(folder)) {
        setWatchPaths(prev => [...prev, folder])
        await window.lodestone.watchPath?.(folder).catch(() => {})
      }
    }
  }

  const handleRemovePath = async (path: string) => {
    setWatchPaths(prev => prev.filter(p => p !== path))
    await window.lodestone.unwatchPath?.(path).catch(() => {})
  }

  const handleClearEvents = () => {
    setEvents([])
  }

  const filteredEvents = activeFilter === 'all' ? events : events.filter(e => e.event === activeFilter)

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.3)',
          height: 320,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>File Watcher</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
              {watchPaths.length} paths · {events.length} events
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleClearEvents}
              className="text-xs px-2 py-1 rounded-lg transition-all"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-all"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        <div className="flex h-[calc(100%-44px)]">
          {/* Left: Watch paths */}
          <div className="w-64 border-r flex flex-col" style={{ borderColor: 'var(--border)' }}>
            <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
                  placeholder="/path/to/watch"
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={handleAddPath}
                  className="p-1.5 rounded-lg transition-all"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleBrowse}
                  className="p-1.5 rounded-lg transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                >
                  <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {watchPaths.length === 0 ? (
                <p className="text-xs p-3" style={{ color: 'var(--text-dim)' }}>Add directories to watch for file system changes.</p>
              ) : (
                watchPaths.map(p => (
                  <div key={p} className="flex items-center gap-2 px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <Activity className="w-3 h-3 flex-shrink-0" style={{ color: '#10B981' }} />
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-muted)' }} title={p}>{p}</span>
                    <button
                      onClick={() => handleRemovePath(p)}
                      className="p-0.5 rounded transition-all"
                    >
                      <Trash2 className="w-3 h-3" style={{ color: '#EF4444' }} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Events */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Event filter */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <Filter className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
              <button
                onClick={() => setActiveFilter('all')}
                className="text-xs px-2 py-0.5 rounded transition-all"
                style={{
                  background: activeFilter === 'all' ? 'var(--bg-elevated)' : 'transparent',
                  color: activeFilter === 'all' ? 'var(--text)' : 'var(--text-dim)',
                }}
              >
                All
              </button>
              {ALL_EVENTS.map(evt => (
                <button
                  key={evt}
                  onClick={() => setActiveFilter(evt)}
                  className="text-xs px-2 py-0.5 rounded transition-all"
                  style={{
                    background: activeFilter === evt ? `${EVENT_COLORS[evt]}20` : 'transparent',
                    color: activeFilter === evt ? EVENT_COLORS[evt] : 'var(--text-dim)',
                  }}
                >
                  {evt}
                </button>
              ))}
            </div>

            {/* Events list */}
            <div className="flex-1 overflow-y-auto" style={{ fontFamily: 'SF Mono, Fira Code, monospace', fontSize: 11 }}>
              {filteredEvents.length === 0 ? (
                <p className="text-xs p-3" style={{ color: 'var(--text-dim)' }}>
                  {events.length === 0 ? 'No file events yet. Add a path to start watching.' : 'No events match the current filter.'}
                </p>
              ) : (
                filteredEvents.slice().reverse().map(evt => (
                  <div
                    key={evt.id}
                    className="flex items-center gap-2 px-2 py-0.5 border-b"
                    style={{ borderColor: 'var(--border)', background: `${EVENT_COLORS[evt.event]}05` }}
                  >
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: `${EVENT_COLORS[evt.event]}20`, color: EVENT_COLORS[evt.event] }}
                    >
                      {EVENT_ICONS[evt.event]}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: EVENT_COLORS[evt.event] }}>
                      {evt.event}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{evt.path}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}