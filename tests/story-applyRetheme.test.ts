// The core Story Mode safety proof.
//
// `applyRetheme` rewrites only the DISPLAY TEXT of a question; the answer key
// (`accept`, `correctId`, `correctOrder`) is copied verbatim from the original and
// never read from the LLM result. These tests prove, for every rethemable step type,
// that a themed clone grades IDENTICALLY to the original via the REAL pure checkers in
// `src/engine/checkers.ts`, and that any malformed rewrite falls back to the original
// with its answer key intact.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  balancingEquationsLesson,
  oneStepEquationsLesson,
  type LessonStep,
} from '../src/domain'
import {
  checkInputStep,
  checkOperationChoiceStep,
  checkSequenceStep,
} from '../src/engine'
import { applyRetheme } from '../src/story/applyRetheme'
import type { RethemeResult } from '../src/story/storyAi'
import { findStep } from './helpers/findStep'

// Real authored steps, one per rethemable type, drawn from the first two lessons
// (the Story Mode unlock pool).
const inputStep = findStep(balancingEquationsLesson, 'input-box-value', 'input')
const mcqStep = findStep(balancingEquationsLesson, 'predict-add-left', 'mcq')
const sequenceStep = findStep(balancingEquationsLesson, 'order-balance-repair', 'sequence')
const operationChoiceStep = findStep(oneStepEquationsLesson, 'spot-one-side-only-mistake', 'operation-choice')

// MCQ has no pure `checkMcqStep`; the view grades `selectedId === step.correctId`
// (see src/lesson/steps/MultipleChoiceStep.tsx). Mirror that canonical rule here so the
// parity proof covers all four types.
const gradeMcq = (step: Extract<LessonStep, { type: 'mcq' }>, id: string) => id === step.correctId

// Map a labeled source list onto a themed list with the SAME ids but rewritten labels.
const retheme = (items: ReadonlyArray<{ id: string }>, label: (index: number) => string) =>
  items.map((item, index) => ({ id: item.id, label: label(index) }))

test('applyRetheme(input): themed clone grades identically and preserves accept[]', () => {
  const result: RethemeResult = {
    themedPrompt: 'Captain Nova reads the airlock gauge x + 2 = 5. How many fuel cells hide in the box?',
  }
  const { step, themed } = applyRetheme(inputStep, result)
  assert.equal(themed, true)
  assert.notEqual(step, inputStep) // a fresh clone, not the original
  assert.equal(step.type, 'input')

  const themedInput = step as Extract<LessonStep, { type: 'input' }>
  // Display text changed...
  assert.equal(themedInput.prompt, result.themedPrompt)
  assert.notEqual(themedInput.prompt, inputStep.prompt)
  // ...but the answer key is byte-for-byte identical and is a copy (deep clone).
  assert.deepEqual(themedInput.accept, inputStep.accept)
  assert.notEqual(themedInput.accept, inputStep.accept)

  // Grading parity via the REAL checker for both a correct and an incorrect answer.
  for (const answer of ['3', '6/2', '5', '2', 'banana']) {
    assert.equal(
      checkInputStep(themedInput, answer).correct,
      checkInputStep(inputStep, answer).correct,
      `input grading diverged for answer "${answer}"`,
    )
  }
  assert.equal(checkInputStep(themedInput, '3').correct, true)
  assert.equal(checkInputStep(themedInput, '5').correct, false)
})

