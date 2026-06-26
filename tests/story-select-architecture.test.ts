// Story Mode architecture selection proof (WAVE 3a).
//
// `selectNextArchitecture` is the question-bank analogue of `selectNextQuestion`, so this suite
// mirrors `story-selection.test.ts`: it proves the selector gates on completed lessons, returns
// null only when nothing is unlocked, serves only eligible architectures, respects the anti-repeat
// window and the on-screen `excludeKey` (never emptying a tiny pool), weights by mastery /
// recent-miss / skill-variety, and is deterministic given a seeded rng. The selector is pure, so
// minimal fixtures (real LessonId/SkillId values + the real catalog, with an injectable pool to pin
// pool size exactly) let us assert weighting and anti-repeat behavior precisely.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  type AttemptEvent,
  type LessonId,
  type LessonProgress,
  type SkillId,
  type SkillMastery,
} from '../src/domain'
import {
  ARCHITECTURE_CATALOG,
  architectureKey,
  mulberry32,
  selectNextArchitecture,
  type ProgressByLesson,
  type QuestionArchitecture,
  type SelectArchitectureInput,
} from '../src/engine'

// --- Fixtures -------------------------------------------------------------------------------

const ISO = '2026-06-25T00:00:00.000Z'

const completed = (lessonId: LessonId): LessonProgress => ({
  userId: 'u',
  lessonId,
  status: 'completed',
  currentStepIndex: 0,
  stepResults: {},
  startedAt: ISO,
  completedAt: ISO,
  updatedAt: ISO,
})

const makeMastery = (skillId: SkillId, score: number): SkillMastery => ({
  userId: 'u',
  skillId,
  score,
  attempts: 10,
  correct: Math.round(score * 10),
  lastPracticedAt: ISO,
})

// An attempt recorded against an architecture key (`arch:<id>` in `stepId`, matching how the story
// layer persists architecture questions). The `lessonId` is irrelevant to the selector's match.
const makeAttempt = (archKey: string, correct: boolean, at: string): AttemptEvent => ({
  id: `${archKey}:${at}`,
  userId: 'u',
  lessonId: 'one-step-equations',
  stepId: archKey,
  correct,
  attemptCount: 1,
  msToAnswer: 1000,
  at,
})

const byId = (id: string): QuestionArchitecture => {
  const found = ARCHITECTURE_CATALOG.find((architecture) => architecture.id === id)
  assert.ok(found, `architecture "${id}" not found in catalog`)
  return found
}

// Run the selector with sensible defaults (empty progress, full catalog, seeded rng=0), overriding
// only what each test cares about so the assertions stay focused.
const select = (over: Partial<SelectArchitectureInput>): QuestionArchitecture | null =>
  selectNextArchitecture({
    progressByLesson: {},
    servedKeys: [],
    rng: () => 0,
    ...over,
  })

// --- Empty / gating -------------------------------------------------------------------------

test('returns null when no required lessons are completed', () => {
  assert.equal(select({ progressByLesson: {} }), null)
  // Served history and a seeded rng do not conjure a candidate out of an empty progress map.
  assert.equal(
    select({ progressByLesson: {}, servedKeys: [architectureKey('one-step-linear')], rng: () => 0.5 }),
    null,
  )
})

test('serves only architectures whose required lesson is completed', () => {
  // Only one-step-equations is completed, so only its architectures may ever surface.
  const progressByLesson: ProgressByLesson = { 'one-step-equations': completed('one-step-equations') }
  const allowed = new Set(
    ARCHITECTURE_CATALOG.filter((architecture) => architecture.requiredLessonId === 'one-step-equations').map(
      (architecture) => architecture.id,
    ),
  )
  assert.ok(allowed.size >= 1)

  for (let i = 0; i < 100; i += 1) {
    const result = select({ progressByLesson, rng: () => i / 100 })
    assert.ok(result)
    assert.equal(result.requiredLessonId, 'one-step-equations')
    assert.ok(allowed.has(result.id))
  }
})

// --- Anti-repeat window + endless fallback --------------------------------------------------

test('avoids recently served architectures without emptying the pool', () => {
  const progressByLesson: ProgressByLesson = { 'one-step-equations': completed('one-step-equations') }
  // Eligible pool = {one-step-linear, one-step-sequence} (size 2 -> window N = min(1, 20) = 1).
  // one-step-linear served most recently, so one-step-sequence is the only fresh candidate.
  const served = [architectureKey('one-step-linear')]
  for (let i = 0; i < 30; i += 1) {
    const result = select({ progressByLesson, servedKeys: served, rng: () => i / 30 })
    assert.ok(result) // pool never emptied
    assert.equal(result.id, 'one-step-sequence')
  }
})

test('allows repeats once a tiny eligible pool has all been served', () => {
  const progressByLesson: ProgressByLesson = { 'one-step-equations': completed('one-step-equations') }
  // Single-architecture injected pool, served many times: the lone architecture repeats, never null.
  const result = select({
    pool: [byId('one-step-linear')],
    progressByLesson,
    servedKeys: [architectureKey('one-step-linear'), architectureKey('one-step-linear')],
    rng: () => 0.5,
  })
  assert.ok(result)
  assert.equal(result.id, 'one-step-linear')
})

// --- excludeKey (prefetch must skip the ON-SCREEN question) ---------------------------------

test('excludeKey removes the on-screen architecture from selection', () => {
  const progressByLesson: ProgressByLesson = { 'one-step-equations': completed('one-step-equations') }
  // Nothing served yet, but one-step-linear is on screen: it must never be re-picked, across rng.
  for (let i = 0; i < 30; i += 1) {
    const result = select({
      progressByLesson,
      excludeKey: architectureKey('one-step-linear'),
      rng: () => i / 30,
    })
    assert.ok(result)
    assert.notEqual(result.id, 'one-step-linear')
  }
})

