import { useState, useEffect } from 'react'
import { Clock, Plus, Trash2, Calendar, Play, Pause, ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CronEditor } from '../components/CronEditor'

interface ScheduledJob {
  id: string
  name: string
  schedule: string
  description: string
  enabled: boolean
  lastRun?: string
  nextRun?: string
  status: 'idle' | 'running' | 'error'
}

const PRESETS = [
  { label: 'Every morning at 9am', cron: '0 9 * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 30 min', cron: '*/30 * * * *' },
  { label: 'Every Monday 9am', cron: '0 9 * * 1' },
  { label: 'Every midnight', cron: '0 0 * * *' },
  { label: 'Custom cron...', cron: '' },
]

export function Schedule() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([
    { id: '1', name: 'Morning Brief', schedule: '0 9 * * *', description: 'Daily summary of tasks and priorities', enabled: true, nextRun: '2026-06-21 09:00', status: 'idle' },
    { id: '2', name: 'Wiki Lint', schedule: '0 6 * * *', description: 'Check wiki for broken links and orphans', enabled: true, nextRun: '2026-06-22 06:00', status: 'idle' },
  ])
  const [showForm, setShowForm] = useState(false)

  const toggleJob = (id: string) => {
    setJobs(jobs.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j))
  }

  const deleteJob = (id: string) => {
    setJobs(jobs.filter(j => j.id !== id))
  }

  const addJob = (job: Omit<ScheduledJob, 'id' | 'status'>) => {
    const newJob: ScheduledJob = { ...job, id: Date.now().toString(), status: 'idle' }
    setJobs([...jobs, newJob])
    setShowForm(false)
  }

  const runNow = (id: string) => {
    setJobs(jobs.map(j => j.id === id ? { ...j, status: 'running' } : j))
    setTimeout(() => {
      setJobs(jobs.map(j => j.id === id ? { ...j, status: 'idle', lastRun: new Date().toISOString() } : j))
    }, 2000)
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Schedule</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {jobs.filter(j => j.enabled).length} active
          </span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus className="w-3.5 h-3.5" /> New Job
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* New job form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-3"
            >
              <NewJobForm onSubmit={addJob} onCancel={() => setShowForm(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Job list */}
        {jobs.length === 0 && !showForm ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Calendar className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
              <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No scheduled jobs</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create recurring tasks for your agent.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map(job => (
              <JobCard key={job.id} job={job} onToggle={() => toggleJob(job.id)} onDelete={() => deleteJob(job.id)} onRunNow={() => runNow(job.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Cron Editor */}
      <div className="px-4 pb-4">
        <CronEditor />
      </div>
    </div>
  )
}

function NewJobForm({ onSubmit, onCancel }: { onSubmit: (job: Omit<ScheduledJob, 'id' | 'status'>) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [cron, setCron] = useState('0 9 * * *')
  const [showPresets, setShowPresets] = useState(false)

  const handleSubmit = () => {
    if (!name.trim() || !cron.trim()) return
    onSubmit({ name, description, schedule: cron, enabled: true })
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>New Scheduled Job</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily Standup"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should the agent do?"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Schedule</label>
          <div className="relative">
            <input
              type="text"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="cron expression"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
            >
              {showPresets ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-dim)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />}
            </button>
          </div>
          {showPresets && (
            <div className="mt-1 flex flex-col gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => { setCron(p.cron); setShowPresets(false) }}
                  className="text-left text-xs px-2 py-1.5 rounded transition-all"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  {p.label} <span className="font-mono ml-2" style={{ color: 'var(--text-dim)' }}>{p.cron}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus className="w-3.5 h-3.5" /> Create Job
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function JobCard({ job, onToggle, onDelete, onRunNow }: { job: ScheduledJob; onToggle: () => void; onRunNow: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = job.status === 'running' ? '#10B981' : job.status === 'error' ? '#EF4444' : 'var(--text-dim)'

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
            <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{job.name}</span>
              <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{job.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onRunNow}
            className="p-1.5 rounded-lg transition-all"
            style={{ background: 'var(--bg-elevated)' }}
            title="Run now"
          >
            <Zap className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg transition-all"
            style={{ background: 'var(--bg-elevated)' }}
            title={job.enabled ? 'Pause' : 'Enable'}
          >
            {job.enabled ? <Pause className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /> : <Play className="w-3.5 h-3.5" style={{ color: '#10B981' }} />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-all"
            style={{ background: 'var(--bg-elevated)' }}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="relative w-10 h-5 rounded-full transition-all shrink-0 ml-1"
            style={{ background: job.enabled ? '#8B5CF6' : 'var(--border-hover)' }}
          >
            <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: job.enabled ? '22px' : '2px' }} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="p-3 text-xs space-y-2" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-dim)' }}>Cron:</span>
                <code className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg-elevated)', color: '#A78BFA' }}>{job.schedule}</code>
              </div>
              {job.nextRun && (
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-dim)' }}>Next run:</span>
                  <span>{job.nextRun}</span>
                </div>
              )}
              {job.lastRun && (
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-dim)' }}>Last run:</span>
                  <span>{job.lastRun}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}