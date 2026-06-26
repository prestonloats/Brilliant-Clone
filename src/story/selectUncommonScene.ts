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

// The shared setting-selection return contract. Declared locally on purpose: the setting-selection
// rules (R1–R4) ship as independent modules, so each keeps its own copy rather than editing a shared
// file. `sceneId` is null only in the degenerate empty-pool case; `settingTieIn` flags that the
// premise is built FROM the scene image rather than from chosen interests.
export type SceneSelection = { sceneId: SceneId | null; settingTieIn?: boolean }

// Pick one of the 67 zero-interest "uncommon" scenes uniformly at random. `avoidSceneId` is excluded
// only while at least one other candidate remains (so consecutive beats don't repeat the same
// surprise setting, yet a lone candidate can still be returned). Always sets `settingTieIn: true`.
export function selectUncommonScene(
  opts?: { rng?: () => number; avoidSceneId?: SceneId },
): { sceneId: SceneId | null; settingTieIn: true } {
  const rng = opts?.rng ?? Math.random
  const avoid = opts?.avoidSceneId
  const pool = uncommonScenes()

  // Drop the avoided scene only when doing so leaves an alternative — never empty the pool.
  const candidates = avoid !== undefined && pool.length > 1 ? pool.filter((id) => id !== avoid) : pool
  if (candidates.length === 0) return { sceneId: null, settingTieIn: true }

  // Clamp the index so an rng() returning exactly 1 (Math.random never does, but an injected rng
  // could) can't index past the end of the array.
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
  return { sceneId: candidates[index], settingTieIn: true }
}
