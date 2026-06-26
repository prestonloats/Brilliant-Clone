// Scene-selection DISPATCHER (the final integration seam of the scene-categorization redesign).
//
// One entry point the controller calls per beat: it classifies a theme's interest selection with
// `interestSelectionMode` and routes to the matching Wave-2 rule, returning that rule's shared
// `SceneSelection` ({ sceneId, settingTieIn? }) verbatim:
//
//   'single'              -> selectSingleScene(interest)                 (rule 1)
//   'pair'                -> selectPairScene(a, b)                       (rule 2)
//   'triple'              -> selectTripleScene(a, b, c)                  (rule 3)
//   'none'                -> selectUncommonScene()                       (rule 4, always settingTieIn)
//   'suggestedPlusCustom' -> selectSuggestedPlusCustomScene(theme)      (rule 5, async matcher)
//   'customOnly'          -> selectCustomOnlyScene(theme)               (rule 6, async matcher)
//
// Pure aside from the INJECTED async matcher (the StoryAI seam, rules 5 & 6). The `rng` and
// `avoidSceneId` options are threaded to every rule so a seeded rng makes the pick deterministic and
// the previous beat's image is avoided when an alternative exists. Each rule already backstops to a
// real catalog id, so the only `sceneId: null` cases are the degenerate empty-pool ones.

import type { SceneId, StoryTheme } from '../content/storyTypes'
import { interestSelectionMode } from './interestSelectionMode'
import { selectCustomOnlyScene } from './selectCustomOnlyScene'
import { selectPairScene } from './selectPairScene'
import { selectSingleScene } from './selectSingleScene'
import { selectSuggestedPlusCustomScene } from './selectSuggestedPlusCustomScene'
import { selectTripleScene } from './selectTripleScene'
import { selectUncommonScene } from './selectUncommonScene'
import type { SceneMatchRequest } from './storyAi'

// The shared return contract every scene-selection rule resolves to: the chosen image (or null in
// the degenerate empty-pool case) plus an OPTIONAL flag telling the caller to GROUND the story in
// the chosen image's setting (rules 4 & 6 — the integrator folds it into the premise then).
export type SceneSelection = { sceneId: SceneId | null; settingTieIn?: boolean }

type Matcher = (req: SceneMatchRequest) => Promise<SceneId | null>

export type SelectSceneForBeatOptions = {
  // Injected closest-match scene picker (the StoryAI adapter's `matchSceneToInterests`). Used only
  // by rules 5 & 6; omit it (offline / no provider) and those rules take their deterministic fallback.
  matcher?: Matcher
  // 0..1 random source, injectable + seedable so a pick is reproducible (mulberry32 on resume/tests).
  rng?: () => number
  // The previous beat's image, avoided when the chosen pool has an alternative (scene anti-repeat).
  avoidSceneId?: SceneId
}

export async function selectSceneForBeat(
  theme: StoryTheme,
  opts?: SelectSceneForBeatOptions,
): Promise<SceneSelection> {
  const rng = opts?.rng
  const avoidSceneId = opts?.avoidSceneId
  const matcher = opts?.matcher

  switch (interestSelectionMode(theme)) {
    case 'single':
      return selectSingleScene(theme.interestIds[0], { rng, avoidSceneId })
    case 'pair':
      return selectPairScene(theme.interestIds[0], theme.interestIds[1], { rng, avoidSceneId })
    case 'triple':
      return selectTripleScene(theme.interestIds[0], theme.interestIds[1], theme.interestIds[2], {
        rng,
        avoidSceneId,
      })
    case 'none':
      return selectUncommonScene({ rng, avoidSceneId })
    case 'suggestedPlusCustom':
      return selectSuggestedPlusCustomScene(theme, { matcher, rng, avoidSceneId })
    case 'customOnly':
      return selectCustomOnlyScene(theme, { matcher, rng, avoidSceneId })
  }
}
