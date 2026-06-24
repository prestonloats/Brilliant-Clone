import assert from 'node:assert/strict'
import { test } from 'node:test'

import { likeTermsVariablesBothSidesLesson } from '../src/content/lessons/like-terms'
import type { DragTermsHintWhen, LessonStep } from '../src/domain'
import {
  checkDragTermsStep,
  checkInputStep,
  checkSequenceStep,
  isAssessedLessonStep,
} from '../src/engine'
import { findHintText, findStep } from './helpers/findStep'

const lesson = likeTermsVariablesBothSidesLesson

const getStep = <Type extends LessonStep['type']>(id: string, type: Type) =>
  findStep(lesson, id, type)

const dragTermsHintText = (
  step: Extract<LessonStep, { type: 'dragTerms' }>,
  when: DragTermsHintWhen,
) => findHintText(step, when)

test('group-like-terms dragTerms accepts the correct grouping and rejects misplaced tiles', () => {
  const group = getStep('group-like-terms-combine', 'dragTerms')

  const solved = checkDragTermsStep(
    group,
    {
      'tile-7x': 'x-terms',
      'tile-neg-2x': 'x-terms',
      'tile-y': 'y-terms',
      'tile-pos-4': 'constants',
      'tile-neg-3': 'constants',
    },
    1,
  )
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, group.feedback.correct)

  // A constant dropped onto the x team is wrong even though every tile is placed.
  const misplacedConstant = checkDragTermsStep(
    group,
    {
      'tile-7x': 'x-terms',
      'tile-neg-2x': 'x-terms',
      'tile-y': 'y-terms',
      'tile-pos-4': 'x-terms',
      'tile-neg-3': 'constants',
    },
    1,
  )
  assert.equal(misplacedConstant.correct, false)
})

test('group-like-terms dragTerms escalates targeted hints to a reveal', () => {
  const group = getStep('group-like-terms-combine', 'dragTerms')

  const emptyHint = dragTermsHintText(group, 'empty')
  const incompleteHint = dragTermsHintText(group, 'incomplete')
  const misplacedHint = dragTermsHintText(group, 'misplaced')
  assert.ok(emptyHint)
  assert.ok(incompleteHint)
  assert.ok(misplacedHint)

  assert.equal(checkDragTermsStep(group, {}, 1).feedback, emptyHint)
  assert.equal(checkDragTermsStep(group, { 'tile-7x': 'x-terms' }, 1).feedback, incompleteHint)
  assert.equal(checkDragTermsStep(group, { 'tile-7x': 'y-terms' }, 1).feedback, misplacedHint)

  const wrong = {
    'tile-7x': 'constants',
    'tile-neg-2x': 'x-terms',
    'tile-y': 'y-terms',
    'tile-pos-4': 'constants',
    'tile-neg-3': 'constants',
  }
  const reveal = checkDragTermsStep(group, wrong, 3)
  assert.equal(reveal.correct, false)
  assert.equal(reveal.feedback, group.feedback.incorrect)
  assert.equal(reveal.reveal, group.feedback.reveal)
})

test('mastery input requires combining like terms before solving both sides', () => {
  const mastery = getStep('mastery-input-combine-and-solve', 'input')

  assert.equal(checkInputStep(mastery, 'x = 5', 1).correct, true)
  assert.equal(checkInputStep(mastery, '5', 1).correct, true)
  assert.equal(checkInputStep(mastery, '15/3', 1).correct, true)

  const coefficientSlip = checkInputStep(mastery, '15', 1)
  assert.equal(coefficientSlip.correct, false)
  assert.equal(coefficientSlip.feedback, mastery.feedback.hintsByAnswer?.['15'])

  const forgotToCombine = checkInputStep(mastery, '2.5', 1)
  assert.equal(forgotToCombine.correct, false)
  assert.equal(forgotToCombine.feedback, mastery.feedback.hintsByAnswer?.['2.5'])

  const reveal = checkInputStep(mastery, '2.5', 3)
  assert.equal(reveal.feedback, mastery.feedback.incorrect)
  assert.equal(reveal.reveal, mastery.feedback.reveal)
})

