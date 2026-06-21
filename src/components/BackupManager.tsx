import { useState, useCallback, useRef } from 'react'
import {
  Download, Upload, Clock, HardDrive, Cloud, Trash2,
  Loader2, AlertTriangle, Check, X, Calendar, RefreshCw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

interface BackupEntry {
  id: string
  date: string
  size: string
  type: 'manual' | 'daily' | 'weekly' | 'monthly'
  path: string
}

interface S3Config {
  endpoint: string
  bucket: string
  region: string
  accessKey: string
  secretKey: string
  prefix: string
}

// ─── Demo History ─────────────────────────────────────────────────────

const DEMO_HISTORY: BackupEntry[] = [
  { id: '1', date: '2026-06-20 03:00', size: '24.3 MB', type: 'daily', path: '~/.lodestone/backups/daily-2026-06-20.tar.gz' },
  { id: '2', date: '2026-06-19 03:00', size: '23.8 MB', type: 'daily', path: '~/.lodestone/backups/daily-2026-06-19.tar.gz' },
  { id: '3', date: '2026-06-15 03:00', size: '22.1 MB', type: 'weekly', path: '~/.lodestone/backups/weekly-2026-06-15.tar.gz' },
  { id: '4', date: '2026-06-01 03:00', size: '21.5 MB', type: 'monthly', path: '~/.lodestone/backups/monthly-2026-06-01.tar.gz' },
  { id: '5', date: '2026-05-28 14:30', size: '20.9 MB', type: 'manual', path: '~/.lodestone/backups/manual-2026-05-28.tar.gz' },
]

// ─── BackupManager ────────────────────────────────────────────────────

export function BackupManager() {
  const [history, setHistory] = useState<BackupEntry[]>(() => {
    try {
      const raw = localStorage.getItem('lodestone-backup-history')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return DEMO_HISTORY
  })
  const [schedule, setSchedule] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(() => {
    return (localStorage.getItem('lodestone-backup-schedule') as 'none' | 'daily' | 'weekly' | 'monthly') || 'none'
  })
  const [creating, setCreating] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string } | null>(null)
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showS3Config, setShowS3Config] = useState(false)
  const [s3Config, setS3Config] = useState<S3Config>(() => {
    try {
      const raw = localStorage.getItem('lodestone-s3-config')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { endpoint: '', bucket: '', region: 'us-east-1', accessKey: '', secretKey: '', prefix: 'lodestone-backups/' }
  })
  const [s3Saving, setS3Saving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCreateBackup = useCallback(async () => {
    setCreating(true)
    setCreateResult(null)
    try {
      const result = await window.lodestone.execCommand('cd ~ && tar czf /tmp/lodestone-backup-$(date +%Y%m%d-%H%M%S).tar.gz .lodestone/ 2>&1 && ls -lh /tmp/lodestone-backup-*.tar.gz | tail -1')
      if (result.exitCode === 0) {
        const sizeMatch = result.stdout.match(/(\S+)\s+\/tmp/)
        const size = sizeMatch ? sizeMatch[1] : 'Unknown'
        const newEntry: BackupEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString().replace('T', ' ').substring(0, 16),
          size,
          type: 'manual',
          path: '/tmp/lodestone-backup-latest.tar.gz',
        }
        const updated = [newEntry, ...history].slice(0, 20)
        setHistory(updated)
        localStorage.setItem('lodestone-backup-history', JSON.stringify(updated))
        setCreateResult({ success: true, message: 'Backup created successfully!' })
      } else {
        setCreateResult({ success: false, message: `Backup failed: ${result.stderr || result.stdout}` })
      }
    } catch (err) {
      setCreateResult({ success: false, message: `Error: ${(err as Error).message}` })
    }
    setCreating(false)
  }, [history])

  const handleRestore = useCallback(async (filePath: string) => {
    setRestoring(true)
    setRestoreResult(null)
    try {
      const result = await window.lodestone.execCommand(`cd ~ && tar xzf "${filePath}" 2>&1`)
      if (result.exitCode === 0) {
        setRestoreResult({ success: true, message: 'Backup restored successfully. Restart recommended.' })
      } else {
        setRestoreResult({ success: false, message: `Restore failed: ${result.stderr || result.stdout}` })
      }
    } catch (err) {
      setRestoreResult({ success: false, message: `Error: ${(err as Error).message}` })
    }
    setRestoring(false)
    setRestoreConfirm(null)
  }, [])

  const handleUploadRestore = useCallback(async (file: File) => {
    setRestoring(true)
    setRestoreResult(null)
    try {
      const content = await file.arrayBuffer()
      const uint8 = new Uint8Array(content)
      // Write file via lodestone API
      const base64 = btoa(String.fromCharCode(...uint8))
      await window.lodestone.writeFile(`/tmp/${file.name}`, base64)
      await handleRestore(`/tmp/${file.name}`)
    } catch (err) {
      setRestoreResult({ success: false, message: `Upload failed: ${(err as Error).message}` })
      setRestoring(false)
    }
  }, [handleRestore])

  const handleScheduleChange = useCallback((s: 'none' | 'daily' | 'weekly' | 'monthly') => {
    setSchedule(s)
    localStorage.setItem('lodestone-backup-schedule', s)
    // In production, this would update a cron job
  }, [])

  const handleSaveS3 = useCallback(() => {
    setS3Saving(true)
    try {
      localStorage.setItem('lodestone-s3-config', JSON.stringify(s3Config))
    } catch { /* ignore */ }
    setS3Saving(false)
    setShowS3Config(false)
  }, [s3Config])

  const typeColors: Record<string, { bg: string; text: string }> = {
    manual: { bg: 'rgba(139, 92, 246, 0.1)', text: '#8B5CF6' },
    daily: { bg: 'rgba(6, 182, 212, 0.1)', text: '#06B6D4' },
    weekly: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10B981' },
    monthly: { bg: 'rgba(245, 158, 11, 0.1)', text: '#F59E0B' },
  }

  return (
    <div className="space-y-4">
      {/* Create Backup */}
      <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div>
          <div className="text-sm font-medium">Create Backup</div>
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Package ~/.lodestone/ into a .tar.gz archive</div>
        </div>
        <button onClick={handleCreateBackup} disabled={creating} className="btn-secondary flex items-center gap-2 text-xs px-3 py-2" style={{ opacity: creating ? 0.5 : 1 }}>
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {creating ? 'Creating...' : 'Create Backup'}
        </button>
      </div>
      {createResult && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: createResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${createResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, color: createResult.success ? '#10B981' : '#EF4444' }}>
          {createResult.success ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {createResult.message}
          <button onClick={() => setCreateResult(null)} style={{ marginLeft: 'auto' }}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Restore from Backup */}
      <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div>
          <div className="text-sm font-medium">Restore from Backup</div>
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Upload a .tar.gz backup to restore ~/.lodestone/</div>
        </div>
        <button onClick={() => fileInputRef.current?.click()} disabled={restoring} className="btn-secondary flex items-center gap-2 text-xs px-3 py-2" style={{ opacity: restoring ? 0.5 : 1 }}>
          {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {restoring ? 'Restoring...' : 'Upload & Restore'}
        </button>
        <input ref={fileInputRef} type="file" accept=".tar.gz,.tgz" onChange={e => e.target.files?.[0] && handleUploadRestore(e.target.files[0])} style={{ display: 'none' }} disabled={restoring} />
      </div>
      {restoreResult && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: restoreResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${restoreResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, color: restoreResult.success ? '#10B981' : '#EF4444' }}>
          {restoreResult.success ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {restoreResult.message}
          <button onClick={() => setRestoreResult(null)} style={{ marginLeft: 'auto' }}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Scheduled Backups */}
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <div className="text-sm font-medium">Scheduled Backups</div>
        </div>
        <div className="flex gap-2">
          {(['none', 'daily', 'weekly', 'monthly'] as const).map(s => (
            <button
              key={s}
              onClick={() => handleScheduleChange(s)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: schedule === s ? 'var(--accent)' : 'var(--bg-card)',
                color: schedule === s ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${schedule === s ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {s === 'none' ? 'Off' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {schedule !== 'none' && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
            Automatic {schedule} backup will run at 3:00 AM local time.
          </p>
        )}
      </div>

      {/* Backup History */}
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <div className="text-sm font-medium">Backup History</div>
        </div>
        <div className="space-y-2">
          {history.map(entry => {
            const colors = typeColors[entry.type] || typeColors.manual
            return (
              <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{entry.date}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: colors.bg, color: colors.text }}>{entry.type}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <HardDrive className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{entry.size}</span>
                  </div>
                </div>
                <button
                  onClick={() => setRestoreConfirm(entry.id)}
                  className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Restore
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cloud Backup Config */}
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <div>
              <div className="text-sm font-medium">Cloud Backup</div>
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>S3-compatible storage (optional)</div>
            </div>
          </div>
          <button onClick={() => setShowS3Config(!showS3Config)} className="btn-secondary text-xs px-3 py-1.5">
            {showS3Config ? 'Hide' : 'Configure'}
          </button>
        </div>
        {showS3Config && (
          <div className="mt-3 space-y-2">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Endpoint</label>
              <input type="text" value={s3Config.endpoint} onChange={e => setS3Config(prev => ({ ...prev, endpoint: e.target.value }))} placeholder="https://s3.amazonaws.com" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Bucket</label>
                <input type="text" value={s3Config.bucket} onChange={e => setS3Config(prev => ({ ...prev, bucket: e.target.value }))} placeholder="my-lodestone-backups" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Region</label>
                <input type="text" value={s3Config.region} onChange={e => setS3Config(prev => ({ ...prev, region: e.target.value }))} placeholder="us-east-1" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Access Key</label>
              <input type="password" value={s3Config.accessKey} onChange={e => setS3Config(prev => ({ ...prev, accessKey: e.target.value }))} placeholder="AKIA..." className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Secret Key</label>
              <input type="password" value={s3Config.secretKey} onChange={e => setS3Config(prev => ({ ...prev, secretKey: e.target.value }))} placeholder="..." className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Key Prefix</label>
              <input type="text" value={s3Config.prefix} onChange={e => setS3Config(prev => ({ ...prev, prefix: e.target.value }))} placeholder="lodestone-backups/" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <button onClick={handleSaveS3} disabled={s3Saving} className="btn-primary text-xs px-4 py-2">
              {s3Saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save S3 Config
            </button>
          </div>
        )}
      </div>

      {/* Restore Confirmation Dialog */}
      {restoreConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setRestoreConfirm(null)}>
          <div className="max-w-sm w-full mx-4 p-6 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#F59E0B' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Restore from Backup?</h3>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>This will overwrite current data</p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Restoring will replace your current ~/.lodestone/ directory with the backup data. This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRestoreConfirm(null)} className="btn-secondary text-xs px-4 py-2">Cancel</button>
              <button
                onClick={() => {
                  const entry = history.find(e => e.id === restoreConfirm)
                  if (entry) handleRestore(entry.path)
                }}
                disabled={restoring}
                className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-medium"
                style={{ background: '#F59E0B', color: '#000', border: 'none', cursor: 'pointer', opacity: restoring ? 0.5 : 1 }}
              >
                {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}