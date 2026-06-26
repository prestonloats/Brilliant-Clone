// Story Mode multi-step number-variation engine.
//
// This module extends the one-step engine in `randomizeQuestionNumbers.ts` to the harder,
// real Story Mode questions: two-step and variables-on-both-sides `input`/`sequence` steps,
// plus number-based `operation-choice` steps. Like the one-step engine, EVERY variant is
// produced by CODE and double-guarded so a wrong answer key can never ship:
//
//   1. We parse the bundled equation into a tiny linear model and recompute its solution.
//   2. We REFUSE to vary unless that recomputed solution is what the bundled key already
//      accepts (verified with the REAL checkers), catching any misparse (e.g. reading
//      `2x + 4 = 16` as `x + 4 = 16`).
//   3. After building a variant we RE-VERIFY with the real `check*Step` that the recomputed
//      key grades the recomputed answer correct AND a near-miss incorrect.
//
// The core trick for the multi-term shapes is NUMBER-TOKEN SUBSTITUTION: rather than trying to
// re-format an equation string, we keep the bundled question's exact wording/structure and only
// swap whole-number tokens for new values, driven by a per-shape map of the question's
// "quantities" (coefficient, constant, right-hand side, solution, intermediate results...). The
// substitution is only attempted when every number in the (substituted) text maps to exactly one
// known quantity (full coverage + distinctness), so nothing can be left stale or mis-swapped; any
// ambiguity falls back to the original step unchanged. Correctness > variety, always.

import type { LessonStep } from '../../domain'
import { checkInputStep, checkOperationChoiceStep, checkSequenceStep } from '../checkers'
import type { Rng } from './randomizeQuestionNumbers'

type InputStep = Extract<LessonStep, { type: 'input' }>
type SequenceStep = Extract<LessonStep, { type: 'sequence' }>
type OperationChoiceStep = Extract<LessonStep, { type: 'operation-choice' }>

// --- number-token utilities -----------------------------------------------------------------

// A whole integer not glued to another digit (so "12" is one token, and the "2" in "2x" is a
// token while the "1" in "10" is not split). Signs are left as surrounding text so a magnitude
// map cleanly rewrites "-5" -> "-7" by swapping only the digits.
const NUMBER_TOKEN = /(?<!\d)\d+(?!\d)/g

const collectNumbers = (texts: Iterable<string>): number[] => {
  const out: number[] = []
  for (const text of texts) {
    const matches = text.match(NUMBER_TOKEN)
    if (matches) for (const match of matches) out.push(Number(match))
  }
  return out
}

// Replace every whole-number token using `map` in a SINGLE pass (so a swap like {4->5, 5->4}
// is applied by original position, never re-applied). Tokens absent from the map are left as-is.
const substituteNumbers = (text: string, map: Map<number, number>): string =>
  text.replace(NUMBER_TOKEN, (match) => {
    const next = map.get(Number(match))
    return next === undefined ? match : String(next)
  })

const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))

const MAX_ATTEMPTS = 200

// --- linear equation parsing ----------------------------------------------------------------

type Slot =
  | { kind: 'x'; sign: 1 | -1; mag: number; explicit: boolean }
  | { kind: 'const'; sign: 1 | -1; mag: number }
  | { kind: 'xdiv'; sign: 1 | -1; divisor: number }

type ParsedSide = {
  slots: Slot[]
  xCoef: number
  constant: number
  divisor: number | null
  hasX: boolean
}

const TERM = /[+-]?(?:[a-zA-Z]\/\d+|\d*[a-zA-Z]|\d+)/g

// Parse one side of an equation (e.g. "8x + 5 - 3x") into ordered term slots plus the net
// coefficient on `variable` and net constant. Returns null on anything it doesn't fully cover.
const parseSide = (raw: string, variable: string): ParsedSide | null => {
  const text = raw.replace(/\s+/g, '')
  if (!text) return null
  const terms = text.match(TERM)
  if (!terms || terms.join('') !== text) return null

  const slots: Slot[] = []
  let xCoef = 0
  let constant = 0
  let divisor: number | null = null
  let hasX = false

  for (const term of terms) {
    let sign: 1 | -1 = 1
    let body = term
    if (body[0] === '+') body = body.slice(1)
    else if (body[0] === '-') {
      sign = -1
      body = body.slice(1)
    }
    if (!body) return null

    let match: RegExpMatchArray | null
    if ((match = body.match(/^([a-zA-Z])\/(\d+)$/))) {
      if (match[1] !== variable) return null
      const div = Number(match[2])
      if (div === 0) return null
      slots.push({ kind: 'xdiv', sign, divisor: div })
      divisor = div
      hasX = true
      xCoef += (sign * 1) / div
    } else if ((match = body.match(/^(\d*)([a-zA-Z])$/))) {
      if (match[2] !== variable) return null
      const explicit = match[1] !== ''
      const mag = explicit ? Number(match[1]) : 1
      slots.push({ kind: 'x', sign, mag, explicit })
      hasX = true
      xCoef += sign * mag
    } else if ((match = body.match(/^(\d+)$/))) {
      const mag = Number(match[1])
      slots.push({ kind: 'const', sign, mag })
      constant += sign * mag
    } else {
      return null
    }
  }

  return { slots, xCoef, constant, divisor, hasX }
}

