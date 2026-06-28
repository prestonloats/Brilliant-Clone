// No-interest "uncommon" scene selection (Story Mode setting-selection rule 4).
//
// When a learner picks NO suggested interests, Story Mode can't theme the world from an interest
// blend, so rule 4 instead seeds the premise from a random "uncommon" background image — one of the
// 67 zero-interest "surprise" scenes (`uncommonScenes()`), the off-interest tiles a learner would
// essentially never reach from the suggested interests alone. The CHOSEN image's setting becomes the
// story's tie-in, so this selection ALWAYS reports `settingTieIn: true`.
//
// PURE + deterministic under a fixed `rng` (inject `mulberry32(seed)` to reproduce a pick on
// resume). Never throws.

import type { SceneId } from '../content/storyTypes'
import { uncommonScenes } from './sceneCategories'
import { pickFromPool } from './sceneSelection'

// Pick one of the 67 zero-interest "uncommon" scenes uniformly at random. `avoidSceneId` is excluded
// only while at least one other candidate remains (so consecutive beats don't repeat the same
// surprise setting, yet a lone candidate can still be returned). Always sets `settingTieIn: true`.
export function selectUncommonScene(
  opts?: { rng?: () => number; avoidSceneId?: SceneId },
): { sceneId: SceneId | null; settingTieIn: true } {
  const rng = opts?.rng ?? Math.random
  // The chosen image's setting becomes the premise, so always flag settingTieIn. pickFromPool drops
  // the avoided scene only while an alternative remains, clamps the draw, and returns null only when
  // the pool is empty.
  return { sceneId: pickFromPool(uncommonScenes(), rng, opts?.avoidSceneId), settingTieIn: true }
}