test('applyRetheme(mcq): themed clone grades identically and preserves correctId/options', () => {
  const result: RethemeResult = {
    themedPrompt: 'The cargo pod shifts from 3 = 3 to 3 + 2 versus 3. Which way does the gantry tip?',
    themedOptions: retheme(mcqStep.options, (i) => `Themed option ${i}`),
  }
  const { step, themed } = applyRetheme(mcqStep, result)
  assert.equal(themed, true)
  assert.notEqual(step, mcqStep)

  const themedMcq = step as Extract<LessonStep, { type: 'mcq' }>
  assert.equal(themedMcq.prompt, result.themedPrompt)
  // The correct answer key is untouched.
  assert.equal(themedMcq.correctId, mcqStep.correctId)
  // Every option id is preserved, only labels changed.
  assert.deepEqual(
    themedMcq.options.map((o) => o.id),
    mcqStep.options.map((o) => o.id),
  )
  themedMcq.options.forEach((option, index) => {
    assert.equal(option.label, `Themed option ${index}`)
    // Per-option misconception feedback (graded text) is preserved.
    assert.equal(option.feedback, mcqStep.options[index].feedback)
  })

  for (const id of [...mcqStep.options.map((o) => o.id), 'nonexistent']) {
    assert.equal(gradeMcq(themedMcq, id), gradeMcq(mcqStep, id), `mcq grading diverged for id "${id}"`)
  }
  assert.equal(gradeMcq(themedMcq, mcqStep.correctId), true)
  assert.equal(gradeMcq(themedMcq, 'stays-level'), false)
})

test('applyRetheme(operation-choice): themed clone grades identically and preserves correctId', () => {
  const result: RethemeResult = {
    themedPrompt: 'A rookie pilot balances x - 5 = 9 by boosting only one thruster and gets x = 9. What went wrong?',
    themedOptions: retheme(operationChoiceStep.choices, (i) => `Themed choice ${i}`),
  }
  const { step, themed } = applyRetheme(operationChoiceStep, result)
  assert.equal(themed, true)
  assert.notEqual(step, operationChoiceStep)

  const themedChoice = step as Extract<LessonStep, { type: 'operation-choice' }>
  assert.equal(themedChoice.prompt, result.themedPrompt)
  assert.equal(themedChoice.correctId, operationChoiceStep.correctId)
  assert.deepEqual(
    themedChoice.choices.map((c) => c.id),
    operationChoiceStep.choices.map((c) => c.id),
  )

  for (const id of [...operationChoiceStep.choices.map((c) => c.id), 'nope']) {
    assert.equal(
      checkOperationChoiceStep(themedChoice, id).correct,
      checkOperationChoiceStep(operationChoiceStep, id).correct,
      `operation-choice grading diverged for id "${id}"`,
    )
  }
  assert.equal(checkOperationChoiceStep(themedChoice, operationChoiceStep.correctId).correct, true)
  assert.equal(checkOperationChoiceStep(themedChoice, 'wrong-inverse').correct, false)
})

test('applyRetheme(sequence): themed clone grades identically and preserves correctOrder', () => {
  const result: RethemeResult = {
    themedPrompt: 'Order the shortest spell to rebalance the rune y + 1 = 6.',
    themedTiles: retheme(sequenceStep.tiles, (i) => `Themed tile ${i}`),
  }
  const { step, themed } = applyRetheme(sequenceStep, result)
  assert.equal(themed, true)
  assert.notEqual(step, sequenceStep)

  const themedSequence = step as Extract<LessonStep, { type: 'sequence' }>
  assert.equal(themedSequence.prompt, result.themedPrompt)
  assert.deepEqual(themedSequence.correctOrder, sequenceStep.correctOrder)
  assert.notEqual(themedSequence.correctOrder, sequenceStep.correctOrder) // deep-cloned copy
  assert.deepEqual(
    themedSequence.tiles.map((t) => t.id),
    sequenceStep.tiles.map((t) => t.id),
  )

  const correctOrder = sequenceStep.correctOrder
  const wrongOrder = [...correctOrder].reverse()
  for (const order of [correctOrder, wrongOrder, ['y-equals-six', 'subtract-one-left'], []]) {
    assert.equal(
      checkSequenceStep(themedSequence, order).correct,
      checkSequenceStep(sequenceStep, order).correct,
      `sequence grading diverged for order [${order.join(', ')}]`,
    )
  }
  assert.equal(checkSequenceStep(themedSequence, correctOrder).correct, true)
  assert.equal(checkSequenceStep(themedSequence, wrongOrder).correct, false)
})

