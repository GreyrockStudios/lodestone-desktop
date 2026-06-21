import { useState, useCallback } from 'react'
import {
  Send, Plus, Trash2, Copy, Clock, FileJson, FileText,
  ChevronDown, Loader2, AlertCircle, Save, FolderOpen,
  Code, Shield, Key, History, X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
type BodyType = 'json' | 'form-data' | 'raw' | 'none'
type AuthType = 'none' | 'bearer' | 'basic' | 'api-key'

interface KeyValue {
  id: string
  key: string
  value: string
  enabled: boolean
}

interface RequestConfig {
  method: HttpMethod
  url: string
  headers: KeyValue[]
  params: KeyValue[]
  bodyType: BodyType
  body: string
  authType: AuthType
  authToken: string
  authUsername: string
  authPassword: string
  authApiKeyHeader: string
  authApiKey: string
}

interface ResponseData {
  status: number
  statusText: string
  time: number
  size: number
  headers: Record<string, string>
  body: string
}

interface SavedRequest {
  id: string
  name: string
  collection: string
  config: RequestConfig
  timestamp: number
}

interface Collection {
  id: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#10B981',
  POST: '#3B82F6',
  PUT: '#F59E0B',
  PATCH: '#8B5CF6',
  DELETE: '#EF4444',
  HEAD: '#6B7280',
  OPTIONS: '#06B6D4',
}

const DEFAULT_REQUEST: RequestConfig = {
  method: 'GET',
  url: '',
  headers: [],
  params: [],
  bodyType: 'none',
  body: '',
  authType: 'none',
  authToken: '',
  authUsername: '',
  authPassword: '',
  authApiKeyHeader: '',
  authApiKey: '',
}

function newKV(): KeyValue {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true }
}

function formatJson(str: string): string {
  try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
}

