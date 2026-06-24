import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  balancingEquationsLesson,
  lessons,
  type BalanceItem,
  type BalanceState,
  type Lesson,
  type LessonProgress,
  type LessonScore,
  type LessonStep,
  type McqStep,
} from '../src/domain'
import {
  applyBalanceOperation,
  calculateLessonScore,
  checkInputStep,
  checkMcqStep,
  createInitialProgress,
  getBestLessonScore,
  getCourseProgressSummary,
  getLatestLessonScore,
  getLessonCompletionHistory,
  isAssessedLessonStep,
  isLevel,
  normalizeExpression,
  restartLessonProgress,
  sideTotal,
  type ProgressByLesson,
} from '../src/engine'

const findStep = <Type extends LessonStep['type']>(
  lesson: Lesson,
  id: string,
  type: Type,
): Extract<LessonStep, { type: Type }> => {
  const step = lesson.steps.find((candidate) => candidate.id === id)
  assert.ok(step, `expected step ${id} in lesson ${lesson.id}`)
  assert.equal(step.type, type)
  return step as Extract<LessonStep, { type: Type }>
}

const weight = (id: string, value: number): BalanceItem => ({
  id,
  label: String(value),
  value,
  kind: 'weight',
})

const unknownBox = (id: string, value: number): BalanceItem => ({
  id,
  label: 'x',
  value,
  kind: 'unknown',
})

const balanceState = (left: BalanceItem[], right: BalanceItem[]): BalanceState => ({ left, right })

const baseProgress = (): LessonProgress => createInitialProgress('user-1', 'balancing-equations')

const lessonScore = (scorePercent: number): LessonScore => ({
  scorePercent,
  correctFirstTryCount: Math.round((scorePercent / 100) * 5),
  assessedStepCount: 5,
  completedAt: '2026-06-23T00:00:00.000Z',
})

test('normalizeExpression lowercases, strips whitespace, and removes only a leading x=', () => {
  assert.equal(normalizeExpression('X = 3'), '3')
  assert.equal(normalizeExpression('  6 / 2 '), '6/2')
  assert.equal(normalizeExpression('x=3'), '3')
  assert.equal(normalizeExpression('Y = 5'), 'y=5')
  assert.equal(normalizeExpression('-5, 1'), '-5,1')
})

test('sideTotal sums every item and isLevel compares both pans', () => {
  assert.equal(sideTotal([]), 0)
  assert.equal(sideTotal([weight('a', 3), weight('b', 2)]), 5)
  assert.equal(sideTotal([unknownBox('x', 3), weight('b', 2)]), 5)

  assert.equal(isLevel(balanceState([weight('l1', 3), weight('l2', 2)], [weight('r1', 5)])), true)
  assert.equal(isLevel(balanceState([weight('l1', 3)], [weight('r1', 5)])), false)
  assert.equal(isLevel(balanceState([unknownBox('x', 3), weight('l2', 2)], [weight('r1', 5)])), true)
})

test('isAssessedLessonStep counts everything except concept steps', () => {
  assert.equal(isAssessedLessonStep(findStep(balancingEquationsLesson, 'concept-balance', 'concept')), false)
  assert.equal(isAssessedLessonStep(findStep(balancingEquationsLesson, 'input-box-value', 'input')), true)
  assert.equal(isAssessedLessonStep(findStep(balancingEquationsLesson, 'drag-to-level', 'balance')), true)
  assert.equal(isAssessedLessonStep(findStep(balancingEquationsLesson, 'predict-add-left', 'mcq')), true)
})

test('getLessonCompletionHistory prefers stored history then falls back to latestScore', () => {
  const score = lessonScore(80)
  const history = [lessonScore(60), lessonScore(100)]

  assert.deepEqual(getLessonCompletionHistory(undefined), [])
  assert.deepEqual(getLessonCompletionHistory(baseProgress()), [])
  assert.deepEqual(getLessonCompletionHistory({ ...baseProgress(), latestScore: score }), [score])
  assert.deepEqual(
    getLessonCompletionHistory({ ...baseProgress(), latestScore: score, completionHistory: history }),
    history,
  )
})

test('applyBalanceOperation adds, cancels inverse weights, removes exact, and splits larger weights', () => {
  const unchanged = applyBalanceOperation(balanceState([weight('l', 3)], [weight('r', 3)]), {
    id: 'noop',
    label: '0',
    amount: 0,
    sides: 'both',
  })
  assert.equal(sideTotal(unchanged.left), 3)
  assert.equal(sideTotal(unchanged.right), 3)

  const added = applyBalanceOperation(balanceState([weight('l', 3)], [weight('r', 3)]), {
    id: 'add-5',
    label: '+5',
    amount: 5,
    sides: 'left',
  })
  assert.equal(added.left.length, 2)
  assert.equal(sideTotal(added.left), 8)
  assert.equal(sideTotal(added.right), 3)

  const canceled = applyBalanceOperation(balanceState([weight('l', 3), weight('neg', -5)], [weight('r', 3)]), {
    id: 'add-5',
    label: '+5',
    amount: 5,
    sides: 'left',
  })
  assert.equal(canceled.left.length, 1)
  assert.equal(sideTotal(canceled.left), 3)

  const removedExact = applyBalanceOperation(balanceState([weight('l', 3), weight('two', 2)], [weight('r', 5)]), {
    id: 'remove-2',
    label: '-2',
    amount: -2,
    sides: 'left',
  })
  assert.equal(removedExact.left.length, 1)
  assert.equal(sideTotal(removedExact.left), 3)

  const split = applyBalanceOperation(balanceState([weight('big', 5)], [weight('r', 5)]), {
    id: 'remove-2',
    label: '-2',
    amount: -2,
    sides: 'left',
  })
  assert.equal(split.left.length, 1)
  assert.equal(split.left[0].value, 3)
})

