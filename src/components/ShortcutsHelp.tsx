import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'

interface ShortcutEntry {
  keys: string
  description: string
  category: string
}

const SHORTCUTS: ShortcutEntry[] = [
  // Navigation
  { keys: '⌘ 1', description: 'Dashboard', category: 'Navigation' },
  { keys: '⌘ 2', description: 'Chat', category: 'Navigation' },
  { keys: '⌘ 3', description: 'Brain', category: 'Navigation' },
  { keys: '⌘ 4', description: 'Memory', category: 'Navigation' },
  { keys: '⌘ 5', description: 'History', category: 'Navigation' },
  { keys: '⌘ 6', description: 'Tools', category: 'Navigation' },
  { keys: '⌘ 7', description: 'Schedule', category: 'Navigation' },
  { keys: '⌘ 8', description: 'Safety', category: 'Navigation' },
  { keys: '⌘ 9', description: 'Identity', category: 'Navigation' },
  // Actions
  { keys: '⌘ K', description: 'Command Palette', category: 'Actions' },
  { keys: '⌘ ⇧ F', description: 'Search All', category: 'Actions' },
  { keys: '⌘ ,', description: 'Settings', category: 'Actions' },
  { keys: '⌘ ?', description: 'This Help', category: 'Actions' },
  // Chat
  { keys: '↵', description: 'Send message', category: 'Chat' },
  { keys: '⇧ ↵', description: 'New line', category: 'Chat' },
  { keys: 'Esc', description: 'Close overlays', category: 'Chat' },
]

const CATEGORIES = ['Navigation', 'Actions', 'Chat']

/**
 * Modal overlay showing all keyboard shortcuts.
 * Triggered by Cmd/Ctrl+? (question mark — Shift+/ on US keyboards).
 */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Cmd+? — question mark is Shift+/ on US layouts
      // Also accept "?" directly for non-US keyboards
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setOpen(prev => !prev)
      }

      // Esc closes
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9998]"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed top-1/2 left-1/2 z-[9999] -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[90vw] max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(139, 92, 246, 0.15)' }}
                >
                  <Keyboard className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-dim)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {CATEGORIES.map(category => (
                <div key={category}>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {category}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SHORTCUTS.filter(s => s.category === category).map((s, i) => (
                      <div
                        key={`${category}-${i}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {s.description}
                        </span>
                        <kbd
                          className="text-xs font-mono px-2 py-0.5 rounded"
                          style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            color: 'var(--text)',
                          }}
                        >
                          {s.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className="px-6 py-3 border-t text-center"
              style={{ borderColor: 'var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Press <kbd className="font-mono">Esc</kbd> to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}