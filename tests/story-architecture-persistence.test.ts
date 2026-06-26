// Story Mode question-architecture persistence proof (WAVE 1 foundation).
//
// WAVE 1 adds two OPTIONAL, back-compatible fields to a persisted `ThemedQuestion` so the new
// code-authoritative question-architecture bank can round-trip through storage:
//   - `architectureId`: the stable id of the architecture that produced the question (its
//     persisted identity + anti-repeat key); kept only when it is a non-empty string.
//   - `paramSeed`: the uint32 seed that rebuilds the EXACT filled instance + key; kept only when
//     it is a non-negative integer, mirroring how `variantSeed` is repaired.
// These tests drive the REAL `normalizeStorySession` (which runs the internal
// `normalizeThemedQuestion` on `currentQuestion` AND every `history` entry) and prove: valid
// fields round-trip unchanged, bad values are dropped while the question itself survives, and a
// legacy question carrying neither field normalizes exactly as before (no new keys injected).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend'

// A minimal, fully-valid themed question (no architecture fields yet). Real architecture
// questions keep `sourceLessonId`/`sourceStepId`/`stepType` populated (sourceStepId = `arch:<id>`),
// so a persisted entry always satisfies the existing required-field guards.
const baseQuestion = {
  sourceLessonId: 'one-step-equations' as const,
  sourceStepId: 'arch:one-step-add-basic',
  stepType: 'input' as const,
  themedPrompt: 'Captain Vega balances the airlock: solve x + 3 = 8.',
  themed: true,
  generatedAt: '2026-06-25T00:00:00.000Z',
}
const base = { id: 'story-arch', userId: 'user-1' }

// Normalize a single question through the real session normalizer and hand back the session
// (asserting it survived). With no `history` supplied, the normalizer seeds a one-entry history
// from `currentQuestion`, so `history[0]` mirrors the normalized question too.
const normalizeQuestion = (question: Record<string, unknown>) => {
  const session = normalizeStorySession({ ...base, currentQuestion: question })
  assert.ok(session, 'session should normalize')
  return session
}

test('a valid architectureId + paramSeed round-trips unchanged', () => {
  const session = normalizeQuestion({
    ...baseQuestion,
    architectureId: 'one-step-add-basic',
    paramSeed: 123456,
  })
  assert.equal(session.currentQuestion?.architectureId, 'one-step-add-basic')
  assert.equal(session.currentQuestion?.paramSeed, 123456)
  // The history mirror (seeded from currentQuestion) carries the fields too.
  assert.equal(session.history[0]?.architectureId, 'one-step-add-basic')
  assert.equal(session.history[0]?.paramSeed, 123456)
})

test('paramSeed = 0 is a valid seed and is preserved', () => {
  const session = normalizeQuestion({
    ...baseQuestion,
    architectureId: 'one-step-add-basic',
    paramSeed: 0,
  })
  assert.equal(session.currentQuestion?.paramSeed, 0)
  assert.equal('paramSeed' in (session.currentQuestion ?? {}), true)
})

test('architectureId and paramSeed are independent (one present, one absent)', () => {
  const onlyId = normalizeQuestion({ ...baseQuestion, architectureId: 'arch-x' })
  assert.equal(onlyId.currentQuestion?.architectureId, 'arch-x')
  assert.equal('paramSeed' in (onlyId.currentQuestion ?? {}), false)

  const onlySeed = normalizeQuestion({ ...baseQuestion, paramSeed: 7 })
  assert.equal(onlySeed.currentQuestion?.paramSeed, 7)
  assert.equal('architectureId' in (onlySeed.currentQuestion ?? {}), false)
})

test('bad paramSeed values are dropped while the question survives', () => {
  for (const badSeed of [-1, 1.5, Number.NaN, 'x', null, Infinity, -Infinity]) {
    const session = normalizeQuestion({
      ...baseQuestion,
      architectureId: 'one-step-add-basic',
      paramSeed: badSeed,
    })
    assert.ok(session.currentQuestion, `question should survive a bad paramSeed ${String(badSeed)}`)
    assert.equal(
      'paramSeed' in (session.currentQuestion ?? {}),
      false,
      `paramSeed ${String(badSeed)} should have been dropped`,
    )
    // A valid sibling field is left untouched by the bad seed.
    assert.equal(session.currentQuestion?.architectureId, 'one-step-add-basic')
  }
})

test('empty or non-string architectureId is dropped while the question survives', () => {
  for (const badId of ['', 0, 123, null, true]) {
    const session = normalizeQuestion({
      ...baseQuestion,
      architectureId: badId,
      paramSeed: 9,
    })
    assert.ok(session.currentQuestion, `question should survive a bad architectureId ${String(badId)}`)
    assert.equal(
      'architectureId' in (session.currentQuestion ?? {}),
      false,
      `architectureId ${String(badId)} should have been dropped`,
    )
    // A valid sibling field is left untouched by the bad id.
    assert.equal(session.currentQuestion?.paramSeed, 9)
  }
})

test('a legacy question (no architecture fields) normalizes exactly as before', () => {
  const session = normalizeQuestion({ ...baseQuestion })
  const question = session.currentQuestion
  assert.ok(question)
  assert.equal('architectureId' in question, false, 'no architectureId should be injected')
  assert.equal('paramSeed' in question, false, 'no paramSeed should be injected')
  // Round-trip identity on exactly the legacy fields (adds/drops nothing).
  assert.deepEqual(question, {
    sourceLessonId: 'one-step-equations',
    sourceStepId: 'arch:one-step-add-basic',
    stepType: 'input',
    themedPrompt: baseQuestion.themedPrompt,
    themed: true,
    generatedAt: baseQuestion.generatedAt,
  })
})
