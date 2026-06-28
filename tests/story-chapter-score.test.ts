import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StorySession, StoryTheme } from '../src/domain'
import {
  captureChapterPerformance,
  chapterPerformanceBand,
  createInitialSession,
  recordChapterAttempt,
  resetCheckpoint,
} from '../src/story/storySessionReducer'

// The per-chapter first-try performance tally + its band classification, which drive Story Mode's
// "your math shaped the story" consequence. Pure transitions, unit-testable without a DOM.

const ISO = '2026-06-25T00:00:00.000Z'

const theme = (): StoryTheme => ({
  interestIds: ['space'],
  premise: 'A lone navigator charts a living nebula.',
  protagonist: 'Captain Vega',
})

const fresh = (): StorySession => createInitialSession(theme(), 'user-1', ISO, 'story-1')

test('recordChapterAttempt accumulates the first-try tally (correct + answered)', () => {
  let s = fresh()
  assert.equal(s.chapterScore, undefined)
  s = recordChapterAttempt(s, true)
  s = recordChapterAttempt(s, false)
  s = recordChapterAttempt(s, true)
  assert.deepEqual(s.chapterScore, { firstTryCorrect: 2, answered: 3 })
})

test('resetCheckpoint clears the per-chapter tally (key removed, not undefined)', () => {
  let s = recordChapterAttempt(fresh(), true)
  assert.deepEqual(s.chapterScore, { firstTryCorrect: 1, answered: 1 })
  s = resetCheckpoint(s)
  assert.equal('chapterScore' in s, false)
})

test('chapterPerformanceBand maps a full 5-question chapter to the expected bands', () => {
  assert.equal(chapterPerformanceBand(5, 5), 'flawless')
  assert.equal(chapterPerformanceBand(4, 5), 'strong')
  assert.equal(chapterPerformanceBand(3, 5), 'mixed')
  assert.equal(chapterPerformanceBand(2, 5), 'mixed')
  assert.equal(chapterPerformanceBand(1, 5), 'struggled')
  assert.equal(chapterPerformanceBand(0, 5), 'struggled')
})

test('chapterPerformanceBand is ratio-based for short chapters and guards an empty chapter', () => {
  assert.equal(chapterPerformanceBand(0, 0), 'mixed') // no attempts -> neutral default
  assert.equal(chapterPerformanceBand(2, 2), 'flawless') // all correct
  assert.equal(chapterPerformanceBand(1, 2), 'mixed') // 0.5
  assert.equal(chapterPerformanceBand(1, 3), 'struggled') // 0.33
})

test('captureChapterPerformance snapshots the tally into lastChapterPerformance', () => {
  let s = fresh()
  for (const correct of [true, true, true, true, false]) s = recordChapterAttempt(s, correct) // 4/5
  s = captureChapterPerformance(s)
  assert.deepEqual(s.lastChapterPerformance, { band: 'strong', firstTryCorrect: 4, answered: 5 })
  // capture does NOT clear the tally; resetCheckpoint does that afterward.
  assert.deepEqual(s.chapterScore, { firstTryCorrect: 4, answered: 5 })
})

test('captureChapterPerformance yields a neutral band when no attempts were recorded', () => {
  const s = captureChapterPerformance(fresh())
  assert.deepEqual(s.lastChapterPerformance, { band: 'mixed', firstTryCorrect: 0, answered: 0 })
})

test('the chapter-score transitions never mutate their input session', () => {
  const s = recordChapterAttempt(fresh(), true)
  const snapshot = JSON.parse(JSON.stringify(s))
  recordChapterAttempt(s, false)
  captureChapterPerformance(s)
  resetCheckpoint(s)
  assert.deepEqual(JSON.parse(JSON.stringify(s)), snapshot)
})
