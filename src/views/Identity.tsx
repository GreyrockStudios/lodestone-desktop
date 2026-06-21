import { useState } from 'react'
import { User, Save } from 'lucide-react'
import { useStore, type AgentConfig } from '../store'

export function Identity() {
  const { config, setConfig } = useStore()
  const [name, setName] = useState(config?.agentName || '')
  const [personality, setPersonality] = useState(config?.personality || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const newConfig: AgentConfig = { ...(config as AgentConfig), agentName: name, personality }
    await window.lodestone.saveConfig(newConfig)
    setConfig(newConfig)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold">Identity</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">
          {/* Agent name */}
          <div>
            <label className="text-sm font-medium mb-2 block">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jarvis, Athena, Scout..."
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>This is how your agent identifies itself.</p>
          </div>

          {/* Personality */}
          <div>
            <label className="text-sm font-medium mb-2 block">Personality</label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="Describe your agent's personality... e.g. 'You are a sharp, concise research assistant who speaks in bullet points and always cites sources.'"
              rows={6}
              className="w-full px-4 py-3 rounded-xl text-sm resize-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              Plain English description of how your agent should behave. This becomes its system prompt.
            </p>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Changes take effect on next agent restart.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}