// A run of math terms joined by + / - (operators REQUIRED between terms, so a word like "shows"
// can never be mistaken for a chain of single-letter terms).
const RUN_SOURCE = '(?:[a-zA-Z]\\/\\d+|\\d*[a-zA-Z]|\\d+)(?:\\s*[+-]\\s*(?:[a-zA-Z]\\/\\d+|\\d*[a-zA-Z]|\\d+))*'

type FoundEquation = { lhs: string; rhs: string }

// Extract the first "LHS = RHS" linear equation embedded in free text (a prompt or an equation
// field). Only the run of math terms adjacent to the first '=' is captured, so surrounding prose
// is ignored. Anything after a "->" is dropped first (operation-choice equations chain steps).
const findEquationInText = (text: string): FoundEquation | null => {
  const head = text.split('->')[0]
  const eqIndex = head.indexOf('=')
  if (eqIndex < 0) return null

  const before = head.slice(0, eqIndex)
  const after = head.slice(eqIndex + 1)

  const lhsMatch = before.match(new RegExp(`(${RUN_SOURCE})\\s*$`))
  const rhsMatch = after.match(new RegExp(`^\\s*(${RUN_SOURCE})`))
  if (!lhsMatch || !rhsMatch) return null

  return { lhs: lhsMatch[1], rhs: rhsMatch[1] }
}

const detectVariable = (text: string): string | null => {
  const match = text.match(/[a-zA-Z]/)
  return match ? match[0] : null
}

type LinearModel = {
  variable: string
  left: ParsedSide
  right: ParsedSide
  leftX: number
  leftK: number
  rightX: number
  rightK: number
  solution: number | null
}

const solveModel = (leftX: number, leftK: number, rightX: number, rightK: number): number | null => {
  const denom = rightX - leftX
  if (denom === 0) return null
  return (leftK - rightK) / denom
}

const parseLinear = (text: string): LinearModel | null => {
  const found = findEquationInText(text)
  if (!found) return null
  const variable = detectVariable(`${found.lhs}=${found.rhs}`)
  if (!variable) return null
  const left = parseSide(found.lhs, variable)
  const right = parseSide(found.rhs, variable)
  if (!left || !right) return null
  const solution = solveModel(left.xCoef, left.constant, right.xCoef, right.constant)
  return {
    variable,
    left,
    right,
    leftX: left.xCoef,
    leftK: left.constant,
    rightX: right.xCoef,
    rightK: right.constant,
    solution,
  }
}

// Every multi-term linear solution embedded in free text. Scans EVERY '=' (across '->' chain
// segments too) and, for each that has a linear "<run> = <run>" around it in a single variable,
// records the recomputed solution. Used by the themed-coherence guard to prove a re-themed prompt
// never states an equation whose solution disagrees with the canonical (code) one. Fragments
// without the variable (e.g. "3 = 3") or non-linear bits are ignored. PURE.
export const linearSolutionsInText = (text: string): number[] => {
  const out: number[] = []
  const lhsTail = new RegExp(`(${RUN_SOURCE})\\s*$`)
  const rhsHead = new RegExp(`^\\s*(${RUN_SOURCE})`)
  for (const segment of text.split('->')) {
    for (let eq = segment.indexOf('='); eq >= 0; eq = segment.indexOf('=', eq + 1)) {
      const lhs = segment.slice(0, eq).match(lhsTail)
      const rhs = segment.slice(eq + 1).match(rhsHead)
      if (!lhs || !rhs) continue
      const variable = detectVariable(`${lhs[1]}=${rhs[1]}`)
      if (!variable) continue
      const left = parseSide(lhs[1], variable)
      const right = parseSide(rhs[1], variable)
      if (!left || !right) continue
      const solution = solveModel(left.xCoef, left.constant, right.xCoef, right.constant)
      if (solution !== null) out.push(solution)
    }
  }
  return out
}

const sign = (value: number): number => (value < 0 ? -1 : value > 0 ? 1 : 0)

// A magnitude map (old -> new) is only usable when its keys are distinct (so each token has a
// single meaning), its values are distinct (so two quantities never collapse to one), and at
// least one value actually changes (so the learner sees new numbers).
const buildMagnitudeMap = (pairs: { from: number; to: number }[]): Map<number, number> | null => {
  const map = new Map<number, number>()
  const seenTo = new Set<number>()
  let changed = false
  for (const { from, to } of pairs) {
    if (map.has(from)) return null
    if (seenTo.has(to)) return null
    if (!Number.isInteger(to) || to <= 0) return null
    map.set(from, to)
    seenTo.add(to)
    if (from !== to) changed = true
  }
  return changed ? map : null
}

// --- multi-step input -----------------------------------------------------------------------

