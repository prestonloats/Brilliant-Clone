import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  balancingEquationsLesson,
  lessons,
  type Lesson,
  type LessonId,
  type LessonProgress,
  type LessonStep,
  type SkillMastery,
} from '../src/domain'
import {
  applyBalanceOperation,
  applyStepResult,
  buildLessonGraph,
  calculateLessonScore,
  checkBalanceStep,
  checkDragTermsStep,
  checkInputStep,
  checkOperationChoiceStep,
  checkPlotStep,
  checkSequenceStep,
  checkSliderStep,
  createInitialProgress,
  getBestLessonScore,
  getCourseProgressSummary,
  getLatestLessonScore,
  getRecommendedPathLessonId,
  getRecommendedNextLesson,
  hasCompletedLesson,
  isLessonUnlocked,
  restartLessonProgress,
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

// The path diverges after Two-Step Equations (Like Terms and Coordinate Plane run in
// parallel) and merges again at Graphing Lines (which needs both branches complete).
const expectedPrerequisites: Record<LessonId, LessonId[]> = {
  'balancing-equations': [],
  'one-step-equations': ['balancing-equations'],
  'two-step-equations': ['one-step-equations'],
  'like-terms-variables-both-sides': ['two-step-equations'],
  'coordinate-plane': ['two-step-equations'],
  'graphing-lines': ['like-terms-variables-both-sides', 'coordinate-plane'],
}

const completedProgress = (lessonId: LessonId): LessonProgress => ({
  ...createInitialProgress('user-1', lessonId),
  status: 'completed',
  currentStepIndex: lessons[lessonId].steps.length - 1,
  completedAt: '2026-06-23T00:00:00.000Z',
})

// Progress map with the given lessons marked completed, for branch-aware recommendation tests.
const completedThrough = (...lessonIds: LessonId[]): ProgressByLesson =>
  lessonIds.reduce<ProgressByLesson>((accumulator, lessonId) => {
    accumulator[lessonId] = completedProgress(lessonId)
    return accumulator
  }, {})

// Self-contained operation-choice step so feedback-escalation tests don't depend on lesson
// data the content wave is actively editing.
const syntheticOperationChoiceStep: Extract<LessonStep, { type: 'operation-choice' }> = {
  id: 'synthetic-operation-choice',
  type: 'operation-choice',
  prompt: 'Pick the move that isolates x.',
  correctId: 'divide-both',
  choices: [
    { id: 'divide-both', label: '/3 on both sides', feedback: 'Right. Dividing both sides by 3 isolates x.' },
    { id: 'multiply-both', label: 'x3 on both sides', feedback: 'Multiplying repeats the operation instead of undoing it.' },
    { id: 'divide-left', label: '/3 on the left only', feedback: 'Changing one side breaks the balance.' },
  ],
  feedback: {
    correct: 'Right. Dividing both sides by 3 isolates x.',
    incorrect: 'Undo multiplication with division, and do it to both sides.',
    reveal: 'Choose "/3 on both sides" because 3x / 3 = x.',
  },
}

// Self-contained plot steps so the checker's escalation is verified independently of the
// coordinate-plane lesson content (which the content wave is actively editing).
const syntheticPointPlotStep: Extract<LessonStep, { type: 'plot' }> = {
  id: 'synthetic-point-plot',
  type: 'plot',
  prompt: 'Plot the point (1, -2).',
  range: { min: -3, max: 3 },
  target: { kind: 'points', points: [{ x: 1, y: -2 }] },
  feedback: {
    correct: 'Right. (1, -2) is one right and two down.',
    incorrect: 'Keep the order (x, y) and each sign.',
    reveal: 'Place the point at (1, -2).',
    hints: [
      { when: 'empty', text: 'Tap the grid to drop a point.' },
      { when: 'swapped', text: 'That looks reversed. x comes first.' },
      { when: 'too-many', text: 'Only one point is needed.' },
      { when: 'default', text: 'Move one right and two down.' },
    ],
  },
}

const syntheticQuadrantPlotStep: Extract<LessonStep, { type: 'plot' }> = {
  id: 'synthetic-quadrant-plot',
  type: 'plot',
  prompt: 'Place one point in each quadrant.',
  range: { min: -4, max: 4 },
  target: { kind: 'quadrants', quadrants: [1, 2, 3, 4] },
  feedback: {
    correct: 'Every quadrant is covered.',
    incorrect: 'Cover all four quadrants with no point on an axis.',
    reveal: 'Use (2, 2), (-2, 2), (-2, -2), and (2, -2).',
    hints: [
      { when: 'empty', text: 'Start placing points in the corners.' },
      { when: 'on-axis', text: 'Keep both coordinates off the axes.' },
      { when: 'incomplete', text: 'Keep going until all four are covered.' },
      { when: 'wrong-quadrant', text: 'Two points share a quadrant.' },
      { when: 'too-many', text: 'Only four points are needed.' },
    ],
  },
}

// Self-contained slider step so the checker's escalation is verified independently of the
// graphing-lines lesson content (which the content wave is actively editing).
const syntheticSliderStep: Extract<LessonStep, { type: 'slider' }> = {
  id: 'synthetic-slider',
  type: 'slider',
  prompt: 'Match the line y = 2x + 1.',
  slope: { min: -5, max: 5 },
  intercept: { min: -5, max: 5 },
  target: { slope: 2, intercept: 1 },
  range: { min: -6, max: 6 },
  feedback: {
    correct: 'Right. y = 2x + 1.',
    incorrect: 'Match m to the rise over run and b to the y-intercept.',
    reveal: 'Set m = 2 and b = 1.',
    hints: [
      { when: 'slope-direction', text: 'This line rises, so make m positive.' },
      { when: 'slope-off', text: 'Intercept is right. Adjust the slope.' },
      { when: 'intercept-off', text: 'Slope is right. Adjust the intercept.' },
      { when: 'both-off', text: 'Set the intercept first, then the slope.' },
      { when: 'close', text: 'Almost. Nudge m and b a little more.' },
      { when: 'default', text: 'Set m = 2 and b = 1.' },
    ],
  },
}

// Self-contained drag-terms step so the checker's escalation is verified independently of the
// like-terms lesson content (which the content wave is actively editing).
const syntheticDragTermsStep: Extract<LessonStep, { type: 'dragTerms' }> = {
  id: 'synthetic-drag-terms',
  type: 'dragTerms',
  prompt: 'Sort 5x, -2x, and 7 into x-terms and constants.',
  equation: '5x - 2x + 7',
  bins: [
    { id: 'x-terms', label: 'x-terms' },
    { id: 'constants', label: 'Constants' },
  ],
  tiles: [
    { id: 't-5x', label: '5x', bin: 'x-terms' },
    { id: 't-neg-2x', label: '-2x', bin: 'x-terms' },
    { id: 't-7', label: '7', bin: 'constants' },
  ],
  feedback: {
    correct: 'Right. 5x and -2x are x-terms; 7 is a constant.',
    incorrect: 'Sort by the variable part.',
    reveal: 'x-terms: 5x and -2x. Constants: 7.',
    hints: [
      { when: 'empty', text: 'Drag a tile into a bin to start.' },
      { when: 'incomplete', text: 'Keep going until every tile is sorted.' },
      { when: 'misplaced', text: 'A tile is on the wrong team.' },
      { when: 'default', text: 'x-terms hold x; constants are plain numbers.' },
    ],
  },
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

  const afterBalancing = completedThrough('balancing-equations')

  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, cleanMastery, algebraCourse, lessons, afterBalancing).title,
    'One-Step Equations',
  )
  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, missedMastery, algebraCourse, lessons, afterBalancing).title,
    'Review Balancing Equations',
  )
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

  const afterBalancing = completedThrough('balancing-equations')
  const afterTwoStep = completedThrough('balancing-equations', 'one-step-equations', 'two-step-equations')
  const afterLikeTerms = completedThrough(
    'balancing-equations',
    'one-step-equations',
    'two-step-equations',
    'like-terms-variables-both-sides',
  )
  const everythingDone = completedThrough(...algebraCourse.lessonOrder)

  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, masteryAtThreshold, algebraCourse, lessons, afterBalancing).title,
    'One-Step Equations',
  )
  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, missingSkillMastery, algebraCourse, lessons, afterBalancing)
      .title,
    'Review Balancing Equations',
  )
  // After Two-Step, both branches unlock; the next available lesson is the first branch.
  assert.equal(
    getRecommendedNextLesson(lessons['two-step-equations'], twoStepMastery, algebraCourse, lessons, afterTwoStep).title,
    'Like Terms & Variables on Both Sides',
  )
  // Finishing Like Terms with Coordinate Plane still open points to the other branch, not
  // the locked merge lesson (Graphing Lines) the linear nextLessonId would have chosen.
  assert.equal(
    getRecommendedNextLesson(
      lessons['like-terms-variables-both-sides'],
      likeTermsMastery,
      algebraCourse,
      lessons,
      afterLikeTerms,
    ).title,
    'Coordinate Plane',
  )
  assert.equal(
    getRecommendedNextLesson(lessons['graphing-lines'], graphingMastery, algebraCourse, lessons, everythingDone).title,
    'Course path complete',
  )
})

