// Story Mode question architecture: one-step "order the steps" sequence (WAVE 2).
//
// Mirrors the bundled one-step ordering questions (e.g. `input-add-six`): four tiles holding the
// correct inverse move, the `x = solution` tile, a wrong-direction move distractor, and an
// `x = right-hand-side` value distractor. The equation is built FROM a chosen solution, and the
// graded `correctOrder` (plus the identical `answer`) is the [undo move, solution] pair. The
// matching `checkSequenceStep` accepts the exact ordered tile ids.

import { nonzeroInt, pick, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type SequenceStep = Extract<LessonStep, { type: 'sequence' }>

export const oneStepSequenceArchitecture: QuestionArchitecture = {
  id: 'one-step-sequence',
  requiredLessonId: 'one-step-equations',
  skillId: 'one-step-equations',
  stepType: 'sequence',
  slots: [
    { name: 'a', min: 1, max: 15, note: 'addend/subtrahend undone by the inverse move' },
    { name: 's', min: -9, max: 9, note: 'nonzero solution shown on the answer tile' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const op = pick(rng, ['add', 'sub'] as const)
    const a = randInt(rng, 1, 15)
    const s = nonzeroInt(rng, -9, 9)
    const b = op === 'add' ? s + a : s - a

    const equation = op === 'add' ? `x + ${a} = ${b}` : `x - ${a} = ${b}`
    const undoLabel = op === 'add' ? `Subtract ${a} from both sides` : `Add ${a} to both sides`
    const wrongLabel = op === 'add' ? `Add ${a} to both sides` : `Subtract ${a} from both sides`

    const tiles = [
      { id: 'undo-move', label: undoLabel },
      { id: 'solution-value', label: `x = ${s}` },
      { id: 'wrong-move', label: wrongLabel },
      { id: 'rhs-value', label: `x = ${b}` },
    ]
    const correctOrder = ['undo-move', 'solution-value']

    const step: SequenceStep = {
      id: 'one-step-sequence',
      type: 'sequence',
      prompt: `Tap the steps in order to solve ${equation}.`,
      equation,
      tiles,
      correctOrder,
      feedback: {
        correct: `Correct. ${undoLabel}, then x = ${s}.`,
        incorrect: 'Undo the operation on both sides first, then name the value of x.',
        incomplete: 'Choose the inverse move first, then the resulting value of x.',
        reveal: `Tap "${undoLabel}", then "x = ${s}".`,
        // Per-tile misconceptions, so a wrong first tap teaches instead of repeating the generic miss.
        hintsByTile: {
          'wrong-move':
            op === 'add'
              ? `Adding ${a} repeats the + ${a} instead of undoing it. Subtract ${a} from both sides.`
              : `Subtracting ${a} repeats the - ${a} instead of undoing it. Add ${a} to both sides.`,
          'rhs-value': `x = ${b} just copies the right side. Undo the operation first, then x = ${s}.`,
          'solution-value': `x = ${s} is the result — tap the undo move first, then this tile.`,
        },
      },
    }

    return { step, answer: [...correctOrder] }
  },
}
