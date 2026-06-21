import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Shield, Lock, Unlock, Eye, EyeOff, Copy, Plus, Trash2,
  Search, Download, Upload, RefreshCw, Key, Globe, StickyNote,
  CreditCard, Tag, Check, AlertTriangle, X, ChevronDown, ChevronUp,
  Loader2,
} from 'lucide-react'

// ─── Crypto Helpers ─────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptVault(data: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt.buffer as ArrayBuffer)
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data))
  const payload = { s: Array.from(salt), i: Array.from(iv), d: Array.from(new Uint8Array(encrypted)) }
  return JSON.stringify(payload)
}

async function decryptVault(encrypted: string, password: string): Promise<string> {
  const payload = JSON.parse(encrypted)
  const salt = new Uint8Array(payload.s)
  const iv = new Uint8Array(payload.i) as unknown as ArrayBuffer
  const data = new Uint8Array(payload.d) as unknown as ArrayBuffer
  const key = await deriveKey(password, salt.buffer as ArrayBuffer)
  const decoder = new TextDecoder()
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return decoder.decode(decrypted)
}

// ─── Types ────────────────────────────────────────────────────────────

type VaultCategory = 'login' | 'api-key' | 'token' | 'credit-card' | 'note'

interface VaultEntry {
  id: string
  name: string
  username: string
  password: string
  url: string
  notes: string
  category: VaultCategory
  createdAt: number
  updatedAt: number
}

interface ClipboardTimer {
  field: 'username' | 'password'
  entryId: string
  remaining: number
}

// ─── Password Strength ────────────────────────────────────────────────

function getPasswordStrength(pw: string): { label: string; score: number; color: string } {
  if (!pw) return { label: '—', score: 0, color: 'var(--text-dim)' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (pw.length >= 16) score++
  if (/[a-z]/.test(pw)) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 2) return { label: 'Weak', score: 25, color: '#EF4444' }
  if (score <= 4) return { label: 'Fair', score: 50, color: '#F59E0B' }
  if (score <= 5) return { label: 'Good', score: 75, color: '#06B6D4' }
  return { label: 'Strong', score: 100, color: '#10B981' }
}

// ─── Password Generator ───────────────────────────────────────────────

function generatePassword(length: number, upper: boolean, lower: boolean, nums: boolean, syms: boolean): string {
  let chars = ''
  if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (lower) chars += 'abcdefghijklmnopqrstuvwxyz'
  if (nums) chars += '0123456789'
  if (syms) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?'
  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const arr = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(arr).map(b => chars[b % chars.length]).join('')
}

// ─── Demo Entries ──────────────────────────────────────────────────────

const DEMO_ENTRIES: VaultEntry[] = [
  { id: 'demo-1', name: 'GitHub', username: 'devuser', password: 'ghp_xK8mR2qP9nL4wT7v', url: 'https://github.com', notes: 'Personal access token for repos', category: 'login', createdAt: Date.now() - 86400000 * 30, updatedAt: Date.now() - 86400000 * 5 },
  { id: 'demo-2', name: 'AWS Access Key', username: 'AKIA3EXAMPLE', password: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', url: 'https://console.aws.amazon.com', notes: 'Production account access key', category: 'api-key', createdAt: Date.now() - 86400000 * 20, updatedAt: Date.now() - 86400000 * 3 },
  { id: 'demo-3', name: 'Slack Bot Token', username: 'bot-token', password: 'xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwxyz', url: 'https://slack.com', notes: 'Workspace bot OAuth token', category: 'token', createdAt: Date.now() - 86400000 * 15, updatedAt: Date.now() - 86400000 * 1 },
  { id: 'demo-4', name: 'Corporate Card', username: 'John Doe', password: '4111111111111111', url: '', notes: 'Expires 12/2027, CVV 123', category: 'credit-card', createdAt: Date.now() - 86400000 * 10, updatedAt: Date.now() - 86400000 * 2 },
  { id: 'demo-5', name: 'Server Recovery Phrase', username: '', password: 'abandon ability able about above absent absorb abstract absurd abuse access accident', url: '', notes: 'Keep this secure — 12-word recovery phrase for staging server', category: 'note', createdAt: Date.now() - 86400000 * 5, updatedAt: Date.now() },
]

// ─── Category Icons & Labels ──────────────────────────────────────────

const CATEGORY_CONFIG: Record<VaultCategory, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }> = {
  'login': { icon: Globe, label: 'Login' },
  'api-key': { icon: Key, label: 'API Key' },
  'token': { icon: Shield, label: 'Token' },
  'credit-card': { icon: CreditCard, label: 'Credit Card' },
  'note': { icon: StickyNote, label: 'Secure Note' },
}

// ─── Vault Component ──────────────────────────────────────────────────

