// Story Mode question architecture: choose the inverse operation (Phase 3 coverage).
//
// Covers the `inverse-operations` skill from the Balancing Equations lesson — undo an operation by
// applying its INVERSE to both sides (addition/subtraction undo each other; multiplication/division
// undo each other). Emits a code-graded `operation-choice` step: a one-step equation plus four moves,
// exactly one of which isolates x. The correct choice id is computed here in code and is the key.

import { pick, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type OperationChoiceStep = Extract<LessonStep, { type: 'operation-choice' }>

type InverseId = 'subtract' | 'add' | 'multiply' | 'divide'

export const inverseOperationArchitecture: QuestionArchitecture = {
  id: 'inverse-operation',
  requiredLessonId: 'balancing-equations',
  skillId: 'inverse-operations',
  stepType: 'operation-choice',
  slots: [
    { name: 'a', min: 2, max: 12, note: 'operand applied to x' },
    { name: 's', min: 2, max: 12, note: 'hidden solution used to build a valid equation' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const op = pick(rng, ['add', 'sub', 'mul', 'div'] as const)
    const a = randInt(rng, 2, 12)
    const s = randInt(rng, 2, 12)

    // Build a valid one-step equation and the inverse move that isolates x.
    let equation: string
    let correctId: InverseId
    if (op === 'add') {
      equation = `x + ${a} = ${s + a}`
      correctId = 'subtract'
    } else if (op === 'sub') {
      equation = `x - ${a} = ${s - a}`
      correctId = 'add'
    } else if (op === 'mul') {
      equation = `${a}x = ${a * s}`
      correctId = 'divide'
    } else {
      equation = `x / ${a} = ${s}` // x = a * s
      correctId = 'multiply'
    }

    // A fixed set of four moves; exactly one is the inverse for this equation.
    const choices = [
      { id: 'subtract', label: `Subtract ${a} from both sides`, feedback: 'Subtraction undoes addition.' },
      { id: 'add', label: `Add ${a} to both sides`, feedback: 'Addition undoes subtraction.' },
      { id: 'multiply', label: `Multiply both sides by ${a}`, feedback: 'Multiplication undoes division.' },
      { id: 'divide', label: `Divide both sides by ${a}`, feedback: 'Division undoes multiplication.' },
    ]
    const correctMove =
      correctId === 'subtract'
        ? `subtract ${a} from both sides`
        : correctId === 'add'
          ? `add ${a} to both sides`
          : correctId === 'divide'
            ? `divide both sides by ${a}`
            : `multiply both sides by ${a}`

    const step: OperationChoiceStep = {
      id: 'inverse-operation',
      type: 'operation-choice',
      prompt: 'Which single move isolates x?',
      equation,
      choices,
      correctId,
      feedback: {
        correct: 'Correct. You applied the inverse operation to both sides.',
        incorrect:
          'Use the inverse: addition and subtraction undo each other, and multiplication and division undo each other.',
        reveal: `Apply the inverse of the operation on x — ${correctMove}.`,
      },
    }

    return { step, answer: correctId }
  },
}
