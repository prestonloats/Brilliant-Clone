// Shared return contract + pure pool helpers for the Story Mode scene-selection rules
// (selectSingleScene / selectPairScene / selectTripleScene / selectUncommonScene /
// selectCustomOnlyScene / selectSuggestedPlusCustomScene). Centralized so every rule shares ONE
// definition instead of re-declaring the same type + pick logic per file. Pure + deterministic for
// a fixed `rng`, so a persisted seed (mulberry32) reproduces the same scene on resume.

import type { SceneId } from '../content/storyTypes'

// A 0..1 random source, injectable so picks are deterministic/seedable in tests (mirrors engine `Rng`).
export type Rng = () => number

// The chosen scene (or null when a rule cannot/should not resolve one) plus an OPTIONAL flag a rule
// sets when the scene is a looser "setting tie-in" (the premise is built FROM the image's setting)
// rather than an exact interest match.
export type SceneSelection = { sceneId: SceneId | null; settingTieIn?: boolean }

// Order-preserving de-duplication (a Set keeps first-seen insertion order), so unioned fallback
// pools stay deterministic under a fixed rng.
export const dedupe = (ids: readonly SceneId[]): SceneId[] => [...new Set(ids)]

// Pick ONE id from an ordered pool, excluding `avoid` ONLY while an alternative remains (so a
// one-scene pool never collapses to "no image"). The rng draw is clamped (`Math.min(len-1, ...)`)
// so an rng of exactly 1 stays in bounds. Returns null for an empty pool. Pure: depends only on the
// pool, a single rng draw, and `avoid`.
export function pickFromPool(pool: readonly SceneId[], rng: Rng, avoid?: SceneId): SceneId | null {
  if (pool.length === 0) return null
  const filtered = avoid ? pool.filter((id) => id !== avoid) : pool
  const finalPool = filtered.length > 0 ? filtered : pool
  const index = Math.min(finalPool.length - 1, Math.floor(rng() * finalPool.length))
  return finalPool[index]
}
