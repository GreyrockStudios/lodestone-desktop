import { useState, useEffect, useCallback } from 'react'
import {
  Settings as SettingsIcon,
  Key,
  Cpu,
  FolderOpen,
  Info,
  Power,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  X,
  Palette,
  Sparkles,
  Zap,
  Github,
  Download,
  Trash2,
  AlertTriangle,
  FileText,
  Clock,
  Play,
  Square,
  Loader2,
} from 'lucide-react'
import { useStore, type AgentConfig } from '../store'

export function SettingsView() {
  const {
    config,
    setConfig,
    engineRunning,
    enginePort,
    setEngineState,
    theme,
    setTheme,
    animationsEnabled,
    setAnimationsEnabled,
    streamingEnabled,
    setStreamingEnabled,
  } = useStore()

  // LLM state
  const [apiKey, setApiKey] = useState(config?.apiKey || '')
  const [model, setModel] = useState(config?.model || '')
  const [provider, setProvider] = useState(config?.llmProvider || 'openai')
  const [endpoint, setEndpoint] = useState(config?.endpoint || '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Engine state
  const [uptime, setUptime] = useState(0)
  const [engineBusy, setEngineBusy] = useState(false)

  // App state
  const [version, setVersion] = useState('')
  const [engineVersion, setEngineVersion] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')

  // Danger zone
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    window.lodestone.appVersion().then(setVersion)
    window.lodestone.workspacePath().then(setWorkspacePath)
    // Engine version is same as app version for now
    window.lodestone.appVersion().then(setEngineVersion)
  }, [])

  // Poll uptime when engine is running
  useEffect(() => {
    if (!engineRunning) {
      setUptime(0)
      return
    }
    const interval = setInterval(() => {
      window.lodestone.engineUptime().then(setUptime)
    }, 1000)
    return () => clearInterval(interval)
  }, [engineRunning])

  const handleSave = useCallback(async () => {
    setSaving(true)
    const newConfig: AgentConfig = {
      ...(config as AgentConfig),
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
  }, [config, apiKey, model, provider, endpoint, setConfig])

  const handleTestConnection = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    const result = await window.lodestone.testConnection(provider, apiKey, model, provider === 'custom' ? endpoint : undefined)
    setTestResult(result)
    setTesting(false)
  }, [provider, apiKey, model, endpoint])

  const handleStartEngine = useCallback(async () => {
    setEngineBusy(true)
    const result = await window.lodestone.startEngine(config as AgentConfig)
    if (result.success) {
      setEngineState(true, result.port)
    }
    setEngineBusy(false)
  }, [config, setEngineState])

  const handleStopEngine = useCallback(async () => {
    setEngineBusy(true)
    await window.lodestone.stopEngine()
    setEngineState(false, 0)
    setEngineBusy(false)
  }, [setEngineState])

  const handleRestart = useCallback(async () => {
    setEngineBusy(true)
    await window.lodestone.stopEngine()
    setEngineState(false, 0)
    setTimeout(async () => {
      const result = await window.lodestone.startEngine(config as AgentConfig)
      if (result.success) {
        setEngineState(true, result.port)
      }
      setEngineBusy(false)
    }, 1000)
  }, [config, setEngineState])

  const handleOpenWorkspace = useCallback(async () => {
    await window.lodestone.openInFinder()
  }, [])

  const handleRevealConfig = useCallback(async () => {
    await window.lodestone.revealConfigFile()
  }, [])

  const handleExportAll = useCallback(async () => {
    await window.lodestone.exportAllData()
  }, [])

  const handleResetAgent = useCallback(async () => {
    setResetting(true)
    await window.lodestone.resetAgent()
    setResetting(false)
    setShowResetConfirm(false)
    // Reload the app
    window.location.reload()
  }, [])

  const handleCheckUpdates = useCallback(() => {
    console.log('[lodestone] Check for updates clicked (no-op)')
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Settings</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">
          {/* LLM Configuration */}
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
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 rounded-lg text-sm"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--text-dim)' }}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Field label="Model">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o, claude-3-5-sonnet, llama-3.1-70b..."
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

            {/* Test connection */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testing || !apiKey}
                className="btn-secondary flex items-center gap-2 text-xs px-3 py-2"
                style={{ opacity: (testing || !apiKey) ? 0.5 : 1 }}
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              {testResult && (
                <div className="flex items-center gap-1.5 text-xs">
                  {testResult.success ? (
                    <>
                      <Check className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                      <span style={{ color: '#10B981' }}>{testResult.message}</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                      <span style={{ color: '#EF4444' }}>{testResult.message}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Save button */}
            <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
              <Key className="w-4 h-4" />
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
            </button>
          </Section>

          {/* Workspace */}
          <Section icon={FolderOpen} title="Workspace">
            <div className="space-y-2">
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Workspace Path</div>
                <div className="text-sm font-mono px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  {workspacePath || '—'}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleOpenWorkspace} className="btn-secondary flex items-center gap-2 text-xs px-3 py-2">
                  <FolderOpen className="w-3.5 h-3.5" /> Open in Finder
                </button>
                <button onClick={handleRevealConfig} className="btn-secondary flex items-center gap-2 text-xs px-3 py-2">
                  <FileText className="w-3.5 h-3.5" /> Reveal Config File
                </button>
              </div>
            </div>
          </Section>

          {/* Engine */}
          <Section icon={Cpu} title="Engine">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: engineRunning ? '#10B981' : '#6B7280' }}
                  />
                  <span className="text-sm">{engineRunning ? 'Running' : 'Stopped'}</span>
                </div>
                {engineBusy && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-dim)' }} />}
              </div>

              {engineRunning && (
                <>
                  <Row label="Port" value={enginePort ? `:${enginePort}` : '—'} />
                  <Row label="Uptime" value={formatUptime(uptime)} />
                </>
              )}

              <div className="flex gap-2 flex-wrap">
                {!engineRunning ? (
                  <button
                    onClick={handleStartEngine}
                    disabled={engineBusy}
                    className="btn-secondary flex items-center gap-2 text-xs px-3 py-2"
                    style={{ opacity: engineBusy ? 0.5 : 1 }}
                  >
                    <Play className="w-3.5 h-3.5" /> Start Engine
                  </button>
                ) : (
                  <button
                    onClick={handleStopEngine}
                    disabled={engineBusy}
                    className="btn-secondary flex items-center gap-2 text-xs px-3 py-2"
                    style={{ opacity: engineBusy ? 0.5 : 1 }}
                  >
                    <Square className="w-3.5 h-3.5" /> Stop Engine
                  </button>
                )}
                {engineRunning && (
                  <button
                    onClick={handleRestart}
                    disabled={engineBusy}
                    className="btn-secondary flex items-center gap-2 text-xs px-3 py-2"
                    style={{ opacity: engineBusy ? 0.5 : 1 }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Restart Engine
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* Appearance */}
          <Section icon={Palette} title="Appearance">
            <div className="space-y-3">
              <ToggleRow
                icon={theme === 'dark' ? 'moon' : 'sun'}
                label="Theme"
                description={theme === 'dark' ? 'Dark mode' : 'Light mode'}
                on={theme === 'dark'}
                onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              />
              <ToggleRow
                icon="sparkles"
                label="Animations"
                description="Enable smooth transitions and motion"
                on={animationsEnabled}
                onToggle={() => setAnimationsEnabled(!animationsEnabled)}
              />
              <ToggleRow
                icon="stream"
                label="Streaming Responses"
                description="Show token-by-token output in chat"
                on={streamingEnabled}
                onToggle={() => setStreamingEnabled(!streamingEnabled)}
              />
            </div>
          </Section>

          {/* About */}
          <Section icon={Info} title="About">
            <div className="space-y-2">
              <Row label="App Version" value={version || '0.1.0'} />
              <Row label="Engine Version" value={engineVersion || '0.1.0'} />
              <Row label="License" value="MIT" />
              <Row label="Made by" value="Greyrock Studio" />
              <div className="flex gap-2 pt-2">
                <a
                  href="https://github.com/greyrockstudio/lodestone"
                  onClick={(e) => e.preventDefault()}
                  className="btn-secondary flex items-center gap-2 text-xs px-3 py-2 no-underline"
                  style={{ color: 'var(--text)' }}
                >
                  <Github className="w-3.5 h-3.5" /> GitHub
                </a>
                <button onClick={handleCheckUpdates} className="btn-secondary flex items-center gap-2 text-xs px-3 py-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Check for Updates
                </button>
              </div>
            </div>
          </Section>

          {/* Danger Zone */}
          <div
            className="card p-4"
            style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" style={{ color: '#EF4444' }} />
              <h3 className="text-sm font-medium" style={{ color: '#EF4444' }}>Danger Zone</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Reset Agent</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Permanently delete all config, workspace, memory, and wiki data.
                  </div>
                </div>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444' }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Export All Data</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Export config, wiki, and memories to a JSON file.
                  </div>
                </div>
                <button
                  onClick={handleExportAll}
                  className="btn-secondary flex items-center gap-2 text-xs px-3 py-2"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="max-w-sm w-full mx-4 p-6 rounded-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#EF4444' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Reset Agent?</h3>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              This will permanently delete your agent's configuration, workspace files, memory, and wiki. The app will restart after reset.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAgent}
                disabled={resetting}
                className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-medium"
                style={{ background: '#EF4444', color: 'white', border: 'none', cursor: 'pointer', opacity: resetting ? 0.5 : 1 }}
              >
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {resetting ? 'Resetting...' : 'Yes, Reset Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Helpers ----

function formatUptime(ms: number): string {
  if (!ms) return '—'
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(mins / 60)
  if (hours > 0) return `${hours}h ${mins % 60}m ${seconds % 60}s`
  if (mins > 0) return `${mins}m ${seconds % 60}s`
  return `${seconds}s`
}

// ---- Components ----

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
    <div className="flex justify-between items-center">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function ToggleRow({ icon, label, description, on, onToggle }: {
  icon: string
  label: string
  description: string
  on: boolean
  onToggle: () => void
}) {
  const iconEl = (() => {
    switch (icon) {
      case 'moon': return <Power className="w-4 h-4" />
      case 'sun': return <Power className="w-4 h-4" />
      case 'sparkles': return <Sparkles className="w-4 h-4" />
      case 'stream': return <Zap className="w-4 h-4" />
      default: return <Power className="w-4 h-4" />
    }
  })()

  return (
    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: on ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-card)' }}
        >
          <span style={{ color: on ? 'var(--accent)' : 'var(--text-dim)' }}>{iconEl}</span>
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{description}</div>
        </div>
      </div>
      <button
        onClick={onToggle}
        className="relative w-11 h-6 rounded-full transition-all"
        style={{ background: on ? 'var(--accent)' : 'var(--border-hover)' }}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
          style={{ left: on ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}