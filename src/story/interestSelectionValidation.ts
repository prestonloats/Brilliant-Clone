// PURE input-validation helpers for the Interest Selection screen (extracted from
// InterestSelectionScreen.tsx). React-free so the same teen-safety gate the screen shows inline can
// be unit-tested under `node --test` (the repo has no DOM/React test harness). The component keeps
// all state/JSX; it just dispatches setState based on these pure results.

import { containsProfanity, containsUnsafeContent, sanitizeUserInput } from './safety'
import { MAX_CHARACTER_NAME_LEN } from './characterPresets'

// Cap for the single freeformInterest string the persistence layer enforces (validation.ts).
// The added custom-interest boxes are comma-joined into this one field on submit, so the
// combined join must stay within this bound.
export const MAX_FREEFORM_LENGTH = 80
// The per-box input cap for a custom interest. Small caps keep the comma-joined freeformInterest
// within MAX_FREEFORM_LENGTH and the UI tidy.
export const MAX_CUSTOM_INTEREST_LENGTH = 40

// Validate ONE typed custom interest against the already-added ones. Sanitizes + caps to
// MAX_CUSTOM_INTEREST_LENGTH, then (in order) rejects empty / profane-or-unsafe / case-insensitive
// duplicate / over-the-shared-freeform-cap text. Returns the sanitized `value` on success or the
// first matching `error` message. Pure: the dedup/length checks read the passed `existing` snapshot.
export const validateCustomInterest = (
  draft: string,
  existing: string[],
): { value: string } | { error: string } => {
  const value = sanitizeUserInput(draft, MAX_CUSTOM_INTEREST_LENGTH)
  if (!value) {
    return { error: 'Enter an interest using letters or numbers.' }
  }
  if (containsProfanity(value) || containsUnsafeContent(value)) {
    return { error: 'That interest isn’t allowed here — please choose another.' }
  }
  if (existing.some((item) => item.toLowerCase() === value.toLowerCase())) {
    return { error: 'You’ve already added that interest.' }
  }
  if ([...existing, value].join(', ').length > MAX_FREEFORM_LENGTH) {
    return { error: 'That’s too long to add — remove one or shorten it.' }
  }
  return { value }
}

// Teen-safety gate shared by character names and the custom main-character name: sanitize +
// cap to MAX_CHARACTER_NAME_LEN, then reject empty/profane/unsafe text. The persistence layer
// re-sanitizes, but enforcing it here gives the learner immediate, inline feedback.
export const validateCharacterName = (raw: string): { name: string } | { error: string } => {
  const name = sanitizeUserInput(raw, MAX_CHARACTER_NAME_LEN)
  if (!name) return { error: 'Enter a name using letters or numbers.' }
  if (containsProfanity(name) || containsUnsafeContent(name)) {
    return { error: 'That name isn’t allowed here — please choose another.' }
  }
  return { name }
}

// Fold the added custom-interest boxes into the single freeformInterest string (UI-only):
// comma-join the already-sanitized entries and re-sanitize within the shared cap.
export const foldCustomInterests = (customInterests: string[]): string =>
  sanitizeUserInput(customInterests.join(', '), MAX_FREEFORM_LENGTH)
