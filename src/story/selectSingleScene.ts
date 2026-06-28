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
import { pickFromPool, type Rng, type SceneSelection } from './sceneSelection'

export function selectSingleScene(
  interest: StoryInterestId,
  opts?: { rng?: Rng; avoidSceneId?: SceneId },
): SceneSelection {
  const rng = opts?.rng ?? Math.random

  const pool = singlesFor(interest)
  // No pure single-topic scene for this interest: defer to the broad offline default picker.
  if (pool.length === 0) {
    return { sceneId: defaultSceneForInterests({ interestIds: [interest] }, rng) }
  }

  // Uniform pick with a one-step anti-repeat (drops the just-shown scene only when an alternative
  // remains, clamping the draw). pickFromPool returns null only for an empty pool (ruled out above).
  return { sceneId: pickFromPool(pool, rng, opts?.avoidSceneId) }
}
