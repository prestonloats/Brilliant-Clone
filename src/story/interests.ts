// The fixed interest catalog the learner picks from, plus tiny lookups.
//
// Extracted into a React-free `.ts` module (out of `InterestSelectionScreen.tsx`) so BOTH the
// selection screen and the saved-stories library can share one source of truth for labels and
// emojis, and so the lookups can be unit-tested under `node --test` (the test build only
// transpiles `.ts`, not `.tsx`).

import type { StoryInterest, StoryInterestId } from '../domain'

export const INTEREST_CATALOG: StoryInterest[] = [
  { id: 'space', label: 'Sci-fi', emoji: '🛸' },
  { id: 'fantasy', label: 'Fantasy quests', emoji: '🐉' },
  { id: 'mystery', label: 'Mystery & detectives', emoji: '🔍' },
  { id: 'sports', label: 'Sports & competition', emoji: '⚽' },
  { id: 'animals', label: 'Animals & wildlife', emoji: '🦊' },
  { id: 'pirates', label: 'Pirates & treasure', emoji: '🏴‍☠️' },
  { id: 'cooking', label: 'Cooking & baking', emoji: '🍳' },
  { id: 'fashion', label: 'Fashion & design', emoji: '👗' },
]

const BY_ID = new Map<StoryInterestId, StoryInterest>(INTEREST_CATALOG.map((interest) => [interest.id, interest]))

// Groundedness of each interest's WORLD. A few interests are inherently IMAGINATIVE — their worlds
// involve magic or far-future tech — so they justify inventing a fictional world. Every other
// interest is an everyday, real-world hobby/place (sports, mystery, cooking, animals, pirates,
// fashion) that should stay grounded in reality unless paired with an imaginative interest. The
// story prompts read this to decide whether to invent a fantastical world or keep a believable
// real-world setting (so e.g. a "sports"-only story never becomes the made-up kingdom "Sportania").
// Additive only — it does not change INTEREST_CATALOG entries or the StoryInterest type.
export const IMAGINATIVE_INTEREST_IDS: ReadonlySet<StoryInterestId> = new Set<StoryInterestId>(['space', 'fantasy'])

// Whether a single interest's world is inherently imaginative (fantasy/sci-fi) vs grounded.
export const isImaginativeInterest = (id: StoryInterestId): boolean => IMAGINATIVE_INTEREST_IDS.has(id)

// True when the CHOSEN catalog interests are ALL grounded (none imaginative). Per product intent,
// freeform interest text does NOT flip this, and an empty set (no imaginative interest) is grounded.
export const isGroundedInterestSet = (ids: readonly StoryInterestId[]): boolean => !ids.some(isImaginativeInterest)

// A neutral default so the library always has a glyph even for empty/unknown themes.
export const DEFAULT_STORY_EMOJI = '📖'

export const getInterestLabel = (id: StoryInterestId): string => BY_ID.get(id)?.label ?? id

// Emoji for a single interest id (default book glyph when unknown).
export const getInterestEmoji = (id: StoryInterestId): string => BY_ID.get(id)?.emoji ?? DEFAULT_STORY_EMOJI
