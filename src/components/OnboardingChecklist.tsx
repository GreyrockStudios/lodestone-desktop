import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, User, Key, Cpu, MessageSquare, X } from 'lucide-react'
import { useStore } from '../store'

interface ChecklistStep {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  done: boolean
  action?: () => void
}

export function OnboardingChecklist() {
  const { config, messages, setActiveView } = useStore()
  const [dismissed, setDismissed] = useState(false)

  // Check if onboarding was dismissed
  useEffect(() => {
    const stored = localStorage.getItem('lodestone-onboarding-dismissed')
    if (stored === 'true') {
      setDismissed(true)
    }
  }, [])

  // Determine step completion
  const hasName = !!(config?.agentName && config.agentName.trim().length > 0)
  const hasApiKey = !!(config?.apiKey && config.apiKey.trim().length > 0)
  const hasModel = !!(config?.model && config.model.trim().length > 0 && config.model !== 'unknown')
  const hasFirstMessage = messages.length > 0

  const steps: ChecklistStep[] = [
    {
      id: 'name',
      label: 'Name your agent',
      icon: User,
      done: hasName,
      action: () => setActiveView('identity'),
    },
    {
      id: 'apikey',
      label: 'Paste API key',
      icon: Key,
      done: hasApiKey,
      action: () => setActiveView('settings'),
    },
    {
      id: 'model',
      label: 'Pick model',
      icon: Cpu,
      done: hasModel,
      action: () => setActiveView('settings'),
    },
    {
      id: 'message',
      label: 'Send first message',
      icon: MessageSquare,
      done: hasFirstMessage,
      action: () => setActiveView('chat'),
    },
  ]

  const allDone = steps.every((s) => s.done)

  // Hide if all done or dismissed
  if (allDone || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('lodestone-onboarding-dismissed', 'true')
  }

  const completedCount = steps.filter((s) => s.done).length

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl p-4 relative"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle style={{ width: 14, height: 14, color: 'var(--accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Getting Started</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {completedCount} of {steps.length} steps complete
              </div>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
            title="Dismiss checklist"
          >
            <X style={{ width: 14, height: 14, color: 'var(--text-dim)' }} />
          </button>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 4,
            background: 'var(--bg-elevated)',
            borderRadius: 2,
            marginBottom: 12,
            overflow: 'hidden',
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / steps.length) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)',
              borderRadius: 2,
            }}
          />
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.button
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                onClick={() => step.action?.()}
                className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
                style={{
                  background: step.done ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-elevated)',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!step.done) {
                    e.currentTarget.style.background = 'var(--bg-card)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!step.done) {
                    e.currentTarget.style.background = 'var(--bg-elevated)'
                  }
                }}
              >
                {step.done ? (
                  <CheckCircle style={{ width: 18, height: 18, color: '#10B981', flexShrink: 0 }} />
                ) : (
                  <Circle style={{ width: 18, height: 18, color: 'var(--text-dim)', flexShrink: 0 }} />
                )}
                <Icon
                  className="w-3.5 h-3.5"
                  style={{ color: step.done ? '#10B981' : 'var(--text-muted)', flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: step.done ? 'var(--text-muted)' : 'var(--text)',
                    textDecoration: step.done ? 'line-through' : 'none',
                    flex: 1,
                  }}
                >
                  {step.label}
                </span>
                {!step.done && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>→</span>
                )}
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}