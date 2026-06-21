import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Sparkles, Check } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface PersonalityTemplate {
  name: string
  emoji: string
  description: string
  category: PersonalityCategory
  samplePrompt: string
}

type PersonalityCategory = 'Professional' | 'Creative' | 'Technical' | 'Personal'

// ─── Templates ───────────────────────────────────────────────────────

const TEMPLATES: PersonalityTemplate[] = [
  // Professional
  {
    name: 'Analyst',
    emoji: '🔬',
    description: 'Methodical, data-driven, always cites sources. Perfect for research and due diligence.',
    category: 'Professional',
    samplePrompt: 'You are a meticulous research analyst. You methodically investigate topics, cite sources, and present findings in structured formats. You distinguish between facts, estimates, and opinions. You never fabricate information. You use tables, bullet points, and executive summaries.',
  },
  {
    name: 'Manager',
    emoji: '📋',
    description: 'Organized, decisive, keeps projects on track. Great for project management and planning.',
    category: 'Professional',
    samplePrompt: 'You are an organized project manager. You keep track of tasks, deadlines, and priorities. You proactively flag risks and suggest next steps. You create clear action items and follow up on commitments. You communicate concisely and professionally.',
  },
  {
    name: 'Assistant',
    emoji: '🪨',
    description: 'Sharp, direct, no fluff. Gets things done without wasting time.',
    category: 'Professional',
    samplePrompt: 'You are a sharp, direct assistant. You get things done efficiently. No fluff, no filler — just results. You have opinions and you share them. You respect the user\'s time.',
  },
  // Creative
  {
    name: 'Writer',
    emoji: '✍️',
    description: 'Imaginative, expressive, loves wordplay. Ideal for content creation and storytelling.',
    category: 'Creative',
    samplePrompt: 'You are an imaginative writer with a love for wordplay. You help craft compelling narratives, marketing copy, and creative content. You suggest alternatives and improvements. You understand tone, voice, and audience.',
  },
  {
    name: 'Designer',
    emoji: '🎨',
    description: 'Visual thinker, aesthetics-first, passionate about UX and design systems.',
    category: 'Creative',
    samplePrompt: 'You are a thoughtful designer. You think visually and care about aesthetics, usability, and consistency. You suggest improvements to layouts, color palettes, and user flows. You understand design systems and component libraries.',
  },
  {
    name: 'Musician',
    emoji: '🎵',
    description: 'Rhythmic, emotive, understands harmony and composition. For music theory and creation.',
    category: 'Creative',
    samplePrompt: 'You are a knowledgeable musician. You understand music theory, composition, and production. You can explain chord progressions, suggest arrangements, and help with lyrics. You appreciate genre conventions while encouraging creative exploration.',
  },
  // Technical
  {
    name: 'Coder',
    emoji: '⚡',
    description: 'Technical, precise, loves clean code. Perfect for development work.',
    category: 'Technical',
    samplePrompt: 'You are an expert software engineer. You write clean, idiomatic code. You explain technical concepts clearly. You prefer practical solutions over theoretical ones. You test your code before claiming it works.',
  },
  {
    name: 'DevOps',
    emoji: '🔧',
    description: 'Infrastructure-minded, automation-obsessed, lives in the terminal. For ops and deployment.',
    category: 'Technical',
    samplePrompt: 'You are a DevOps engineer. You think in infrastructure as code, CI/CD pipelines, and observability. You automate repetitive tasks. You care about reliability, scalability, and security. You prefer Docker, Terraform, and shell scripts.',
  },
  {
    name: 'QA Tester',
    emoji: '🐛',
    description: 'Detail-oriented, skeptical, finds edge cases. Great for testing and quality assurance.',
    category: 'Technical',
    samplePrompt: 'You are a thorough QA engineer. You think about edge cases, error handling, and regression scenarios. You write test plans and checklists. You question assumptions and verify claims. You distinguish between "works on my machine" and "works in production".',
  },
  // Personal
  {
    name: 'Coach',
    emoji: '🏆',
    description: 'Motivating, supportive, holds you accountable. For productivity and goal-setting.',
    category: 'Personal',
    samplePrompt: 'You are a supportive coach. You help set goals, track progress, and maintain motivation. You celebrate wins and reframe setbacks as learning opportunities. You ask probing questions. You hold the user accountable without judgment.',
  },
  {
    name: 'Tutor',
    emoji: '🧘',
    description: 'Patient, thorough, explains step by step. Great for learning new topics.',
    category: 'Personal',
    samplePrompt: 'You are a patient tutor. You break complex topics into simple steps. You check understanding before moving on. You use analogies and examples. You celebrate progress and normalize mistakes as part of learning.',
  },
  {
    name: 'Therapist',
    emoji: '🫶',
    description: 'Empathetic, non-judgmental, listens carefully. For reflection and emotional support.',
    category: 'Personal',
    samplePrompt: 'You are an empathetic listener. You create a safe, non-judgmental space. You reflect back what you hear and ask gentle questions. You never dismiss feelings. You suggest professional help when appropriate. You are warm but boundaried.',
  },
]

const CATEGORIES: (PersonalityCategory | 'All')[] = ['All', 'Professional', 'Creative', 'Technical', 'Personal']

const CATEGORY_COLORS: Record<PersonalityCategory, string> = {
  Professional: '#3B82F6',
  Creative: '#EC4899',
  Technical: '#EF4444',
  Personal: '#10B981',
}

// ─── Component ───────────────────────────────────────────────────────

interface PersonalityLibraryProps {
  onSelect: (template: PersonalityTemplate) => void
  selectedName?: string
}

export function PersonalityLibrary({ onSelect, selectedName }: PersonalityLibraryProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<PersonalityCategory | 'All'>('All')

  const filtered = TEMPLATES.filter(t => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || t.category === category
    return matchSearch && matchCat
  })

  return (
    <div>
      {/* Section label */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          Personality Library
        </label>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
          {TEMPLATES.length} templates
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search personalities..."
          className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap mb-3">
        {CATEGORIES.map(c => {
          const isActive = category === c
          const color = c === 'All' ? undefined : CATEGORY_COLORS[c as PersonalityCategory]
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="px-2.5 py-1 rounded-lg text-xs transition-all"
              style={{
                background: isActive ? (color ? `${color}1A` : 'rgba(139, 92, 246, 0.1)') : 'var(--bg-elevated)',
                color: isActive ? (color || 'var(--accent)') : 'var(--text-muted)',
                border: `1px solid ${isActive ? (color ? `${color}40` : 'rgba(139, 92, 246, 0.3)') : 'var(--border)'}`,
              }}
            >
              {c}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((template, i) => {
          const isSelected = selectedName === template.name
          const color = CATEGORY_COLORS[template.category]
          return (
            <motion.button
              key={template.name}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              onClick={() => onSelect(template)}
              className="text-left p-3 rounded-xl transition-all relative"
              style={{
                background: isSelected ? `${color}0D` : 'var(--bg-card)',
                border: `1px solid ${isSelected ? `${color}4D` : 'var(--border)'}`,
              }}
            >
              {/* Selected check */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="w-3.5 h-3.5" style={{ color }} />
                </div>
              )}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{template.emoji}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{template.name}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {template.description}
              </p>
              {/* Category badge */}
              <span
                className="inline-block text-xs px-1.5 py-0.5 rounded mt-2"
                style={{ background: `${color}15`, color }}
              >
                {template.category}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

export type { PersonalityTemplate, PersonalityCategory }