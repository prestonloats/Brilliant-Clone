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

type EquationOp = 'add' | 'sub' | 'mul' | 'div'

// The operation x undergoes in the displayed equation, named for the feedback text.
const OP_NOUN: Record<EquationOp, string> = {
  add: 'addition',
  sub: 'subtraction',
  mul: 'multiplication',
  div: 'division',
}

// The choice id that REPEATS the equation's operation (the seductive wrong move) instead of
// undoing it — always a distractor, never the correct inverse.
const SAME_OP_CHOICE: Record<EquationOp, InverseId> = {
  add: 'add',
  sub: 'subtract',
  mul: 'multiply',
  div: 'divide',
}

// Present-tense verb for each choice, so a wrong-family pick can name what it would do.
const CHOICE_VERB: Record<InverseId, string> = {
  subtract: 'subtracting',
  add: 'adding',
  multiply: 'multiplying',
  divide: 'dividing',
}

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

    const opNoun = OP_NOUN[op]
    const sameOpChoice = SAME_OP_CHOICE[op]

    // Feedback CONTEXTUAL to this equation: the correct move confirms the inverse; the move that
    // repeats the operation explains it makes x worse; a wrong-family move says why it can't undo
    // this operation. (Far clearer than the old static "X undoes Y" lines, which were irrelevant —
    // or misleading — for the equation actually shown.)
    const choiceFeedback = (id: InverseId): string => {
      if (id === correctId) return `Correct — the inverse of ${opNoun} isolates x.`
      if (id === sameOpChoice) {
        return `That repeats the ${opNoun} on x instead of undoing it, pushing x further from being alone. Use the inverse operation.`
      }
      return `x is changed by ${opNoun} here, so ${CHOICE_VERB[id]} can't undo it. Pair each operation with its inverse: addition with subtraction, multiplication with division.`
    }

    // A fixed set of four moves; exactly one is the inverse for this equation.
    const choices = [
      { id: 'subtract', label: `Subtract ${a} from both sides`, feedback: choiceFeedback('subtract') },
      { id: 'add', label: `Add ${a} to both sides`, feedback: choiceFeedback('add') },
      { id: 'multiply', label: `Multiply both sides by ${a}`, feedback: choiceFeedback('multiply') },
      { id: 'divide', label: `Divide both sides by ${a}`, feedback: choiceFeedback('divide') },
    ]
    const correctMove =
      correctId === 'subtract'
        ? `subtract ${a} from both sides`
        : correctId === 'add'
          ? `add ${a} to both sides`
          : correctId === 'divide'
            ? `divide both sides by ${a}`
            : `multiply both sides by ${a}`
    const correctMoveCap = correctMove.charAt(0).toUpperCase() + correctMove.slice(1)

    const step: OperationChoiceStep = {
      id: 'inverse-operation',
      type: 'operation-choice',
      prompt: 'Which single move isolates x?',
      equation,
      choices,
      correctId,
      feedback: {
        correct: `Correct. ${correctMoveCap} undoes the ${opNoun} on x.`,
        incorrect: `The operation on x is ${opNoun}. Undo it with its inverse — addition with subtraction, multiplication with division.`,
        reveal: `Undo the ${opNoun} on x with its inverse: ${correctMove}.`,
      },
    }

    return { step, answer: correctId }
  },
}
