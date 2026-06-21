import { useState, useCallback, useEffect } from 'react'
import { Zap, Terminal, Folder, Globe, Code, FileText, Download, Settings, Play, Copy, Coffee } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface QuickAction {
  id: string
  label: string
  icon: any
  color: string
  action: () => void
  category: 'system' | 'files' | 'dev' | 'agent'
}

export function QuickActions({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [open, setOpen] = useState(false)

  const actions: QuickAction[] = [
    { id: 'terminal', label: 'Open Terminal', icon: Terminal, color: '#10B981', category: 'system',
      action: () => window.lodestone.openTerminal() },
    { id: 'finder', label: 'Open in Finder', icon: Folder, color: '#F59E0B', category: 'system',
      action: () => window.lodestone.openInFinder() },
    { id: 'sysinfo', label: 'System Info', icon: Settings, color: '#8B5CF6', category: 'system',
      action: () => onNavigate('host') },
    { id: 'newfile', label: 'New File', icon: FileText, color: '#3B82F6', category: 'files',
      action: () => onNavigate('host') },
    { id: 'newchat', label: 'New Chat', icon: Play, color: '#10B981', category: 'agent',
      action: () => onNavigate('chat') },
    { id: 'brain', label: 'View Brain Graph', icon: Globe, color: '#8B5CF6', category: 'agent',
      action: () => onNavigate('brain') },
    { id: 'tools', label: 'Browse Tools', icon: Code, color: '#EC4899', category: 'agent',
      action: () => onNavigate('tools') },
    { id: 'downloads', label: 'Downloads', icon: Download, color: '#3B82F6', category: 'system',
      action: () => onNavigate('host') },
  ]

  return (
    <>
      {/* FAB button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(!open)}
        className="fixed rounded-full p-3 shadow-lg"
        style={{
          bottom: 44,
          right: 12,
          zIndex: 9001,
          background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
          color: 'white',
          boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
        }}
        title="Quick Actions"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: 0 }} animate={{ rotate: 90 }} exit={{ rotate: 0 }}>
              <Zap className="w-5 h-5" />
            </motion.div>
          ) : (
            <motion.div key="zap" initial={{ rotate: -90 }} animate={{ rotate: 0 }} exit={{ rotate: 0 }}>
              <Zap className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Action menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="fixed rounded-xl overflow-hidden"
            style={{
              bottom: 80,
              right: 12,
              zIndex: 9000,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              width: 220,
            }}
          >
            <div className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              Quick Actions
            </div>
            {actions.map(action => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  onClick={() => { action.action(); setOpen(false) }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-left transition-all hover:bg-opacity-50"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: action.color }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{action.label}</span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}