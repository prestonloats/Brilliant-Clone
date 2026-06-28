// Locks the PURE input validators extracted from InterestSelectionScreen.tsx into
// src/story/interestSelectionValidation.ts. The screen is React (no DOM/node test harness), so the
// teen-safety gate it shows inline — the custom-interest validator, the character-name validator,
// and the freeform fold — were pulled out so their exact messages + check ORDER can be pinned here.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_CHARACTER_NAME_LEN } from '../src/story/characterPresets'
import {
  foldCustomInterests,
  MAX_CUSTOM_INTEREST_LENGTH,
  MAX_FREEFORM_LENGTH,
  validateCharacterName,
  validateCustomInterest,
} from '../src/story/interestSelectionValidation'

// --- the shared caps are the single source of truth ------------------------------------------

test('the input caps match the values the UI + persistence layer expect', () => {
  assert.equal(MAX_CUSTOM_INTEREST_LENGTH, 40)
  assert.equal(MAX_FREEFORM_LENGTH, 80)
})

// --- validateCharacterName -------------------------------------------------------------------

test('validateCharacterName accepts a clean name and returns it sanitized/trimmed', () => {
  assert.deepEqual(validateCharacterName('Maya'), { name: 'Maya' })
  assert.deepEqual(validateCharacterName('  Captain Nova  '), { name: 'Captain Nova' })
  // Markup is stripped by the shared sanitizer before the name is accepted.
  assert.deepEqual(validateCharacterName('<b>Mara</b>'), { name: 'Mara' })
})

test('validateCharacterName rejects empty / whitespace / markup-only input', () => {
  assert.deepEqual(validateCharacterName('   '), { error: 'Enter a name using letters or numbers.' })
  assert.deepEqual(validateCharacterName('<>'), { error: 'Enter a name using letters or numbers.' })
})

test('validateCharacterName rejects profane and unsafe names', () => {
  assert.deepEqual(validateCharacterName('shit'), {
    error: 'That name isn’t allowed here — please choose another.',
  })
  assert.deepEqual(validateCharacterName('bomb'), {
    error: 'That name isn’t allowed here — please choose another.',
  })
})

test('validateCharacterName caps an over-long name to MAX_CHARACTER_NAME_LEN', () => {
  const result = validateCharacterName('a'.repeat(60))
  assert.ok('name' in result)
  assert.equal(result.name.length, MAX_CHARACTER_NAME_LEN)
})

// --- validateCustomInterest ------------------------------------------------------------------

test('validateCustomInterest accepts a clean interest and returns it sanitized', () => {
  assert.deepEqual(validateCustomInterest('dinosaurs', []), { value: 'dinosaurs' })
  assert.deepEqual(validateCustomInterest('  skateboarding  ', []), { value: 'skateboarding' })
  assert.deepEqual(validateCustomInterest('<b>dino</b>', []), { value: 'dino' })
})

test('validateCustomInterest rejects empty / markup-only input', () => {
  assert.deepEqual(validateCustomInterest('', []), { error: 'Enter an interest using letters or numbers.' })
  assert.deepEqual(validateCustomInterest('<>', []), { error: 'Enter an interest using letters or numbers.' })
})

test('validateCustomInterest rejects profane and unsafe interests', () => {
  const expected = { error: 'That interest isn’t allowed here — please choose another.' }
  assert.deepEqual(validateCustomInterest('shit', []), expected)
  assert.deepEqual(validateCustomInterest('bomb', []), expected)
})

test('validateCustomInterest rejects a case-insensitive duplicate', () => {
  assert.deepEqual(validateCustomInterest('Dinosaurs', ['dinosaurs']), {
    error: 'You’ve already added that interest.',
  })
})

test('validateCustomInterest rejects an addition that would overflow the freeform cap', () => {
  // existing(40) + ", "(2) + value(40) = 82 > 80.
  assert.deepEqual(validateCustomInterest('b'.repeat(40), ['a'.repeat(40)]), {
    error: 'That’s too long to add — remove one or shorten it.',
  })
})

test('validateCustomInterest runs its checks in order (duplicate before the length cap)', () => {
  // A 40-char value that is BOTH a duplicate AND would overflow returns the DUPLICATE error first,
  // matching the original inline check order in the component.
  const fortyAs = 'a'.repeat(40)
  assert.deepEqual(validateCustomInterest(fortyAs, [fortyAs]), {
    error: 'You’ve already added that interest.',
  })
})

// --- foldCustomInterests ---------------------------------------------------------------------

test('foldCustomInterests comma-joins the entries and re-sanitizes within the cap', () => {
  assert.equal(foldCustomInterests([]), '')
  assert.equal(foldCustomInterests(['dinosaurs', 'space']), 'dinosaurs, space')
  // The joined string is re-capped to the shared freeform bound.
  const folded = foldCustomInterests(['a'.repeat(50), 'b'.repeat(50)])
  assert.equal(folded.length, MAX_FREEFORM_LENGTH)
})
