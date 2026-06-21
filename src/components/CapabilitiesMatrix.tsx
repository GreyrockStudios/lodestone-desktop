import { useState } from 'react'
import { Grid3x3, Check } from 'lucide-react'

interface Capability {
  area: string
  level: number // 0-3 (Basic, Intermediate, Advanced, Expert)
  description: string
  skills: string[]
}

const CAPABILITIES: Capability[] = [
  {
    area: 'Knowledge',
    level: 3,
    description: 'Maintains a curated, cross-linked wiki with automated linting, graph generation, and structured ingestion from raw sources.',
    skills: ['Wiki with frontmatter schema', 'Cross-link validation', 'Automated linting', 'Graph generation'],
  },
  {
    area: 'Memory',
    level: 3,
    description: 'Long-term memory store with recall, importance scoring, categories, and GDPR-compliant forgetting.',
    skills: ['Memory store with recall', 'Importance scoring', 'Category tagging', 'GDPR-compliant deletion'],
  },
  {
    area: 'Tools',
    level: 2,
    description: 'Executes shell commands, manages files, browses the web, and uses LSP for code intelligence.',
    skills: ['Shell execution', 'File read/write', 'Web search & fetch', 'LSP code intelligence'],
  },
  {
    area: 'Safety',
    level: 3,
    description: 'Red lines, near-miss tracking, learned constraints, auto-capture, and confirmation gates for destructive actions.',
    skills: ['Red line enforcement', 'Near-miss tracking', 'Learned constraints', 'Confirmation gates'],
  },
  {
    area: 'Learning',
    level: 2,
    description: 'Nightly reflection consolidation, contrastive learning from failures, and rule promotion from observations.',
    skills: ['Nightly consolidation', 'Contrastive learning', 'Rule promotion', 'Decision logging'],
  },
  {
    area: 'Scheduling',
    level: 1,
    description: 'Heartbeat-based task cycling and watchdog timers for deadline tracking. Cron-based scheduling in development.',
    skills: ['Heartbeat cycling', 'Watchdog timers', 'Cron scheduling (planned)'],
  },
]

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert']
const LEVEL_COLORS = ['#6B7280', '#06B6D4', '#8B5CF6', '#10B981']

export function CapabilitiesMatrix() {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <Grid3x3 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-medium">Agent Capabilities Matrix</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="px-3 py-2 text-xs font-medium text-left" style={{ color: 'var(--text-dim)' }}>
                Capability
              </th>
              {LEVELS.map((level, idx) => (
                <th
                  key={level}
                  className="px-3 py-2 text-xs font-medium text-center"
                  style={{ color: LEVEL_COLORS[idx] }}
                >
                  {level}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap, rowIdx) => (
              <tr key={cap.area} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {cap.area}
                  </span>
                </td>
                {LEVELS.map((_, colIdx) => {
                  const filled = colIdx <= cap.level
                  const isHovered = hovered?.row === rowIdx && hovered?.col === colIdx
                  return (
                    <td
                      key={colIdx}
                      className="px-3 py-3 text-center"
                      onMouseEnter={() => setHovered({ row: rowIdx, col: colIdx })}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        background: isHovered && filled ? `${LEVEL_COLORS[cap.level]}10` : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      {filled ? (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center mx-auto"
                          style={{
                            background: colIdx === cap.level
                              ? LEVEL_COLORS[cap.level]
                              : `${LEVEL_COLORS[cap.level]}30`,
                          }}
                        >
                          {colIdx === cap.level && (
                            <Check className="w-3 h-3" style={{ color: 'white' }} />
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full mx-auto"
                          style={{ border: `1.5px solid var(--border)` }}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hover detail */}
      <div className="p-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
        {hovered ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                {CAPABILITIES[hovered.row].area}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: `${LEVEL_COLORS[CAPABILITIES[hovered.row].level]}15`,
                  color: LEVEL_COLORS[CAPABILITIES[hovered.row].level],
                }}
              >
                {LEVELS[CAPABILITIES[hovered.row].level]}
              </span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              {CAPABILITIES[hovered.row].description}
            </p>
            <div className="flex flex-wrap gap-1">
              {CAPABILITIES[hovered.row].skills.map(skill => (
                <span
                  key={skill}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Hover over a capability row to see details. Filled dots show current proficiency level.
          </p>
        )}
      </div>
    </div>
  )
}