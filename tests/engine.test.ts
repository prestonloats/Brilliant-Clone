import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  balancingEquationsLesson,
  lessons,
  type BalanceOperation,
  type BalanceState,
  type Lesson,
  type LessonId,
  type LessonProgress,
  type LessonScore,
  type LessonStep,
  type SkillMastery,
} from '../src/domain'
import {
  applyBalanceOperation,
  applyStepResult,
  calculateLessonScore,
  checkBalanceStep,
  checkInputStep,
  checkOperationChoiceStep,
  checkSequenceStep,
  createInitialProgress,
  getBestLessonScore,
  getCourseProgressSummary,
  getLatestLessonScore,
  getLessonCompletionHistory,
  getRecommendedPathLessonId,
  getRecommendedNextLesson,
  hasCompletedLesson,
  isAssessedLessonStep,
  isLessonUnlocked,
  isLevel,
  MASTERY_READY_THRESHOLD,
  normalizeExpression,
  restartLessonProgress,
  sideTotal,
  type ProgressByLesson,
} from '../src/engine'

const lessonStep = <Type extends LessonStep['type']>(
  id: string,
  type: Type,
  lesson: Lesson = balancingEquationsLesson,
) => {
  const step = lesson.steps.find((candidate) => candidate.id === id)
  assert.ok(step)
  assert.equal(step.type, type)
  return step as Extract<LessonStep, { type: Type }>
}

const expectedLessonOrder: LessonId[] = [
  'balancing-equations',
  'one-step-equations',
  'two-step-equations',
  'like-terms-variables-both-sides',
  'coordinate-plane',
  'graphing-lines',
]

const expectedPrerequisites: Record<LessonId, LessonId[]> = {
  'balancing-equations': [],
  'one-step-equations': ['balancing-equations'],
  'two-step-equations': ['one-step-equations'],
  'like-terms-variables-both-sides': ['two-step-equations'],
  'coordinate-plane': ['like-terms-variables-both-sides'],
  'graphing-lines': ['coordinate-plane'],
}

test('input recovery escalates from hint to explanation to reveal', () => {
  const step = lessonStep('input-box-value', 'input')

  const firstMiss = checkInputStep(step, '5', 1)
  assert.equal(firstMiss.correct, false)
  assert.equal(firstMiss.feedback, "That's the whole right side, but the left pan also has a 2 next to the box.")
  assert.equal(firstMiss.reveal, undefined)

  const secondMiss = checkInputStep(step, '5', 2)
  assert.equal(secondMiss.feedback, 'Use the whole right side, then account for the 2 already sitting next to x.')
  assert.equal(secondMiss.reveal, undefined)

  const thirdMiss = checkInputStep(step, '5', 3)
  assert.equal(thirdMiss.feedback, 'Use the whole right side, then account for the 2 already sitting next to x.')
  assert.equal(thirdMiss.reveal, 'x = 3 because 5 - 2 = 3.')
})

test('correct input keeps success feedback ahead of continue', () => {
  const step = lessonStep('input-box-value', 'input')
  const result = checkInputStep(step, 'x = 3', 3)

  assert.equal(result.correct, true)
  assert.equal(result.feedback, 'Yes. The box must be 3 because 3 + 2 = 5.')
  assert.equal(result.reveal, undefined)
  assert.equal(result.retryGuidance, undefined)
})

test('input accepts equivalent numeric answers without evaluating invalid expressions', () => {
  const step = lessonStep('input-box-value', 'input')

  assert.equal(checkInputStep(step, '3.0004').correct, true)
  assert.equal(checkInputStep(step, 'x = 6/2').correct, true)
  assert.equal(checkInputStep(step, ' 6 / 2 ').correct, true)

  const expressionMiss = checkInputStep(step, '1+2', 1)
  assert.equal(expressionMiss.correct, false)
  assert.equal(expressionMiss.feedback, step.feedback.incorrect)

  const divideByZeroMiss = checkInputStep(step, '3/0', 2)
  assert.equal(divideByZeroMiss.correct, false)
  assert.equal(divideByZeroMiss.feedback, step.feedback.incorrect)
  assert.equal(divideByZeroMiss.reveal, undefined)
})

test('balance recovery keeps reveal until the third miss', () => {
  const step = lessonStep('drag-to-level', 'balance')

  const firstMiss = checkBalanceStep(step, step.state, {}, 1)
  assert.equal(firstMiss.correct, false)
  assert.equal(firstMiss.feedback, 'The left side has an extra 2. Put a matching 2 on the right side.')
  assert.equal(firstMiss.reveal, undefined)

  const secondMiss = checkBalanceStep(step, step.state, {}, 2)
  assert.equal(
    secondMiss.feedback,
    'A level scale means both pans total the same amount. The left side is 3 + 2, so the right side also needs to total 5.',
  )
  assert.equal(secondMiss.reveal, undefined)

  const thirdMiss = checkBalanceStep(step, step.state, {}, 3)
  assert.equal(thirdMiss.reveal, 'Drag the 2 from the tray to the right pan so both sides weigh 5.')
})

test('balance level goal distinguishes missing item, not level, and solved states', () => {
  const step = lessonStep('drag-to-level', 'balance')
  const matchingItem = step.state.bank?.find((item) => item.id === 'right-match-2')
  assert.ok(matchingItem)

  const missingItem = checkBalanceStep(step, step.state, {}, 1)
  assert.equal(missingItem.correct, false)
  assert.equal(missingItem.feedback, 'The left side has an extra 2. Put a matching 2 on the right side.')

  const notLevel = checkBalanceStep(
    step,
    {
      ...step.state,
      right: [
        ...step.state.right,
        matchingItem,
        { id: 'extra-right-1', label: '1', value: 1, kind: 'weight' },
      ],
      bank: [],
    },
    {},
    1,
  )
  assert.equal(notLevel.correct, false)
  assert.equal(notLevel.feedback, 'The scale is still tilted. Your goal is for both pans to weigh the same.')

  const solved = checkBalanceStep(
    step,
    {
      ...step.state,
      right: [...step.state.right, matchingItem],
      bank: [],
    },
    {},
    1,
  )
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)
})

