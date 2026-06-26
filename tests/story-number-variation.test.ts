// Story Mode number-variation proof.
//
// `randomizeQuestionNumbers` deterministically rewrites a bundled `LessonStep` with DIFFERENT
// numbers AND a CODE-recomputed answer key, so the endless Story Mode loop serves randomized
// practice instead of replaying the exact bundled questions. These tests prove, for every
// supported step type and equation form, that:
//   - the variant's recomputed key is CORRECT for the new numbers — graded with the REAL
//     `check*Step` graders for both a correct and an incorrect answer;
//   - the displayed equation actually BALANCES at the variant's claimed solution, checked with an
//     INDEPENDENT expression EVALUATOR written here (so a bug shared with the engine's solver
//     cannot hide, and a two-step equation can never be misread as a one-step one);
//   - the variant actually differs from the original numbers;
//   - it is DETERMINISTIC for a fixed seed (so resume rebuilds the identical question);
//   - it FALLS BACK to the original (same reference) for anything it cannot safely vary;
//   - coverage is meaningfully higher than the one-step-only baseline (most questions now vary);
//   - the variant flows through `applyRetheme` and still grades by the variant's key; and
//   - the persisted `variantSeed` survives normalization (bad seeds repaired away).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  balancingEquationsLesson,
  coordinatePlaneLesson,
  graphingLinesLesson,
  lessons,
  likeTermsVariablesBothSidesLesson,
  oneStepEquationsLesson,
  twoStepEquationsLesson,
  type Lesson,
  type LessonStep,
} from '../src/domain'
import {
  checkInputStep,
  checkOperationChoiceStep,
  checkSequenceStep,
  createVariantSeed,
  isAssessedLessonStep,
  mulberry32,
  randomizeQuestionNumbers,
} from '../src/engine'
import { normalizeStorySession } from '../src/backend'
import { applyRetheme } from '../src/story/applyRetheme'
import { findStep } from './helpers/findStep'

// --- Independent oracle: an EVALUATOR, not a solver (does NOT reuse the engine's internals) ---

// Evaluate one linear expression (e.g. "8x + 5 - 3x" or "x/3 - 4") at variable = `value`. Written
// from scratch as a term-summing evaluator so it shares no solving logic with the engine.
const evalExpr = (expr: string, variable: string, value: number): number | null => {
  const text = expr.replace(/\s+/g, '')
  const terms = text.match(/[+-]?(?:[a-zA-Z]\/-?\d+|\d*[a-zA-Z]|\d+)/g)
  if (!terms || terms.join('') !== text) return null
  let sum = 0
  for (const term of terms) {
    let sign = 1
    let body = term
    if (body[0] === '+') body = body.slice(1)
    else if (body[0] === '-') {
      sign = -1
      body = body.slice(1)
    }
    let match: RegExpMatchArray | null
    if ((match = body.match(/^([a-zA-Z])\/(-?\d+)$/))) {
      if (match[1] !== variable) return null
      sum += (sign * value) / Number(match[2])
    } else if ((match = body.match(/^(\d*)([a-zA-Z])$/))) {
      if (match[2] !== variable) return null
      sum += sign * (match[1] ? Number(match[1]) : 1) * value
    } else if ((match = body.match(/^(\d+)$/))) {
      sum += sign * Number(match[1])
    } else {
      return null
    }
  }
  return sum
}

const TERM_SRC = '(?:[a-zA-Z]\\s*\\/\\s*-?\\d+|\\d*[a-zA-Z]|\\d+)'
// A run of terms joined by +/- (the first term may carry a leading sign so a negative side like
// "= -4" is captured); operators are REQUIRED between terms so a word can't masquerade as a run.
const RUN = `[+-]?\\s*${TERM_SRC}(?:\\s*[+-]\\s*${TERM_SRC})*`

// Pull the first "LHS = RHS" linear equation out of free text (a prompt or equation field).
const extractEquation = (text: string): { lhs: string; rhs: string; variable: string } | null => {
  const head = text.split('->')[0]
  const eqIndex = head.indexOf('=')
  if (eqIndex < 0) return null
  const lhs = head.slice(0, eqIndex).match(new RegExp(`${RUN}\\s*$`))
  const rhs = head.slice(eqIndex + 1).match(new RegExp(`^\\s*${RUN}`))
  if (!lhs || !rhs) return null
  const variable = `${lhs[0]}${rhs[0]}`.match(/[a-zA-Z]/)
  if (!variable) return null
  return { lhs: lhs[0].trim(), rhs: rhs[0].trim(), variable: variable[0] }
}

