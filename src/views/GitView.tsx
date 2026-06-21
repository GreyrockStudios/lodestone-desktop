import { useState, useEffect, useCallback, useRef } from 'react'
import {
  GitBranch, GitCommit, FolderOpen, RefreshCw, Plus, Minus, FileText,
  ChevronDown, ChevronRight, Check, X, Clock, ArrowRight, Loader2, Eye
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface FileStatus {
  path: string
  status: 'M' | 'A' | 'D' | 'U' | '??' | 'R'
  staged: boolean
}

interface LogEntry {
  hash: string
  message: string
  author: string
  date: string
}

interface ExecResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number | null
}

const STATUS_COLORS: Record<string, string> = {
  M: '#F59E0B',
  A: '#10B981',
  D: '#EF4444',
  U: '#06B6D4',
  '??': '#6B7280',
  R: '#8B5CF6',
}

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  U: 'Unmerged',
  '??': 'Untracked',
  R: 'Renamed',
}

function parseGitStatus(output: string): FileStatus[] {
  const files: FileStatus[] = []
  for (const line of output.split('\n').filter(l => l.trim())) {
    if (line.length < 4) continue
    const flag = line.slice(0, 2).trim()
    const filePath = line.slice(3).trim()
    if (!filePath) continue
    let status: FileStatus['status'] = 'M'
    let staged = false
    if (flag === '??') status = '??'
    else if (flag.includes('A')) { status = 'A'; staged = true }
    else if (flag.includes('D')) { status = 'D'; staged = flag[0] !== ' ' && flag[0] !== '?' }
    else if (flag.includes('R')) { status = 'R'; staged = true }
    else if (flag.includes('U')) { status = 'U' }
    else if (flag.includes('M')) { status = 'M'; staged = flag[0] === 'M' }
    files.push({ path: filePath, status, staged })
  }
  return files
}

function parseGitLog(output: string): LogEntry[] {
  const entries: LogEntry[] = []
  for (const line of output.split('\n').filter(l => l.trim())) {
    // Format: hash|author|date|message
    const parts = line.split('|')
    if (parts.length >= 4) {
      entries.push({
        hash: parts[0].trim(),
        author: parts[1].trim(),
        date: parts[2].trim(),
        message: parts.slice(3).join('|').trim(),
      })
    }
  }
  return entries
}