const buildAccept = (variable: string, solution: number): string[] => {
  const value = String(solution)
  return Array.from(new Set([value, `${variable}=${value}`, `${variable} = ${value}`]))
}

const buildInputFeedback = (variable: string, solution: number): InputStep['feedback'] => ({
  correct: `Correct. ${variable} = ${solution}.`,
  incorrect: `Isolate ${variable} by undoing each operation on both sides, one step at a time.`,
  reveal: `${variable} = ${solution}.`,
})

// The numbers a learner SEES in an input prompt are exactly the equation's term magnitudes
// (coefficients + constants); the solution never appears there. So we can vary the prompt by
// swapping those magnitudes and rebuild the answer key from the recomputed solution.
const variableMagnitudes = (model: LinearModel): number[] => {
  const out: number[] = []
  for (const side of [model.left, model.right]) {
    for (const slot of side.slots) {
      if (slot.kind === 'x' && slot.explicit) out.push(slot.mag)
      else if (slot.kind === 'const') out.push(slot.mag)
      else if (slot.kind === 'xdiv') out.push(slot.divisor)
    }
  }
  return out
}

// Re-roll every term magnitude (explicit x-coefficients in [2,12], constants in [1,15], hidden
// `x` coefficients stay 1) and return the resulting canonical totals, or null if a slot can't be
// re-rolled into the same shape. Ranges are BROAD (genuinely randomized numbers) but still
// integer + friendly; the recomputed solution is re-verified with the real checker downstream.
const rerollSlots = (
  model: LinearModel,
  rng: Rng,
): { leftX: number; leftK: number; rightX: number; rightK: number; magOf: Map<Slot, number> } | null => {
  const magOf = new Map<Slot, number>()
  const totals = { leftX: 0, leftK: 0, rightX: 0, rightK: 0 }
  for (const [side, isLeft] of [
    [model.left, true],
    [model.right, false],
  ] as const) {
    for (const slot of side.slots) {
      if (slot.kind === 'x') {
        const mag = slot.explicit ? randInt(rng, 2, 12) : 1
        magOf.set(slot, mag)
        const contribution = slot.sign * mag
        if (isLeft) totals.leftX += contribution
        else totals.rightX += contribution
      } else if (slot.kind === 'const') {
        const mag = randInt(rng, 1, 15)
        magOf.set(slot, mag)
        const contribution = slot.sign * mag
        if (isLeft) totals.leftK += contribution
        else totals.rightK += contribution
      } else {
        // division isn't present in any bundled multi-step INPUT; bail to stay safe.
        return null
      }
    }
  }
  return { ...totals, magOf }
}

export const randomizeMultiStepInput = (step: InputStep, rng: Rng): LessonStep => {
  const model = parseLinear(step.prompt) ?? (step.equation ? parseLinear(step.equation) : null)
  if (!model || model.solution === null || !Number.isInteger(model.solution)) return step

  const bothSides = model.left.hasX && model.right.hasX
  const xSide = model.left.hasX ? model.left : model.right
  const otherSide = model.left.hasX ? model.right : model.left
  const isTwoStep =
    !bothSides &&
    xSide.hasX &&
    !otherSide.hasX &&
    xSide.slots.some((slot) => slot.kind === 'x' && slot.explicit && slot.mag >= 2) &&
    xSide.slots.some((slot) => slot.kind === 'const')
  if (!bothSides && !isTwoStep) return step

  // SAFETY: only vary when our recomputed solution is exactly what the bundled key accepts.
  if (!checkInputStep(step, String(model.solution)).correct) return step

  const oldMagnitudes = variableMagnitudes(model)
  if (new Set(oldMagnitudes).size !== oldMagnitudes.length) return step
  // Every number in the prompt must be one of those magnitudes, else we'd leave one stale.
  const promptNumbers = collectNumbers([step.prompt])
  if (promptNumbers.some((value) => !oldMagnitudes.includes(value))) return step

  const solutionSign = sign(model.solution)

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rolled = rerollSlots(model, rng)
    if (!rolled) return step
    const solution = solveModel(rolled.leftX, rolled.leftK, rolled.rightX, rolled.rightK)
    if (solution === null || !Number.isInteger(solution)) continue
    if (sign(solution) !== solutionSign || Math.abs(solution) > 18) continue

    if (bothSides) {
      // Keep both sides genuinely "variables on both sides" (no side combines away to 0x) and a
      // real coefficient gap so isolating x still takes a division step.
      if (rolled.leftX === 0 || rolled.rightX === 0) continue
      const gap = Math.abs(rolled.leftX - rolled.rightX)
      if (gap < 2) continue
    } else {
      const coef = Math.abs(model.left.hasX ? rolled.leftX : rolled.rightX)
      if (coef < 2) continue
    }

    const pairs = model.left.slots
      .concat(model.right.slots)
      .filter((slot) => (slot.kind === 'x' && slot.explicit) || slot.kind === 'const' || slot.kind === 'xdiv')
      .map((slot) => ({
        from: slot.kind === 'xdiv' ? slot.divisor : slot.mag,
        to: rolled.magOf.get(slot)!,
      }))
    const map = buildMagnitudeMap(pairs)
    if (!map) continue

    const prompt = substituteNumbers(step.prompt, map)
    // Independent re-parse: the rewritten prompt must read back to the same recomputed solution.
    const reparsed = parseLinear(prompt)
    if (!reparsed || reparsed.solution !== solution) continue

    const clone = structuredClone(step)
    clone.prompt = prompt
    if (typeof clone.equation === 'string') clone.equation = substituteNumbers(clone.equation, map)
    clone.accept = buildAccept(model.variable, solution)
    clone.feedback = buildInputFeedback(model.variable, solution)

    // Final proof with the REAL grader: the recomputed key accepts the solution and rejects a miss.
    if (!checkInputStep(clone, String(solution)).correct) continue
    if (checkInputStep(clone, String(solution + 1)).correct) continue
    return clone
  }

  return step
}

