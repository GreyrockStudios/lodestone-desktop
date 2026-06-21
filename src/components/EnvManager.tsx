import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Globe, Plus, Edit3, Trash2, Download, Upload, Search, RefreshCw, Check, X, FileText
} from 'lucide-react'

interface EnvVar {
  key: string
  value: string
  source: 'system' | 'user'
}

const ENV_FILE_PATH = '~/.lodestone/env.json'

function loadEnvFile(): Record<string, string> {
  // This would normally be async, but we use a cache loaded on mount
  return {}
}

export function EnvManager() {
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [userVars, setUserVars] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [formData, setFormData] = useState({ key: '', value: '' })
  const [toast, setToast] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)

    // Load system environment variables
    const result = await window.lodestone.execCommand('env', undefined, 5000)
    const systemVars: Record<string, string> = {}
    if (result.success) {
      for (const line of result.stdout.trim().split('\n')) {
        const eqIdx = line.indexOf('=')
        if (eqIdx === -1) continue
        const key = line.slice(0, eqIdx)
        const value = line.slice(eqIdx + 1)
        systemVars[key] = value
      }
    }

    // Load user env file
    const fileResult = await window.lodestone.readFile(ENV_FILE_PATH)
    let userEnv: Record<string, string> = {}
    if (fileResult.success) {
      try {
        userEnv = JSON.parse(fileResult.content)
      } catch { /* ignore parse errors */ }
    }
    setUserVars(userEnv)

    // Merge: user vars override system vars
    const merged: EnvVar[] = []
    const allKeys = new Set([...Object.keys(systemVars), ...Object.keys(userEnv)])
    for (const key of allKeys) {
      if (key in userEnv) {
        merged.push({ key, value: userEnv[key], source: 'user' })
      } else {
        merged.push({ key, value: systemVars[key], source: 'system' })
      }
    }
    merged.sort((a, b) => a.key.localeCompare(b.key))
    setEnvVars(merged)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const saveUserEnv = async (newUserVars: Record<string, string>) => {
    const json = JSON.stringify(newUserVars, null, 2)
    const result = await window.lodestone.writeFile(ENV_FILE_PATH, json)
    if (result.success) {
      setUserVars(newUserVars)
      setToast('Saved to ~/.lodestone/env.json')
      setTimeout(() => setToast(null), 3000)
      refresh()
    } else {
      setToast(`Error: ${result.error}`)
      setTimeout(() => setToast(null), 3000)
    }
  }

  const handleAdd = () => {
    if (!formData.key) return
    const newUserVars = { ...userVars, [formData.key]: formData.value }
    saveUserEnv(newUserVars)
    setShowAddForm(false)
    setFormData({ key: '', value: '' })
  }

  const handleEdit = (envVar: EnvVar) => {
    setEditingKey(envVar.key)
    setFormData({ key: envVar.key, value: envVar.value })
    setShowAddForm(true)
  }

  const handleUpdate = () => {
    if (!editingKey) return
    const newUserVars = { ...userVars }
    // If key changed, remove old and add new
    if (formData.key !== editingKey) {
      delete newUserVars[editingKey]
    }
    newUserVars[formData.key] = formData.value
    saveUserEnv(newUserVars)
    setEditingKey(null)
    setShowAddForm(false)
    setFormData({ key: '', value: '' })
  }

  const handleDelete = (key: string) => {
    if (!confirm(`Delete environment variable "${key}"?`)) return
    const newUserVars = { ...userVars }
    delete newUserVars[key]
    saveUserEnv(newUserVars)
  }

  const handleExport = () => {
    const lines = Object.entries(userVars).map(([k, v]) => `${k}=${v}`)
    const content = lines.join('\n') + (lines.length > 0 ? '\n' : '')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '.env'
    a.click()
    URL.revokeObjectURL(url)
    setToast('Exported as .env file')
    setTimeout(() => setToast(null), 3000)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const imported: Record<string, string> = {}
        for (const line of text.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx === -1) continue
          const key = trimmed.slice(0, eqIdx).trim()
          const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
          imported[key] = value
        }
        const newUserVars = { ...userVars, ...imported }
        await saveUserEnv(newUserVars)
        setToast(`Imported ${Object.keys(imported).length} variables from .env`)
        setTimeout(() => setToast(null), 3000)
      } catch {
        setToast('Failed to import .env file')
        setTimeout(() => setToast(null), 3000)
      }
      event.target.value = ''
    }
    reader.readAsText(file)
  }

  const filtered = envVars.filter(v =>
    !search || v.key.toLowerCase().includes(search.toLowerCase()) ||
    v.value.toLowerCase().includes(search.toLowerCase())
  )

  const userCount = envVars.filter(v => v.source === 'user').length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter variables..."
          className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button onClick={handleExport} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="Export as .env">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
        <button onClick={() => { setShowAddForm(true); setEditingKey(null); setFormData({ key: '', value: '' }) }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }} title="Add variable">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
        <button onClick={refresh} className="p-1.5 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }} title="Refresh">
          <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {/* Hidden import input */}
      <input