test('balance isolate goal catches one-side-only moves and incomplete isolation', () => {
  const step = lessonStep('remove-two-both-sides', 'balance')
  const leftOnly = step.operations?.find((operation) => operation.id === 'remove-two-left')
  const bothSides = step.operations?.find((operation) => operation.id === 'remove-two-both')
  assert.ok(leftOnly)
  assert.ok(bothSides)

  const oneSideOnly = checkBalanceStep(step, applyBalanceOperation(step.state, leftOnly), { movedOneSideOnly: true }, 1)
  assert.equal(oneSideOnly.correct, false)
  assert.equal(oneSideOnly.feedback, 'You only took from one side, so the scale tipped. Whatever you do to one side, do to the other.')

  const notIsolated = checkBalanceStep(step, step.state, {}, 1)
  assert.equal(notIsolated.correct, false)
  assert.equal(notIsolated.feedback, 'The goal is to leave the box by itself while keeping the scale level.')

  const solved = checkBalanceStep(step, applyBalanceOperation(step.state, bothSides), {}, 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)
})

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
    finalAssessedId: 'order-balance-repair',
    finalSummaryId: 'complete-summary',
  },
  {
    lesson: lessons['one-step-equations'],
    finalAssessedId: 'input-x-divided-by-four',
    finalSummaryId: 'complete-one-step-summary',
  },
  {
    lesson: lessons['two-step-equations'],
    finalAssessedId: 'spot-two-step-mistake',
    finalSummaryId: 'complete-two-step-summary',
  },
  {
    lesson: lessons['like-terms-variables-both-sides'],
    finalAssessedId: 'input-variable-both-sides',
    finalSummaryId: 'complete-like-terms-summary',
  },
  {
    lesson: lessons['coordinate-plane'],
    finalAssessedId: 'choose-quadrant',
    finalSummaryId: 'complete-coordinate-plane-summary',
  },
  {
    lesson: lessons['graphing-lines'],
    finalAssessedId: 'choose-line-table',
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

test('recommendations distinguish clean mastery from repeated misses', () => {
  const cleanMastery: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 1,
    attempts: 5,
    correct: 5,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const missedMastery: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 0.62,
    attempts: 8,
    correct: 5,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))

  assert.equal(getRecommendedNextLesson(balancingEquationsLesson, cleanMastery).title, 'One-Step Equations')
  assert.equal(getRecommendedNextLesson(balancingEquationsLesson, missedMastery).title, 'Review Balancing Equations')
})

test('recommendations use average mastery threshold and end-of-path copy', () => {
  const masteryAtThreshold: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 0.65,
    attempts: 20,
    correct: 13,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const missingSkillMastery: SkillMastery[] = [
    {
      userId: 'user-1',
      skillId: 'equality',
      score: 1,
      attempts: 4,
      correct: 4,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    },
  ]
  const twoStepMastery: SkillMastery[] = [
    {
      userId: 'user-1',
      skillId: 'two-step-equations',
      score: 1,
      attempts: 4,
      correct: 4,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    },
  ]
  const likeTermsMastery: SkillMastery[] = lessons['like-terms-variables-both-sides'].skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 1,
    attempts: 4,
    correct: 4,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const graphingMastery: SkillMastery[] = lessons['graphing-lines'].skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 1,
    attempts: 4,
    correct: 4,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))

  assert.equal(getRecommendedNextLesson(balancingEquationsLesson, masteryAtThreshold).title, 'One-Step Equations')
  assert.equal(getRecommendedNextLesson(balancingEquationsLesson, missingSkillMastery).title, 'Review Balancing Equations')
  assert.equal(
    getRecommendedNextLesson(lessons['two-step-equations'], twoStepMastery).title,
    'Like Terms & Variables on Both Sides',
  )
  assert.equal(
    getRecommendedNextLesson(lessons['like-terms-variables-both-sides'], likeTermsMastery).title,
    'Coordinate Plane',
  )
  assert.equal(getRecommendedNextLesson(lessons['graphing-lines'], graphingMastery).title, 'Course path complete')
})

test('path recommends one-step equations after balancing is completed', () => {
  const balancingProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed' as const,
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    completedAt: '2026-06-23T00:00:00.000Z',
  }
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': balancingProgress,
  }

  assert.equal(isLessonUnlocked(lessons['one-step-equations'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['two-step-equations'], progressByLesson), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'one-step-equations')
})

test('path recommends two-step equations after one-step is completed', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'one-step-equations': {
      ...createInitialProgress('user-1', 'one-step-equations'),
      status: 'completed',
      currentStepIndex: lessons['one-step-equations'].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
  }

  assert.equal(isLessonUnlocked(lessons['two-step-equations'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['like-terms-variables-both-sides'], progressByLesson), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'two-step-equations')
})

test('path recommends like terms after two-step equations are completed', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'one-step-equations': {
      ...createInitialProgress('user-1', 'one-step-equations'),
      status: 'completed',
      currentStepIndex: lessons['one-step-equations'].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'two-step-equations': {
      ...createInitialProgress('user-1', 'two-step-equations'),
      status: 'completed',
      currentStepIndex: lessons['two-step-equations'].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
  }

  assert.equal(isLessonUnlocked(lessons['like-terms-variables-both-sides'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['coordinate-plane'], progressByLesson), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'like-terms-variables-both-sides')
})

test('review suggestion does not block starting the unlocked next lesson', () => {
  const balancingProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed' as const,
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    completedAt: '2026-06-23T00:00:00.000Z',
  }
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': balancingProgress,
  }
  const reviewMastery: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 0.5,
    attempts: 4,
    correct: 2,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const oneStepProgress = createInitialProgress('user-1', 'one-step-equations')

  assert.equal(getRecommendedNextLesson(balancingEquationsLesson, reviewMastery).title, 'Review Balancing Equations')
  assert.equal(isLessonUnlocked(lessons['one-step-equations'], progressByLesson), true)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson, 'balancing-equations'), 'one-step-equations')
  assert.equal(oneStepProgress.lessonId, 'one-step-equations')
  assert.equal(isLessonUnlocked(lessons['two-step-equations'], { ...progressByLesson, 'one-step-equations': oneStepProgress }), false)
})

