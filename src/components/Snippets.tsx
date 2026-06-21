import { useState, useCallback } from 'react'
import { Code, Plus, Trash2, Search, Copy, Check, Tag, Play, Edit3, Save, X, Folder } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Snippet {
  id: string
  title: string
  language: string
  content: string
  tags: string[]
  created: number
}

const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: '1', title: 'Start Lodestone Engine', language: 'bash',
    content: '#!/bin/bash\ncd ~/.lodestone\nlodestone start --port 3000 &\necho "Engine started on port 3000"',
    tags: ['lodestone', 'ops'], created: Date.now() - 86400000,
  },
  {
    id: '2', title: 'Docker Compose Up', language: 'bash',
    content: 'docker compose up -d\ndocker compose logs -f --tail=50',
    tags: ['docker', 'ops'], created: Date.now() - 172800000,
  },
  {
    id: '3', title: 'React useState Hook', language: 'typescript',
    content: 'const [state, setState] = useState<T>(initialValue)\n\n// Update with callback\nsetState(prev => ({ ...prev, key: value }))',
    tags: ['react', 'frontend'], created: Date.now() - 259200000,
  },
  {
    id: '4', title: 'Python FastAPI Route', language: 'python',
    content: '@app.get("/api/items/{id}")\nasync def get_item(id: int):\n    item = await db.get(id)\n    if not item:\n        raise HTTPException(404)\n    return item',
    tags: ['python', 'api'], created: Date.now() - 345600000,
  },
  {
    id: '5', title: 'SSH Tunnel', language: 'bash',
    content: 'ssh -L 8080:localhost:80 user@remote-host -N\n\n# Local port forwarding: access remote service locally',
    tags: ['ssh', 'networking'], created: Date.now() - 432000000,
  },
  {
    id: '6', title: 'Git Rebase Interactive', language: 'bash',
    content: 'git rebase -i HEAD~5\n# Squash recent commits\n# Pick the oldest, squash the rest\n# Edit commit message in editor',
    tags: ['git'], created: Date.now() - 518400000,
  },
]

const LANGUAGES = ['bash', 'typescript', 'python', 'javascript', 'json', 'yaml', 'sql', 'go', 'rust']
const LANG_COLORS: Record<string, string> = {
  bash: '#10B981', typescript: '#3178C6', python: '#3776AB', javascript: '#F7DF1E',
  json: '#9CA3AF', yaml: '#CB171E', sql: '#E38C00', go: '#00ADD8', rust: '#DEA584',
}

