import { useState, useEffect, useCallback } from 'react'
import { Download, Upload, RefreshCw, Trash2, Plus, Minus, Clock, CheckCircle, XCircle, Activity, Cpu, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface DownloadItem {
  id: string
  name: string
  url: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  size?: string
  speed?: string
  eta?: string
  startedAt: number
}

const MOCK_DOWNLOADS: DownloadItem[] = [
  { id: '1', name: 'model-glm5.2.gguf', url: 'https://example.com/model.gguf', status: 'downloading', progress: 67, size: '4.2 GB', speed: '12.5 MB/s', eta: '1m 23s', startedAt: Date.now() - 120000 },
  { id: '2', name: 'dataset-training.json', url: 'https://example.com/data.json', status: 'completed', progress: 100, size: '856 MB', startedAt: Date.now() - 600000 },
  { id: '3', name: 'lodestone-v0.2.0.dmg', url: 'https://github.com/...', status: 'pending', progress: 0, startedAt: Date.now() - 30000 },
]

export function DownloadManager() {
  const [downloads, setDownloads] = useState<DownloadItem[]>(MOCK_DOWNLOADS)
  const [newUrl, setNewUrl] = useState('')
  const [newName, setNewName] = useState('')

  const addDownload = () => {
    if (!newUrl.trim()) return
    const name = newName.trim() || newUrl.split('/').pop() || 'download'
    const item: DownloadItem = {
      id: crypto.randomUUID(),
      name,
      url: newUrl,
      status: 'pending',
      progress: 0,
      startedAt: Date.now(),
    }
    setDownloads(prev => [item, ...prev])
    setNewUrl('')
    setNewName('')

    // Simulate download progress
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'completed', progress: 100, speed: undefined, eta: undefined } : d))
      } else {
        const speed = `${(Math.random() * 20 + 5).toFixed(1)} MB/s`
        const remaining = 100 - progress
        const eta = `${Math.ceil(remaining / 10)}m ${Math.ceil((remaining % 10) * 6)}s`
        setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'downloading', progress, speed, eta } : d))
      }
    }, 2000)
  }

  const removeDownload = (id: string) => {
    setDownloads(prev => prev.filter(d => d.id !== id))
  }

  const retryDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'pending', progress: 0 } : d))
  }

  const totalActive = downloads.filter(d => d.status === 'downloading').length
  const totalCompleted = downloads.filter(d => d.status === 'completed').length
  const totalSpeed = downloads.filter(d => d.status === 'downloading').reduce((sum, d) => {
    const speed = parseFloat(d.speed || '0')
    return sum + speed
  }, 0)

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <Download className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Downloads</h2>
          {totalActive > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
              {totalActive} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-dim)' }}>
          <span>{totalCompleted} completed</span>
          {totalSpeed > 0 && <span>{totalSpeed.toFixed(1)} MB/s total</span>}
        </div>
      </div>

      {/* Add new download */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          placeholder="https://example.com/file.zip"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="filename (optional)"
          className="w-40 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button
          onClick={addDownload}
          disabled={!newUrl.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all"
          style={{
            background: newUrl.trim() ? 'rgba(139,92,246,0.15)' : 'var(--bg-card)',
            color: newUrl.trim() ? 'var(--accent)' : 'var(--text-dim)',
            border: '1px solid var(--border)',
          }}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Download list */}
      <div className="flex-1 overflow-auto p-4 space-y-2" style={{ background: 'var(--bg-card)' }}>
        {downloads.length === 0 && (
          <div className="text-center py-12" style={{ color: 'var(--text-dim)' }}>
            <Download className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No downloads yet</p>
            <p className="text-xs mt-1 opacity-60">Add a URL above to start downloading</p>
          </div>
        )}
        <AnimatePresence>
          {downloads.map(item => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-3 rounded-xl"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3">
                {/* Status icon */}
                {item.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#10B981' }} />
                ) : item.status === 'failed' ? (
                  <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
                ) : item.status === 'downloading' ? (
                  <Download className="w-5 h-5 flex-shrink-0 animate-bounce" style={{ color: '#3B82F6' }} />
                ) : (
                  <Clock className="w-5 h-5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{item.name}</span>
                    {item.size && (
                      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{item.size}</span>
                    )}
                  </div>
                  {item.status === 'downloading' && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)' }}
                          animate={{ width: `${item.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{Math.round(item.progress)}%</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                    {item.speed && <span>{item.speed}</span>}
                    {item.eta && <span>ETA: {item.eta}</span>}
                    <span>{new Date(item.startedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {item.status === 'failed' && (
                    <button onClick={() => retryDownload(item.id)} className="p-1.5 rounded-lg" title="Retry">
                      <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
                    </button>
                  )}
                  {(item.status === 'pending' || item.status === 'downloading') && (
                    <button onClick={() => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'failed' } : d))} className="p-1.5 rounded-lg" title="Cancel">
                      <Minus className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                    </button>
                  )}
                  <button onClick={() => removeDownload(item.id)} className="p-1.5 rounded-lg" title="Remove">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}