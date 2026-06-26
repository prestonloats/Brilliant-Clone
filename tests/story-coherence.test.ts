// Story Mode themed-question COHERENCE proof.
//
// `isThemedStepCoherent(canonical, themed)` is the deterministic backstop for the "sometimes the
// question, the shown equation, and the answers don't match up" bug. The number engine produces a
// coherent variant (prompt + equation + answer key + labels all from ONE randomized parameter set),
// and the LLM re-themes only the DISPLAY TEXT via `applyRetheme`. When the LLM quietly changes a
// number, this guard catches it so the caller can fall back to the coherent (un-themed) variant.
//
// These tests prove, across many seeds and every rethemable step type, that:
//   - a FAITHFUL re-theme (same numbers, only flavor wording) is judged COHERENT;
//   - a re-theme that CHANGES a number in the prompt's equation or in an option/tile label is
//     judged INCOHERENT;
//   - operation-choice prompts (which embed an intentional WRONG worked chain) are NOT false-flagged
//     by the prompt-equation check; and
//   - an `input` whose math lives only in the prompt is INCOHERENT if the re-theme drops the equation.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  balancingEquationsLesson,
  likeTermsVariablesBothSidesLesson,
  oneStepEquationsLesson,
  twoStepEquationsLesson,
  type LessonStep,
} from '../src/domain'
import {
  generateForArchitecture,
  isThemedStepCoherent,
  mulberry32,
  randomizeQuestionNumbers,
} from '../src/engine'
import { applyRetheme } from '../src/story/applyRetheme'
import type { RethemeResult } from '../src/story/storyAi'
import { findStep } from './helpers/findStep'

// Build the themed step exactly as production does: applyRetheme overwrites ONLY display text.
const themeWith = (variant: LessonStep, result: RethemeResult): LessonStep => {
  const applied = applyRetheme(variant, result)
  assert.equal(applied.themed, true, 'test re-theme should apply (valid prompt + matching id set)')
  return applied.step
}

const keepLabels = (items: ReadonlyArray<{ id: string; label: string }>) =>
  items.map((item) => ({ id: item.id, label: item.label }))

const labelsOf = (step: LessonStep): { id: string; label: string }[] => {
  if (step.type === 'mcq') return step.options
  if (step.type === 'operation-choice') return step.choices
  if (step.type === 'sequence') return step.tiles
  return []
}

const integerSolution = (step: Extract<LessonStep, { type: 'input' }>): number => {
  const numeric = step.accept.map(Number).find((value) => Number.isInteger(value))
  assert.ok(numeric !== undefined, `accept[] must contain an integer: ${JSON.stringify(step.accept)}`)
  return numeric
}

// A prompt stating an equation whose solution is impossible for any bundled variant, so it always
// contradicts the canonical one (x + 1 = 100000 -> x = 99999).
const CONTRADICTORY_PROMPT = 'You must solve x + 1 = 100000 to escape.'

const inputSteps = [
  findStep(balancingEquationsLesson, 'input-box-value', 'input'), // x + 2 = 5 (equation in prompt only)
  findStep(oneStepEquationsLesson, 'input-three-x', 'input'), // 3x = 12 (equation in prompt only)
  findStep(oneStepEquationsLesson, 'input-x-divided-by-four', 'input'), // x / 4 = 2 (has equation field)
  findStep(twoStepEquationsLesson, 'input-puzzle-gate', 'input'), // 2x + 4 = 16
  findStep(likeTermsVariablesBothSidesLesson, 'input-variable-both-sides', 'input'), // 4x - 5 = x + 10
]

const sequenceSteps = [
  findStep(oneStepEquationsLesson, 'input-add-six', 'sequence'), // x + 6 = 10
  findStep(twoStepEquationsLesson, 'order-two-step-solution', 'sequence'), // 4x - 5 = 19
  findStep(twoStepEquationsLesson, 'mastery-order-division-two-step', 'sequence'), // x/3 - 4 = 2
]

const operationChoiceSteps = [
  findStep(oneStepEquationsLesson, 'spot-one-side-only-mistake', 'operation-choice'), // x - 5 = 9
  findStep(twoStepEquationsLesson, 'spot-two-step-mistake', 'operation-choice'), // 3x + 6 = 21 -> ...
]

const mcqStep = findStep(balancingEquationsLesson, 'predict-add-left', 'mcq')

// --- INPUT -----------------------------------------------------------------------------------

