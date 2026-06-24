export type CelebrationParticle = {
  id: number
  left: number
  top: number
  delay: number
  size: number
  rotate: number
  hue: number
}

const DEFAULT_COUNT = 12
const MAX_DELAY_MS = 600
const MIN_SIZE = 6
const MAX_SIZE = 14

// Small, fast, deterministic PRNG. Returns floats in [0, 1).
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function getCelebrationParticles(seed: number, count?: number): CelebrationParticle[] {
  const total = count === undefined ? DEFAULT_COUNT : Math.max(0, Math.floor(count))
  // `>>> 0` coerces to a 32-bit unsigned int and maps any non-finite value (NaN, +/-Infinity) to 0.
  const rng = mulberry32(seed >>> 0)
  const particles: CelebrationParticle[] = []
  for (let id = 0; id < total; id++) {
    particles.push({
      id,
      left: Math.round(rng() * 100),
      top: Math.round(rng() * 100),
      delay: Math.round(rng() * MAX_DELAY_MS),
      size: MIN_SIZE + Math.round(rng() * (MAX_SIZE - MIN_SIZE)),
      rotate: Math.floor(rng() * 360),
      hue: Math.floor(rng() * 360),
    })
  }
  return particles
}