test('path prefers unlocked in-progress lessons before new available lessons', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'one-step-equations': {
      ...createInitialProgress('user-1', 'one-step-equations'),
      currentStepIndex: 2,
    },
  }

  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'one-step-equations')
})

test('course progress summary shows path progress and first available recommendation', () => {
  const summary = getCourseProgressSummary(algebraCourse, lessons, {})

  assert.equal(summary.totalLessons, 6)
  assert.equal(summary.completedLessons, 0)
  assert.equal(summary.percentComplete, 0)
  assert.equal(summary.lastCompletedLessonId, undefined)
  assert.equal(summary.recommendedLessonId, 'balancing-equations')
  assert.equal(summary.recommendedAction, 'start')
})

test('course progress summary reports last completed scores and next lesson', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      latestScore: {
        scorePercent: 80,
        correctFirstTryCount: 4,
        assessedStepCount: 5,
        completedAt: '2026-06-23T00:00:00.000Z',
      },
      bestScore: {
        scorePercent: 100,
        correctFirstTryCount: 5,
        assessedStepCount: 5,
        completedAt: '2026-06-23T00:00:00.000Z',
      },
      completedAt: '2026-06-23T00:00:00.000Z',
    },
  }

  const summary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson)

  assert.equal(summary.completedLessons, 1)
  assert.equal(summary.percentComplete, 17)
  assert.equal(summary.lastCompletedLessonId, 'balancing-equations')
  assert.equal(summary.recommendedLessonId, 'one-step-equations')
  assert.equal(summary.recommendedAction, 'start')
  assert.equal(summary.lastCompletedLatestScore?.scorePercent, 80)
  assert.equal(summary.lastCompletedBestScore?.scorePercent, 100)
})

test('course progress summary uses the furthest completed lesson when the path is complete', () => {
  const progressByLesson = algebraCourse.lessonOrder.reduce<ProgressByLesson>((items, lessonId) => {
    items[lessonId] = {
      ...createInitialProgress('user-1', lessonId),
      status: 'completed',
      currentStepIndex: lessons[lessonId].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    }
    return items
  }, {})

  const summary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson, 'balancing-equations')

  assert.equal(summary.completedLessons, 6)
  assert.equal(summary.percentComplete, 100)
  assert.equal(summary.lastCompletedLessonId, 'graphing-lines')
  assert.equal(summary.recommendedLessonId, 'graphing-lines')
  assert.equal(summary.recommendedAction, 'view-summary')
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson, 'balancing-equations'), 'graphing-lines')
})

test('one-step balance operation isolates x minus three', () => {
  const step = lessonStep('balance-add-three-both', 'balance', lessons['one-step-equations'])
  const operation = step.operations?.find((candidate) => candidate.id === 'add-three-both')
  assert.ok(operation)

  const solvedState = applyBalanceOperation(step.state, operation)
  const result = checkBalanceStep(step, solvedState, {}, 1)

  assert.equal(result.correct, true)
  assert.equal(result.feedback, 'Yes. x = 7 because adding 3 to both sides turns x - 3 = 4 into x = 7.')
})

test('operation choice recovery escalates from authored choice feedback to reveal', () => {
  const step = lessonStep('input-three-x', 'operation-choice', lessons['one-step-equations'])

  const firstMiss = checkOperationChoiceStep(step, 'multiply-three-both', 1)
  assert.equal(firstMiss.correct, false)
  assert.equal(firstMiss.feedback, 'Multiplying by 3 repeats the operation. To undo 3 times x, divide by 3.')
  assert.equal(firstMiss.reveal, undefined)

  const secondMiss = checkOperationChoiceStep(step, 'multiply-three-both', 2)
  assert.equal(secondMiss.feedback, '3x means multiplication, so use the inverse operation on both sides.')
  assert.equal(secondMiss.reveal, undefined)

  const thirdMiss = checkOperationChoiceStep(step, 'multiply-three-both', 3)
  assert.equal(thirdMiss.reveal, 'Choose "/3 on both sides" because 3x / 3 = x and 12 / 3 = 4.')

  const solved = checkOperationChoiceStep(step, 'divide-three-both', 2)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, 'Right. x = 4 because 12 divided by 3 is 4.')
})

test('sequence puzzle checks order and gives tile-specific misconceptions', () => {
  const step = lessonStep('input-add-six', 'sequence', lessons['one-step-equations'])

  const incomplete = checkSequenceStep(step, ['subtract-six-both'], 1)
  assert.equal(incomplete.correct, false)
  assert.equal(incomplete.feedback, 'Choose the inverse move first, then the resulting value of x.')

  const wrongFirst = checkSequenceStep(step, ['add-six-both', 'x-equals-four'], 1)
  assert.equal(wrongFirst.correct, false)
  assert.equal(wrongFirst.feedback, 'Adding 6 repeats the operation. Use the inverse operation instead.')

  const thirdMiss = checkSequenceStep(step, ['x-equals-ten', 'subtract-six-both'], 3)
  assert.equal(thirdMiss.reveal, 'Tap "Subtract 6 from both sides", then "x = 4".')

  const solved = checkSequenceStep(step, ['subtract-six-both', 'x-equals-four'], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, 'Correct. First subtract 6 from both sides, then x = 4.')
})

