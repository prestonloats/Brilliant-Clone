import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  balancingEquationsLesson,
  lessons,
  type BalanceOperation,
  type BalanceState,
  type Course,
  type Lesson,
  type LessonId,
  type LessonProgress,
  type LessonScore,
  type StepResult,
} from '../src/domain'
import {
  applyBalanceOperation,
  applyStepResult,
  calculateLessonScore,
  createInitialProgress,
  getBestLessonScore,
  getCourseProgressSummary,
  getLatestLessonScore,
  getLessonCompletionHistory,
  getRecommendedNextLesson,
  getRecommendedPathLessonId,
  hasCompletedLesson,
  isAssessedLessonStep,
  isLessonUnlocked,
  isLevel,
  normalizeExpression,
  restartLessonProgress,
  sideTotal,
  type ProgressByLesson,
} from '../src/engine'

const makeScore = (scorePercent: number, completedAt = '2026-06-23T00:00:00.000Z'): LessonScore => ({
  scorePercent,
  correctFirstTryCount: Math.round((scorePercent / 100) * 5),
  assessedStepCount: 5,
  completedAt,
})

const assessedSteps = balancingEquationsLesson.steps.filter(isAssessedLessonStep)

const resultsForAssessed = (correct: boolean, attempts: number): Record<string, StepResult> =>
  assessedSteps.reduce<Record<string, StepResult>>((results, step) => {
    results[step.id] = { correct, attempts, feedback: 'noted' }
    return results
  }, {})

test('normalizeExpression lowercases, strips whitespace, and drops a leading x=', () => {
  assert.equal(normalizeExpression('X = 3'), '3')
  assert.equal(normalizeExpression('  6 / 2 '), '6/2')
  assert.equal(normalizeExpression('x = 3'), '3')
  assert.equal(normalizeExpression('X'), 'x')
  assert.equal(normalizeExpression('Y = 5'), 'y=5')
  assert.equal(normalizeExpression(''), '')
})

test('sideTotal sums item values including negatives and empty sides', () => {
  assert.equal(sideTotal([]), 0)
  assert.equal(
    sideTotal([
      { id: 'a', label: '3', value: 3, kind: 'weight' },
      { id: 'b', label: '-1', value: -1, kind: 'weight' },
    ]),
    2,
  )
})

test('isLevel compares the totals of both pans', () => {
  assert.equal(
    isLevel({
      left: [{ id: 'a', label: '2', value: 2, kind: 'weight' }],
      right: [{ id: 'b', label: '2', value: 2, kind: 'weight' }],
    }),
    true,
  )
  assert.equal(
    isLevel({
      left: [{ id: 'a', label: '2', value: 2, kind: 'weight' }],
      right: [{ id: 'b', label: '3', value: 3, kind: 'weight' }],
    }),
    false,
  )
})

test('applyBalanceOperation appends a weight when no inverse exists and does not mutate input', () => {
  const state: BalanceState = {
    left: [{ id: 'x', label: 'x', value: 3, kind: 'unknown' }],
    right: [{ id: 'r3', label: '3', value: 3, kind: 'weight' }],
  }
  const operation: BalanceOperation = { id: 'add-2-both', label: '+2 to both', amount: 2, sides: 'both' }

  const next = applyBalanceOperation(state, operation)

  assert.equal(sideTotal(next.left), 5)
  assert.equal(sideTotal(next.right), 5)
  const addedLeft = next.left.find((item) => item.id !== 'x')
  assert.equal(addedLeft?.value, 2)
  assert.equal(addedLeft?.kind, 'weight')
  assert.equal(state.left.length, 1)
  assert.equal(sideTotal(state.right), 3)
})

test('applyBalanceOperation cancels an inverse weight when adding a positive amount', () => {
  const state: BalanceState = {
    left: [
      { id: 'x', label: 'x', value: 7, kind: 'unknown' },
      { id: 'neg-3', label: '-3', value: -3, kind: 'weight' },
    ],
    right: [{ id: 'r4', label: '4', value: 4, kind: 'weight' }],
  }
  const operation: BalanceOperation = { id: 'add-3-left', label: '+3 to left', amount: 3, sides: 'left' }

  const next = applyBalanceOperation(state, operation)

  assert.equal(next.left.length, 1)
  assert.equal(next.left[0].id, 'x')
  assert.equal(sideTotal(next.left), 7)
  assert.equal(sideTotal(next.right), 4)
})

test('applyBalanceOperation removes an exact weight and reduces a larger one when subtracting', () => {
  const state: BalanceState = {
    left: [
      { id: 'x', label: 'x', value: 3, kind: 'unknown' },
      { id: 'two', label: '2', value: 2, kind: 'weight' },
    ],
    right: [{ id: 'five', label: '5', value: 5, kind: 'weight' }],
  }
  const operation: BalanceOperation = { id: 'sub-2-both', label: '-2 from both', amount: -2, sides: 'both' }

  const next = applyBalanceOperation(state, operation)

  assert.equal(next.left.length, 1)
  assert.equal(next.left[0].id, 'x')
  assert.equal(next.right[0].value, 3)
  assert.equal(next.right[0].label, '3')
  assert.ok(isLevel(next))
})

