import assert from 'node:assert/strict'
import { test } from 'node:test'

import { balancingEquationsLesson, type BalanceState, type LessonStep } from '../src/domain'
import { applyBalanceOperation, checkBalanceStep, checkInputStep, checkSequenceStep, isLevel } from '../src/engine'

const lessonStep = <Type extends LessonStep['type']>(id: string, type: Type) => {
  const step = balancingEquationsLesson.steps.find((candidate) => candidate.id === id)
  assert.ok(step, `expected a step with id "${id}"`)
  assert.equal(step.type, type)
  return step as Extract<LessonStep, { type: Type }>
}

// --- Task A: the "make it level" drag interaction ---------------------------------

test('drag-to-level starts with every weight in the tray and both pans empty', () => {
  const step = lessonStep('drag-to-level', 'balance')

  // The learner must build the whole scale: every weight begins loose in the tray and
  // both pans start empty.
  assert.ok(step.state.bank && step.state.bank.length === 3)
  assert.ok(step.state.bank.every((item) => !item.locked))
  assert.equal(step.state.left.length, 0)
  assert.equal(step.state.right.length, 0)

  // Empty pans are technically level (0 = 0), so the empty start must NOT count as solved —
  // the required blocks have to be placed first.
  assert.equal(isLevel(step.state), true)
  assert.equal(checkBalanceStep(step, step.state, {}, 1).correct, false)
})

test('re-dragging is the recovery: a wrong pan stays unsolved, the correct pan solves it', () => {
  const step = lessonStep('drag-to-level', 'balance')
  const bank = step.state.bank ?? []
  const three = bank.find((item) => item.id === 'tray-left-3')
  const two = bank.find((item) => item.id === 'tray-left-2')
  const five = bank.find((item) => item.id === 'tray-right-5')
  assert.ok(three && two && five)

  // Learner places the 3 and 2 on the left but drops the 5 on the WRONG (left) pan too.
  const droppedOnWrongPan: BalanceState = {
    ...step.state,
    left: [three, two, five],
    right: [],
    bank: [],
  }
  const wrong = checkBalanceStep(step, droppedOnWrongPan, {}, 1)
  assert.equal(wrong.correct, false)

  // Learner simply drags the same 5 again, this time onto the right pan — no reset needed.
  const movedToRightPan: BalanceState = {
    ...step.state,
    left: [three, two],
    right: [five],
    bank: [],
  }
  const solved = checkBalanceStep(step, movedToRightPan, {}, 2)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)
  assert.ok(isLevel(movedToRightPan))
})

test('drag-to-level requires every block on its correct pan, rejecting mirrored balances', () => {
  const step = lessonStep('drag-to-level', 'balance')
  const bank = step.state.bank ?? []
  const three = bank.find((item) => item.id === 'tray-left-3')
  const two = bank.find((item) => item.id === 'tray-left-2')
  const five = bank.find((item) => item.id === 'tray-right-5')
  assert.ok(three && two && five)

  assert.equal(step.goal.type, 'level')
  if (step.goal.type === 'level') {
    // Each tray block is pinned to a specific pan, so the learner has to place all of them.
    assert.deepEqual(step.goal.requireItemsOnSide, [
      { itemId: 'tray-left-3', side: 'left' },
      { itemId: 'tray-left-2', side: 'left' },
      { itemId: 'tray-right-5', side: 'right' },
    ])
  }

  // Putting the 5 on the left and 3 + 2 on the right is also level (5 = 5), but it is not the
  // required placement, so the required-item gate still fails.
  const mirrored: BalanceState = {
    ...step.state,
    left: [five],
    right: [three, two],
    bank: [],
  }
  assert.ok(isLevel(mirrored))
  assert.equal(checkBalanceStep(step, mirrored, {}, 1).correct, false)
})

test('balance feedback escalates from hint to explanation to reveal', () => {
  const step = lessonStep('drag-to-level', 'balance')

  const first = checkBalanceStep(step, step.state, {}, 1)
  assert.equal(first.correct, false)
  assert.equal(first.reveal, undefined)

  const second = checkBalanceStep(step, step.state, {}, 2)
  assert.equal(second.feedback, step.feedback.explanation)
  assert.equal(second.reveal, undefined)

  const third = checkBalanceStep(step, step.state, {}, 3)
  assert.equal(third.reveal, step.feedback.reveal)
})

// --- Task B: end-of-Part-1 mastery checks ----------------------------------------