export function Vault() {
  const [locked, setLocked] = useState(true)
  const [masterPassword, setMasterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [error, setError] = useState('')
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<VaultCategory | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editingEntry, setEditingEntry] = useState<VaultEntry | null>(null)
  const [showGenerator, setShowGenerator] = useState(false)
  const [genLength, setGenLength] = useState(16)
  const [genUpper, setGenUpper] = useState(true)
  const [genLower, setGenLower] = useState(true)
  const [genNums, setGenNums] = useState(true)
  const [genSyms, setGenSyms] = useState(true)
  const [genResult, setGenResult] = useState('')
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set())
  const [clipboardTimers, setClipboardTimers] = useState<ClipboardTimer[]>([])
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check first run on mount
  useEffect(() => {
    const key = localStorage.getItem('lodestone-vault-key')
    if (!key) {
      setIsFirstRun(true)
      setLocked(true)
    } else {
      setIsFirstRun(false)
      setLocked(true)
    }
  }, [])

  // Clipboard auto-clear timer
  useEffect(() => {
    if (clipboardTimers.length === 0 && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    } else if (clipboardTimers.length > 0 && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setClipboardTimers(prev => {
          const next = prev.map(t => ({ ...t, remaining: t.remaining - 1 })).filter(t => t.remaining > 0)
          if (next.length === 0) {
            navigator.clipboard.writeText('').catch(() => {})
          }
          return next
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [clipboardTimers.length > 0])

  const loadEntries = useCallback(async (password: string) => {
    const raw = localStorage.getItem('lodestone-vault')
    if (!raw) {
      setEntries(DEMO_ENTRIES)
      const enc = await encryptVault(JSON.stringify(DEMO_ENTRIES), password)
      localStorage.setItem('lodestone-vault', enc)
      return
    }
    try {
      const decrypted = await decryptVault(raw, password)
      setEntries(JSON.parse(decrypted))
    } catch {
      throw new Error('Invalid master password')
    }
  }, [])

  const saveEntries = useCallback(async (newEntries: VaultEntry[], password: string) => {
    const enc = await encryptVault(JSON.stringify(newEntries), password)
    localStorage.setItem('lodestone-vault', enc)
  }, [])

  const handleUnlock = useCallback(async () => {
    setError('')
    try {
      if (isFirstRun) {
        if (!masterPassword) { setError('Master password is required'); return }
        if (masterPassword !== confirmPassword) { setError('Passwords do not match'); return }
        if (masterPassword.length < 6) { setError('Password must be at least 6 characters'); return }
        const hash = await sha256(masterPassword)
        localStorage.setItem('lodestone-vault-key', hash)
        await loadEntries(masterPassword)
        setLocked(false)
        setIsFirstRun(false)
      } else {
        const hash = await sha256(masterPassword)
        const stored = localStorage.getItem('lodestone-vault-key')
        if (hash !== stored) { setError('Invalid master password'); return }
        await loadEntries(masterPassword)
        setLocked(false)
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to unlock vault')
    }
  }, [masterPassword, confirmPassword, isFirstRun, loadEntries])

  const handleLock = useCallback(() => {
    setLocked(true)
    setMasterPassword('')
    setConfirmPassword('')
    setEntries([])
    setVisiblePasswords(new Set())
  }, [])

  const handleCopy = useCallback(async (text: string, field: 'username' | 'password', entryId: string) => {
    await navigator.clipboard.writeText(text)
    setClipboardTimers(prev => {
      const filtered = prev.filter(t => !(t.entryId === entryId && t.field === field))
      return [...filtered, { field, entryId, remaining: 30 }]
    })
  }, [])

  const togglePasswordVisibility = useCallback((id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleAddEntry = useCallback(async (entry: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newEntry: VaultEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }
    const newEntries = [...entries, newEntry]
    setEntries(newEntries)
    await saveEntries(newEntries, masterPassword)
    setShowAdd(false)
  }, [entries, masterPassword, saveEntries])

  const handleUpdateEntry = useCallback(async (entry: VaultEntry | Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) => {
    const full = entry as VaultEntry
    const newEntries = entries.map(e => e.id === full.id ? { ...full, updatedAt: Date.now() } : e)
    setEntries(newEntries)
    await saveEntries(newEntries, masterPassword)
    setEditingEntry(null)
  }, [entries, masterPassword, saveEntries])

  const handleDeleteEntry = useCallback(async (id: string) => {
    const newEntries = entries.filter(e => e.id !== id)
    setEntries(newEntries)
    await saveEntries(newEntries, masterPassword)
  }, [entries, masterPassword, saveEntries])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const enc = await encryptVault(JSON.stringify(entries), masterPassword)
      const blob = new Blob([enc], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lodestone-vault-${new Date().toISOString().split('T')[0]}.vault`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    setExporting(false)
  }, [entries, masterPassword])

  const handleImport = useCallback(async (file: File) => {
    setImporting(true)
    setError('')
    try {
      const text = await file.text()
      const decrypted = await decryptVault(text, masterPassword)
      const imported: VaultEntry[] = JSON.parse(decrypted)
      const merged = [...entries, ...imported.map(e => ({ ...e, id: crypto.randomUUID() }))]
      setEntries(merged)
      await saveEntries(merged, masterPassword)
    } catch {
      setError('Failed to import vault. Wrong password or corrupted file.')
    }
    setImporting(false)
  }, [entries, masterPassword, saveEntries])

  const handleGenerate = useCallback(() => {
    setGenResult(generatePassword(genLength, genUpper, genLower, genNums, genSyms))
  }, [genLength, genUpper, genLower, genNums, genSyms])

  const filteredEntries = entries.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false
    if (search) {
      const q = search.toLowerCase()
      return e.name.toLowerCase().includes(q) || e.username.toLowerCase().includes(q) || e.url.toLowerCase().includes(q) || e.notes.toLowerCase().includes(q)
    }
    return true
  })

  // ─── Locked Gate ─────────────────────────────────────────────────────

  if (locked) {
    return (
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-sm p-8 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
              <Lock className="w-8 h-8" style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Vault</h2>
            <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>
              {isFirstRun ? 'Set a master password to protect your secrets' : 'Enter your master password to unlock'}
            </p>
            {error && (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg w-full" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#EF4444' }}>
                <AlertTriangle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}
            <input
              type="password"
              value={masterPassword}
              onChange={e => { setMasterPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              placeholder="Master password"
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {isFirstRun && (
              <input
                type="password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                placeholder="Confirm password"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            )}
            <button onClick={handleUnlock} className="btn-primary w-full flex items-center justify-center gap-2">
              <Unlock className="w-4 h-4" />
              {isFirstRun ? 'Create Vault' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Unlocked View ───────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Vault</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent)' }}>{entries.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGenerator(!showGenerator)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Generator
          </button>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5" style={{ opacity: exporting ? 0.5 : 1 }}>
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <label className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5 cursor-pointer" style={{ opacity: importing ? 0.5 : 1 }}>
            <Upload className="w-3.5 h-3.5" /> Import
            <input type="file" accept=".vault" onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])} style={{ display: 'none' }} disabled={importing} />
          </label>
          <button onClick={handleLock} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
            <Lock className="w-3.5 h-3.5" /> Lock
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-xs px-4 py-2" style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#EF4444' }}>
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto' }}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Search + Filter */}
      <div className="p-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'login', 'api-key', 'token', 'credit-card', 'note'] as const).map(cat => (
            <button
              key={cat} onClick={() => setFilterCategory(cat)}
              className="px-2 py-1 rounded text-xs" style={{ background: filterCategory === cat ? 'var(--accent)' : 'var(--bg-elevated)', color: filterCategory === cat ? '#fff' : 'var(--text-muted)', border: `1px solid ${filterCategory === cat ? 'var(--accent)' : 'var(--border)'}` }}
            >
              {cat === 'all' ? 'All' : CATEGORY_CONFIG[cat].label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1 text-xs px-3 py-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Entry
        </button>
      </div>

      {/* Password Generator */}
      {showGenerator && (
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Key className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium">Password Generator</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="text" readOnly value={genResult} placeholder="Click Generate"
              className="flex-1 px-3 py-2 rounded-lg text-sm font-mono" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button onClick={() => genResult && navigator.clipboard.writeText(genResult)} disabled={!genResult} className="btn-secondary px-3 py-2" style={{ opacity: genResult ? 1 : 0.4 }}>
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={handleGenerate} className="btn-primary px-3 py-2 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Generate
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Length: {genLength}</span>
              <input type="range" min={8} max={64} value={genLength} onChange={e => setGenLength(Number(e.target.value))} className="w-32" />
            </div>
            <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={genUpper} onChange={e => setGenUpper(e.target.checked)} /> A-Z
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={genLower} onChange={e => setGenLower(e.target.checked)} /> a-z
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={genNums} onChange={e => setGenNums(e.target.checked)} /> 0-9
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={genSyms} onChange={e => setGenSyms(e.target.checked)} /> !@#
            </label>
          </div>
        </div>
      )}

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-dim)' }}>
            <Shield className="w-12 h-12 mb-3" style={{ opacity: 0.3 }} />
            <p className="text-sm">No entries found</p>
            <p className="text-xs mt-1">Add an entry or adjust your search</p>
          </div>
        )}
        {filteredEntries.map(entry => {
          const CatIcon = CATEGORY_CONFIG[entry.category].icon
          const isVisible = visiblePasswords.has(entry.id)
          const strength = getPasswordStrength(entry.password)
          const usernameTimer = clipboardTimers.find(t => t.entryId === entry.id && t.field === 'username')
          const passwordTimer = clipboardTimers.find(t => t.entryId === entry.id && t.field === 'password')
          return (
            <div key={entry.id} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                  <CatIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{entry.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>{CATEGORY_CONFIG[entry.category].label}</span>
                  </div>
                  {entry.username && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Username:</span>
                      <span className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{entry.username}</span>
                      <button onClick={() => handleCopy(entry.username, 'username', entry.id)} className="p-0.5" style={{ color: 'var(--text-dim)' }}>
                        <Copy className="w-3 h-3" />
                      </button>
                      {usernameTimer && <span className="text-xs" style={{ color: 'var(--accent)' }}>{usernameTimer.remaining}s</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Password:</span>
                    <span className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                      {isVisible ? entry.password : '•'.repeat(Math.min(entry.password.length, 20))}
                    </span>
                    <button onClick={() => togglePasswordVisibility(entry.id)} className="p-0.5" style={{ color: 'var(--text-dim)' }}>
                      {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    <button onClick={() => handleCopy(entry.password, 'password', entry.id)} className="p-0.5" style={{ color: 'var(--text-dim)' }}>
                      <Copy className="w-3 h-3" />
                    </button>
                    {passwordTimer && <span className="text-xs" style={{ color: 'var(--accent)' }}>{passwordTimer.remaining}s</span>}
                  </div>
                  {/* Strength meter */}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)', maxWidth: 120 }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${strength.score}%`, background: strength.color }} />
                    </div>
                    <span className="text-xs" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                  {entry.url && (
                    <div className="flex items-center gap-2 mt-1">
                      <Globe className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                      <span className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>{entry.url}</span>
                    </div>
                  )}
                  {entry.notes && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{entry.notes}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => setEditingEntry(entry)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-dim)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteEntry(entry.id)} className="p-1.5 rounded-lg" style={{ color: '#EF4444' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Entry Modal */}
      {showAdd && (
        <EntryModal
          onSave={handleAddEntry}
          onClose={() => setShowAdd(false)}
          initialCategory={filterCategory === 'all' ? 'login' : filterCategory}
          onGeneratePassword={() => { setShowAdd(false); setShowGenerator(true) }}
        />
      )}

      {/* Edit Entry Modal */}
      {editingEntry && (
        <EntryModal
          entry={editingEntry}
          onSave={handleUpdateEntry}
          onClose={() => setEditingEntry(null)}
          onGeneratePassword={() => { setEditingEntry(null); setShowGenerator(true) }}
        />
      )}
    </div>
  )
}

// ─── Entry Modal ──────────────────────────────────────────────────────

function EntryModal({
  entry,
  onSave,
  onClose,
  initialCategory,
  onGeneratePassword,
}: {
  entry?: VaultEntry | null
  onSave: (data: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> | VaultEntry) => void
  onClose: () => void
  initialCategory?: VaultCategory
  onGeneratePassword?: () => void
}) {
  const [name, setName] = useState(entry?.name || '')
  const [username, setUsername] = useState(entry?.username || '')
  const [password, setPassword] = useState(entry?.password || '')
  const [url, setUrl] = useState(entry?.url || '')
  const [notes, setNotes] = useState(entry?.notes || '')
  const [category, setCategory] = useState<VaultCategory>(entry?.category || initialCategory || 'login')

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md p-6 rounded-2xl mx-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{entry ? 'Edit Entry' : 'New Entry'}</h3>
          <button onClick={onClose} style={{ color: 'var(--text-dim)' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Entry name" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as VaultCategory)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {(['login', 'api-key', 'token', 'credit-card', 'note'] as VaultCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
              ))}
            </select>
          </div>
          {category !== 'note' && (
            <>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username or email" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Password</label>
                <div className="flex gap-2">
                  <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="flex-1 px-3 py-2 rounded-lg text-sm font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  {onGeneratePassword && (
                    <button onClick={onGeneratePassword} className="btn-secondary px-2" title="Generate password">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {password && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${getPasswordStrength(password).score}%`, background: getPasswordStrength(password).color }} />
                    </div>
                    <span className="text-xs" style={{ color: getPasswordStrength(password).color }}>{getPasswordStrength(password).label}</span>
                  </div>
                )}
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>URL</label>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={onClose} className="btn-secondary text-xs px-4 py-2">Cancel</button>
            <button
              onClick={() => {
                if (!name.trim()) return
                if (entry) {
                  onSave({ ...entry, name, username, password, url, notes, category })
                } else {
                  onSave({ name, username, password, url, notes, category })
                }
                onClose()
              }}
              disabled={!name.trim()}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1"
              style={{ opacity: name.trim() ? 1 : 0.5 }}
            >
              <Check className="w-3.5 h-3.5" /> {entry ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}