import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  balancingEquationsLesson,
  lessons,
  type Lesson,
  type LessonProgress,
  type LessonStep,
} from '../src/domain'
import {
  applyStepResult,
  calculateLessonScore,
  createInitialProgress,
  getBestLessonScore,
  getLatestLessonScore,
  hasCompletedLesson,
  isLessonUnlocked,
  restartLessonProgress,
} from '../src/engine'
import { findStep } from './helpers/findStep'

const lessonStep = <Type extends LessonStep['type']>(
  id: string,
  type: Type,
  lesson: Lesson = balancingEquationsLesson,
) => findStep(lesson, id, type)

test('wrong assessed results stay on the same step and remain retryable', () => {
  const step = lessonStep('input-box-value', 'input')
  const progress = createInitialProgress('user-1', balancingEquationsLesson.id)
  const currentStepIndex = 4
  const activeProgress = { ...progress, currentStepIndex }

  const nextProgress = applyStepResult(
    activeProgress,
    step,
    { correct: false, feedback: 'Try again.' },
    currentStepIndex + 1,
    balancingEquationsLesson,
  )

  assert.equal(nextProgress.currentStepIndex, currentStepIndex)
  assert.equal(nextProgress.status, 'inProgress')
  assert.equal(nextProgress.stepResults[step.id].attempts, 1)
  assert.equal(nextProgress.stepResults[step.id].correct, false)
})

const finalSummaryCases = [
  {
    lesson: balancingEquationsLesson,
    // Wave 3 added two mastery checks before the summary; the balance story is now last.
    finalAssessedId: 'mastery-balance-story',
    finalSummaryId: 'complete-summary',
  },
  {
    lesson: lessons['one-step-equations'],
    // Mastery checks (add-negative, divide-by-negative) follow the x/4 input solve.
    finalAssessedId: 'mastery-divide-by-negative',
    finalSummaryId: 'complete-one-step-summary',
  },
  {
    lesson: lessons['two-step-equations'],
    // Unchanged: the spot-the-mistake capstone stays second-to-last by design.
    finalAssessedId: 'spot-two-step-mistake',
    finalSummaryId: 'complete-two-step-summary',
  },
  {
    lesson: lessons['like-terms-variables-both-sides'],
    // Mastery input + full-solution sequence were appended after the both-sides input.
    finalAssessedId: 'mastery-sequence-full-solution',
    finalSummaryId: 'complete-like-terms-summary',
  },
  {
    lesson: lessons['coordinate-plane'],
    // Plot tasks (each-quadrant map, net-walk input, Quadrant II plot) follow choose-quadrant;
    // the Quadrant II plot stays the last assessed step before the summary.
    finalAssessedId: 'choose-point-in-quadrant-two',
    finalSummaryId: 'complete-coordinate-plane-summary',
  },
  {
    lesson: lessons['graphing-lines'],
    // Two mastery checks (equation-from-graph, find-intercept) follow the table choice.
    finalAssessedId: 'mastery-find-intercept',
    finalSummaryId: 'complete-graphing-lines-summary',
  },
]

finalSummaryCases.forEach(({ lesson, finalAssessedId, finalSummaryId }) => {
  test(`${lesson.id} advances from final assessed step to final summary before completing`, () => {
    const finalAssessedStep = lesson.steps.find((step) => step.id === finalAssessedId)
    const finalAssessedIndex = lesson.steps.findIndex((step) => step.id === finalAssessedId)
    assert.ok(finalAssessedStep)
    assert.equal(finalAssessedIndex, lesson.steps.length - 2)

    const activeProgress = {
      ...createInitialProgress('user-1', lesson.id),
      currentStepIndex: finalAssessedIndex,
      stepResults: {
        [finalAssessedStep.id]: {
          correct: true,
          attempts: 1,
          feedback: 'Correct.',
        },
      },
    }

    const nextProgress = applyStepResult(
      activeProgress,
      finalAssessedStep,
      { correct: true, feedback: 'Correct.' },
      finalAssessedIndex + 1,
      lesson,
      false,
    )

    assert.equal(nextProgress.status, 'inProgress')
    assert.equal(nextProgress.currentStepIndex, lesson.steps.length - 1)
    assert.equal(lesson.steps[nextProgress.currentStepIndex].id, finalSummaryId)
    assert.equal(nextProgress.completedAt, undefined)
    assert.equal(nextProgress.stepResults[finalAssessedStep.id].attempts, 1)
  })

  test(`${lesson.id} completes only after continuing from final summary`, () => {
    const finalSummaryStep = lessonStep(finalSummaryId, 'concept', lesson)
    const finalSummaryIndex = lesson.steps.findIndex((step) => step.id === finalSummaryId)
    const activeProgress = {
      ...createInitialProgress('user-1', lesson.id),
      currentStepIndex: finalSummaryIndex,
    }

    const nextProgress = applyStepResult(
      activeProgress,
      finalSummaryStep,
      { correct: true, feedback: 'Concept viewed.' },
      finalSummaryIndex + 1,
      lesson,
      false,
    )

    assert.equal(nextProgress.status, 'completed')
    assert.equal(nextProgress.currentStepIndex, finalSummaryIndex)
    assert.equal(nextProgress.stepResults[finalSummaryStep.id].attempts, 0)
    assert.ok(nextProgress.completedAt)
  })
})