test('applyBalanceOperation does not mutate the source state', () => {
  const state = balanceState([weight('l', 3)], [weight('r', 3)])
  const snapshot = JSON.stringify(state)

  applyBalanceOperation(state, { id: 'add-5', label: '+5', amount: 5, sides: 'both' })

  assert.equal(JSON.stringify(state), snapshot)
})

test('applyBalanceOperation isolates the unknown when removing from both sides', () => {
  const step = findStep(balancingEquationsLesson, 'remove-two-both-sides', 'balance')
  const both = step.operations?.find((operation) => operation.id === 'remove-two-both')
  const leftOnly = step.operations?.find((operation) => operation.id === 'remove-two-left')
  assert.ok(both)
  assert.ok(leftOnly)

  const balanced = applyBalanceOperation(step.state, both)
  assert.equal(isLevel(balanced), true)
  assert.equal(balanced.left.length, 1)
  assert.equal(balanced.left[0].id, 'x-box')
  assert.equal(sideTotal(balanced.left), 3)
  assert.equal(sideTotal(balanced.right), 3)

  const tipped = applyBalanceOperation(step.state, leftOnly)
  assert.equal(isLevel(tipped), false)
  assert.equal(sideTotal(tipped.left), 3)
  assert.equal(sideTotal(tipped.right), 5)
})

test('checkInputStep accepts numerically equivalent answers and rejects unparseable ones', () => {
  const step = findStep(balancingEquationsLesson, 'input-box-value', 'input')

  assert.equal(checkInputStep(step, '3.0').correct, true)
  assert.equal(checkInputStep(step, '03').correct, true)
  assert.equal(checkInputStep(step, '9/3').correct, true)

  assert.equal(checkInputStep(step, '3.01', 1).correct, false)
  assert.equal(checkInputStep(step, 'three', 1).correct, false)
})

test('checkInputStep returns answer-specific hints on the first miss', () => {
  const step = findStep(balancingEquationsLesson, 'input-box-value', 'input')

  assert.equal(
    checkInputStep(step, '2', 1).feedback,
    'That is the loose weight next to the box. The box has to be the remaining amount.',
  )
  assert.equal(checkInputStep(step, '99', 1).feedback, step.feedback.incorrect)
})

test('checkInputStep recovery ladder sets retry guidance and tolerates a missing reveal', () => {
  const step = findStep(balancingEquationsLesson, 'input-box-value', 'input')

  assert.equal(checkInputStep(step, '5', 1).retryGuidance, 'Use the hint, then try again.')
  assert.equal(
    checkInputStep(step, '5', 2).retryGuidance,
    'Use this explanation to retry. One more miss will show the exact move.',
  )
  assert.equal(
    checkInputStep(step, '5', 3).retryGuidance,
    'Use the reveal, then try the step again so you still finish it yourself.',
  )

  const noReveal: Extract<LessonStep, { type: 'input' }> = {
    id: 'synthetic-input',
    type: 'input',
    prompt: 'No reveal authored',
    accept: ['10'],
    feedback: { correct: 'Yes', incorrect: 'Not yet, try again' },
  }

  assert.equal(checkInputStep(noReveal, '7', 2).retryGuidance, 'Use this explanation to retry.')
  const thirdMiss = checkInputStep(noReveal, '7', 3)
  assert.equal(thirdMiss.reveal, undefined)
  assert.equal(thirdMiss.retryGuidance, 'Use this explanation to retry.')
})

test('calculateLessonScore returns full credit when a lesson has no assessed steps', () => {
  const conceptOnly: Lesson = {
    id: 'balancing-equations',
    title: 'Concept only',
    subtitle: 'No assessed steps',
    skillIds: [],
    prerequisites: [],
    steps: [{ id: 'c1', type: 'concept', title: 'Intro', body: 'Just reading.' }],
  }

  const score = calculateLessonScore(conceptOnly, createInitialProgress('user-1', 'balancing-equations'))
  assert.equal(score.assessedStepCount, 0)
  assert.equal(score.correctFirstTryCount, 0)
  assert.equal(score.scorePercent, 100)
})

test('createInitialProgress starts a clean in-progress run', () => {
  const progress = createInitialProgress('user-7', 'one-step-equations')

  assert.equal(progress.userId, 'user-7')
  assert.equal(progress.lessonId, 'one-step-equations')
  assert.equal(progress.status, 'inProgress')
  assert.equal(progress.currentStepIndex, 0)
  assert.deepEqual(progress.stepResults, {})
  assert.equal(progress.completedAt, undefined)
  assert.equal(progress.startedAt, progress.updatedAt)
  assert.equal(typeof progress.startedAt, 'string')
})

