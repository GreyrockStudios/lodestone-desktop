import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Play, Pause, Search, X, Loader2, ChevronDown
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface LogLine {
  text: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'OTHER'
  timestamp?: string
}

const MAX_LINES = 1000

function parseLogLevel(line: string): LogLine['level'] {
  const upper = line.toUpperCase()
  if (upper.includes('ERROR') || upper.includes('ERR') || upper.includes('FATAL')) return 'ERROR'
  if (upper.includes('WARN') || upper.includes('WARNING')) return 'WARN'
  if (upper.includes('DEBUG') || upper.includes('TRACE') || upper.includes('VERBOSE')) return 'DEBUG'
  if (upper.includes('INFO') || upper.includes('LOG') || upper.includes('NOTICE')) return 'INFO'
  return 'OTHER'
}

const LEVEL_COLORS: Record<LogLine['level'], string> = {
  INFO: '#06B6D4',
  WARN: '#F59E0B',
  ERROR: '#EF4444',
  DEBUG: '#6B7280',
  OTHER: 'var(--text-muted)',
}

const LEVEL_FILTERS: LogLine['level'][] = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'OTHER']

export function LogViewer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [filePath, setFilePath] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [lines, setLines] = useState<LogLine[]>([])
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<LogLine['level']>>(new Set(LEVEL_FILTERS))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const lastSizeRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const loadNewContent = useCallback(async () => {
    if (!filePath || paused) return
    try {
      const result = await window.lodestone.readFile(filePath)
      if (!result.success) {
        setError(result.error || 'Failed to read file')
        return
      }
      const content = result.content
      const currentSize = content.length

      if (currentSize < lastSizeRef.current) {
        // File was truncated or rotated — start fresh
        lastSizeRef.current = 0
        setLines([])
      }

      if (currentSize > lastSizeRef.current) {
        const newContent = content.slice(lastSizeRef.current)
        lastSizeRef.current = currentSize
        const newLines = newContent.split('\n').filter(l => l.trim())
        setLines(prev => {
          const all = [...prev, ...newLines.map(text => ({ text, level: parseLogLevel(text) }))]
          // Keep only last MAX_LINES
          return all.slice(-MAX_LINES)
        })
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }, [filePath, paused])

  // Start polling
  useEffect(() => {
    if (!open || !filePath) return
    setLoading(true)
    // Initial full read
    window.lodestone.readFile(filePath).then(result => {
      if (result.success) {
        lastSizeRef.current = result.content.length
        const allLines = result.content.split('\n').filter(l => l.trim())
        setLines(allLines.slice(-MAX_LINES).map(text => ({ text, level: parseLogLevel(text) })))
        setError('')
      } else {
        setError(result.error || 'Failed to read file')
      }
      setLoading(false)
    })

    intervalRef.current = setInterval(loadNewContent, 2000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [open, filePath, loadNewContent])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const handleLoadPath = () => {
    if (!pathInput.trim()) return
    setLines([])
    lastSizeRef.current = 0
    setFilePath(pathInput.trim())
    setPathInput('')
  }

  const handleBrowse = async () => {
    // Use file dialog via osascript on macOS
    const result = await window.lodestone.execCommand(
      `osascript -e 'set selectedFile to choose file' -e 'POSIX path of selectedFile' 2>/dev/null || echo ""`,
      undefined,
      60000
    )
    if (result.success && result.stdout.trim()) {
      const file = result.stdout.trim().split('\n').pop()?.trim() || ''
      if (file) {
        setLines([])
        lastSizeRef.current = 0
        setFilePath(file)
      }
    }
  }

  const toggleFilter = (level: LogLine['level']) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const filteredLines = lines.filter(line =>
    activeFilters.has(line.level) &&
    (!search || line.text.toLowerCase().includes(search.toLowerCase()))
  )

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
            <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Log Viewer</span>
            {filePath && (
              <span className="text-xs truncate max-w-xs" style={{ color: 'var(--text-dim)' }} title={filePath}>
                {filePath}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {filePath && (
              <button
                onClick={() => setPaused(!paused)}
                className="p-1.5 rounded-lg transition-all"
                style={{ background: 'var(--bg-elevated)' }}
                title={paused ? 'Resume' : 'Pause'}
              >
                {paused ? <Play className="w-3.5 h-3.5" style={{ color: '#10B981' }} /> : <Pause className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-all"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Path input */}
        {!filePath && (
          <div className="p-3 flex gap-2">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoadPath()}
              placeholder="/path/to/logfile.log"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button
              onClick={handleLoadPath}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Open
            </button>
            <button
              onClick={handleBrowse}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Browse
            </button>
          </div>
        )}

        {error && (
          <div className="px-3 py-1.5 text-xs" style={{ color: '#EF4444' }}>{error}</div>
        )}

        {/* Toolbar: search + filters */}
        {filePath && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--text-dim)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter..."
                className="w-full pl-7 pr-3 py-1 rounded text-xs outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
            <div className="flex items-center gap-1">
              {LEVEL_FILTERS.map(level => (
                <button
                  key={level}
                  onClick={() => toggleFilter(level)}
                  className="px-1.5 py-0.5 rounded text-xs font-medium transition-all"
                  style={{
                    background: activeFilters.has(level) ? `${LEVEL_COLORS[level]}20` : 'transparent',
                    color: activeFilters.has(level) ? LEVEL_COLORS[level] : 'var(--text-dim)',
                    border: `1px solid ${activeFilters.has(level) ? LEVEL_COLORS[level] + '40' : 'var(--border)'}`,
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Auto-scroll
            </label>
          </div>
        )}

        {/* Log content */}
        {filePath && (
          <div
            ref={scrollRef}
            className="overflow-y-auto p-2"
            style={{ height: filePath ? 'calc(100% - 100px)' : 'auto', fontFamily: 'SF Mono, Fira Code, monospace', fontSize: 11 }}
          >
            {loading && (
              <div className="flex items-center gap-2 p-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-dim)' }} />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Loading...</span>
              </div>
            )}
            {filteredLines.length === 0 && !loading ? (
              <p className="text-xs p-2" style={{ color: 'var(--text-dim)' }}>
                {lines.length === 0 ? 'No log lines yet.' : 'No lines match the current filters.'}
              </p>
            ) : (
              filteredLines.map((line, i) => (
                <div
                  key={i}
                  className="py-0.5 px-1 hover:bg-white/5"
                  style={{ color: LEVEL_COLORS[line.level], whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                >
                  {line.text}
                </div>
              ))
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}