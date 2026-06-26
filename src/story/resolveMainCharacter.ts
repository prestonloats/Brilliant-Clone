// Pure main-character resolution for Story Mode (plan: custom main character).
//
// React-free + side-effect-free so it can be unit-tested under `node --test` alongside the rest
// of the pure Story Mode logic. `useStorySession.beginAdventure` calls this BEFORE `startStory`
// to decide the protagonist's name from the theme's `mainCharacterSource`:
//   - 'displayName' -> the signed-in user's display name (sanitized + capped here)
//   - 'custom'      -> the user-typed `theme.mainCharacterName` (defensively re-sanitized here)
//   - 'random'/unset-> leave it to the LLM to invent the protagonist (no override)
//
// When a usable name is resolved it is BOTH fed forward into the prompt (`mainCharacterName`) and
// returned as `protagonistOverride` so the controller can authoritatively pin `theme.protagonist`
// to it, overriding whatever name the model returns. An unusable name (empty after sanitizing, or
// caught by the teen-safety filters) gracefully degrades to random behavior (both fields unset).

import type { StoryTheme } from '../domain'
import { MAX_CHARACTER_NAME_LEN } from './characterPresets'
import { containsProfanity, containsUnsafeContent, sanitizeUserInput } from './safety'

export type ResolvedMainCharacter = {
  // The name to feed forward to the prompts (omitted -> the LLM invents the protagonist).
  mainCharacterName?: string
  // When set, the controller pins `theme.protagonist` to this, overriding the model's choice.
  protagonistOverride?: string
}

// Sanitize + cap a candidate protagonist name and reject anything unusable. Returns '' when the
// name is empty after sanitizing or trips the profanity/unsafe filters, signalling the caller to
// fall back to the LLM-invented protagonist (random behavior).
const cleanProtagonistName = (raw: string | undefined): string => {
  if (typeof raw !== 'string') return ''
  const name = sanitizeUserInput(raw, MAX_CHARACTER_NAME_LEN)
  if (name === '') return ''
  if (containsProfanity(name) || containsUnsafeContent(name)) return ''
  return name
}

// Resolve the protagonist's name from the theme's chosen source. Pure: the caller supplies the
// signed-in user's `displayName` (the only non-theme input) so this stays free of React/auth.
export function resolveProtagonist(theme: StoryTheme, displayName?: string): ResolvedMainCharacter {
  const source = theme.mainCharacterSource ?? 'random'

  if (source === 'displayName') {
    const name = cleanProtagonistName(displayName)
    return name ? { mainCharacterName: name, protagonistOverride: name } : {}
  }

  if (source === 'custom') {
    const name = cleanProtagonistName(theme.mainCharacterName)
    return name ? { mainCharacterName: name, protagonistOverride: name } : {}
  }

  // 'random' or unset: the LLM invents the protagonist, so there is nothing to pin or feed forward.
  return {}
}