test('applyRetheme falls back when the prompt is missing or empty', () => {
  for (const themedPrompt of ['', '   ']) {
    const { step, themed } = applyRetheme(inputStep, { themedPrompt })
    assert.equal(themed, false)
    assert.equal(step, inputStep) // exact original returned, not a clone
  }
  // Missing themedPrompt entirely.
  const { step, themed } = applyRetheme(inputStep, {} as RethemeResult)
  assert.equal(themed, false)
  assert.equal(step, inputStep)
})

test('applyRetheme(mcq) falls back on a mismatched id set and keeps the answer key intact', () => {
  const base = retheme(mcqStep.options, (i) => `Themed ${i}`)

  // (a) An option id was dropped.
  const dropped = applyRetheme(mcqStep, { themedPrompt: 'ok', themedOptions: base.slice(1) })
  assert.equal(dropped.themed, false)
  assert.equal(dropped.step, mcqStep)

  // (b) An extra unknown id was added.
  const added = applyRetheme(mcqStep, {
    themedPrompt: 'ok',
    themedOptions: [...base, { id: 'sneaky-extra', label: 'extra' }],
  })
  assert.equal(added.themed, false)
  assert.equal(added.step, mcqStep)

  // (c) An id was renamed (same count, different set).
  const renamed = applyRetheme(mcqStep, {
    themedPrompt: 'ok',
    themedOptions: base.map((o, i) => (i === 0 ? { id: 'renamed', label: o.label } : o)),
  })
  assert.equal(renamed.themed, false)
  assert.equal(renamed.step, mcqStep)

  // (d) themedOptions omitted entirely for a choice step.
  const omitted = applyRetheme(mcqStep, { themedPrompt: 'ok' })
  assert.equal(omitted.themed, false)
  assert.equal(omitted.step, mcqStep)

  // The original answer key is never mutated by any failed attempt.
  assert.equal(mcqStep.correctId, 'tips-left')
  assert.equal(gradeMcq(mcqStep, 'tips-left'), true)
})

test('applyRetheme(mcq) falls back when any themed label is empty', () => {
  const withEmpty = retheme(mcqStep.options, (i) => (i === 1 ? '' : `Themed ${i}`))
  const { step, themed } = applyRetheme(mcqStep, { themedPrompt: 'ok', themedOptions: withEmpty })
  assert.equal(themed, false)
  assert.equal(step, mcqStep)
})

test('applyRetheme(sequence) falls back on a mismatched tile id set', () => {
  const base = retheme(sequenceStep.tiles, (i) => `Tile ${i}`)
  const dropped = applyRetheme(sequenceStep, { themedPrompt: 'ok', themedTiles: base.slice(1) })
  assert.equal(dropped.themed, false)
  assert.equal(dropped.step, sequenceStep)

  // correctOrder is untouched and still grades the authored solution.
  assert.deepEqual(sequenceStep.correctOrder, ['subtract-one-both', 'y-equals-five'])
  assert.equal(checkSequenceStep(sequenceStep, sequenceStep.correctOrder).correct, true)
})

test('applyRetheme ignores any answer-key-like fields smuggled into the result', () => {
  // RethemeResult has no answer-key fields, but a malicious/buggy model could send extras.
  // applyRetheme must never read them: grading still uses the ORIGINAL key.
  const malicious = {
    themedPrompt: 'Solve the rune x + 2 = 5.',
    correctId: 'stays-level', // wrong answer, must be ignored
    accept: ['999'], // must be ignored
    correctOrder: ['y-equals-six'], // must be ignored
  } as unknown as RethemeResult

  const { step, themed } = applyRetheme(inputStep, malicious)
  assert.equal(themed, true)
  const themedInput = step as Extract<LessonStep, { type: 'input' }>
  assert.deepEqual(themedInput.accept, inputStep.accept) // not ['999']
  assert.equal(checkInputStep(themedInput, '3').correct, true)
  assert.equal(checkInputStep(themedInput, '999').correct, false)
})

test('applyRetheme falls back for non-rethemable step types', () => {
  const conceptStep = findStep(balancingEquationsLesson, 'concept-balance', 'concept')
  const { step, themed } = applyRetheme(conceptStep, { themedPrompt: 'should be ignored' })
  assert.equal(themed, false)
  assert.equal(step, conceptStep)
})