// --- coordinate-walk input ------------------------------------------------------------------
//
// Coordinate-plane INPUT questions ("from the origin, move 7 right, 3 up, 9 left, then 8 down — type
// the final (x, y)") carry no parseable `=` equation, so the linear engines above leave them
// unchanged and Story Mode would replay the SAME coordinate forever. This varies them safely by
// re-rolling each movement MAGNITUDE, recomputing the final coordinate, and rebuilding the `accept`
// key from CODE — never trusting any stored key. Same double-guard as the rest of the engine:
//   1. parse the movements and compute (x, y);
//   2. REFUSE to vary unless the bundled key already accepts EXACTLY that (x, y) and rejects a near
//      miss + the swapped pair (so a misparse can never ship a wrong key);
//   3. after building the variant, RE-VERIFY with the REAL checker that the new key accepts the new
//      coordinate and rejects a near miss + the swapped pair.
// Only magnitudes change (directions are fixed), so the skill — combining signed moves into x and y
// — is unchanged. The number-specific `hintsByAnswer` keys would be stale for new numbers, so the
// variant drops them; the (number-free) generic `incorrect` feedback is preserved.

type WalkDirection = 'left' | 'right' | 'up' | 'down'
type WalkMove = { magnitude: number; direction: WalkDirection }

// A movement like "7 right" / "8 down" (digits, optional space, a direction word). A bare "(0, 0)"
// origin has no trailing direction word, so it is never matched (its zeros are left untouched).
const WALK_MOVE_SOURCE = '(\\d+)\\s*(left|right|up|down)'

const parseWalkMoves = (text: string): WalkMove[] => {
  const moves: WalkMove[] = []
  for (const match of text.matchAll(new RegExp(WALK_MOVE_SOURCE, 'gi'))) {
    moves.push({ magnitude: Number(match[1]), direction: match[2].toLowerCase() as WalkDirection })
  }
  return moves
}

const finalCoordinate = (moves: readonly WalkMove[]): { x: number; y: number } => {
  let x = 0
  let y = 0
  for (const move of moves) {
    if (move.direction === 'right') x += move.magnitude
    else if (move.direction === 'left') x -= move.magnitude
    else if (move.direction === 'up') y += move.magnitude
    else y -= move.magnitude
  }
  return { x, y }
}

// The destination a free-text prompt walks to, or null when the text is NOT a coordinate-walk
// question (fewer than 2 signed moves). The coordinate analogue of `linearSolutionsInText`: it lets
// the themed-coherence guard prove a re-themed coordinate walk still lands on the SAME (x, y), so a
// walk can never be silently rewritten into a different question whose answer disagrees with the
// code-graded coordinate (the "move 2 right, 5 up, 1 left -> (x, y)" walk rewritten as the
// line-value question "y = 2x - 5 at x = 1": same integers {2, 5, 1}, but the answer is a coordinate,
// not a single number). PURE.
export const coordinateWalkInText = (text: string): { x: number; y: number } | null => {
  const moves = parseWalkMoves(text)
  if (moves.length < 2) return null
  return finalCoordinate(moves)
}

// Mirror the authored accept styles (`(x,y)`, `(x, y)`, `x,y`, `x=x,y=y`) so every equivalent form
// the learner might type still grades; the checker normalizes whitespace/case, so these cover it.
const coordinateAccept = (x: number, y: number): string[] =>
  Array.from(new Set([`(${x},${y})`, `(${x}, ${y})`, `${x},${y}`, `x=${x},y=${y}`]))

const acceptsCoordinate = (step: InputStep, x: number, y: number): boolean =>
  checkInputStep(step, `(${x}, ${y})`).correct

