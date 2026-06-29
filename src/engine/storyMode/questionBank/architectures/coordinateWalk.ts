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

// Render a signed running sum like `7 - 9` (first term keeps its own sign, later terms show the
// operator). Empty -> "0"; a single term -> just that term. Used to spell out each axis total.
const joinSigned = (parts: number[]): string => {
  if (parts.length === 0) return '0'
  return parts.map((part, index) => (index === 0 ? String(part) : part < 0 ? ` - ${-part}` : ` + ${part}`)).join('')
}

// "x = 7 - 9 = -2" when the axis has multiple moves, or just "x = -2" when it has zero or one.
const axisReveal = (label: string, parts: number[], total: number): string =>
  parts.length > 1 ? `${label} = ${joinSigned(parts)} = ${total}` : `${label} = ${total}`

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

    // Signed per-axis contributions (right/up positive), so the reveal can spell out each total.
    const xParts = moves.filter((m) => m.direction === 'right' || m.direction === 'left').map((m) => DELTA[m.direction].dx * m.magnitude)
    const yParts = moves.filter((m) => m.direction === 'up' || m.direction === 'down').map((m) => DELTA[m.direction].dy * m.magnitude)

    // The classic slip is reversing the pair to (y, x); catch the two un-spaced normalized forms a
    // learner might type. Only meaningful when x !== y (otherwise the "swap" equals the answer).
    const swappedHint = `Keep the order (x, y): combine the left/right moves for x first, then up/down for y. The point is (${x}, ${y}).`
    const hintsByAnswer: Record<string, string> = {}
    if (x !== y) {
      hintsByAnswer[`(${y},${x})`] = swappedHint
      hintsByAnswer[`${y},${x}`] = swappedHint
    }

    const step: InputStep = {
      id: 'coordinate-walk',
      type: 'input',
      prompt: `From the origin, move ${walk}. Type the final coordinate as (x, y).`,
      accept: coordinateAccept(x, y),
      feedback: {
        correct: `Correct. The final coordinate is (${x}, ${y}).`,
        incorrect: 'Combine the left/right moves for x and the up/down moves for y, keeping right and up positive.',
        reveal: `Combine each direction: ${axisReveal('x', xParts, x)}; ${axisReveal('y', yParts, y)}. The point is (${x}, ${y}).`,
        ...(Object.keys(hintsByAnswer).length > 0 ? { hintsByAnswer } : {}),
      },
    }

    return { step, answer: `(${x}, ${y})` }
  },
}
