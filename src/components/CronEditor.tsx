import { useState, useEffect, useCallback } from 'react'
import { Clock, Plus, Trash2, Play, Pause, Zap, Calendar, ChevronDown, ChevronRight, Edit3, Check, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface CronJob {
  id: string
  name: string
  command: string
  cron: string
  enabled: boolean
  lastRun?: string
}

const CRON_FILE_PATH = '~/.lodestone/cron.json'
const STORAGE_KEY = 'lodestone-cron-jobs'

const CRON_FIELDS = [
  { name: 'minute', label: 'Minute', min: 0, max: 59 },
  { name: 'hour', label: 'Hour', min: 0, max: 23 },
  { name: 'day', label: 'Day of Month', min: 1, max: 31 },
  { name: 'month', label: 'Month', min: 1, max: 12 },
  { name: 'weekday', label: 'Day of Week', min: 0, max: 6 },
]

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function loadJobs(): CronJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveJobs(jobs: CronJob[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch { /* ignore */ }
}

// Compute next 5 runs from a cron expression
function computeNextRuns(cron: string, count: number = 5): Date[] {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return []
  const [minField, hourField, dayField, monthField, weekdayField] = parts

  const parseField = (field: string, min: number, max: number): number[] => {
    if (field === '*') return Array.from({ length: max - min + 1 }, (_, i) => min + i)
    const values: number[] = []
    for (const part of field.split(',')) {
      if (part.includes('/')) {
        const [base, step] = part.split('/')
        const stepNum = parseInt(step)
        const start = base === '*' ? min : parseInt(base)
        for (let v = start; v <= max; v += stepNum) values.push(v)
      } else if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n))
        for (let v = start; v <= end; v++) values.push(v)
      } else {
        const v = parseInt(part)
        if (!isNaN(v)) values.push(v)
      }
    }
    return [...new Set(values)].sort((a, b) => a - b)
  }

  const minutes = parseField(minField, 0, 59)
  const hours = parseField(hourField, 0, 23)
  const days = parseField(dayField, 1, 31)
  const months = parseField(monthField, 1, 12)
  const weekdays = parseField(weekdayField, 0, 6).map((v, i) => v)

  const runs: Date[] = []
  const now = new Date()
  const candidate = new Date(now)
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  let attempts = 0
  while (runs.length < count && attempts < 500000) {
    const m = candidate.getMinutes()
    const h = candidate.getHours()
    const d = candidate.getDate()
    const mo = candidate.getMonth() + 1
    const wd = candidate.getDay()

    if (
      minutes.includes(m) &&
      hours.includes(h) &&
      days.includes(d) &&
      months.includes(mo) &&
      (weekdays.length === 0 || weekdays.includes(wd))
    ) {
      runs.push(new Date(candidate))
    }
    candidate.setMinutes(candidate.getMinutes() + 1)
    attempts++
  }

  return runs
}

function formatCronDisplay(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron
  const [min, hour, day, month, weekday] = parts
  const desc: string[] = []
  if (min === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return 'Every minute'
  }
  const timeDesc = `at ${hour === '*' ? 'every hour' : hour.padStart(2, '0')}:${min === '*' ? '00' : min.padStart(2, '0')}`
  if (day === '*' && month === '*' && weekday === '*') desc.push('Every day')
  else if (weekday !== '*' && day === '*' && month === '*') {
    const wd = parseInt(weekday)
    desc.push(`Every ${WEEKDAY_NAMES[wd] || weekday}`)
  } else if (day !== '*' && month === '*' && weekday === '*') {
    desc.push(`On day ${day}`)
  } else if (month !== '*') {
    desc.push(`In ${MONTH_NAMES[parseInt(month)] || month}`)
  } else {
    desc.push('On schedule')
  }
  return `${desc.join(' ')} ${timeDesc}`
}

