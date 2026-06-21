import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, FileText, Plus, X, Search } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface Template {
  id: string
  text: string
  category: string
  custom?: boolean
}

// ─── Default Templates ────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Template[] = [
  // Research
  { id: 'r1', text: 'Summarize this article:', category: 'Research' },
  { id: 'r2', text: 'Find recent papers on:', category: 'Research' },
  // Code
  { id: 'c1', text: 'Debug this error:', category: 'Code' },
  { id: 'c2', text: 'Review this code:', category: 'Code' },
  { id: 'c3', text: 'Write a function that:', category: 'Code' },
  // Writing
  { id: 'w1', text: 'Draft an email about:', category: 'Writing' },
  { id: 'w2', text: 'Write a blog post about:', category: 'Writing' },
  // General
  { id: 'g1', text: "What's the weather?", category: 'General' },
  { id: 'g2', text: 'Tell me about:', category: 'General' },
]

const CATEGORIES = ['Research', 'Code', 'Writing', 'General', 'Custom']

// ─── Message Templates Component ─────────────────────────────────────

interface MessageTemplatesProps {
  onInsert: (text: string) => void
  currentInput: string
}

export function MessageTemplates({ onInsert, currentInput }: MessageTemplatesProps) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load custom templates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lodestone-templates')
      if (saved) {
        const custom = JSON.parse(saved) as Template[]
        setTemplates(prev => {
          const ids = new Set(prev.map(t => t.id))
          return [...prev, ...custom.filter(t => !ids.has(t.id))]
        })
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearchQuery('')
        setActiveCategory(null)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearchQuery('')
        setActiveCategory(null)
      }
    }
    if (open) document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  const handleInsert = useCallback((template: Template) => {
    onInsert(template.text)
    setOpen(false)
    setSearchQuery('')
    setActiveCategory(null)
  }, [onInsert])

  const handleSaveCurrent = useCallback(() => {
    const text = currentInput.trim()
    if (!text) return

    const newTemplate: Template = {
      id: `custom-${Date.now()}`,
      text,
      category: 'Custom',
      custom: true,
    }

    // Update state
    setTemplates(prev => [...prev, newTemplate])

    // Persist to localStorage
    try {
      const existing = localStorage.getItem('lodestone-templates')
      const custom = existing ? JSON.parse(existing) as Template[] : []
      custom.push(newTemplate)
      localStorage.setItem('lodestone-templates', JSON.stringify(custom))
    } catch {
      // localStorage might be unavailable
    }

    setOpen(false)
    setSearchQuery('')
    setActiveCategory(null)
  }, [currentInput])

  const handleDeleteTemplate = useCallback((id: string) => {
    setTemplates(prev => {
      const next = prev.filter(t => t.id !== id)
      // Update localStorage custom templates
      const custom = next.filter(t => t.custom)
      try {
        localStorage.setItem('lodestone-templates', JSON.stringify(custom))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  // Filter templates
  const filtered = templates.filter(t => {
    if (activeCategory && t.category !== activeCategory) return false
    if (searchQuery && !t.text.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Group by category
  const grouped: Record<string, Template[]> = {}
  for (const t of filtered) {
    if (!grouped[t.category]) grouped[t.category] = []
    grouped[t.category].push(t)
  }

  const categoryOrder = activeCategory ? [activeCategory] : CATEGORIES.filter(c => grouped[c])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
        style={{
          background: open ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-elevated)',
          border: `1px solid ${open ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
          cursor: 'pointer',
        }}
        title="Message templates"
      >
        <FileText
          className="w-4 h-4"
          style={{ color: open ? 'var(--accent)' : 'var(--text-muted)' }}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              right: 0,
              width: 320,
              maxHeight: 400,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 100,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Search bar */}
            <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <Search className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                autoFocus
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 4, padding: '6px 8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
              <CategoryChip
                label="All"
                active={activeCategory === null}
                onClick={() => setActiveCategory(null)}
              />
              {CATEGORIES.map(cat => (
                <CategoryChip
                  key={cat}
                  label={cat}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                />
              ))}
            </div>

            {/* Template list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {categoryOrder.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                  No templates found.
                </div>
              ) : (
                categoryOrder.map(cat => (
                  <div key={cat}>
                    {/* Category header */}
                    <div
                      style={{
                        padding: '6px 12px 2px',
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-dim)',
                      }}
                    >
                      {cat}
                    </div>
                    {/* Templates */}
                    {grouped[cat].map(t => (
                      <div
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 12px',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                        }}
                        onClick={() => handleInsert(t)}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
                          {t.text}
                        </span>
                        {t.custom && (
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 2,
                              borderRadius: 4,
                              opacity: 0.4,
                              flexShrink: 0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '0.4' }}
                            title="Delete template"
                          >
                            <X className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                          </button>
                        )}
                        <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-dim)', transform: 'rotate(-90deg)', flexShrink: 0, opacity: 0.5 }} />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Save current as template */}
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-card)',
              }}
            >
              <button
                onClick={handleSaveCurrent}
                disabled={!currentInput.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: currentInput.trim() ? 'pointer' : 'not-allowed',
                  color: currentInput.trim() ? 'var(--text)' : 'var(--text-dim)',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  opacity: currentInput.trim() ? 1 : 0.5,
                }}
                onMouseEnter={e => {
                  if (currentInput.trim()) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)'
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <Plus className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                Save current as template
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Category Chip ────────────────────────────────────────────────────

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: active ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
        border: `1px solid ${active ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}