import { Moon, Sun } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../store'

export function ThemeToggle() {
  const { theme, setTheme } = useStore()

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="flex items-center justify-center w-9 h-9 rounded-xl transition-all"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {theme === 'dark' ? (
          <Moon className="w-4 h-4" style={{ color: '#A78BFA' }} />
        ) : (
          <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />
        )}
      </motion.div>
    </button>
  )
}