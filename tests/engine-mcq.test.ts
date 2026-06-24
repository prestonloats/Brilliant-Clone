import assert from 'node:assert/strict'
import { test } from 'node:test'

import { balancingEquationsLesson, type Lesson, type LessonStep } from '../src/domain'
import { checkMcqStep } from '../src/engine'

type McqStep = Extract<LessonStep, { type: 'mcq' }>

const findMcq = (lesson: Lesson): McqStep => {
  const step = lesson.steps.find((candidate) => candidate.type === 'mcq')
  assert.ok(step, `expected an mcq step in lesson ${lesson.id}`)
  return step as McqStep
}

const mcq = (overrides: Partial<McqStep> = {}): McqStep => ({
  id: 'predict',
  type: 'mcq',
  prompt: 'Predict the tilt.',
  correctId: 'right-answer',
  options: [
    { id: 'right-answer', label: 'The left pan drops', feedback: 'Correct option feedback.' },
    { id: 'wrong-answer', label: 'It stays level', feedback: 'That option misconception.' },
  ],
  feedback: {
    correct: 'Nice, the left pan is heavier.',
    incorrect: 'Compare the totals on each pan.',
    reveal: 'Left totals 5, right totals 3, so the left pan drops.',
  },
  ...overrides,
})

test('checkMcqStep marks the correct option correct and uses the step correct feedback', () => {
  const result = checkMcqStep(mcq(), 'right-answer')
  assert.equal(result.correct, true)
  assert.equal(result.feedback, 'Nice, the left pan is heavier.')
  assert.equal(result.reveal, undefined)
})

test('checkMcqStep falls back to the option feedback when no step correct feedback is set', () => {
  const result = checkMcqStep(mcq({ feedback: undefined }), 'right-answer')
  assert.equal(result.correct, true)
  assert.equal(result.feedback, 'Correct option feedback.')
})

test('checkMcqStep returns the chosen option misconception on the first wrong attempt', () => {
  const result = checkMcqStep(mcq(), 'wrong-answer', 1)
  assert.equal(result.correct, false)
  assert.equal(result.feedback, 'That option misconception.')
  assert.equal(result.reveal, undefined)
  assert.equal(result.retryGuidance, 'Compare the two totals, then choose another option.')
})

test('checkMcqStep layers the generic explanation into the reveal slot on the second wrong attempt', () => {
  const result = checkMcqStep(mcq(), 'wrong-answer', 2)
  assert.equal(result.correct, false)
  assert.equal(result.feedback, 'That option misconception.')
  assert.equal(result.reveal, 'Compare the totals on each pan.')
  assert.equal(result.retryGuidance, 'Compare the two totals, then choose another option.')
})

test('checkMcqStep surfaces the exact reveal and reveal-specific retry copy on the third wrong attempt', () => {
  const result = checkMcqStep(mcq(), 'wrong-answer', 3)
  assert.equal(result.correct, false)
  assert.equal(result.feedback, 'That option misconception.')
  assert.equal(result.reveal, 'Left totals 5, right totals 3, so the left pan drops.')
  assert.equal(result.retryGuidance, 'Use the reveal, then choose the prediction that matches the totals.')
})

test('checkMcqStep does not duplicate the explanation into reveal when it equals the option feedback', () => {
  const step = mcq({
    options: [
      { id: 'right-answer', label: 'The left pan drops', feedback: 'Correct option feedback.' },
      { id: 'wrong-answer', label: 'It stays level', feedback: 'Compare the totals on each pan.' },
    ],
  })
  const result = checkMcqStep(step, 'wrong-answer', 2)
  assert.equal(result.reveal, undefined)
})

test('checkMcqStep keeps escalating to the layered explanation when no exact reveal is authored', () => {
  const step = mcq({ feedback: { correct: 'Yes.', incorrect: 'Compare the totals on each pan.' } })
  const result = checkMcqStep(step, 'wrong-answer', 3)
  assert.equal(result.reveal, 'Compare the totals on each pan.')
  assert.equal(result.retryGuidance, 'Compare the two totals, then choose another option.')
})

test('checkMcqStep matches the authored balancing-equations prediction step', () => {
  const step = findMcq(balancingEquationsLesson)

  const correct = checkMcqStep(step, step.correctId)
  assert.equal(correct.correct, true)

  const wrongOption = step.options.find((option) => option.id !== step.correctId)
  assert.ok(wrongOption, 'expected a wrong option in the authored prediction step')

  const firstMiss = checkMcqStep(step, wrongOption.id, 1)
  assert.equal(firstMiss.correct, false)
  assert.equal(firstMiss.feedback, wrongOption.feedback)

  const thirdMiss = checkMcqStep(step, wrongOption.id, 3)
  assert.equal(thirdMiss.reveal, step.feedback?.reveal)
})
