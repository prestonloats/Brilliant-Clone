import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  lessons,
  type AttemptEvent,
  type Lesson,
  type LessonId,
  type LessonProgress,
  type LessonStep,
  type SkillId,
  type SkillMastery,
} from '../src/domain'
import {
  selectNextQuestion,
  storyCandidateKey,
  type ProgressByLesson,
  type SelectNextInput,
  type StoryCandidate,
} from '../src/engine'

// --- Fixtures -------------------------------------------------------------------------------
//
// The selection algorithm is pure, so these minimal hand-built lessons (modeled on
// tests/helpers/fixtures.ts) let us pin down weighting and anti-repeat behavior exactly. Real
// LessonId/SkillId values are reused so everything type-checks against the content model, and a
// final test exercises the actual bundled content catalog.

const ISO = '2026-06-23T00:00:00.000Z'

const inputStep = (id: string): LessonStep => ({
  id,
  type: 'input',
  prompt: `Solve ${id}`,
  accept: ['1'],
  feedback: { correct: 'Yes.', incorrect: 'No.', reveal: 'It is 1.' },
})

const mcqStep = (id: string): LessonStep => ({
  id,
  type: 'mcq',
  prompt: `Pick ${id}`,
  options: [
    { id: 'a', label: 'A', feedback: 'fa' },
    { id: 'b', label: 'B', feedback: 'fb' },
  ],
  correctId: 'a',
})

const operationChoiceStep = (id: string): LessonStep => ({
  id,
  type: 'operation-choice',
  prompt: `Choose ${id}`,
  choices: [
    { id: 'a', label: 'A', feedback: 'fa' },
    { id: 'b', label: 'B', feedback: 'fb' },
  ],
  correctId: 'a',
  feedback: { correct: 'Yes.', incorrect: 'No.', reveal: 'Pick A.' },
})

const sequenceStep = (id: string): LessonStep => ({
  id,
  type: 'sequence',
  prompt: `Order ${id}`,
  tiles: [
    { id: 'one', label: 'One' },
    { id: 'two', label: 'Two' },
  ],
  correctOrder: ['one', 'two'],
  feedback: { correct: 'Yes.', incorrect: 'No.', incomplete: 'Keep going.', reveal: 'One then Two.' },
})

const conceptStep = (id: string): LessonStep => ({
  id,
  type: 'concept',
  title: `Concept ${id}`,
  body: 'Body.',
})

const balanceStep = (id: string): LessonStep => ({
  id,
  type: 'balance',
  prompt: `Balance ${id}`,
  state: { left: [], right: [] },
  goal: { type: 'level' },
  feedback: { correct: 'Level.', hints: [{ when: 'default', text: 'Try.' }], reveal: 'Make it level.' },
})

const manipulativeStep = (id: string): LessonStep => ({
  id,
  type: 'manipulative',
  prompt: `Group ${id}`,
  total: 6,
  object: { label: 'apple' },
  goal: { type: 'collect', count: 3 },
  feedback: { correct: 'Yes.', incorrect: 'No.', reveal: 'Collect 3.' },
})

const plotStep = (id: string): LessonStep => ({
  id,
  type: 'plot',
  prompt: `Plot ${id}`,
  range: { min: -3, max: 3 },
  target: { kind: 'points', points: [{ x: 1, y: 1 }] },
  feedback: { correct: 'Yes.', incorrect: 'No.', reveal: 'Plot (1, 1).' },
})

const sliderStep = (id: string): LessonStep => ({
  id,
  type: 'slider',
  prompt: `Match ${id}`,
  slope: { min: -5, max: 5 },
  intercept: { min: -5, max: 5 },
  target: { slope: 2, intercept: 1 },
  range: { min: -6, max: 6 },
  feedback: { correct: 'Yes.', incorrect: 'No.', reveal: 'm = 2, b = 1.' },
})

const dragTermsStep = (id: string): LessonStep => ({
  id,
  type: 'dragTerms',
  prompt: `Sort ${id}`,
  tiles: [{ id: 't1', label: '3x', bin: 'x' }],
  bins: [{ id: 'x', label: 'x-terms' }],
  feedback: { correct: 'Yes.', incorrect: 'No.', reveal: '3x is an x-term.' },
})

