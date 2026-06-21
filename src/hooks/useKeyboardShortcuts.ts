import { useEffect, useState } from 'react'
import { useStore } from '../store'

/**
 * Global keyboard shortcuts for the app.
 * Cmd/Ctrl+1-9 switches between views.
 * Cmd/Ctrl+K opens command palette.
 * Cmd/Ctrl+Shift+F opens search-all.
 * Cmd/Ctrl+, opens settings.
 */
const VIEW_KEYS: Record<string, string> = {
  '1': 'dashboard',
  '2': 'chat',
  '3': 'brain',
  '4': 'memory',
  '5': 'history',
  '6': 'tools',
  '7': 'schedule',
  '8': 'safety',
  '9': 'identity',
}

export function useKeyboardShortcuts() {
  const { setActiveView } = useStore()
  const [searchAllOpen, setSearchAllOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // View switching: Cmd+1 through Cmd+9
      if (e.key in VIEW_KEYS && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        setActiveView(VIEW_KEYS[e.key])
        return
      }

      // Cmd+Shift+F → Search All
      if (e.key === 'f' && e.shiftKey) {
        e.preventDefault()
        setSearchAllOpen(true)
        return
      }

      // Cmd+, → Settings
      if (e.key === ',') {
        e.preventDefault()
        setActiveView('settings')
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveView])

  return { searchAllOpen, setSearchAllOpen }
}