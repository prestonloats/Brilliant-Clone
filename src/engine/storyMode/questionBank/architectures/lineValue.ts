// Story Mode question architecture: evaluate a line at a point (WAVE 2).
//
// Emits a code-graded `input` step asking for `y` on the line `y = m·x + b` at a given `x`. The
// value `y = m·x0 + b` is computed here in code and is the answer key. The matching
// `checkInputStep` accepts the bare number; `y =` styles are added for learner convenience.

import { randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

// Inclusive integer in [min, max] excluding 0 (assumes min < 0 < max), drawing the rng once.
const nonzeroInt = (rng: Rng, min: number, max: number): number => {
  const negatives = -min
  const index = randInt(rng, 0, negatives + max - 1)
  return index < negatives ? min + index : index - negatives + 1
}

const numericAccept = (value: number): string[] =>
  Array.from(new Set([String(value), `y=${value}`, `y = ${value}`]))

// Renders `y = mx + b` in the same plain notation the bundled graphing lesson uses (coefficients
// of +/-1 collapse to `x`/`-x`, and a zero intercept is dropped).
const formatLine = (m: number, b: number): string => {
  const slope = m === 1 ? 'x' : m === -1 ? '-x' : `${m}x`
  if (b === 0) return `y = ${slope}`
  if (b > 0) return `y = ${slope} + ${b}`
  return `y = ${slope} - ${-b}`
}

export const lineValueArchitecture: QuestionArchitecture = {
  id: 'line-value',
  requiredLessonId: 'graphing-lines',
  skillId: 'graphing-lines',
  stepType: 'input',
  slots: [
    { name: 'm', min: -4, max: 4, note: 'nonzero slope' },
    { name: 'b', min: -6, max: 6, note: 'y-intercept' },
    { name: 'x0', min: -5, max: 5, note: 'x-value to evaluate at' },
  ],
  generate(rng: Rng): GeneratedQuestion {
    const m = nonzeroInt(rng, -4, 4)
    const b = randInt(rng, -6, 6)
    const x0 = randInt(rng, -5, 5)
    const line = formatLine(m, b)
    const y = m * x0 + b

    const step: InputStep = {
      id: 'line-value',
      type: 'input',
      prompt: `For the line ${line}, what is y when x = ${x0}?`,
      equation: line,
      accept: numericAccept(y),
      feedback: {
        correct: `Correct. When x = ${x0}, y = ${y}.`,
        incorrect: 'Substitute the x-value into y = mx + b and simplify.',
        reveal: `Substitute x = ${x0}: y = ${y}.`,
      },
    }

    return { step, answer: String(y) }
  },
}
