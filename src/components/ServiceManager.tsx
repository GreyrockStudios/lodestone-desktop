import { useState, useEffect, useCallback } from 'react'
import {
  Server, Play, Square, RotateCw, Search, RefreshCw, Activity
} from 'lucide-react'

interface ServiceInfo {
  name: string
  status: 'running' | 'stopped' | 'unknown'
  pid: string | number | null
}

export function ServiceManager() {
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    const sysInfo = await window.lodestone.getSystemInfo()
    setPlatform(sysInfo.platform)

    if (sysInfo.platform === 'darwin') {
      // macOS: launchctl list
      const result = await window.lodestone.execCommand('launchctl list', undefined, 10000)
      if (result.success) {
        const parsed: ServiceInfo[] = []
        for (const line of result.stdout.trim().split('\n').slice(1)) {
          // Format: PID Status Label
          const parts = line.trim().split(/\s+/)
          if (parts.length < 3) continue
          const pid = parts[0]
          const statusCode = parts[1]
          const label = parts.slice(2).join(' ')
          parsed.push({
            name: label,
            status: statusCode === '-' ? 'stopped' : 'running',
            pid: pid === '-' ? null : parseInt(pid) || null,
          })
        }
        setServices(parsed.sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        setError(result.stderr.trim() || 'Failed to list services')
      }
    } else {
      // Linux: systemctl list-units --type=service
      const result = await window.lodestone.execCommand('systemctl list-units --type=service --no-pager --plain', undefined, 10000)
      if (result.success) {
        const parsed: ServiceInfo[] = []
        for (const line of result.stdout.trim().split('\n')) {
          // Format: UNIT LOAD ACTIVE SUB DESCRIPTION
          const parts = line.trim().split(/\s+/)
          if (parts.length < 4) continue
          const name = parts[0]
          const active = parts[2]
          const sub = parts[3]
          if (!name.endsWith('.service')) continue
          let pid: string | number | null = null
          if (active === 'active' && sub === 'running') {
            // Try to get PID
            const pidResult = await window.lodestone.execCommand(`systemctl show --property MainPID --value ${name}`, undefined, 5000)
            if (pidResult.success) {
              const p = parseInt(pidResult.stdout.trim())
              if (p > 0) pid = p
            }
          }
          parsed.push({
            name,
            status: active === 'active' ? 'running' : 'stopped',
            pid,
          })
        }
        setServices(parsed.sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        setError(result.stderr.trim() || 'Failed to list services')
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleAction = async (service: ServiceInfo, action: 'start' | 'stop' | 'restart') => {
    setBusyAction(`${service.name}:${action}`)
    let cmd: string
    if (platform === 'darwin') {
      // macOS: launchctl start/stop
      const actionCmd = action === 'restart' ? 'stop' : action
      cmd = `launchctl ${actionCmd} ${service.name}`
      if (action === 'restart') {
        await window.lodestone.execCommand(`launchctl stop ${service.name}`, undefined, 10000)
        await new Promise(r => setTimeout(r, 500))
        cmd = `launchctl start ${service.name}`
      }
    } else {
      // Linux: systemctl start/stop/restart
      cmd = `sudo systemctl ${action} ${service.name}`
    }
    await window.lodestone.execCommand(cmd, undefined, 15000)
    setBusyAction(null)
    setTimeout(refresh, 1000)
  }

  const filtered = services.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.pid !== null && String(s.pid).includes(search))
  )

  const runningCount = services.filter(s => s.status === 'running').length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <Server className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{platform === 'darwin' ? 'launchctl' : 'systemd'}</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter services..."
          className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button onClick={refresh} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="Refresh">
          <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs" style={{ color: '#EF4444)' }}>
          {error}
        </div>
      )}

      {/* Service list */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
        {loading && services.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
            <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No services found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_80px_80px_120px] gap-2 px-3 py-2 text-xs font-medium sticky top-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              <span>Service Name</span>
              <span className="text-right">Status</span>
              <span className="text-right">PID</span>
              <span className="text-right">Actions</span>
            </div>
            {filtered.map(service => (
              <div key={service.name} className="grid grid-cols-[1fr_80px_80px_120px] gap-2 px-3 py-1.5 text-xs items-center group" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate" style={{ color: 'var(--text)' }}>{service.name}</span>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: service.status === 'running' ? '#10B981' : '#6B7280' }} />
                  <span style={{ color: service.status === 'running' ? '#10B981' : 'var(--text-dim)' }}>{service.status}</span>
                </div>
                <span className="text-right font-mono" style={{ color: 'var(--text-dim)' }}>{service.pid ?? '—'}</span>
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {service.status !== 'running' ? (
                    <button onClick={() => handleAction(service, 'start')} disabled={busyAction === `${service.name}:start`} className="p-1 rounded" title="Start" style={{ color: '#10B981' }}>
                      <Play className="w-3 h-3" />
                    </button>
                  ) : (
                    <button onClick={() => handleAction(service, 'stop')} disabled={busyAction === `${service.name}:stop`} className="p-1 rounded" title="Stop" style={{ color: '#EF4444' }}>
                      <Square className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => handleAction(service, 'restart')} disabled={busyAction === `${service.name}:restart`} className="p-1 rounded" title="Restart" style={{ color: 'var(--text-dim)' }}>
                    <RotateCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-xs flex items-center gap-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)', background: 'var(--bg-elevated)' }}>
        <Activity className="w-3 h-3" style={{ color: '#10B981' }} />
        {runningCount} running / {services.length} total {loading && '· refreshing...'}
      </div>
    </div>
  )
}