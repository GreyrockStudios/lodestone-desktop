import { useState, useMemo } from 'react'
import { Store, Search, Star, Download, Eye, Code, Puzzle, Sparkles, Shield, Zap, Globe, Database, Cloud, Wrench, Filter } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Plugin {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'tools' | 'integrations' | 'themes' | 'agents' | 'data'
  rating: number
  downloads: number
  installed: boolean
  featured?: boolean
  icon: any
  tags: string[]
}

const PLUGINS: Plugin[] = [
  { id: '1', name: 'Web Scraper Pro', description: 'Scrape any website with CSS selectors. Extract data to JSON, CSV, or wiki pages.', author: 'Greyrock', version: '1.2.0', category: 'tools', rating: 4.8, downloads: 12450, installed: true, featured: true, icon: Globe, tags: ['web', 'scraping', 'data'] },
  { id: '2', name: 'Slack Integration', description: 'Send and receive messages from Slack channels. Mention-based agent activation.', author: 'community', version: '0.9.1', category: 'integrations', rating: 4.5, downloads: 8200, installed: false, icon: Cloud, tags: ['slack', 'messaging'] },
  { id: '3', name: 'Dark Aurora Theme', description: 'Beautiful dark theme with aurora gradient accents. Animated background particles.', author: 'themesbykai', version: '2.0.0', category: 'themes', rating: 4.9, downloads: 23100, installed: false, featured: true, icon: Sparkles, tags: ['dark', 'gradient', 'animated'] },
  { id: '4', name: 'Database Explorer', description: 'Visual browser for SQLite, PostgreSQL, MySQL. Query builder, schema viewer, data export.', author: 'Greyrock', version: '1.5.0', category: 'data', rating: 4.7, downloads: 9800, installed: true, icon: Database, tags: ['sql', 'query', 'browser'] },
  { id: '5', name: 'Code Analyzer', description: 'Static analysis for Python, TypeScript, Go. Find bugs, security issues, code smells.', author: 'security-ai', version: '0.8.2', category: 'tools', rating: 4.3, downloads: 5600, installed: false, icon: Code, tags: ['linting', 'security', 'analysis'] },
  { id: '6', name: 'Email Assistant', description: 'Draft, send, and manage emails. AI-powered subject line optimization and reply suggestions.', author: 'community', version: '1.0.0', category: 'integrations', rating: 4.2, downloads: 3400, installed: false, icon: Cloud, tags: ['email', 'automation'] },
  { id: '7', name: 'Safety Guard Pro', description: 'Enhanced safety constraints with custom rule builder. Pre-action approval workflows.', author: 'Greyrock', version: '1.1.0', category: 'tools', rating: 4.6, downloads: 7200, installed: false, icon: Shield, tags: ['safety', 'security', 'approval'] },
  { id: '8', name: 'Performance Tuner', description: 'Auto-tune model parameters based on usage patterns. Optimize token usage and latency.', author: 'Greyrock', version: '0.5.0', category: 'tools', rating: 4.4, downloads: 4100, installed: false, icon: Zap, tags: ['performance', 'optimization'] },
  { id: '9', name: 'Research Agent', description: 'Autonomous research agent. Given a topic, searches web, reads papers, synthesizes findings.', author: 'academic-ai', version: '2.1.0', category: 'agents', rating: 4.9, downloads: 15600, installed: false, featured: true, icon: Puzzle, tags: ['research', 'autonomous', 'web'] },
  { id: '10', name: 'API Tester', description: 'Postman-like API testing within Lodestone. Collections, environments, assertions.', author: 'community', version: '1.3.0', category: 'tools', rating: 4.5, downloads: 6700, installed: false, icon: Wrench, tags: ['api', 'testing', 'http'] },
  { id: '11', name: 'Sunset Theme', description: 'Warm sunset gradient theme. Perfect for evening coding sessions.', author: 'themesbykai', version: '1.0.0', category: 'themes', rating: 4.7, downloads: 8900, installed: false, icon: Sparkles, tags: ['warm', 'gradient'] },
  { id: '12', name: 'Vector Search Plus', description: 'Enhanced semantic search with hybrid keyword+vector ranking. 3x faster recall.', author: 'Greyrock', version: '1.0.0', category: 'data', rating: 4.8, downloads: 11200, installed: true, icon: Database, tags: ['vector', 'search', 'memory'] },
]

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Store },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'integrations', label: 'Integrations', icon: Cloud },
  { id: 'themes', label: 'Themes', icon: Sparkles },
  { id: 'agents', label: 'Agents', icon: Puzzle },
  { id: 'data', label: 'Data', icon: Database },
]