test('new lesson one sequence reinforces balanced undoing', () => {
  const step = lessonStep('order-balance-repair', 'sequence')

  const oneSideOnly = checkSequenceStep(step, ['subtract-one-left', 'y-equals-five'], 1)
  assert.equal(oneSideOnly.correct, false)
  assert.equal(oneSideOnly.feedback, 'That isolates y, but it changes only one side of the equation.')

  const thirdMiss = checkSequenceStep(step, ['y-equals-six', 'subtract-one-both'], 3)
  assert.equal(thirdMiss.reveal, 'Tap "Subtract 1 from both sides", then "y = 5".')

  const solved = checkSequenceStep(step, ['subtract-one-both', 'y-equals-five'], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, 'Correct. Removing 1 from both sides leaves y = 5.')
})

test('new one-step puzzles target one-side and division misconceptions', () => {
  const oneSideMistake = lessonStep('spot-one-side-only-mistake', 'operation-choice', lessons['one-step-equations'])
  const divisionOrder = lessonStep('order-division-undo', 'sequence', lessons['one-step-equations'])

  assert.equal(
    checkOperationChoiceStep(oneSideMistake, 'wrong-inverse', 1).feedback,
    'Subtracting 5 would move farther from x. The inverse is +5, but it must be applied to both sides.',
  )
  assert.equal(
    checkOperationChoiceStep(oneSideMistake, 'answer-too-large', 3).reveal,
    'The mistake is adding 5 only on the left. Correct path: x - 5 = 9 -> x = 14.',
  )

  const repeatedDivision = checkSequenceStep(divisionOrder, ['divide-four-both', 'x-equals-eight'], 1)
  assert.equal(repeatedDivision.feedback, 'Dividing by 4 again repeats the operation. Use multiplication to undo division.')

  const solved = checkSequenceStep(divisionOrder, ['multiply-four-both', 'x-equals-eight'], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, 'Correct. Multiplying both sides by 4 gives x = 8.')
})

test('one-step input and two-step mistake feedback catch inverse-operation misconceptions', () => {
  const divisionStep = lessonStep('input-x-divided-by-four', 'input', lessons['one-step-equations'])
  const twoStepMistake = lessonStep('spot-two-step-mistake', 'operation-choice', lessons['two-step-equations'])

  assert.equal(checkInputStep(divisionStep, '0.5', 3).reveal, 'x = 8 because 2 x 4 = 8.')
  assert.equal(
    checkOperationChoiceStep(twoStepMistake, 'divided-too-early', 1).feedback,
    'They did clear the +6 position first, but used the wrong inverse operation.',
  )
  assert.equal(
    checkOperationChoiceStep(twoStepMistake, 'arithmetic-slip', 3).reveal,
    'The mistake is adding 6 instead of subtracting it. Correct path: 3x + 6 = 21 -> 3x = 15 -> x = 5.',
  )
})

test('two-step inputs and balance puzzle catch authored misconceptions', () => {
  const gateInput = lessonStep('input-puzzle-gate', 'input', lessons['two-step-equations'])
  const negativeInput = lessonStep('input-negative-constant', 'input', lessons['two-step-equations'])
  const balance = lessonStep('balance-clear-four-x', 'balance', lessons['two-step-equations'])
  const addFiveBoth = balance.operations?.find((operation) => operation.id === 'add-five-both')
  const addFiveLeft = balance.operations?.find((operation) => operation.id === 'add-five-left')
  assert.ok(addFiveBoth)
  assert.ok(addFiveLeft)

  assert.equal(checkInputStep(gateInput, '21', 1).feedback, '21 is the value of the whole expression 3x + 6, not x.')
  assert.equal(checkInputStep(gateInput, '9', 1).feedback, 'That looks like adding 6 before dividing. The +6 should be subtracted away.')
  assert.equal(checkInputStep(negativeInput, '4', 1).feedback, 'Check the arithmetic after adding 7: 5 + 7 is 12, then 12 / 2 is 6.')

  const oneSideOnly = checkBalanceStep(balance, applyBalanceOperation(balance.state, addFiveLeft), { movedOneSideOnly: true }, 1)
  assert.equal(oneSideOnly.feedback, 'You cleared the x side only. A balanced equation needs the same +5 on the right side.')

  const solved = checkBalanceStep(balance, applyBalanceOperation(balance.state, addFiveBoth), {}, 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, 'The 4x bundle is alone now: 4x = 24. One more inverse move will split it into x = 6.')
})

test('two-step lesson teaches reverse order with operation and sequence puzzles', () => {
  const firstMove = lessonStep('choose-first-two-step-move', 'operation-choice', lessons['two-step-equations'])
  const ordered = lessonStep('order-two-step-solution', 'sequence', lessons['two-step-equations'])
  const mistake = lessonStep('spot-two-step-mistake', 'operation-choice', lessons['two-step-equations'])

  assert.equal(
    checkOperationChoiceStep(firstMove, 'divide-four-both', 1).feedback,
    'That split comes second. The -5 is outside the 4x bundle, so clear it before dividing.',
  )
  assert.equal(checkOperationChoiceStep(firstMove, 'add-five-left', 3).reveal, 'Choose "+5 to both sides" first. Then divide both sides by 4.')

  const wrongOrder = checkSequenceStep(ordered, ['divide-four-first', 'add-five-both', 'x-equals-six'], 1)
  assert.equal(wrongOrder.feedback, 'Dividing first is tempting, but the -5 still changes the 4x bundle.')

  const solvedOrder = checkSequenceStep(ordered, ['add-five-both', 'divide-four-both', 'x-equals-six'], 1)
  assert.equal(solvedOrder.correct, true)

  const spottedMistake = checkOperationChoiceStep(mistake, 'added-instead-of-subtracted', 1)
  assert.equal(spottedMistake.correct, true)
  assert.equal(spottedMistake.feedback, 'Right. The inverse of +6 is -6, so the path is 3x = 15, then x = 5.')
})

