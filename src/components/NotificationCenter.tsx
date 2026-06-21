import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell, Check, CheckCheck, Trash2, AlertTriangle, AlertCircle,
  Info, CheckCircle2, Filter, Moon, Volume2, VolumeX,
  Settings, X, ChevronDown,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

type NotificationType = 'error' | 'warning' | 'info' | 'success'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: number
  read: boolean
  source: string
}

interface NotificationPrefs {
  enabledTypes: Record<NotificationType, boolean>
  soundEnabled: boolean
  soundType: 'chime' | 'ping' | 'none'
  bannerPosition: 'top-right' | 'bottom-right' | 'top-center'
  dndEnabled: boolean
  dndStart: string // "22:00"
  dndEnd: string // "07:00"
  badgeCountEnabled: boolean
}

// ─── Defaults & Storage ───────────────────────────────────────────────

const DEFAULT_PREFS: NotificationPrefs = {
  enabledTypes: { error: true, warning: true, info: true, success: true },
  soundEnabled: true,
  soundType: 'chime',
  bannerPosition: 'top-right',
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '07:00',
  badgeCountEnabled: true,
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'success', title: 'Engine Started', message: 'Agent engine started successfully on port 3001', timestamp: Date.now() - 60000, read: false, source: 'engine' },
  { id: '2', type: 'info', title: 'Memory Saved', message: 'New memory "project-preferences" stored to knowledge base', timestamp: Date.now() - 300000, read: false, source: 'memory' },
  { id: '3', type: 'error', title: 'API Rate Limit', message: 'OpenAI API returned 429 — rate limit exceeded. Retrying in 30s.', timestamp: Date.now() - 600000, read: true, source: 'llm' },
  { id: '4', type: 'warning', title: 'Disk Space Low', message: 'Only 2.1 GB free disk space remaining on /', timestamp: Date.now() - 1200000, read: true, source: 'system' },
  { id: '5', type: 'info', title: 'Schedule Triggered', message: 'Daily backup schedule executed successfully', timestamp: Date.now() - 1800000, read: false, source: 'schedule' },
  { id: '6', type: 'success', title: 'Tool Completed', message: 'web_search completed for "latest TypeScript features"', timestamp: Date.now() - 2400000, read: true, source: 'tools' },
  { id: '7', type: 'error', title: 'Connection Lost', message: 'WebSocket connection to engine failed. Reconnecting...', timestamp: Date.now() - 3600000, read: true, source: 'engine' },
  { id: '8', type: 'warning', title: 'High Token Usage', message: 'Total tokens this session exceeded 50,000', timestamp: Date.now() - 5400000, read: false, source: 'llm' },
  { id: '9', type: 'info', title: 'Wiki Updated', message: 'Page "architecture-decisions" updated with 3 new entries', timestamp: Date.now() - 7200000, read: true, source: 'wiki' },
  { id: '10', type: 'success', title: 'Backup Complete', message: 'Daily backup completed: 23.8 MB saved', timestamp: Date.now() - 10800000, read: true, source: 'system' },
]

function loadNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem('lodestone-notifications')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  // First run: seed with mock data
  localStorage.setItem('lodestone-notifications', JSON.stringify(MOCK_NOTIFICATIONS))
  return MOCK_NOTIFICATIONS
}

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem('lodestone-notification-prefs')
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function isInDND(prefs: NotificationPrefs): boolean {
  if (!prefs.dndEnabled) return false
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const [startH, startM] = prefs.dndStart.split(':').map(Number)
  const [endH, endM] = prefs.dndEnd.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  }
  // Crosses midnight
  return currentMinutes >= startMinutes || currentMinutes < endMinutes
}

const TYPE_CONFIG: Record<NotificationType, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; bg: string }> = {
  error: { icon: AlertCircle, color: '#EF4444', bg: 'rgba(239, 68, 68, 0.08)' },
  warning: { icon: AlertTriangle, color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.08)' },
  info: { icon: Info, color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.08)' },
  success: { icon: CheckCircle2, color: '#10B981', bg: 'rgba(16, 185, 129, 0.08)' },
}