const makeLesson = (id: LessonId, steps: LessonStep[], skillIds: SkillId[] = []): Lesson => ({
  id,
  title: id,
  subtitle: '',
  skillIds,
  prerequisites: [],
  steps,
})

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

const makeAttempt = (lessonId: LessonId, stepId: string, correct: boolean, at: string): AttemptEvent => ({
  id: `${lessonId}:${stepId}:${at}`,
  userId: 'u',
  lessonId,
  stepId,
  correct,
  attemptCount: 1,
  msToAnswer: 1000,
  at,
})

// Run the selector with sensible defaults (empty progress/signals, real catalog, seeded rng=0),
// overriding only what each test cares about so the assertions stay focused.
const select = (over: Partial<SelectNextInput>): StoryCandidate | null =>
  selectNextQuestion({
    progressByLesson: {},
    lessonCatalog: lessons,
    lessonOrder: algebraCourse.lessonOrder,
    mastery: [],
    attempts: [],
    servedStepIds: [],
    rng: () => 0,
    ...over,
  })

// --- Empty / insufficient pool --------------------------------------------------------------

test('returns null when no lessons are completed', () => {
  const result = select({ progressByLesson: {} })
  assert.equal(result, null)
})

test('returns null when completed lessons have no rethemable steps', () => {
  const catalog: Record<LessonId, Lesson> = {
    ...lessons,
    'balancing-equations': makeLesson('balancing-equations', [
      conceptStep('intro'),
      balanceStep('scale'),
      plotStep('graph'),
    ]),
  }
  const result = select({
    lessonCatalog: catalog,
    lessonOrder: ['balancing-equations'],
    progressByLesson: { 'balancing-equations': completed('balancing-equations') },
  })
  assert.equal(result, null)
})

// --- Completed-only filtering ---------------------------------------------------------------

test('draws only from completed lessons', () => {
  const catalog: Record<LessonId, Lesson> = {
    ...lessons,
    'balancing-equations': makeLesson('balancing-equations', [inputStep('a1')]),
    'one-step-equations': makeLesson('one-step-equations', [inputStep('b1')]),
  }
  const order: LessonId[] = ['balancing-equations', 'one-step-equations']
  // Only the first lesson is completed; the second must never appear in the pool.
  const progressByLesson: ProgressByLesson = { 'balancing-equations': completed('balancing-equations') }

  for (let i = 0; i < 50; i += 1) {
    const result = select({ lessonCatalog: catalog, lessonOrder: order, progressByLesson, rng: () => i / 50 })
    assert.ok(result)
    assert.equal(result.lessonId, 'balancing-equations')
    assert.equal(result.step.id, 'a1')
  }
})

// --- Rethemable type filtering --------------------------------------------------------------

test('keeps only the four rethemable assessed step types', () => {
  const everyType = makeLesson('balancing-equations', [
    conceptStep('c'),
    inputStep('in'),
    mcqStep('mc'),
    operationChoiceStep('op'),
    sequenceStep('sq'),
    balanceStep('ba'),
    manipulativeStep('ma'),
    plotStep('pl'),
    sliderStep('sl'),
    dragTermsStep('dt'),
  ])
  const catalog: Record<LessonId, Lesson> = { ...lessons, 'balancing-equations': everyType }
  const order: LessonId[] = ['balancing-equations']
  const progressByLesson: ProgressByLesson = { 'balancing-equations': completed('balancing-equations') }

  const seenIds = new Set<string>()
  const seenTypes = new Set<string>()
  // Equal base weights (no mastery records), so scanning rng across [0, 1) reaches every
  // candidate left in the pool.
  for (let i = 0; i < 200; i += 1) {
    const result = select({ lessonCatalog: catalog, lessonOrder: order, progressByLesson, rng: () => i / 200 })
    assert.ok(result)
    seenIds.add(result.step.id)
    seenTypes.add(result.step.type)
  }

  assert.deepEqual([...seenIds].sort(), ['in', 'mc', 'op', 'sq'])
  assert.deepEqual([...seenTypes].sort(), ['input', 'mcq', 'operation-choice', 'sequence'])
})