test('next-lesson recommendation skips locked merge and already-completed branches', () => {
  const masteredFor = (lessonId: LessonId): SkillMastery[] =>
    lessons[lessonId].skillIds.map((skillId) => ({
      userId: 'user-1',
      skillId,
      score: 1,
      attempts: 4,
      correct: 4,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    }))

  // Learner took the Coordinate Plane branch first: Like Terms is still open and the merge
  // lesson (Graphing Lines) is still locked, so the linear nextLessonId would be wrong.
  const coordinateFirst = completedThrough(
    'balancing-equations',
    'one-step-equations',
    'two-step-equations',
    'coordinate-plane',
  )
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], coordinateFirst), false)
  const afterCoordinate = getRecommendedNextLesson(
    lessons['coordinate-plane'],
    masteredFor('coordinate-plane'),
    algebraCourse,
    lessons,
    coordinateFirst,
  )
  assert.equal(afterCoordinate.kind, 'next')
  assert.equal(afterCoordinate.lessonId, 'like-terms-variables-both-sides')

  // With both branches done, finishing Like Terms points at the now-unlocked merge lesson.
  const bothBranches = completedThrough(
    'balancing-equations',
    'one-step-equations',
    'two-step-equations',
    'coordinate-plane',
    'like-terms-variables-both-sides',
  )
  const afterLikeTerms = getRecommendedNextLesson(
    lessons['like-terms-variables-both-sides'],
    masteredFor('like-terms-variables-both-sides'),
    algebraCourse,
    lessons,
    bothBranches,
  )
  assert.equal(afterLikeTerms.kind, 'next')
  assert.equal(afterLikeTerms.lessonId, 'graphing-lines')

  // Finishing the final lesson ends the path gracefully instead of recommending a redo.
  const everythingDone = completedThrough(...algebraCourse.lessonOrder)
  const afterGraphing = getRecommendedNextLesson(
    lessons['graphing-lines'],
    masteredFor('graphing-lines'),
    algebraCourse,
    lessons,
    everythingDone,
  )
  assert.equal(afterGraphing.kind, 'complete')
  assert.equal(afterGraphing.lessonId, undefined)
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

  // Branch point: completing Two-Step opens both parallel lessons, but the merge lesson stays locked.
  assert.equal(isLessonUnlocked(lessons['like-terms-variables-both-sides'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['coordinate-plane'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], progressByLesson), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'like-terms-variables-both-sides')
})

