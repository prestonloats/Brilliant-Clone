import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  manipulativeBuildProductExampleStep,
  manipulativeExampleStep,
} from './fixtures/manipulative-example'
import type { ManipulativeStep } from '../src/domain'
import { checkManipulativeStep } from '../src/engine'

test('manipulative equal-groups accepts an even split that uses every item', () => {
  const solved = checkManipulativeStep(manipulativeExampleStep, [4, 4, 4], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, manipulativeExampleStep.feedback.correct)
})

test('manipulative equal-groups returns targeted hints and escalates to reveal', () => {
  const empty = checkManipulativeStep(manipulativeExampleStep, [0, 0, 0], 1)
  assert.equal(empty.correct, false)
  assert.equal(empty.feedback, 'Start dragging apples into the baskets so each one fills up.')

  const tooMany = checkManipulativeStep(manipulativeExampleStep, [6, 4, 2], 1)
  assert.equal(tooMany.feedback, 'One basket has too many. 12 / 3 means 4 in each basket.')

  const uneven = checkManipulativeStep(manipulativeExampleStep, [4, 4, 2], 1)
  assert.equal(uneven.feedback, 'The baskets must match. Even them out so each holds the same count.')

  const tooFew = checkManipulativeStep(manipulativeExampleStep, [3, 3, 3], 1)
  assert.equal(tooFew.feedback, 'Keep going until every apple is placed and each basket has 4.')

  const reveal = checkManipulativeStep(manipulativeExampleStep, [6, 4, 2], 3)
  assert.equal(reveal.reveal, manipulativeExampleStep.feedback.reveal)
})

test('manipulative build-product accepts only the matching groups and per-group', () => {
  const step = manipulativeBuildProductExampleStep
  assert.equal(step.goal.type, 'build-product')

  // 4 groups of 2 -> live total 8 = y.
  assert.equal(checkManipulativeStep(step, [2, 2, 2, 2], 1).correct, true)
  // The same total (8) built the wrong way (2 groups of 4) is rejected.
  assert.equal(checkManipulativeStep(step, [4, 4], 1).correct, false)
  // The right number of groups but the wrong per-group amount is rejected.
  assert.equal(checkManipulativeStep(step, [1, 1, 1, 1], 1).correct, false)
})

test('manipulative build-product escalates group/per-group hints to a reveal', () => {
  const step = manipulativeBuildProductExampleStep
  const hint = (when: string) => step.feedback.hints?.find((entry) => entry.when === when)?.text

  // Nothing built yet, wrong group count, and wrong per-group each surface their own hint.
  assert.equal(checkManipulativeStep(step, [], 1).feedback, hint('empty'))
  assert.equal(checkManipulativeStep(step, [2, 2], 1).feedback, hint('groups'))
  assert.equal(checkManipulativeStep(step, [3, 3, 3, 3], 1).feedback, hint('per-group'))

  // Escalation matches the other checkers: explanation at attempt 2, reveal at attempt 3.
  const reveal = checkManipulativeStep(step, [3, 3, 3, 3], 3)
  assert.equal(reveal.correct, false)
  assert.equal(reveal.feedback, step.feedback.incorrect)
  assert.equal(reveal.reveal, step.feedback.reveal)
})

test('manipulative collect goal checks an exact target count', () => {
  const collectStep: ManipulativeStep = {
    ...manipulativeExampleStep,
    id: 'manipulative-collect-example',
    total: 8,
    goal: { type: 'collect', count: 5 },
  }

  assert.equal(checkManipulativeStep(collectStep, [5], 1).correct, true)

  const tooFewHint = collectStep.feedback.hints?.find((hint) => hint.when === 'too-few')?.text
  const tooManyHint = collectStep.feedback.hints?.find((hint) => hint.when === 'too-many')?.text
  assert.equal(checkManipulativeStep(collectStep, [3], 1).feedback, tooFewHint)
  assert.equal(checkManipulativeStep(collectStep, [7], 1).feedback, tooManyHint)
})