// The strongest independent check: does `value` actually balance the displayed equation?
const solutionBalances = (equationText: string, value: number): boolean => {
  const eq = extractEquation(equationText)
  if (!eq) return false
  const left = evalExpr(eq.lhs, eq.variable, value)
  const right = evalExpr(eq.rhs, eq.variable, value)
  return left !== null && right !== null && Math.abs(left - right) < 1e-9
}

const equationTextOf = (step: LessonStep): string => {
  if ('equation' in step && typeof step.equation === 'string' && step.equation) return step.equation
  if ('prompt' in step) return step.prompt
  return ''
}

const acceptedSolution = (step: Extract<LessonStep, { type: 'input' }>): number => {
  const numeric = step.accept.map(Number).find((value) => Number.isInteger(value))
  assert.ok(numeric !== undefined, `accept[] must contain an integer solution: ${JSON.stringify(step.accept)}`)
  return numeric
}

const asInput = (step: LessonStep): Extract<LessonStep, { type: 'input' }> => {
  assert.equal(step.type, 'input')
  return step as Extract<LessonStep, { type: 'input' }>
}
const asSequence = (step: LessonStep): Extract<LessonStep, { type: 'sequence' }> => {
  assert.equal(step.type, 'sequence')
  return step as Extract<LessonStep, { type: 'sequence' }>
}
const asChoice = (step: LessonStep): Extract<LessonStep, { type: 'operation-choice' }> => {
  assert.equal(step.type, 'operation-choice')
  return step as Extract<LessonStep, { type: 'operation-choice' }>
}

const trailingInteger = (label: string): number | null => {
  const match = label.match(/(-?\d+)\s*$/)
  return match ? Number(match[1]) : null
}

// --- INPUT variants (one-step + multi-step) -------------------------------------------------

// Every input variant must: display an equation the claimed solution truly balances; be graded
// correct by the REAL checker for that solution and incorrect for a near miss; and reject junk.
const assertInputVariantCorrect = (variant: Extract<LessonStep, { type: 'input' }>): number => {
  const solution = acceptedSolution(variant)
  assert.ok(
    solutionBalances(variant.prompt, solution) || solutionBalances(equationTextOf(variant), solution),
    `solution ${solution} must balance the displayed equation: ${variant.prompt}`,
  )
  assert.equal(checkInputStep(variant, String(solution)).correct, true, 'correct answer must grade true')
  assert.equal(checkInputStep(variant, String(solution + 1)).correct, false, 'a near miss must grade false')
  assert.equal(checkInputStep(variant, 'banana').correct, false)
  return solution
}

const oneStepInputs = [
  findStep(balancingEquationsLesson, 'input-box-value', 'input'), // x + 2 = 5
  findStep(balancingEquationsLesson, 'mastery-solve-negative', 'input'), // x + 9 = 4 (negative)
  findStep(oneStepEquationsLesson, 'input-three-x', 'input'), // 3x = 12
  findStep(oneStepEquationsLesson, 'input-x-divided-by-four', 'input'), // x / 4 = 2
  findStep(oneStepEquationsLesson, 'mastery-add-negative-result', 'input'), // x + 19 = 4 (negative)
  findStep(oneStepEquationsLesson, 'mastery-divide-by-negative', 'input'), // x / -4 = 8 (negative)
]

const multiStepInputs = [
  findStep(twoStepEquationsLesson, 'input-puzzle-gate', 'input'), // 2x + 4 = 16
  findStep(twoStepEquationsLesson, 'input-negative-constant', 'input'), // 2x - 7 = 5
  findStep(twoStepEquationsLesson, 'mastery-input-word-problem', 'input'), // 4r + 8 = 32 (word problem)
  findStep(likeTermsVariablesBothSidesLesson, 'input-variable-both-sides', 'input'), // 4x - 5 = x + 10
  findStep(likeTermsVariablesBothSidesLesson, 'mastery-input-combine-and-solve', 'input'), // 8x + 5 - 3x = 2x + 20
]

