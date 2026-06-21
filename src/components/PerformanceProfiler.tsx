import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Activity, Play, Square, Download, Clock, Cpu,
  MemoryStick, BarChart3, Flame, ChevronDown, ChevronUp,
  X, Zap, Timer,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

interface ToolCall {
  id: string
  name: string
  startTime: number
  endTime: number
  duration: number
  result: 'success' | 'error'
  summary: string
}

interface Recording {
  id: string
  startTime: number
  endTime: number
  toolCalls: ToolCall[]
  fpsSamples: number[]
  memorySamples: number[]
  latencySamples: number[]
}

interface ProfileData {
  fps: number
  jsHeapUsed: number
  jsHeapTotal: number
  jsHeapLimit: number
  toolBreakdown: { name: string; avgMs: number; count: number }[]
  latencyHistory: { time: number; latency: number }[]
}

// ─── Demo Data ─────────────────────────────────────────────────────────

const DEMO_TOOL_BREAKDOWN = [
  { name: 'web_search', avgMs: 2340, count: 12 },
  { name: 'file_read', avgMs: 45, count: 28 },
  { name: 'file_write', avgMs: 120, count: 8 },
  { name: 'exec_command', avgMs: 890, count: 15 },
  { name: 'memory_store', avgMs: 15, count: 22 },
  { name: 'web_fetch', avgMs: 1560, count: 6 },
  { name: 'lsp_hover', avgMs: 65, count: 18 },
]

const DEMO_LATENCY = Array.from({ length: 30 }, (_, i) => ({
  time: Date.now() - (30 - i) * 10000,
  latency: Math.floor(800 + Math.random() * 1200),
}))

// ─── PerformanceProfiler ───────────────────────────────────────────────

