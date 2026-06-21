import { useState, useEffect, useCallback } from 'react'
import {
  Terminal, Plus, Edit3, Trash2, RefreshCw, Plug, Plug2, Download, X, Check, AlertTriangle,
  Search, ChevronDown, ChevronRight
} from 'lucide-react'

interface SSHConnection {
  id: string
  name: string
  host: string
  port: number
  user: string
  keyPath?: string
  status: 'connected' | 'disconnected' | 'testing' | 'error'
}

const STORAGE_KEY = 'lodestone-ssh-connections'

function loadConnections(): SSHConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveConnections(conns: SSHConnection[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conns))
  } catch { /* ignore */ }
}

function parseSSHConfig(configText: string): SSHConnection[] {
  const connections: SSHConnection[] = []
  const lines = configText.split('\n')
  let current: Partial<SSHConnection> | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const parts = trimmed.split(/\s+/)
    const keyword = parts[0].toLowerCase()
    const value = parts.slice(1).join(' ')

    if (keyword === 'host') {
      if (current && current.name && current.host) {
        connections.push({
          id: crypto.randomUUID(),
          name: current.name,
          host: current.host,
          port: current.port || 22,
          user: current.user || '',
          keyPath: current.keyPath,
          status: 'disconnected',
        })
      }
      current = { name: value, port: 22 }
    } else if (current) {
      if (keyword === 'hostname') current.host = value
      else if (keyword === 'port') current.port = parseInt(value) || 22
      else if (keyword === 'user') current.user = value
      else if (keyword === 'identityfile') current.keyPath = value.replace(/^~/, '~')
    }
  }

  if (current && current.name && current.host) {
    connections.push({
      id: crypto.randomUUID(),
      name: current.name,
      host: current.host,
      port: current.port || 22,
      user: current.user || '',
      keyPath: current.keyPath,
      status: 'disconnected',
    })
  }

  return connections
}