for (const step of [...oneStepInputs, ...multiStepInputs]) {
  test(`input variant is always correct + eventually varied: ${step.id}`, () => {
    const originalSolution = acceptedSolution(step)
    let variedAtLeastOnce = false
    for (let seed = 0; seed < 80; seed += 1) {
      const variant = asInput(randomizeQuestionNumbers(step, mulberry32(seed)))
      const solution = assertInputVariantCorrect(variant)
      assert.equal(solution < 0, originalSolution < 0, 'sign class preserved')
      if (variant !== step) {
        variedAtLeastOnce = true
        assert.notEqual(variant.prompt, step.prompt, 'the shown numbers changed')
      }
    }
    assert.ok(variedAtLeastOnce, 'expected at least one seed to produce different numbers')
  })
}

// MISPARSE SAFETY: a two-step / both-sides equation must NEVER be read as a one-step one. The
// independent evaluator proves the variant's key solves the FULL multi-term equation (e.g. reading
// `2x + 4 = 16` as `x + 4 = 16` would yield x = 12, which would NOT balance the displayed 2x...).
test('multi-step input variants solve the FULL equation, never a one-step misread', () => {
  for (const step of multiStepInputs) {
    for (let seed = 0; seed < 60; seed += 1) {
      const variant = asInput(randomizeQuestionNumbers(step, mulberry32(seed)))
      const solution = acceptedSolution(variant)
      assert.ok(
        solutionBalances(variant.prompt, solution),
        `[${step.id}] ${variant.prompt} must balance at ${solution}`,
      )
    }
  }
})

// --- SEQUENCE variants (one-step + multi-step) ----------------------------------------------

// The graded key (tile ids + correctOrder) is NEVER changed; the displayed equation must balance
// at the value shown by the correct final tile, and the REAL checker must accept the correct order.
const assertSequenceVariantCorrect = (
  variant: Extract<LessonStep, { type: 'sequence' }>,
  original: Extract<LessonStep, { type: 'sequence' }>,
): void => {
  assert.equal(checkSequenceStep(variant, variant.correctOrder).correct, true)
  assert.deepEqual(variant.correctOrder, original.correctOrder, 'graded order unchanged')
  assert.deepEqual(
    variant.tiles.map((tile) => tile.id),
    original.tiles.map((tile) => tile.id),
    'tile ids unchanged',
  )
  const valueTile = variant.tiles.find((tile) => tile.id === variant.correctOrder.at(-1))
  assert.ok(valueTile, 'the final correct tile must exist')
  const shown = trailingInteger(valueTile.label)
  assert.ok(shown !== null, `the final tile must end in a value: ${valueTile.label}`)
  assert.ok(
    solutionBalances(equationTextOf(variant), shown),
    `final tile value ${shown} must balance ${equationTextOf(variant)}`,
  )
}

const oneStepSequences = [
  findStep(balancingEquationsLesson, 'order-balance-repair', 'sequence'), // y + 1 = 6
  findStep(balancingEquationsLesson, 'mastery-balance-story', 'sequence'), // x - 6 = 9
  findStep(oneStepEquationsLesson, 'input-add-six', 'sequence'), // x + 6 = 10
  findStep(oneStepEquationsLesson, 'order-division-undo', 'sequence'), // x / 6 = 2
]

const multiStepSequences = [
  findStep(twoStepEquationsLesson, 'order-two-step-solution', 'sequence'), // 4x - 5 = 19
  findStep(twoStepEquationsLesson, 'order-mixed-two-step-solution', 'sequence'), // 5 + 2x = 17
  findStep(twoStepEquationsLesson, 'mastery-order-division-two-step', 'sequence'), // x/3 - 4 = 2
  findStep(likeTermsVariablesBothSidesLesson, 'order-variable-both-sides-solution', 'sequence'), // 5x + 7 = 2x + 19
]