test('two-step equations unlocks both parallel branches at once', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': completedProgress('balancing-equations'),
    'one-step-equations': completedProgress('one-step-equations'),
    'two-step-equations': completedProgress('two-step-equations'),
  }

  assert.equal(isLessonUnlocked(lessons['like-terms-variables-both-sides'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['coordinate-plane'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], progressByLesson), false)
})

test('graphing lines unlocks only after both parallel branches are completed', () => {
  const base: ProgressByLesson = {
    'balancing-equations': completedProgress('balancing-equations'),
    'one-step-equations': completedProgress('one-step-equations'),
    'two-step-equations': completedProgress('two-step-equations'),
  }

  const onlyLikeTerms: ProgressByLesson = {
    ...base,
    'like-terms-variables-both-sides': completedProgress('like-terms-variables-both-sides'),
  }
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], onlyLikeTerms), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, onlyLikeTerms), 'coordinate-plane')

  const onlyCoordinatePlane: ProgressByLesson = {
    ...base,
    'coordinate-plane': completedProgress('coordinate-plane'),
  }
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], onlyCoordinatePlane), false)
  assert.equal(
    getRecommendedPathLessonId(algebraCourse, lessons, onlyCoordinatePlane),
    'like-terms-variables-both-sides',
  )

  const bothBranches: ProgressByLesson = {
    ...base,
    'like-terms-variables-both-sides': completedProgress('like-terms-variables-both-sides'),
    'coordinate-plane': completedProgress('coordinate-plane'),
  }
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], bothBranches), true)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, bothBranches), 'graphing-lines')
})