export function CronEditor() {
  const [jobs, setJobs] = useState<CronJob[]>(loadJobs)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [previewCron, setPreviewCron] = useState('0 9 * * *')
  const [nextRuns, setNextRuns] = useState<Date[]>([])

  // Persist jobs to localStorage
  useEffect(() => {
    saveJobs(jobs)
  }, [jobs])

  // Also try to sync with ~/.lodestone/cron.json
  useEffect(() => {
    const expandPath = CRON_FILE_PATH.replace('~', '')
    window.lodestone.readFile(expandPath).then(result => {
      if (result.success && result.content) {
        try {
          const fileJobs = JSON.parse(result.content)
          if (Array.isArray(fileJobs) && fileJobs.length > 0) {
            // Merge file jobs that aren't in localStorage
            const existingIds = new Set(jobs.map(j => j.id))
            const merged = [...jobs]
            for (const fj of fileJobs) {
              if (!existingIds.has(fj.id)) merged.push(fj)
            }
            if (merged.length !== jobs.length) setJobs(merged)
          }
        } catch { /* ignore */ }
      }
    }).catch(() => { /* ignore */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute next runs preview
  useEffect(() => {
    setNextRuns(computeNextRuns(previewCron, 5))
  }, [previewCron])

  const handleAddJob = (job: Omit<CronJob, 'id'>) => {
    const newJob: CronJob = { ...job, id: crypto.randomUUID() }
    setJobs(prev => [...prev, newJob])
    setShowForm(false)
    setEditingId(null)
  }

  const handleUpdateJob = (id: string, updates: Partial<CronJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j))
    setEditingId(null)
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  const handleToggle = (id: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j))
  }

  const handleRunNow = async (job: CronJob) => {
    // Execute the job command
    if (job.command) {
      await window.lodestone.execCommand(job.command, undefined, 30000)
    }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, lastRun: new Date().toISOString() } : j))
  }

  return (
    <div className="rounded-xl overflow-hidden mt-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Cron Job Editor</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {jobs.filter(j => j.enabled).length} active
          </span>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null) }}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus className="w-3.5 h-3.5" /> {editingId ? 'Edit' : 'New'} Job
        </button>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <CronJobForm
              onSubmit={handleAddJob}
              onUpdate={handleUpdateJob}
              editingJob={editingId ? jobs.find(j => j.id === editingId) || null : null}
              onCancel={() => { setShowForm(false); setEditingId(null) }}
              previewCron={previewCron}
              onPreviewCronChange={setPreviewCron}
              nextRuns={nextRuns}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job list */}
      <div className="max-h-80 overflow-y-auto">
        {jobs.length === 0 && !showForm ? (
          <div className="p-4 text-center">
            <Clock className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No cron jobs configured.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {jobs.map(job => (
              <div key={job.id} className="border-b last:border-b-0 p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: job.enabled ? '#10B981' : 'var(--text-dim)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{job.name}</span>
                    <code className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: '#A78BFA' }}>
                      {job.cron}
                    </code>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRunNow(job)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: 'var(--bg-elevated)' }}
                      title="Run now"
                    >
                      <Zap className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
                    </button>
                    <button
                      onClick={() => handleToggle(job.id)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: 'var(--bg-elevated)' }}
                      title={job.enabled ? 'Disable' : 'Enable'}
                    >
                      {job.enabled ? <Pause className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /> : <Play className="w-3.5 h-3.5" style={{ color: '#10B981' }} />}
                    </button>
                    <button
                      onClick={() => { setEditingId(job.id); setShowForm(true) }}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: 'var(--bg-elevated)' }}
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: 'var(--bg-elevated)' }}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                    </button>
                  </div>
                </div>
                {job.command && (
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'SF Mono, Fira Code, monospace' }}>
                    $ {job.command}
                  </div>
                )}
                <div className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                  {formatCronDisplay(job.cron)}
                  {job.lastRun && ` · Last run: ${new Date(job.lastRun).toLocaleString()}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Cron Job Form ──────────────────────────────────────────────────

function CronJobForm({
  onSubmit,
  onUpdate,
  editingJob,
  onCancel,
  previewCron,
  onPreviewCronChange,
  nextRuns,
}: {
  onSubmit: (job: Omit<CronJob, 'id'>) => void
  onUpdate: (id: string, updates: Partial<CronJob>) => void
  editingJob: CronJob | null
  onCancel: () => void
  previewCron: string
  onPreviewCronChange: (cron: string) => void
  nextRuns: Date[]
}) {
  const [name, setName] = useState(editingJob?.name || '')
  const [command, setCommand] = useState(editingJob?.command || '')
  const [fields, setFields] = useState({
    minute: editingJob?.cron.split(/\s+/)[0] || '0',
    hour: editingJob?.cron.split(/\s+/)[1] || '9',
    day: editingJob?.cron.split(/\s+/)[2] || '*',
    month: editingJob?.cron.split(/\s+/)[3] || '*',
    weekday: editingJob?.cron.split(/\s+/)[4] || '*',
  })

  const cronExpr = `${fields.minute} ${fields.hour} ${fields.day} ${fields.month} ${fields.weekday}`

  useEffect(() => {
    onPreviewCronChange(cronExpr)
  }, [cronExpr]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    if (!name.trim()) return
    const job = { name, command, cron: cronExpr, enabled: editingJob?.enabled ?? true }
    if (editingJob) {
      onUpdate(editingJob.id, job)
    } else {
      onSubmit(job)
    }
  }

  const setField = (fieldName: string, value: string) => {
    setFields(prev => ({ ...prev, [fieldName]: value }))
  }

  const presets = [
    { label: 'Every minute', values: { minute: '*', hour: '*', day: '*', month: '*', weekday: '*' } },
    { label: 'Hourly', values: { minute: '0', hour: '*', day: '*', month: '*', weekday: '*' } },
    { label: 'Daily 9am', values: { minute: '0', hour: '9', day: '*', month: '*', weekday: '*' } },
    { label: 'Weekly Mon 9am', values: { minute: '0', hour: '9', day: '*', month: '*', weekday: '1' } },
    { label: 'Monthly 1st', values: { minute: '0', hour: '0', day: '1', month: '*', weekday: '*' } },
  ]

  return (
    <div className="p-3" style={{ background: 'var(--bg-elevated)' }}>
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>
        {editingJob ? 'Edit Cron Job' : 'New Cron Job'}
      </h3>

      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily Backup"
            className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Command */}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Command</label>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g. lodestone run --task 'daily backup'"
            className="w-full px-3 py-1.5 rounded-lg text-sm outline-none font-mono"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-1">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => setFields(p.values as any)}
              className="text-xs px-2 py-1 rounded-lg transition-all"
              style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Cron fields */}
        <div className="grid grid-cols-5 gap-2">
          {CRON_FIELDS.map(field => (
            <div key={field.name}>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-dim)' }}>{field.label}</label>
              <input
                type="text"
                value={fields[field.name as keyof typeof fields]}
                onChange={(e) => setField(field.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs text-center outline-none font-mono"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          ))}
        </div>

        {/* Cron expression preview */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Expression:</span>
          <code className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--bg-card)', color: '#A78BFA' }}>
            {cronExpr}
          </code>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatCronDisplay(cronExpr)}</span>
        </div>

        {/* Next 5 runs preview */}
        <div>
          <span className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-dim)' }}>Next 5 runs:</span>
          {nextRuns.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {nextRuns.map((run, i) => (
                <div key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {run.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Unable to compute next runs</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: name.trim() ? 'var(--accent)' : 'var(--bg-card)',
              color: name.trim() ? '#fff' : 'var(--text-dim)',
            }}
          >
            {editingJob ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {editingJob ? 'Update' : 'Create'}
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    </div>
  )
}