export const randomizeCoordinateWalkInput = (step: InputStep, rng: Rng): LessonStep => {
  const moves = parseWalkMoves(step.prompt)
  if (moves.length < 2) return step

  const { x, y } = finalCoordinate(moves)
  // SAFETY: our parse must agree with the authored key — it accepts EXACTLY our (x, y) and rejects a
  // near miss and the swapped pair — before we change anything (no draw from `rng` until here).
  if (!acceptsCoordinate(step, x, y)) return step
  if (acceptsCoordinate(step, x + 1, y)) return step
  if (x !== y && acceptsCoordinate(step, y, x)) return step

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const newMoves = moves.map((move) => ({ ...move, magnitude: randInt(rng, 1, 9) }))
    if (newMoves.every((move, index) => move.magnitude === moves[index].magnitude)) continue
    const { x: nx, y: ny } = finalCoordinate(newMoves)
    if (nx === x && ny === y) continue // must be a genuinely different coordinate
    if (nx === 0 && ny === 0) continue // avoid the degenerate origin answer
    if (Math.abs(nx) > 12 || Math.abs(ny) > 12) continue // keep it grid-friendly

    let index = 0
    const prompt = step.prompt.replace(
      new RegExp(`(\\d+)(\\s*)(left|right|up|down)`, 'gi'),
      (match, _digits, spacing, direction) => {
        if (index >= newMoves.length) return match
        const replaced = `${newMoves[index].magnitude}${spacing}${direction}`
        index += 1
        return replaced
      },
    )
    if (index !== newMoves.length) continue // replacement count must match the parse exactly

    const clone = structuredClone(step)
    clone.prompt = prompt
    clone.accept = coordinateAccept(nx, ny)
    clone.feedback = {
      correct: `Exactly. The left and right moves combine to x = ${nx}, and the up and down moves combine to y = ${ny}, so the point is (${nx}, ${ny}).`,
      incorrect: step.feedback.incorrect,
      reveal: `The coordinate is (${nx}, ${ny}).`,
    }

    // FINAL PROOF with the REAL grader: the new key accepts the new coordinate and rejects a near
    // miss + the swapped pair, so a wrong answer can never count as correct.
    if (!acceptsCoordinate(clone, nx, ny)) continue
    if (acceptsCoordinate(clone, nx + 1, ny)) continue
    if (nx !== ny && acceptsCoordinate(clone, ny, nx)) continue
    return clone
  }

  return step
}

// --- linear-equation template recognizers (for sequence + operation-choice) -----------------

// A recognizer turns a parsed equation into the set of named "quantities" the question's text is
// built from, plus a generator that re-rolls them into a new, same-shape set. Substituting the
// old->new values everywhere then rewrites every coupled number consistently. `null` = give up.
type Recognition = {
  quantities: Map<string, number>
  generate: (rng: Rng) => Map<string, number> | null
}

const quantitiesDistinct = (quantities: Map<string, number>): boolean => {
  const values = [...quantities.values()]
  return new Set(values).size === values.length
}

// Map old quantity values to new ones by NAME, then collapse to a value->value magnitude map.
const mapFromQuantities = (
  oldQ: Map<string, number>,
  newQ: Map<string, number>,
): Map<number, number> | null => {
  const pairs: { from: number; to: number }[] = []
  for (const [name, from] of oldQ) {
    const to = newQ.get(name)
    if (to === undefined) return null
    pairs.push({ from, to })
  }
  return buildMagnitudeMap(pairs)
}

// `a*x (+/-) b = c` (two-step, coefficient >= 2) or `x/a (+/-) b = c` (two-step division). Both
// expose {A, K, C, S, M}: coefficient/divisor, |constant|, right-hand side, solution, and the
// intermediate (a*x or x/a) value.
const recognizeTwoStep = (model: LinearModel): Recognition | null => {
  const xSide = model.left.hasX ? model.left : model.right
  const otherSide = model.left.hasX ? model.right : model.left
  if (otherSide.hasX) return null
  if (otherSide.slots.length !== 1 || otherSide.slots[0].kind !== 'const') return null

  const xSlots = xSide.slots.filter((slot) => slot.kind === 'x' || slot.kind === 'xdiv')
  const constSlots = xSide.slots.filter((slot) => slot.kind === 'const')
  if (xSlots.length !== 1 || constSlots.length !== 1) return null

  const xSlot = xSlots[0]
  if (xSlot.sign !== 1) return null
  const kSigned = xSide.constant
  const kSign = sign(kSigned)
  const kMag = Math.abs(kSigned)
  const c = otherSide.constant
  const s = model.solution
  if (s === null || !Number.isInteger(s) || s === 0) return null
  const solutionSign = sign(s)

  if (xSlot.kind === 'x') {
    if (!xSlot.explicit || xSlot.mag < 2) return null
    const a = xSlot.mag
    const m = a * s
    const quantities = new Map([
      ['A', a],
      ['K', kMag],
      ['C', c],
      ['S', s],
      ['M', m],
    ])
    const generate = (rng: Rng): Map<string, number> | null => {
      const aNew = randInt(rng, 2, 12)
      const sNew = solutionSign * randInt(rng, 2, 12)
      const kNew = randInt(rng, 1, 15)
      const cNew = aNew * sNew + kSign * kNew
      if (cNew <= 0) return null
      return new Map([
        ['A', aNew],
        ['K', kNew],
        ['C', cNew],
        ['S', sNew],
        ['M', aNew * sNew],
      ])
    }
    return { quantities, generate }
  }

  // division: x / a (+/-) b = c
  const a = xSlot.divisor
  const m = c - kSigned
  if (s !== a * m) return null
  const quantities = new Map([
    ['A', a],
    ['K', kMag],
    ['C', c],
    ['S', s],
    ['M', m],
  ])
  const generate = (rng: Rng): Map<string, number> | null => {
    const aNew = randInt(rng, 2, 12)
    const mNew = solutionSign * randInt(rng, 2, 12)
    const kNew = randInt(rng, 1, 15)
    const cNew = mNew + kSign * kNew
    if (cNew <= 0) return null
    return new Map([
      ['A', aNew],
      ['K', kNew],
      ['C', cNew],
      ['S', aNew * mNew],
      ['M', mNew],
    ])
  }
  return { quantities, generate }
}

