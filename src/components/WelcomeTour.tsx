import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'

// ─── Tour Steps ─────────────────────────────────────────────────────

interface TourStep {
  target: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  placement: 'bottom' | 'right' | 'top'
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'data-tour-agent-name',
    title: 'Welcome to your agent!',
    description: 'This is your agent\'s identity. It shows the name, status, and current model — everything at a glance.',
    icon: Sparkles,
    placement: 'right',
  },
  {
    target: 'data-tour-nav-chat',
    title: 'Chat with your agent',
    description: 'Send messages, ask questions, and watch your agent think in real time. Conversations are saved automatically.',
    icon: Sparkles,
    placement: 'right',
  },
  {
    target: 'data-tour-nav-brain',
    title: 'See inside its mind',
    description: 'The Brain view shows the agent\'s neural network — memories, decisions, and how knowledge connects together.',
    icon: Sparkles,
    placement: 'right',
  },
  {
    target: 'data-tour-nav-tools',
    title: '39 tools at your disposal',
    description: 'Your agent comes with dozens of built-in tools — web search, memory, scheduling, and more. Browse and toggle them here.',
    icon: Sparkles,
    placement: 'right',
  },
  {
    target: 'data-tour-nav-safety',
    title: 'You\'re in control',
    description: 'Set guardrails, review near-misses, and constrain what your agent can do. Safety settings keep you in the driver\'s seat.',
    icon: Sparkles,
    placement: 'right',
  },
]

const STORAGE_KEY = 'lodestone-tour-completed'

// ─── Welcome Tour ───────────────────────────────────────────────────

