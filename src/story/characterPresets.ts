// Selectable custom-character presets (personalities + backstories) and the shared caps.
//
// Extracted into a React-free `.ts` module (mirroring `interests.ts`) so the custom-character
// selection UI, the prompt builder, and the persistence-layer normalizer (`backend/validation.ts`)
// all share ONE source of truth for the preset ids, their display labels, and the input caps —
// and so the lookups stay unit-testable under `node --test` (the test build only transpiles `.ts`).

import type { CharacterPreset } from '../domain'

// Personalities the learner can attach to a custom character. `id` is the stable value stored on
// `CustomCharacter.personalityId`; `label` is for display + prompts.
export const CHARACTER_PERSONALITIES: CharacterPreset[] = [
  { id: 'brave', label: 'Brave' },
  { id: 'funny', label: 'Funny' },
  { id: 'shy', label: 'Shy' },
  { id: 'clever', label: 'Clever' },
  { id: 'kind', label: 'Kind' },
  { id: 'grumpy', label: 'Grumpy' },
  { id: 'adventurous', label: 'Adventurous' },
  { id: 'curious', label: 'Curious' },
  { id: 'loyal', label: 'Loyal' },
  { id: 'mischievous', label: 'Mischievous' },
]

// Backstories/relationships the learner can attach to a custom character. Stored on
// `CustomCharacter.backstoryId`.
export const CHARACTER_BACKSTORIES: CharacterPreset[] = [
  { id: 'best-friend', label: 'Your best friend' },
  { id: 'wise-mentor', label: 'A wise mentor' },
  { id: 'younger-sibling', label: 'A younger sibling' },
  { id: 'older-sibling', label: 'An older sibling' },
  { id: 'rival-turned-ally', label: 'A rival turned ally' },
  { id: 'loyal-pet', label: 'A loyal pet' },
  { id: 'family-member', label: 'A family member' },
  { id: 'classmate', label: 'A classmate' },
]

// Shared caps — imported by the UI (input maxlengths/limits), the prompt agents, and the
// persistence-layer normalizer so every layer agrees on the same bounds.
export const MAX_CUSTOM_CHARACTERS = 5 // supporting cast size cap (theme.characters)
export const MAX_CHARACTER_NAME_LEN = 40 // cap for a character/main-character name
export const MAX_BACKSTORY_LEN = 120 // cap for any free-text backstory the UI/prompt layers accept

const PERSONALITY_BY_ID = new Map<string, CharacterPreset>(
  CHARACTER_PERSONALITIES.map((preset) => [preset.id, preset]),
)
const BACKSTORY_BY_ID = new Map<string, CharacterPreset>(
  CHARACTER_BACKSTORIES.map((preset) => [preset.id, preset]),
)

// Membership checks the normalizer uses to "keep only known" preset ids.
export const isKnownPersonalityId = (id: string): boolean => PERSONALITY_BY_ID.has(id)
export const isKnownBackstoryId = (id: string): boolean => BACKSTORY_BY_ID.has(id)

// Label lookups mirror `getInterestLabel`: the human label, or the id itself when unknown.
export const getPersonalityLabel = (id: string): string => PERSONALITY_BY_ID.get(id)?.label ?? id
export const getBackstoryLabel = (id: string): string => BACKSTORY_BY_ID.get(id)?.label ?? id