export function Snippets() {
  const [snippets, setSnippets] = useState<Snippet[]>(DEFAULT_SNIPPETS)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [selected, setSelected] = useState<Snippet | null>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editLang, setEditLang] = useState('bash')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState('')
  const [creating, setCreating] = useState(false)

  const allTags = Array.from(new Set(snippets.flatMap(s => s.tags))).sort()

  const filtered = snippets
    .filter(s => !filterTag || s.tags.includes(filterTag))
    .filter(s => !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.content.toLowerCase().includes(search.toLowerCase()) || s.tags.some(t => t.includes(search.toLowerCase())))
    .sort((a, b) => b.created - a.created)

  const copySnippet = useCallback((snippet: Snippet) => {
    navigator.clipboard.writeText(snippet.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [])

  const startEdit = (snippet: Snippet) => {
    setEditing(true)
    setCreating(false)
    setEditTitle(snippet.title)
    setEditLang(snippet.language)
    setEditContent(snippet.content)
    setEditTags(snippet.tags.join(', '))
    setSelected(snippet)
  }

  const startCreate = () => {
    setEditing(true)
    setCreating(true)
    setEditTitle('')
    setEditLang('bash')
    setEditContent('')
    setEditTags('')
    setSelected(null)
  }

  const saveEdit = () => {
    const tags = editTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    if (creating) {
      const newSnippet: Snippet = {
        id: crypto.randomUUID(),
        title: editTitle || 'Untitled',
        language: editLang,
        content: editContent,
        tags,
        created: Date.now(),
      }
      setSnippets(prev => [newSnippet, ...prev])
      setSelected(newSnippet)
    } else if (selected) {
      setSnippets(prev => prev.map(s => s.id === selected.id ? {
        ...s, title: editTitle, language: editLang, content: editContent, tags,
      } : s))
      setSelected({ ...selected, title: editTitle, language: editLang, content: editContent, tags })
    }
    setEditing(false)
    setCreating(false)
  }

  const deleteSnippet = (id: string) => {
    if (!confirm('Delete this snippet?')) return
    setSnippets(prev => prev.filter(s => s.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className="flex h-full">
      {/* Snippet list */}
      <div className="w-64 flex flex-col border-r" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Snippets</span>
          </div>
          <button onClick={startCreate} className="p-1 rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search snippets..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </div>
        </div>
        {/* Tags */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className="px-1.5 py-0.5 rounded text-xs transition-all"
                style={{
                  background: filterTag === tag ? 'rgba(139,92,246,0.2)' : 'var(--bg-elevated)',
                  color: filterTag === tag ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        {/* List */}
        <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-card)' }}>
          {filtered.map(snippet => (
            <div
              key={snippet.id}
              onClick={() => { setSelected(snippet); setEditing(false) }}
              className="px-3 py-2.5 cursor-pointer transition-all"
              style={{
                borderBottom: '1px solid var(--border)',
                background: selected?.id === snippet.id ? 'var(--bg-elevated)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
              onMouseLeave={e => { if (selected?.id !== snippet.id) e.currentTarget.style.background = 'transparent' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: `${LANG_COLORS[snippet.language] || '#9CA3AF'}15`, color: LANG_COLORS[snippet.language] || '#9CA3AF' }}>
                  {snippet.language}
                </span>
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{snippet.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {snippet.tags.map(tag => (
                  <span key={tag} className="text-xs" style={{ color: 'var(--text-dim)' }}>#{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        {!selected && !editing && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
            <div className="text-center">
              <Code className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a snippet or create a new one</p>
              <button onClick={startCreate} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs mx-auto" style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
                <Plus className="w-3.5 h-3.5" /> New Snippet
              </button>
            </div>
          </div>
        )}

        {editing ? (
          <>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Snippet title..."
                className="flex-1 bg-transparent text-sm font-medium outline-none mr-3"
                style={{ color: 'var(--text)' }}
              />
              <select value={editLang} onChange={e => setEditLang(e.target.value)}
                className="px-2 py-1 rounded-lg text-xs outline-none mr-2"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
              </select>
              <button onClick={saveEdit} className="p-1.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                <Save className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setEditing(false); setCreating(false) }} className="p-1.5 rounded-lg" style={{ color: 'var(--text-dim)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <input
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                placeholder="tags (comma separated)..."
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: 'var(--text-dim)' }}
              />
            </div>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="flex-1 p-4 font-mono text-sm bg-transparent outline-none resize-none"
              style={{ color: 'var(--text)' }}
              spellCheck={false}
              placeholder="Write your code here..."
            />
          </>
        ) : selected ? (
          <>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{selected.title}</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: `${LANG_COLORS[selected.language] || '#9CA3AF'}15`, color: LANG_COLORS[selected.language] || '#9CA3AF' }}>
                  {selected.language}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => copySnippet(selected)} className="p-1.5 rounded-lg" title="Copy">
                  {copied ? <Check className="w-3.5 h-3.5" style={{ color: '#10B981' }} /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />}
                </button>
                <button onClick={() => startEdit(selected)} className="p-1.5 rounded-lg" title="Edit">
                  <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
                </button>
                <button onClick={() => window.lodestone.openTerminal(selected.content)} className="p-1.5 rounded-lg" title="Run in terminal">
                  <Play className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                </button>
                <button onClick={() => deleteSnippet(selected.id)} className="p-1.5 rounded-lg" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1 px-4 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
              {selected.tags.map(tag => (
                <span key={tag} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                  #{tag}
                </span>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{selected.content}</pre>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}