test('applyBalanceOperation is a no-op for amount 0 or removing more than is present', () => {
  const zeroState: BalanceState = {
    left: [{ id: 'a', label: '1', value: 1, kind: 'weight' }],
    right: [{ id: 'b', label: '1', value: 1, kind: 'weight' }],
  }
  const zeroOperation: BalanceOperation = { id: 'noop', label: '0', amount: 0, sides: 'both' }
  const unchanged = applyBalanceOperation(zeroState, zeroOperation)
  assert.deepEqual(unchanged.left, zeroState.left)
  assert.deepEqual(unchanged.right, zeroState.right)

  const smallState: BalanceState = {
    left: [{ id: 'one', label: '1', value: 1, kind: 'weight' }],
    right: [{ id: 'r-one', label: '1', value: 1, kind: 'weight' }],
  }
  const overRemove: BalanceOperation = { id: 'sub-5-left', label: '-5 from left', amount: -5, sides: 'left' }
  const stillThere = applyBalanceOperation(smallState, overRemove)
  assert.equal(stillThere.left.length, 1)
  assert.equal(stillThere.left[0].value, 1)
})

test('isAssessedLessonStep treats every non-concept step as assessed', () => {
  assert.equal(isAssessedLessonStep(balancingEquationsLesson.steps[0]), false)
  assert.equal(isAssessedLessonStep(balancingEquationsLesson.steps[1]), true)
  assert.equal(assessedSteps.length, 6)
})

test('calculateLessonScore returns a perfect score for lessons with no assessed steps', () => {
  const conceptOnly: Lesson = {
    ...balancingEquationsLesson,
    steps: balancingEquationsLesson.steps.filter((step) => step.type === 'concept'),
  }
  const score = calculateLessonScore(conceptOnly, createInitialProgress('user-1', conceptOnly.id), '2026-06-23T00:00:00.000Z')

  assert.equal(score.scorePercent, 100)
  assert.equal(score.assessedStepCount, 0)
  assert.equal(score.correctFirstTryCount, 0)
  assert.equal(score.completedAt, '2026-06-23T00:00:00.000Z')
})

test('getLessonCompletionHistory prefers explicit history then falls back to the latest score', () => {
  assert.deepEqual(getLessonCompletionHistory(undefined), [])
  assert.deepEqual(getLessonCompletionHistory(createInitialProgress('user-1', 'balancing-equations')), [])

  const latest = makeScore(80)
  const withLatest: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    latestScore: latest,
  }
  assert.deepEqual(getLessonCompletionHistory(withLatest), [latest])

  const history = [makeScore(60), makeScore(100)]
  const withHistory: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    completionHistory: history,
  }
  assert.deepEqual(getLessonCompletionHistory(withHistory), history)
})

test('getLatestLessonScore and getBestLessonScore compute legacy scores from completed step results', () => {
  const legacyCompleted: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed',
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    stepResults: resultsForAssessed(true, 1),
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  assert.equal(getLatestLessonScore(balancingEquationsLesson, legacyCompleted)?.scorePercent, 100)
  assert.equal(getBestLessonScore(balancingEquationsLesson, legacyCompleted)?.scorePercent, 100)
  assert.equal(getLatestLessonScore(balancingEquationsLesson, undefined), undefined)
  assert.equal(getBestLessonScore(balancingEquationsLesson, undefined), undefined)
  assert.equal(getLatestLessonScore(balancingEquationsLesson, createInitialProgress('user-1', 'balancing-equations')), undefined)
})

test('getBestLessonScore selects the highest score across history, latest, and best', () => {
  const progress: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    completionHistory: [makeScore(60), makeScore(100), makeScore(80)],
    latestScore: makeScore(80),
    bestScore: makeScore(90),
  }

  assert.equal(getBestLessonScore(balancingEquationsLesson, progress)?.scorePercent, 100)
})

test('hasCompletedLesson reflects completed status or any recorded completion history', () => {
  assert.equal(hasCompletedLesson(undefined), false)
  assert.equal(hasCompletedLesson(createInitialProgress('user-1', 'balancing-equations')), false)
  assert.equal(
    hasCompletedLesson({ ...createInitialProgress('user-1', 'balancing-equations'), status: 'completed' }),
    true,
  )
  assert.equal(
    hasCompletedLesson({
      ...createInitialProgress('user-1', 'balancing-equations'),
      completionHistory: [makeScore(80)],
    }),
    true,
  )
})

