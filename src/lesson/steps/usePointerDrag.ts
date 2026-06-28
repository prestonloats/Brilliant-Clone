import { useEffect, useRef, useState } from 'react'

// The shared pointer-drag machinery behind the balance, drag-terms, and manipulative steps.
// Each of those views previously inlined the same trio: a `dragging` descriptor, a `hover`
// target, and a window-level pointermove/pointerup/pointercancel effect that tracks the
// pointer and resolves a drop. This hook owns that scaffolding and parameterizes the parts
// that legitimately differ between the call sites:
//   - getZoneAtPoint: the view's own hit-tester (data-drop-zone / data-term-zone / data-zone-index)
//   - updateOnMove:   how the drag descriptor advances on each move (drag-terms also tracks `moved`)
//   - onDrop:         what a release does with the resolved zone (each view keeps its own check)
//   - dropOnCancel:   whether pointercancel resolves a drop (manipulative/drag-terms) or just clears
//                     the drag (balance), matching today's behavior exactly.
//
// The listeners are registered once per drag (the balance view's approach) and read the latest
// state/handlers through refs, so a release always sees the current descriptor. That is
// behavior-equivalent to the call sites that previously re-registered the listeners on every
// pointermove, without that churn.

type DragPosition = { x: number; y: number }

type PointerDropContext<D, Z> = {
  zone: Z | null
  dragging: D
}

export function usePointerDrag<D extends DragPosition, Z>({
  getZoneAtPoint,
  onDrop,
  updateOnMove,
  dropOnCancel = false,
}: {
  getZoneAtPoint: (x: number, y: number) => Z | null
  onDrop: (context: PointerDropContext<D, Z>) => void
  updateOnMove?: (event: PointerEvent, current: D) => D
  dropOnCancel?: boolean
}) {
  const [dragging, setDragging] = useState<D | null>(null)
  const [hover, setHover] = useState<Z | null>(null)

  // Mirror the live values into refs so the once-per-drag listeners always act on the latest
  // descriptor and handlers (the drag-terms drop, for instance, reads the up-to-date `moved`).
  const draggingRef = useRef<D | null>(dragging)
  const getZoneAtPointRef = useRef(getZoneAtPoint)
  const onDropRef = useRef(onDrop)
  const updateOnMoveRef = useRef(updateOnMove)
  const dropOnCancelRef = useRef(dropOnCancel)

  useEffect(() => {
    draggingRef.current = dragging
    getZoneAtPointRef.current = getZoneAtPoint
    onDropRef.current = onDrop
    updateOnMoveRef.current = updateOnMove
    dropOnCancelRef.current = dropOnCancel
  })

  const isDragging = dragging !== null

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (event: PointerEvent) => {
      setDragging((current) => {
        if (!current) return current
        const update = updateOnMoveRef.current
        return update ? update(event, current) : ({ ...current, x: event.clientX, y: event.clientY } as D)
      })
      setHover(getZoneAtPointRef.current(event.clientX, event.clientY))
    }

    const handleDrop = (event: PointerEvent) => {
      const current = draggingRef.current
      if (current) {
        const zone = getZoneAtPointRef.current(event.clientX, event.clientY)
        onDropRef.current({ zone, dragging: current })
      }
      setDragging(null)
      setHover(null)
    }

    const handleCancel = (event: PointerEvent) => {
      if (dropOnCancelRef.current) {
        handleDrop(event)
        return
      }
      setDragging(null)
      setHover(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleDrop)
    window.addEventListener('pointercancel', handleCancel)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleDrop)
      window.removeEventListener('pointercancel', handleCancel)
    }
  }, [isDragging])

  return { dragging, setDragging, hover, setHover }
}
