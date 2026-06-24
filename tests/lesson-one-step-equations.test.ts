import assert from 'node:assert/strict'
import { test } from 'node:test'

import { oneStepEquationsLesson } from '../src/domain'
import type { LessonStep, ManipulativeHintWhen } from '../src/domain'
import { checkInputStep, checkManipulativeStep } from '../src/engine'

const findStep = <Type extends LessonStep['type']>(id: string, type: Type) => {
  const step = oneStepEquationsLesson.steps.find((candidate) => candidate.id === id)
  assert.ok(step, `expected a step with id "${id}"`)
  assert.equal(step.type, type)
  return step as Extract<LessonStep, { type: Type }>
}

test('one-step division manipulative is a valid equal-groups rebuild of the dividend', () => {
  const jars = findStep('model-division-jars', 'manipulative')
  assert.equal(jars.total, 15)
  assert.equal(jars.goal.type, 'equal-groups')
  if (jars.goal.type !== 'equal-groups') throw new Error('expected an equal-groups goal')
  assert.equal(jars.goal.groups, 5)
  assert.equal(jars.goal.perGroup, 3)
  // Tray empties exactly when the puzzle is solved: 5 jars x 3 marbles = 15.
  assert.equal(jars.total, jars.goal.groups * jars.goal.perGroup)

  const solved = checkManipulativeStep(jars, [3, 3, 3, 3, 3], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, jars.feedback.correct)
})

test('one-step division manipulative escalates misconception hints to a reveal', () => {
  const jars = findStep('model-division-jars', 'manipulative')
  const hintText = (when: ManipulativeHintWhen) =>
    jars.feedback.hints?.find((hint) => hint.when === when)?.text

  // Every required hint branch is authored.
  for (const when of ['empty', 'too-many', 'uneven', 'too-few', 'default'] as ManipulativeHintWhen[]) {
    assert.ok(hintText(when), `manipulative should author a "${when}" hint`)
  }

  // Each malformed rebuild surfaces the misconception-specific hint on the first miss.
  assert.equal(checkManipulativeStep(jars, [0, 0, 0, 0, 0], 1).feedback, hintText('empty'))
  assert.equal(checkManipulativeStep(jars, [4, 3, 3, 3, 2], 1).feedback, hintText('too-many'))
  assert.equal(checkManipulativeStep(jars, [3, 3, 3, 3, 2], 1).feedback, hintText('uneven'))
  assert.equal(checkManipulativeStep(jars, [2, 2, 2, 2, 2], 1).feedback, hintText('too-few'))
  assert.equal(checkManipulativeStep(jars, [3, 3, 3, 3, 3, 3], 1).feedback, hintText('default'))

  const reveal = checkManipulativeStep(jars, [4, 3, 3, 3, 2], 3)
  assert.equal(reveal.correct, false)
  assert.equal(reveal.feedback, jars.feedback.incorrect)
  assert.equal(reveal.reveal, jars.feedback.reveal)
})

test('one-step mastery addition check accepts the negative solution and coaches mistakes', () => {
  const addCheck = findStep('mastery-add-negative-result', 'input')

  assert.equal(checkInputStep(addCheck, '-15', 1).correct, true)
  assert.equal(checkInputStep(addCheck, 'x = -15', 1).correct, true)

  const wrongSign = checkInputStep(addCheck, '15', 1)
  assert.equal(wrongSign.correct, false)
  assert.equal(wrongSign.feedback, addCheck.feedback.hintsByAnswer?.['15'])

  const didNothing = checkInputStep(addCheck, '4', 1)
  assert.equal(didNothing.feedback, addCheck.feedback.hintsByAnswer?.['4'])

  const reveal = checkInputStep(addCheck, '15', 3)
  assert.equal(reveal.reveal, addCheck.feedback.reveal)
})

test('one-step mastery divide-by-negative check requires multiplying by the negative divisor', () => {
  const divideCheck = findStep('mastery-divide-by-negative', 'input')

  assert.equal(checkInputStep(divideCheck, '-32', 1).correct, true)

  const dividedInstead = checkInputStep(divideCheck, '-2', 1)
  assert.equal(dividedInstead.correct, false)
  assert.equal(dividedInstead.feedback, divideCheck.feedback.hintsByAnswer?.['-2'])

  const droppedSign = checkInputStep(divideCheck, '32', 1)
  assert.equal(droppedSign.feedback, divideCheck.feedback.hintsByAnswer?.['32'])
})

test('one-step lesson keeps new content before a concept summary and preserves the path', () => {
  const steps = oneStepEquationsLesson.steps
  const ids = steps.map((step) => step.id)

  assert.equal(oneStepEquationsLesson.id, 'one-step-equations')
  assert.deepEqual(oneStepEquationsLesson.prerequisites, ['balancing-equations'])
  assert.equal(oneStepEquationsLesson.nextLessonId, 'two-step-equations')

  // Unique ids across every step.
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('model-division-jars'))

  // The lesson still ends on a concept summary, not an assessed step.
  const last = steps.at(-1)
  assert.equal(last?.type, 'concept')
  assert.match(last?.id ?? '', /summary/)

  // The two mastery checks are the final assessed steps, right before the summary.
  assert.equal(ids.at(-2), 'mastery-divide-by-negative')
  assert.equal(ids.at(-3), 'mastery-add-negative-result')

  // The creative puzzle is an assessed step that comes before the mastery checks.
  const jars = findStep('model-division-jars', 'manipulative')
  assert.notEqual(jars.type, 'concept')
  assert.ok(ids.indexOf('model-division-jars') < ids.indexOf('mastery-add-negative-result'))
})

test('converted 3x = 12 input accepts equivalent forms and coaches multiplication misconceptions', () => {
  // Was a mislabeled operation-choice; it is now a real input the learner must solve.
  const solveThreeX = findStep('input-three-x', 'input')

  assert.equal(checkInputStep(solveThreeX, '4', 1).correct, true)
  assert.equal(checkInputStep(solveThreeX, 'x = 4', 1).correct, true)
  assert.equal(checkInputStep(solveThreeX, '12/3', 1).correct, true)

  const subtractedInstead = checkInputStep(solveThreeX, '9', 1)
  assert.equal(subtractedInstead.correct, false)
  assert.equal(subtractedInstead.feedback, solveThreeX.feedback.hintsByAnswer?.['9'])

  const multipliedInstead = checkInputStep(solveThreeX, '36', 1)
  assert.equal(multipliedInstead.feedback, solveThreeX.feedback.hintsByAnswer?.['36'])

  const wholeRightSide = checkInputStep(solveThreeX, '12', 1)
  assert.equal(wholeRightSide.feedback, solveThreeX.feedback.hintsByAnswer?.['12'])

  const reveal = checkInputStep(solveThreeX, '36', 3)
  assert.equal(reveal.reveal, solveThreeX.feedback.reveal)
})

test('one-step trims the redundant inverse-recognition choice before the balance step', () => {
  const ids = oneStepEquationsLesson.steps.map((step) => step.id)
  // The recognition MCQ was redundant with the balance step that performs the same move.
  assert.equal(ids.includes('choose-inverse-subtraction'), false)
  // The balance step that actually performs +3 on x - 3 = 4 remains.
  assert.ok(ids.includes('balance-add-three-both'))
})
