// Story Mode question architecture: evaluate a line at a point (WAVE 2).
//
// Emits a code-graded `input` step asking for `y` on the line `y = m·x + b` at a given `x`. The
// value `y = m·x0 + b` is computed here in code and is the answer key. The matching
// `checkInputStep` accepts the bare number; `y =` styles are added for learner convenience.

import { nonzeroInt, numericAccept, randInt } from '../architectureTypes'
import type { GeneratedQuestion, QuestionArchitecture } from '../architectureTypes'
import type { LessonStep } from '../../../../domain'
import type { Rng } from '../../randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>

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
  // Mastery learning: evaluating a line unlocks only once the coordinate plane is genuinely mastered.
  masteryPrereqs: ['coordinate-plane'],
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
    const product = m * x0 // the slope term m·x0
    const y = product + b
    // The intercept term as it reads after the slope term, e.g. " + 4", " - 6", or "" when b = 0.
    const bTerm = b === 0 ? '' : b > 0 ? ` + ${b}` : ` - ${-b}`

    // Predictable slips: dropping the intercept (answering m·x0), or using only the intercept b.
    const hintsByAnswer: Record<string, string> = {}
    if (b !== 0) {
      hintsByAnswer[String(product)] = `${product} is ${m}(${x0}). Don't forget the intercept: ${product}${bTerm} = ${y}.`
    }
    if (x0 !== 0 && b !== product) {
      hintsByAnswer[String(b)] = `${b} is only the intercept. Add the slope term ${m}(${x0}) = ${product}: ${product}${bTerm} = ${y}.`
    }

    const step: InputStep = {
      id: 'line-value',
      type: 'input',
      prompt: `For the line ${line}, what is y when x = ${x0}?`,
      equation: line,
      accept: numericAccept(y, 'y'),
      feedback: {
        correct: `Correct. When x = ${x0}, y = ${y}.`,
        incorrect: 'Substitute the x-value into y = mx + b and simplify.',
        reveal:
          b === 0
            ? `Substitute x = ${x0}: y = ${m}(${x0}) = ${y}.`
            : `Substitute x = ${x0}: y = ${m}(${x0})${bTerm} = ${product}${bTerm} = ${y}.`,
        ...(Object.keys(hintsByAnswer).length > 0 ? { hintsByAnswer } : {}),
      },
    }

    return { step, answer: String(y) }
  },
}
