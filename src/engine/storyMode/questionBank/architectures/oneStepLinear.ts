// Story Mode question architecture: one-step linear equations (WAVE 2).
//
// Emits a code-graded `input` step for `x + a = b`, `x - a = b`, `a·x = b`, or `x / a = q`. The
// equation is built FROM a chosen integer solution so it ALWAYS has exactly that solution, and
// the answer key is computed here in code (never stored), mirroring the determinism invariant of
// `randomizeQuestionNumbers`. The matching `checkInputStep` accepts the bare number (it strips an
// `x=` prefix and compares numerically with a small tolerance), so the bare value is the key.

import { nonzeroInt, numericAccept, pick, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

// Builds the displayed equation and its code-computed solution for the chosen operation. For
// division the drawn `s` is the displayed quotient and the solution is `a · s`, which keeps the
// arithmetic integer (the other three operations solve directly to `s`).
const buildOneStep = (
  op: 'add' | 'sub' | 'mul' | 'div',
  a: number,
  s: number,
): { equation: string; solution: number } => {
  if (op === 'add') return { equation: `x + ${a} = ${s + a}`, solution: s }
  if (op === 'sub') return { equation: `x - ${a} = ${s - a}`, solution: s }
  if (op === 'mul') return { equation: `${a}x = ${a * s}`, solution: s }
  return { equation: `x / ${a} = ${s}`, solution: a * s }
}

export const oneStepLinearArchitecture: QuestionArchitecture = {
  id: 'one-step-linear',
  requiredLessonId: 'one-step-equations',
  skillId: 'one-step-equations',
  stepType: 'input',
  slots: [
    { name: 'a', min: 2, max: 12, note: 'operand: addend, subtrahend, factor, or divisor' },
    { name: 's', min: -12, max: 12, note: 'nonzero solution (add/sub/mul) or displayed quotient (div)' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const op = pick(rng, ['add', 'sub', 'mul', 'div'] as const)
    const a = randInt(rng, 2, 12)
    const s = nonzeroInt(rng, -12, 12)
    const { equation, solution } = buildOneStep(op, a, s)

    const step: InputStep = {
      id: 'one-step-linear',
      type: 'input',
      prompt: `Solve for x: ${equation}`,
      equation,
      accept: numericAccept(solution),
      feedback: {
        correct: `Correct. x = ${solution}.`,
        incorrect: 'Undo the single operation on both sides to leave x by itself.',
        reveal: `x = ${solution}.`,
      },
    }

    return { step, answer: String(solution) }
  },
}
