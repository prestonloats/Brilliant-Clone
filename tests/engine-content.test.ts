import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  balancingEquationsLesson,
  lessons,
  type Lesson,
  type LessonId,
  type LessonStep,
} from '../src/domain'
import {
  applyBalanceOperation,
  checkBalanceStep,
  checkDragTermsStep,
  checkInputStep,
  checkOperationChoiceStep,
  checkPlotStep,
  checkSequenceStep,
  checkSliderStep,
} from '../src/engine'
import { findHintText, findStep } from './helpers/findStep'

const lessonStep = <Type extends LessonStep['type']>(
  id: string,
  type: Type,
  lesson: Lesson = balancingEquationsLesson,
) => findStep(lesson, id, type)

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

test('one-step balance operation isolates x minus three', () => {
  const step = lessonStep('balance-add-three-both', 'balance', lessons['one-step-equations'])
  const operation = step.operations?.find((candidate) => candidate.id === 'add-three-both')
  assert.ok(operation)

  const solvedState = applyBalanceOperation(step.state, operation)
  const result = checkBalanceStep(step, solvedState, {}, 1)

  assert.equal(result.correct, true)
  assert.equal(result.feedback, 'Yes. x = 7 because adding 3 to both sides turns x - 3 = 4 into x = 7.')
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

  const wrongOrder = checkSequenceStep(ordered, ['subtract-five-both', 'divide-four-both', 'x-equals-six'], 1)
  assert.equal(wrongOrder.feedback, 'Subtracting 5 repeats the -5. Add 5 to undo it.')

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

  const sortTermsHint = (when: string) => findHintText(sortTerms, when)
  const sortEquationHint = (when: string) => findHintText(sortEquationTerms, when)

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
  // Clearing the constant before the x-term is equally valid since the two moves commute.
  const solvedSevenFirst = checkSequenceStep(
    solveOrder,
    ['subtract-seven-both', 'subtract-two-x-both', 'divide-three-both', 'x-equals-four'],
    1,
  )
  assert.equal(solvedSevenFirst.correct, true)
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
  // Moving down first then right reaches the same point, so it is accepted too.
  const solvedDownFirst = checkSequenceStep(plotOrder, ['move-down-two', 'move-right-three', 'arrive-three-negative-two'], 1)
  assert.equal(solvedDownFirst.correct, true)

  // The point recognition MCQ is now an interactive plot: placing (-4, 2) is correct, while a
  // reversed pair earns the authored "swapped" hint.
  assert.equal(checkPlotStep(pointPlot, [{ x: -4, y: 2 }], 1).correct, true)
  assert.equal(
    checkPlotStep(pointPlot, [{ x: 2, y: -4 }], 1).feedback,
    findHintText(pointPlot, 'swapped'),
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
    findHintText(matchLine, 'intercept-off'),
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
  assert.deepEqual(lessons['two-step-equations'].prerequisites, ['one-step-equations'])
  assert.equal(algebraCourse.lessons.length, 6)
})
