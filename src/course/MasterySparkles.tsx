import type { CSSProperties } from 'react'
import { getCelebrationParticles } from './celebrationParticles'

// A decorative, deterministic burst of sparkles laid out by getCelebrationParticles.
// Purely visual: aria-hidden, pointer-events none, and each spark rests at opacity 0 so
// the global prefers-reduced-motion rule (which disables animation) leaves nothing visible.
export function MasterySparkles({ seed, count }: { seed: number; count?: number }) {
  const particles = getCelebrationParticles(seed, count)

  return (
    <span className="mastery-sparkles" aria-hidden="true">
      {particles.map((particle) => (
        <i
          key={particle.id}
          style={
            {
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              '--spark-delay': `${particle.delay}ms`,
              '--spark-rotate': `${particle.rotate}deg`,
              '--spark-hue': `${particle.hue}`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
