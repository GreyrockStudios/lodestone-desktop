import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Terminal, Folder, FileText, FilePlus, Trash2, RefreshCw, ChevronRight, ChevronDown,
  Cpu, HardDrive, MemoryStick, Clock, Activity, X, Play, Square, ArrowRight,
  Search, Eye, Edit3, Copy, Check, AlertTriangle, Home, FolderPlus, Power
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'

type Tab = 'terminal' | 'files' | 'system' | 'processes'

interface FileItem {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  extension?: string
}

interface ProcInfo {
  pid: number
  name: string
  cpu: number
  memory: number
}

interface ExecResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number | null
}

interface CmdHistory {
  command: string
  result: ExecResult
  timestamp: number
}

export function HostControl() {
  const [tab, setTab] = useState<Tab>('terminal')
  const { config } = useStore()

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Host Control</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            ⚠ Elevated
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(['terminal', 'files', 'system', 'processes'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: tab === t ? 'var(--bg-elevated)' : 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-dim)',
                border: '1px solid',
                borderColor: tab === t ? 'var(--accent)' : 'transparent',
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'terminal' && <TerminalPanel />}
        {tab === 'files' && <FileBrowser />}
        {tab === 'system' && <SystemInfo />}
        {tab === 'processes' && <ProcessManager />}
      </div>
    </div>
  )
}