test('latest and best scores fall back through history and legacy completions', () => {
  const lesson = balancingEquationsLesson

  assert.equal(getLatestLessonScore(lesson, undefined), undefined)
  assert.equal(getBestLessonScore(lesson, undefined), undefined)

  const withHistory: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed',
    completedAt: '2026-06-23T00:00:00.000Z',
    completionHistory: [lessonScore(60), lessonScore(100), lessonScore(80)],
  }

  assert.equal(getLatestLessonScore(lesson, withHistory)?.scorePercent, 80)
  assert.equal(getBestLessonScore(lesson, withHistory)?.scorePercent, 100)
})

test('restartLessonProgress preserves a legacy latestScore without a lesson reference', () => {
  const completed: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed',
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    latestScore: lessonScore(70),
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  const retake = restartLessonProgress(completed)

  assert.equal(retake.status, 'inProgress')
  assert.equal(retake.currentStepIndex, 0)
  assert.deepEqual(retake.stepResults, {})
  assert.equal(retake.completedAt, undefined)
  assert.equal(retake.latestScore?.scorePercent, 70)
  assert.equal(retake.bestScore?.scorePercent, 70)
  assert.equal(retake.completionHistory?.length, 1)
})

test('course progress summary recommends continuing an in-progress lesson', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      currentStepIndex: 2,
    },
  }

  const summary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson)

  assert.equal(summary.recommendedLessonId, 'balancing-equations')
  assert.equal(summary.recommendedAction, 'continue')
  assert.equal(summary.completedLessons, 0)
})

// --- checkMcqStep: the engine checker for multiple-choice prediction steps ----------

test('checkMcqStep accepts the correct option with the authored success feedback', () => {
  const step = findStep(balancingEquationsLesson, 'predict-add-left', 'mcq')

  const result = checkMcqStep(step, 'tips-left', 1)
  assert.equal(result.correct, true)
  assert.equal(result.feedback, step.feedback?.correct)
  assert.equal(result.reveal, undefined)
})

test('checkMcqStep keeps each wrong option pinned to its own misconception', () => {
  const step = findStep(balancingEquationsLesson, 'predict-add-left', 'mcq')

  const staysLevel = checkMcqStep(step, 'stays-level', 1)
  assert.equal(staysLevel.correct, false)
  assert.equal(staysLevel.feedback, 'Not quite. The totals changed from 3 and 3 to 5 and 3, so the pans cannot stay level.')

  // A different wrong option surfaces a different authored misconception, not a generic message.
  const tipsRight = checkMcqStep(step, 'tips-right', 1)
  assert.equal(tipsRight.correct, false)
  assert.equal(tipsRight.feedback, 'Check the totals. The pan with only 3 is lighter than the pan with 3 + 2.')
})

test('checkMcqStep escalates a repeated miss from hint to explanation to reveal', () => {
  const step = findStep(balancingEquationsLesson, 'predict-add-left', 'mcq')

  // Attempt 1: only the chosen option's hint, no reveal yet.
  const first = checkMcqStep(step, 'stays-level', 1)
  assert.equal(first.reveal, undefined)

  // Attempt 2: the chosen hint stays, the generic explanation layers into the reveal slot.
  const second = checkMcqStep(step, 'stays-level', 2)
  assert.equal(second.feedback, 'Not quite. The totals changed from 3 and 3 to 5 and 3, so the pans cannot stay level.')
  assert.equal(second.reveal, step.feedback?.incorrect)

  // Attempt 3: the exact reveal takes over while the option hint remains the headline.
  const third = checkMcqStep(step, 'stays-level', 3)
  assert.equal(third.feedback, 'Not quite. The totals changed from 3 and 3 to 5 and 3, so the pans cannot stay level.')
  assert.equal(third.reveal, step.feedback?.reveal)
})

test('checkMcqStep degrades gracefully when a step omits the optional shared feedback', () => {
  // `feedback` is optional on mcq steps; the checker must fall back to the option text
  // and never crash or surface "undefined".
  const minimalStep: McqStep = {
    id: 'synthetic-mcq',
    type: 'mcq',
    prompt: 'Pick one',
    correctId: 'right',
    options: [
      { id: 'right', label: 'Right', feedback: 'Correct option feedback.' },
      { id: 'wrong', label: 'Wrong', feedback: 'Wrong option feedback.' },
    ],
  }

  const correct = checkMcqStep(minimalStep, 'right', 1)
  assert.equal(correct.correct, true)
  assert.equal(correct.feedback, 'Correct option feedback.')

  // Without a shared incorrect/reveal, every attempt keeps the option's own hint and
  // never produces a layered reveal.
  const wrongThird = checkMcqStep(minimalStep, 'wrong', 3)
  assert.equal(wrongThird.correct, false)
  assert.equal(wrongThird.feedback, 'Wrong option feedback.')
  assert.equal(wrongThird.reveal, undefined)
})
