import { useState, useCallback, useRef, useEffect } from 'react'
import { CheckCircle2, AlertCircle, Info, X, Bell } from 'lucide-react'

export type NotificationType = 'success' | 'error' | 'info'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message?: string
  timestamp: number
  dismissable?: boolean
  duration?: number // auto-dismiss after ms, 0 = manual
}

interface NotificationState {
  notifications: AppNotification[]
  push: (n: Omit<AppNotification, 'id' | 'timestamp'>) => void
  dismiss: (id: string) => void
  clear: () => void
}

let notificationId = 0

export function useNotifications(): NotificationState {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const push = useCallback((n: Omit<AppNotification, 'id' | 'timestamp'>) => {
    const id = `notif-${++notificationId}`
    const notification: AppNotification = {
      id,
      timestamp: Date.now(),
      dismissable: true,
      duration: 5000,
      ...n,
    }
    setNotifications(prev => [notification, ...prev].slice(0, 10))
    
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => dismiss(id), notification.duration)
      timersRef.current.set(id, timer)
    }
  }, [dismiss])

  const clear = useCallback(() => {
    setNotifications([])
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current.clear()
  }, [])

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current.clear()
    }
  }, [])

  return { notifications, push, dismiss, clear }
}

export function NotificationStack({ 
  notifications, 
  onDismiss 
}: { 
  notifications: AppNotification[]
  onDismiss: (id: string) => void
}) {
  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {notifications.map(n => (
        <NotificationCard key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function NotificationCard({ 
  notification, 
  onDismiss 
}: { 
  notification: AppNotification
  onDismiss: (id: string) => void
}) {
  const Icon = notification.type === 'success' ? CheckCircle2 
    : notification.type === 'error' ? AlertCircle 
    : Info
  
  const color = notification.type === 'success' ? '#10B981' 
    : notification.type === 'error' ? '#EF4444' 
    : '#06B6D4'

  const borderColor = notification.type === 'success' ? 'rgba(16, 185, 129, 0.3)' 
    : notification.type === 'error' ? 'rgba(239, 68, 68, 0.3)' 
    : 'rgba(6, 182, 212, 0.3)'

  return (
    <div
      className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${borderColor}`,
        minWidth: 280,
        maxWidth: 380,
        animation: 'slideIn 0.2s ease-out',
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {notification.message}
          </p>
        )}
      </div>
      {notification.dismissable && (
        <button
          onClick={() => onDismiss(notification.id)}
          className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-dim)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}