// Story Mode question architecture: keep the scale balanced (Phase 3 coverage).
//
// Covers the `equality` skill from the Balancing Equations lesson — the idea that the two sides of
// an equation hold the SAME value. Emits a code-graded `input` step: a level balance whose left pan
// weighs `total` and whose right pan holds a known weight plus a mystery `m`; the learner finds `m`.
// The mystery weight is computed here in code (total - known) and is the answer key.

import { randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

export const balanceEqualityArchitecture: QuestionArchitecture = {
  id: 'balance-equality',
  requiredLessonId: 'balancing-equations',
  skillId: 'equality',
  stepType: 'input',
  slots: [
    { name: 'known', min: 1, max: 12, note: 'right-pan known weight' },
    { name: 'mystery', min: 1, max: 12, note: 'mystery weight (the answer)' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const known = randInt(rng, 1, 12)
    const mystery = randInt(rng, 1, 12)
    const total = known + mystery // the left pan; both pans must be equal
    const equation = `${total} = ${known} + m`

    const step: InputStep = {
      id: 'balance-equality',
      type: 'input',
      prompt: `A balance scale is level. The left pan weighs ${total}. The right pan holds a ${known} weight plus a mystery weight m. What is m?`,
      equation,
      accept: Array.from(new Set([String(mystery), `m=${mystery}`, `m = ${mystery}`])),
      feedback: {
        correct: `Correct. Both pans weigh the same, so m = ${total} - ${known} = ${mystery}.`,
        incorrect: 'Both pans must weigh the same. Subtract the known weight from the total to find m.',
        reveal: `m = ${total} - ${known} = ${mystery}.`,
      },
    }

    return { step, answer: String(mystery) }
  },
}