test('excludeKey is honored on top of the anti-repeat window', () => {
  const progressByLesson: ProgressByLesson = { 'one-step-equations': completed('one-step-equations') }
  // one-step-sequence was just served (window avoids it) AND one-step-linear is on screen
  // (excludeKey). Stage-1 filtering empties, so relaxation drops recency but keeps excludeKey,
  // leaving only one-step-sequence.
  for (let i = 0; i < 30; i += 1) {
    const result = select({
      progressByLesson,
      servedKeys: [architectureKey('one-step-sequence')],
      excludeKey: architectureKey('one-step-linear'),
      rng: () => i / 30,
    })
    assert.ok(result)
    assert.equal(result.id, 'one-step-sequence')
  }
})

test('excludeKey never empties a tiny pool (a lone on-screen architecture can still repeat)', () => {
  const progressByLesson: ProgressByLesson = { 'one-step-equations': completed('one-step-equations') }
  const result = select({
    pool: [byId('one-step-linear')],
    progressByLesson,
    excludeKey: architectureKey('one-step-linear'),
    rng: () => 0.5,
  })
  assert.ok(result)
  assert.equal(result.id, 'one-step-linear')
})

// --- Weighting ------------------------------------------------------------------------------

test('weights struggling skills up and mastered skills down', () => {
  const linear = byId('one-step-linear') // skill: one-step-equations
  const line = byId('line-value') // skill: graphing-lines
  const progressByLesson: ProgressByLesson = {
    'one-step-equations': completed('one-step-equations'),
    'graphing-lines': completed('graphing-lines'),
  }
  // one-step-equations below threshold -> struggle x2; graphing-lines above -> mastered x0.75.
  // Pool order [linear, line]: weights [2, 0.75], total 2.75.
  const mastery = [makeMastery('one-step-equations', 0.2), makeMastery('graphing-lines', 0.9)]
  const args = { pool: [linear, line], progressByLesson, mastery }

  assert.equal(select({ ...args, rng: () => 0 })?.id, 'one-step-linear') // 0 -> [0, 2)
  assert.equal(select({ ...args, rng: () => 0.7 })?.id, 'one-step-linear') // 1.925 < 2
  assert.equal(select({ ...args, rng: () => 0.95 })?.id, 'line-value') // 2.6125 -> [2, 2.75)
})

test('boosts an architecture whose most recent attempt was incorrect', () => {
  const linear = byId('one-step-linear')
  const line = byId('line-value')
  const progressByLesson: ProgressByLesson = {
    'one-step-equations': completed('one-step-equations'),
    'graphing-lines': completed('graphing-lines'),
  }
  const mastery = [makeMastery('one-step-equations', 0.2), makeMastery('graphing-lines', 0.9)]
  const args = { pool: [linear, line], progressByLesson, mastery }

  // Baseline (no attempts): linear 2, line 0.75; rng 0.7 -> 1.925 < 2 -> linear.
  assert.equal(select({ ...args, rng: () => 0.7 })?.id, 'one-step-linear')

  // The MOST RECENT attempt for line-value is incorrect -> line x1.5 = 1.125 (total 3.125).
  // rng 0.7 -> 2.1875 lands in line-value's band, so the miss flips the pick.
  const attempts = [
    makeAttempt(architectureKey('line-value'), true, '2026-06-20T00:00:00.000Z'),
    makeAttempt(architectureKey('line-value'), false, '2026-06-24T00:00:00.000Z'),
  ]
  assert.equal(select({ ...args, attempts, rng: () => 0.7 })?.id, 'line-value')
})

test('downweights the skill of the immediately previous served architecture', () => {
  const linear = byId('one-step-linear') // skill: one-step-equations
  const sequence = byId('one-step-sequence') // skill: one-step-equations
  const line = byId('line-value') // skill: graphing-lines
  const progressByLesson: ProgressByLesson = {
    'one-step-equations': completed('one-step-equations'),
    'graphing-lines': completed('graphing-lines'),
  }
  // Pool [linear, sequence, line]; one-step-linear just served (previous skill = one-step-equations).
  // Anti-repeat removes linear; fresh = [sequence, line]. sequence shares the previous skill -> x0.6
  // => sequence 0.6, line 1.0 (total 1.6).
  const args = {
    pool: [linear, sequence, line],
    progressByLesson,
    servedKeys: [architectureKey('one-step-linear')],
  }

  // rng 0.3 -> 0.48 -> sequence band [0, 0.6).
  assert.equal(select({ ...args, rng: () => 0.3 })?.id, 'one-step-sequence')
  // rng 0.45 -> 0.72 -> line-value. Without the x0.6 penalty (weights 1,1 total 2) 0.45 -> 0.9 would
  // have stayed on sequence, so landing on line-value proves the same-skill variety penalty applies.
  assert.equal(select({ ...args, rng: () => 0.45 })?.id, 'line-value')
})

// --- Determinism ----------------------------------------------------------------------------

test('is deterministic given a seeded rng', () => {
  const progressByLesson: ProgressByLesson = {
    'one-step-equations': completed('one-step-equations'),
    'graphing-lines': completed('graphing-lines'),
  }
  const args = { progressByLesson, servedKeys: [architectureKey('line-value')] }
  for (const seed of [1, 2, 3, 42, 9999]) {
    const a = selectNextArchitecture({ ...args, rng: mulberry32(seed) })
    const b = selectNextArchitecture({ ...args, rng: mulberry32(seed) })
    assert.ok(a && b)
    assert.equal(a.id, b.id)
  }
})