test('like-terms lesson combines terms before variables-on-both-sides solving', () => {
  const pairChoice = lessonStep(
    'choose-like-term-pair',
    'operation-choice',
    lessons['like-terms-variables-both-sides'],
  )
  const classifyTerms = lessonStep(
    'choose-equation-variable-terms',
    'operation-choice',
    lessons['like-terms-variables-both-sides'],
  )
  const solveOrder = lessonStep(
    'order-variable-both-sides-solution',
    'sequence',
    lessons['like-terms-variables-both-sides'],
  )
  const mistakenMove = lessonStep(
    'spot-variable-move-mistake',
    'operation-choice',
    lessons['like-terms-variables-both-sides'],
  )
  const finalInput = lessonStep('input-variable-both-sides', 'input', lessons['like-terms-variables-both-sides'])

  assert.equal(
    checkOperationChoiceStep(pairChoice, 'x-and-y', 1).feedback,
    'Those both have variables, but x and y are different variable parts, so they cannot combine.',
  )
  assert.equal(
    checkOperationChoiceStep(pairChoice, 'number-and-x', 3).reveal,
    'Choose "4x and -x" because both are x-terms.',
  )
  assert.equal(
    checkOperationChoiceStep(classifyTerms, 'left-x-terms-only', 1).feedback,
    'Those are x-terms, but 3x on the right is also a variable term. The equals sign separates sides, not term types.',
  )
  assert.equal(checkOperationChoiceStep(classifyTerms, 'all-x-terms', 1).correct, true)

  const wrongVariableMove = checkSequenceStep(
    solveOrder,
    ['add-two-x-both', 'subtract-seven-both', 'divide-three-both', 'x-equals-four'],
    1,
  )
  assert.equal(wrongVariableMove.feedback, 'Adding 2x creates more variable terms. Subtract the smaller x-term instead.')

  const solved = checkSequenceStep(
    solveOrder,
    ['subtract-two-x-both', 'subtract-seven-both', 'divide-three-both', 'x-equals-four'],
    1,
  )
  assert.equal(solved.correct, true)
  assert.equal(
    checkOperationChoiceStep(mistakenMove, 'variables-cannot-move', 1).feedback,
    'Variable terms can move if you apply the inverse to both sides. The issue is choosing the wrong inverse move.',
  )
  assert.equal(
    checkOperationChoiceStep(mistakenMove, 'added-instead-of-subtracted', 3).feedback,
    'Correct. Moving +2x off the right side means subtracting 2x from both sides, not adding it.',
  )
  assert.equal(checkInputStep(finalInput, '15', 3).reveal, '4x - 5 = x + 10 -> 3x - 5 = 10 -> 3x = 15 -> x = 5.')
  assert.equal(checkInputStep(finalInput, 'x = 5', 1).correct, true)
})

test('coordinate-plane lesson checks ordered-pair direction and quadrant misconceptions', () => {
  const coordinateLesson = lessons['coordinate-plane']
  const plotOrder = lessonStep('order-plot-point', 'sequence', lessons['coordinate-plane'])
  const pointChoice = lessonStep('choose-coordinate-point', 'operation-choice', lessons['coordinate-plane'])
  const robotInput = lessonStep('input-robot-coordinate', 'input', lessons['coordinate-plane'])
  const quadrantChoice = lessonStep('choose-quadrant', 'operation-choice', lessons['coordinate-plane'])
  const quadrantConcept = lessonStep('concept-quadrants', 'concept', lessons['coordinate-plane'])

  assert.ok(
    coordinateLesson.steps.findIndex((step) => step.id === 'concept-quadrants') <
      coordinateLesson.steps.findIndex((step) => step.id === 'choose-quadrant'),
  )
  assert.match(quadrantConcept.body, /split the plane into four regions called quadrants/i)
  assert.match(quadrantConcept.body, /Quadrant I is \(\+,\+\)/)
  assert.match(quadrantConcept.body, /Quadrant II is \(-,\+\)/)
  assert.match(quadrantConcept.body, /Quadrant III is \(-,-\)/)
  assert.match(quadrantConcept.body, /Quadrant IV is \(\+,-\)/)
  assert.match(quadrantConcept.body, /not inside any quadrant/i)

  assert.equal(
    checkSequenceStep(plotOrder, ['move-left-three', 'move-down-two', 'arrive-three-negative-two'], 1).feedback,
    'Left is for negative x-values. Here x is positive 3.',
  )

  const solvedPlot = checkSequenceStep(plotOrder, ['move-right-three', 'move-down-two', 'arrive-three-negative-two'], 1)
  assert.equal(solvedPlot.correct, true)

  assert.equal(
    checkOperationChoiceStep(pointChoice, 'two-negative-four', 1).feedback,
    'This reverses the order. x is the first coordinate, so -4 must come first.',
  )
  assert.equal(checkInputStep(robotInput, '-5,1', 1).correct, true)
  assert.equal(
    checkInputStep(robotInput, '(5,1)', 1).feedback,
    'Right 5 would be positive. Moving left makes the x-coordinate negative.',
  )
  assert.equal(
    checkOperationChoiceStep(quadrantChoice, 'quadrant-one', 3).reveal,
    'Choose "Quadrant IV" because x > 0 and y < 0 gives the sign pattern (+,-), the lower-right quadrant.',
  )
})