// --- Anti-repeat window + endless fallback --------------------------------------------------

test('avoids recently served questions without emptying the pool', () => {
  const lesson = makeLesson('balancing-equations', [
    inputStep('q1'),
    inputStep('q2'),
    inputStep('q3'),
    inputStep('q4'),
  ])
  const catalog: Record<LessonId, Lesson> = { ...lessons, 'balancing-equations': lesson }
  const order: LessonId[] = ['balancing-equations']
  const progressByLesson: ProgressByLesson = { 'balancing-equations': completed('balancing-equations') }

  // pool size 4 -> window N = min(3, 20) = 3. The last 3 served are q1/q2/q3, so only q4 is fresh.
  const served = ['balancing-equations:q1', 'balancing-equations:q2', 'balancing-equations:q3']
  for (let i = 0; i < 20; i += 1) {
    const result = select({ lessonCatalog: catalog, lessonOrder: order, progressByLesson, servedStepIds: served, rng: () => i / 20 })
    assert.ok(result) // pool never emptied
    assert.equal(result.step.id, 'q4')
  }

  // Only the most recent N=3 keys matter: an older q4 entry is outside the window, so q4 is the
  // single fresh candidate again.
  const servedWindow = [
    'balancing-equations:q4',
    'balancing-equations:q1',
    'balancing-equations:q2',
    'balancing-equations:q3',
  ]
  const windowed = select({ lessonCatalog: catalog, lessonOrder: order, progressByLesson, servedStepIds: servedWindow, rng: () => 0.99 })
  assert.ok(windowed)
  assert.equal(windowed.step.id, 'q4')
})

test('allows repeats endlessly once everything has been served', () => {
  // Two-question pool, both served (q2 most recent): avoid the most recent, resurface the older.
  const twoStep = makeLesson('balancing-equations', [inputStep('q1'), inputStep('q2')])
  const catalogTwo: Record<LessonId, Lesson> = { ...lessons, 'balancing-equations': twoStep }
  const order: LessonId[] = ['balancing-equations']
  const progressByLesson: ProgressByLesson = { 'balancing-equations': completed('balancing-equations') }
  const served = ['balancing-equations:q1', 'balancing-equations:q2']
  for (let i = 0; i < 20; i += 1) {
    const result = select({ lessonCatalog: catalogTwo, lessonOrder: order, progressByLesson, servedStepIds: served, rng: () => i / 20 })
    assert.ok(result)
    assert.equal(result.step.id, 'q1') // a repeat of an older question, never null
  }

  // Single-question pool: the lone step repeats forever even after being served many times.
  const oneStep = makeLesson('balancing-equations', [inputStep('solo')])
  const catalogOne: Record<LessonId, Lesson> = { ...lessons, 'balancing-equations': oneStep }
  const repeated = select({
    lessonCatalog: catalogOne,
    lessonOrder: order,
    progressByLesson,
    servedStepIds: ['balancing-equations:solo', 'balancing-equations:solo', 'balancing-equations:solo'],
    rng: () => 0.5,
  })
  assert.ok(repeated)
  assert.equal(repeated.step.id, 'solo')
  assert.equal(storyCandidateKey(repeated), 'balancing-equations:solo')
})

// --- excludeKey (prefetch must skip the ON-SCREEN question) ---------------------------------
//
// The prefetch runs right after a question is shown, but `servedStepIds` only grows on SOLVE, so the
// on-screen question is not yet in it. `excludeKey` lets the prefetch exclude exactly that question
// so it can never re-pick the one being answered (the duplicate-question bug), while never emptying
// a tiny pool.

test('excludeKey removes the on-screen question from selection (the duplicate-question fix)', () => {
  const lesson = makeLesson('balancing-equations', [inputStep('q1'), inputStep('q2'), inputStep('q3')])
  const catalog: Record<LessonId, Lesson> = { ...lessons, 'balancing-equations': lesson }
  const order: LessonId[] = ['balancing-equations']
  const progressByLesson: ProgressByLesson = { 'balancing-equations': completed('balancing-equations') }

  // Nothing served yet, but q1 is on screen: the prefetch must never re-pick q1, across all rng.
  for (let i = 0; i < 50; i += 1) {
    const result = select({
      lessonCatalog: catalog,
      lessonOrder: order,
      progressByLesson,
      excludeKey: 'balancing-equations:q1',
      rng: () => i / 50,
    })
    assert.ok(result)
    assert.notEqual(result.step.id, 'q1')
  }
})