test('mastery questions sit at the very end of Part 1, just before the concept summary', () => {
  const steps = balancingEquationsLesson.steps
  const ids = steps.map((step) => step.id)

  // Step ids stay unique.
  assert.equal(new Set(ids).size, ids.length)

  // The final step is still a concept summary.
  const last = steps.at(-1)
  assert.ok(last)
  assert.equal(last.type, 'concept')
  assert.match(last.id, /summary/)

  const negIndex = ids.indexOf('mastery-solve-negative')
  const storyIndex = ids.indexOf('mastery-balance-story')
  const summaryIndex = ids.indexOf('complete-summary')

  assert.equal(summaryIndex, steps.length - 1)
  assert.equal(storyIndex, summaryIndex - 1)
  assert.equal(negIndex, summaryIndex - 2)

  // Mastery checks are assessed steps (not concept), so they count toward mastery.
  assert.notEqual(steps[negIndex].type, 'concept')
  assert.notEqual(steps[storyIndex].type, 'concept')
})

test('mastery input question accepts the negative solution and targets sign mistakes', () => {
  const step = lessonStep('mastery-solve-negative', 'input')

  assert.match(step.prompt, /mastery/i)
  assert.equal(checkInputStep(step, '-5', 1).correct, true)
  assert.equal(checkInputStep(step, 'x = -5', 1).correct, true)

  const addedInstead = checkInputStep(step, '13', 1)
  assert.equal(addedInstead.correct, false)
  assert.equal(addedInstead.feedback, 'That adds 9 instead of undoing it. Subtract 9 from both sides to isolate x.')

  const wrongSign = checkInputStep(step, '5', 1)
  assert.equal(wrongSign.feedback, 'Right size, wrong sign. 4 - 9 lands below zero, so x is negative.')

  const reveal = checkInputStep(step, '99', 3)
  assert.equal(reveal.correct, false)
  assert.equal(reveal.reveal, step.feedback.reveal)
})

test('mastery sequence question checks the full ordered balance story', () => {
  const step = lessonStep('mastery-balance-story', 'sequence')

  assert.match(step.prompt, /mastery/i)
  assert.ok(step.correctOrder.length >= 2)
  assert.ok(step.correctOrder.every((id) => step.tiles.some((tile) => tile.id === id)))

  const solved = checkSequenceStep(step, ['add-six-both', 'x-equals-fifteen'], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)

  const incomplete = checkSequenceStep(step, ['add-six-both'], 1)
  assert.equal(incomplete.correct, false)
  assert.equal(incomplete.feedback, step.feedback.incomplete)

  const oneSideMistake = checkSequenceStep(step, ['add-six-left', 'x-equals-fifteen'], 1)
  assert.equal(oneSideMistake.correct, false)
  assert.equal(oneSideMistake.feedback, 'Adding 6 to only the left side breaks equality. Do it to both sides.')

  const reveal = checkSequenceStep(step, ['x-equals-fifteen', 'add-six-both'], 3)
  assert.equal(reveal.correct, false)
  assert.equal(reveal.reveal, step.feedback.reveal)
})

// --- Converted step: recognition MCQ -> hands-on isolate balance --------------------

test('converted x + 4 = 9 balance step makes the learner perform the isolate move', () => {
  // The redundant "which move?" MCQ is gone; the learner now subtracts 4 on the scale.
  assert.equal(balancingEquationsLesson.steps.some((candidate) => candidate.id === 'choose-balanced-move'), false)

  const step = lessonStep('balance-subtract-four-both', 'balance')
  assert.equal(step.goal.type, 'isolate')

  const bothSides = step.operations?.find((operation) => operation.id === 'subtract-four-both')
  const leftOnly = step.operations?.find((operation) => operation.id === 'subtract-four-left')
  assert.ok(bothSides)
  assert.ok(leftOnly)

  const solvedState = applyBalanceOperation(step.state, bothSides)
  const solved = checkBalanceStep(step, solvedState, {}, 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, step.feedback.correct)
  assert.ok(isLevel(solvedState))

  const oneSideOnly = checkBalanceStep(step, applyBalanceOperation(step.state, leftOnly), { movedOneSideOnly: true }, 1)
  assert.equal(oneSideOnly.correct, false)
  assert.equal(
    oneSideOnly.feedback,
    'You removed 4 from only one side, so the scale tipped. Whatever you do to one side, do to the other.',
  )

  const notIsolated = checkBalanceStep(step, step.state, {}, 1)
  assert.equal(notIsolated.correct, false)
  assert.equal(notIsolated.feedback, 'The goal is to leave x by itself while keeping both pans equal.')

  const reveal = checkBalanceStep(step, step.state, {}, 3)
  assert.equal(reveal.reveal, step.feedback.reveal)
})
