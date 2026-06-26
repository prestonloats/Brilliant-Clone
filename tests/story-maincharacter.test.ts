// Main-character resolution (plan: custom main character).
//
// `resolveProtagonist` is the PURE seam `useStorySession.beginAdventure` calls before generating
// the story to decide the protagonist's name from `theme.mainCharacterSource`. These DOM-free
// `node --test` cases pin down each source, the graceful fall-backs, and the sanitize/cap so the
// controller behavior stays verifiable without a React harness.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StoryTheme } from '../src/domain'
import { MAX_CHARACTER_NAME_LEN } from '../src/story/characterPresets'
import { resolveProtagonist } from '../src/story/resolveMainCharacter'

// A minimal base theme; each test overrides the main-character fields it cares about. `premise`
// and `protagonist` are required by the type but irrelevant to resolution (the LLM fills them).
const baseTheme = (overrides: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['space', 'fashion'],
  premise: 'A young pilot maps an uncharted nebula.',
  protagonist: 'Captain Vega',
  ...overrides,
})

// --- source: 'displayName' ---------------------------------------------------

test("displayName source uses the signed-in user's display name as the protagonist", () => {
  const result = resolveProtagonist(baseTheme({ mainCharacterSource: 'displayName' }), 'Ada Lovelace')
  assert.equal(result.mainCharacterName, 'Ada Lovelace')
  assert.equal(result.protagonistOverride, 'Ada Lovelace')
})

test('displayName source sanitizes the display name (strips markup/urls/control)', () => {
  const result = resolveProtagonist(
    baseTheme({ mainCharacterSource: 'displayName' }),
    '  <b>Ada</b>\u0007 https://evil.example ',
  )
  // Markup, the URL, and control chars are stripped; the readable name survives, trimmed.
  assert.equal(result.mainCharacterName, 'Ada')
  assert.equal(result.protagonistOverride, 'Ada')
})

test('displayName source caps the name at MAX_CHARACTER_NAME_LEN', () => {
  const longName = 'A'.repeat(MAX_CHARACTER_NAME_LEN + 25)
  const result = resolveProtagonist(baseTheme({ mainCharacterSource: 'displayName' }), longName)
  assert.ok(result.mainCharacterName)
  assert.equal(result.mainCharacterName?.length, MAX_CHARACTER_NAME_LEN)
  assert.equal(result.protagonistOverride, result.mainCharacterName)
})

test('displayName source falls back to random when there is NO usable display name', () => {
  // Missing display name.
  assert.deepEqual(resolveProtagonist(baseTheme({ mainCharacterSource: 'displayName' }), undefined), {})
  // Empty / whitespace-only display name.
  assert.deepEqual(resolveProtagonist(baseTheme({ mainCharacterSource: 'displayName' }), '   '), {})
  // Sanitizes down to nothing (markup only) -> no override, leave it to the LLM.
  assert.deepEqual(resolveProtagonist(baseTheme({ mainCharacterSource: 'displayName' }), '<<>>'), {})
})

test('displayName source falls back to random when the display name is unsafe/profane', () => {
  assert.deepEqual(resolveProtagonist(baseTheme({ mainCharacterSource: 'displayName' }), 'shithead'), {})
})

// --- source: 'custom' --------------------------------------------------------

test('custom source uses the provided mainCharacterName', () => {
  const result = resolveProtagonist(
    baseTheme({ mainCharacterSource: 'custom', mainCharacterName: 'Robbie the Robot' }),
    'Ada Lovelace', // display name is ignored for the custom source
  )
  assert.equal(result.mainCharacterName, 'Robbie the Robot')
  assert.equal(result.protagonistOverride, 'Robbie the Robot')
})

test('custom source defensively re-sanitizes and caps the provided name', () => {
  const longName = 'Z'.repeat(MAX_CHARACTER_NAME_LEN + 10)
  const result = resolveProtagonist(
    baseTheme({ mainCharacterSource: 'custom', mainCharacterName: `  <i>${longName}</i>  ` }),
  )
  assert.ok(result.mainCharacterName)
  assert.equal(result.mainCharacterName?.length, MAX_CHARACTER_NAME_LEN)
  assert.equal(result.protagonistOverride, result.mainCharacterName)
})

test('custom source falls back to random when the name is missing/empty after sanitizing', () => {
  assert.deepEqual(resolveProtagonist(baseTheme({ mainCharacterSource: 'custom' }), 'Ada'), {})
  assert.deepEqual(
    resolveProtagonist(baseTheme({ mainCharacterSource: 'custom', mainCharacterName: '   ' }), 'Ada'),
    {},
  )
})

// --- source: 'random' / unset ------------------------------------------------

test('random source leaves the protagonist to the LLM (no name, no override)', () => {
  assert.deepEqual(resolveProtagonist(baseTheme({ mainCharacterSource: 'random' }), 'Ada Lovelace'), {})
})

test('unset source is treated as random (no name, no override)', () => {
  // Even a stray mainCharacterName is ignored unless the source explicitly selects it.
  assert.deepEqual(
    resolveProtagonist(baseTheme({ mainCharacterName: 'Ignored Name' }), 'Ada Lovelace'),
    {},
  )
})
