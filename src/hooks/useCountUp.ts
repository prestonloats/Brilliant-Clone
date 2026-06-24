import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

// Animates from 0 up to `target`, snapping straight to the final value when the user
// prefers reduced motion so the score never visibly counts. The reduced-motion value is
// derived during render (not via setState) so it stays out of the effect body.
export function useCountUp(target: number, durationMs = 950) {
  const reducedMotion = usePrefersReducedMotion()
  const [animatedValue, setAnimatedValue] = useState(0)

  useEffect(() => {
    if (reducedMotion) return

    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(Math.round(target * eased))
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        setAnimatedValue(target)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, reducedMotion])

  return reducedMotion ? target : animatedValue
}
