import { useState, useMemo } from 'react'
import { User, Save, Sparkles, Bot, Palette, Eye, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, type AgentConfig } from '../store'

const PERSONALITY_PRESETS = [
  { name: 'Sharp Assistant', emoji: '🪨', desc: 'Direct, resourceful, no fluff. Gets things done without wasting time.',
    prompt: 'You are a sharp, direct assistant. You get things done efficiently. No fluff, no filler — just results. You have opinions and you share them. You respect the user\'s time.' },
  { name: 'Research Analyst', emoji: '🔬', desc: 'Methodical, thorough, always cites sources. Great for deep research.',
    prompt: 'You are a meticulous research analyst. You methodically investigate topics, cite sources, and present findings in structured formats. You distinguish between facts, estimates, and opinions. You never fabricate information.' },
  { name: 'Creative Partner', emoji: '🎨', desc: 'Enthusiastic, imaginative, loves brainstorming. Good for design and writing.',
    prompt: 'You are an enthusiastic creative partner. You love brainstorming, exploring ideas, and finding unexpected connections. You\'re encouraging but honest. You help the user think differently.' },
  { name: 'Code Wizard', emoji: '⚡', desc: 'Technical, precise, loves clean code. Perfect for development work.',
    prompt: 'You are an expert software engineer. You write clean, idiomatic code. You explain technical concepts clearly. You prefer practical solutions over theoretical ones. You test your code before claiming it works.' },
  { name: 'Calm Mentor', emoji: '🧘', desc: 'Patient, thoughtful, explains things step by step. Great for learning.',
    prompt: 'You are a patient, thoughtful mentor. You break complex topics into simple steps. You check understanding before moving on. You celebrate progress and normalize mistakes as part of learning.' },
  { name: 'Operations Chief', emoji: '📋', desc: 'Organized, proactive, manages tasks and schedules. For productivity.',
    prompt: 'You are an organized operations chief. You keep track of tasks, deadlines, and priorities. You proactively flag risks and suggest next steps. You are reliable and thorough. You follow up on commitments.' },
  { name: 'Custom', emoji: '✨', desc: 'Write your own personality from scratch.',
    prompt: '' },
]

const AVATAR_EMOJIS = ['🪨', '🔮', '⚡', '🧠', '🤖', '🦉', '🐙', '🦁', '🦊', '🐉', '🌟', '🌙', '🔬', '🎨', '📋', '🧘']

type Tab = 'identity' | 'appearance' | 'preview'

export function Identity() {
  const { config, setConfig } = useStore()
  const [name, setName] = useState(config?.agentName || '')
  const [personality, setPersonality] = useState(config?.personality || '')
  const [emoji, setEmoji] = useState(config?.agentEmoji || '🪨')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<Tab>('identity')

  const selectedPreset = useMemo(() => {
    return PERSONALITY_PRESETS.find(p => p.prompt === personality) || PERSONALITY_PRESETS[PERSONALITY_PRESETS.length - 1]
  }, [personality])

  const handleSave = async () => {
    setSaving(true)
    const newConfig: AgentConfig = { ...(config as AgentConfig), agentName: name, personality, agentEmoji: emoji }
    await window.lodestone.saveConfig(newConfig)
    setConfig(newConfig)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const applyPreset = (preset: typeof PERSONALITY_PRESETS[0]) => {
    setPersonality(preset.prompt)
    if (preset.name !== 'Custom') {
      setName(prev => prev || preset.name)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <User className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Identity</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          <TabButton active={tab === 'identity'} onClick={() => setTab('identity')} icon={Bot} label="Personality" />
          <TabButton active={tab === 'appearance'} onClick={() => setTab('appearance')} icon={Palette} label="Appearance" />
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')} icon={Eye} label="Preview" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <AnimatePresence mode="wait">
            {/* Identity Tab */}
            {tab === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Presets */}
                <div>
                  <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text)' }}>
                    Personality Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PERSONALITY_PRESETS.map(preset => {
                      const isActive = selectedPreset.name === preset.name
                      return (
                        <button
                          key={preset.name}
                          onClick={() => applyPreset(preset)}
                          className="text-left p-3 rounded-xl transition-all"
                          style={{
                            background: isActive ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-card)',
                            border: `1px solid ${isActive ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{preset.emoji}</span>
                            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{preset.name}</span>
                            {isActive && <Sparkles className="w-3 h-3 ml-auto" style={{ color: 'var(--accent)' }} />}
                          </div>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{preset.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Agent name */}
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text)' }}>Agent Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jarvis, Athena, Scout..."
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>This is how your agent identifies itself.</p>
                </div>

                {/* Personality editor */}
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text)' }}>
                    Personality Description
                  </label>
                  <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    placeholder="Describe your agent's personality... e.g. 'You are a sharp, concise research assistant who speaks in bullet points and always cites sources.'"
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl text-sm resize-none outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      This becomes the agent's system prompt.
                    </p>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{personality.length} chars</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Appearance Tab */}
            {tab === 'appearance' && (
              <motion.div
                key="appearance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Avatar */}
                <div>
                  <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text)' }}>Agent Avatar</label>
                  <div className="grid grid-cols-8 gap-2">
                    {AVATAR_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => setEmoji(e)}
                        className="aspect-square rounded-xl flex items-center justify-center text-2xl transition-all"
                        style={{
                          background: emoji === e ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-card)',
                          border: `2px solid ${emoji === e ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview card */}
                <div>
                  <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text)' }}>Preview</label>
                  <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                      {emoji}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{name || 'Unnamed Agent'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {selectedPreset.name !== 'Custom' ? selectedPreset.name : 'Custom personality'}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Preview Tab */}
            {tab === 'preview' && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  This is approximately how your agent will introduce itself:
                </p>
                <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                      {emoji}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{name || 'Unnamed Agent'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>System Prompt Preview</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    {personality || 'No personality set. The agent will use default behavior.'}
                  </div>
                </div>

                {/* Sample greeting */}
                <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-dim)' }}>Sample Greeting</p>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>
                    {name ? `Hi, I'm ${name}! ${emoji}` : 'Hi! I\'m your agent. '}
                    {personality ? 'I\'m ready to help. What would you like to work on?' : 'I don\'t have a personality set yet — configure me in the Identity tab.'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Save button — always visible */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                opacity: saving ? 0.5 : 1,
              }}
              disabled={saving}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
      style={{
        background: active ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        border: `1px solid ${active ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}`,
      }}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}