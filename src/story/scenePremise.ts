// Scene-setting premise helpers (Story Mode rules 4 & 6: build the story from the chosen image's
// setting). When the learner does NOT pick suggested interests, the adventure should be GROUNDED in
// a chosen scene's setting. These are the PURE pieces of that idea, generalized from the no-interest
// path in `useStorySession.ts` (`beginAdventure`), which seeded `freeformInterest` from a scene's
// label: they turn a `SceneId` into a human "setting" phrase and fold it into a `StoryTheme`.
//
// HOW THE SETTING IS FED FORWARD (read before wiring): the setting rides on `theme.freeformInterest`
// — the SAME channel the existing no-interest path used. `describeInterests` in `storyPrompts.ts`
// appends `freeformInterest` to the interest list that seeds EVERY prompt (start/premise, segment,
// re-theme, scene match), so seeding it here makes the generated premise and all later beats reflect
// the scene's setting WITHOUT adding any new theme field. Kept React-free and LLM-free (pure +
// deterministic) so both the controller and `node --test` can rely on it.

import type { SceneId, StoryTheme } from '../content/storyTypes'
import { getSceneDescription, getSceneLabel } from './scenery'

// A human, plain-language phrase describing a scene's SETTING, built from the catalog's short label
// and its longer "where this is" description (both from `scenery.ts`). Formatted as
// "Label (description)" so the phrase carries the title AND the full setting verbatim. Returns ''
// for an unknown id so callers never seed a story with "undefined" (mirrors getSceneLabel/
// getSceneDescription, which return '' for unknown ids).
export function describeSceneSetting(sceneId: SceneId): string {
  const label = getSceneLabel(sceneId).trim()
  const description = getSceneDescription(sceneId).trim()
  if (label && description) return `${label} (${description})`
  return description || label
}

// Return a COPY of `theme` whose premise-seeding reflects the chosen scene's setting, fed forward via
// `freeformInterest` (the channel `describeInterests` / `buildStartStoryPrompt` already consume).
//
//   - rule 6 (custom-only): when the learner typed custom interest text, that text is PRESERVED and
//     the setting is folded in after it ("<custom>, set in <setting>"), so the story honors BOTH.
//   - rule 4 (no custom text): the setting becomes the freeform seed outright.
//
// Pure: never mutates the input and makes no LLM call. An unknown `sceneId` yields an empty setting,
// so the theme is returned as a plain copy — a bad id can never wipe the learner's custom text.
//
// NOTE for the integrator: the persistence layer caps `freeformInterest` at 80 chars
// (STORY_FREEFORM_MAX_LENGTH in `backend/validation.ts`), so the full "Label (description)" seed may
// be truncated when the session is saved/reloaded. That is fine for premise generation — call this on
// the start-time theme BEFORE `startStory`, so the LLM premise (persisted in full) is produced from
// the complete setting; only the later "Interests:" recap line sees the truncated text.
export function themeWithSceneSetting(theme: StoryTheme, sceneId: SceneId): StoryTheme {
  const setting = describeSceneSetting(sceneId)
  if (!setting) return { ...theme }
  const existing = (theme.freeformInterest ?? '').trim()
  const freeformInterest = existing ? `${existing}, set in ${setting}` : setting
  return { ...theme, freeformInterest }
}