export function Marketplace() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState<Plugin | null>(null)
  const [sortBy, setSortBy] = useState<'rating' | 'downloads' | 'name'>('rating')

  const filtered = useMemo(() => {
    let result = PLUGINS.filter(p => category === 'all' || p.category === category)
    if (search) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some(t => t.includes(search.toLowerCase()))
      )
    }
    return result.sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating
      if (sortBy === 'downloads') return b.downloads - a.downloads
      return a.name.localeCompare(b.name)
    })
  }, [search, category, sortBy])

  const featured = PLUGINS.filter(p => p.featured)
  const installed = PLUGINS.filter(p => p.installed)

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Marketplace</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent)' }}>
              {PLUGINS.length} plugins
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="px-2 py-1 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <option value="rating">Top Rated</option>
              <option value="downloads">Most Downloads</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Featured */}
        {!search && category === 'all' && (
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Featured</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {featured.map(plugin => {
                const Icon = plugin.icon
                return (
                  <div key={plugin.id} onClick={() => setSelected(plugin)}
                    className="flex-shrink-0 w-64 p-3 rounded-xl cursor-pointer transition-all"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{plugin.name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>by {plugin.author}</div>
                      </div>
                    </div>
                    <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--text-dim)' }}>{plugin.description}</p>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                      <span className="flex items-center gap-0.5"><Star className="w-3 h-3" style={{ color: '#F59E0B', fill: '#F59E0B' }} />{plugin.rating}</span>
                      <span className="flex items-center gap-0.5"><Download className="w-3 h-3" />{(plugin.downloads / 1000).toFixed(1)}k</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plugins..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          </div>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            return (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                style={{
                  background: category === cat.id ? 'rgba(139,92,246,0.15)' : 'var(--bg-card)',
                  color: category === cat.id ? 'var(--accent)' : 'var(--text-dim)',
                  border: '1px solid',
                  borderColor: category === cat.id ? 'var(--accent)' : 'var(--border)',
                }}>
                <Icon className="w-3 h-3" /> {cat.label}
              </button>
            )
          })}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4" style={{ background: 'var(--bg-card)' }}>
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(plugin => {
              const Icon = plugin.icon
              return (
                <motion.div key={plugin.id}
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelected(plugin)}
                  className="p-3 rounded-xl cursor-pointer transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.1)' }}>
                      <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{plugin.name}</span>
                        {plugin.installed && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>✓</span>}
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-dim)' }}>{plugin.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                        <span className="flex items-center gap-0.5"><Star className="w-3 h-3" style={{ color: '#F59E0B', fill: '#F59E0B' }} />{plugin.rating}</span>
                        <span className="flex items-center gap-0.5"><Download className="w-3 h-3" />{(plugin.downloads / 1000).toFixed(1)}k</span>
                        <span>v{plugin.version}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--text-dim)' }}>
              <Store className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No plugins found</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
            className="w-80 flex flex-col border-l" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Plugin Details</span>
              <button onClick={() => setSelected(null)} className="text-xs" style={{ color: 'var(--text-dim)' }}>✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(139,92,246,0.1)' }}>
                <selected.icon className="w-8 h-8" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="text-lg font-semibold text-center" style={{ color: 'var(--text)' }}>{selected.name}</h3>
              <p className="text-xs text-center mb-1" style={{ color: 'var(--text-dim)' }}>by {selected.author} · v{selected.version}</p>
              <div className="flex items-center justify-center gap-4 mb-4 text-xs" style={{ color: 'var(--text-dim)' }}>
                <span className="flex items-center gap-0.5"><Star className="w-3 h-3" style={{ color: '#F59E0B', fill: '#F59E0B' }} />{selected.rating}</span>
                <span className="flex items-center gap-0.5"><Download className="w-3 h-3" />{selected.downloads.toLocaleString()}</span>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text)' }}>{selected.description}</p>
              <div className="flex flex-wrap gap-1 mb-4">
                {selected.tags.map(tag => (
                  <span key={tag} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>#{tag}</span>
                ))}
              </div>
              <div className="space-y-2 mb-4 text-xs" style={{ color: 'var(--text-dim)' }}>
                <div className="flex justify-between"><span>Category</span><span style={{ color: 'var(--text)' }}>{selected.category}</span></div>
                <div className="flex justify-between"><span>Version</span><span style={{ color: 'var(--text)' }}>{selected.version}</span></div>
                <div className="flex justify-between"><span>License</span><span style={{ color: 'var(--text)' }}>MIT</span></div>
              </div>
              <button className="w-full py-2 rounded-lg text-sm font-medium"
                style={{ background: selected.installed ? 'var(--bg-elevated)' : 'var(--accent)', color: selected.installed ? 'var(--text-dim)' : 'white' }}>
                {selected.installed ? 'Installed ✓' : 'Install'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}