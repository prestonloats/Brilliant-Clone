// Story Mode question architecture: variables on both sides (WAVE 2).
//
// Emits a code-graded `input` step for `lx·x + lk = rx·x + rk`. The right constant `rk` is built
// FROM a chosen solution `s` and the (positive) coefficient gap `lx - rx`, so the equation always
// solves to `s`. The answer key is computed here in code. `lx` is drawn from [4, 12] (not [3, 12])
// so the dependent range `rx ∈ [2, lx - 2]` is always non-empty and the coefficient gap stays >= 2.
// The matching `checkInputStep` accepts the bare number.

import { randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

const numericAccept = (value: number): string[] =>
  Array.from(new Set([String(value), `x=${value}`, `x = ${value}`]))

export const variablesBothSidesArchitecture: QuestionArchitecture = {
  id: 'variables-both-sides',
  requiredLessonId: 'like-terms-variables-both-sides',
  skillId: 'variables-on-both-sides',
  stepType: 'input',
  // Mastery learning: variables-on-both-sides unlocks only once two-step is genuinely mastered.
  masteryPrereqs: ['two-step-equations'],
  slots: [
    { name: 'lx', min: 4, max: 12, note: 'left x-coefficient (kept above rx)' },
    { name: 'rx', min: 2, max: 10, note: 'right x-coefficient, drawn from [2, lx - 2]' },
    { name: 'lk', min: 1, max: 12, note: 'left constant' },
    { name: 's', min: 2, max: 10, note: 'solution' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const lx = randInt(rng, 4, 12)
    const rx = randInt(rng, 2, lx - 2)
    const lk = randInt(rng, 1, 12)
    const s = randInt(rng, 2, 10)
    const rk = lk + (lx - rx) * s

    const equation = `${lx}x + ${lk} = ${rx}x + ${rk}`

    const step: InputStep = {
      id: 'variables-both-sides',
      type: 'input',
      prompt: `Solve for x: ${equation}`,
      equation,
      accept: numericAccept(s),
      feedback: {
        correct: `Correct. x = ${s}.`,
        incorrect: `Subtract ${rx}x from both sides to gather the x-terms, then isolate x.`,
        reveal: `x = ${s}.`,
      },
    }

    return { step, answer: String(s) }
  },
}
