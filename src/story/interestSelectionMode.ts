// Classifies a StoryTheme's interest selection into a single, stable "mode" describing HOW the
// learner picked their interests: how many fixed-catalog interests they chose (single / pair /
// triple / none) and whether they also added custom free text (suggestedPlusCustom / customOnly).
//
// Kept React-free (like its sibling `interests.ts` / `scenery.ts`) so the UI, the prompt builders,
// and any analytics/persistence layer can branch on ONE source of truth — and the rules can be
// unit-tested under `node --test`. It reads only the two interest fields of a theme, so callers
// can pass a partial theme before the LLM-derived fields (premise/protagonist) exist.

import type { StoryTheme } from '../content/storyTypes'

export type InterestSelectionMode =
  | 'single'
  | 'pair'
  | 'triple'
  | 'none'
  | 'suggestedPlusCustom'
  | 'customOnly'

export function interestSelectionMode(
  theme: Pick<StoryTheme, 'interestIds' | 'freeformInterest'>,
): InterestSelectionMode {
  const n = theme.interestIds.length
  // Custom free text only counts when it has non-whitespace content; '', '   ', etc. are "absent".
  const custom = !!theme.freeformInterest && theme.freeformInterest.trim().length > 0

  if (custom) {
    // Any number of suggested interests alongside custom text is a blend; custom text alone is
    // the custom-only path.
    return n >= 1 ? 'suggestedPlusCustom' : 'customOnly'
  }

  // No custom text: the count of suggested interests decides the mode (3+ clamps to 'triple').
  if (n === 0) return 'none'
  if (n === 1) return 'single'
  if (n === 2) return 'pair'
  return 'triple'
}
