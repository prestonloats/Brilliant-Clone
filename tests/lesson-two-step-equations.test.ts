import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lessons } from '../src/domain'
import { checkInputStep, checkManipulativeStep, checkSequenceStep } from '../src/engine'
import { findHintText, findStepIn } from './helpers/findStep'

const twoStep = lessons['two-step-equations']

const step = findStepIn(twoStep)

test('two-step lesson keeps a concept summary last and the new content before it', () => {
  const steps = twoStep.steps
  const ids = steps.map((candidate) => candidate.id)

  // Final step stays a concept summary so the lesson never ends on an assessed step.
  assert.equal(steps.at(-1)?.type, 'concept')
  assert.match(steps.at(-1)?.id ?? '', /summary/)

  // Unique step ids and all new content present.
  assert.equal(new Set(ids).size, ids.length)
  for (const id of [
    'manipulative-split-reactor-cores',
    'mastery-input-word-problem',
    'mastery-order-division-two-step',
  ]) {
    assert.ok(ids.includes(id), `expected new step ${id}`)
  }

  // New assessed steps land before the final concept summary.
  const summaryIndex = ids.indexOf('complete-two-step-summary')
  for (const id of [
    'manipulative-split-reactor-cores',
    'mastery-input-word-problem',
    'mastery-order-division-two-step',
  ]) {
    assert.ok(ids.indexOf(id) < summaryIndex, `${id} should come before the summary`)
  }

  // Scoring/path invariant: spot-two-step-mistake remains the final assessed step.
  assert.equal(ids.indexOf('spot-two-step-mistake'), steps.length - 2)
})

test('manipulative reactor puzzle accepts the even split that uses every core', () => {
  const reactor = step('manipulative-split-reactor-cores', 'manipulative')
  assert.equal(reactor.goal.type, 'equal-groups')

  const solved = checkManipulativeStep(reactor, [4, 4, 4, 4], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, reactor.feedback.correct)
})

test('manipulative reactor puzzle escalates targeted hints into a reveal', () => {
  const reactor = step('manipulative-split-reactor-cores', 'manipulative')
  const hintText = (when: string) => findHintText(reactor, when)

  const empty = checkManipulativeStep(reactor, [0, 0, 0, 0], 1)
  assert.equal(empty.correct, false)
  assert.equal(empty.feedback, hintText('empty'))

  assert.equal(checkManipulativeStep(reactor, [6, 4, 4, 2], 1).feedback, hintText('too-many'))
  assert.equal(checkManipulativeStep(reactor, [4, 4, 4, 3], 1).feedback, hintText('uneven'))
  assert.equal(checkManipulativeStep(reactor, [3, 3, 3, 3], 1).feedback, hintText('too-few'))

  const reveal = checkManipulativeStep(reactor, [0, 0, 0, 0], 3)
  assert.equal(reveal.feedback, reactor.feedback.incorrect)
  assert.equal(reveal.reveal, reactor.feedback.reveal)
})

test('mastery word problem solves 4r + 8 = 32 and catches setup mistakes', () => {
  const wordProblem = step('mastery-input-word-problem', 'input')

  assert.equal(checkInputStep(wordProblem, '6', 1).correct, true)
  assert.equal(checkInputStep(wordProblem, 'r = 6', 1).correct, true)
  assert.equal(checkInputStep(wordProblem, '24/4', 1).correct, true)

  assert.equal(checkInputStep(wordProblem, '32', 1).feedback, wordProblem.feedback.hintsByAnswer?.['32'])
  assert.equal(checkInputStep(wordProblem, '24', 1).feedback, wordProblem.feedback.hintsByAnswer?.['24'])
  assert.equal(checkInputStep(wordProblem, '10', 1).feedback, wordProblem.feedback.hintsByAnswer?.['10'])
  assert.equal(checkInputStep(wordProblem, '8', 1).feedback, wordProblem.feedback.hintsByAnswer?.['8'])

  const reveal = checkInputStep(wordProblem, '8', 3)
  assert.equal(reveal.feedback, wordProblem.feedback.incorrect)
  assert.equal(reveal.reveal, wordProblem.feedback.reveal)
})

test('mastery division sequence checks order and division-specific misconceptions', () => {
  const ordering = step('mastery-order-division-two-step', 'sequence')

  const solved = checkSequenceStep(ordering, ['add-four-both', 'multiply-three-both', 'x-equals-eighteen'], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, ordering.feedback.correct)

  const incomplete = checkSequenceStep(ordering, ['add-four-both'], 1)
  assert.equal(incomplete.correct, false)
  assert.equal(incomplete.feedback, ordering.feedback.incomplete)

  const subtractedInstead = checkSequenceStep(
    ordering,
    ['subtract-four-both', 'multiply-three-both', 'x-equals-eighteen'],
    1,
  )
  assert.equal(subtractedInstead.feedback, ordering.feedback.hintsByTile?.['subtract-four-both'])

  const multiplyFirst = checkSequenceStep(
    ordering,
    ['multiply-three-both', 'add-four-both', 'x-equals-eighteen'],
    1,
  )
  assert.equal(multiplyFirst.feedback, ordering.feedback.hintsByTile?.['multiply-three-both'])

  const reveal = checkSequenceStep(ordering, ['x-equals-two', 'add-four-both', 'multiply-three-both'], 3)
  assert.equal(reveal.reveal, ordering.feedback.reveal)
})

test('two-step trims the redundant first-move MCQ while keeping the 4x - 5 = 19 work', () => {
  const ids = twoStep.steps.map((candidate) => candidate.id)
  // The recognition MCQ is redundant with the adjacent balance + sequence on the same equation.
  assert.equal(ids.includes('choose-first-two-step-move'), false)

  // The active 4x - 5 = 19 practice (clear -5 on the scale, then the full ordered solve) remains.
  const balance = step('balance-clear-four-x', 'balance')
  assert.match(balance.prompt, /4x/)

  const ordered = step('order-two-step-solution', 'sequence')
  assert.equal(ordered.equation, '4x - 5 = 19')
  const solved = checkSequenceStep(ordered, ['add-five-both', 'divide-four-both', 'x-equals-six'], 1)
  assert.equal(solved.correct, true)
})
