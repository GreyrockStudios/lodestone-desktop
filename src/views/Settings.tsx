import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Key, Cpu, FolderOpen, Info, Power, RefreshCw } from 'lucide-react'
import { useStore, type AgentConfig } from '../store'

export function SettingsView() {
  const { config, setConfig, engineRunning, setEngineState } = useStore()
  const [apiKey, setApiKey] = useState(config?.apiKey || '')
  const [model, setModel] = useState(config?.model || '')
  const [provider, setProvider] = useState(config?.llmProvider || 'openai')
  const [endpoint, setEndpoint] = useState(config?.endpoint || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [version, setVersion] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')

  useEffect(() => {
    window.lodestone.appVersion().then(setVersion)
    window.lodestone.workspacePath().then(setWorkspacePath)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const newConfig: AgentConfig = {
      ...config!,
      apiKey,
      model,
      llmProvider: provider,
      endpoint: provider === 'custom' ? endpoint : undefined,
    }
    await window.lodestone.saveConfig(newConfig)
    setConfig(newConfig)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleRestart = async () => {
    await window.lodestone.stopEngine()
    setEngineState(false, 0)
    setTimeout(async () => {
      const result = await window.lodestone.startEngine(config!)
      if (result.success) {
        setEngineState(true, result.port)
      }
    }, 1000)
  }

  const handleOpenWorkspace = async () => {
    await window.lodestone.openInFinder()
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Settings</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">
          {/* LLM Settings */}
          <Section icon={Key} title="LLM Configuration">
            <Field label="Provider">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama-cloud">Ollama Cloud</option>
                <option value="groq">Groq</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom (OpenAI-compatible)</option>
              </select>
            </Field>
            <Field label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </Field>
            {provider === 'custom' && (
              <Field label="Endpoint URL">
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </Field>
            )}
          </Section>

          {/* Engine */}
          <Section icon={Cpu} title="Engine">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Engine Status</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {engineRunning ? 'Running' : 'Stopped'}
                </div>
              </div>
              {engineRunning && (
                <button onClick={handleRestart} className="btn-secondary flex items-center gap-2 text-xs px-3 py-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Restart
                </button>
              )}
            </div>
          </Section>

          {/* Workspace */}
          <Section icon={FolderOpen} title="Workspace">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{workspacePath}</div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Your agent's files, memory, and wiki live here.</div>
              </div>
              <button onClick={handleOpenWorkspace} className="btn-secondary text-xs px-3 py-2 shrink-0 ml-2">
                Open
              </button>
            </div>
          </Section>

          {/* About */}
          <Section icon={Info} title="About">
            <div className="text-sm space-y-1">
              <Row label="Version" value={version || '0.1.0'} />
              <Row label="License" value="MIT" />
              <Row label="Made by" value="Greyrock Studio" />
            </div>
          </Section>

          {/* Save */}
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Key className="w-4 h-4" />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}