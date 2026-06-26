// Story Mode rule 6 — "custom-only" scene selection.
//
// When the learner provides ONLY custom (freeform) interest text and picks NONE of the suggested
// presets, this resolves which background image (if any) the adventure should be GROUNDED in:
//
//   1. Ask the (optional, injected) closest-match scene picker to choose a catalog scene that
//      closely resembles the custom topics. Custom-only has no suggested-interest shortlist, so the
//      candidate set is the WHOLE catalog and `emphasizeCustom` is set. A non-null result is a close
//      match: the story simply proceeds from the custom interests as usual — NO setting tie-in.
//   2. When there is NO close match (the matcher is absent, returns null, or fails), fall back to a
//      RANDOM "uncommon" scene — one a learner would essentially never reach from the suggested
//      interests alone — and flag `settingTieIn: true`. That signals the integrator to build the
//      story from THIS image's SETTING (by calling `themeWithSceneSetting`) while still making
//      significant use of the learner's custom topics.
//
// PURE except for the optional matcher call and the injectable `rng` (default `Math.random`). It
// NEVER throws: a throwing/rejecting matcher is treated as "no close match". Implemented purely
// against the shared foundation (scenery catalog + scene categories) so it stays independent of the
// sibling selection rules and can be built/tested in parallel.

import type { SceneId, StoryTheme } from '../content/storyTypes'
import { uncommonScenes } from './sceneCategories'
import { SCENE_IDS } from './scenery'
import type { SceneMatchRequest } from './storyAi'

// The shared return contract for the rule-4/5/6 scene selectors: the chosen image (or null when no
// image should be shown) plus an OPTIONAL flag telling the integrator to ground the story in the
// chosen image's SETTING. Defined locally so this module stays independent of the sibling rules.
export type SceneSelection = { sceneId: SceneId | null; settingTieIn?: boolean }

export type SelectCustomOnlyOptions = {
  // Closest-match scene picker (the StoryAI seam). Omitted in offline / AI-unavailable paths.
  matcher?: (req: SceneMatchRequest) => Promise<SceneId | null>
  // 0..1 random source for the uncommon fallback; injectable + seedable for deterministic tests.
  rng?: () => number
  // The immediately-previous beat's image, avoided when picking the uncommon fallback (if possible).
  avoidSceneId?: SceneId
}

// Pick ONE uncommon scene at random, excluding `avoidSceneId` when doing so still leaves a choice.
// Mirrors `pickRandomOffInterestScene`'s clamped draw so the index can never fall out of range.
function pickUncommonScene(rng: () => number, avoidSceneId?: SceneId): SceneId | null {
  const pool = uncommonScenes()
  if (pool.length === 0) return null
  const filtered = avoidSceneId ? pool.filter((id) => id !== avoidSceneId) : pool
  const candidates = filtered.length > 0 ? filtered : pool
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
  return candidates[index]
}

export async function selectCustomOnlyScene(
  theme: StoryTheme,
  opts: SelectCustomOnlyOptions,
): Promise<SceneSelection> {
  // 1. Custom-only has no suggested-interest shortlist, so the matcher may pick ANY catalog scene.
  if (opts.matcher) {
    let matched: SceneId | null = null
    try {
      matched = await opts.matcher({ theme, candidates: SCENE_IDS, emphasizeCustom: true })
    } catch {
      matched = null // a failed/timed-out match is just "no close one" — never throw.
    }
    // 2. A close match: keep the story on the custom interests as usual (no setting tie-in).
    if (matched) return { sceneId: matched }
  }

  // 3. No close match: ground the story in a random uncommon image's SETTING.
  const rng = opts.rng ?? Math.random
  return { sceneId: pickUncommonScene(rng, opts.avoidSceneId), settingTieIn: true }
}
