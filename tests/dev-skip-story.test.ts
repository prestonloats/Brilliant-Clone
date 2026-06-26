import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isStoryDevSkipDisabled, shouldShowStoryDevSkip } from '../src/story/devSkip'

// Pins the PURE gate/disabled logic behind the developer-only "skip = correct" control on the
// Story Mode question screen. The control is offered ONLY for the LIVE question (never during
// review or chapter text) and shares the AI-generation "busy" lock so it cannot double-fire.

// All eight {devEnabled, reviewing, showingChapterText} combinations, with the single visible case.
const showCases: Array<{
  input: { devEnabled: boolean; reviewing: boolean; showingChapterText: boolean }
  expected: boolean
}> = [
  { input: { devEnabled: true, reviewing: false, showingChapterText: false }, expected: true },
  { input: { devEnabled: true, reviewing: false, showingChapterText: true }, expected: false },
  { input: { devEnabled: true, reviewing: true, showingChapterText: false }, expected: false },
  { input: { devEnabled: true, reviewing: true, showingChapterText: true }, expected: false },
  { input: { devEnabled: false, reviewing: false, showingChapterText: false }, expected: false },
  { input: { devEnabled: false, reviewing: false, showingChapterText: true }, expected: false },
  { input: { devEnabled: false, reviewing: true, showingChapterText: false }, expected: false },
  { input: { devEnabled: false, reviewing: true, showingChapterText: true }, expected: false },
]

test('shouldShowStoryDevSkip is true ONLY for the live question with dev enabled', () => {
  for (const { input, expected } of showCases) {
    assert.equal(shouldShowStoryDevSkip(input), expected, JSON.stringify(input))
  }
  // Exactly one of the eight combinations is visible.
  assert.equal(showCases.filter(({ expected }) => expected).length, 1)
})

test('shouldShowStoryDevSkip returns true for { devEnabled:true, reviewing:false, showingChapterText:false }', () => {
  assert.equal(shouldShowStoryDevSkip({ devEnabled: true, reviewing: false, showingChapterText: false }), true)
})

test('shouldShowStoryDevSkip returns false when devEnabled is false (regardless of the others)', () => {
  assert.equal(shouldShowStoryDevSkip({ devEnabled: false, reviewing: false, showingChapterText: false }), false)
  assert.equal(shouldShowStoryDevSkip({ devEnabled: false, reviewing: false, showingChapterText: true }), false)
  assert.equal(shouldShowStoryDevSkip({ devEnabled: false, reviewing: true, showingChapterText: false }), false)
  assert.equal(shouldShowStoryDevSkip({ devEnabled: false, reviewing: true, showingChapterText: true }), false)
})

test('shouldShowStoryDevSkip returns false when reviewing is true (even with devEnabled true, showingChapterText false)', () => {
  assert.equal(shouldShowStoryDevSkip({ devEnabled: true, reviewing: true, showingChapterText: false }), false)
})

test('shouldShowStoryDevSkip returns false when showingChapterText is true (even with devEnabled true, reviewing false)', () => {
  assert.equal(shouldShowStoryDevSkip({ devEnabled: true, reviewing: false, showingChapterText: true }), false)
})

test('isStoryDevSkipDisabled is true while busy and false otherwise', () => {
  assert.equal(isStoryDevSkipDisabled({ busy: true }), true)
  assert.equal(isStoryDevSkipDisabled({ busy: false }), false)
})
