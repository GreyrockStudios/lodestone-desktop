import { useState, useMemo } from 'react'
import { GitCompare, Columns2, AlignLeft } from 'lucide-react'

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  oldLineNum?: number
  newLineNum?: number
}

function computeDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const result: DiffLine[] = []
  const maxLen = Math.max(beforeLines.length, afterLines.length)

  // Simple LCS-based diff
  const m = beforeLines.length
  const n = afterLines.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build diff
  const lines: DiffLine[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (beforeLines[i - 1] === afterLines[j - 1]) {
      lines.unshift({ type: 'unchanged', content: beforeLines[i - 1], oldLineNum: i, newLineNum: j })
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      lines.unshift({ type: 'removed', content: beforeLines[i - 1], oldLineNum: i })
      i--
    } else {
      lines.unshift({ type: 'added', content: afterLines[j - 1], newLineNum: j })
      j--
    }
  }
  while (i > 0) {
    lines.unshift({ type: 'removed', content: beforeLines[i - 1], oldLineNum: i })
    i--
  }
  while (j > 0) {
    lines.unshift({ type: 'added', content: afterLines[j - 1], newLineNum: j })
    j--
  }

  // Assign newLineNum to unchanged lines for display
  let newLineCounter = 0
  let oldLineCounter = 0
  for (const line of lines) {
    if (line.type === 'added' || line.type === 'unchanged') {
      newLineCounter++
      if (!line.newLineNum) line.newLineNum = newLineCounter
    }
    if (line.type === 'removed' || line.type === 'unchanged') {
      oldLineCounter++
      if (!line.oldLineNum) line.oldLineNum = oldLineCounter
    }
  }

  return lines
}

const MOCK_BEFORE = `# Knowledge Base Architecture

The knowledge base follows a three-layer pattern:

1. **Raw sources** — immutable, never modified
2. **Wiki** — curated, cross-linked knowledge
3. **Schema** — rules and conventions

## Key Principles

- Raw files are the source of truth
- Agents contribute through the inbox
- Flint maintains the shared wiki

## Workflows

Ingest → Read → Wiki → Index → Log`

const MOCK_AFTER = `# Knowledge Base Architecture

The knowledge base follows a three-layer pattern:

1. **Raw sources** — immutable, never modified after creation
2. **Wiki** — curated, cross-linked, regularly updated
3. **Schema** — rules, conventions, and enforcement

## Core Principles

- Raw files are the immutable source of truth
- Agents contribute through the inbox or raw drops
- Flint maintains the shared wiki and index
- Decisions are recorded with full context

## Workflows

Ingest → Read → Wiki → Index → Log → Lint`

export function DiffViewer({ before = MOCK_BEFORE, after = MOCK_AFTER }: { before?: string; after?: string }) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')

  const diff = useMemo(() => computeDiff(before, after), [before, after])

  const addedCount = diff.filter(l => l.type === 'added').length
  const removedCount = diff.filter(l => l.type === 'removed').length

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium">Diff Viewer</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            +{addedCount}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
            -{removedCount}
          </span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
          <button
            onClick={() => setViewMode('split')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all"
            style={{
              background: viewMode === 'split' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: viewMode === 'split' ? 'var(--accent)' : 'var(--text-dim)',
            }}
          >
            <Columns2 className="w-3 h-3" />
            Split
          </button>
          <button
            onClick={() => setViewMode('unified')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all"
            style={{
              background: viewMode === 'unified' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: viewMode === 'unified' ? 'var(--accent)' : 'var(--text-dim)',
            }}
          >
            <AlignLeft className="w-3 h-3" />
            Unified
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="overflow-x-auto text-sm" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        {viewMode === 'split' ? (
          <SplitView diff={diff} />
        ) : (
          <UnifiedView diff={diff} />
        )}
      </div>
    </div>
  )
}

function SplitView({ diff }: { diff: DiffLine[] }) {
  const leftLines = diff.filter(l => l.type === 'removed' || l.type === 'unchanged')
  const rightLines = diff.filter(l => l.type === 'added' || l.type === 'unchanged')

  return (
    <div className="flex">
      {/* Before */}
      <div className="flex-1 border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="px-3 py-1.5 text-xs font-medium border-b" style={{ color: 'var(--text-dim)', background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          Before
        </div>
        {leftLines.map((line, idx) => (
          <DiffLineRow key={`l-${idx}`} line={line} side="left" />
        ))}
      </div>
      {/* After */}
      <div className="flex-1">
        <div className="px-3 py-1.5 text-xs font-medium border-b" style={{ color: 'var(--text-dim)', background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          After
        </div>
        {rightLines.map((line, idx) => (
          <DiffLineRow key={`r-${idx}`} line={line} side="right" />
        ))}
      </div>
    </div>
  )
}

function UnifiedView({ diff }: { diff: DiffLine[] }) {
  return (
    <div>
      {diff.map((line, idx) => (
        <DiffLineRow key={idx} line={line} side="unified" />
      ))}
    </div>
  )
}

function DiffLineRow({ line, side }: { line: DiffLine; side: 'left' | 'right' | 'unified' }) {
  if (side === 'unified') {
    const bg = line.type === 'added' ? 'rgba(16, 185, 129, 0.08)' : line.type === 'removed' ? 'rgba(239, 68, 68, 0.08)' : 'transparent'
    const color = line.type === 'added' ? '#10B981' : line.type === 'removed' ? '#EF4444' : 'var(--text-muted)'
    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '

    return (
      <div className="flex" style={{ background: bg }}>
        <span className="select-none w-8 text-right pr-2 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
          {line.oldLineNum ?? ''}
        </span>
        <span className="select-none w-8 text-right pr-2 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
          {line.newLineNum ?? ''}
        </span>
        <span className="select-none w-6 text-center flex-shrink-0" style={{ color }}>
          {prefix}
        </span>
        <span className="flex-1 px-2 whitespace-pre" style={{ color }}>
          {line.content || ' '}
        </span>
      </div>
    )
  }

  // Split view
  const isRemoved = line.type === 'removed'
  const isAdded = line.type === 'added'
  const bg = isRemoved ? 'rgba(239, 68, 68, 0.08)' : isAdded ? 'rgba(16, 185, 129, 0.08)' : 'transparent'
  const color = isRemoved ? '#EF4444' : isAdded ? '#10B981' : 'var(--text-muted)'
  const lineNum = side === 'left' ? line.oldLineNum : line.newLineNum
  const prefix = isRemoved ? '-' : isAdded ? '+' : ' '

  return (
    <div className="flex" style={{ background: bg, minHeight: '20px' }}>
      <span className="select-none w-10 text-right pr-2 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
        {lineNum ?? ''}
      </span>
      <span className="select-none w-6 text-center flex-shrink-0" style={{ color }}>
        {prefix}
      </span>
      <span className="flex-1 px-2 whitespace-pre" style={{ color }}>
        {line.content || ' '}
      </span>
    </div>
  )
}