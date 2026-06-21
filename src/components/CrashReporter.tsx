import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

interface CrashToast {
  id: number
  message: string
}

/**
 * Global crash reporter.
 *
 * Listens for `error` and `unhandledrejection` events on `window`.
 * Writes crash logs to ~/.lodestone/crash-log.txt via IPC.
 * Shows a toast notification when an error is caught.
 */
export function CrashReporter() {
  const [toasts, setToasts] = useState<CrashToast[]>([])
  const toastIdRef = useRef(0)

  const reportError = useCallback(async (source: string, message: string, stack?: string) => {
    const fullMessage = stack ? `${message}\n${stack}` : message
    const logLine = `[${new Date().toISOString()}] [${source}] ${fullMessage}\n`

    // Write to crash log via IPC (fire and forget — don't block error handling)
    try {
      await window.lodestone.writeCrashLog(logLine)
    } catch {
      // IPC not available or failed — nothing we can do
    }

    // Show toast
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message: message.slice(0, 120) }].slice(-3))

    // Auto-dismiss toast after 6s
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 6000)
  }, [])

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      event.preventDefault()
      reportError('error', event.message || 'Unknown error', event.error?.stack)
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault()
      const reason = event.reason
      const message = reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : 'Unhandled promise rejection'
      const stack = reason instanceof Error ? reason.stack : undefined
      reportError('unhandledrejection', message, stack)
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [reportError])

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              minWidth: 300,
              maxWidth: 400,
            }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Something went wrong
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                {toast.message}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                Error logged to ~/.lodestone/crash-log.txt
              </p>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="opacity-50 hover:opacity-100 transition-opacity shrink-0"
              style={{ color: 'var(--text-dim)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}