for (const step of [...oneStepSequences, ...multiStepSequences]) {
  test(`sequence variant is always correct + eventually varied: ${step.id}`, () => {
    let variedAtLeastOnce = false
    for (let seed = 0; seed < 80; seed += 1) {
      const variant = asSequence(randomizeQuestionNumbers(step, mulberry32(seed)))
      assertSequenceVariantCorrect(variant, step)
      // A wrong order is still rejected by the variant's key.
      assert.equal(checkSequenceStep(variant, [...variant.correctOrder].reverse()).correct, false)
      if (variant !== step) {
        variedAtLeastOnce = true
        assert.notEqual(variant.equation, step.equation, 'the shown equation changed')
      }
    }
    assert.ok(variedAtLeastOnce, 'expected at least one seed to produce different numbers')
  })
}

// --- OPERATION-CHOICE variants --------------------------------------------------------------

const variableOperationChoices = [
  findStep(oneStepEquationsLesson, 'spot-one-side-only-mistake', 'operation-choice'), // x - 5 = 9
  findStep(twoStepEquationsLesson, 'spot-two-step-mistake', 'operation-choice'), // 3x + 6 = 21
]

for (const step of variableOperationChoices) {
  test(`operation-choice variant keeps the correct id + grading, varied: ${step.id}`, () => {
    let variedAtLeastOnce = false
    for (let seed = 0; seed < 80; seed += 1) {
      const variant = asChoice(randomizeQuestionNumbers(step, mulberry32(seed)))
      // The answer is the option id, which must be preserved exactly.
      assert.equal(variant.correctId, step.correctId, 'correct option id unchanged')
      assert.deepEqual(
        variant.choices.map((choice) => choice.id),
        step.choices.map((choice) => choice.id),
        'option ids unchanged',
      )
      assert.equal(checkOperationChoiceStep(variant, variant.correctId).correct, true)
      for (const choice of variant.choices) {
        if (choice.id !== variant.correctId) {
          assert.equal(checkOperationChoiceStep(variant, choice.id).correct, false, 'wrong options stay wrong')
        }
      }
      // The displayed equation must remain a well-formed linear equation.
      assert.ok(extractEquation(variant.equation ?? ''), `equation must parse: ${variant.equation}`)
      if (variant !== step) {
        variedAtLeastOnce = true
        assert.notEqual(variant.equation, step.equation, 'the shown equation changed')
      }
    }
    assert.ok(variedAtLeastOnce, 'expected at least one seed to produce different numbers')
  })
}

// The two-step "what went wrong" variant must keep its narrative self-consistent: the shown wrong
// path `a*x = c+b -> x = (c+b)/a` is the "added instead of subtracted" slip, and the TRUE solution
// `(c-b)/a` differs from it. Verified independently from the rewritten equation chain.
test('spot-two-step-mistake variants stay internally consistent (added, not subtracted)', () => {
  const step = findStep(twoStepEquationsLesson, 'spot-two-step-mistake', 'operation-choice')
  for (let seed = 0; seed < 60; seed += 1) {
    const variant = asChoice(randomizeQuestionNumbers(step, mulberry32(seed)))
    const parts = (variant.equation ?? '').split('->').map((part) => part.trim())
    assert.equal(parts.length, 3, `expected a 3-step chain: ${variant.equation}`)
    const first = extractEquation(parts[0])
    assert.ok(first)
    const a = evalExpr(first.lhs, first.variable, 1)! - evalExpr(first.lhs, first.variable, 0)! // coefficient
    const b = evalExpr(first.lhs, first.variable, 0)! // constant on the x side
    const c = Number(parts[0].split('=')[1].trim())
    const shownWrongX = trailingInteger(parts[2])
    assert.ok(shownWrongX !== null)
    assert.equal(shownWrongX, (c + b) / a, 'the shown wrong x is (c+b)/a, the "added" slip')
    assert.notEqual((c + b) / a, (c - b) / a, 'the true solution (c-b)/a differs from the shown wrong path')
  }
})

// --- FALLBACK safety ------------------------------------------------------------------------

