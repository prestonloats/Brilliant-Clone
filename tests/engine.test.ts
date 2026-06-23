import assert from 'node:assert/strict'
import { test } from 'node:test'

import { algebraCourse, balancingEquationsLesson, lessons, type Lesson, type LessonStep, type SkillMastery } from '../src/domain'
import {
  applyBalanceOperation,
  applyStepResult,
  checkBalanceStep,
  checkInputStep,
  checkOperationChoiceStep,
  checkSequenceStep,
  createInitialProgress,
  getRecommendedPathLessonId,
  getRecommendedNextLesson,
  isLessonUnlocked,
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
    balancingEquationsLesson.steps.length,
  )

  assert.equal(nextProgress.currentStepIndex, currentStepIndex)
  assert.equal(nextProgress.status, 'inProgress')
  assert.equal(nextProgress.stepResults[step.id].attempts, 1)
  assert.equal(nextProgress.stepResults[step.id].correct, false)
})

const finalSummaryCases = [
  {
    lesson: balancingEquationsLesson,
    finalAssessedId: 'choose-balanced-move',
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
      lesson.steps.length,
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
      lesson.steps.length,
      false,
    )

    assert.equal(nextProgress.status, 'completed')
    assert.equal(nextProgress.currentStepIndex, finalSummaryIndex)
    assert.equal(nextProgress.stepResults[finalSummaryStep.id].attempts, 0)
    assert.ok(nextProgress.completedAt)
  })
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
  const finalLessonMastery: SkillMastery[] = [
    {
      userId: 'user-1',
      skillId: 'two-step-equations',
      score: 1,
      attempts: 4,
      correct: 4,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    },
  ]

  assert.equal(getRecommendedNextLesson(balancingEquationsLesson, masteryAtThreshold).title, 'One-Step Equations')
  assert.equal(getRecommendedNextLesson(balancingEquationsLesson, missingSkillMastery).title, 'Review Balancing Equations')
  assert.equal(getRecommendedNextLesson(lessons['two-step-equations'], finalLessonMastery).title, 'Course path complete')
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
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'two-step-equations')
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

test('one-step input and two-step mistake feedback catch inverse-operation misconceptions', () => {
  const divisionStep = lessonStep('input-x-divided-by-four', 'input', lessons['one-step-equations'])
  const twoStepMistake = lessonStep('spot-two-step-mistake', 'operation-choice', lessons['two-step-equations'])

  assert.equal(checkInputStep(divisionStep, '0.5', 3).reveal, 'x = 8 because 2 x 4 = 8.')
  assert.equal(
    checkOperationChoiceStep(twoStepMistake, 'one-side-only', 1).feedback,
    'They changed both sides by division. The issue is the order of the undoing moves.',
  )
  assert.equal(
    checkOperationChoiceStep(twoStepMistake, 'subtracted-wrong', 3).reveal,
    'The mistake is dividing by 2 before removing +3. Correct path: 2x + 3 = 11 -> 2x = 8 -> x = 4.',
  )
})

test('two-step lesson teaches reverse order with operation and sequence puzzles', () => {
  const firstMove = lessonStep('choose-first-two-step-move', 'operation-choice', lessons['two-step-equations'])
  const ordered = lessonStep('order-two-step-solution', 'sequence', lessons['two-step-equations'])
  const mistake = lessonStep('spot-two-step-mistake', 'operation-choice', lessons['two-step-equations'])

  assert.equal(
    checkOperationChoiceStep(firstMove, 'divide-two-both', 1).feedback,
    'That is the second undoing move. The +3 is outside the 2x, so clear it first.',
  )
  assert.equal(checkOperationChoiceStep(firstMove, 'subtract-three-left', 3).reveal, 'Choose "-3 from both sides" first. Then divide both sides by 2.')

  const wrongOrder = checkSequenceStep(ordered, ['divide-two-first', 'subtract-three-both', 'x-equals-four'], 1)
  assert.equal(wrongOrder.feedback, 'Dividing first is tempting, but the +3 is outside the multiplication.')

  const solvedOrder = checkSequenceStep(ordered, ['subtract-three-both', 'divide-two-both', 'x-equals-four'], 1)
  assert.equal(solvedOrder.correct, true)

  const spottedMistake = checkOperationChoiceStep(mistake, 'divided-too-early', 1)
  assert.equal(spottedMistake.correct, true)
  assert.equal(spottedMistake.feedback, 'Right. Undo +3 first to make 2x = 8, then divide by 2 to get x = 4.')
})

test('lesson catalog keeps Phase 1 interactive feedback and path ids coherent', () => {
  algebraCourse.lessonOrder.forEach((lessonId) => {
    assert.equal(lessons[lessonId].id, lessonId)
    assert.ok(algebraCourse.lessons.some((node) => node.id === lessonId))
  })

  ;([balancingEquationsLesson, lessons['one-step-equations'], lessons['two-step-equations']] satisfies Lesson[]).forEach((lesson) => {
    assert.ok(lesson.steps.length > 0)
    assert.equal(lesson.steps.at(-1)?.type, 'concept')
    assert.match(lesson.steps.at(-1)?.id ?? '', /summary/)
    assert.equal(new Set(lesson.steps.map((step) => step.id)).size, lesson.steps.length)

    lesson.steps.forEach((step) => {
      if (step.type === 'mcq') {
        assert.ok(step.options.some((option) => option.id === step.correctId))
        assert.ok(step.options.every((option) => option.feedback.length > 0))
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
})