test('buildLessonGraph derives ranks, branch split, and merge stages', () => {
  const graph = buildLessonGraph(algebraCourse, lessons)

  assert.equal(graph.nodes['balancing-equations'].rank, 0)
  assert.equal(graph.nodes['one-step-equations'].rank, 1)
  assert.equal(graph.nodes['two-step-equations'].rank, 2)
  assert.equal(graph.nodes['like-terms-variables-both-sides'].rank, 3)
  assert.equal(graph.nodes['coordinate-plane'].rank, 3)
  assert.equal(graph.nodes['graphing-lines'].rank, 4)

  assert.deepEqual(graph.nodes['two-step-equations'].unlocks, [
    'like-terms-variables-both-sides',
    'coordinate-plane',
  ])
  assert.deepEqual(graph.nodes['graphing-lines'].prerequisites, [
    'like-terms-variables-both-sides',
    'coordinate-plane',
  ])
  assert.deepEqual(graph.nodes['graphing-lines'].unlocks, [])

  assert.deepEqual(
    graph.stages.map((stage) => stage.connector),
    ['start', 'linear', 'linear', 'split', 'merge'],
  )

  const branchStage = graph.stages.find((stage) => stage.connector === 'split')
  assert.deepEqual(branchStage?.nodeIds, ['like-terms-variables-both-sides', 'coordinate-plane'])

  const mergeStage = graph.stages.find((stage) => stage.connector === 'merge')
  assert.deepEqual(mergeStage?.nodeIds, ['graphing-lines'])
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

  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, reviewMastery, algebraCourse, lessons, progressByLesson).title,
    'Review Balancing Equations',
  )
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

test('operation-choice keeps the chosen misconception while layering explanation then reveal', () => {
  const step = syntheticOperationChoiceStep
  const wrong = step.choices.find((choice) => choice.id === 'multiply-both')
  assert.ok(wrong)

  const firstMiss = checkOperationChoiceStep(step, wrong.id, 1)
  assert.equal(firstMiss.correct, false)
  assert.equal(firstMiss.feedback, wrong.feedback)
  assert.equal(firstMiss.reveal, undefined)

  // Attempt 2 still leads with the option's misconception and layers the generic
  // explanation into the reveal slot (previously the misconception was overwritten).
  const secondMiss = checkOperationChoiceStep(step, wrong.id, 2)
  assert.equal(secondMiss.feedback, wrong.feedback)
  assert.equal(secondMiss.reveal, step.feedback.incorrect)

  // Attempt 3 keeps the misconception and swaps the reveal slot to the exact move, so the
  // reveal field stays the authored reveal string (lesson tests rely on this).
  const thirdMiss = checkOperationChoiceStep(step, wrong.id, 3)
  assert.equal(thirdMiss.feedback, wrong.feedback)
  assert.equal(thirdMiss.reveal, step.feedback.reveal)

  const solved = checkOperationChoiceStep(step, step.correctId, 2)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)
})

