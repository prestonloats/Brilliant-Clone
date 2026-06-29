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

type Op = 'add' | 'sub' | 'mul' | 'div'

// Builds the displayed equation and its code-computed solution for the chosen operation. For
// division the drawn `s` is the displayed quotient and the solution is `a · s`, which keeps the
// arithmetic integer (the other three operations solve directly to `s`).
const buildOneStep = (
  op: Op,
  a: number,
  s: number,
): { equation: string; solution: number } => {
  if (op === 'add') return { equation: `x + ${a} = ${s + a}`, solution: s }
  if (op === 'sub') return { equation: `x - ${a} = ${s - a}`, solution: s }
  if (op === 'mul') return { equation: `${a}x = ${a * s}`, solution: s }
  return { equation: `x / ${a} = ${s}`, solution: a * s }
}

// Op-specific explanatory feedback: a method-only `incorrect` (no answer, so attempt 2 still
// teaches rather than gives it away), a fully WORKED `reveal`, and `hintsByAnswer` keyed to the
// predictable slips (typing the right-hand side, repeating the operation instead of undoing it).
// All keys are derived from the drawn numbers and can never equal the accepted solution, so they
// only ever fire on a genuine miss. Pure in `op`/`a`/`s` — draws no rng — so resume stays exact.
const buildFeedback = (op: Op, a: number, s: number, solution: number): InputStep['feedback'] => {
  const correct = `Correct. x = ${solution}.`
  if (op === 'add') {
    const rhs = s + a
    return {
      correct,
      incorrect: `Subtract ${a} from both sides to undo the + ${a}, leaving x by itself.`,
      reveal: `Subtract ${a} from both sides: x = ${rhs} - ${a} = ${solution}.`,
      hintsByAnswer: {
        [String(rhs)]: `${rhs} is the whole right side. Undo the + ${a} first: x = ${rhs} - ${a} = ${solution}.`,
        [String(rhs + a)]: `That adds ${a} again instead of undoing it. Subtract: x = ${rhs} - ${a} = ${solution}.`,
      },
    }
  }
  if (op === 'sub') {
    const rhs = s - a
    return {
      correct,
      incorrect: `Add ${a} to both sides to undo the - ${a}, leaving x by itself.`,
      reveal: `Add ${a} to both sides: x = ${rhs} + ${a} = ${solution}.`,
      hintsByAnswer: {
        [String(rhs)]: `${rhs} is the whole right side. Undo the - ${a} first: x = ${rhs} + ${a} = ${solution}.`,
        [String(rhs - a)]: `That subtracts ${a} again instead of undoing it. Add: x = ${rhs} + ${a} = ${solution}.`,
      },
    }
  }
  if (op === 'mul') {
    const rhs = a * s
    return {
      correct,
      incorrect: `Divide both sides by ${a} to undo multiplying x by ${a}.`,
      reveal: `Divide both sides by ${a}: x = ${rhs} / ${a} = ${solution}.`,
      hintsByAnswer: {
        [String(rhs)]: `${rhs} is the whole right side. ${a}x means ${a} times x, so divide by ${a}: x = ${rhs} / ${a} = ${solution}.`,
      },
    }
  }
  const q = s // the displayed quotient; the solution is a · q
  return {
    correct,
    incorrect: `Multiply both sides by ${a} to undo dividing x by ${a}.`,
    reveal: `Multiply both sides by ${a}: x = ${q} \u00d7 ${a} = ${solution}.`,
    hintsByAnswer: {
      [String(q)]: `${q} is the value after dividing by ${a}. Undo it by multiplying: x = ${q} \u00d7 ${a} = ${solution}.`,
    },
  }
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
      feedback: buildFeedback(op, a, s, solution),
    }

    return { step, answer: String(solution) }
  },
}
