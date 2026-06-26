// Rule 1 of the scene-selection redesign: pick a background scene for a SINGLE chosen interest.
//
// When the learner's theme narrows to ONE suggested interest, this draws uniformly at random from
// that interest's PURE single-topic scenes (interest set === exactly {interest}; see `singlesFor`
// in `./sceneCategories`), with a one-step anti-repeat so the same background is not shown twice in
// a row whenever the pool has an alternative. If the interest somehow has no pure single-topic
// scene, it defers to the broad offline default picker (`defaultSceneForInterests`), which always
// returns a real catalog scene for any known interest.
//
// PURE + deterministic for a fixed `rng`, and it never throws.

import type { SceneId, StoryInterestId } from '../content/storyTypes'
import { singlesFor } from './sceneCategories'
import { defaultSceneForInterests } from './scenery'

// A 0..1 random source, injectable so the pick is deterministic/seedable in tests (mirrors the
// engine's `Rng`). Defined locally so this rule shares the structural selection contract
// (`{ sceneId: SceneId | null; settingTieIn?: boolean }`) without importing it.
type Rng = () => number

export function selectSingleScene(
  interest: StoryInterestId,
  opts?: { rng?: Rng; avoidSceneId?: SceneId },
): { sceneId: SceneId | null } {
  const rng = opts?.rng ?? Math.random

  const pool = singlesFor(interest)
  // No pure single-topic scene for this interest: defer to the broad offline default picker.
  if (pool.length === 0) {
    return { sceneId: defaultSceneForInterests({ interestIds: [interest] }, rng) }
  }

  // Scene anti-repeat: drop the just-shown scene, but only when an alternative remains (a 1-scene
  // pool keeps its only scene). Harmless no-op when `avoidSceneId` is absent or not in the pool.
  const candidates =
    opts?.avoidSceneId !== undefined && pool.length > 1
      ? pool.filter((id) => id !== opts.avoidSceneId)
      : pool

  // Uniform pick; the clamp guards the `rng() === 1` edge so the index stays in range.
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
  return { sceneId: candidates[index] }
}
