// Story Mode architecture rebuild proof (WAVE 3a).
//
// `generateForArchitecture(id, paramSeed)` is the resume/grade path: it rebuilds the EXACT filled
// question (and its code-computed answer key) for a persisted architecture id + seed. These tests
// prove, for every architecture in the catalog and many seeds, that:
//   - rebuilding is DETERMINISTIC per `paramSeed` (deep-equal across two calls), so resume rebuilds
//     the identical question and key;
//   - the rebuilt step's own `answer` is graded CORRECT by the REAL `checkInputStep` /
//     `checkSequenceStep` (proving the in-code key), while a near-miss is REJECTED (proving the key
//     is tight, not vacuously accepting); and
//   - an unknown id returns null, and `architectureKey` formats the `arch:<id>` anti-repeat key.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ARCHITECTURE_CATALOG,
  architectureKey,
  checkInputStep,
  checkOperationChoiceStep,
  checkSequenceStep,
  generateForArchitecture,
  type GeneratedQuestion,
} from '../src/engine'

const SEEDS = [0, 1, 2, 7, 42, 123, 9999, 0x1234abcd]

// Grade a generated question's own answer with the REAL checker for its step type — the whole point
// is that the in-code key is accepted by the same checker the live UI uses.
const gradedCorrect = (question: GeneratedQuestion): boolean => {
  if (question.step.type === 'sequence') {
    return checkSequenceStep(question.step, question.answer as string[]).correct
  }
  if (question.step.type === 'input') {
    return checkInputStep(question.step, question.answer as string).correct
  }
  if (question.step.type === 'operation-choice') {
    return checkOperationChoiceStep(question.step, question.answer as string).correct
  }
  // Only input / sequence / operation-choice are emitted by the catalog; surface a regression
  // loudly (an mcq architecture would need its own grading branch here).
  return false
}

// A deliberately-wrong answer the checker must reject, derived from the correct one: reverse a
// sequence, bump a numeric input by one, or shift the first ordinate of a coordinate pair.
const rejectsNearMiss = (question: GeneratedQuestion): boolean => {
  if (question.step.type === 'sequence') {
    const reversed = [...(question.answer as string[])].reverse()
    return checkSequenceStep(question.step, reversed).correct === false
  }
  if (question.step.type === 'input') {
    const answer = question.answer as string
    const numeric = Number(answer)
    const coordinate = answer.match(/^\((-?\d+),\s*(-?\d+)\)$/)
    const miss = Number.isFinite(numeric)
      ? String(numeric + 1)
      : coordinate
        ? `(${Number(coordinate[1]) + 1}, ${coordinate[2]})`
        : `${answer} x`
    return checkInputStep(question.step, miss).correct === false
  }
  if (question.step.type === 'operation-choice') {
    const wrong = question.step.choices.find((choice) => choice.id !== (question.answer as string))
    return wrong ? checkOperationChoiceStep(question.step, wrong.id).correct === false : false
  }
  return false
}

test('generateForArchitecture is deterministic per paramSeed', () => {
  for (const architecture of ARCHITECTURE_CATALOG) {
    for (const seed of SEEDS) {
      const first = generateForArchitecture(architecture.id, seed)
      const second = generateForArchitecture(architecture.id, seed)
      assert.ok(first && second)
      assert.deepEqual(first, second)
    }
  }
})

test('rebuilt step is graded correct by the real checker (and a near-miss is rejected)', () => {
  for (const architecture of ARCHITECTURE_CATALOG) {
    for (const seed of SEEDS) {
      const question = generateForArchitecture(architecture.id, seed)
      assert.ok(question, `expected a question for ${architecture.id} at seed ${seed}`)
      assert.equal(question.step.type, architecture.stepType)
      assert.ok(gradedCorrect(question), `in-code key rejected for ${architecture.id} at seed ${seed}`)
      assert.ok(rejectsNearMiss(question), `near-miss accepted for ${architecture.id} at seed ${seed}`)
    }
  }
})

test('generateForArchitecture returns null for an unknown id', () => {
  assert.equal(generateForArchitecture('definitely-not-an-architecture', 123), null)
  assert.equal(generateForArchitecture('', 0), null)
})

test('architectureKey formats the arch:<id> anti-repeat key', () => {
  assert.equal(architectureKey('x'), 'arch:x')
  assert.equal(architectureKey('one-step-linear'), 'arch:one-step-linear')
  for (const architecture of ARCHITECTURE_CATALOG) {
    assert.equal(architectureKey(architecture.id), `arch:${architecture.id}`)
  }
})
