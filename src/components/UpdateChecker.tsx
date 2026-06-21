import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpCircle, X, Download, CheckCircle, Loader2, RefreshCw } from 'lucide-react'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available'

interface UpdateInfo {
  version: string
  releaseDate?: string
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  speed: number
}

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkForUpdates = useCallback(async () => {
    setState('checking')
    try {
      const ver = await window.lodestone.appVersion()
      setCurrentVersion(ver)

      // Listen for update events
      window.lodestone.onUpdateAvailable((info: UpdateInfo) => {
        setUpdateInfo(info)
        setState('available')
        setDismissed(false)
      })

      window.lodestone.onUpdateProgress((p: DownloadProgress) => {
        setProgress(p)
        setState('downloading')
      })

      window.lodestone.onUpdateDownloaded((info: UpdateInfo) => {
        setUpdateInfo(info)
        setState('downloaded')
        setDismissed(false)
      })

      // Trigger check
      const result = await window.lodestone.checkForUpdates()
      if (!result.available) {
        setState('not-available')
        // Auto-hide after 3s
        setTimeout(() => setState('idle'), 3000)
      }
    } catch {
      // Dev mode or offline — silently ignore
      setState('idle')
    }
  }, [])

  useEffect(() => {
    checkForUpdates()
    // Check every 4 hours
    const interval = setInterval(checkForUpdates, 4 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [checkForUpdates])

  // Auto-dismiss "not available" after 3s
  useEffect(() => {
    if (state === 'not-available' && !timerRef.current) {
      timerRef.current = setTimeout(() => setState('idle'), 3000)
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state])

  const handleInstall = useCallback(() => {
    window.lodestone.installUpdate()
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  // Don't render if idle, not-available (after timeout), or dismissed
  if (state === 'idle' || state === 'not-available' || dismissed) {
    return null
  }

  return (
    <AnimatePresence>
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
            background: state === 'downloaded'
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))'
              : state === 'downloading'
              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(139, 92, 246, 0.08))'
              : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))',
            border: '1px solid',
            borderColor: state === 'downloaded'
              ? 'rgba(16, 185, 129, 0.3)'
              : state === 'downloading'
              ? 'rgba(59, 130, 246, 0.25)'
              : 'rgba(16, 185, 129, 0.25)',
          }}
        >
          {/* Icon */}
          {state === 'checking' ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--text-dim)' }} />
          ) : state === 'downloading' ? (
            <Download className="w-4 h-4 shrink-0 animate-bounce" style={{ color: '#3B82F6' }} />
          ) : state === 'downloaded' ? (
            <CheckCircle className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />
          ) : (
            <ArrowUpCircle className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />
          )}

          {/* Content */}
          {state === 'available' && updateInfo && (
            <>
              <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>
                Update available — <span className="font-semibold">v{updateInfo.version}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--text-dim)' }}>
                  (current: v{currentVersion})
                </span>
              </span>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Downloading…</span>
            </>
          )}

          {state === 'downloading' && progress && (
            <>
              <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>
                Downloading update — {progress.percent}%
              </span>
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)' }}
                  animate={{ width: `${progress.percent}%` }}
                />
              </div>
              {progress.speed > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {(progress.speed / 1024 / 1024).toFixed(1)} MB/s
                </span>
              )}
            </>
          )}

          {state === 'downloaded' && (
            <>
              <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>
                Update ready — <span className="font-semibold">v{updateInfo?.version}</span>
              </span>
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:opacity-90"
                style={{ background: '#10B981', color: 'white' }}
              >
                <RefreshCw className="w-3 h-3" />
                Restart & Install
              </button>
            </>
          )}

          {/* Dismiss (only for 'available' state) */}
          {state === 'available' && (
            <button
              onClick={handleDismiss}
              className="opacity-50 hover:opacity-100 transition-opacity shrink-0"
              style={{ color: 'var(--text-dim)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}