test('graphing-lines lesson connects slope-intercept equations, points, and tables', () => {
  const equationChoice = lessonStep('choose-slope-intercept-equation', 'operation-choice', lessons['graphing-lines'])
  const plotOrder = lessonStep('order-plot-line', 'sequence', lessons['graphing-lines'])
  const yValue = lessonStep('input-line-y-value', 'input', lessons['graphing-lines'])
  const tableChoice = lessonStep('choose-line-table', 'operation-choice', lessons['graphing-lines'])

  assert.equal(
    checkOperationChoiceStep(equationChoice, 'y-equals-two-x-plus-three', 1).feedback,
    'This swaps the two clues. The intercept is 2, so the constant should be +2.',
  )

  const flippedSlope = checkSequenceStep(plotOrder, ['start-at-intercept', 'move-right-two-up-one', 'mark-one-one'], 1)
  assert.equal(flippedSlope.feedback, 'Slope 2 is 2/1, so rise 2 and run 1.')

  const solvedPlot = checkSequenceStep(plotOrder, ['start-at-intercept', 'move-right-one-up-two', 'mark-one-one'], 1)
  assert.equal(solvedPlot.correct, true)
  assert.equal(checkInputStep(yValue, '7', 1).feedback, 'That uses +3 + 4. The equation has -x, so use -3.')
  assert.equal(
    checkOperationChoiceStep(tableChoice, 'table-two-x-minus-one', 3).reveal,
    'Choose "x: 0, 1, 2 -> y: 1, 3, 5" because 2(0)+1=1, 2(1)+1=3, and 2(2)+1=5.',
  )
})

test('lesson catalog keeps Phase 1 interactive feedback and path ids coherent', () => {
  assert.deepEqual(algebraCourse.lessonOrder, expectedLessonOrder)
  assert.deepEqual(
    algebraCourse.lessons.map((lesson) => lesson.id),
    expectedLessonOrder,
  )

  algebraCourse.lessonOrder.forEach((lessonId) => {
    assert.equal(lessons[lessonId].id, lessonId)
    assert.ok(algebraCourse.lessons.some((node) => node.id === lessonId))
    assert.deepEqual(lessons[lessonId].prerequisites, expectedPrerequisites[lessonId])
    assert.equal(lessons[lessonId].nextLessonId, expectedLessonOrder[expectedLessonOrder.indexOf(lessonId) + 1])
  })

  expectedLessonOrder.map((lessonId) => lessons[lessonId]).forEach((lesson) => {
    assert.ok(lesson.steps.length > 0)
    assert.equal(lesson.steps.at(-1)?.type, 'concept')
    assert.match(lesson.steps.at(-1)?.id ?? '', /summary/)
    assert.equal(new Set(lesson.steps.map((step) => step.id)).size, lesson.steps.length)

    lesson.steps.forEach((step) => {
      if (step.type === 'mcq') {
        assert.ok(step.options.some((option) => option.id === step.correctId))
        assert.ok(step.options.every((option) => option.feedback.length > 0))
        assert.ok(step.feedback?.correct.length)
        assert.ok(step.feedback?.incorrect.length)
        assert.ok(step.feedback?.reveal)
      }

      if (step.type === 'operation-choice') {
        assert.ok(step.choices.some((choice) => choice.id === step.correctId))
        assert.ok(step.choices.every((choice) => choice.feedback.length > 0))
        assert.ok(step.feedback.correct.length > 0)
        assert.ok(step.feedback.incorrect.length > 0)
        assert.ok(step.feedback.reveal)
      }

      if (step.type === 'sequence') {
        assert.ok(step.correctOrder.length > 0)
        assert.ok(step.correctOrder.every((id) => step.tiles.some((tile) => tile.id === id)))
        assert.ok(step.feedback.correct.length > 0)
        assert.ok(step.feedback.incorrect.length > 0)
        assert.ok(step.feedback.incomplete.length > 0)
        assert.ok(step.feedback.reveal)
      }

      if (step.type === 'input') {
        assert.ok(step.accept.length > 0)
        assert.ok(step.feedback.correct.length > 0)
        assert.ok(step.feedback.incorrect.length > 0)
        assert.ok(step.feedback.reveal)
      }

      if (step.type === 'balance') {
        assert.ok(step.feedback.correct.length > 0)
        assert.ok(step.feedback.reveal.length > 0)
        assert.ok(step.feedback.hints.length > 0)
        assert.ok(step.feedback.hints.some((hint) => hint.when === 'default'))
      }
    })
  })

  assert.ok(lessons['two-step-equations'].steps.length > 0)
  assert.equal(algebraCourse.lessons.find((node) => node.id === 'two-step-equations')?.status, 'locked')
  assert.deepEqual(lessons['two-step-equations'].prerequisites, ['one-step-equations'])
  assert.equal(algebraCourse.lessons.length, 6)
})

// --- Pure helper and edge-case coverage -------------------------------------

const weight = (id: string, value: number): BalanceState['left'][number] => ({
  id,
  label: String(value),
  value,
  kind: 'weight',
})

const conceptStep = (id: string): LessonStep => ({ id, type: 'concept', title: id, body: id })

const inputStep = (id: string, accept: string[]): LessonStep => ({
  id,
  type: 'input',
  prompt: id,
  accept,
  feedback: { correct: 'Correct.', incorrect: 'Try again.' },
})

const buildLesson = (id: LessonId, steps: LessonStep[]): Lesson => ({
  id,
  title: id,
  subtitle: id,
  skillIds: [],
  prerequisites: [],
  steps,
})

test('normalizeExpression lowercases, strips whitespace, and removes a single leading x=', () => {
  assert.equal(normalizeExpression('X = 3'), '3')
  assert.equal(normalizeExpression('  x=3  '), '3')
  assert.equal(normalizeExpression(' 3 . 5 '), '3.5')
  assert.equal(normalizeExpression('x = 6/2'), '6/2')
  assert.equal(normalizeExpression('-5, 1'), '-5,1')
  assert.equal(normalizeExpression('y = 4'), 'y=4')
})

test('sideTotal sums item values and isLevel compares both pans', () => {
  assert.equal(sideTotal([]), 0)
  assert.equal(
    sideTotal([weight('a', 3), { id: 'x', label: 'x', value: 2, kind: 'unknown' }]),
    5,
  )

  const level: BalanceState = { left: [weight('l', 5)], right: [weight('r1', 2), weight('r2', 3)] }
  assert.equal(isLevel(level), true)

  const tilted: BalanceState = { left: [weight('l', 6)], right: [] }
  assert.equal(isLevel(tilted), false)
})

