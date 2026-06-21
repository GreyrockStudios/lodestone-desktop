import { useRef, useState, useEffect, useCallback } from 'react'
import { Brush, Eraser, Undo2, Redo2, Trash2, Download, PenTool } from 'lucide-react'

type Tool = 'pen' | 'eraser'

const COLORS = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#FFFFFF', '#9CA3AF']

export function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#8B5CF6')
  const [size, setSize] = useState(3)
  const [isDrawing, setIsDrawing] = useState(false)
  const [history, setHistory] = useState<ImageData[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctxRef.current = ctx

    // Fill with bg color
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0A0A0F'
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Save initial state
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory([data])
    setHistoryIdx(0)
  }, [])

  const saveState = useCallback(() => {
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory(prev => [...prev.slice(0, historyIdx + 1), data])
    setHistoryIdx(prev => prev + 1)
  }, [historyIdx])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.beginPath()
    const pos = getPos(e)
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = ctxRef.current
    if (!ctx) return
    const pos = getPos(e)

    if (tool === 'eraser') {
      const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0A0A0F'
      ctx.strokeStyle = bgColor
      ctx.lineWidth = size * 4
    } else {
      ctx.strokeStyle = color
      ctx.lineWidth = size
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const endDraw = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    saveState()
  }

  const undo = () => {
    if (historyIdx <= 0) return
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.putImageData(history[historyIdx - 1], 0, 0)
    setHistoryIdx(prev => prev - 1)
  }

  const redo = () => {
    if (historyIdx >= history.length - 1) return
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.putImageData(history[historyIdx + 1], 0, 0)
    setHistoryIdx(prev => prev + 1)
  }

  const clear = () => {
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0A0A0F'
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    saveState()
  }

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `canvas-${Date.now()}.png`
    a.click()
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTool('pen')}
            className="p-2 rounded-lg transition-all"
            style={{ background: tool === 'pen' ? 'rgba(139, 92, 246, 0.1)' : 'transparent', border: `1px solid ${tool === 'pen' ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}` }}
          >
            <PenTool className="w-4 h-4" style={{ color: tool === 'pen' ? 'var(--accent)' : 'var(--text-muted)' }} />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className="p-2 rounded-lg transition-all"
            style={{ background: tool === 'eraser' ? 'rgba(139, 92, 246, 0.1)' : 'transparent', border: `1px solid ${tool === 'eraser' ? 'rgba(139, 92, 246, 0.3)' : 'var(--border)'}` }}
          >
            <Eraser className="w-4 h-4" style={{ color: tool === 'eraser' ? 'var(--accent)' : 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="w-px h-6" style={{ background: 'var(--border)' }} />

        {/* Colors */}
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => { setColor(c); setTool('pen') }}
              className="w-6 h-6 rounded-full transition-all"
              style={{
                background: c,
                border: color === c ? '2px solid var(--accent)' : '2px solid var(--border)',
                transform: color === c ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        <div className="w-px h-6" style={{ background: 'var(--border)' }} />

        {/* Size */}
        <input
          type="range"
          min={1}
          max={20}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-20"
          style={{ accentColor: 'var(--accent)' }}
        />
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{size}px</span>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={historyIdx <= 0} className="p-2 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', opacity: historyIdx <= 0 ? 0.4 : 1 }}>
            <Undo2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-2 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)', opacity: historyIdx >= history.length - 1 ? 0.4 : 1 }}>
            <Redo2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={clear} className="p-2 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)' }}>
            <Trash2 className="w-4 h-4" style={{ color: '#EF4444' }} />
          </button>
          <button onClick={download} className="p-2 rounded-lg transition-all" style={{ background: 'var(--bg-elevated)' }}>
            <Download className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className="rounded-xl"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            maxWidth: '100%',
            maxHeight: '100%',
            cursor: tool === 'pen' ? 'crosshair' : 'cell',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  )
}