test('lesson completion records latest and best first-try scores', () => {
  const lesson = balancingEquationsLesson
  const finalSummaryStep = lessonStep('complete-summary', 'concept', lesson)
  const finalSummaryIndex = lesson.steps.findIndex((step) => step.id === finalSummaryStep.id)
  const assessedSteps = lesson.steps.filter((step) => step.type !== 'concept')
  const activeProgress = {
    ...createInitialProgress('user-1', lesson.id),
    currentStepIndex: finalSummaryIndex,
    stepResults: assessedSteps.reduce<LessonProgress['stepResults']>((results, step, index) => {
      results[step.id] = {
        correct: true,
        attempts: index % 2 === 0 ? 1 : 2,
        feedback: 'Correct.',
      }
      return results
    }, {}),
  }

  const completed = applyStepResult(
    activeProgress,
    finalSummaryStep,
    { correct: true, feedback: 'Concept viewed.' },
    finalSummaryIndex + 1,
    lesson,
    false,
  )

  assert.equal(completed.status, 'completed')
  const expectedFirstTryCount = assessedSteps.filter((_, index) => index % 2 === 0).length
  const expectedScorePercent = Math.round((expectedFirstTryCount / assessedSteps.length) * 100)
  assert.equal(completed.latestScore?.correctFirstTryCount, expectedFirstTryCount)
  assert.equal(completed.latestScore?.assessedStepCount, assessedSteps.length)
  assert.equal(completed.latestScore?.scorePercent, expectedScorePercent)
  assert.equal(completed.bestScore?.scorePercent, expectedScorePercent)
  assert.equal(completed.completionHistory?.length, 1)
  assert.equal(getLatestLessonScore(lesson, completed)?.scorePercent, expectedScorePercent)
  assert.equal(getBestLessonScore(lesson, completed)?.scorePercent, expectedScorePercent)
  assert.deepEqual(calculateLessonScore(lesson, completed, completed.completedAt).scorePercent, expectedScorePercent)
})

test('retaking a completed lesson resets the run and preserves score history', () => {
  const lesson = balancingEquationsLesson
  const finalSummaryStep = lessonStep('complete-summary', 'concept', lesson)
  const finalSummaryIndex = lesson.steps.findIndex((step) => step.id === finalSummaryStep.id)
  const assessedSteps = lesson.steps.filter((step) => step.type !== 'concept')
  const completed = {
    ...createInitialProgress('user-1', lesson.id),
    status: 'completed' as const,
    currentStepIndex: finalSummaryIndex,
    latestScore: {
      scorePercent: 60,
      correctFirstTryCount: 3,
      assessedStepCount: 5,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    bestScore: {
      scorePercent: 60,
      correctFirstTryCount: 3,
      assessedStepCount: 5,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    completionHistory: [
      {
        scorePercent: 60,
        correctFirstTryCount: 3,
        assessedStepCount: 5,
        completedAt: '2026-06-23T00:00:00.000Z',
      },
    ],
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  const retake = restartLessonProgress(completed, lesson)

  assert.equal(retake.status, 'inProgress')
  assert.equal(retake.currentStepIndex, 0)
  assert.deepEqual(retake.stepResults, {})
  assert.equal(retake.completedAt, undefined)
  assert.equal(retake.latestScore?.scorePercent, 60)
  assert.equal(retake.bestScore?.scorePercent, 60)
  assert.equal(retake.completionHistory?.length, 1)
  assert.equal(hasCompletedLesson(retake), true)
  assert.equal(isLessonUnlocked(lessons['one-step-equations'], { 'balancing-equations': retake }), true)

  const perfectRun = {
    ...retake,
    currentStepIndex: finalSummaryIndex,
    stepResults: assessedSteps.reduce<LessonProgress['stepResults']>((results, step) => {
      results[step.id] = {
        correct: true,
        attempts: 1,
        feedback: 'Correct.',
      }
      return results
    }, {}),
  }
  const recompleted = applyStepResult(
    perfectRun,
    finalSummaryStep,
    { correct: true, feedback: 'Concept viewed.' },
    finalSummaryIndex + 1,
    lesson,
    false,
  )

  assert.equal(recompleted.latestScore?.scorePercent, 100)
  assert.equal(recompleted.bestScore?.scorePercent, 100)
  assert.equal(recompleted.completionHistory?.map((score) => score.scorePercent).join(','), '60,100')
})
