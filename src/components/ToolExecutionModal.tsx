import { useRef, useEffect } from 'react'
import { X, Wrench, Clock, ArrowRight } from 'lucide-react'

export interface ToolExecution {
  name: string
  input: Record<string, unknown>
  output: string | null
  executionTime: number // in ms
  status: 'success' | 'error' | 'pending'
}

// Mock tool execution data for display
const MOCK_TOOL_DATA: Record<string, ToolExecution> = {
  'memory.search': {
    name: 'memory.search',
    input: {
      query: 'project status',
      limit: 5,
      threshold: 0.7,
    },
    output: JSON.stringify(
      {
        results: [
          { id: 'mem-42', score: 0.89, content: 'Lodestone M1 complete with 15 commits...' },
          { id: 'mem-17', score: 0.72, content: 'Self-improvement milestone progress...' },
        ],
        total: 2,
      },
      null,
      2,
    ),
    executionTime: 142,
    status: 'success',
  },
  'wiki.read': {
    name: 'wiki.read',
    input: {
      page: 'project-status',
    },
    output: JSON.stringify(
      {
        title: 'Project Status',
        content: 'Lodestone desktop app development ongoing...',
        links: ['[[milestones]]', '[[architecture]]'],
      },
      null,
      2,
    ),
    executionTime: 38,
    status: 'success',
  },
  'web.fetch': {
    name: 'web.fetch',
    input: {
      url: 'https://example.com/api/data',
      method: 'GET',
    },
    output: 'Response: 200 OK\\n{ "status": "ok", "data": [...] }',
    executionTime: 2150,
    status: 'success',
  },
}

function getMockData(toolName: string): ToolExecution {
  if (MOCK_TOOL_DATA[toolName]) return MOCK_TOOL_DATA[toolName]
  return {
    name: toolName,
    input: { param1: 'value1', param2: 42 },
    output: '{\\n  "result": "success",\\n  "data": []\\n}',
    executionTime: Math.floor(Math.random() * 500) + 20,
    status: 'success',
  }
}

export function ToolExecutionModal({
  toolName,
  onClose,
}: {
  toolName: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const data = getMockData(toolName)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleEsc)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={ref}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          width: '90%',
          maxWidth: 560,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(139, 92, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Wrench style={{ width: 18, height: 18, color: '#A78BFA' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Tool Execution
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{data.name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status + Time */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background:
                  data.status === 'success'
                    ? 'rgba(16, 185, 129, 0.12)'
                    : data.status === 'error'
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    data.status === 'success'
                      ? '#10B981'
                      : data.status === 'error'
                      ? '#EF4444'
                      : '#F59E0B',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color:
                    data.status === 'success'
                      ? '#10B981'
                      : data.status === 'error'
                      ? '#EF4444'
                      : '#F59E0B',
                  textTransform: 'capitalize',
                }}
              >
                {data.status}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'var(--bg-elevated)',
              }}
            >
              <Clock style={{ width: 14, height: 14, color: 'var(--text-dim)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {data.executionTime}ms
              </span>
            </div>
          </div>

          {/* Input */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-dim)',
                marginBottom: 6,
              }}
            >
              Input Parameters
            </div>
            <pre
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                color: 'var(--text)',
                overflow: 'auto',
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {JSON.stringify(data.input, null, 2)}
            </pre>
          </div>

          {/* Arrow */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ArrowRight
              style={{ width: 20, height: 20, color: 'var(--text-dim)', transform: 'rotate(90deg)' }}
            />
          </div>

          {/* Output */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-dim)',
                marginBottom: 6,
              }}
            >
              Output Result
            </div>
            <pre
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                color: 'var(--text)',
                overflow: 'auto',
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {data.output || 'No output returned'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}