// ─── NotificationCenter ───────────────────────────────────────────────

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>(loadNotifications)
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs)
  const [filter, setFilter] = useState<NotificationType | 'all'>('all')
  const [showSettings, setShowSettings] = useState(false)
  const unreadCount = notifications.filter(n => !n.read).length

  // Persist changes
  useEffect(() => {
    localStorage.setItem('lodestone-notifications', JSON.stringify(notifications))
  }, [notifications])

  useEffect(() => {
    localStorage.setItem('lodestone-notification-prefs', JSON.stringify(prefs))
  }, [prefs])

  // Update badge count
  useEffect(() => {
    if (prefs.badgeCountEnabled) {
      // Try to set Electron badge
      try {
        const badgeCount = unreadCount
        // @ts-expect-error - Electron-specific API
        if (window?.electron?.setBadge) {
          // @ts-expect-error
          window.electron.setBadge(badgeCount)
        }
      } catch { /* ignore if not in Electron */ }
    }
  }, [unreadCount, prefs.badgeCountEnabled])

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const deleteNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const filteredNotifications = notifications.filter(n => {
    if (filter !== 'all' && n.type !== filter) return false
    return true
  })

  const dndActive = isInDND(prefs)

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Notifications</h2>
          {unreadCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>{unreadCount}</span>
          )}
          {dndActive && (
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent)' }}>
              <Moon className="w-3 h-3" /> DND
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={markAllRead} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5" title="Mark all as read">
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
          <button onClick={clearAll} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5" title="Clear all">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="btn-secondary px-2 py-1.5" title="Settings">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 border-b flex items-center gap-1" style={{ borderColor: 'var(--border)' }}>
        {(['all', 'error', 'warning', 'info', 'success'] as const).map(f => {
          const count = f === 'all' ? notifications.length : notifications.filter(n => n.type === f).length
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded text-xs flex items-center gap-1"
              style={{
                background: filter === f ? 'var(--accent)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Notification Preferences</h3>
          <div className="space-y-3">
            {/* Per-type toggles */}
            {(['error', 'warning', 'info', 'success'] as NotificationType[]).map(type => {
              const config = TYPE_CONFIG[type]
              const Icon = config.icon
              return (
                <div key={type} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                    <span className="text-sm capitalize">{type}</span>
                  </div>
                  <button
                    onClick={() => setPrefs(prev => ({ ...prev, enabledTypes: { ...prev.enabledTypes, [type]: !prev.enabledTypes[type] } }))}
                    className="relative w-10 h-5 rounded-full transition-all"
                    style={{ background: prefs.enabledTypes[type] ? 'var(--accent)' : 'var(--border-hover)' }}
                  >
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: prefs.enabledTypes[type] ? '20px' : '2px' }} />
                  </button>
                </div>
              )
            })}

            {/* Sound */}
            <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                {prefs.soundEnabled ? <Volume2 className="w-4 h-4" style={{ color: 'var(--accent)' }} /> : <VolumeX className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />}
                <span className="text-sm">Sound</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={prefs.soundType}
                  onChange={e => setPrefs(prev => ({ ...prev, soundType: e.target.value as 'chime' | 'ping' | 'none' }))}
                  className="px-2 py-1 rounded text-xs"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  disabled={!prefs.soundEnabled}
                >
                  <option value="chime">Chime</option>
                  <option value="ping">Ping</option>
                  <option value="none">None</option>
                </select>
                <button
                  onClick={() => setPrefs(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
                  className="relative w-10 h-5 rounded-full transition-all"
                  style={{ background: prefs.soundEnabled ? 'var(--accent)' : 'var(--border-hover)' }}
                >
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: prefs.soundEnabled ? '20px' : '2px' }} />
                </button>
              </div>
            </div>

            {/* Badge */}
            <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm">Badge Count</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Show unread count on app icon</span>
              </div>
              <button
                onClick={() => setPrefs(prev => ({ ...prev, badgeCountEnabled: !prev.badgeCountEnabled }))}
                className="relative w-10 h-5 rounded-full transition-all"
                style={{ background: prefs.badgeCountEnabled ? 'var(--accent)' : 'var(--border-hover)' }}
              >
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: prefs.badgeCountEnabled ? '20px' : '2px' }} />
              </button>
            </div>

            {/* Banner Position */}
            <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <span className="text-sm">Toast Position</span>
              <select
                value={prefs.bannerPosition}
                onChange={e => setPrefs(prev => ({ ...prev, bannerPosition: e.target.value as 'top-right' | 'bottom-right' | 'top-center' }))}
                className="px-2 py-1 rounded text-xs"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="top-right">Top Right</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="top-center">Top Center</option>
              </select>
            </div>

            {/* DND */}
            <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4" style={{ color: prefs.dndEnabled ? 'var(--accent)' : 'var(--text-dim)' }} />
                  <span className="text-sm">Do Not Disturb</span>
                </div>
                <button
                  onClick={() => setPrefs(prev => ({ ...prev, dndEnabled: !prev.dndEnabled }))}
                  className="relative w-10 h-5 rounded-full transition-all"
                  style={{ background: prefs.dndEnabled ? 'var(--accent)' : 'var(--border-hover)' }}
                >
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: prefs.dndEnabled ? '20px' : '2px' }} />
                </button>
              </div>
              {prefs.dndEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="time" value={prefs.dndStart} onChange={e => setPrefs(prev => ({ ...prev, dndStart: e.target.value }))}
                    className="px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>to</span>
                  <input
                    type="time" value={prefs.dndEnd} onChange={e => setPrefs(prev => ({ ...prev, dndEnd: e.target.value }))}
                    className="px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Feed */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-dim)' }}>
            <Bell className="w-12 h-12 mb-3" style={{ opacity: 0.3 }} />
            <p className="text-sm">No notifications</p>
            <p className="text-xs mt-1">You're all caught up!</p>
          </div>
        )}
        {filteredNotifications.map(n => {
          const config = TYPE_CONFIG[n.type]
          const Icon = config.icon
          return (
            <div
              key={n.id}
              className="flex items-start gap-3 px-4 py-3 border-b transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: n.read ? 'transparent' : config.bg,
                cursor: 'pointer',
              }}
              onClick={() => markRead(n.id)}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: config.bg }}>
                <Icon className="w-4 h-4" style={{ color: config.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text)', fontWeight: n.read ? 400 : 600 }}>{n.title}</span>
                  {!n.read && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: config.color }} />}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{n.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{n.source}</span>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>·</span>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatTimeAgo(n.timestamp)}</span>
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteNotification(n.id) }}
                className="p-1 rounded opacity-0 hover:opacity-100 transition-opacity flex-shrink-0"
                style={{ color: 'var(--text-dim)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}