test('falls back to the original (same reference) for unsupported step types', () => {
  const mcq = findStep(balancingEquationsLesson, 'predict-add-left', 'mcq')
  const concept = findStep(balancingEquationsLesson, 'concept-balance', 'concept')
  const balance = findStep(balancingEquationsLesson, 'drag-to-level', 'balance')
  for (let seed = 0; seed < 10; seed += 1) {
    assert.equal(randomizeQuestionNumbers(mcq, mulberry32(seed)), mcq)
    assert.equal(randomizeQuestionNumbers(concept, mulberry32(seed)), concept)
    assert.equal(randomizeQuestionNumbers(balance, mulberry32(seed)), balance)
  }
})

test('falls back for operation-choice / sequence it cannot safely vary', () => {
  // Numeric collisions (b == solution; coefficient == constant sum) make a consistent rewrite
  // impossible, and structured graph/table choices can't be number-varied at all.
  const collisionMove = findStep(twoStepEquationsLesson, 'choose-right-side-expression', 'operation-choice')
  const collisionMistake = findStep(likeTermsVariablesBothSidesLesson, 'spot-variable-move-mistake', 'operation-choice')
  const tableChoice = findStep(graphingLinesLesson, 'choose-line-table', 'operation-choice')
  const graphChoice = findStep(graphingLinesLesson, 'mastery-equation-from-graph', 'operation-choice')
  // A non-equation "combine like terms" ordering and coordinate/graph sequences aren't equations.
  const combineOrder = findStep(likeTermsVariablesBothSidesLesson, 'order-combine-like-terms', 'sequence')
  const plotOrder = findStep(coordinatePlaneLesson, 'order-plot-point', 'sequence')
  const collisionSequence = findStep(likeTermsVariablesBothSidesLesson, 'mastery-sequence-full-solution', 'sequence')

  for (let seed = 0; seed < 60; seed += 1) {
    const rng = () => mulberry32(seed)
    assert.equal(randomizeQuestionNumbers(collisionMove, rng()), collisionMove)
    assert.equal(randomizeQuestionNumbers(collisionMistake, rng()), collisionMistake)
    assert.equal(randomizeQuestionNumbers(tableChoice, rng()), tableChoice)
    assert.equal(randomizeQuestionNumbers(graphChoice, rng()), graphChoice)
    assert.equal(randomizeQuestionNumbers(combineOrder, rng()), combineOrder)
    assert.equal(randomizeQuestionNumbers(plotOrder, rng()), plotOrder)
    assert.equal(randomizeQuestionNumbers(collisionSequence, rng()), collisionSequence)
  }
})

test('falls back for graphing inputs that are not solvable equations or coordinate walks', () => {
  const lineValue = findStep(graphingLinesLesson, 'input-line-y-value', 'input')
  const intercept = findStep(graphingLinesLesson, 'mastery-find-intercept', 'input')
  for (let seed = 0; seed < 30; seed += 1) {
    assert.equal(randomizeQuestionNumbers(lineValue, mulberry32(seed)), lineValue)
    assert.equal(randomizeQuestionNumbers(intercept, mulberry32(seed)), intercept)
  }
})

// --- COORDINATE-WALK input variants ---------------------------------------------------------
//
// Coordinate-plane "move N left/right/up/down, type the final (x, y)" inputs have no `=` equation,
// so the linear engines fall back; the coordinate-walk engine varies them by re-rolling movement
// magnitudes and rebuilding the (x, y) key from CODE. These tests recompute the final coordinate
// from the VARIANT's prompt with an INDEPENDENT walk parser and prove the rebuilt key grades it
// correct while rejecting a near miss + the swapped pair (so a wrong answer can never count).

// Independent oracle: sum signed movements parsed straight from the displayed prompt.
const coordinateFromPrompt = (prompt: string): { x: number; y: number } => {
  let x = 0
  let y = 0
  for (const match of prompt.matchAll(/(\d+)\s*(left|right|up|down)/gi)) {
    const magnitude = Number(match[1])
    const direction = match[2].toLowerCase()
    if (direction === 'right') x += magnitude
    else if (direction === 'left') x -= magnitude
    else if (direction === 'up') y += magnitude
    else y -= magnitude
  }
  return { x, y }
}

const coordinateWalkInputs = [
  findStep(coordinatePlaneLesson, 'input-robot-coordinate', 'input'), // (0,0) -> 5 left, 1 up -> (-5, 1)
  findStep(coordinatePlaneLesson, 'input-net-coordinate-walk', 'input'), // 7 R, 3 U, 9 L, 8 D -> (-2, -5)
]