test('applyBalanceOperation removes exact and reduces larger weights without mutating input', () => {
  const base: BalanceState = {
    left: [{ id: 'x', label: 'x', value: 3, kind: 'unknown' }, weight('plus2', 2)],
    right: [weight('five', 5)],
  }
  const removeTwoBoth: BalanceOperation = { id: 'op', label: '-2 both', amount: -2, sides: 'both' }

  const result = applyBalanceOperation(base, removeTwoBoth)

  assert.equal(result.left.length, 1)
  assert.equal(sideTotal(result.left), 3)
  assert.equal(result.right.length, 1)
  assert.equal(sideTotal(result.right), 3)
  assert.equal(isLevel(result), true)

  assert.equal(base.left.length, 2)
  assert.equal(sideTotal(base.right), 5)
})

test('applyBalanceOperation appends a weight when adding to a side with no inverse', () => {
  const base: BalanceState = { left: [], right: [] }
  const addThreeLeft: BalanceOperation = { id: 'op', label: '+3 left', amount: 3, sides: 'left' }

  const result = applyBalanceOperation(base, addThreeLeft)

  assert.equal(result.left.length, 1)
  assert.equal(result.left[0].value, 3)
  assert.equal(result.left[0].kind, 'weight')
  assert.equal(result.right.length, 0)
})

test('applyBalanceOperation cancels an inverse weight instead of stacking', () => {
  const base: BalanceState = { left: [weight('neg3', -3)], right: [] }
  const addThreeLeft: BalanceOperation = { id: 'op', label: '+3 left', amount: 3, sides: 'left' }

  const result = applyBalanceOperation(base, addThreeLeft)

  assert.equal(result.left.length, 0)
})

test('applyBalanceOperation with amount 0 returns an equivalent but cloned state', () => {
  const base: BalanceState = {
    left: [{ id: 'x', label: 'x', value: 3, kind: 'unknown' }],
    right: [weight('three', 3)],
  }
  const noop: BalanceOperation = { id: 'op', label: 'noop', amount: 0, sides: 'both' }

  const result = applyBalanceOperation(base, noop)

  assert.notStrictEqual(result, base)
  assert.notStrictEqual(result.left, base.left)
  assert.deepEqual(result.left, base.left)
  assert.deepEqual(result.right, base.right)
})

test('isAssessedLessonStep treats every non-concept step as assessed', () => {
  assert.equal(isAssessedLessonStep(conceptStep('intro')), false)
  assert.equal(isAssessedLessonStep(inputStep('q', ['1'])), true)
})

test('calculateLessonScore returns 100 percent when a lesson has no assessed steps', () => {
  const lesson = buildLesson('balancing-equations', [conceptStep('intro'), conceptStep('summary')])
  const progress = createInitialProgress('user-1', lesson.id)

  const score = calculateLessonScore(lesson, progress, '2026-06-23T00:00:00.000Z')

  assert.equal(score.scorePercent, 100)
  assert.equal(score.assessedStepCount, 0)
  assert.equal(score.correctFirstTryCount, 0)
  assert.equal(score.completedAt, '2026-06-23T00:00:00.000Z')
})

test('calculateLessonScore counts only assessed steps solved on the first attempt', () => {
  const lesson = buildLesson('balancing-equations', [
    conceptStep('concept'),
    inputStep('q1', ['1']),
    inputStep('q2', ['2']),
    inputStep('q3', ['3']),
    inputStep('q4', ['4']),
  ])
  const progress: LessonProgress = {
    ...createInitialProgress('user-1', lesson.id),
    stepResults: {
      q1: { correct: true, attempts: 1, feedback: 'c' },
      q2: { correct: true, attempts: 3, feedback: 'c' },
      q3: { correct: false, attempts: 2, feedback: 'i' },
    },
  }

  const score = calculateLessonScore(lesson, progress, '2026-06-23T00:00:00.000Z')

  assert.equal(score.assessedStepCount, 4)
  assert.equal(score.correctFirstTryCount, 1)
  assert.equal(score.scorePercent, 25)
})

test('getLessonCompletionHistory prefers explicit history then the latest score', () => {
  const score: LessonScore = { scorePercent: 70, correctFirstTryCount: 3, assessedStepCount: 5, completedAt: 'x' }

  assert.deepEqual(getLessonCompletionHistory(undefined), [])
  assert.deepEqual(
    getLessonCompletionHistory({ ...createInitialProgress('user-1', 'balancing-equations'), completionHistory: [score] }),
    [score],
  )
  assert.deepEqual(
    getLessonCompletionHistory({ ...createInitialProgress('user-1', 'balancing-equations'), latestScore: score }),
    [score],
  )
  assert.deepEqual(getLessonCompletionHistory(createInitialProgress('user-1', 'balancing-equations')), [])
})

