import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend/validation'

// The new per-chapter performance fields must round-trip through persistence and stay back-compatible
// (omitted/empty/malformed cases drop the field rather than persisting `undefined`).

const base = (extra: Record<string, unknown>) => ({
  id: 'story-1',
  userId: 'u1',
  theme: { interestIds: [], premise: '', protagonist: '' },
  status: 'active',
  questionsSolvedTotal: 7,
  questionsSinceCheckpoint: 2,
  history: [],
  historyIndex: 0,
  servedStepIds: [],
  segments: [],
  narrativeSummary: '',
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z',
  schemaVersion: 2,
  ...extra,
})

test('normalizeStorySession preserves a well-formed chapterScore + lastChapterPerformance', () => {
  const s = normalizeStorySession(
    base({
      chapterScore: { firstTryCorrect: 3, answered: 4 },
      lastChapterPerformance: { band: 'strong', firstTryCorrect: 4, answered: 5 },
    }),
  )
  assert.ok(s)
  if (!s) return
  assert.deepEqual(s.chapterScore, { firstTryCorrect: 3, answered: 4 })
  assert.deepEqual(s.lastChapterPerformance, { band: 'strong', firstTryCorrect: 4, answered: 5 })
})

test('normalizeStorySession omits the fields for a legacy session (round-trips unchanged)', () => {
  const s = normalizeStorySession(base({}))
  assert.ok(s)
  if (!s) return
  assert.equal('chapterScore' in s, false)
  assert.equal('lastChapterPerformance' in s, false)
})

test('normalizeStorySession clamps counts and drops a malformed performance band', () => {
  const s = normalizeStorySession(
    base({
      chapterScore: { firstTryCorrect: 9, answered: 3 }, // correct > answered -> clamped to answered
      lastChapterPerformance: { band: 'bogus', firstTryCorrect: 1, answered: 2 },
    }),
  )
  assert.ok(s)
  if (!s) return
  assert.deepEqual(s.chapterScore, { firstTryCorrect: 3, answered: 3 })
  assert.equal('lastChapterPerformance' in s, false) // unknown band -> dropped
})

test('normalizeStorySession drops an empty (answered 0) chapterScore', () => {
  const s = normalizeStorySession(base({ chapterScore: { firstTryCorrect: 0, answered: 0 } }))
  assert.ok(s)
  if (!s) return
  assert.equal('chapterScore' in s, false)
})