test('excludeKey is honored on TOP of the anti-repeat window', () => {
  const lesson = makeLesson('balancing-equations', [inputStep('q1'), inputStep('q2'), inputStep('q3')])
  const catalog: Record<LessonId, Lesson> = { ...lessons, 'balancing-equations': lesson }
  const order: LessonId[] = ['balancing-equations']
  const progressByLesson: ProgressByLesson = { 'balancing-equations': completed('balancing-equations') }

  // q2 was just served (window avoids it) AND q1 is on screen (excludeKey): only q3 is eligible.
  for (let i = 0; i < 30; i += 1) {
    const result = select({
      lessonCatalog: catalog,
      lessonOrder: order,
      progressByLesson,
      servedStepIds: ['balancing-equations:q2'],
      excludeKey: 'balancing-equations:q1',
      rng: () => i / 30,
    })
    assert.ok(result)
    assert.equal(result.step.id, 'q3')
  }
})

test('excludeKey never empties a tiny pool (a lone on-screen question can still repeat)', () => {
  // Single-question pool: even though it is "on screen", selection must still return it (never null).
  const lesson = makeLesson('balancing-equations', [inputStep('solo')])
  const catalog: Record<LessonId, Lesson> = { ...lessons, 'balancing-equations': lesson }
  const result = select({
    lessonCatalog: catalog,
    lessonOrder: ['balancing-equations'],
    progressByLesson: { 'balancing-equations': completed('balancing-equations') },
    excludeKey: 'balancing-equations:solo',
    rng: () => 0.5,
  })
  assert.ok(result)
  assert.equal(result.step.id, 'solo')
})

// --- Weighting ------------------------------------------------------------------------------

test('weights struggling skills up and mastered skills down', () => {
  const catalog: Record<LessonId, Lesson> = {
    ...lessons,
    'balancing-equations': makeLesson('balancing-equations', [inputStep('weak')], ['equality']),
    'one-step-equations': makeLesson('one-step-equations', [mcqStep('strong')], ['inverse-operations']),
  }
  const order: LessonId[] = ['balancing-equations', 'one-step-equations']
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': completed('balancing-equations'),
    'one-step-equations': completed('one-step-equations'),
  }
  // equality below threshold -> struggle x2; inverse-operations above -> mastered x0.75.
  // weights: weak = 2, strong = 0.75 (total 2.75). Pool order [weak, strong].
  const mastery = [makeMastery('equality', 0.2), makeMastery('inverse-operations', 0.9)]
  const args = { lessonCatalog: catalog, lessonOrder: order, progressByLesson, mastery }

  assert.equal(select({ ...args, rng: () => 0 })?.step.id, 'weak') // 0 -> weak band [0, 2)
  assert.equal(select({ ...args, rng: () => 0.7 })?.step.id, 'weak') // 1.925 < 2 -> weak
  assert.equal(select({ ...args, rng: () => 0.95 })?.step.id, 'strong') // 2.6125 -> strong band [2, 2.75)
})