// `a*x + b = c*x + d` with a > c > 0 and positive constants (b < d). Exposes
// {LX, LK, RX, RK, S, NC, G}: the four operands, the solution, the net coefficient (a-c), and
// the gathered constant (d-b = (a-c)*s).
const recognizeBothSides = (model: LinearModel): Recognition | null => {
  if (!model.left.hasX || !model.right.hasX) return null
  // single explicit x-term + single positive constant on each side
  const sides = [model.left, model.right]
  for (const side of sides) {
    const xSlots = side.slots.filter((slot) => slot.kind === 'x')
    const constSlots = side.slots.filter((slot) => slot.kind === 'const')
    if (xSlots.length !== 1 || constSlots.length !== 1) return null
    if (side.slots.length !== 2) return null
    const xSlot = xSlots[0]
    if (xSlot.kind !== 'x' || xSlot.sign !== 1 || !xSlot.explicit || xSlot.mag < 2) return null
    if (constSlots[0].sign !== 1) return null
  }

  const lx = model.leftX
  const rx = model.rightX
  const lk = model.leftK
  const rk = model.rightK
  if (!(lx > rx) || rx < 2) return null
  if (!(rk > lk) || lk < 1) return null

  const s = model.solution
  if (s === null || !Number.isInteger(s) || s <= 0) return null
  const netCoef = lx - rx
  if (netCoef < 2) return null
  const gathered = netCoef * s

  const quantities = new Map([
    ['LX', lx],
    ['LK', lk],
    ['RX', rx],
    ['RK', rk],
    ['S', s],
    ['NC', netCoef],
    ['G', gathered],
  ])
  const generate = (rng: Rng): Map<string, number> | null => {
    const lxNew = randInt(rng, 3, 12)
    const rxNew = randInt(rng, 2, lxNew - 2)
    if (rxNew < 2) return null
    const ncNew = lxNew - rxNew
    if (ncNew < 2) return null
    const sNew = randInt(rng, 2, 10)
    const gNew = ncNew * sNew
    const lkNew = randInt(rng, 1, 12)
    const rkNew = lkNew + gNew
    return new Map([
      ['LX', lxNew],
      ['LK', lkNew],
      ['RX', rxNew],
      ['RK', rkNew],
      ['S', sNew],
      ['NC', ncNew],
      ['G', gNew],
    ])
  }
  return { quantities, generate }
}

const recognizeLinear = (model: LinearModel): Recognition | null => {
  if (model.left.hasX && model.right.hasX) return recognizeBothSides(model)
  return recognizeTwoStep(model)
}

// --- sequence variant -----------------------------------------------------------------------

const sequenceStrings = (step: SequenceStep): string[] => {
  const out: string[] = [step.prompt]
  if (typeof step.equation === 'string') out.push(step.equation)
  for (const tile of step.tiles) out.push(tile.label)
  out.push(step.feedback.correct, step.feedback.incorrect, step.feedback.incomplete)
  if (step.feedback.reveal) out.push(step.feedback.reveal)
  if (step.feedback.hintsByTile) out.push(...Object.values(step.feedback.hintsByTile))
  return out
}

const rewriteSequence = (step: SequenceStep, map: Map<number, number>): SequenceStep => {
  const clone = structuredClone(step)
  clone.prompt = substituteNumbers(clone.prompt, map)
  if (typeof clone.equation === 'string') clone.equation = substituteNumbers(clone.equation, map)
  clone.tiles = clone.tiles.map((tile) => ({ ...tile, label: substituteNumbers(tile.label, map) }))
  clone.feedback.correct = substituteNumbers(clone.feedback.correct, map)
  clone.feedback.incorrect = substituteNumbers(clone.feedback.incorrect, map)
  clone.feedback.incomplete = substituteNumbers(clone.feedback.incomplete, map)
  if (clone.feedback.reveal) clone.feedback.reveal = substituteNumbers(clone.feedback.reveal, map)
  if (clone.feedback.hintsByTile) {
    clone.feedback.hintsByTile = Object.fromEntries(
      Object.entries(clone.feedback.hintsByTile).map(([key, value]) => [key, substituteNumbers(value, map)]),
    )
  }
  return clone
}