for (const step of coordinateWalkInputs) {
  test(`coordinate-walk variant rebuilds a correct (x, y) key + varies: ${step.id}`, () => {
    let variedAtLeastOnce = false
    for (let seed = 0; seed < 80; seed += 1) {
      const variant = asInput(randomizeQuestionNumbers(step, mulberry32(seed)))
      // The coordinate the DISPLAYED prompt actually describes (independent of the engine).
      const { x, y } = coordinateFromPrompt(variant.prompt)
      assert.equal(checkInputStep(variant, `(${x}, ${y})`).correct, true, `(${x}, ${y}) must grade correct`)
      assert.equal(checkInputStep(variant, `(${x + 1}, ${y})`).correct, false, 'a near miss must grade false')
      if (x !== y) {
        assert.equal(checkInputStep(variant, `(${y}, ${x})`).correct, false, 'the swapped pair must grade false')
      }
      assert.equal(checkInputStep(variant, 'banana').correct, false)
      if (variant !== step) {
        variedAtLeastOnce = true
        assert.notEqual(variant.prompt, step.prompt, 'the shown movement numbers changed')
        // The stale per-answer hints (keyed by the OLD coordinates) must be dropped on a variant.
        assert.equal(variant.feedback.hintsByAnswer, undefined)
      }
    }
    assert.ok(variedAtLeastOnce, 'expected at least one seed to produce a different coordinate walk')
  })
}

test('coordinate-walk variants are deterministic for a fixed seed', () => {
  for (const step of coordinateWalkInputs) {
    for (const seed of [3, 11, 4242, 0xbeef]) {
      const first = randomizeQuestionNumbers(step, mulberry32(seed))
      const rebuilt = randomizeQuestionNumbers(step, mulberry32(seed))
      assert.deepEqual(rebuilt, first, `${step.id} @ seed ${seed} must rebuild identically`)
    }
  }
})

// --- Determinism + variety ------------------------------------------------------------------

test('a fixed seed produces an identical variant (deterministic resume)', () => {
  const steps: LessonStep[] = [
    ...oneStepInputs,
    ...multiStepInputs,
    ...oneStepSequences,
    ...multiStepSequences,
    ...variableOperationChoices,
  ]
  for (const step of steps) {
    for (const seed of [1, 7, 4242, 0xabcdef]) {
      const first = randomizeQuestionNumbers(step, mulberry32(seed))
      const rebuilt = randomizeQuestionNumbers(step, mulberry32(seed))
      assert.deepEqual(rebuilt, first, `variant for ${step.id} @ seed ${seed} must be reproducible`)
    }
  }
})

test('different seeds explore more than one variant for each supported family', () => {
  const samples: LessonStep[] = [
    multiStepInputs[0], // two-step input
    multiStepInputs[3], // both-sides input
    multiStepSequences[0], // two-step sequence
    multiStepSequences[3], // both-sides sequence
    variableOperationChoices[0], // operation-choice
  ]
  for (const step of samples) {
    const shapes = new Set<string>()
    for (let seed = 0; seed < 60; seed += 1) {
      shapes.add(JSON.stringify(randomizeQuestionNumbers(step, mulberry32(seed))))
    }
    assert.ok(shapes.size > 1, `${step.id} should generate multiple distinct variants`)
  }
})

// --- Broadened randomization (numbers are widely randomized, not a tiny fixed pool) ----------

const integerTokens = (text: string): number[] => {
  const matches = text.match(/-?\d+/g)
  return matches ? matches.map(Number) : []
}

