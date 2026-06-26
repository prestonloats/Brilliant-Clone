// Story Mode question architecture: two-step linear equations (WAVE 2).
//
// Emits a code-graded `input` step for `a·x + k = c` or `a·x - k = c`. The constant `c` is built
// FROM a chosen positive solution `s` so the equation always solves to `s`, and the answer key is
// computed here in code. The matching `checkInputStep` accepts the bare number (`x=`-prefixed
// forms normalize to it).

import { pick, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

const numericAccept = (value: number): string[] =>
  Array.from(new Set([String(value), `x=${value}`, `x = ${value}`]))

export const twoStepLinearArchitecture: QuestionArchitecture = {
  id: 'two-step-linear',
  requiredLessonId: 'two-step-equations',
  skillId: 'two-step-equations',
  stepType: 'input',
  slots: [
    { name: 'a', min: 2, max: 9, note: 'coefficient of x' },
    { name: 'k', min: 1, max: 15, note: 'constant added or subtracted' },
    { name: 's', min: 2, max: 12, note: 'solution' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const a = randInt(rng, 2, 9)
    const op = pick(rng, ['add', 'sub'] as const)
    const k = randInt(rng, 1, 15)
    const s = randInt(rng, 2, 12)
    const c = op === 'add' ? a * s + k : a * s - k

    const equation = op === 'add' ? `${a}x + ${k} = ${c}` : `${a}x - ${k} = ${c}`
    const firstMove = op === 'add' ? `subtracting ${k}` : `adding ${k}`

    const step: InputStep = {
      id: 'two-step-linear',
      type: 'input',
      prompt: `Solve for x: ${equation}`,
      equation,
      accept: numericAccept(s),
      feedback: {
        correct: `Correct. x = ${s}.`,
        incorrect: `Clear the constant by ${firstMove} from both sides, then divide by ${a}.`,
        reveal: `x = ${s}.`,
      },
    }

    return { step, answer: String(s) }
  },
}
