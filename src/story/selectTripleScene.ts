// Story Mode scene selection — Rule 3 (THREE chosen interests).
//
// A pure, React-free `.ts` helper (mirrors `sceneCategories.ts` / `scenery.ts`) so the app and the
// node:test suites share one source of truth. Given three chosen interests it picks ONE background
// scene for a story beat:
//
//   1. PRIMARY: a random scene whose interest set is EXACTLY {a, b, c} — i.e. the triple-blend tile
//      from `tripleScenes(a, b, c)`.
//   2. MISSING-COMBO FALLBACK (defensive): the complete catalog has a tile for every C(8,3)=56 real
//      triple, so the primary pool is only empty when called with an interest id that is not in the
//      catalog. To stay robust we then widen the search: the union of the three PAIR pools, then the
//      union of the three SINGLE-topic pools, then the catalog's themed `defaultSceneForInterests`
//      backstop (which always returns a real id). The function therefore NEVER throws and, under a
//      fixed `rng`, is fully deterministic/pure.

import type { SceneId, StoryInterestId } from '../content/storyTypes'
import { pairScenes, singlesFor, tripleScenes } from './sceneCategories'
import { defaultSceneForInterests } from './scenery'
import { dedupe, pickFromPool, type Rng, type SceneSelection } from './sceneSelection'

export function selectTripleScene(
  a: StoryInterestId,
  b: StoryInterestId,
  c: StoryInterestId,
  opts?: { rng?: Rng; avoidSceneId?: SceneId },
): SceneSelection {
  const rng = opts?.rng ?? Math.random
  const avoidSceneId = opts?.avoidSceneId

  // 1. Primary: the triple-blend tile(s) whose interest set is exactly {a, b, c}.
  const primary = tripleScenes(a, b, c)
  if (primary.length > 0) {
    return { sceneId: pickFromPool(primary, rng, avoidSceneId) }
  }

  // 2a. Fallback: union of the three pair pools (dedup).
  const pairUnion = dedupe([...pairScenes(a, b), ...pairScenes(a, c), ...pairScenes(b, c)])
  if (pairUnion.length > 0) {
    return { sceneId: pickFromPool(pairUnion, rng, avoidSceneId) }
  }

  // 2b. Fallback: union of the three single-topic pools (dedup).
  const singleUnion = dedupe([...singlesFor(a), ...singlesFor(b), ...singlesFor(c)])
  if (singleUnion.length > 0) {
    return { sceneId: pickFromPool(singleUnion, rng, avoidSceneId) }
  }

  // 2c. Backstop: the catalog's themed default for these interests (always a real id).
  return { sceneId: defaultSceneForInterests({ interestIds: [a, b, c] }, rng) }
}