// The numbers must genuinely spread across a BROAD range, not cluster in the old narrow caps
// (one-step operands were 1..9 and multi-step constants 1..12). Over many seeds we should see
// values well past those old maxima, proving the randomization was widened.
test('numbers are broadly randomized, exceeding the old narrow operand caps', () => {
  const samples: LessonStep[] = [
    findStep(balancingEquationsLesson, 'input-box-value', 'input'), // one-step add
    findStep(twoStepEquationsLesson, 'input-puzzle-gate', 'input'), // two-step input
    findStep(twoStepEquationsLesson, 'order-two-step-solution', 'sequence'), // two-step sequence
  ]
  for (const step of samples) {
    let maxToken = 0
    for (let seed = 0; seed < 150; seed += 1) {
      const variant = randomizeQuestionNumbers(step, mulberry32(seed))
      for (const value of integerTokens(equationTextOf(variant))) maxToken = Math.max(maxToken, Math.abs(value))
      if ('prompt' in variant) {
        for (const value of integerTokens(variant.prompt)) maxToken = Math.max(maxToken, Math.abs(value))
      }
    }
    assert.ok(maxToken > 12, `${step.id} should explore numbers beyond the old caps (saw max ${maxToken})`)
  }
})

// --- Distractor coherence (no distractor equals the correct answer or another distractor) -----

// A randomized SEQUENCE must keep every tile label distinct — in particular the "x = solution"
// answer tile must never collide with the "x = right-hand-side" distractor tile.
for (const step of [...oneStepSequences, ...multiStepSequences]) {
  test(`sequence variants keep all tile labels distinct: ${step.id}`, () => {
    for (let seed = 0; seed < 80; seed += 1) {
      const variant = asSequence(randomizeQuestionNumbers(step, mulberry32(seed)))
      const labels = variant.tiles.map((tile) => tile.label)
      assert.equal(new Set(labels).size, labels.length, `duplicate tile label in [${labels.join(' | ')}]`)
    }
  })
}

// A randomized OPERATION-CHOICE must keep every option label distinct so the distractors stay
// distinguishable from the correct option after number substitution.
for (const step of variableOperationChoices) {
  test(`operation-choice variants keep all option labels distinct: ${step.id}`, () => {
    for (let seed = 0; seed < 80; seed += 1) {
      const variant = asChoice(randomizeQuestionNumbers(step, mulberry32(seed)))
      const labels = variant.choices.map((choice) => choice.label)
      assert.equal(new Set(labels).size, labels.length, `duplicate option label in [${labels.join(' | ')}]`)
    }
  })
}

// --- Coverage: most real assessed rethemable questions now vary ------------------------------

const RETHEMABLE: ReadonlySet<LessonStep['type']> = new Set(['input', 'mcq', 'operation-choice', 'sequence'])

const assessedRethemableSteps = (): { lesson: Lesson; step: LessonStep }[] =>
  algebraCourse.lessonOrder.flatMap((lessonId) => {
    const lesson = lessons[lessonId]
    return lesson.steps
      .filter((step) => isAssessedLessonStep(step) && RETHEMABLE.has(step.type))
      .map((step) => ({ lesson, step }))
  })

// A step "varies" if some seed yields a different object (and that variant grades its own key).
const stepVaries = (step: LessonStep): boolean => {
  for (let seed = 0; seed < 50; seed += 1) {
    if (randomizeQuestionNumbers(step, mulberry32(seed)) !== step) return true
  }
  return false
}

test('coverage: the multi-step engine varies far more questions than one-step alone', () => {
  const all = assessedRethemableSteps()
  const varying = all.filter(({ step }) => stepVaries(step))
  const byType = (type: LessonStep['type']) => varying.filter(({ step }) => step.type === type).length

  // The one-step-only engine varied exactly 10 (6 inputs + 4 sequences). We must clear that bar
  // by a wide margin now that two-step, both-sides, and operation-choice questions vary too.
  assert.ok(
    varying.length >= 20,
    `expected >= 20 assessed rethemable steps to vary, got ${varying.length} of ${all.length}`,
  )
  assert.ok(varying.length > 10, 'must beat the one-step-only baseline of 10')
  // Each supported family contributes multiple varying questions.
  assert.ok(byType('input') >= 9, `inputs varying: ${byType('input')}`)
  assert.ok(byType('sequence') >= 8, `sequences varying: ${byType('sequence')}`)
  assert.ok(byType('operation-choice') >= 2, `operation-choices varying: ${byType('operation-choice')}`)
})

