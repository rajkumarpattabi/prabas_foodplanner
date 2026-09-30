import { useRef, useState, type ReactNode } from 'react'

/** How far (px) a row must be dragged left to act. */
const THRESHOLD = 96
/** Movement (px) before deciding between a sideways swipe and a vertical scroll. */
const SLOP = 8

interface Props {
  /** Shown behind the row as it slides, so the action is clear before letting go. */
  actionLabel: string
  onSwipe: () => void
  children: ReactNode
}

/**
 * Swipe left to act. Vertical drags still scroll the page, and a drag never also
 * counts as a tap on a button inside the row.
 */
export function SwipeRow({ actionLabel, onSwipe, children }: Props) {
  const [dx, setDx] = useState(0)
  const [sliding, setSliding] = useState(false)
  const drag = useRef<{ x: number; y: number; id: number; sideways: boolean; dx: number } | null>(null)
  const dragged = useRef(false)

  const end = (act: boolean) => {
    const d = drag.current
    drag.current = null
    setDx(0)
    setSliding(false)
    if (d?.sideways) {
      dragged.current = true
      if (act && d.dx <= -THRESHOLD) onSwipe()
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-end bg-red-fill pr-4 text-sm font-semibold text-red"
      >
        {actionLabel}
      </div>
      <div
        className={`relative bg-surface ${sliding ? '' : 'transition-transform duration-150'}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          dragged.current = false
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, sideways: false, dx: 0 }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          const mx = e.clientX - d.x
          const my = e.clientY - d.y
          if (!d.sideways) {
            if (Math.abs(my) > SLOP && Math.abs(my) >= Math.abs(mx)) {
              drag.current = null // A scroll, not a swipe.
              return
            }
            if (Math.abs(mx) <= SLOP) return
            d.sideways = true
            setSliding(true)
            e.currentTarget.setPointerCapture?.(e.pointerId)
          }
          d.dx = Math.min(0, mx)
          setDx(d.dx)
        }}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.preventDefault()
            e.stopPropagation()
            dragged.current = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
