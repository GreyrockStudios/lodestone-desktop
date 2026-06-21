import { useState, useCallback } from 'react'
import {
  Container, Play, Square, RotateCw, Trash2, FileText, Terminal, RefreshCw, X, Search, AlertTriangle
} from 'lucide-react'

interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string[]
}

export function DockerManager() {
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null)
  const [logsContainer, setLogsContainer] = useState<DockerContainer | null>(null)
  const [logs, setLogs] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Check if docker is available
    const checkResult = await window.lodestone.execCommand('which docker', undefined, 5000)
    if (!checkResult.success || !checkResult.stdout.trim()) {
      setDockerAvailable(false)
      setLoading(false)
      return
    }

    setDockerAvailable(true)

    const result = await window.lodestone.execCommand('docker ps -a --format "{{json .}}"', undefined, 15000)
    if (result.success) {
      const parsed: DockerContainer[] = []
      for (const line of result.stdout.trim().split('\n')) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          parsed.push({
            id: data.ID || data.id || '',
            name: data.Names || data.names || data.Name || '',
            image: data.Image || data.image || '',
            status: data.Status || data.status || '',
            state: data.State || data.state || '',
            ports: (data.Ports || data.ports || '').split(', ').filter((p: string) => p),
          })
        } catch { /* skip malformed lines */ }
      }
      setContainers(parsed)
    } else {
      if (result.stderr.includes('Cannot connect to the Docker daemon') || result.stderr.includes('permission denied')) {
        setError(result.stderr.trim())
      }
    }
    setLoading(false)
  }, [])

  const handleAction = async (container: DockerContainer, action: 'start' | 'stop' | 'restart' | 'remove') => {
    const id = container.id || container.name
    if (!id) return
    if (action === 'remove' && !confirm(`Remove container ${container.name}?`)) return

    const cmd = `docker ${action} ${id}`
    await window.lodestone.execCommand(cmd, undefined, 15000)
    refresh()
  }

  const handleLogs = async (container: DockerContainer) => {
    const id = container.id || container.name
    setLogsContainer(container)
    setLoadingLogs(true)
    setLogs('')
    const result = await window.lodestone.execCommand(`docker logs --tail 100 ${id}`, undefined, 15000)
    setLogs((result.stdout || '') + (result.stderr ? '\n' + result.stderr : ''))
    setLoadingLogs(false)
  }

  const handleExec = async (container: DockerContainer) => {
    const id = container.id || container.name
    await window.lodestone.openTerminal(`docker exec -it ${id} sh`)
  }

  const filtered = containers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.image.toLowerCase().includes(search.toLowerCase()) ||
    c.state.toLowerCase().includes(search.toLowerCase())
  )

  if (dockerAvailable === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
        <AlertTriangle className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">Docker is not installed or not in PATH</p>
        <button onClick={refresh} className="mt-3 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter containers..."
          className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button onClick={refresh} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="Refresh">
          <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Container list */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
        {loading && containers.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
            <Container className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No containers found</p>
            <p className="text-xs mt-1 opacity-60">Make sure Docker is running</p>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_1fr_1fr_100px_180px] gap-2 px-3 py-2 text-xs font-medium sticky top-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
            <span>Name</span>
            <span>Image</span>
            <span>Ports</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
        )}
        {filtered.map(container => {
          const isRunning = container.state === 'running'
          return (
            <div key={container.id || container.name} className="grid grid-cols-[1fr_1fr_1fr_100px_180px] gap-2 px-3 py-2 text-xs items-center group" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <Container className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isRunning ? '#10B981' : 'var(--text-dim)' }} />
                <span className="truncate" style={{ color: 'var(--text)' }}>{container.name}</span>
              </div>
              <span className="truncate font-mono" style={{ color: 'var(--text-dim)' }}>{container.image}</span>
              <span className="truncate font-mono" style={{ color: 'var(--text-dim)' }}>{container.ports.join(', ') || '—'}</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: isRunning ? '#10B981' : '#6B7280' }} />
                <span style={{ color: isRunning ? '#10B981' : 'var(--text-dim)' }}>{container.state}</span>
              </div>
              <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isRunning ? (
                  <button onClick={() => handleAction(container, 'start')} className="p-1 rounded" title="Start" style={{ color: '#10B981' }}>
                    <Play className="w-3 h-3" />
                  </button>
                ) : (
                  <button onClick={() => handleAction(container, 'stop')} className="p-1 rounded" title="Stop" style={{ color: '#EF4444' }}>
                    <Square className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => handleAction(container, 'restart')} className="p-1 rounded" title="Restart" style={{ color: 'var(--text-dim)' }}>
                  <RotateCw className="w-3 h-3" />
                </button>
                <button onClick={() => handleLogs(container)} className="p-1 rounded" title="Logs" style={{ color: 'var(--text-dim)' }}>
                  <FileText className="w-3 h-3" />
                </button>
                <button onClick={() => handleExec(container)} className="p-1 rounded" title="Exec shell" style={{ color: 'var(--text-dim)' }}>
                  <Terminal className="w-3 h-3" />
                </button>
                <button onClick={() => handleAction(container, 'remove')} className="p-1 rounded" title="Remove" style={{ color: '#EF4444' }}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)', background: 'var(--bg-elevated)' }}>
        {filtered.length} container(s) {loading && '· refreshing...'}
      </div>

      {/* Logs modal */}
      {logsContainer && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setLogsContainer(null)}>
          <div className="max-w-2xl w-full mx-4 max-h-[70vh] flex flex-col rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Logs: {logsContainer.name}</span>
              </div>
              <button onClick={() => setLogsContainer(null)} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingLogs ? (
                <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-dim)' }}>
                  {logs || 'No logs available'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}