test('mastery sequence solves a combine-then-both-sides equation in order', () => {
  const mastery = getStep('mastery-sequence-full-solution', 'sequence')

  assert.deepEqual(mastery.correctOrder, [
    'combine-subtract-coefficients',
    'subtract-2x-both',
    'add-2-both',
    'divide-4-both',
    'mastery-x-equals-4',
  ])

  const solved = checkSequenceStep(mastery, mastery.correctOrder, 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, mastery.feedback.correct)

  const wrongCombine = checkSequenceStep(
    mastery,
    ['combine-add-coefficients', 'subtract-2x-both', 'add-2-both', 'divide-4-both', 'mastery-x-equals-4'],
    1,
  )
  assert.equal(wrongCombine.correct, false)
  assert.equal(wrongCombine.feedback, mastery.feedback.hintsByTile?.['combine-add-coefficients'])

  const skippedCombine = checkSequenceStep(
    mastery,
    ['subtract-2x-both', 'add-2-both', 'divide-4-both', 'mastery-x-equals-4'],
    1,
  )
  assert.equal(skippedCombine.feedback, mastery.feedback.incomplete)

  const reveal = checkSequenceStep(
    mastery,
    ['add-2x-both', 'subtract-2x-both', 'add-2-both', 'divide-4-both', 'mastery-x-equals-4'],
    3,
  )
  assert.equal(reveal.feedback, mastery.feedback.incorrect)
  assert.equal(reveal.reveal, mastery.feedback.reveal)
})

test('like terms lesson keeps a concept summary last after adding the new steps', () => {
  const ids = lesson.steps.map((step) => step.id)
  assert.equal(new Set(ids).size, ids.length, 'step ids must stay unique')

  assert.ok(ids.includes('group-like-terms-combine'))
  assert.ok(ids.includes('mastery-input-combine-and-solve'))
  assert.ok(ids.includes('mastery-sequence-full-solution'))

  const lastStep = lesson.steps.at(-1)
  assert.equal(lastStep?.type, 'concept')
  assert.match(lastStep?.id ?? '', /summary/)
  assert.equal(isAssessedLessonStep(lesson.steps[lesson.steps.length - 1]), false)

  const summaryIndex = lesson.steps.findIndex((step) => step.id === 'complete-like-terms-summary')
  const masterySequenceIndex = lesson.steps.findIndex((step) => step.id === 'mastery-sequence-full-solution')
  const masteryInputIndex = lesson.steps.findIndex((step) => step.id === 'mastery-input-combine-and-solve')
  assert.equal(masterySequenceIndex, summaryIndex - 1)
  assert.equal(masteryInputIndex, summaryIndex - 2)

  const groupStepIndex = lesson.steps.findIndex((step) => step.id === 'group-like-terms-combine')
  const combineSequenceIndex = lesson.steps.findIndex((step) => step.id === 'order-combine-like-terms')
  assert.ok(groupStepIndex > combineSequenceIndex, 'grouping tiles should reinforce combining before both-sides work')
})

test('like terms trims the redundant gather-move MCQ but keeps the same-equation sequence', () => {
  const ids = lesson.steps.map((step) => step.id)
  // The recognition MCQ duplicated the first move of the following sequence on 5x + 7 = 2x + 19.
  assert.equal(ids.includes('choose-variable-both-sides-move'), false)

  const solveOrder = getStep('order-variable-both-sides-solution', 'sequence')
  assert.equal(solveOrder.equation, '5x + 7 = 2x + 19')
  // The active "-2x from both sides" gather move still lives in the sequence the learner builds.
  assert.ok(solveOrder.tiles.some((tile) => tile.id === 'subtract-two-x-both'))

  const solved = checkSequenceStep(
    solveOrder,
    ['subtract-two-x-both', 'subtract-seven-both', 'divide-three-both', 'x-equals-four'],
    1,
  )
  assert.equal(solved.correct, true)
})
