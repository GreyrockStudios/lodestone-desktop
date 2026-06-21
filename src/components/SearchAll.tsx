import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, FileText, Brain, Lightbulb, ArrowRight, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SearchResult {
  id: string
  type: 'wiki' | 'memory' | 'chat' | 'decision'
  title: string
  preview: string
  source: string
  timestamp?: number
}

interface SearchAllProps {
  open: boolean
  onClose: () => void
  onNavigate: (view: string) => void
}

export function SearchAll({ open, onClose, onNavigate }: SearchAllProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setQuery('')
      setResults([])
    }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      // In a real implementation, this would call window.lodestone.searchAll(q)
      // which would search wiki, memories, chat history, and decisions
      // For now, we simulate with mock results
      const mockResults: SearchResult[] = [
        {
          id: '1',
          type: 'wiki' as const,
          title: 'Deployment Playbook',
          preview: 'Docker build → tag → push → deploy via traefik...',
          source: 'wiki/concepts/',
          timestamp: Date.now() - 3600000,
        },
        {
          id: '2',
          type: 'memory' as const,
          title: 'User prefers TypeScript',
          preview: 'During the project setup, user explicitly asked for TypeScript...',
          source: 'memory/preferences/',
          timestamp: Date.now() - 86400000,
        },
        {
          id: '3',
          type: 'chat' as const,
          title: 'Conversation about Lodestone Desktop',
          preview: 'Discussion about building an Electron app for the agent...',
          source: 'conversations/',
          timestamp: Date.now() - 172800000,
        },
        {
          id: '4',
          type: 'decision' as const,
          title: 'Use LanceDB for vector storage',
          preview: 'Decided to use LanceDB over ChromaDB for embedded vector storage...',
          source: 'wiki/decisions/',
          timestamp: Date.now() - 259200000,
        },
      ].filter(r => 
        r.title.toLowerCase().includes(q.toLowerCase()) ||
        r.preview.toLowerCase().includes(q.toLowerCase())
      )
      setResults(mockResults)
      setSelectedIdx(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200)
    return () => clearTimeout(timer)
  }, [query, search])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      const result = results[selectedIdx]
      onNavigate(result.type === 'chat' ? 'history' : result.type === 'decision' ? 'safety' : result.type)
      onClose()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case 'wiki': return FileText
      case 'memory': return Lightbulb
      case 'chat': return ArrowRight
      case 'decision': return Brain
      default: return Search
    }
  }

  const typeColor = (type: string) => {
    switch (type) {
      case 'wiki': return '#06B6D4'
      case 'memory': return '#8B5CF6'
      case 'chat': return '#10B981'
      case 'decision': return '#F59E0B'
      default: return '#6B7280'
    }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998]"
            style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[9999] w-[560px] max-w-[90vw]"
          >
            <div
              className="rounded-2xl shadow-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <Search className="w-4 h-4 text-violet-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search everything — wiki, memories, chats, decisions..."
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: 'var(--text)' }}
                />
                <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[400px] overflow-y-auto">
                {loading && (
                  <div className="p-4 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
                    Searching...
                  </div>
                )}
                {!loading && results.length === 0 && query.length >= 2 && (
                  <div className="p-8 text-center">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-dim)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No results for "{query}"</p>
                  </div>
                )}
                {!loading && results.length === 0 && query.length < 2 && (
                  <div className="p-8 text-center">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-dim)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Type to search across everything</p>
                    <div className="flex items-center justify-center gap-4 mt-3">
                      {['wiki', 'memory', 'chat', 'decision'].map(t => {
                        const Icon = typeIcon(t)
                        return (
                          <div key={t} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                            <Icon className="w-3 h-3" style={{ color: typeColor(t) }} />
                            {t}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {results.map((result, idx) => {
                  const Icon = typeIcon(result.type)
                  const color = typeColor(result.type)
                  return (
                    <button
                      key={result.id}
                      onClick={() => {
                        onNavigate(result.type === 'chat' ? 'history' : result.type === 'decision' ? 'safety' : result.type)
                        onClose()
                      }}
                      className="w-full flex items-start gap-3 p-3 text-left transition-colors"
                      style={{
                        background: idx === selectedIdx ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                            {result.title}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color, fontSize: 10 }}>
                            {result.type}
                          </span>
                        </div>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {result.preview}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                          {result.source}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Footer */}
              {results.length > 0 && (
                <div className="px-4 py-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
                  <span>{results.length} results</span>
                  <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>↑↓</kbd>
                    <span>navigate</span>
                    <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>↵</kbd>
                    <span>open</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}