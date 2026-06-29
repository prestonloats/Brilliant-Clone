// Story Mode question architecture: two-step linear equations (WAVE 2).
//
// Emits a code-graded `input` step for `a·x + k = c` or `a·x - k = c`. The constant `c` is built
// FROM a chosen positive solution `s` so the equation always solves to `s`, and the answer key is
// computed here in code. The matching `checkInputStep` accepts the bare number (`x=`-prefixed
// forms normalize to it).

import { numericAccept, pick, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

export const twoStepLinearArchitecture: QuestionArchitecture = {
  id: 'two-step-linear',
  requiredLessonId: 'two-step-equations',
  skillId: 'two-step-equations',
  stepType: 'input',
  // Mastery learning: two-step practice unlocks only once one-step is genuinely mastered.
  masteryPrereqs: ['one-step-equations'],
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
    // The value of `a·x` once the constant is cleared (the intermediate the worked reveal shows).
    const cleared = a * s
    const clearStep = op === 'add' ? `${c} - ${k}` : `${c} + ${k}`
    const clearVerb = op === 'add' ? `Subtract ${k}` : `Add ${k}`

    // Common slips: typing the right-hand side `c`, or stopping at `a·x` without the final divide.
    const hintsByAnswer: Record<string, string> = {
      [String(cleared)]: `${cleared} is the value of ${a}x after clearing the constant. Divide by ${a}: x = ${s}.`,
    }
    if (c !== s) {
      hintsByAnswer[String(c)] =
        `${c} is the whole right side. First clear the constant by ${firstMove} to get ${a}x = ${cleared}, then divide by ${a}: x = ${s}.`
    }

    const step: InputStep = {
      id: 'two-step-linear',
      type: 'input',
      prompt: `Solve for x: ${equation}`,
      equation,
      accept: numericAccept(s),
      feedback: {
        correct: `Correct. x = ${s}.`,
        incorrect: `Clear the constant by ${firstMove} from both sides, then divide by ${a}.`,
        reveal: `${clearVerb} from both sides: ${a}x = ${clearStep} = ${cleared}. Divide by ${a}: x = ${s}.`,
        hintsByAnswer,
      },
    }

    return { step, answer: String(s) }
  },
}
