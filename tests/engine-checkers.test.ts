import assert from 'node:assert/strict'
import { test } from 'node:test'

import { balancingEquationsLesson, type Lesson, type LessonStep } from '../src/domain'
import {
  applyBalanceOperation,
  checkBalanceStep,
  checkDragTermsStep,
  checkInputStep,
  checkOperationChoiceStep,
  checkPlotStep,
  checkSliderStep,
} from '../src/engine'
import { findHintText, findStep } from './helpers/findStep'

const lessonStep = <Type extends LessonStep['type']>(
  id: string,
  type: Type,
  lesson: Lesson = balancingEquationsLesson,
) => findStep(lesson, id, type)

// These self-contained synthetic*Step fixtures keep the checker-escalation tests independent
// of the authored lesson content, so each checker is exercised against fixed data.
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
  const missingItemHint = findHintText(step, 'missing-item')
  assert.ok(missingItemHint)

  // The empty start state has no required block placed yet, so it escalates like any miss.
  const firstMiss = checkBalanceStep(step, step.state, {}, 1)
  assert.equal(firstMiss.correct, false)
  assert.equal(firstMiss.feedback, missingItemHint)
  assert.equal(firstMiss.reveal, undefined)

  const secondMiss = checkBalanceStep(step, step.state, {}, 2)
  assert.equal(secondMiss.feedback, step.feedback.explanation)
  assert.equal(secondMiss.reveal, undefined)

  const thirdMiss = checkBalanceStep(step, step.state, {}, 3)
  assert.equal(thirdMiss.reveal, step.feedback.reveal)
})

test('balance level goal distinguishes missing item, not level, and solved states', () => {
  const step = lessonStep('drag-to-level', 'balance')
  const bank = step.state.bank ?? []
  const three = bank.find((item) => item.id === 'tray-left-3')
  const two = bank.find((item) => item.id === 'tray-left-2')
  const five = bank.find((item) => item.id === 'tray-right-5')
  assert.ok(three && two && five)

  const missingItemHint = findHintText(step, 'missing-item')
  const notLevelHint = findHintText(step, 'not-level')
  assert.ok(missingItemHint && notLevelHint)

  // Empty pans (the start state): the required blocks are still in the tray.
  const missingItem = checkBalanceStep(step, step.state, {}, 1)
  assert.equal(missingItem.correct, false)
  assert.equal(missingItem.feedback, missingItemHint)

  // Every required block is on its correct pan, but an extra weight tips the scale.
  const notLevel = checkBalanceStep(
    step,
    {
      ...step.state,
      left: [three, two],
      right: [five, { id: 'extra-right-1', label: '1', value: 1, kind: 'weight' }],
      bank: [],
    },
    {},
    1,
  )
  assert.equal(notLevel.correct, false)
  assert.equal(notLevel.feedback, notLevelHint)

  // Every required block on its correct pan and the scale level.
  const solved = checkBalanceStep(
    step,
    {
      ...step.state,
      left: [three, two],
      right: [five],
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