test('operation-choice surfaces each newly selected wrong option misconception on later attempts', () => {
  const step = syntheticOperationChoiceStep
  const wrongChoices = step.choices.filter(
    (choice) => choice.id !== step.correctId && choice.feedback !== step.feedback.incorrect,
  )
  assert.ok(wrongChoices.length >= 2)
  const [firstWrong, secondWrong] = wrongChoices

  assert.equal(checkOperationChoiceStep(step, firstWrong.id, 1).feedback, firstWrong.feedback)

  // Selecting a DIFFERENT wrong option on attempt 2 shows that option's own misconception,
  // not the generic feedback.incorrect that previously replaced it.
  const secondMiss = checkOperationChoiceStep(step, secondWrong.id, 2)
  assert.equal(secondMiss.feedback, secondWrong.feedback)
  assert.notEqual(secondMiss.feedback, step.feedback.incorrect)
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

  const repeatedDivision = checkSequenceStep(divisionOrder, ['divide-six-both', 'x-equals-twelve'], 1)
  assert.equal(repeatedDivision.feedback, 'Dividing by 6 again repeats the operation. Use multiplication to undo division.')

  const solved = checkSequenceStep(divisionOrder, ['multiply-six-both', 'x-equals-twelve'], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, 'Correct. Multiplying both sides by 6 gives x = 12.')
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

  assert.equal(checkInputStep(gateInput, '16', 1).feedback, '16 is the value of the whole expression 2x + 4, not x.')
  assert.equal(checkInputStep(gateInput, '10', 1).feedback, 'That looks like adding 4 before dividing. The +4 should be subtracted away.')
  assert.equal(checkInputStep(negativeInput, '4', 1).feedback, 'Check the arithmetic after adding 7: 5 + 7 is 12, then 12 / 2 is 6.')

  const oneSideOnly = checkBalanceStep(balance, applyBalanceOperation(balance.state, addFiveLeft), { movedOneSideOnly: true }, 1)
  assert.equal(oneSideOnly.feedback, 'You cleared the x side only. A balanced equation needs the same +5 on the right side.')

  const solved = checkBalanceStep(balance, applyBalanceOperation(balance.state, addFiveBoth), {}, 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, 'The 4x bundle is alone now: 4x = 24. One more inverse move will split it into x = 6.')
})

test('two-step lesson teaches reverse order with operation and sequence puzzles', () => {
  const firstMove = lessonStep('choose-right-side-expression', 'operation-choice', lessons['two-step-equations'])
  const ordered = lessonStep('order-two-step-solution', 'sequence', lessons['two-step-equations'])
  const mistake = lessonStep('spot-two-step-mistake', 'operation-choice', lessons['two-step-equations'])

  assert.equal(
    checkOperationChoiceStep(firstMove, 'divide-five-both', 1).feedback,
    'That division comes second. First turn 18 = 5x + 3 into 15 = 5x.',
  )
  assert.equal(
    checkOperationChoiceStep(firstMove, 'subtract-three-right', 3).reveal,
    'Choose "-3 from both sides": 18 = 5x + 3 becomes 15 = 5x, then x = 3.',
  )

  const wrongOrder = checkSequenceStep(ordered, ['divide-four-first', 'add-five-both', 'x-equals-six'], 1)
  assert.equal(wrongOrder.feedback, 'Dividing first is tempting, but the -5 still changes the 4x bundle.')

  const solvedOrder = checkSequenceStep(ordered, ['add-five-both', 'divide-four-both', 'x-equals-six'], 1)
  assert.equal(solvedOrder.correct, true)

  const spottedMistake = checkOperationChoiceStep(mistake, 'added-instead-of-subtracted', 1)
  assert.equal(spottedMistake.correct, true)
  assert.equal(spottedMistake.feedback, 'Right. The inverse of +6 is -6, so the path is 3x = 15, then x = 5.')
})