export function SSHManager() {
  const [connections, setConnections] = useState<SSHConnection[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [formData, setFormData] = useState<Omit<SSHConnection, 'id' | 'status'>>({
    name: '', host: '', port: 22, user: '', keyPath: '',
  })

  useEffect(() => {
    setConnections(loadConnections())
  }, [])

  const persist = useCallback((conns: SSHConnection[]) => {
    setConnections(conns)
    saveConnections(conns)
  }, [])

  const handleAdd = () => {
    if (!formData.name || !formData.host || !formData.user) return
    const conn: SSHConnection = {
      ...formData,
      id: crypto.randomUUID(),
      status: 'disconnected',
    }
    persist([...connections, conn])
    setShowAddForm(false)
    setFormData({ name: '', host: '', port: 22, user: '', keyPath: '' })
  }

  const handleEdit = (conn: SSHConnection) => {
    setEditingId(conn.id)
    setFormData({ name: conn.name, host: conn.host, port: conn.port, user: conn.user, keyPath: conn.keyPath || '' })
    setShowAddForm(true)
  }

  const handleUpdate = () => {
    if (!editingId) return
    persist(connections.map(c => c.id === editingId ? { ...c, ...formData } : c))
    setEditingId(null)
    setShowAddForm(false)
    setFormData({ name: '', host: '', port: 22, user: '', keyPath: '' })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this SSH connection?')) return
    persist(connections.filter(c => c.id !== id))
  }

  const handleTest = async (conn: SSHConnection) => {
    persist(connections.map(c => c.id === conn.id ? { ...c, status: 'testing' } : c))
    const cmd = `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -p ${conn.port} ${conn.user}@${conn.host} echo ok`
    const result = await window.lodestone.execCommand(cmd, undefined, 10000)
    const ok = result.success && result.stdout.trim() === 'ok'
    persist(connections.map(c => c.id === conn.id ? { ...c, status: ok ? 'connected' : 'error' } : c))
  }

  const handleConnect = async (conn: SSHConnection) => {
    const cmd = `ssh -p ${conn.port} ${conn.user}@${conn.host}`
    await window.lodestone.openTerminal(cmd)
    persist(connections.map(c => c.id === conn.id ? { ...c, status: 'connected' } : c))
  }

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)
    const result = await window.lodestone.readFile('~/.ssh/config')
    if (result.success) {
      const parsed = parseSSHConfig(result.content)
      if (parsed.length > 0) {
        const existingNames = new Set(connections.map(c => c.name))
        const newConns = parsed.filter(c => !existingNames.has(c.name))
        persist([...connections, ...newConns])
        setImportResult({ success: true, message: `Imported ${newConns.length} connection(s) from ~/.ssh/config` })
      } else {
        setImportResult({ success: false, message: 'No valid connections found in ~/.ssh/config' })
      }
    } else {
      setImportResult({ success: false, message: 'Could not read ~/.ssh/config' })
    }
    setImporting(false)
    setTimeout(() => setImportResult(null), 4000)
  }

  const filtered = connections.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.host.toLowerCase().includes(search.toLowerCase()) ||
    c.user.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor = (status: SSHConnection['status']) => {
    switch (status) {
      case 'connected': return '#10B981'
      case 'testing': return '#F59E0B'
      case 'error': return '#EF4444'
      default: return '#6B7280'
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter connections..."
          className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', opacity: importing ? 0.5 : 1 }}
          title="Import from ~/.ssh/config"
        >
          <Download className="w-3.5 h-3.5" /> Import
        </button>
        <button
          onClick={() => { setShowAddForm(true); setEditingId(null); setFormData({ name: '', host: '', port: 22, user: '', keyPath: '' }) }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}
          title="Add new connection"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Import result */}
      {importResult && (
        <div className="px-3 py-2 text-xs flex items-center gap-2" style={{
          background: importResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          color: importResult.success ? '#10B981' : '#EF4444',
        }}>
          {importResult.success ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {importResult.message}
        </div>
      )}

      {/* Add/Edit form */}
      {showAddForm && (
        <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
              {editingId ? 'Edit Connection' : 'New Connection'}
            </span>
            <button onClick={() => { setShowAddForm(false); setEditingId(null) }} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Name" className="px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
            <input value={formData.host} onChange={e => setFormData({ ...formData, host: e.target.value })} placeholder="Host (e.g. 192.168.1.1)" className="px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
            <input value={formData.user} onChange={e => setFormData({ ...formData, user: e.target.value })} placeholder="User" className="px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
            <input type="number" value={formData.port} onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })} placeholder="Port" className="px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
            <input value={formData.keyPath || ''} onChange={e => setFormData({ ...formData, keyPath: e.target.value })} placeholder="Key path (optional, e.g. ~/.ssh/id_rsa)" className="col-span-2 px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setShowAddForm(false); setEditingId(null) }} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>Cancel</button>
            <button onClick={editingId ? handleUpdate : handleAdd} disabled={!formData.name || !formData.host || !formData.user} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', opacity: (!formData.name || !formData.host || !formData.user) ? 0.5 : 1 }}>
              {editingId ? 'Update' : 'Add'} Connection
            </button>
          </div>
        </div>
      )}

      {/* Connection list */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No SSH connections yet</p>
            <p className="text-xs mt-1 opacity-60">Click "Add" to create one or "Import" from ~/.ssh/config</p>
          </div>
        ) : (
          filtered.map(conn => (
            <div key={conn.id} className="px-3 py-2.5 group" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <Terminal className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full" style={{ background: statusColor(conn.status) }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{conn.name}</div>
                  <div className="text-xs font-mono truncate" style={{ color: 'var(--text-dim)' }}>
                    {conn.user}@{conn.host}:{conn.port}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleTest(conn)} className="p-1.5 rounded-lg" title="Test connection" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                    <Plug2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleConnect(conn)} className="p-1.5 rounded-lg" title="Connect" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                    <Plug className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleEdit(conn)} className="p-1.5 rounded-lg" title="Edit" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(conn.id)} className="p-1.5 rounded-lg" title="Delete" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button onClick={() => setExpandedId(expandedId === conn.id ? null : conn.id)} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
                  {expandedId === conn.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
              {expandedId === conn.id && (
                <div className="mt-2 ml-7 text-xs space-y-1" style={{ color: 'var(--text-dim)' }}>
                  <div><span style={{ color: 'var(--text)' }}>Host:</span> {conn.host}</div>
                  <div><span style={{ color: 'var(--text)' }}>Port:</span> {conn.port}</div>
                  <div><span style={{ color: 'var(--text)' }}>User:</span> {conn.user}</div>
                  {conn.keyPath && <div><span style={{ color: 'var(--text)' }}>Key:</span> {conn.keyPath}</div>}
                  <div><span style={{ color: 'var(--text)' }}>Status:</span> <span style={{ color: statusColor(conn.status) }}>{conn.status}</span></div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)', background: 'var(--bg-elevated)' }}>
        {filtered.length} connection(s)
      </div>
    </div>
  )
}