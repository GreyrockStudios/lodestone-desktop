import { useState, useEffect, useCallback } from 'react'
import { Package, RefreshCw, ArrowUp, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface PkgInfo {
  name: string
  version: string
  type: string
  latest?: string
  description?: string
}

interface ExecResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number | null
}

type PkgManager = 'npm' | 'pip' | 'brew' | 'none'

const PM_LABELS: Record<PkgManager, string> = {
  npm: 'Node.js (npm)',
  pip: 'Python (pip)',
  brew: 'Homebrew',
  none: 'No package manager detected',
}

const PM_COLORS: Record<PkgManager, string> = {
  npm: '#10B981',
  pip: '#3B82F6',
  brew: '#F59E0B',
  none: '#6B7280',
}

export function PackageManager() {
  const [manager, setManager] = useState<PkgManager>('none')
  const [packages, setPackages] = useState<PkgInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [updateMsg, setUpdateMsg] = useState('')

  const detectAndLoad = useCallback(async () => {
    setLoading(true)
    setPackages([])

    // Try Homebrew (macOS)
    if (process.platform === 'darwin' || true) {
      const brewCheck = await window.lodestone.execCommand('which brew 2>/dev/null && brew list --formula 2>/dev/null', undefined, 10000) as unknown as ExecResult
      if (brewCheck.success && brewCheck.stdout.trim()) {
        const brewPkgs: PkgInfo[] = brewCheck.stdout.trim().split('\n').map(line => {
          const name = line.trim().split('@')[0]
          return { name: line.trim(), version: '', type: 'brew' }
        })
        setPackages(brewPkgs)
        setManager('brew')
        setLoading(false)
        return
      }
    }

    // Try npm — look for package.json in common project locations
    const npmCheck = await window.lodestone.execCommand('cat package.json 2>/dev/null', undefined, 5000) as unknown as ExecResult
    if (npmCheck.success && npmCheck.stdout.trim().startsWith('{')) {
      try {
        const pkg = JSON.parse(npmCheck.stdout)
        const deps: PkgInfo[] = []
        if (pkg.dependencies) {
          for (const [name, version] of Object.entries(pkg.dependencies)) {
            deps.push({ name, version: version as string, type: 'dependency' })
          }
        }
        if (pkg.devDependencies) {
          for (const [name, version] of Object.entries(pkg.devDependencies)) {
            deps.push({ name, version: version as string, type: 'devDependency' })
          }
        }
        setPackages(deps)
        setManager('npm')
        setLoading(false)
        return
      } catch { /* not valid json */ }
    }

    // Try pip — requirements.txt or pyproject.toml
    const pipCheck = await window.lodestone.execCommand('cat requirements.txt 2>/dev/null || cat pyproject.toml 2>/dev/null', undefined, 5000) as unknown as ExecResult
    if (pipCheck.success && pipCheck.stdout.trim()) {
      const pipPkgs: PkgInfo[] = []
      for (const line of pipCheck.stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue
        // Parse "package==1.0.0" or "package>=1.0.0" or just "package"
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([><=!~]?.*)?$/)
        if (match) {
          pipPkgs.push({ name: match[1], version: match[2]?.replace(/[><=!~]/g, '') || '', type: 'pip' })
        }
      }
      if (pipPkgs.length > 0) {
        setPackages(pipPkgs)
        setManager('pip')
        setLoading(false)
        return
      }
    }

    setManager('none')
    setLoading(false)
  }, [])

  useEffect(() => {
    detectAndLoad()
  }, [detectAndLoad])

  const handleUpdate = async (pkgName: string) => {
    setUpdating(pkgName)
    setUpdateMsg('')
    let cmd = ''
    if (manager === 'npm') cmd = `npm update ${pkgName}`
    else if (manager === 'pip') cmd = `pip install --upgrade ${pkgName}`
    else if (manager === 'brew') cmd = `brew upgrade ${pkgName}`

    const result = await window.lodestone.execCommand(cmd, undefined, 60000) as unknown as ExecResult
    if (result.success) {
      setUpdateMsg(`Updated ${pkgName}`)
    } else {
      setUpdateMsg(`Failed: ${result.stderr.slice(0, 200)}`)
    }
    setUpdating(null)
    setTimeout(() => setUpdateMsg(''), 3000)
    await detectAndLoad()
  }

  const filtered = packages.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.version.toLowerCase().includes(search.toLowerCase())
  )

  const depCount = packages.filter(p => p.type === 'dependency').length
  const devDepCount = packages.filter(p => p.type === 'devDependency').length
  const brewCount = packages.filter(p => p.type === 'brew').length
  const pipCount = packages.filter(p => p.type === 'pip').length

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4" style={{ color: PM_COLORS[manager] }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Package Manager</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${PM_COLORS[manager]}15`, color: PM_COLORS[manager] }}>
            {PM_LABELS[manager]}
          </span>
          {packages.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {packages.length} packages
              {depCount > 0 && ` (${depCount} deps, ${devDepCount} devDeps)`}
              {brewCount > 0 && ` installed`}
              {pipCount > 0 && ` listed`}
            </span>
          )}
        </div>
        <button
          onClick={detectAndLoad}
          className="p-1.5 rounded-lg transition-all"
          style={{ background: 'var(--bg-elevated)' }}
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Search */}
      {packages.length > 5 && (
        <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packages..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        </div>
      )}

      {/* Update message */}
      {updateMsg && (
        <div className="px-3 py-1.5 text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          {updateMsg}
        </div>
      )}

      {/* Package list */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Detecting packages...</p>
          </div>
        ) : manager === 'none' ? (
          <div className="p-4 text-center">
            <Package className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No package manager detected in current directory.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Supports npm, pip, and Homebrew.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No packages found.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map(pkg => (
              <div
                key={`${pkg.name}-${pkg.type}`}
                className="border-b last:border-b-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <div
                  className="p-2.5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpanded(expanded === pkg.name ? null : pkg.name)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {expanded === pkg.name ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />}
                    <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{pkg.name}</span>
                    <span className="text-xs font-mono" style={{ color: PM_COLORS[manager] }}>{pkg.version || '—'}</span>
                    {pkg.type !== 'brew' && pkg.type !== 'pip' && pkg.type !== 'dependency' && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                        {pkg.type}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUpdate(pkg.name) }}
                    disabled={updating === pkg.name}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                    style={{
                      background: updating === pkg.name ? 'var(--bg-elevated)' : 'transparent',
                      color: updating === pkg.name ? 'var(--text-dim)' : PM_COLORS[manager],
                      cursor: updating === pkg.name ? 'wait' : 'pointer',
                      border: `1px solid ${updating === pkg.name ? 'var(--border)' : PM_COLORS[manager]}30`,
                    }}
                  >
                    {updating === pkg.name ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowUp className="w-3 h-3" />}
                    Update
                  </button>
                </div>
                <AnimatePresence>
                  {expanded === pkg.name && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-2 text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
                        <div className="flex gap-2">
                          <span style={{ color: 'var(--text-dim)' }}>Name:</span>
                          <code style={{ color: 'var(--text)' }}>{pkg.name}</code>
                        </div>
                        <div className="flex gap-2">
                          <span style={{ color: 'var(--text-dim)' }}>Version:</span>
                          <code style={{ color: PM_COLORS[manager] }}>{pkg.version || 'latest'}</code>
                        </div>
                        <div className="flex gap-2">
                          <span style={{ color: 'var(--text-dim)' }}>Type:</span>
                          <span>{pkg.type}</span>
                        </div>
                        <div className="flex gap-2">
                          <span style={{ color: 'var(--text-dim)' }}>Manager:</span>
                          <span>{PM_LABELS[manager]}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}