test('coverage: specific real questions vary, and genuinely unsafe ones fall back', () => {
  const shouldVary = [
    findStep(twoStepEquationsLesson, 'input-puzzle-gate', 'input'),
    findStep(twoStepEquationsLesson, 'input-negative-constant', 'input'),
    findStep(twoStepEquationsLesson, 'mastery-input-word-problem', 'input'),
    findStep(likeTermsVariablesBothSidesLesson, 'input-variable-both-sides', 'input'),
    findStep(likeTermsVariablesBothSidesLesson, 'mastery-input-combine-and-solve', 'input'),
    findStep(twoStepEquationsLesson, 'order-two-step-solution', 'sequence'),
    findStep(twoStepEquationsLesson, 'order-mixed-two-step-solution', 'sequence'),
    findStep(twoStepEquationsLesson, 'mastery-order-division-two-step', 'sequence'),
    findStep(likeTermsVariablesBothSidesLesson, 'order-variable-both-sides-solution', 'sequence'),
    findStep(oneStepEquationsLesson, 'spot-one-side-only-mistake', 'operation-choice'),
    findStep(twoStepEquationsLesson, 'spot-two-step-mistake', 'operation-choice'),
  ]
  for (const step of shouldVary) assert.ok(stepVaries(step), `${step.id} should vary`)

  const shouldFallBack = [
    findStep(balancingEquationsLesson, 'predict-add-left', 'mcq'),
    findStep(twoStepEquationsLesson, 'choose-right-side-expression', 'operation-choice'),
    findStep(likeTermsVariablesBothSidesLesson, 'spot-variable-move-mistake', 'operation-choice'),
    findStep(likeTermsVariablesBothSidesLesson, 'order-combine-like-terms', 'sequence'),
    findStep(likeTermsVariablesBothSidesLesson, 'mastery-sequence-full-solution', 'sequence'),
    findStep(graphingLinesLesson, 'choose-line-table', 'operation-choice'),
  ]
  for (const step of shouldFallBack) assert.ok(!stepVaries(step), `${step.id} should fall back`)
})

// --- Through the retheme + grading pipeline --------------------------------------------------

test('a themed multi-step variant still grades by the variant\u2019s recomputed key', () => {
  const step = findStep(twoStepEquationsLesson, 'input-puzzle-gate', 'input')
  const variant = asInput(randomizeQuestionNumbers(step, mulberry32(2026)))
  const solution = assertInputVariantCorrect(variant)

  // Retheme only rewrites display text; the variant's answer key must pass through untouched.
  const applied = applyRetheme(variant, {
    themedPrompt: `Captain Nova recalibrates the gate: solve ${equationTextOf(variant)}.`,
  })
  assert.equal(applied.themed, true)
  const themed = asInput(applied.step)
  assert.deepEqual(themed.accept, variant.accept) // graded key is the VARIANT's
  assert.equal(checkInputStep(themed, String(solution)).correct, true)
  assert.equal(checkInputStep(themed, String(solution + 1)).correct, false)
})

// --- Persistence / normalization ------------------------------------------------------------

test('variantSeed survives normalization and bad seeds are repaired away', () => {
  const baseQuestion = {
    sourceLessonId: 'balancing-equations',
    sourceStepId: 'input-box-value',
    stepType: 'input',
    themedPrompt: 'A themed reactor puzzle.',
    themed: true,
    generatedAt: '2026-06-23T00:00:00.000Z',
  }
  const base = { id: 'story-seeded', userId: 'user-1' }

  const good = normalizeStorySession({ ...base, currentQuestion: { ...baseQuestion, variantSeed: 42 } })
  assert.ok(good)
  assert.equal(good.currentQuestion?.variantSeed, 42)
  assert.equal(good.history[0]?.variantSeed, 42)

  for (const badSeed of [-1, 1.5, 'x', Number.NaN, null]) {
    const repaired = normalizeStorySession({
      ...base,
      currentQuestion: { ...baseQuestion, variantSeed: badSeed },
    })
    assert.ok(repaired)
    assert.equal(repaired.currentQuestion !== undefined, true)
    assert.equal('variantSeed' in (repaired.currentQuestion ?? {}), false)
  }
})

test('createVariantSeed returns a valid uint32 seed', () => {
  for (let i = 0; i < 50; i += 1) {
    const seed = createVariantSeed()
    assert.ok(Number.isInteger(seed))
    assert.ok(seed >= 0 && seed <= 0xffffffff)
  }
})
