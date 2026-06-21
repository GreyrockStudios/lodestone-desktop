import { useState, useCallback } from 'react'
import { MessageSquare, Star, Send, X, ThumbsUp, ThumbsDown, Bug, Lightbulb, Heart } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type FeedbackType = 'suggestion' | 'bug' | 'praise' | 'question'
type Mood = 'love' | 'happy' | 'neutral' | 'frustrated'

interface FeedbackEntry {
  id: string
  type: FeedbackType
  mood: Mood
  message: string
  email?: string
  timestamp: number
}

const TYPE_CONFIG: Record<FeedbackType, { icon: any; color: string; label: string }> = {
  suggestion: { icon: Lightbulb, color: '#F59E0B', label: 'Suggestion' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug Report' },
  praise: { icon: Heart, color: '#EC4899', label: 'Praise' },
  question: { icon: MessageSquare, color: '#3B82F6', label: 'Question' },
}

const MOOD_CONFIG: Record<Mood, { emoji: string; color: string; label: string }> = {
  love: { emoji: '🥰', color: '#EC4899', label: 'Love it' },
  happy: { emoji: '😊', color: '#10B981', label: 'Happy' },
  neutral: { emoji: '😐', color: '#9CA3AF', label: 'Neutral' },
  frustrated: { emoji: '😣', color: '#EF4444', label: 'Frustrated' },
}

export function FeedbackWidget({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>('suggestion')
  const [mood, setMood] = useState<Mood>('happy')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [history, setHistory] = useState<FeedbackEntry[]>(() => {
    try {
      const stored = localStorage.getItem('lodestone-feedback')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const submit = useCallback(() => {
    if (!message.trim()) return
    const entry: FeedbackEntry = {
      id: crypto.randomUUID(),
      type, mood, message: message.trim(),
      email: email.trim() || undefined,
      timestamp: Date.now(),
    }
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 50)
      localStorage.setItem('lodestone-feedback', JSON.stringify(next))
      return next
    })
    setSubmitted(true)
    setMessage('')
    setTimeout(() => setSubmitted(false), 3000)
  }, [type, mood, message, email])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Send Feedback</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-dim)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {submitted ? (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="text-center py-8">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
                <ThumbsUp className="w-8 h-8" style={{ color: '#10B981' }} />
              </div>
              <h4 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Thank you!</h4>
              <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Your feedback helps make Lodestone better.</p>
            </motion.div>
          ) : (
            <>
              {/* Type selector */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-dim)' }}>Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map(t => {
                    const config = TYPE_CONFIG[t]
                    const Icon = config.icon
                    return (
                      <button key={t} onClick={() => setType(t)}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-all"
                        style={{
                          background: type === t ? `${config.color}15` : 'var(--bg-elevated)',
                          color: type === t ? config.color : 'var(--text-dim)',
                          border: '1px solid',
                          borderColor: type === t ? config.color : 'var(--border)',
                        }}>
                        <Icon className="w-4 h-4" />
                        {config.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Mood */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-dim)' }}>How do you feel?</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(MOOD_CONFIG) as Mood[]).map(m => {
                    const config = MOOD_CONFIG[m]
                    return (
                      <button key={m} onClick={() => setMood(m)}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-all"
                        style={{
                          background: mood === m ? `${config.color}15` : 'var(--bg-elevated)',
                          border: '1px solid',
                          borderColor: mood === m ? config.color : 'var(--border)',
                        }}>
                        <span className="text-xl">{config.emoji}</span>
                        <span style={{ color: mood === m ? config.color : 'var(--text-dim)' }}>{config.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-dim)' }}>Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us what's on your mind..."
                  className="w-full h-28 p-3 rounded-lg text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>

              {/* Email (optional) */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-dim)' }}>Email (optional, for follow-up)</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>

              {/* Submit */}
              <button onClick={submit} disabled={!message.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: message.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: message.trim() ? 'white' : 'var(--text-dim)',
                }}>
                <span className="flex items-center justify-center gap-2">
                  <Send className="w-3.5 h-3.5" /> Send Feedback
                </span>
              </button>

              {/* History */}
              {history.length > 0 && (
                <div>
                  <label className="text-xs mb-2 block" style={{ color: 'var(--text-dim)' }}>Previous feedback ({history.length})</label>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {history.slice(0, 3).map(entry => {
                      const config = TYPE_CONFIG[entry.type]
                      const Icon = config.icon
                      return (
                        <div key={entry.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                          <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: config.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{entry.message}</p>
                            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{new Date(entry.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}