test('boosts a question whose most recent attempt was incorrect', () => {
  const catalog: Record<LessonId, Lesson> = {
    ...lessons,
    'balancing-equations': makeLesson('balancing-equations', [inputStep('weak')], ['equality']),
    'one-step-equations': makeLesson('one-step-equations', [mcqStep('strong')], ['inverse-operations']),
  }
  const order: LessonId[] = ['balancing-equations', 'one-step-equations']
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': completed('balancing-equations'),
    'one-step-equations': completed('one-step-equations'),
  }
  const mastery = [makeMastery('equality', 0.2), makeMastery('inverse-operations', 0.9)]
  const args = { lessonCatalog: catalog, lessonOrder: order, progressByLesson, mastery }

  // Baseline (no attempts): weak = 2, strong = 0.75; rng 0.7 -> 1.925 < 2 -> weak.
  assert.equal(select({ ...args, rng: () => 0.7 })?.step.id, 'weak')

  // The MOST RECENT attempt for 'strong' is incorrect -> strong x1.5 = 1.125 (total 3.125).
  // rng 0.7 -> 2.1875 -> lands in strong's band, so the miss flips the pick.
  const attempts = [
    makeAttempt('one-step-equations', 'strong', true, '2026-06-20T00:00:00.000Z'),
    makeAttempt('one-step-equations', 'strong', false, '2026-06-24T00:00:00.000Z'),
  ]
  assert.equal(select({ ...args, attempts, rng: () => 0.7 })?.step.id, 'strong')
})

test('downweights the lesson of the immediately previous served step', () => {
  const lessonA = makeLesson('balancing-equations', [inputStep('a1'), inputStep('a2')])
  const lessonB = makeLesson('one-step-equations', [mcqStep('b1')])
  const catalog: Record<LessonId, Lesson> = {
    ...lessons,
    'balancing-equations': lessonA,
    'one-step-equations': lessonB,
  }
  const order: LessonId[] = ['balancing-equations', 'one-step-equations']
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': completed('balancing-equations'),
    'one-step-equations': completed('one-step-equations'),
  }
  // Just served a1 (lesson balancing-equations). Anti-repeat removes a1; fresh = [a2, b1].
  // No mastery -> base 1 each; a2 shares the previous lesson -> x0.6 => a2 = 0.6, b1 = 1 (total 1.6).
  const served = ['balancing-equations:a1']
  const args = { lessonCatalog: catalog, lessonOrder: order, progressByLesson, servedStepIds: served }

  // rng 0.3 -> 0.48 -> a2 band [0, 0.6).
  assert.equal(select({ ...args, rng: () => 0.3 })?.step.id, 'a2')
  // rng 0.45 -> 0.72 -> b1. Without the x0.6 penalty the boundary would be 0.5, so 0.45 would
  // have stayed on a2; landing on b1 proves the same-lesson variety penalty is applied.
  assert.equal(select({ ...args, rng: () => 0.45 })?.step.id, 'b1')
})

// --- Key format -----------------------------------------------------------------------------

test('uses the `${lessonId}:${stepId}` anti-repeat key format', () => {
  const candidate: StoryCandidate = { lessonId: 'balancing-equations', step: inputStep('q1') }
  assert.equal(storyCandidateKey(candidate), 'balancing-equations:q1')

  const catalog: Record<LessonId, Lesson> = {
    ...lessons,
    'balancing-equations': makeLesson('balancing-equations', [inputStep('q1')]),
  }
  const result = select({
    lessonCatalog: catalog,
    lessonOrder: ['balancing-equations'],
    progressByLesson: { 'balancing-equations': completed('balancing-equations') },
  })
  assert.ok(result)
  assert.equal(storyCandidateKey(result), `${result.lessonId}:${result.step.id}`)
  assert.equal(storyCandidateKey(result), 'balancing-equations:q1')
})

// --- Real content catalog -------------------------------------------------------------------

test('selects a rethemable question from the real completed content catalog', () => {
  // Complete the first two lessons (the Story Mode unlock gate from the plan, section 8).
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': completed('balancing-equations'),
    'one-step-equations': completed('one-step-equations'),
  }
  const rethemable = new Set<LessonStep['type']>(['input', 'mcq', 'operation-choice', 'sequence'])
  const completedIds = new Set<LessonId>(['balancing-equations', 'one-step-equations'])

  for (let i = 0; i < 100; i += 1) {
    const result = selectNextQuestion({
      progressByLesson,
      lessonCatalog: lessons,
      lessonOrder: algebraCourse.lessonOrder,
      mastery: [],
      attempts: [],
      servedStepIds: [],
      rng: () => i / 100,
    })
    assert.ok(result)
    assert.ok(completedIds.has(result.lessonId)) // never an uncompleted lesson
    assert.ok(rethemable.has(result.step.type)) // never a spatial/concept step
  }
})
