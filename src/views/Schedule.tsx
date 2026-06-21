import { useState } from 'react'
import { Clock, Plus, Trash2, Calendar } from 'lucide-react'

interface ScheduledJob {
  id: string
  name: string
  schedule: string
  description: string
  enabled: boolean
  lastRun?: string
  nextRun?: string
}

export function Schedule() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([
    { id: '1', name: 'Morning Brief', schedule: '0 9 * * *', description: 'Daily summary of tasks and priorities', enabled: true, nextRun: '2026-06-21 09:00' },
    { id: '2', name: 'Wiki Lint', schedule: '0 6 * * *', description: 'Check wiki for broken links and orphans', enabled: true, nextRun: '2026-06-22 06:00' },
  ])

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Schedule</h2>
        </div>
        <button className="btn-primary flex items-center gap-2 text-xs px-3 py-2">
          <Plus className="w-3.5 h-3.5" /> New Job
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {jobs.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Calendar className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
              <h3 className="text-sm font-medium mb-1">No scheduled jobs</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create recurring tasks for your agent.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function JobCard({ job }: { job: ScheduledJob }) {
  const [enabled, setEnabled] = useState(job.enabled)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{job.name}</span>
        <div className="flex items-center gap-2">
          <button className="p-1 rounded hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
          </button>
          <button
            onClick={() => setEnabled(!enabled)}
            className="relative w-10 h-5 rounded-full transition-all"
            style={{ background: enabled ? '#8B5CF6' : 'var(--border-hover)' }}
          >
            <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: enabled ? '22px' : '2px' }} />
          </button>
        </div>
      </div>
      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{job.description}</p>
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-dim)' }}>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>{job.schedule}</code>
        </div>
        {job.nextRun && (
          <span>Next: {job.nextRun}</span>
        )}
      </div>
    </div>
  )
}