for (const step of inputSteps) {
  test(`coherence(input): faithful re-theme is coherent, changed numbers are not: ${step.id}`, () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const variant = randomizeQuestionNumbers(step, mulberry32(seed)) as Extract<LessonStep, { type: 'input' }>

      // FAITHFUL: wrap the SAME prompt (keeps the same equation, adds only flavor) -> coherent.
      const faithful = themeWith(variant, { themedPrompt: `In the glass tower, ${variant.prompt}` })
      assert.equal(isThemedStepCoherent(variant, faithful), true, `faithful @ ${seed} should be coherent`)

      // CHANGED EQUATION: a prompt that states a different equation -> incoherent.
      const solution = integerSolution(variant)
      const changed = themeWith(variant, { themedPrompt: `Solve x + 1 = ${solution + 3} for the rune.` })
      assert.equal(isThemedStepCoherent(variant, changed), false, `number-changed @ ${seed} must be incoherent`)
    }
  })
}

test('coherence(input): dropping the equation from a prompt-only question is incoherent', () => {
  // input-three-x / input-box-value carry the math ONLY in the prompt (no equation field shown from
  // code), so a re-theme that omits the equation leaves nothing to solve and must be rejected.
  for (const step of [
    findStep(oneStepEquationsLesson, 'input-three-x', 'input'),
    findStep(balancingEquationsLesson, 'input-box-value', 'input'),
  ]) {
    for (let seed = 0; seed < 40; seed += 1) {
      const variant = randomizeQuestionNumbers(step, mulberry32(seed))
      const noEquation = themeWith(variant, {
        themedPrompt: 'The dragon hoards shining gems. How many sit in each pile?',
      })
      assert.equal(isThemedStepCoherent(variant, noEquation), false, `equation-dropped @ ${seed} must be incoherent`)
    }
  }
})

// --- COORDINATE WALK (architecture) ---------------------------------------------------------
//
// Regression for the reported bug: a coordinate-walk question's answer is a DESTINATION (x, y), not a
// scalar. The walk was re-themed into a line-value question ("for the line y = 2x - 5, what is y when
// x = 1?") that REUSED the walk's move magnitudes {2, 5, 1}, so the equation-solution check was
// vacuous AND the number-subset check passed — the rewrite slipped through, and the learner's correct
// line answer (-3) was graded against the code's coordinate key and rejected (with the walk's
// "combine the left/right moves..." hint). The guard must reject any re-theme that does not land on
// the SAME coordinate.
test('coherence(input): a coordinate walk re-themed into a different (scalar) question is incoherent', () => {
  for (let seed = 0; seed < 60; seed += 1) {
    const generated = generateForArchitecture('coordinate-walk', seed)
    assert.ok(generated, 'coordinate-walk architecture should generate a question')
    const canonical = generated.step as Extract<LessonStep, { type: 'input' }>

    // FAITHFUL: a story wrapper that keeps the move phrases (the actual math) -> coherent.
    const faithful = themeWith(canonical, { themedPrompt: `On the star map, ${canonical.prompt}` })
    assert.equal(isThemedStepCoherent(canonical, faithful), true, `faithful walk @ ${seed} should be coherent`)

    // THE BUG: rewrite the walk as a line-value question that REUSES every move magnitude (so the
    // old number-subset check still passes) but asks for a single number instead of a coordinate.
    const givens = canonical.prompt.match(/-?\d+/g)?.join(', ') ?? ''
    const swapped = themeWith(canonical, {
      themedPrompt: `Pirate riddle with markers ${givens}: for the line y = 2x - 5, what is y when x = 1?`,
    })
    assert.equal(isThemedStepCoherent(canonical, swapped), false, `walk->scalar @ ${seed} must be incoherent`)
  }
})

// --- SEQUENCE --------------------------------------------------------------------------------

