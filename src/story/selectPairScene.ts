// Rule 2 of the scene-categorization selection redesign: choose ONE background scene for a learner
// who picked EXACTLY TWO interests (a pair).
//
// Pure + React-free (a `.ts` sibling of `sceneCategories.ts` / `scenery.ts`) so both the app and the
// node:test suites share one source of truth. The pick is deterministic for a given `rng`, so a
// persisted seed (mulberry32) reproduces the exact same scene on resume — mirroring how the rest of
// the scenery layer (`defaultSceneForInterests`, `pickRandomOffInterestScene`) distributes picks.
//
// Selection cascade (first non-empty pool wins; a pool is drawn from at random):
//   1. PRIMARY — `pairScenes(a, b)`: every catalog scene whose interest set is EXACTLY {a, b} (the
//      blend-combo tile plus any hand-assigned pair scenes, e.g. {fantasy, cooking} ->
//      fantasy-cooking, candy-castle, dragon-bakery, enchanted-bakery, wizard-kitchen).
//   2. MISSING-COMBO FALLBACK (defensive) — the union of each member interest's pure single-topic
//      scenes (`singlesFor(a) ∪ singlesFor(b)`, deduped). Today every pair has >= 1 image so this is
//      unreachable from real inputs, but it keeps selection well-defined if a pair's tile is ever
//      removed from the catalog.
//   3. LAST RESORT — `defaultSceneForInterests({ interestIds: [a, b] }, rng)`, which ALWAYS returns a
//      valid catalog id (never null), so `selectPairScene` effectively always resolves to a scene.
//
// `avoidSceneId` (the previously shown scene) is excluded ONLY when the chosen pool still has another
// option, so a single-scene pair never collapses to "no image". Never throws.

import type { SceneId, StoryInterestId } from '../content/storyTypes'
import { pairScenes, singlesFor } from './sceneCategories'
import { defaultSceneForInterests } from './scenery'
import { dedupe, pickFromPool, type Rng, type SceneSelection } from './sceneSelection'

// Re-exported so existing importers (and the pair-scene tests) keep getting these from this module.
export { pickFromPool }
export type { SceneSelection }

// The MISSING-COMBO fallback pool: the union of each member interest's pure single-topic scenes,
// deduped. Exported so the (defensive) fallback path is unit-testable without forcing an empty pair.
export function memberSingles(a: StoryInterestId, b: StoryInterestId): SceneId[] {
  return dedupe([...singlesFor(a), ...singlesFor(b)])
}

// The ordered candidate pool for a pair: the PRIMARY exact-{a,b} pool when it exists, else the
// member-singles fallback. Returns [] only when BOTH are empty (the caller then uses the themed
// default). Pure + deterministic (follows the catalog order the foundation lookups already impose).
export function pairSceneCandidates(a: StoryInterestId, b: StoryInterestId): SceneId[] {
  const primary = pairScenes(a, b)
  if (primary.length > 0) return primary
  return memberSingles(a, b)
}

// Rule 2: select a background scene for the interest PAIR {a, b}. See the cascade documented above.
// `opts.rng` makes the pick seedable/deterministic (defaults to Math.random); `opts.avoidSceneId`
// nudges away from the previously shown scene when the pool has alternatives.
export function selectPairScene(
  a: StoryInterestId,
  b: StoryInterestId,
  opts?: { rng?: Rng; avoidSceneId?: SceneId },
): SceneSelection {
  const rng = opts?.rng ?? Math.random
  const picked = pickFromPool(pairSceneCandidates(a, b), rng, opts?.avoidSceneId)
  if (picked !== null) return { sceneId: picked }
  // Defensive last resort: both the pair pool and member singles were empty. Always a valid SceneId.
  return { sceneId: defaultSceneForInterests({ interestIds: [a, b] }, rng) }
}
