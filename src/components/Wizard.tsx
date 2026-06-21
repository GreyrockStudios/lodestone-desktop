import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Bot, Key, Cpu, ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useStore, type AgentConfig } from '../store'

const PERSONALITIES = [
  { id: 'research', name: 'Research Assistant', desc: 'Thorough, analytical, cites sources', icon: '🔬' },
  { id: 'devops', name: 'DevOps Agent', desc: 'Monitors systems, runs commands, fixes issues', icon: '⚙️' },
  { id: 'personal', name: 'Personal Assistant', desc: 'Organized, helpful, remembers everything', icon: '📋' },
  { id: 'content', name: 'Content Writer', desc: 'Creative, on-brand, drafts and edits', icon: '✍️' },
  { id: 'custom', name: 'Custom', desc: 'Write your own personality', icon: '🎨' },
]

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'], envKey: 'OPENAI_API_KEY' },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'], envKey: 'ANTHROPIC_API_KEY' },
  { id: 'ollama-cloud', name: 'Ollama Cloud', models: ['llama3.1:70b', 'llama3.1:8b', 'qwen2.5:32b', 'glm-4:9b'], envKey: 'OLLAMA_API_KEY' },
  { id: 'groq', name: 'Groq', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'], envKey: 'GROQ_API_KEY' },
  { id: 'openrouter', name: 'OpenRouter', models: ['auto', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-2.0-flash'], envKey: 'OPENROUTER_API_KEY' },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', models: [], envKey: 'CUSTOM_API_KEY' },
]

export function Wizard({ onComplete }: { onComplete: (config: AgentConfig) => void }) {
  const [step, setStep] = useState(0)
  const [agentName, setAgentName] = useState('')
  const [personality, setPersonality] = useState('research')
  const [customPersonality, setCustomPersonality] = useState('')
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [endpoint, setEndpoint] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const steps = ['Name', 'Personality', 'Connect LLM', 'Start']
  const selectedProvider = PROVIDERS.find(p => p.id === provider)

  const handleFinish = async () => {
    setStarting(true)
    setError('')
    
    const config: AgentConfig = {
      agentName: agentName || 'My Agent',
      personality: personality === 'custom' ? customPersonality : PERSONALITIES.find(p => p.id === personality)?.name || 'Assistant',
      llmProvider: provider,
      apiKey,
      model,
      endpoint: provider === 'custom' ? endpoint : undefined,
    }
    
    try {
      // Save config
      await window.lodestone.saveConfig(config)
      
      // Start engine
      const result = await window.lodestone.startEngine(config)
      if (result.success) {
        onComplete(config)
      } else {
        setError(result.error || 'Failed to start engine')
        setStarting(false)
      }
    } catch (err) {
      setError((err as Error).message)
      setStarting(false)
    }
  }

  return (
    <div className="h-full w-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #8B5CF6, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #06B6D4, transparent 70%)' }} />
      </div>

      <div className="relative w-full max-w-lg mx-4">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Sparkles className="w-6 h-6 text-violet-400" />
            <h1 className="text-2xl font-bold gradient-text">Lodestone</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your self-improving AI agent</p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full transition-all"
                style={{
                  background: i <= step ? 'var(--accent)' : 'var(--border-hover)',
                  transform: i === step ? 'scale(1.5)' : 'scale(1)',
                }}
              />
              {i < steps.length - 1 && (
                <div className="w-8 h-px" style={{ background: i < step ? 'var(--accent)' : 'var(--border)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card p-8">
          <AnimatePresence mode="wait">
            {/* Step 0: Name */}
            {step === 0 && (
              <motion.div
                key="name"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Bot className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">Name your agent</h2>
                </div>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  Give your agent a name. This is how it will identify itself.
                </p>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Jarvis, Athena, Scout..."
                  className="w-full px-4 py-3 rounded-xl text-base"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && agentName && setStep(1)}
                />
                <div className="flex justify-end mt-6">
                  <button className="btn-primary flex items-center gap-2" onClick={() => setStep(1)} disabled={!agentName}>
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 1: Personality */}
            {step === 1 && (
              <motion.div
                key="personality"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Bot className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">Pick a personality</h2>
                </div>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  What should your agent be good at? You can change this later.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {PERSONALITIES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPersonality(p.id)}
                      className="flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                      style={{
                        background: personality === p.id ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-elevated)',
                        border: `1px solid ${personality === p.id ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      <span className="text-xl">{p.icon}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.desc}</div>
                      </div>
                      {personality === p.id && <Check className="w-4 h-4 text-violet-400" />}
                    </button>
                  ))}
                </div>
                {personality === 'custom' && (
                  <textarea
                    value={customPersonality}
                    onChange={(e) => setCustomPersonality(e.target.value)}
                    placeholder="Describe your agent's personality... e.g. 'You are a sharp, concise financial analyst who speaks in bullet points'"
                    className="w-full mt-3 p-3 rounded-xl text-sm h-20 resize-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                )}
                <div className="flex justify-between mt-6">
                  <button className="btn-secondary flex items-center gap-2" onClick={() => setStep(0)}>
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button className="btn-primary flex items-center gap-2" onClick={() => setStep(2)}>
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Connect LLM */}
            {step === 2 && (
              <motion.div
                key="llm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Key className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">Connect your LLM</h2>
                </div>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  Paste your API key. It stays on your machine — never sent anywhere except to the LLM provider.
                </p>
                
                {/* Provider select */}
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value)
                    const p = PROVIDERS.find(pp => pp.id === e.target.value)
                    if (p && p.models.length) setModel(p.models[0])
                  }}
                  className="w-full px-4 py-3 rounded-xl text-sm mb-4"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {/* API Key */}
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`${selectedProvider?.envKey || 'API_KEY'}=...`}
                  className="w-full px-4 py-3 rounded-xl text-sm mb-4"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />

                {/* Model */}
                {selectedProvider && selectedProvider.models.length > 0 && (
                  <>
                    <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-sm mb-4"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    >
                      {selectedProvider.models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </>
                )}

                {/* Custom model input */}
                {selectedProvider && selectedProvider.models.length === 0 && (
                  <>
                    <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Model name</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. gpt-4o, llama3.1:70b..."
                      className="w-full px-4 py-3 rounded-xl text-sm mb-4"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </>
                )}

                {/* Custom endpoint */}
                {provider === 'custom' && (
                  <>
                    <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Endpoint URL</label>
                    <input
                      type="text"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      className="w-full px-4 py-3 rounded-xl text-sm mb-4"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </>
                )}

                <div className="flex justify-between mt-6">
                  <button className="btn-secondary flex items-center gap-2" onClick={() => setStep(1)}>
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button className="btn-primary flex items-center gap-2" onClick={() => setStep(3)} disabled={!apiKey}>
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Start */}
            {step === 3 && (
              <motion.div
                key="start"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Cpu className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">Ready to go</h2>
                </div>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  Your agent is ready. Here's the setup:
                </p>
                
                <div className="space-y-3 mb-6">
                  <SummaryRow label="Agent name" value={agentName} />
                  <SummaryRow label="Personality" value={personality === 'custom' ? 'Custom' : PERSONALITIES.find(p => p.id === personality)?.name || personality} />
                  <SummaryRow label="Provider" value={selectedProvider?.name || provider} />
                  <SummaryRow label="Model" value={model} />
                  <SummaryRow label="API Key" value={`${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`} />
                </div>

                {error && (
                  <div className="p-3 mb-4 rounded-xl text-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444' }}>
                    {error}
                  </div>
                )}

                <div className="flex justify-between mt-6">
                  <button className="btn-secondary flex items-center gap-2" onClick={() => setStep(2)} disabled={starting}>
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button className="btn-primary flex items-center gap-2" onClick={handleFinish} disabled={starting}>
                    {starting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Starting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Launch Agent
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Privacy note */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-dim)' }}>
          Your API key and data stay on your machine. Nothing is sent to us.
        </p>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}