export function GitView() {
  const [repoPath, setRepoPath] = useState('')
  const [files, setFiles] = useState<FileStatus[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedFiles, setExpandedFiles] = useState(false)
  const [expandedBranches, setExpandedBranches] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitDiff, setCommitDiff] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [folderInput, setFolderInput] = useState('')

  const runGit = useCallback(async (args: string[]): Promise<ExecResult> => {
    const cmd = `git ${args.join(' ')}`
    const result = await window.lodestone.execCommand(cmd, repoPath || undefined, 15000)
    return result as unknown as ExecResult
  }, [repoPath])

  const refresh = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError('')
    try {
      const [statusRes, branchRes, logRes] = await Promise.all([
        runGit(['status', '--porcelain']),
        runGit(['branch', '--list']),
        runGit(['log', '--oneline', '-20', '--pretty=format:%h|%an|%ci|%s']),
      ])

      if (statusRes.success) setFiles(parseGitStatus(statusRes.stdout))
      if (branchRes.success) {
        const b = branchRes.stdout.split('\n').map(l => l.replace('*', '').trim()).filter(Boolean)
        setBranches(b)
        const cur = branchRes.stdout.split('\n').find(l => l.startsWith('*'))
        if (cur) setCurrentBranch(cur.replace('*', '').trim())
      }
      if (logRes.success) setLogs(parseGitLog(logRes.stdout))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [repoPath, runGit])

  const handleSelectFolder = async () => {
    // Use host exec to open a folder dialog via osascript on macOS
    try {
      const result = await window.lodestone.execCommand(
        `osascript -e 'tell application "Finder" to set selectedFolder to choose folder' -e 'POSIX path of selectedFolder' 2>/dev/null || echo ""`,
        undefined,
        60000
      )
      if (result.success && result.stdout.trim()) {
        const folder = result.stdout.trim().split('\n').pop()?.trim() || ''
        if (folder) {
          setRepoPath(folder)
        }
      }
    } catch {
      // Fallback: use text input
    }
  }

  const handleLoadRepo = async () => {
    if (!folderInput.trim()) return
    setRepoPath(folderInput.trim())
  }

  // Auto-refresh when repoPath changes
  useEffect(() => {
    if (repoPath) refresh()
  }, [repoPath]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStage = async (filePath: string) => {
    setLoading(true)
    await runGit(['add', filePath])
    await refresh()
    setLoading(false)
  }

  const handleUnstage = async (filePath: string) => {
    setLoading(true)
    await runGit(['reset', 'HEAD', filePath])
    await refresh()
    setLoading(false)
  }

  const handleStageAll = async () => {
    setLoading(true)
    await runGit(['add', '-A'])
    await refresh()
    setLoading(false)
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setLoading(true)
    const result = await runGit(['commit', '-m', `"${commitMsg.replace(/"/g, '\\"')}"`])
    if (result.success) {
      setStatusMsg(`Committed: ${commitMsg}`)
      setCommitMsg('')
      await refresh()
    } else {
      setError(result.stderr || 'Commit failed')
    }
    setLoading(false)
    setTimeout(() => setStatusMsg(''), 3000)
  }

  const handleCheckout = async (branch: string) => {
    setLoading(true)
    const result = await runGit(['checkout', branch])
    if (result.success) {
      setCurrentBranch(branch)
      await refresh()
    } else {
      setError(result.stderr || 'Checkout failed')
    }
    setLoading(false)
  }

  const handleFileClick = async (filePath: string) => {
    setSelectedFile(filePath)
    setSelectedCommit(null)
    const result = await runGit(['diff', '--', filePath])
    if (result.success) setDiff(result.stdout)
  }

  const handleCommitClick = async (hash: string) => {
    setSelectedCommit(hash)
    setSelectedFile(null)
    const result = await runGit(['show', hash, '--stat', '--patch'])
    if (result.success) setCommitDiff(result.stdout)
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Git</h2>
          {currentBranch && (
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent)' }}>
              <GitBranch className="w-3 h-3" />
              {currentBranch}
            </span>
          )}
          {repoPath && (
            <button
              onClick={refresh}
              className="p-1 rounded-lg transition-all"
              style={{ background: 'var(--bg-elevated)' }}
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Repo selector */}
        {!repoPath ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a Git repository to manage:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadRepo()}
                placeholder="/path/to/repository"
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <button
                onClick={handleLoadRepo}
                className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleSelectFolder}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                <FolderOpen className="w-3.5 h-3.5" /> Browse
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }} title={repoPath}>
              {repoPath}
            </span>
            <button
              onClick={() => { setRepoPath(''); setFiles([]); setBranches([]); setLogs([]) }}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}
            >
              Change
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
          <X className="w-3.5 h-3.5" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {statusMsg && (
        <div className="px-4 py-2 text-xs flex items-center gap-2" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
          <Check className="w-3.5 h-3.5" />
          {statusMsg}
        </div>
      )}

      {repoPath && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Branch switcher */}
          <Section
            title="Branches"
            icon={GitBranch}
            expanded={expandedBranches}
            onToggle={() => setExpandedBranches(!expandedBranches)}
            count={branches.length}
          >
            <div className="flex flex-wrap gap-2">
              {branches.map(branch => (
                <button
                  key={branch}
                  onClick={() => branch !== currentBranch && handleCheckout(branch)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: branch === currentBranch ? 'rgba(139,92,246,0.1)' : 'var(--bg-elevated)',
                    color: branch === currentBranch ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${branch === currentBranch ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
                    cursor: branch === currentBranch ? 'default' : 'pointer',
                  }}
                >
                  {branch === currentBranch && <Check className="w-3 h-3" />}
                  {branch}
                </button>
              ))}
            </div>
          </Section>

          {/* File status */}
          <Section
            title="Changes"
            icon={FileText}
            expanded={expandedFiles}
            onToggle={() => setExpandedFiles(!expandedFiles)}
            count={files.length}
            actions={
              files.length > 0 && (
                <button
                  onClick={handleStageAll}
                  className="text-xs px-2 py-0.5 rounded transition-all"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  Stage All
                </button>
              )
            }
          >
            {files.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--text-dim)' }}>Working tree clean</p>
            ) : (
              <div className="flex flex-col gap-1">
                {files.map(file => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                    style={{ background: selectedFile === file.path ? 'var(--bg-elevated)' : 'transparent' }}
                    onClick={() => handleFileClick(file.path)}
                  >
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: `${STATUS_COLORS[file.status]}20`,
                        color: STATUS_COLORS[file.status],
                      }}
                    >
                      {file.status === '??' ? '?' : file.status}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text)' }}>{file.path}</span>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{STATUS_LABELS[file.status]}</span>
                    {file.staged ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnstage(file.path) }}
                        className="p-1 rounded transition-all"
                        style={{ background: 'var(--bg-elevated)' }}
                        title="Unstage"
                      >
                        <Minus className="w-3 h-3" style={{ color: '#EF4444' }} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStage(file.path) }}
                        className="p-1 rounded transition-all"
                        style={{ background: 'var(--bg-elevated)' }}
                        title="Stage"
                      >
                        <Plus className="w-3 h-3" style={{ color: '#10B981' }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Commit box */}
            {files.some(f => f.staged) && (
              <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <textarea
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Commit message..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none mb-2"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={handleCommit}
                  disabled={!commitMsg.trim() || loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: commitMsg.trim() && !loading ? 'var(--accent)' : 'var(--bg-card)',
                    color: commitMsg.trim() && !loading ? '#fff' : 'var(--text-dim)',
                    cursor: commitMsg.trim() && !loading ? 'pointer' : 'not-allowed',
                  }}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCommit className="w-3.5 h-3.5" />}
                  Commit ({files.filter(f => f.staged).length} staged)
                </button>
              </div>
            )}

            {/* Diff viewer */}
            {selectedFile && diff && (
              <div className="mt-3 rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="px-3 py-2 text-xs font-medium border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <Eye className="w-3.5 h-3.5" />
                  Diff: {selectedFile}
                </div>
                <pre className="p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto" style={{ fontFamily: 'SF Mono, Fira Code, monospace', color: 'var(--text-muted)' }}>
                  {diff.split('\n').map((line, i) => (
                    <div
                      key={i}
                      style={{
                        color: line.startsWith('+') && !line.startsWith('+++') ? '#10B981'
                          : line.startsWith('-') && !line.startsWith('---') ? '#EF4444'
                          : line.startsWith('@@') ? '#06B6D4'
                          : 'var(--text-muted)',
                        background: line.startsWith('+') ? 'rgba(16,185,129,0.05)' : line.startsWith('-') ? 'rgba(239,68,68,0.05)' : 'transparent',
                      }}
                    >
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </Section>

          {/* History */}
          <Section
            title="History"
            icon={Clock}
            expanded={expandedHistory}
            onToggle={() => setExpandedHistory(!expandedHistory)}
            count={logs.length}
          >
            <div className="flex flex-col gap-1">
              {logs.map(entry => (
                <div key={entry.hash}>
                  <button
                    onClick={() => handleCommitClick(entry.hash)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all"
                    style={{
                      background: selectedCommit === entry.hash ? 'var(--bg-elevated)' : 'transparent',
                    }}
                  >
                    <code className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--bg-elevated)', color: '#A78BFA' }}>
                      {entry.hash}
                    </code>
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text)' }}>{entry.message}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{entry.date.split(' ')[0]}</span>
                  </button>
                  {selectedCommit === entry.hash && commitDiff && (
                    <pre className="mt-1 ml-6 mb-2 p-3 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontFamily: 'SF Mono, Fira Code, monospace', color: 'var(--text-muted)' }}>
                      {commitDiff.split('\n').map((line, i) => (
                        <div
                          key={i}
                          style={{
                            color: line.startsWith('+') && !line.startsWith('+++') ? '#10B981'
                              : line.startsWith('-') && !line.startsWith('---') ? '#EF4444'
                              : line.startsWith('@@') ? '#06B6D4'
                              : 'var(--text-muted)',
                            background: line.startsWith('+') ? 'rgba(16,185,129,0.05)' : line.startsWith('-') ? 'rgba(239,68,68,0.05)' : 'transparent',
                          }}
                        >
                          {line || ' '}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

// ─── Collapsible Section ─────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  expanded,
  onToggle,
  count,
  actions,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  expanded: boolean
  onToggle: () => void
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div
        className="p-3 flex items-center justify-between cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
          <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
              {count}
            </span>
          )}
        </div>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}