import { useState, useEffect, useRef, useCallback } from 'react'
import { Brain, Search, RefreshCw, Network, Clock, FileText, Lightbulb, GitBranch } from 'lucide-react'
import { useStore } from '../store'

interface BrainNode {
  id: string
  label: string
  type: 'wiki' | 'memory' | 'decision'
  x: number
  y: number
  vx: number
  vy: number
  connections: string[]
}

interface BrainStats {
  memoryCount: number
  wikiCount: number
  decisionCount: number
  toolCallCount: number
  recentActivity: ActivityEntry[]
}

interface ActivityEntry {
  type: string
  title: string
  timestamp: number
  category: string
}

export function BrainView() {
  const { engineRunning, config } = useStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<BrainNode[]>([])
  const animationRef = useRef<number>(0)
  const [stats, setStats] = useState<BrainStats | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'wiki' | 'memory' | 'decision'>('all')
  const [selectedNode, setSelectedNode] = useState<BrainNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch brain data from the engine
  const fetchBrainData = useCallback(async () => {
    if (!engineRunning) return
    setLoading(true)
    try {
      const result = await window.lodestone.scanBrain()
      const nodes: BrainNode[] = result.nodes.map((n: any) => ({
        ...n,
        x: 200 + Math.random() * 400,
        y: 100 + Math.random() * 400,
        vx: 0, vy: 0,
      }))
      nodesRef.current = nodes
      setStats({
        memoryCount: result.stats.memoryCount,
        wikiCount: result.stats.wikiCount,
        decisionCount: result.stats.decisionCount,
        toolCallCount: result.stats.toolCallCount || 0,
        recentActivity: [],
      })
    } catch (err) {
      console.error('Brain scan failed:', err)
      // Fallback to mock data
      const mockNodes = generateMockGraph()
      nodesRef.current = mockNodes
      setStats({
        memoryCount: mockNodes.filter(n => n.type === 'memory').length,
        wikiCount: mockNodes.filter(n => n.type === 'wiki').length,
        decisionCount: mockNodes.filter(n => n.type === 'decision').length,
        toolCallCount: 0,
        recentActivity: [],
      })
    } finally {
      setLoading(false)
    }
  }, [engineRunning])

  useEffect(() => {
    fetchBrainData()
  }, [fetchBrainData])

  // Force-directed graph simulation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio
        canvas.height = rect.height * window.devicePixelRatio
        canvas.style.width = rect.width + 'px'
        canvas.style.height = rect.height + 'px'
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const nodes = nodesRef.current
      if (nodes.length === 0) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      const w = canvas.width / window.devicePixelRatio
      const h = canvas.height / window.devicePixelRatio

      // Apply forces
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        // Repulsion between all nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 800 / (dist * dist)
          a.vx += (dx / dist) * force
          a.vy += (dy / dist) * force
          b.vx -= (dx / dist) * force
          b.vy -= (dy / dist) * force
        }
        // Attraction along connections
        for (const connId of a.connections) {
          const b = nodes.find(n => n.id === connId)
          if (!b) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (dist - 120) * 0.005
          a.vx += (dx / dist) * force
          a.vy += (dy / dist) * force
          b.vx -= (dx / dist) * force
          b.vy -= (dy / dist) * force
        }
        // Center gravity
        a.vx += (w / 2 - a.x) * 0.001
        a.vy += (h / 2 - a.y) * 0.001
        // Damping
        a.vx *= 0.85
        a.vy *= 0.85
      }

      // Update positions
      for (const node of nodes) {
        node.x += node.vx
        node.y += node.vy
        // Keep in bounds
        node.x = Math.max(30, Math.min(w - 30, node.x))
        node.y = Math.max(30, Math.min(h - 30, node.y))
      }

      // Clear
      ctx.clearRect(0, 0, w, h)

      // Draw connections
      const filteredNodes = filter === 'all' ? nodes : nodes.filter(n => n.type === filter)
      const filteredIds = new Set(filteredNodes.map(n => n.id))

      for (const node of filteredNodes) {
        for (const connId of node.connections) {
          if (!filteredIds.has(connId)) continue
          const target = nodes.find(n => n.id === connId)
          if (!target) continue
          ctx.beginPath()
          ctx.moveTo(node.x, node.y)
          ctx.lineTo(target.x, target.y)
          ctx.strokeStyle = hoveredNode === node.id || hoveredNode === target.id
            ? 'rgba(139, 92, 246, 0.4)'
            : 'rgba(255, 255, 255, 0.06)'
          ctx.lineWidth = hoveredNode === node.id || hoveredNode === target.id ? 1.5 : 1
          ctx.stroke()
        }
      }

      // Draw nodes
      for (const node of filteredNodes) {
        const isHovered = hoveredNode === node.id
        const isSelected = selectedNode?.id === node.id
        const radius = isHovered || isSelected ? 8 : 5

        // Glow
        if (isHovered || isSelected) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2)
          const glowGrad = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, radius + 6)
          glowGrad.addColorStop(0, getTypeColor(node.type, 0.3))
          glowGrad.addColorStop(1, getTypeColor(node.type, 0))
          ctx.fillStyle = glowGrad
          ctx.fill()
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = getTypeColor(node.type, 1)
        ctx.fill()

        // Label on hover or selected
        if (isHovered || isSelected) {
          ctx.font = '11px -apple-system, sans-serif'
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
          ctx.textAlign = 'center'
          // Truncate long labels
          const label = node.label.length > 28 ? node.label.slice(0, 25) + '...' : node.label
          ctx.fillText(label, node.x, node.y - radius - 6)
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [filter, hoveredNode, selectedNode])

  // Mouse interaction
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const nodes = nodesRef.current
    let found: string | null = null
    for (const node of nodes) {
      const dx = node.x - mx
      const dy = node.y - my
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        found = node.id
        break
      }
    }
    setHoveredNode(found)
    canvas.style.cursor = found ? 'pointer' : 'default'
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const nodes = nodesRef.current
    for (const node of nodes) {
      const dx = node.x - mx
      const dy = node.y - my
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        setSelectedNode(node)
        return
      }
    }
    setSelectedNode(null)
  }

  if (!engineRunning) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-card)' }}>
            <Network className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Brain is offline</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Start the engine to explore your agent's mind.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex h-full" style={{ background: 'var(--bg)' }}>
      {/* Graph canvas */}
      <div className="flex-1 relative">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 p-4" style={{ background: 'linear-gradient(to bottom, var(--bg) 0%, transparent 100%)' }}>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">Knowledge Graph</span>
          </div>
          <div className="flex-1" />
          {/* Filter buttons */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card)' }}>
            {(['all', 'wiki', 'memory', 'decision'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-2.5 py-1 rounded-md text-xs transition-all"
                style={{
                  background: filter === f ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                  color: filter === f ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
              </button>
            ))}
          </div>
          <button
            onClick={fetchBrainData}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          className="w-full h-full"
        />

        {/* Node count badge */}
        <div className="absolute bottom-4 left-4 text-xs px-3 py-1.5 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
          {nodesRef.current.length} nodes
        </div>
      </div>

      {/* Right panel — stats & activity */}
      <div className="w-72 flex flex-col border-l" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {/* Stats */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-400" />
            Brain Stats
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Memories" value={stats?.memoryCount ?? 0} color="#8B5CF6" />
            <StatCard label="Wiki Pages" value={stats?.wikiCount ?? 0} color="#06B6D4" />
            <StatCard label="Decisions" value={stats?.decisionCount ?? 0} color="#F59E0B" />
            <StatCard label="Tool Calls" value={stats?.toolCallCount ?? 0} color="#10B981" />
          </div>
        </div>

        {/* Selected node details */}
        {selectedNode && (
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold mb-2">Selected</h3>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ background: getTypeColor(selectedNode.type, 1) }} />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{selectedNode.type}</span>
            </div>
            <p className="text-sm font-medium">{selectedNode.label}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{selectedNode.connections.length} connections</p>
          </div>
        )}

        {/* Recent activity */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-400" />
            Recent Activity
          </h3>
          <div className="space-y-2">
            {(stats?.recentActivity ?? []).map((entry, i) => (
              <ActivityRow key={i} entry={entry} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{label}</div>
      <div className="text-lg font-bold" style={{ color }}>{value.toLocaleString()}</div>
    </div>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const Icon = entry.type === 'wiki' ? FileText : entry.type === 'decision' ? GitBranch : Lightbulb
  const color = entry.type === 'wiki' ? '#06B6D4' : entry.type === 'decision' ? '#F59E0B' : '#8B5CF6'
  const timeAgo = getTimeAgo(entry.timestamp)

  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{entry.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{entry.category}</span>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{timeAgo}</span>
        </div>
      </div>
    </div>
  )
}

function getTypeColor(type: string, alpha: number): string {
  switch (type) {
    case 'wiki': return `rgba(6, 182, 212, ${alpha})`   // cyan
    case 'memory': return `rgba(139, 92, 246, ${alpha})` // violet
    case 'decision': return `rgba(245, 158, 11, ${alpha})` // amber
    default: return `rgba(255, 255, 255, ${alpha})`
  }
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const hours = diff / 3600000
  if (hours < 1) return `${Math.round(diff / 60000)}m ago`
  if (hours < 24) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Generate a sample knowledge graph for visualization
function generateMockGraph(): BrainNode[] {
  const wikiPages = [
    'second-brain', 'write-protocol', 'agent-coordination', 'operating-rules',
    'frontend-mastery', 'backend-mastery', 'docker-patterns', 'traefik-routing',
    'openclaw-config', 'seo-technical-guide', 'content-strategy', 'deployment-playbook',
  ]
  const memories = [
    'User prefers TypeScript', 'Project: Greyrock website', 'Prefers dark mode',
    'Weekly backup schedule', 'Client onboarding flow', 'CASL compliance rules',
    'Ottawa market research', 'Pricing: $197 Pro tier',
  ]
  const decisions = [
    'Use LanceDB for vectors', 'Electron for desktop app', 'Tailwind v4 for styling',
    'Socket.IO for real-time', 'MIT license for Lodestone',
  ]

  const nodes: BrainNode[] = []
  let id = 0

  for (const page of wikiPages) {
    nodes.push({
      id: `wiki-${id}`,
      label: page,
      type: 'wiki',
      x: 200 + Math.random() * 400,
      y: 100 + Math.random() * 400,
      vx: 0, vy: 0,
      connections: [],
    })
    id++
  }

  for (const mem of memories) {
    nodes.push({
      id: `mem-${id}`,
      label: mem,
      type: 'memory',
      x: 200 + Math.random() * 400,
      y: 100 + Math.random() * 400,
      vx: 0, vy: 0,
      connections: [],
    })
    id++
  }

  for (const dec of decisions) {
    nodes.push({
      id: `dec-${id}`,
      label: dec,
      type: 'decision',
      x: 200 + Math.random() * 400,
      y: 100 + Math.random() * 400,
      vx: 0, vy: 0,
      connections: [],
    })
    id++
  }

  // Create connections (each node connects to 2-4 random others)
  for (const node of nodes) {
    const numConnections = 2 + Math.floor(Math.random() * 3)
    const others = nodes.filter(n => n.id !== node.id)
    for (let i = 0; i < numConnections && i < others.length; i++) {
      const target = others[Math.floor(Math.random() * others.length)]
      if (!node.connections.includes(target.id)) {
        node.connections.push(target.id)
      }
    }
  }

  return nodes
}