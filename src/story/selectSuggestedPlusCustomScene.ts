// Rule 5 scene selection: "suggested + custom".
//
// The learner picked one or more SUGGESTED preset interests AND typed a CUSTOM freeform topic. We
// first ask the (injected) AI scene matcher for the ONE catalog image that most closely RESEMBLES
// the theme, EMPHASIZING the custom freeform topic over the presets. When the matcher is
// unavailable, fails, or judges nothing "close enough" (it resolves to null), we FALL BACK to the
// same suggested-only selection that rules 1-3 use: a random on-theme scene drawn from the chosen
// interests' category pools (the pure singles for one interest, the pair-combo for two, the
// triple-combo for three), widening to broader pools when a tier is empty and finally landing on the
// always-valid offline default.
//
// This module is intentionally SELF-CONTAINED: it depends only on the shared Wave-1 foundation
// (`sceneCategories` + `scenery`) and the `SceneMatchRequest` type — never on the sibling rule
// modules — so it can be built and tested in parallel. The matcher is INJECTED (tests pass a fake,
// so nothing here ever touches the network) and this function NEVER throws: any matcher rejection
// degrades to the deterministic offline fallback.

import type { SceneId, StoryInterestId, StoryTheme } from '../content/storyTypes'
import { pairScenes, singlesFor, tripleScenes } from './sceneCategories'
import { defaultSceneForInterests, scenesForInterests } from './scenery'
import { dedupe, pickFromPool, type Rng } from './sceneSelection'
import type { SceneMatchRequest } from './storyAi'

type SelectOptions = {
  // Injected closest-match scene picker (a real SDK adapter in the app, a fake in tests). Optional
  // so a caller with no AI still gets the deterministic offline fallback below.
  matcher?: (req: SceneMatchRequest) => Promise<SceneId | null>
  // 0..1 random source, injectable + seedable so the fallback pick is deterministic in tests.
  rng?: Rng
  // A scene to avoid repeating (e.g. the previous beat's image) — skipped ONLY when the pool has
  // another option, so a tiny pool never collapses to "no scene".
  avoidSceneId?: SceneId
}

// Run the injected matcher, converting ANY rejection/throw into the "not matched" signal (null) so
// the caller can degrade to the offline fallback. The non-empty catch keeps this lint-clean.
const runMatcher = async (
  matcher: (req: SceneMatchRequest) => Promise<SceneId | null>,
  req: SceneMatchRequest,
): Promise<SceneId | null> => {
  try {
    return await matcher(req)
  } catch {
    return null
  }
}

// The suggested-only candidate pool for the chosen interest count, mirroring rules 1-3:
//   1 interest  -> its pure single-topic scenes
//   2 interests -> the matching pair-combo, widening to the two interests' singles when empty
//   3+ interests-> the matching triple-combo, widening to the member pairs, then the member singles
// May be empty (e.g. no interests chosen at all) — the caller then uses the offline default.
const suggestedPool = (ids: readonly StoryInterestId[]): SceneId[] => {
  if (ids.length === 1) return singlesFor(ids[0])

  if (ids.length === 2) {
    const pair = pairScenes(ids[0], ids[1])
    if (pair.length > 0) return pair
    return dedupe([...singlesFor(ids[0]), ...singlesFor(ids[1])])
  }

  if (ids.length >= 3) {
    const [a, b, c] = ids
    const triple = tripleScenes(a, b, c)
    if (triple.length > 0) return triple
    const pairs = dedupe([...pairScenes(a, b), ...pairScenes(a, c), ...pairScenes(b, c)])
    if (pairs.length > 0) return pairs
    return dedupe([...singlesFor(a), ...singlesFor(b), ...singlesFor(c)])
  }

  return []
}

export async function selectSuggestedPlusCustomScene(
  theme: StoryTheme,
  opts: SelectOptions = {},
): Promise<{ sceneId: SceneId | null }> {
  const rng = opts.rng ?? Math.random

  // 1. Broad candidate shortlist (includes scenes reachable from the custom freeform text), handed
  //    to the matcher so it can emphasize the custom topic when choosing the closest image.
  const candidates = scenesForInterests(theme)

  // 2. Ask the matcher for the close, custom-emphasizing match. A non-null SceneId wins outright.
  if (opts.matcher) {
    const matched = await runMatcher(opts.matcher, { theme, candidates, emphasizeCustom: true })
    if (matched != null) return { sceneId: matched }
  }

  // 3. Matcher absent / failed / "not close enough" -> suggested-only fallback (rules 1-3), then the
  //    always-valid offline default (which returns a real catalog id even for empty interests).
  const fromPool = pickFromPool(suggestedPool(theme.interestIds), rng, opts.avoidSceneId)
  if (fromPool != null) return { sceneId: fromPool }

  return { sceneId: defaultSceneForInterests(theme, rng) }
}