export function WelcomeTour({ onComplete }: { onComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const step = TOUR_STEPS[stepIndex]
  const isLastStep = stepIndex === TOUR_STEPS.length - 1

  // Measure the highlighted element
  const measureTarget = useCallback(() => {
    const el = document.querySelector(`[${step.target}]`) as HTMLElement | null
    if (el) {
      setTargetRect(el.getBoundingClientRect())
    } else {
      setTargetRect(null)
    }
  }, [step.target])

  useEffect(() => {
    measureTarget()
  }, [measureTarget])

  // Re-measure on resize
  useEffect(() => {
    const handleResize = () => measureTarget()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [measureTarget])

  // Escape to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    localStorage.setItem(STORAGE_KEY, 'true')
    onComplete()
  }, [onComplete])

  const next = useCallback(() => {
    if (isLastStep) {
      dismiss()
    } else {
      setStepIndex((i) => i + 1)
    }
  }, [isLastStep, dismiss])

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const skip = useCallback(() => {
    dismiss()
  }, [dismiss])

  // Click on overlay (outside tooltip) dismisses
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    // Only dismiss if clicking the overlay itself, not the tooltip card
    if (e.target === overlayRef.current) {
      dismiss()
    }
  }, [dismiss])

  if (!targetRect) return null

  // Calculate tooltip position
  const tooltipPos = getTooltipPosition(targetRect, step.placement)

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleOverlayClick}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          {/* Semi-transparent overlay with cutout */}
          <CutoutOverlay targetRect={targetRect} />

          {/* Tooltip card */}
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed',
              left: tooltipPos.x,
              top: tooltipPos.y,
              width: 320,
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="rounded-2xl p-5 shadow-2xl"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-hover)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.1)',
              }}
            >
              {/* Icon + title */}
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))' }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {step.title}
                </h3>
              </div>

              {/* Description */}
              <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
                {step.description}
              </p>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5 mb-4">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all"
                    style={{
                      width: i === stepIndex ? 20 : 6,
                      height: 6,
                      background: i === stepIndex
                        ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)'
                        : i < stepIndex
                          ? 'rgba(139, 92, 246, 0.4)'
                          : 'var(--border-hover)',
                    }}
                  />
                ))}
              </div>

              {/* Footer: buttons */}
              <div className="flex items-center justify-between">
                {/* Left: Skip / Back */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={skip}
                    className="text-xs font-medium transition-colors hover:opacity-80"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    Skip tour
                  </button>
                  {stepIndex > 0 && (
                    <button
                      onClick={back}
                      className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg transition-all"
                      style={{
                        color: 'var(--text-muted)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                  )}
                </div>

                {/* Right: Next / Done */}
                <button
                  onClick={next}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                    color: '#fff',
                    boxShadow: '0 2px 12px rgba(139, 92, 246, 0.3)',
                  }}
                >
                  {isLastStep ? 'Get started' : 'Next'}
                  {!isLastStep && <ChevronRight className="w-3.5 h-3.5" />}
                  {isLastStep && <Sparkles className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Arrow pointing to target */}
            <TourArrow position={tooltipPos.arrowPos} placement={step.placement} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Cutout Overlay ──────────────────────────────────────────────────

function CutoutOverlay({ targetRect }: { targetRect: DOMRect }) {
  const padding = 6
  const rounded = 10

  return (
    <svg
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <mask id="tour-cutout-mask">
          {/* White = visible overlay, Black = transparent (cutout) */}
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={targetRect.x - padding}
            y={targetRect.y - padding}
            width={targetRect.width + padding * 2}
            height={targetRect.height + padding * 2}
            rx={rounded}
            ry={rounded}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0, 0, 0, 0.55)"
        mask="url(#tour-cutout-mask)"
      />
      {/* Highlight border around cutout */}
      <rect
        x={targetRect.x - padding}
        y={targetRect.y - padding}
        width={targetRect.width + padding * 2}
        height={targetRect.height + padding * 2}
        rx={rounded}
        ry={rounded}
        fill="none"
        stroke="rgba(139, 92, 246, 0.6)"
        strokeWidth={1.5}
      />
    </svg>
  )
}

// ─── Tour Arrow ──────────────────────────────────────────────────────

function TourArrow({ position, placement }: { position: 'left' | 'right' | 'top' | 'bottom'; placement: string }) {
  const arrowColor = 'var(--border-hover)'
  const arrowGlow = 'rgba(139, 92, 246, 0.3)'

  if (placement === 'right') {
    // Arrow points left (toward sidebar element)
    return (
      <div
        style={{
          position: 'absolute',
          left: -7,
          top: position === 'top' ? 24 : position === 'bottom' ? 'auto' : '50%',
          bottom: position === 'bottom' ? 24 : 'auto',
          transform: position === 'left' ? 'translateY(-50%)' : 'none',
          width: 0,
          height: 0,
          borderTop: '7px solid transparent',
          borderBottom: '7px solid transparent',
          borderRight: `7px solid ${arrowColor}`,
          filter: `drop-shadow(0 0 4px ${arrowGlow})`,
        }}
      />
    )
  }
  return null
}

// ─── Tooltip Positioning ─────────────────────────────────────────────

function getTooltipPosition(
  rect: DOMRect,
  placement: 'bottom' | 'right' | 'top'
): { x: number; y: number; arrowPos: 'left' | 'right' | 'top' | 'bottom' } {
  const tooltipWidth = 320
  const tooltipHeight = 220 // estimated
  const gap = 16

  if (placement === 'right') {
    // Tooltip appears to the right of the target (sidebar items)
    let x = rect.right + gap
    // If no room on right, flip to left
    let arrowPos: 'left' | 'right' = 'left'
    if (x + tooltipWidth > window.innerWidth - 16) {
      x = rect.left - tooltipWidth - gap
      arrowPos = 'right'
    }
    // Vertically center on target, clamp to viewport
    let y = rect.top + rect.height / 2 - tooltipHeight / 2
    y = Math.max(16, Math.min(y, window.innerHeight - tooltipHeight - 16))
    return { x, y, arrowPos }
  }

  if (placement === 'bottom') {
    let x = rect.left + rect.width / 2 - tooltipWidth / 2
    x = Math.max(16, Math.min(x, window.innerWidth - tooltipWidth - 16))
    let y = rect.bottom + gap
    let arrowPos: 'top' | 'bottom' = 'top'
    if (y + tooltipHeight > window.innerHeight - 16) {
      y = rect.top - tooltipHeight - gap
      arrowPos = 'bottom'
    }
    return { x, y, arrowPos }
  }

  // top
  let x = rect.left + rect.width / 2 - tooltipWidth / 2
  x = Math.max(16, Math.min(x, window.innerWidth - tooltipWidth - 16))
  let y = rect.top - tooltipHeight - gap
  let arrowPos: 'top' | 'bottom' = 'bottom'
  if (y < 16) {
    y = rect.bottom + gap
    arrowPos = 'top'
  }
  return { x, y, arrowPos }
}

// ─── Helper: Check if tour should show ───────────────────────────────

export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true'
  } catch {
    return false
  }
}