// ─── Terminal Panel ──────────────────────────────────────────────────
function TerminalPanel() {
  const [command, setCommand] = useState('')
  const [cwd, setCwd] = useState('~')
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<CmdHistory[]>([])
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [cmdIndex, setCmdIndex] = useState(-1)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Get home directory
    window.lodestone.execCommand('echo $HOME').then(r => {
      if (r.success) setCwd(r.stdout.trim())
    })
  }, [])

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' })
  }, [history])

  const handleExec = useCallback(async () => {
    if (!command.trim() || running) return
    setRunning(true)
    const cmd = command.trim()
    setCmdHistory(prev => [...prev, cmd])
    setCmdIndex(-1)

    const result = await window.lodestone.execCommand(cmd, cwd, 30000)

    setHistory(prev => [...prev, { command: cmd, result, timestamp: Date.now() }])

    // Handle cd specially
    if (cmd.startsWith('cd ')) {
      const target = cmd.slice(3).trim()
      const cdResult = await window.lodestone.execCommand(`cd ${target} && pwd`, cwd)
      if (cdResult.success && cdResult.stdout.trim()) {
        setCwd(cdResult.stdout.trim())
      }
    }

    setCommand('')
    setRunning(false)
    inputRef.current?.focus()
  }, [command, running, cwd])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleExec()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (cmdHistory.length > 0) {
        const newIdx = cmdIndex === -1 ? cmdHistory.length - 1 : Math.max(0, cmdIndex - 1)
        setCmdIndex(newIdx)
        setCommand(cmdHistory[newIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (cmdIndex !== -1) {
        const newIdx = cmdIndex + 1
        if (newIdx >= cmdHistory.length) {
          setCmdIndex(-1)
          setCommand('')
        } else {
          setCmdIndex(newIdx)
          setCommand(cmdHistory[newIdx])
        }
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault()
      setCommand('')
    }
  }

  const openTerminal = async () => {
    await window.lodestone.openTerminal()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{cwd}</span>
        <div className="flex-1" />
        <button
          onClick={openTerminal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}
          title="Open system terminal"
        >
          <Terminal className="w-3.5 h-3.5" /> Open Terminal
        </button>
        <button
          onClick={() => setHistory([])}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}
          title="Clear output"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      {/* Output */}
      <div ref={outputRef} className="flex-1 overflow-auto px-4 py-3 font-mono text-xs" style={{ background: 'var(--bg-card)' }}>
        {history.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Execute shell commands on the host machine</p>
            <p className="mt-1 text-xs opacity-60">⚠ Commands run with your user permissions</p>
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: '#10B981' }}>$</span>
              <span style={{ color: 'var(--text)' }}>{entry.command}</span>
            </div>
            {entry.result.stdout && (
              <pre className="whitespace-pre-wrap" style={{ color: 'var(--text-dim)' }}>{entry.result.stdout}</pre>
            )}
            {entry.result.stderr && (
              <pre className="whitespace-pre-wrap" style={{ color: '#EF4444' }}>{entry.result.stderr}</pre>
            )}
            {entry.result.exitCode !== 0 && entry.result.exitCode !== null && (
              <div className="text-xs mt-1" style={{ color: '#EF4444' }}>exit code: {entry.result.exitCode}</div>
            )}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>Running...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <span className="font-mono text-sm" style={{ color: '#10B981' }}>$</span>
        <input
          ref={inputRef}
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={handleKey}
          disabled={running}
          className="flex-1 bg-transparent font-mono text-sm outline-none"
          style={{ color: 'var(--text)' }}
          placeholder="Type a command and press Enter..."
          autoFocus
        />
        {running ? (
          <button onClick={() => {}} className="p-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={handleExec} disabled={!command.trim()} className="p-1.5 rounded-lg transition-all" style={{ background: command.trim() ? 'rgba(16,185,129,0.15)' : 'transparent', color: command.trim() ? '#10B981' : 'var(--text-dim)' }}>
            <Play className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── File Browser ────────────────────────────────────────────────────
function FileBrowser() {
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<FileItem | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [viewing, setViewing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<string[]>([])

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading(true)
    setSelected(null)
    setViewing(false)
    setEditing(false)
    const result = await window.lodestone.listFiles(dirPath)
    if (result.success) {
      setFiles(result.files)
      setCurrentPath(dirPath)
    } else {
      setFiles([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    window.lodestone.execCommand('echo $HOME').then(async r => {
      if (r.success) {
        const home = r.stdout.trim()
        setHistory([home])
        await loadDir(home)
      }
    })
  }, [loadDir])

  const navigateTo = (dir: FileItem) => {
    setHistory(prev => [...prev, dir.path])
    loadDir(dir.path)
  }

  const goBack = () => {
    if (history.length > 1) {
      const newHistory = history.slice(0, -1)
      setHistory(newHistory)
      loadDir(newHistory[newHistory.length - 1])
    }
  }

  const viewFile = async (file: FileItem) => {
    setSelected(file)
    setViewing(true)
    setEditing(false)
    const result = await window.lodestone.readFile(file.path)
    setFileContent(result.success ? result.content : `Error: ${result.error}`)
  }

  const startEdit = async (file: FileItem) => {
    setSelected(file)
    setEditing(true)
    setViewing(false)
    const result = await window.lodestone.readFile(file.path)
    setEditContent(result.success ? result.content : '')
  }

  const saveEdit = async () => {
    if (!selected) return
    const result = await window.lodestone.writeFile(selected.path, editContent)
    if (result.success) {
      setEditing(false)
      setViewing(true)
      setFileContent(editContent)
    }
  }

  const deleteFile = async (file: FileItem) => {
    if (!confirm(`Delete ${file.name}? This cannot be undone.`)) return
    const result = await window.lodestone.deleteFile(file.path)
    if (result.success) {
      loadDir(currentPath)
    }
  }

  const createFile = async () => {
    const name = prompt('Enter file name:')
    if (!name) return
    const filePath = `${currentPath}/${name}`
    const result = await window.lodestone.writeFile(filePath, '')
    if (result.success) loadDir(currentPath)
  }

  const createDir = async () => {
    const name = prompt('Enter directory name:')
    if (!name) return
    const dirPath = `${currentPath}/${name}`
    const result = await window.lodestone.makeDir(dirPath)
    if (result.success) loadDir(currentPath)
  }

  const copyPath = (file: FileItem) => {
    navigator.clipboard.writeText(file.path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const filteredFiles = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : files

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={goBack} disabled={history.length <= 1} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: history.length > 1 ? 'var(--text)' : 'var(--text-dim)', opacity: history.length <= 1 ? 0.4 : 1 }}>
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </button>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Home className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
            <span className="text-xs font-mono truncate" style={{ color: 'var(--text-dim)' }}>{currentPath}</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter..."
              className="w-32 px-2 py-1 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
            <button onClick={createFile} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="New file">
              <FilePlus className="w-3.5 h-3.5" />
            </button>
            <button onClick={createDir} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="New folder">
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => loadDir(currentPath)} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
              <Folder className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? 'No matching files' : 'Empty directory'}</p>
            </div>
          ) : (
            <div>
              {filteredFiles.map(file => (
                <div
                  key={file.path}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all group"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onClick={() => file.isDir ? navigateTo(file) : viewFile(file)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {file.isDir ? (
                    <Folder className="w-4 h-4 flex-shrink-0" style={{ color: '#F59E0B' }} />
                  ) : (
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: file.extension ? 'var(--accent)' : 'var(--text-dim)' }} />
                  )}
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>{file.name}</span>
                  {file.extension && !file.isDir && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                      {file.extension}
                    </span>
                  )}
                  <span className="text-xs w-20 text-right" style={{ color: 'var(--text-dim)' }}>{formatSize(file.size)}</span>
                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); copyPath(file) }} className="p-1 rounded" title="Copy path">
                      {copied ? <Check className="w-3 h-3" style={{ color: '#10B981' }} /> : <Copy className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />}
                    </button>
                    {!file.isDir && (
                      <button onClick={e => { e.stopPropagation(); startEdit(file) }} className="p-1 rounded" title="Edit">
                        <Edit3 className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                      </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); window.lodestone.revealFile(file.path) }} className="p-1 rounded" title="Reveal in Finder">
                      <Eye className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteFile(file) }} className="p-1 rounded" title="Delete">
                      <Trash2 className="w-3 h-3" style={{ color: '#EF4444' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview/Edit panel */}
      <AnimatePresence>
        {(viewing || editing) && selected && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '40%', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex flex-col overflow-hidden"
            style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-card)' }}
          >
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <span className="text-sm truncate" style={{ color: 'var(--text)' }}>{selected.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {editing ? (
                  <>
                    <button onClick={saveEdit} className="px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>Save</button>
                    <button onClick={() => { setEditing(false); setViewing(true) }} className="px-2 py-1 rounded-lg text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => startEdit(selected)} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => { setViewing(false); setEditing(false); setSelected(null) }} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-full p-4 font-mono text-sm bg-transparent outline-none resize-none"
                  style={{ color: 'var(--text)' }}
                  spellCheck={false}
                />
              ) : (
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-dim)' }}>
                  {fileContent || 'Empty file'}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── System Info ──────────────────────────────────────────────────────
function SystemInfo() {
  const [info, setInfo] = useState<{
    platform: string; arch: string; hostname: string; uptime: number;
    loadAvg: number[]; totalMem: number; freeMem: number; cpus: number; nodeVersion: string
  } | null>(null)
  const [diskUsage, setDiskUsage] = useState<{ size: number; fileCount: number } | null>(null)

  useEffect(() => {
    window.lodestone.getSystemInfo().then(setInfo)
    window.lodestone.execCommand('echo $HOME').then(async r => {
      if (r.success) {
        const home = r.stdout.trim()
        const usage = await window.lodestone.getDiskUsage(home)
        if (usage.success) setDiskUsage({ size: usage.size, fileCount: usage.fileCount })
      }
    })
  }, [])

  if (!info) return <div className="flex items-center justify-center h-full"><RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--text-dim)' }} /></div>

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const formatUptime = (s: number) => {
    const days = Math.floor(s / 86400)
    const hours = Math.floor((s % 86400) / 3600)
    const mins = Math.floor((s % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const memUsed = info.totalMem - info.freeMem
  const memPercent = ((memUsed / info.totalMem) * 100).toFixed(1)

  const stats = [
    { label: 'Platform', value: info.platform === 'darwin' ? 'macOS' : info.platform === 'win32' ? 'Windows' : 'Linux', icon: Cpu, color: '#8B5CF6' },
    { label: 'Architecture', value: info.arch, icon: Cpu, color: '#8B5CF6' },
    { label: 'Hostname', value: info.hostname, icon: HardDrive, color: '#10B981' },
    { label: 'Uptime', value: formatUptime(info.uptime), icon: Clock, color: '#F59E0B' },
    { label: 'CPU Cores', value: `${info.cpus}`, icon: Cpu, color: '#3B82F6' },
    { label: 'Node Version', value: info.nodeVersion, icon: Activity, color: '#EC4899' },
    { label: 'Memory', value: `${formatBytes(memUsed)} / ${formatBytes(info.totalMem)} (${memPercent}%)`, icon: MemoryStick, color: '#10B981' },
    { label: 'Load Average', value: info.loadAvg.map(l => l.toFixed(2)).join(', '), icon: Activity, color: '#F59E0B' },
  ]

  return (
    <div className="overflow-auto h-full p-4">
      <div className="grid grid-cols-2 gap-3 max-w-3xl">
        {stats.map(stat => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="p-4 rounded-xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: stat.color }} />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{stat.label}</span>
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{stat.value}</div>
            </div>
          )
        })}
      </div>

      {/* Memory bar */}
      <div className="mt-4 p-4 rounded-xl max-w-3xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Memory Usage</span>
          <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{memPercent}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${memPercent}%`,
              background: parseFloat(memPercent) > 80 ? '#EF4444' : parseFloat(memPercent) > 60 ? '#F59E0B' : '#10B981',
            }}
          />
        </div>
      </div>

      {/* Disk usage */}
      {diskUsage && (
        <div className="mt-3 p-4 rounded-xl max-w-3xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Home Directory Usage</span>
          </div>
          <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {formatBytes(diskUsage.size)} across {diskUsage.fileCount.toLocaleString()} files
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-4 flex gap-2 max-w-3xl">
        <button
          onClick={() => window.lodestone.openTerminal()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Open Terminal
        </button>
        <button
          onClick={() => window.lodestone.openInFinder()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <Folder className="w-4 h-4" style={{ color: '#F59E0B' }} /> Open in Finder
        </button>
      </div>
    </div>
  )
}

// ─── Process Manager ─────────────────────────────────────────────────
function ProcessManager() {
  const [processes, setProcesses] = useState<ProcInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'cpu' | 'memory' | 'name'>('cpu')
  const [killConfirm, setKillConfirm] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await window.lodestone.getProcessList()
    if (result.success) {
      setProcesses(result.processes)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleKill = async (pid: number) => {
    const result = await window.lodestone.killProcess(pid)
    if (result.success) {
      setKillConfirm(null)
      refresh()
    }
  }

  const filtered = processes
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || String(p.pid).includes(search))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return b[sortBy] - a[sortBy]
    })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter processes..."
          className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="px-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          <option value="cpu">Sort: CPU</option>
          <option value="memory">Sort: Memory</option>
          <option value="name">Sort: Name</option>
        </select>
        <button onClick={refresh} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="Refresh">
          <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {/* Process list */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
        <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 px-3 py-2 text-xs font-medium sticky top-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
          <span>Process Name</span>
          <span className="text-right">CPU %</span>
          <span className="text-right">Mem %</span>
          <span className="text-right">Action</span>
        </div>
        {filtered.map(proc => (
          <div
            key={proc.pid}
            className="grid grid-cols-[1fr_80px_80px_60px] gap-2 px-3 py-1.5 text-xs items-center group"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono w-12 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{proc.pid}</span>
              <span className="truncate" style={{ color: 'var(--text)' }}>{proc.name}</span>
            </div>
            <span className="text-right font-mono" style={{ color: proc.cpu > 50 ? '#EF4444' : proc.cpu > 20 ? '#F59E0B' : 'var(--text-dim)' }}>
              {proc.cpu.toFixed(1)}
            </span>
            <span className="text-right font-mono" style={{ color: proc.memory > 50 ? '#EF4444' : proc.memory > 20 ? '#F59E0B' : 'var(--text-dim)' }}>
              {proc.memory.toFixed(1)}
            </span>
            <div className="flex justify-end">
              {killConfirm === proc.pid ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => handleKill(proc.pid)} className="p-1 rounded" title="Confirm kill">
                    <Check className="w-3 h-3" style={{ color: '#EF4444' }} />
                  </button>
                  <button onClick={() => setKillConfirm(null)} className="p-1 rounded" title="Cancel">
                    <X className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setKillConfirm(proc.pid)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Kill process"
                >
                  <Power className="w-3 h-3" style={{ color: '#EF4444' }} />
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No processes found</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)', background: 'var(--bg-elevated)' }}>
        {filtered.length} processes {loading && '· refreshing...'}
      </div>
    </div>
  )
}