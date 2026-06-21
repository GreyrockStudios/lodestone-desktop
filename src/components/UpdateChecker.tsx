import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpCircle, X, ExternalLink } from 'lucide-react'

interface ReleaseInfo {
  tagName: string
  htmlUrl: string
  version: string
}

/**
 * Checks GitHub releases for a newer version of the app.
 * Shows a dismissible banner at the top of the Dashboard if an update is available.
 * Auto-dismisses after 10 seconds. Silently fails if offline.
 */
export function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState<ReleaseInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkForUpdate() {
      try {
        const currentVersion = await window.lodestone.appVersion()

        const res = await fetch(
          'https://api.github.com/repos/GreyrockStudios/lodestone-desktop/releases/latest',
          { signal: AbortSignal.timeout(8000) }
        )

        if (!res.ok || cancelled) return

        const data = await res.json()
        if (cancelled) return

        // Extract version from tag_name (e.g. "v0.2.0" → "0.2.0")
        const tag = (data.tag_name || '').replace(/^v/, '')
        if (!tag || !isVersionNewer(tag, currentVersion)) return

        setUpdateAvailable({
          tagName: data.tag_name || tag,
          htmlUrl: data.html_url || `https://github.com/GreyrockStudios/lodestone-desktop/releases/tag/${tag}`,
          version: tag,
        })
      } catch {
        // Offline or API error — silently ignore
      }
    }

    checkForUpdate()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Auto-dismiss after 10s once update is shown
  useEffect(() => {
    if (updateAvailable && !dismissed) {
      timerRef.current = setTimeout(() => setDismissed(true), 10000)
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }
  }, [updateAvailable, dismissed])

  const handleView = () => {
    if (updateAvailable) {
      window.lodestone.openExternal(updateAvailable.htmlUrl)
    }
    setDismissed(true)
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  return (
    <AnimatePresence>
      {updateAvailable && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mx-6 mt-4"
        >
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <ArrowUpCircle className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />
            <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>
              Update available — <span className="font-semibold">v{updateAvailable.version}</span>
            </span>
            <button
              onClick={handleView}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-all hover:opacity-80"
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10B981',
              }}
            >
              View
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              onClick={handleDismiss}
              className="opacity-50 hover:opacity-100 transition-opacity shrink-0"
              style={{ color: 'var(--text-dim)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Returns true if `remote` is a newer semver than `current`.
 * Both should be stripped of leading "v".
 */
function isVersionNewer(remote: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)

  const r = parse(remote)
  const c = parse(current)

  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const rv = r[i] || 0
    const cv = c[i] || 0
    if (rv > cv) return true
    if (rv < cv) return false
  }
  return false
}