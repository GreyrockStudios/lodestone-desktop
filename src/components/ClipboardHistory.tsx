import { useState, useEffect, useCallback, useRef } from 'react'
import { Clipboard, Copy, Trash2, Search, Pin, Clock, X, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ClipboardEntry {
  id: string
  content: string
  type: 'text' | 'code' | 'url' | 'image'
  timestamp: number
  pinned: boolean
  source?: string
}

const MOCK_ENTRIES: ClipboardEntry[] = [
  { id: '1', content: 'npm install lodestone', type: 'code', timestamp: Date.now() - 60000, pinned: false, source: 'terminal' },
  { id: '2', content: 'https://github.com/GreyrockStudios/lodestone', type: 'url', timestamp: Date.now() - 120000, pinned: false, source: 'browser' },
  { id: '3', content: 'The quick brown fox jumps over the lazy dog', type: 'text', timestamp: Date.now() - 300000, pinned: false },
  { id: '4', content: 'const agent = new Lodestone(config)', type: 'code', timestamp: Date.now() - 600000, pinned: true, source: 'editor' },
  { id: '5', content: 'https://lodestone.greyrockstudios.com', type: 'url', timestamp: Date.now() - 900000, pinned: false, source: 'browser' },
  { id: '6', content: 'Meeting notes: discuss Q3 roadmap and pricing strategy for Lodestone Pro tier', type: 'text', timestamp: Date.now() - 1800000, pinned: false, source: 'notes' },
]

const TYPE_ICONS = { text: Clipboard, code: Clipboard, url: Clipboard, image: Clipboard }
const TYPE_COLORS = { text: '#9CA3AF', code: '#3B82F6', url: '#8B5CF6', image: '#10B981' }
const TYPE_LABELS = { text: 'Text', code: 'Code', url: 'URL', image: 'Image' }

export function ClipboardHistory() {
  const [entries, setEntries] = useState<ClipboardEntry[]>(MOCK_ENTRIES)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [maxItems, setMaxItems] = useState(100)
  const inputRef = useRef<HTMLInputElement>(null)

  // Simulate clipboard monitoring
  useEffect(() => {
    if (!enabled) return
    // In a real app, this would use Electron clipboard API
    const interval = setInterval(() => {
      // Simulated — just keep existing entries
    }, 5000)
    return () => clearInterval(interval)
  }, [enabled])

  const copyEntry = useCallback((entry: ClipboardEntry) => {
    navigator.clipboard.writeText(entry.content)
    setCopiedId(entry.id)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    if (selected === id) setSelected(null)
  }, [selected])

  const togglePin = useCallback((id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, pinned: !e.pinned } : e))
  }, [])

  const clearHistory = useCallback(() => {
    if (!confirm('Clear all non-pinned clipboard history?')) return
    setEntries(prev => prev.filter(e => e.pinned))
  }, [])

  const filtered = entries
    .filter(e => filterType === 'all' || e.type === filterType)
    .filter(e => !search || e.content.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.timestamp - a.timestamp
    })

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  const detectType = (content: string): ClipboardEntry['type'] => {
    if (/^https?:\/\//.test(content)) return 'url'
    if (/^(const |let |var |function |import |class |def |if |for |while )/.test(content) || /[{};]$/.test(content)) return 'code'
    return 'text'
  }

  const addManual = useCallback(() => {
    const content = prompt('Add to clipboard history:')
    if (!content) return
    const entry: ClipboardEntry = {
      id: crypto.randomUUID(),
      content,
      type: detectType(content),
      timestamp: Date.now(),
      pinned: false,
    }
    setEntries(prev => [entry, ...prev].slice(0, maxItems))
  }, [maxItems])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <Clipboard className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Clipboard</h2>
          <button
            onClick={() => setEnabled(!enabled)}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: enabled ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
              color: enabled ? '#10B981' : 'var(--text-dim)',
            }}
          >
            {enabled ? '● Monitoring' : '○ Paused'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={addManual} className="p-1.5 rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="Add manually">
            <Clipboard className="w-3.5 h-3.5" />
          </button>
          <button onClick={clearHistory} className="p-1.5 rounded-lg" style={{ background: 'var(--bg-elevated)', color: '#EF4444' }} title="Clear non-pinned">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clipboard..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />
        </div>
        {['all', 'text', 'code', 'url'].map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className="px-2 py-1 rounded-lg text-xs transition-all"
            style={{
              background: filterType === t ? 'rgba(139,92,246,0.15)' : 'var(--bg-card)',
              color: filterType === t ? 'var(--accent)' : 'var(--text-dim)',
              border: '1px solid',
              borderColor: filterType === t ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {t === 'all' ? 'All' : TYPE_LABELS[t as keyof typeof TYPE_LABELS]}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-dim)' }}>
            <Clipboard className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{search ? 'No matching entries' : 'Clipboard is empty'}</p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map(entry => {
              const color = TYPE_COLORS[entry.type]
              const isSelected = selected === entry.id
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="px-3 py-2.5 group"
                  style={{ borderBottom: '1px solid var(--border)', background: isSelected ? 'var(--bg-elevated)' : 'transparent' }}
                  onClick={() => setSelected(entry.id)}
                >
                  <div className="flex items-start gap-2">
                    {/* Type indicator */}
                    <div className="w-1 h-full self-stretch rounded-full flex-shrink-0" style={{ background: color, minHeight: '24px' }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: `${color}15`, color }}>
                          {TYPE_LABELS[entry.type]}
                        </span>
                        {entry.source && (
                          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>from {entry.source}</span>
                        )}
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-dim)' }}>{formatTime(entry.timestamp)}</span>
                      </div>
                      <pre className="text-xs font-mono whitespace-pre-wrap truncate" style={{ color: 'var(--text)', maxHeight: isSelected ? '200px' : '36px', overflow: 'hidden' }}>
                        {entry.content}
                      </pre>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); copyEntry(entry) }} className="p-1 rounded" title="Copy">
                        {copiedId === entry.id ? <Check className="w-3 h-3" style={{ color: '#10B981' }} /> : <Copy className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); togglePin(entry.id) }} className="p-1 rounded" title="Pin">
                        <Pin className="w-3 h-3" style={{ color: entry.pinned ? '#F59E0B' : 'var(--text-dim)', fill: entry.pinned ? '#F59E0B' : 'none' }} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteEntry(entry.id) }} className="p-1 rounded" title="Delete">
                        <Trash2 className="w-3 h-3" style={{ color: '#EF4444' }} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)', background: 'var(--bg-elevated)' }}>
        <span>{filtered.length} entries{filtered.filter(e => e.pinned).length > 0 && ` · ${filtered.filter(e => e.pinned).length} pinned`}</span>
        <span>Max: {maxItems}</span>
      </div>
    </div>
  )
}