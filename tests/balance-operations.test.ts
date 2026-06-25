import assert from 'node:assert/strict'
import { test } from 'node:test'

import { balancingEquationsLesson, type BalanceOperation } from '../src/domain'
import { applyBalanceOperation, checkBalanceStep } from '../src/engine'
import { applyOperationFromStart, cloneBalanceState } from '../src/lesson/balanceHelpers'
import { findStepIn } from './helpers/findStep'

const lessonStep = findStepIn(balancingEquationsLesson)

// The real x + 2 = 5 isolate step. Its "-2 from both sides" move leaves x = 3, and it carries
// two operation choices (both-sides and left-only), so it is the natural fixture for the
// no-stacking helper that the BalanceStepView grid now uses.
const step = lessonStep('remove-two-both-sides', 'balance')

const findOperation = (id: string): BalanceOperation => {
  const operation = step.operations?.find((candidate) => candidate.id === id)
  assert.ok(operation, `expected operation ${id} on step ${step.id}`)
  return operation
}

const bothOp = findOperation('remove-two-both')
const leftOp = findOperation('remove-two-left')

test('clicking the same operation repeatedly never stacks (idempotent from the base)', () => {
  const once = applyOperationFromStart(step, bothOp)

  // Each subsequent "click" re-derives from the original equation, so the scale state is
  // identical no matter how many times the learner taps the same operation. This is the bug
  // fix: the old path applied onto accumulated state, so N clicks subtracted 2 * N.
  for (let clicks = 2; clicks <= 4; clicks += 1) {
    assert.deepEqual(applyOperationFromStart(step, bothOp), once)
  }
})

test('switching operation choices applies cleanly to the original equation (no residue)', () => {
  const both = applyOperationFromStart(step, bothOp)
  const left = applyOperationFromStart(step, leftOp)

  // The two choices reach different states, and going back to "both" still matches the clean
  // single application — there is no leftover effect from the intervening "left only" click.
  assert.notDeepEqual(left, both)
  assert.deepEqual(applyOperationFromStart(step, bothOp), both)
})

test('applyOperationFromStart does not mutate the step base equation', () => {
  // structuredClone makes a faithful key-for-key snapshot so an unchanged base compares equal.
  const before = structuredClone(step.state)

  applyOperationFromStart(step, bothOp)
  applyOperationFromStart(step, leftOp)

  assert.deepEqual(step.state, before)
})

test('the both-sides operation applied from start reaches the isolate goal', () => {
  const result = checkBalanceStep(step, applyOperationFromStart(step, bothOp), { movedOneSideOnly: false }, 1)

  assert.equal(result.correct, true)
  assert.equal(result.feedback, step.feedback.correct)
})

test('the old stacking path applies onto accumulated state, over-shoots, and fails the goal', () => {
  const single = applyOperationFromStart(step, bothOp)
  // Reproduces the bug: apply the operation onto the result of a first application instead of
  // the base. Subtracting 2 twice over-shoots, so the state differs and no longer isolates x.
  const stacked = applyBalanceOperation(applyBalanceOperation(cloneBalanceState(step.state), bothOp), bothOp)

  assert.notDeepEqual(stacked, single)
  assert.equal(checkBalanceStep(step, stacked, { movedOneSideOnly: false }, 1).correct, false)
})