function substituteEnvVars(url: string, vars: Record<string, string>): string {
  return url.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Storage ──────────────────────────────────────────────────────────

function loadHistory(): SavedRequest[] {
  try {
    const raw = localStorage.getItem('lodestone-api-history')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveHistory(history: SavedRequest[]) {
  localStorage.setItem('lodestone-api-history', JSON.stringify(history.slice(0, 20)))
}

function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem('lodestone-api-collections')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function loadEnvVars(): Record<string, string> {
  try {
    const raw = localStorage.getItem('lodestone-api-env')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { base_url: 'http://localhost:3001', api_key: '' }
}

// ─── API Playground ───────────────────────────────────────────────────

export function ApiPlayground() {
  const [request, setRequest] = useState<RequestConfig>({ ...DEFAULT_REQUEST })
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params')
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body')
  const [history, setHistory] = useState<SavedRequest[]>(loadHistory)
  const [collections, setCollections] = useState<Collection[]>(loadCollections)
  const [showHistory, setShowHistory] = useState(false)
  const [showCollections, setShowCollections] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveCollection, setSaveCollection] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [envVars, setEnvVars] = useState<Record<string, string>>(loadEnvVars)
  const [showEnvEditor, setShowEnvEditor] = useState(false)

  const updateRequest = useCallback(<K extends keyof RequestConfig>(key: K, value: RequestConfig[K]) => {
    setRequest(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSend = useCallback(async () => {
    if (!request.url.trim()) { setError('URL is required'); return }
    setSending(true)
    setError('')
    setResponse(null)

    try {
      let url = substituteEnvVars(request.url, envVars)
      // Append query params
      const activeParams = request.params.filter(p => p.enabled && p.key)
      if (activeParams.length > 0) {
        const sep = url.includes('?') ? '&' : '?'
        url += sep + activeParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(substituteEnvVars(p.value, envVars))}`).join('&')
      }

      // Build headers
      const headers: Record<string, string> = {}
      request.headers.filter(h => h.enabled && h.key).forEach(h => {
        headers[h.key] = substituteEnvVars(h.value, envVars)
      })

      // Auth
      if (request.authType === 'bearer' && request.authToken) {
        headers['Authorization'] = `Bearer ${request.authToken}`
      } else if (request.authType === 'basic' && request.authUsername) {
        headers['Authorization'] = `Basic ${btoa(`${request.authUsername}:${request.authPassword}`)}`
      } else if (request.authType === 'api-key' && request.authApiKeyHeader && request.authApiKey) {
        headers[request.authApiKeyHeader] = request.authApiKey
      }

      // Build body
      let bodyStr = ''
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.bodyType !== 'none') {
        if (request.bodyType === 'json') {
          headers['Content-Type'] = headers['Content-Type'] || 'application/json'
          bodyStr = request.body
        } else if (request.bodyType === 'form-data') {
          headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded'
          bodyStr = request.body
        } else {
          bodyStr = request.body
        }
      }

      // Use curl via lodestone
      let curlCmd = `curl -s -i -X ${request.method}`
      Object.entries(headers).forEach(([k, v]) => {
        curlCmd += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`
      })
      if (bodyStr) {
        curlCmd += ` -d '${bodyStr.replace(/'/g, "'\\''")}'`
      }
      curlCmd += ` "${url}"`

      const startTime = Date.now()
      const result = await window.lodestone.execCommand(curlCmd, undefined, 30000)
      const elapsed = Date.now() - startTime

      if (result.exitCode !== null && result.exitCode >= 0) {
        // Parse curl -i output (headers + body)
        const output = result.stdout + result.stderr
        const headerEndIdx = output.indexOf('\r\n\r\n')
        let respHeaders: Record<string, string> = {}
        let respBody = output

        if (headerEndIdx !== -1) {
          const headerSection = output.substring(0, headerEndIdx)
          respBody = output.substring(headerEndIdx + 4)
          headerSection.split('\r\n').forEach(line => {
            const idx = line.indexOf(':')
            if (idx > 0) {
              respHeaders[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
            }
          })
        }

        // Try to detect status code from first line
        const statusMatch = output.match(/^HTTP\/[\d.]+\s+(\d+)\s+(.*)/m)
        const status = statusMatch ? parseInt(statusMatch[1]) : (result.exitCode === 0 ? 200 : 500)
        const statusText = statusMatch ? statusMatch[2].trim() : (status < 400 ? 'OK' : 'Error')

        setResponse({
          status,
          statusText,
          time: elapsed,
          size: new Blob([respBody]).size,
          headers: respHeaders,
          body: respBody,
        })
      } else {
        setError(`Request failed: ${result.stderr || result.stdout || 'Unknown error'}`)
      }

      // Save to history
      const histEntry: SavedRequest = {
        id: crypto.randomUUID(),
        name: `${request.method} ${request.url.substring(0, 40)}`,
        collection: '',
        config: { ...request },
        timestamp: Date.now(),
      }
      const newHistory = [histEntry, ...history].slice(0, 20)
      setHistory(newHistory)
      saveHistory(newHistory)
    } catch (err) {
      setError(`Error: ${(err as Error).message}`)
    }
    setSending(false)
  }, [request, history, envVars])

  const handleSaveRequest = useCallback(() => {
    if (!saveName.trim()) return
    const entry: SavedRequest = {
      id: crypto.randomUUID(),
      name: saveName,
      collection: saveCollection,
      config: { ...request },
      timestamp: Date.now(),
    }
    const newHistory = [entry, ...history].slice(0, 20)
    setHistory(newHistory)
    saveHistory(newHistory)
    if (saveCollection) {
      if (!collections.find(c => c.name === saveCollection)) {
        const newCollections = [...collections, { id: crypto.randomUUID(), name: saveCollection }]
        setCollections(newCollections)
        localStorage.setItem('lodestone-api-collections', JSON.stringify(newCollections))
      }
    }
    setSaveName('')
    setSaveCollection('')
    setShowSaveDialog(false)
  }, [saveName, saveCollection, request, history, collections])

  const handleLoadRequest = useCallback((saved: SavedRequest) => {
    setRequest({ ...saved.config })
    setShowHistory(false)
    setShowCollections(false)
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>API Playground</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(!showHistory)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
            <History className="w-3.5 h-3.5" /> History
          </button>
          <button onClick={() => setShowSaveDialog(true)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={() => setShowEnvEditor(!showEnvEditor)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
            <Key className="w-3.5 h-3.5" /> Env
          </button>
        </div>
      </div>

      {/* URL Bar */}
      <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
        <div className="relative">
          <select
            value={request.method}
            onChange={e => updateRequest('method', e.target.value as HttpMethod)}
            className="px-3 py-2 pr-8 rounded-lg text-sm font-mono font-bold appearance-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: METHOD_COLORS[request.method], cursor: 'pointer' }}
          >
            {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as HttpMethod[]).map(m => (
              <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>{m}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-dim)' }} />
        </div>
        <input
          type="text" value={request.url} onChange={e => updateRequest('url', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="https://api.example.com/endpoint  — use {{base_url}} for env vars"
          className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <button onClick={handleSend} disabled={sending || !request.url} className="btn-primary flex items-center gap-2 text-xs px-4 py-2" style={{ opacity: (sending || !request.url) ? 0.5 : 1 }}>
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b flex items-center gap-1" style={{ borderColor: 'var(--border)' }}>
        {(['params', 'headers', 'body', 'auth'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-2 text-xs font-medium border-b-2 transition-colors"
            style={{
              borderBottomColor: activeTab === tab ? 'var(--accent)' : 'transparent',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'params' && request.params.length > 0 && <span className="ml-1 opacity-60">({request.params.filter(p => p.enabled && p.key).length})</span>}
            {tab === 'headers' && request.headers.length > 0 && <span className="ml-1 opacity-60">({request.headers.filter(h => h.enabled && h.key).length})</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Env Editor */}
        {showEnvEditor && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Environment Variables</span>
              <button onClick={() => {
                const keys = Object.keys(envVars)
                const newVars = { ...envVars, [`var_${keys.length + 1}`]: '' }
                setEnvVars(newVars)
                localStorage.setItem('lodestone-api-env', JSON.stringify(newVars))
              }} className="btn-secondary text-xs px-2 py-1 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {Object.entries(envVars).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 mb-1">
                <input type="text" value={key} readOnly className="w-32 px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-dim)' }} />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>=</span>
                <input type="text" value={value} onChange={e => {
                  const newVars = { ...envVars, [key]: e.target.value }
                  setEnvVars(newVars)
                  localStorage.setItem('lodestone-api-env', JSON.stringify(newVars))
                }} className="flex-1 px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <button onClick={() => {
                  const newVars = { ...envVars }
                  delete newVars[key]
                  setEnvVars(newVars)
                  localStorage.setItem('lodestone-api-env', JSON.stringify(newVars))
                }} style={{ color: 'var(--text-dim)' }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>Use {'{{variable_name}}'} in URLs, headers, and body</p>
          </div>
        )}

        {/* Params Tab */}
        {activeTab === 'params' && (
          <div className="space-y-2">
            {request.params.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <input type="checkbox" checked={p.enabled} onChange={e => setRequest(prev => ({ ...prev, params: prev.params.map(pp => pp.id === p.id ? { ...pp, enabled: e.target.checked } : pp) }))} className="w-4 h-4" />
                <input type="text" value={p.key} onChange={e => setRequest(prev => ({ ...prev, params: prev.params.map(pp => pp.id === p.id ? { ...pp, key: e.target.value } : pp) }))} placeholder="Key" className="w-40 px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <input type="text" value={p.value} onChange={e => setRequest(prev => ({ ...prev, params: prev.params.map(pp => pp.id === p.id ? { ...pp, value: e.target.value } : pp) }))} placeholder="Value" className="flex-1 px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <button onClick={() => setRequest(prev => ({ ...prev, params: prev.params.filter(pp => pp.id !== p.id) }))} style={{ color: 'var(--text-dim)' }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => setRequest(prev => ({ ...prev, params: [...prev.params, newKV()] }))} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Param
            </button>
          </div>
        )}

        {/* Headers Tab */}
        {activeTab === 'headers' && (
          <div className="space-y-2">
            {request.headers.map(h => (
              <div key={h.id} className="flex items-center gap-2">
                <input type="checkbox" checked={h.enabled} onChange={e => setRequest(prev => ({ ...prev, headers: prev.headers.map(hh => hh.id === h.id ? { ...hh, enabled: e.target.checked } : hh) }))} className="w-4 h-4" />
                <input type="text" value={h.key} onChange={e => setRequest(prev => ({ ...prev, headers: prev.headers.map(hh => hh.id === h.id ? { ...hh, key: e.target.value } : hh) }))} placeholder="Header name" className="w-40 px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <input type="text" value={h.value} onChange={e => setRequest(prev => ({ ...prev, headers: prev.headers.map(hh => hh.id === h.id ? { ...hh, value: e.target.value } : hh) }))} placeholder="Value" className="flex-1 px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <button onClick={() => setRequest(prev => ({ ...prev, headers: prev.headers.filter(hh => hh.id !== h.id) }))} style={{ color: 'var(--text-dim)' }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => setRequest(prev => ({ ...prev, headers: [...prev.headers, newKV()] }))} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Header
            </button>
          </div>
        )}

        {/* Body Tab */}
        {activeTab === 'body' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['none', 'json', 'form-data', 'raw'] as BodyType[]).map(bt => (
                <button key={bt} onClick={() => updateRequest('bodyType', bt)} className="px-3 py-1.5 rounded text-xs" style={{ background: request.bodyType === bt ? 'var(--accent)' : 'var(--bg-elevated)', color: request.bodyType === bt ? '#fff' : 'var(--text-muted)', border: `1px solid ${request.bodyType === bt ? 'var(--accent)' : 'var(--border)'}` }}>
                  {bt === 'none' ? 'None' : bt === 'form-data' ? 'Form Data' : bt.charAt(0).toUpperCase() + bt.slice(1)}
                </button>
              ))}
            </div>
            {request.bodyType !== 'none' && (
              <textarea
                value={request.body}
                onChange={e => updateRequest('body', e.target.value)}
                placeholder={request.bodyType === 'json' ? '{\n  "key": "value"\n}' : request.bodyType === 'form-data' ? 'key1=value1&key2=value2' : 'Request body...'}
                rows={10}
                className="w-full px-3 py-2 rounded-lg text-xs font-mono resize-y"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            )}
          </div>
        )}

        {/* Auth Tab */}
        {activeTab === 'auth' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['none', 'bearer', 'basic', 'api-key'] as AuthType[]).map(at => (
                <button key={at} onClick={() => updateRequest('authType', at)} className="px-3 py-1.5 rounded text-xs flex items-center gap-1" style={{ background: request.authType === at ? 'var(--accent)' : 'var(--bg-elevated)', color: request.authType === at ? '#fff' : 'var(--text-muted)', border: `1px solid ${request.authType === at ? 'var(--accent)' : 'var(--border)'}` }}>
                  {at === 'bearer' && <Shield className="w-3 h-3" />}
                  {at === 'none' ? 'None' : at === 'bearer' ? 'Bearer Token' : at === 'basic' ? 'Basic Auth' : 'API Key'}
                </button>
              ))}
            </div>
            {request.authType === 'bearer' && (
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Token</label>
                <input type="text" value={request.authToken} onChange={e => updateRequest('authToken', e.target.value)} placeholder="eyJhbGci..." className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            )}
            {request.authType === 'basic' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Username</label>
                  <input type="text" value={request.authUsername} onChange={e => updateRequest('authUsername', e.target.value)} placeholder="username" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Password</label>
                  <input type="password" value={request.authPassword} onChange={e => updateRequest('authPassword', e.target.value)} placeholder="password" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              </div>
            )}
            {request.authType === 'api-key' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Header Name</label>
                  <input type="text" value={request.authApiKeyHeader} onChange={e => updateRequest('authApiKeyHeader', e.target.value)} placeholder="X-API-Key" className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
                  <input type="text" value={request.authApiKey} onChange={e => updateRequest('authApiKey', e.target.value)} placeholder="your-api-key" className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {/* Response */}
        {response && (
          <div className="mt-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-bold" style={{ color: response.status < 400 ? '#10B981' : response.status < 500 ? '#F59E0B' : '#EF4444' }}>
                {response.status} {response.statusText}
              </span>
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                <Clock className="w-3 h-3" /> {response.time}ms
              </span>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatSize(response.size)}</span>
            </div>
            <div className="flex items-center gap-1 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              {(['body', 'headers'] as const).map(tab => (
                <button key={tab} onClick={() => setResponseTab(tab)} className="px-3 py-1.5 text-xs font-medium border-b-2" style={{ borderBottomColor: responseTab === tab ? 'var(--accent)' : 'transparent', color: responseTab === tab ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
              <button
                onClick={() => { navigator.clipboard.writeText(responseTab === 'body' ? response.body : JSON.stringify(response.headers, null, 2)) }}
                className="ml-auto p-1 rounded" style={{ color: 'var(--text-dim)' }}
                title="Copy response"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            {responseTab === 'body' ? (
              <pre className="text-xs font-mono p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {response.body.trim().startsWith('{') || response.body.trim().startsWith('[') ? formatJson(response.body) : response.body}
              </pre>
            ) : (
              <div className="space-y-1">
                {Object.entries(response.headers).map(([key, value]) => (
                  <div key={key} className="flex text-xs font-mono">
                    <span className="w-48 flex-shrink-0 font-semibold" style={{ color: 'var(--accent)' }}>{key}:</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowHistory(false)}>
          <div className="w-80 h-full overflow-y-auto p-4" style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Request History</h3>
              <button onClick={() => setShowHistory(false)} style={{ color: 'var(--text-dim)' }}><X className="w-4 h-4" /></button>
            </div>
            {history.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No requests yet</p>
            ) : (
              history.map(h => (
                <button key={h.id} onClick={() => handleLoadRequest(h)} className="w-full text-left p-2.5 rounded-lg mb-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono" style={{ color: METHOD_COLORS[h.config.method] }}>{h.config.method}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{h.config.url || h.name}</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{new Date(h.timestamp).toLocaleString()}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowSaveDialog(false)}>
          <div className="w-full max-w-sm p-6 rounded-2xl mx-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Save Request</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
                <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="My API request" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Collection (optional)</label>
                <input type="text" value={saveCollection} onChange={e => setSaveCollection(e.target.value)} placeholder="Collection name" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }} list="collection-names" />
                <datalist id="collection-names">
                  {collections.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowSaveDialog(false)} className="btn-secondary text-xs px-4 py-2">Cancel</button>
                <button onClick={handleSaveRequest} disabled={!saveName.trim()} className="btn-primary text-xs px-4 py-2 flex items-center gap-1" style={{ opacity: saveName.trim() ? 1 : 0.5 }}>
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}