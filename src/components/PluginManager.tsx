import { useState, useEffect } from 'react'
import { Plug, Plus, Trash2, RefreshCw, FileCode, CheckCircle, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Plugin {
  id: string
  name: string
  description: string
  enabled: boolean
  file: string
  tools: string[]
  status: 'active' | 'error' | 'disabled'
  error?: string
}

const MOCK_PLUGINS: Plugin[] = [
  {
    id: '1',
    name: 'GitHub Integration',
    description: 'Create issues, manage PRs, trigger actions',
    enabled: true,
    file: '~/.lodestone/plugins/github.js',
    tools: ['github.createIssue', 'github.listPRs', 'github.mergePR'],
    status: 'active',
  },
  {
    id: '2',
    name: 'Slack Notifier',
    description: 'Send messages to Slack channels',
    enabled: true,
    file: '~/.lodestone/plugins/slack.js',
    tools: ['slack.postMessage', 'slack.listChannels'],
    status: 'active',
  },
  {
    id: '3',
    name: 'Weather Widget',
    description: 'Get weather forecasts and alerts',
    enabled: false,
    file: '~/.lodestone/plugins/weather.js',
    tools: ['weather.forecast', 'weather.alerts'],
    status: 'disabled',
  },
]

export function PluginManager() {
  const [plugins, setPlugins] = useState<Plugin[]>(MOCK_PLUGINS)
  const [scanning, setScanning] = useState(false)

  const togglePlugin = (id: string) => {
    setPlugins(plugins.map(p => {
      if (p.id === id) {
        const enabled = !p.enabled
        return { ...p, enabled, status: enabled ? 'active' : 'disabled' }
      }
      return p
    }))
  }

  const deletePlugin = (id: string) => {
    setPlugins(plugins.filter(p => p.id !== id))
  }

  const rescan = () => {
    setScanning(true)
    setTimeout(() => setScanning(false), 1500)
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-medium" style={{ color: 'var(--text)' }}>Plugins</h3>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {plugins.filter(p => p.enabled).length} active
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={rescan}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          >
            <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
            Rescan
          </button>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus className="w-3 h-3" />
            Install
          </button>
        </div>
      </div>

      {/* Plugin list */}
      <div className="space-y-2">
        <AnimatePresence>
          {plugins.map(plugin => (
            <motion.div
              key={plugin.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="rounded-xl p-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{plugin.name}</span>
                  {plugin.status === 'active' && <CheckCircle className="w-3.5 h-3.5" style={{ color: '#10B981' }} />}
                  {plugin.status === 'error' && <AlertCircle className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => deletePlugin(plugin.id)}
                    className="p-1 rounded hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                  </button>
                  <button
                    onClick={() => togglePlugin(plugin.id)}
                    className="relative w-10 h-5 rounded-full transition-all"
                    style={{ background: plugin.enabled ? '#8B5CF6' : 'var(--border-hover)' }}
                  >
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: plugin.enabled ? '22px' : '2px' }} />
                  </button>
                </div>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{plugin.description}</p>
              <div className="flex flex-wrap gap-1">
                {plugin.tools.map(tool => (
                  <span key={tool} className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#A78BFA' }}>
                    {tool}
                  </span>
                ))}
              </div>
              {plugin.error && (
                <p className="text-xs mt-2 p-2 rounded" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
                  {plugin.error}
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {plugins.length === 0 && (
        <div className="text-center py-8">
          <Plug className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No plugins installed</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
            Drop .js files in ~/.lodestone/plugins/ to add tools
          </p>
        </div>
      )}
    </div>
  )
}