export function PerformanceProfiler({ onClose }: { onClose: () => void }) {
  const [fps, setFps] = useState(0)
  const [recording, setRecording] = useState(false)
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [profileData, setProfileData] = useState<ProfileData>({
    fps: 0,
    jsHeapUsed: 0,
    jsHeapTotal: 0,
    jsHeapLimit: 0,
    toolBreakdown: DEMO_TOOL_BREAKDOWN,
    latencyHistory: DEMO_LATENCY,
  })
  const [showFlameGraph, setShowFlameGraph] = useState(false)
  const [expandedCall, setExpandedCall] = useState<string | null>(null)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const rafRef = useRef<number>(0)
  const recordingStartRef = useRef<number>(0)

  // FPS Counter
  useEffect(() => {
    const countFrames = () => {
      frameCountRef.current++
      const now = performance.now()
      if (now - lastTimeRef.current >= 1000) {
        setFps(Math.round(frameCountRef.current * 1000 / (now - lastTimeRef.current)))
        frameCountRef.current = 0
        lastTimeRef.current = now
      }
      rafRef.current = requestAnimationFrame(countFrames)
    }
    rafRef.current = requestAnimationFrame(countFrames)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Memory polling
  useEffect(() => {
    const interval = setInterval(() => {
      // @ts-expect-error - performance.memory is Chrome-only
      const mem = performance.memory
      if (mem) {
        setProfileData(prev => ({
          ...prev,
          jsHeapUsed: mem.usedJSHeapSize,
          jsHeapTotal: mem.totalJSHeapSize,
          jsHeapLimit: mem.jsHeapSizeLimit,
        }))
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // Simulate tool calls during recording for demo
  useEffect(() => {
    if (!recording) return
    const names = ['web_search', 'file_read', 'file_write', 'exec_command', 'memory_store', 'lsp_hover']
    const interval = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)]
      const duration = Math.floor(50 + Math.random() * 2000)
      const now = Date.now()
      const call: ToolCall = {
        id: crypto.randomUUID(),
        name,
        startTime: now - duration,
        endTime: now,
        duration,
        result: Math.random() > 0.1 ? 'success' : 'error',
        summary: `Completed ${name} in ${duration}ms`,
      }
      setToolCalls(prev => [call, ...prev].slice(0, 100))
    }, 2000 + Math.random() * 3000)
    return () => clearInterval(interval)
  }, [recording])

  const handleStartRecording = useCallback(() => {
    setRecording(true)
    setToolCalls([])
    const now = Date.now()
    recordingStartRef.current = now
    setCurrentRecording({
      id: crypto.randomUUID(),
      startTime: now,
      endTime: 0,
      toolCalls: [],
      fpsSamples: [],
      memorySamples: [],
      latencySamples: [],
    })
  }, [])

  const handleStopRecording = useCallback(() => {
    setRecording(false)
    if (currentRecording) {
      const completed: Recording = {
        ...currentRecording,
        endTime: Date.now(),
        toolCalls: [...toolCalls],
      }
      setRecordings(prev => [completed, ...prev].slice(0, 10))
    }
  }, [currentRecording, toolCalls])

  const handleExport = useCallback(() => {
    const data = {
      fps,
      memory: {
        jsHeapUsed: profileData.jsHeapUsed,
        jsHeapTotal: profileData.jsHeapTotal,
        jsHeapLimit: profileData.jsHeapLimit,
      },
      toolBreakdown: profileData.toolBreakdown,
      latencyHistory: profileData.latencyHistory,
      toolCalls,
      recordings,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lodestone-profile-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [fps, profileData, toolCalls, recordings])

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const maxToolMs = Math.max(...profileData.toolBreakdown.map(t => t.avgMs), 1)

  return (
    <div className="fixed bottom-8 right-4 w-[420px] max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl z-[100]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="sticky top-0 p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', zIndex: 10 }}>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold">Profiler</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: recording ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: recording ? '#EF4444' : '#10B981' }}>
            {recording ? 'Recording' : 'Live'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleExport} className="p-1.5 rounded-lg" style={{ color: 'var(--text-dim)' }} title="Export profile">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-dim)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* FPS + Memory Row */}
        <div className="flex gap-2">
          <div className="flex-1 p-2.5 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3 h-3" style={{ color: '#10B981' }} />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>FPS</span>
            </div>
            <div className="text-xl font-bold" style={{ color: fps >= 50 ? '#10B981' : fps >= 30 ? '#F59E0B' : '#EF4444' }}>{fps}</div>
          </div>
          <div className="flex-1 p-2.5 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <MemoryStick className="w-3 h-3" style={{ color: '#06B6D4' }} />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Heap</span>
            </div>
            <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>
              {profileData.jsHeapUsed ? formatBytes(profileData.jsHeapUsed) : 'N/A'}
            </div>
            {profileData.jsHeapLimit > 0 && (
              <div className="w-full h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min((profileData.jsHeapUsed / profileData.jsHeapLimit) * 100, 100)}%`, background: profileData.jsHeapUsed / profileData.jsHeapLimit > 0.9 ? '#EF4444' : '#06B6D4' }} />
              </div>
            )}
          </div>
          <div className="flex-1 p-2.5 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="w-3 h-3" style={{ color: '#8B5CF6' }} />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Tools</span>
            </div>
            <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>
              {toolCalls.length}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>calls</div>
          </div>
        </div>

        {/* Recording Controls */}
        <div className="flex gap-2">
          {!recording ? (
            <button onClick={handleStartRecording} className="btn-primary flex items-center gap-2 text-xs px-3 py-1.5 flex-1">
              <Play className="w-3.5 h-3.5" /> Start Recording
            </button>
          ) : (
            <button onClick={handleStopRecording} className="flex items-center gap-2 text-xs px-3 py-1.5 flex-1 rounded-lg font-medium" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444', cursor: 'pointer' }}>
              <Square className="w-3.5 h-3.5" /> Stop Recording
            </button>
          )}
        </div>

        {/* Tool Execution Breakdown */}
        <div className="rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold">Tool Execution (avg ms)</span>
          </div>
          <div className="p-2 space-y-1.5">
            {profileData.toolBreakdown.map(tool => (
              <div key={tool.name} className="flex items-center gap-2">
                <span className="text-xs w-28 truncate" style={{ color: 'var(--text-muted)' }}>{tool.name}</span>
                <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded flex items-center px-1.5" style={{ width: `${(tool.avgMs / maxToolMs) * 100}%`, background: tool.avgMs > 1000 ? 'rgba(239, 68, 68, 0.3)' : tool.avgMs > 200 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)', minWidth: '2%' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{tool.avgMs}ms</span>
                  </div>
                </div>
                <span className="text-xs w-8 text-right" style={{ color: 'var(--text-dim)' }}>×{tool.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Response Latency Chart */}
        <div className="rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <Timer className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold">Response Latency</span>
          </div>
          <div className="p-2">
            <div className="flex items-end gap-px" style={{ height: 60 }}>
              {profileData.latencyHistory.slice(-30).map((point, i) => {
                const maxLatency = Math.max(...profileData.latencyHistory.map(p => p.latency), 1)
                const height = Math.max((point.latency / maxLatency) * 100, 2)
                return (
                  <div key={i} className="flex-1 rounded-t" style={{ height: `${height}%`, background: point.latency > 1500 ? 'rgba(239, 68, 68, 0.5)' : point.latency > 1000 ? 'rgba(245, 158, 11, 0.5)' : 'rgba(16, 185, 129, 0.5)', minHeight: 2 }} title={`${point.latency}ms`} />
                )
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>30s ago</span>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>now</span>
            </div>
          </div>
        </div>

        {/* Tool Call Log */}
        {toolCalls.length > 0 && (
          <div className="rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-3 py-2 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-semibold">Call Log</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>({toolCalls.length})</span>
              </div>
              <button onClick={() => setShowFlameGraph(!showFlameGraph)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                <Flame className="w-3 h-3" />
                {showFlameGraph ? 'List' : 'Flame'}
              </button>
            </div>
            {showFlameGraph ? (
              <div className="p-2 space-y-0.5">
                {toolCalls.slice(0, 20).map(call => {
                  const maxDur = Math.max(...toolCalls.slice(0, 20).map(c => c.duration), 1)
                  return (
                    <div key={call.id} className="flex items-center gap-1" style={{ height: 16 }}>
                      <span className="text-xs w-20 truncate" style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                        {new Date(call.startTime).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <div className="flex-1 relative h-3 rounded" style={{ background: 'var(--bg-card)' }}>
                        <div className="absolute h-full rounded" style={{
                          left: `${(call.startTime - toolCalls[0].startTime) / (toolCalls[0].duration + 5000) * 100}%`,
                          width: `${Math.max((call.duration / maxDur) * 80, 3)}%`,
                          background: call.result === 'success' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                        }} title={`${call.name}: ${call.duration}ms`} />
                      </div>
                      <span className="text-xs w-16 text-right truncate" style={{ color: 'var(--text-dim)', fontSize: 9 }}>{call.name}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                {toolCalls.slice(0, 20).map(call => (
                  <div key={call.id}>
                    <button className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: call.result === 'success' ? '#10B981' : '#EF4444' }} />
                      <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{call.name}</span>
                      <span style={{ color: call.duration > 1000 ? '#EF4444' : call.duration > 200 ? '#F59E0B' : '#10B981' }}>{call.duration}ms</span>
                      {expandedCall === call.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {expandedCall === call.id && (
                      <div className="px-3 py-2 text-xs" style={{ background: 'var(--bg-card)', color: 'var(--text-dim)' }}>
                        <div className="flex gap-4">
                          <span>Start: {new Date(call.startTime).toLocaleTimeString()}</span>
                          <span>End: {new Date(call.endTime).toLocaleTimeString()}</span>
                        </div>
                        <div className="mt-1">{call.summary}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Past Recordings */}
        {recordings.length > 0 && (
          <div className="rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs font-semibold">Past Recordings</span>
            </div>
            <div className="p-2 space-y-1">
              {recordings.map(rec => (
                <div key={rec.id} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div>
                    <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                      {new Date(rec.startTime).toLocaleString()}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      {rec.toolCalls.length} calls · {((rec.endTime - rec.startTime) / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent)' }}>{rec.toolCalls.length}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}