test('restartLessonProgress reconstructs score history from a legacy completed run', () => {
  const legacyCompleted: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed',
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    stepResults: resultsForAssessed(true, 1),
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  const restarted = restartLessonProgress(legacyCompleted, balancingEquationsLesson)

  assert.equal(restarted.status, 'inProgress')
  assert.equal(restarted.currentStepIndex, 0)
  assert.deepEqual(restarted.stepResults, {})
  assert.equal(restarted.completedAt, undefined)
  assert.equal(restarted.latestScore?.scorePercent, 100)
  assert.equal(restarted.bestScore?.scorePercent, 100)
  assert.equal(restarted.completionHistory?.length, 1)
})

test('restartLessonProgress without a lesson and no scores omits score fields', () => {
  const completedNoScores: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed',
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  const restarted = restartLessonProgress(completedNoScores)

  assert.equal(restarted.status, 'inProgress')
  assert.equal(restarted.currentStepIndex, 0)
  assert.equal(restarted.latestScore, undefined)
  assert.equal(restarted.bestScore, undefined)
  assert.equal(restarted.completionHistory, undefined)
})

test('applyStepResult accumulates attempts across retries before advancing on success', () => {
  const lesson = balancingEquationsLesson
  const step = lesson.steps[1]
  const start: LessonProgress = { ...createInitialProgress('user-1', lesson.id), currentStepIndex: 1 }

  const firstWrong = applyStepResult(start, step, { correct: false, feedback: 'no' }, 2, lesson)
  assert.equal(firstWrong.currentStepIndex, 1)
  assert.equal(firstWrong.stepResults[step.id].attempts, 1)

  const secondWrong = applyStepResult(firstWrong, step, { correct: false, feedback: 'no' }, 2, lesson)
  assert.equal(secondWrong.stepResults[step.id].attempts, 2)

  const solved = applyStepResult(secondWrong, step, { correct: true, feedback: 'yes' }, 2, lesson)
  assert.equal(solved.currentStepIndex, 2)
  assert.equal(solved.status, 'inProgress')
  assert.equal(solved.stepResults[step.id].attempts, 3)
  assert.equal(solved.completedAt, undefined)
})

test('applyStepResult preserves a prior best score when a later run is weaker', () => {
  const lesson = balancingEquationsLesson
  const finalSummaryIndex = lesson.steps.length - 1
  const summaryStep = lesson.steps[finalSummaryIndex]
  const beforeComplete: LessonProgress = {
    ...createInitialProgress('user-1', lesson.id),
    currentStepIndex: finalSummaryIndex,
    bestScore: makeScore(100),
    completionHistory: [makeScore(100)],
    stepResults: resultsForAssessed(false, 2),
  }

  const completed = applyStepResult(
    beforeComplete,
    summaryStep,
    { correct: true, feedback: 'done' },
    finalSummaryIndex + 1,
    lesson,
    false,
  )

  assert.equal(completed.status, 'completed')
  assert.equal(completed.latestScore?.scorePercent, 0)
  assert.equal(completed.bestScore?.scorePercent, 100)
  assert.equal(completed.completionHistory?.length, 2)
  assert.ok(completed.completedAt)
})

test('getRecommendedNextLesson skips the review prompt when a lesson has no assessed steps', () => {
  const conceptLesson: Lesson = {
    ...balancingEquationsLesson,
    skillIds: [],
    nextLessonId: 'one-step-equations',
    steps: balancingEquationsLesson.steps.filter((step) => step.type === 'concept'),
  }

  assert.equal(getRecommendedNextLesson(conceptLesson, []).title, 'One-Step Equations')
})

test('getRecommendedNextLesson recommends review when assessed mastery is unknown', () => {
  const noSkillLesson: Lesson = { ...balancingEquationsLesson, skillIds: [] }

  assert.equal(getRecommendedNextLesson(noSkillLesson, []).title, 'Review Balancing Equations')
})

test('isLessonUnlocked requires steps and completed prerequisites', () => {
  const emptyLesson: Lesson = { ...balancingEquationsLesson, steps: [] }

  assert.equal(isLessonUnlocked(emptyLesson, {}), false)
  assert.equal(isLessonUnlocked(balancingEquationsLesson, {}), true)
})

test('getRecommendedPathLessonId falls back to the preferred lesson then the first path lesson', () => {
  const course: Course = { ...algebraCourse, lessonOrder: ['two-step-equations'] }
  const catalog = { 'two-step-equations': lessons['two-step-equations'] } as Record<LessonId, Lesson>

  assert.equal(getRecommendedPathLessonId(course, catalog, {}, 'two-step-equations'), 'two-step-equations')
  assert.equal(getRecommendedPathLessonId(course, catalog, {}), 'two-step-equations')
})

test('getCourseProgressSummary reports a continue action for an in-progress recommendation', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': { ...createInitialProgress('user-1', 'balancing-equations'), currentStepIndex: 2 },
  }

  const summary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson)

  assert.equal(summary.recommendedLessonId, 'balancing-equations')
  assert.equal(summary.recommendedAction, 'continue')
  assert.equal(summary.completedLessons, 0)
  assert.equal(summary.percentComplete, 0)
})