for (const step of sequenceSteps) {
  test(`coherence(sequence): faithful coherent; changed tile or equation incoherent: ${step.id}`, () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const variant = randomizeQuestionNumbers(step, mulberry32(seed)) as Extract<LessonStep, { type: 'sequence' }>

      // FAITHFUL: a story wrapper with no equation, tiles kept verbatim -> coherent.
      const faithful = themeWith(variant, {
        themedPrompt: 'Line up the ancient runes in the right order.',
        themedTiles: keepLabels(variant.tiles),
      })
      assert.equal(isThemedStepCoherent(variant, faithful), true, `faithful @ ${seed} should be coherent`)

      // CHANGED TILE: blank the numbers out of one numeric tile label -> incoherent.
      const numericTile = variant.tiles.find((tile) => /\d/.test(tile.label))
      assert.ok(numericTile, 'a sequence tile should carry a number')
      const changedTiles = variant.tiles.map((tile) =>
        tile.id === numericTile.id ? { id: tile.id, label: 'a mysterious move' } : { id: tile.id, label: tile.label },
      )
      const tileChanged = themeWith(variant, { themedPrompt: 'Order the runes.', themedTiles: changedTiles })
      assert.equal(isThemedStepCoherent(variant, tileChanged), false, `tile-number-dropped @ ${seed} must be incoherent`)

      // CHANGED EQUATION IN PROMPT: the themed prompt states a contradictory equation -> incoherent.
      const promptChanged = themeWith(variant, {
        themedPrompt: CONTRADICTORY_PROMPT,
        themedTiles: keepLabels(variant.tiles),
      })
      assert.equal(isThemedStepCoherent(variant, promptChanged), false, `prompt-equation @ ${seed} must be incoherent`)
    }
  })
}

// --- OPERATION-CHOICE ------------------------------------------------------------------------

for (const step of operationChoiceSteps) {
  test(`coherence(operation-choice): faithful coherent; changed label incoherent: ${step.id}`, () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const variant = randomizeQuestionNumbers(step, mulberry32(seed)) as Extract<
        LessonStep,
        { type: 'operation-choice' }
      >

      // FAITHFUL: re-theme that KEEPS the real prompt (which embeds the intentional WRONG worked
      // chain) and keeps every choice label -> coherent (the prompt's wrong chain must NOT be flagged).
      const faithful = themeWith(variant, {
        themedPrompt: `In the haunted lab, ${variant.prompt}`,
        themedOptions: keepLabels(variant.choices),
      })
      assert.equal(isThemedStepCoherent(variant, faithful), true, `faithful (wrong-chain prompt) @ ${seed} coherent`)

      // CHANGED LABEL: blank the numbers out of one numeric choice label -> incoherent.
      const numericChoice = variant.choices.find((choice) => /\d/.test(choice.label))
      assert.ok(numericChoice, 'an operation-choice option should carry a number')
      const changedOptions = variant.choices.map((choice) =>
        choice.id === numericChoice.id
          ? { id: choice.id, label: 'a puzzling move' }
          : { id: choice.id, label: choice.label },
      )
      const labelChanged = themeWith(variant, { themedPrompt: 'A move was made.', themedOptions: changedOptions })
      assert.equal(isThemedStepCoherent(variant, labelChanged), false, `label-number-dropped @ ${seed} incoherent`)
    }
  })
}

// --- MCQ -------------------------------------------------------------------------------------

test('coherence(mcq): faithful coherent; an option that loses its numbers is incoherent', () => {
  const variant = randomizeQuestionNumbers(mcqStep, mulberry32(1)) // mcq is not number-varied; canonical = original
  const faithful = themeWith(variant, {
    themedPrompt: 'The cargo pods shift on the gantry. Predict the tilt.',
    themedOptions: keepLabels(labelsOf(variant)),
  })
  assert.equal(isThemedStepCoherent(variant, faithful), true)

  const numericOption = labelsOf(variant).find((option) => /\d/.test(option.label))
  assert.ok(numericOption, 'the predict-add-left options carry numbers')
  const changedOptions = labelsOf(variant).map((option) =>
    option.id === numericOption.id ? { id: option.id, label: 'one pan drops' } : { id: option.id, label: option.label },
  )
  const changed = themeWith(variant, { themedPrompt: 'Predict the tilt.', themedOptions: changedOptions })
  assert.equal(isThemedStepCoherent(variant, changed), false)
})

// --- Guard never crashes on the catalog ------------------------------------------------------

test('coherence: an identical (un-rethemed) variant is always coherent with itself', () => {
  const steps: LessonStep[] = [...inputSteps, ...sequenceSteps, ...operationChoiceSteps, mcqStep]
  for (const step of steps) {
    for (let seed = 0; seed < 30; seed += 1) {
      const variant = randomizeQuestionNumbers(step, mulberry32(seed))
      assert.equal(isThemedStepCoherent(variant, variant), true, `${step.id} @ ${seed} must be self-coherent`)
    }
  }
})
