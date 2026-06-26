// Story Mode question architecture: coordinate walk (WAVE 2).
//
// Emits a code-graded `input` step describing a walk from the origin (2-4 signed moves), where the
// learner types the destination as `(x, y)`. The destination is summed here in code and is the
// answer key. The accept list mirrors the bundled `input-net-coordinate-walk` step so the matching
// `checkInputStep` (which lowercases, strips whitespace, and string-compares) accepts the
// parenthesized pair.

import { pick, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

const DIRECTIONS = ['right', 'left', 'up', 'down'] as const
type Direction = (typeof DIRECTIONS)[number]

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  right: { dx: 1, dy: 0 },
  left: { dx: -1, dy: 0 },
  up: { dx: 0, dy: 1 },
  down: { dx: 0, dy: -1 },
}

// Accepted typed forms for a coordinate, matching the bundled coordinate-walk step. `(x, y)` is
// the canonical form; the others cover spacing/comma styles a learner might use.
const coordinateAccept = (x: number, y: number): string[] =>
  Array.from(new Set([`(${x}, ${y})`, `(${x},${y})`, `${x},${y}`, `x=${x},y=${y}`]))

export const coordinateWalkArchitecture: QuestionArchitecture = {
  id: 'coordinate-walk',
  requiredLessonId: 'coordinate-plane',
  skillId: 'coordinate-plane',
  stepType: 'input',
  slots: [
    { name: 'moves', min: 2, max: 4, note: 'number of signed moves in the walk' },
    { name: 'magnitude', min: 1, max: 9, note: 'units travelled per move' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const moveCount = randInt(rng, 2, 4)
    const moves: { magnitude: number; direction: Direction }[] = []
    let x = 0
    let y = 0
    for (let i = 0; i < moveCount; i += 1) {
      const direction = pick(rng, DIRECTIONS)
      const magnitude = randInt(rng, 1, 9)
      moves.push({ magnitude, direction })
      x += DELTA[direction].dx * magnitude
      y += DELTA[direction].dy * magnitude
    }

    const walk = moves.map((move) => `${move.magnitude} ${move.direction}`).join(', ')

    const step: InputStep = {
      id: 'coordinate-walk',
      type: 'input',
      prompt: `From the origin, move ${walk}. Type the final coordinate as (x, y).`,
      accept: coordinateAccept(x, y),
      feedback: {
        correct: `Correct. The final coordinate is (${x}, ${y}).`,
        incorrect: 'Combine the left/right moves for x and the up/down moves for y, keeping right and up positive.',
        reveal: `The final coordinate is (${x}, ${y}).`,
      },
    }

    return { step, answer: `(${x}, ${y})` }
  },
}