const trailingInteger = (label: string): number | null => {
  const match = label.match(/(-?\d+)\s*$/)
  return match ? Number(match[1]) : null
}

export const randomizeSequenceVariant = (step: SequenceStep, rng: Rng): LessonStep => {
  if (typeof step.equation !== 'string' || !step.equation) return step
  const model = parseLinear(step.equation)
  if (!model || model.solution === null || !Number.isInteger(model.solution)) return step

  // SAFETY: the authored correct order must really grade correct before we touch anything.
  if (!checkSequenceStep(step, step.correctOrder).correct) return step

  const recognition = recognizeLinear(model)
  if (!recognition) return step
  if (!quantitiesDistinct(recognition.quantities)) return step

  const candidateValues = new Set(recognition.quantities.values())
  const tokens = collectNumbers(sequenceStrings(step))
  if (tokens.some((value) => !candidateValues.has(value))) return step

  const solutionSign = sign(model.solution)
  const lastId = step.correctOrder[step.correctOrder.length - 1]
  const wrongOrder = [...step.correctOrder].reverse()

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const next = recognition.generate(rng)
    if (!next) continue
    const map = mapFromQuantities(recognition.quantities, next)
    if (!map) continue

    const clone = rewriteSequence(step, map)
    if (clone.equation === step.equation) continue
    if (!checkSequenceStep(clone, clone.correctOrder).correct) continue
    if (checkSequenceStep(clone, wrongOrder).correct) continue

    const reModel = parseLinear(clone.equation!)
    if (!reModel || reModel.solution === null || !Number.isInteger(reModel.solution)) continue
    if (sign(reModel.solution) !== solutionSign) continue

    const valueTile = clone.tiles.find((tile) => tile.id === lastId)
    if (!valueTile || trailingInteger(valueTile.label) !== reModel.solution) continue

    return clone
  }

  return step
}

// --- operation-choice variant ---------------------------------------------------------------

// operation-choice questions encode the answer as the chosen OPTION ID, which we never change, so
// number substitution can only alter display text. We still only vary when (a) the operand
// numbers can be re-rolled with the SAME structural correct move/mistake (proven by recognizing a
// specific shape) and (b) every number in the question maps to one known quantity (so no stale or
// mismatched number can survive). Questions carrying structured data we can't vary (a `table` per
// choice, or a `graph`) always fall back.

// OC-1: "what is the mistake" on a one-step `x (+/-) a = b` (the learner changed only one side).
// Exposes {A, B, S}: the attached constant, the other side, and the true solution.
const recognizeOneStepMistake = (model: LinearModel): Recognition | null => {
  if (model.left.hasX && model.right.hasX) return null
  const xSide = model.left.hasX ? model.left : model.right
  const otherSide = model.left.hasX ? model.right : model.left
  if (otherSide.hasX) return null
  if (otherSide.slots.length !== 1 || otherSide.slots[0].kind !== 'const') return null

  const xSlots = xSide.slots.filter((slot) => slot.kind === 'x' || slot.kind === 'xdiv')
  const constSlots = xSide.slots.filter((slot) => slot.kind === 'const')
  if (xSlots.length !== 1 || constSlots.length !== 1) return null
  const xSlot = xSlots[0]
  if (xSlot.kind !== 'x' || xSlot.explicit) return null // coefficient must be the implicit 1

  const aSigned = xSide.constant
  const aSign = sign(aSigned)
  const a = Math.abs(aSigned)
  const b = otherSide.constant
  const s = model.solution
  if (s === null || !Number.isInteger(s) || s <= 0) return null
  if (a < 1 || b < 1) return null

  const leftHasX = model.left.hasX
  const quantities = new Map([
    ['A', a],
    ['B', b],
    ['S', s],
  ])
  const generate = (rng: Rng): Map<string, number> | null => {
    const aNew = randInt(rng, 2, 12)
    const bNew = randInt(rng, 2, 15)
    const newLeftK = leftHasX ? aSign * aNew : bNew
    const newRightK = leftHasX ? bNew : aSign * aNew
    const sNew = solveModel(model.leftX, newLeftK, model.rightX, newRightK)
    if (sNew === null || !Number.isInteger(sNew) || sNew <= 0) return null
    return new Map([
      ['A', aNew],
      ['B', bNew],
      ['S', sNew],
    ])
  }
  return { quantities, generate }
}