ref={importFileRef as any}
        type="file"
        accept=".env,text/plain"
        onChange={handleImport}
        style={{ display: 'none' }}
        id="env-import-input"
      />

      {/* Import button (separate from toolbar to trigger file input) */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <label htmlFor="env-import-input" className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
          <Upload className="w-3.5 h-3.5" /> Import .env
        </label>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
          User variables are stored in <span className="font-mono">~/.lodestone/env.json</span>
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="px-3 py-2 text-xs" style={{ background: 'var(--bg-card)', color: 'var(--text)' }}>
          {toast}
        </div>
      )}

      {/* Add/Edit form */}
      {showAddForm && (
        <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
              {editingKey ? 'Edit Variable' : 'New Variable'}
            </span>
            <button onClick={() => { setShowAddForm(false); setEditingKey(null) }} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-2">
            <input value={formData.key} onChange={e => setFormData({ ...formData, key: e.target.value })} placeholder="KEY" disabled={!!editingKey} className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)', opacity: editingKey ? 0.6 : 1 }} />
            <input value={formData.value} onChange={e => setFormData({ ...formData, value: e.target.value })} placeholder="value" className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
            <button onClick={editingKey ? handleUpdate : handleAdd} disabled={!formData.key} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', opacity: !formData.key ? 0.5 : 1 }}>
              {editingKey ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Environment variables table */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
        {loading && envVars.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No environment variables found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_1fr_60px_80px] gap-2 px-3 py-2 text-xs font-medium sticky top-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              <span>Key</span>
              <span>Value</span>
              <span>Source</span>
              <span className="text-right">Actions</span>
            </div>
            {filtered.map(envVar => (
              <div key={envVar.key} className="grid grid-cols-[1fr_1fr_60px_80px] gap-2 px-3 py-1.5 text-xs items-center group" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="font-mono truncate" style={{ color: 'var(--text)' }}>{envVar.key}</span>
                <span className="font-mono truncate" style={{ color: 'var(--text-dim)' }}>{envVar.value}</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{
                  background: envVar.source === 'user' ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
                  color: envVar.source === 'user' ? '#10B981' : 'var(--text-dim)',
                }}>
                  {envVar.source}
                </span>
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {envVar.source === 'user' && (
                    <>
                      <button onClick={() => handleEdit(envVar)} className="p-1 rounded" title="Edit" style={{ color: 'var(--text-dim)' }}>
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(envVar.key)} className="p-1 rounded" title="Delete" style={{ color: '#EF4444' }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-xs flex items-center gap-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)', background: 'var(--bg-elevated)' }}>
        <FileText className="w-3 h-3" />
        {filtered.length} variables · {userCount} user-defined {loading && '· refreshing...'}
      </div>
    </div>
  )
}