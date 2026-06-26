import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LessonStep } from '../src/domain'
import { DEV_SKIP_FEEDBACK, buildDevSkipCompletion, shouldShowLessonDevSkip } from '../src/lesson/devSkip'

// Pin the PURE helper behind the developer-only "skip this question and count it correct" control
// in the regular lesson player. `buildDevSkipCompletion` reads ONLY `step.type`, so the fixtures
// here are minimal casts, and `shouldShowLessonDevSkip` is a tiny boolean gate -- all DOM-free.

// buildDevSkipCompletion only ever reads `step.type`, so a minimal cast is a sufficient fixture.
const stepOfType = (type: LessonStep['type']): LessonStep => ({ type }) as unknown as LessonStep

// Every non-'concept' variant of LessonStep is a graded question.
const GRADED_STEP_TYPES: LessonStep['type'][] = [
  'mcq',
  'input',
  'operation-choice',
  'sequence',
  'balance',
  'manipulative',
  'plot',
  'slider',
  'dragTerms',
]

test('DEV_SKIP_FEEDBACK is the exported skip marker', () => {
  assert.equal(DEV_SKIP_FEEDBACK, 'Skipped (dev tools)')
})

test('skipping a concept card advances without recording an attempt (not graded)', () => {
  assert.deepEqual(buildDevSkipCompletion(stepOfType('concept')), {
    correct: true,
    feedback: 'Skipped (dev tools)',
    options: { advance: true, recordAttempt: false },
  })
})

test('skipping any graded step counts it correct, advances, and records the attempt', () => {
  for (const type of GRADED_STEP_TYPES) {
    assert.deepEqual(
      buildDevSkipCompletion(stepOfType(type)),
      { correct: true, feedback: DEV_SKIP_FEEDBACK, options: { advance: true, recordAttempt: true } },
      `graded step "${type}" should record a correct, advancing attempt`,
    )
  }
})

test('shouldShowLessonDevSkip is true only when dev tools are on and not reviewing', () => {
  assert.equal(shouldShowLessonDevSkip({ devEnabled: true, isReviewing: false }), true)
  assert.equal(shouldShowLessonDevSkip({ devEnabled: true, isReviewing: true }), false)
  assert.equal(shouldShowLessonDevSkip({ devEnabled: false, isReviewing: false }), false)
  assert.equal(shouldShowLessonDevSkip({ devEnabled: false, isReviewing: true }), false)
})