test('like-terms lesson combines terms before variables-on-both-sides solving', () => {
  const sortTerms = lessonStep('sort-like-terms', 'dragTerms', lessons['like-terms-variables-both-sides'])
  const sortEquationTerms = lessonStep(
    'sort-equation-terms',
    'dragTerms',
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

  const sortTermsHint = (when: string) => sortTerms.feedback.hints?.find((hint) => hint.when === when)?.text
  const sortEquationHint = (when: string) => sortEquationTerms.feedback.hints?.find((hint) => hint.when === when)?.text

  // Sorting 4x + 3 - x + 2y: 4x and -x are x-terms, 2y is the y-term, 3 is the constant.
  assert.equal(
    checkDragTermsStep(
      sortTerms,
      { 'tile-4x': 'x-terms', 'tile-neg-x': 'x-terms', 'tile-2y': 'y-terms', 'tile-3': 'constants' },
      1,
    ).correct,
    true,
  )
  // Dropping the y-term onto the x team is the classic "different variable part" slip.
  assert.equal(
    checkDragTermsStep(sortTerms, { 'tile-4x': 'x-terms', 'tile-2y': 'x-terms' }, 1).feedback,
    sortTermsHint('misplaced'),
  )
  assert.equal(checkDragTermsStep(sortTerms, {}, 1).feedback, sortTermsHint('empty'))

  // The cross-the-equals-sign sort: 3x on the right is still an x-term, not a constant.
  assert.equal(
    checkDragTermsStep(
      sortEquationTerms,
      { 'tile-6x': 'x-terms', 'tile-2x': 'x-terms', 'tile-3x': 'x-terms', 'tile-neg-4': 'constants', 'tile-16': 'constants' },
      1,
    ).correct,
    true,
  )
  assert.equal(
    checkDragTermsStep(sortEquationTerms, { 'tile-3x': 'constants' }, 1).feedback,
    sortEquationHint('misplaced'),
  )

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

test('plot checker escalates exact-point feedback from hint to explanation to reveal', () => {
  const step = syntheticPointPlotStep

  assert.equal(checkPlotStep(step, [{ x: 1, y: -2 }], 1).correct, true)
  assert.equal(checkPlotStep(step, [], 1).feedback, 'Tap the grid to drop a point.')
  assert.equal(checkPlotStep(step, [{ x: -2, y: 1 }], 1).feedback, 'That looks reversed. x comes first.')
  assert.equal(checkPlotStep(step, [{ x: 1, y: -2 }, { x: 0, y: 0 }], 1).feedback, 'Only one point is needed.')

  const secondMiss = checkPlotStep(step, [{ x: 3, y: 3 }], 2)
  assert.equal(secondMiss.feedback, step.feedback.incorrect)
  assert.equal(secondMiss.reveal, undefined)

  const thirdMiss = checkPlotStep(step, [{ x: 3, y: 3 }], 3)
  assert.equal(thirdMiss.feedback, step.feedback.incorrect)
  assert.equal(thirdMiss.reveal, step.feedback.reveal)
})

test('plot checker validates one off-axis point per quadrant by sign pattern', () => {
  const step = syntheticQuadrantPlotStep

  const solved = checkPlotStep(
    step,
    [{ x: 2, y: 2 }, { x: -2, y: 2 }, { x: -2, y: -2 }, { x: 2, y: -2 }],
    1,
  )
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)

  assert.equal(checkPlotStep(step, [{ x: 1, y: 0 }], 1).feedback, 'Keep both coordinates off the axes.')
  assert.equal(checkPlotStep(step, [{ x: 2, y: 2 }, { x: -2, y: 2 }], 1).feedback, 'Keep going until all four are covered.')
  assert.equal(checkPlotStep(step, [{ x: 1, y: 1 }, { x: 2, y: 2 }], 1).feedback, 'Two points share a quadrant.')
  assert.equal(
    checkPlotStep(
      step,
      [{ x: 2, y: 2 }, { x: -2, y: 2 }, { x: -2, y: -2 }, { x: 2, y: -2 }, { x: 3, y: 3 }],
      1,
    ).feedback,
    'Only four points are needed.',
  )

  const thirdMiss = checkPlotStep(step, [{ x: 1, y: 1 }], 3)
  assert.equal(thirdMiss.correct, false)
  assert.equal(thirdMiss.reveal, step.feedback.reveal)
})

test('slider checker matches slope and intercept and routes targeted hints', () => {
  const step = syntheticSliderStep

  assert.equal(checkSliderStep(step, { slope: 2, intercept: 1 }, 1).correct, true)
  // Wrong sign on the slope is caught before the generic misses (line tilts the wrong way).
  assert.equal(checkSliderStep(step, { slope: -2, intercept: 1 }, 1).feedback, 'This line rises, so make m positive.')
  // Intercept already matches, so only the slope hint surfaces, and vice versa.
  assert.equal(checkSliderStep(step, { slope: 5, intercept: 1 }, 1).feedback, 'Intercept is right. Adjust the slope.')
  assert.equal(checkSliderStep(step, { slope: 2, intercept: 5 }, 1).feedback, 'Slope is right. Adjust the intercept.')
  // Both far off vs. both within one step route to the distinct both-off / close hints.
  assert.equal(checkSliderStep(step, { slope: 5, intercept: -4 }, 1).feedback, 'Set the intercept first, then the slope.')
  assert.equal(checkSliderStep(step, { slope: 3, intercept: 0 }, 1).feedback, 'Almost. Nudge m and b a little more.')
})

test('slider checker escalates to explanation then reveal on repeated misses', () => {
  const step = syntheticSliderStep

  const secondMiss = checkSliderStep(step, { slope: 5, intercept: -4 }, 2)
  assert.equal(secondMiss.feedback, step.feedback.incorrect)
  assert.equal(secondMiss.reveal, undefined)

  const thirdMiss = checkSliderStep(step, { slope: 5, intercept: -4 }, 3)
  assert.equal(thirdMiss.correct, false)
  assert.equal(thirdMiss.feedback, step.feedback.incorrect)
  assert.equal(thirdMiss.reveal, step.feedback.reveal)
})

test('drag-terms checker passes only when every tile is in its correct bin and routes hints', () => {
  const step = syntheticDragTermsStep

  const solved = checkDragTermsStep(step, { 't-5x': 'x-terms', 't-neg-2x': 'x-terms', 't-7': 'constants' }, 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)

  // Nothing sorted, all-correct-but-incomplete, and a wrong bin route to their authored hints.
  assert.equal(checkDragTermsStep(step, {}, 1).feedback, 'Drag a tile into a bin to start.')
  assert.equal(checkDragTermsStep(step, { 't-5x': 'x-terms' }, 1).feedback, 'Keep going until every tile is sorted.')
  assert.equal(
    checkDragTermsStep(step, { 't-5x': 'constants', 't-neg-2x': 'x-terms', 't-7': 'constants' }, 1).feedback,
    'A tile is on the wrong team.',
  )
  // A misplaced tile is surfaced before the incomplete nudge even while tiles remain unsorted.
  assert.equal(checkDragTermsStep(step, { 't-7': 'x-terms' }, 1).feedback, 'A tile is on the wrong team.')
})

test('drag-terms checker escalates to explanation then reveal on repeated misses', () => {
  const step = syntheticDragTermsStep
  const wrong = { 't-5x': 'constants', 't-neg-2x': 'x-terms', 't-7': 'constants' }

  const secondMiss = checkDragTermsStep(step, wrong, 2)
  assert.equal(secondMiss.feedback, step.feedback.incorrect)
  assert.equal(secondMiss.reveal, undefined)

  const thirdMiss = checkDragTermsStep(step, wrong, 3)
  assert.equal(thirdMiss.correct, false)
  assert.equal(thirdMiss.feedback, step.feedback.incorrect)
  assert.equal(thirdMiss.reveal, step.feedback.reveal)
})

test('coordinate-plane lesson checks ordered-pair direction and quadrant misconceptions', () => {
  const coordinateLesson = lessons['coordinate-plane']
  const plotOrder = lessonStep('order-plot-point', 'sequence', lessons['coordinate-plane'])
  const pointPlot = lessonStep('choose-coordinate-point', 'plot', lessons['coordinate-plane'])
  const robotInput = lessonStep('input-robot-coordinate', 'input', lessons['coordinate-plane'])
  const quadrantPlot = lessonStep('choose-quadrant', 'plot', lessons['coordinate-plane'])
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

  const solvedSequence = checkSequenceStep(plotOrder, ['move-right-three', 'move-down-two', 'arrive-three-negative-two'], 1)
  assert.equal(solvedSequence.correct, true)

  // The point recognition MCQ is now an interactive plot: placing (-4, 2) is correct, while a
  // reversed pair earns the authored "swapped" hint.
  assert.equal(checkPlotStep(pointPlot, [{ x: -4, y: 2 }], 1).correct, true)
  assert.equal(
    checkPlotStep(pointPlot, [{ x: 2, y: -4 }], 1).feedback,
    pointPlot.feedback.hints?.find((hint) => hint.when === 'swapped')?.text,
  )

  assert.equal(checkInputStep(robotInput, '-5,1', 1).correct, true)
  assert.equal(
    checkInputStep(robotInput, '(5,1)', 1).feedback,
    'Right 5 would be positive. Moving left makes the x-coordinate negative.',
  )

  // The quadrant recognition MCQ is now a plot in Quadrant IV that escalates to its reveal.
  assert.equal(checkPlotStep(quadrantPlot, [{ x: 3, y: -2 }], 1).correct, true)
  assert.equal(checkPlotStep(quadrantPlot, [{ x: 1, y: 1 }], 3).reveal, quadrantPlot.feedback.reveal)
})

test('graphing-lines lesson connects slope-intercept sliders, points, and tables', () => {
  const matchLine = lessonStep('match-slope-intercept-line', 'slider', lessons['graphing-lines'])
  const plotOrder = lessonStep('order-plot-line', 'sequence', lessons['graphing-lines'])
  const yValue = lessonStep('input-line-y-value', 'input', lessons['graphing-lines'])
  const tableChoice = lessonStep('choose-line-table', 'operation-choice', lessons['graphing-lines'])

  // Dragging m and b to the described line (slope 3, intercept 2) solves it; a matching
  // intercept with the wrong slope surfaces the slope-only hint.
  assert.equal(checkSliderStep(matchLine, { slope: 3, intercept: 2 }, 1).correct, true)
  assert.equal(
    checkSliderStep(matchLine, { slope: 3, intercept: -2 }, 1).feedback,
    matchLine.feedback.hints?.find((hint) => hint.when === 'intercept-off')?.text,
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

      if (step.type === 'dragTerms') {
        assert.ok(step.tiles.length > 0)
        assert.ok(step.bins.length > 0)
        // Every tile must point at a real bin, and ids stay unique so placements are unambiguous.
        assert.ok(step.tiles.every((tile) => step.bins.some((bin) => bin.id === tile.bin)))
        assert.equal(new Set(step.tiles.map((tile) => tile.id)).size, step.tiles.length)
        assert.equal(new Set(step.bins.map((bin) => bin.id)).size, step.bins.length)
        assert.ok(step.feedback.correct.length > 0)
        assert.ok(step.feedback.incorrect.length > 0)
        assert.ok(step.feedback.reveal.length > 0)
      }
    })
  })

  assert.ok(lessons['two-step-equations'].steps.length > 0)
  assert.equal(algebraCourse.lessons.find((node) => node.id === 'two-step-equations')?.status, 'locked')
  assert.deepEqual(lessons['two-step-equations'].prerequisites, ['one-step-equations'])
  assert.equal(algebraCourse.lessons.length, 6)
})