test('latest and best scores fall back to a computed legacy score for older completed runs', () => {
  const lesson = balancingEquationsLesson
  const assessed = lesson.steps.filter((step) => step.type !== 'concept')
  const progress: LessonProgress = {
    ...createInitialProgress('user-1', lesson.id),
    status: 'completed',
    currentStepIndex: lesson.steps.length - 1,
    stepResults: assessed.reduce<LessonProgress['stepResults']>((acc, step) => {
      acc[step.id] = { correct: true, attempts: 1, feedback: 'c' }
      return acc
    }, {}),
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  assert.equal(getLatestLessonScore(lesson, progress)?.scorePercent, 100)
  assert.equal(getBestLessonScore(lesson, progress)?.scorePercent, 100)
  assert.equal(getLatestLessonScore(lesson, undefined), undefined)
  assert.equal(getBestLessonScore(lesson, undefined), undefined)
})

test('getBestLessonScore selects the highest score across history, latest, and best', () => {
  const lesson = balancingEquationsLesson
  const score = (scorePercent: number, completedAt: string): LessonScore => ({
    scorePercent,
    correctFirstTryCount: 0,
    assessedStepCount: 5,
    completedAt,
  })
  const progress: LessonProgress = {
    ...createInitialProgress('user-1', lesson.id),
    status: 'inProgress',
    completionHistory: [score(40, 'a'), score(90, 'b')],
    latestScore: score(60, 'c'),
    bestScore: score(80, 'd'),
  }

  assert.equal(getBestLessonScore(lesson, progress)?.scorePercent, 90)
  assert.equal(getLatestLessonScore(lesson, progress)?.scorePercent, 60)
})

test('hasCompletedLesson recognizes completed status and prior completion history', () => {
  assert.equal(hasCompletedLesson(undefined), false)
  assert.equal(hasCompletedLesson(createInitialProgress('user-1', 'balancing-equations')), false)
  assert.equal(
    hasCompletedLesson({ ...createInitialProgress('user-1', 'balancing-equations'), status: 'completed', completedAt: 'x' }),
    true,
  )
  assert.equal(
    hasCompletedLesson({
      ...createInitialProgress('user-1', 'balancing-equations'),
      completionHistory: [{ scorePercent: 80, correctFirstTryCount: 4, assessedStepCount: 5, completedAt: 'x' }],
    }),
    true,
  )
})

test('createInitialProgress starts an empty in-progress run with matching timestamps', () => {
  const progress = createInitialProgress('user-9', 'one-step-equations')

  assert.equal(progress.userId, 'user-9')
  assert.equal(progress.lessonId, 'one-step-equations')
  assert.equal(progress.status, 'inProgress')
  assert.equal(progress.currentStepIndex, 0)
  assert.deepEqual(progress.stepResults, {})
  assert.equal(progress.completedAt, undefined)
  assert.equal(progress.startedAt, progress.updatedAt)
  assert.ok(!Number.isNaN(Date.parse(progress.startedAt)))
})

test('isLessonUnlocked requires authored steps and completed prerequisites', () => {
  const emptyLesson = buildLesson('two-step-equations', [])
  assert.equal(isLessonUnlocked(emptyLesson, {}), false)

  const oneStep = lessons['one-step-equations']
  assert.equal(isLessonUnlocked(oneStep, {}), false)
  assert.equal(
    isLessonUnlocked(oneStep, {
      'balancing-equations': {
        ...createInitialProgress('user-1', 'balancing-equations'),
        status: 'completed',
        completedAt: 'x',
      },
    }),
    true,
  )
})

test('applyStepResult accumulates attempt counts across retries on the same step', () => {
  const lesson = balancingEquationsLesson
  const step = lessonStep('input-box-value', 'input')
  const start = { ...createInitialProgress('user-1', lesson.id), currentStepIndex: 4 }

  const afterFirst = applyStepResult(start, step, { correct: false, feedback: 'no' }, 5, lesson)
  const afterSecond = applyStepResult(afterFirst, step, { correct: false, feedback: 'no' }, 5, lesson)

  assert.equal(afterFirst.stepResults[step.id].attempts, 1)
  assert.equal(afterSecond.stepResults[step.id].attempts, 2)
  assert.equal(afterSecond.currentStepIndex, 4)
  assert.equal(afterSecond.status, 'inProgress')
})

test('course progress summary marks an in-progress recommended lesson as continue', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': { ...createInitialProgress('user-1', 'balancing-equations'), currentStepIndex: 2 },
  }

  const summary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson)

  assert.equal(summary.recommendedLessonId, 'balancing-equations')
  assert.equal(summary.recommendedAction, 'continue')
  assert.equal(summary.completedLessons, 0)
})

test('restartLessonProgress preserves a computed legacy score when given the lesson', () => {
  const lesson = balancingEquationsLesson
  const assessed = lesson.steps.filter((step) => step.type !== 'concept')
  const completed: LessonProgress = {
    ...createInitialProgress('user-1', lesson.id),
    status: 'completed',
    currentStepIndex: lesson.steps.length - 1,
    stepResults: assessed.reduce<LessonProgress['stepResults']>((acc, step) => {
      acc[step.id] = { correct: true, attempts: 1, feedback: 'c' }
      return acc
    }, {}),
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  const restarted = restartLessonProgress(completed, lesson)

  assert.equal(restarted.status, 'inProgress')
  assert.equal(restarted.currentStepIndex, 0)
  assert.deepEqual(restarted.stepResults, {})
  assert.equal(restarted.completedAt, undefined)
  assert.equal(restarted.latestScore?.scorePercent, 100)
  assert.equal(restarted.bestScore?.scorePercent, 100)
  assert.equal(restarted.completionHistory?.length, 1)
})

test('restartLessonProgress without a lesson keeps no score history for legacy completion', () => {
  const completed: LessonProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed',
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    completedAt: '2026-06-23T00:00:00.000Z',
  }

  const restarted = restartLessonProgress(completed)

  assert.equal(restarted.status, 'inProgress')
  assert.equal(restarted.latestScore, undefined)
  assert.equal(restarted.bestScore, undefined)
  assert.equal(restarted.completionHistory, undefined)
})

test('mastery exactly at the ready threshold advances instead of recommending review', () => {
  const oneStep = lessons['one-step-equations']
  const masteryFor = (score: number): SkillMastery[] =>
    oneStep.skillIds.map((skillId) => ({
      userId: 'user-1',
      skillId,
      score,
      attempts: 10,
      correct: 7,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    }))

  assert.equal(getRecommendedNextLesson(oneStep, masteryFor(MASTERY_READY_THRESHOLD)).title, 'Two-Step Equations')
  assert.equal(
    getRecommendedNextLesson(oneStep, masteryFor(MASTERY_READY_THRESHOLD - 0.01)).title,
    `Review ${oneStep.title}`,
  )
})
