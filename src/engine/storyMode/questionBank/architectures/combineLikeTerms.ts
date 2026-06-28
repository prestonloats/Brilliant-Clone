// Story Mode question architecture: combine like terms (Phase 3 coverage).
//
// Covers the `like-terms` skill (from the Like Terms & Variables on Both Sides lesson), which the
// other architecture for that lesson (`variables-both-sides`) does not exercise. Emits a code-graded
// `input` step asking for the COEFFICIENT after combining two x-terms, e.g. `7x - 2x` -> 5. The
// coefficient is computed here in code and is the answer key; subtraction always keeps it positive.

import { pick, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

export const combineLikeTermsArchitecture: QuestionArchitecture = {
  id: 'combine-like-terms',
  requiredLessonId: 'like-terms-variables-both-sides',
  skillId: 'like-terms',
  stepType: 'input',
  slots: [
    { name: 'a', min: 2, max: 12, note: 'first x-coefficient' },
    { name: 'b', min: 1, max: 9, note: 'second x-coefficient (kept below a for subtraction)' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const op = pick(rng, ['add', 'sub'] as const)
    const a = randInt(rng, 2, 12)
    // Subtraction keeps the result positive (b < a) and within the b-slot bound.
    const b = op === 'sub' ? randInt(rng, 1, Math.min(a - 1, 9)) : randInt(rng, 1, 9)
    const coefficient = op === 'add' ? a + b : a - b
    const equation = op === 'add' ? `${a}x + ${b}x` : `${a}x - ${b}x`

    const step: InputStep = {
      id: 'combine-like-terms',
      type: 'input',
      prompt: `Combine like terms: ${equation}. What is the coefficient of x?`,
      equation,
      accept: Array.from(new Set([String(coefficient), `${coefficient}x`])),
      feedback: {
        correct: `Correct. ${equation} = ${coefficient}x.`,
        incorrect: 'Only the coefficients of like x-terms combine — add or subtract just those numbers.',
        reveal: `${equation} = ${coefficient}x, so the coefficient is ${coefficient}.`,
      },
    }

    return { step, answer: String(coefficient) }
  },
}