// OC-2: "what went wrong" on a two-step `a*x + b = c` where the learner ADDED b instead of
// subtracting (so they got x = (c+b)/a instead of (c-b)/a). Exposes {A, B, C, S, CB, WP, WX}.
const recognizeTwoStepMistake = (model: LinearModel): Recognition | null => {
  if (model.left.hasX && model.right.hasX) return null
  const xSide = model.left.hasX ? model.left : model.right
  const otherSide = model.left.hasX ? model.right : model.left
  if (otherSide.hasX) return null
  if (otherSide.slots.length !== 1 || otherSide.slots[0].kind !== 'const') return null

  const xSlots = xSide.slots.filter((slot) => slot.kind === 'x' || slot.kind === 'xdiv')
  const constSlots = xSide.slots.filter((slot) => slot.kind === 'const')
  if (xSlots.length !== 1 || constSlots.length !== 1) return null
  const xSlot = xSlots[0]
  if (xSlot.kind !== 'x' || !xSlot.explicit || xSlot.sign !== 1 || xSlot.mag < 2) return null
  if (xSide.constant <= 0) return null // the bundled mistake shape is `a*x + b = c` (positive b)

  const a = xSlot.mag
  const b = xSide.constant
  const c = otherSide.constant
  const s = model.solution
  if (s === null || !Number.isInteger(s) || s <= 0) return null
  if (c <= b) return null
  const cb = c - b
  const wp = c + b
  if (wp % a !== 0) return null
  const wx = wp / a

  const quantities = new Map([
    ['A', a],
    ['B', b],
    ['C', c],
    ['S', s],
    ['CB', cb],
    ['WP', wp],
    ['WX', wx],
  ])
  const generate = (rng: Rng): Map<string, number> | null => {
    const aNew = randInt(rng, 2, 9)
    const sNew = randInt(rng, 2, 12)
    const bNew = randInt(rng, 1, 15)
    const cNew = aNew * sNew + bNew
    const wpNew = cNew + bNew
    if (wpNew % aNew !== 0) return null
    return new Map([
      ['A', aNew],
      ['B', bNew],
      ['C', cNew],
      ['S', sNew],
      ['CB', cNew - bNew],
      ['WP', wpNew],
      ['WX', wpNew / aNew],
    ])
  }
  return { quantities, generate }
}

const recognizeOperationChoice = (model: LinearModel): Recognition | null =>
  recognizeTwoStepMistake(model) ?? recognizeOneStepMistake(model)

const operationChoiceStrings = (step: OperationChoiceStep): string[] => {
  const out: string[] = [step.prompt]
  if (typeof step.equation === 'string') out.push(step.equation)
  for (const choice of step.choices) {
    out.push(choice.label, choice.feedback)
    if (choice.detail) out.push(choice.detail)
  }
  out.push(step.feedback.correct, step.feedback.incorrect)
  if (step.feedback.reveal) out.push(step.feedback.reveal)
  return out
}

const rewriteOperationChoice = (step: OperationChoiceStep, map: Map<number, number>): OperationChoiceStep => {
  const clone = structuredClone(step)
  clone.prompt = substituteNumbers(clone.prompt, map)
  if (typeof clone.equation === 'string') clone.equation = substituteNumbers(clone.equation, map)
  clone.choices = clone.choices.map((choice) => ({
    ...choice,
    label: substituteNumbers(choice.label, map),
    ...(choice.detail ? { detail: substituteNumbers(choice.detail, map) } : {}),
    feedback: substituteNumbers(choice.feedback, map),
  }))
  clone.feedback.correct = substituteNumbers(clone.feedback.correct, map)
  clone.feedback.incorrect = substituteNumbers(clone.feedback.incorrect, map)
  if (clone.feedback.reveal) clone.feedback.reveal = substituteNumbers(clone.feedback.reveal, map)
  return clone
}

export const randomizeOperationChoiceVariant = (step: OperationChoiceStep, rng: Rng): LessonStep => {
  // Structured numeric data (per-choice tables, a static graph) can't be number-varied safely.
  if (step.graph) return step
  if (step.choices.some((choice) => choice.table)) return step
  if (typeof step.equation !== 'string' || !step.equation) return step

  const model = parseLinear(step.equation)
  if (!model) return step

  const recognition = recognizeOperationChoice(model)
  if (!recognition) return step
  if (!quantitiesDistinct(recognition.quantities)) return step

  const candidateValues = new Set(recognition.quantities.values())
  const tokens = collectNumbers(operationChoiceStrings(step))
  if (tokens.some((value) => !candidateValues.has(value))) return step

  // SAFETY: the authored correct option must really grade correct before we touch anything.
  if (!checkOperationChoiceStep(step, step.correctId).correct) return step
  const wrongId = step.choices.find((choice) => choice.id !== step.correctId)?.id

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const next = recognition.generate(rng)
    if (!next) continue
    const map = mapFromQuantities(recognition.quantities, next)
    if (!map) continue

    const clone = rewriteOperationChoice(step, map)
    if (clone.equation === step.equation) continue
    // The rewritten equation must still be a well-formed linear equation.
    if (!parseLinear(clone.equation!)) continue
    // The correct option id is unchanged, so it must still grade correct and a wrong one wrong.
    if (!checkOperationChoiceStep(clone, clone.correctId).correct) continue
    if (wrongId && checkOperationChoiceStep(clone, wrongId).correct) continue
    return clone
  }

  return step
}
