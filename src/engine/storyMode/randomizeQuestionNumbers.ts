// Story Mode number-variation engine.
//
// A PURE, fully unit-testable engine that, given a bundled `LessonStep`, deterministically
// (seeded) produces a VARIANT step with DIFFERENT numbers AND a correctly recomputed answer
// key — so the endless Story Mode loop serves randomized practice instead of replaying the
// exact bundled questions.
//
// CORRECTNESS INVARIANT (must preserve): the answer key is ALWAYS recomputed by CODE here, never
// by the LLM and never trusted from persisted data. Every variant is double-guarded:
//   1. We parse the bundled equation into a tiny linear model and recompute its solution.
//   2. We REFUSE to vary unless that recomputed solution is what the bundled answer key already
//      accepts (verified with the REAL checkers from `../checkers`). This catches any misparse
//      (e.g. reading a two-step `2x + 4 = 16` as a one-step `x + 4 = 16`).
// If anything is uncertain — an unsupported type, an unparseable/multi-step equation, a tile
// structure we don't recognize, or a failure to generate a genuinely different problem — we
// RETURN THE ORIGINAL STEP UNCHANGED (same reference). Correctness > variety, always.
//
// Supported today: `input` and `sequence` one-step linear equations (`x + a = b`, `x - a = b`,
// `ax = b`, `x / a = b`, signs preserved). `mcq`/`operation-choice` in the bundled pool encode a
// CONCEPTUAL answer (which pan tips, which mistake) whose option text is tightly coupled to fixed
// numbers, so they cannot be safely number-varied and fall back unchanged.

import type { LessonStep } from '../../domain'
import { checkInputStep, checkSequenceStep } from '../checkers'
import {
  randomizeCoordinateWalkInput,
  randomizeMultiStepInput,
  randomizeOperationChoiceVariant,
  randomizeSequenceVariant,
} from './numberVariants'

// A 0..1 random source, injectable for deterministic tests/resume (see `mulberry32`).
export type Rng = () => number

// mulberry32: a tiny, fast, well-distributed seeded PRNG. Deterministic for a given uint32 seed,
// so a persisted `variantSeed` rebuilds the EXACT same variant (and same correct answer) on resume.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A fresh random seed for a brand-new question. The ONLY non-deterministic call in this module;
// everything downstream is a pure function of (step, seed).
export function createVariantSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0
}

// --- Linear equation model ------------------------------------------------------------------

type LinearOp = 'add' | 'sub' | 'mul' | 'div'

// A one-step linear equation in a single variable:
//   add: v + a = b        sub: v - a = b        mul: a·v = b        div: v / a = b
type LinearEquation = { variable: string; op: LinearOp; a: number; b: number }

const solve = (eq: LinearEquation): number => {
  switch (eq.op) {
    case 'add':
      return eq.b - eq.a
    case 'sub':
      return eq.b + eq.a
    case 'mul':
      return eq.b / eq.a
    case 'div':
      return eq.a * eq.b
  }
}

// A model is only usable when it has finite integer parts AND an integer solution (so the
// rebuilt problem stays well-posed). Multiplication additionally needs `b` divisible by `a`.
const isUsableEquation = (eq: LinearEquation): boolean => {
  if (!Number.isInteger(eq.a) || !Number.isInteger(eq.b)) return false
  if ((eq.op === 'mul' || eq.op === 'div') && eq.a === 0) return false
  if (eq.op === 'mul' && !Number.isInteger(eq.b / eq.a)) return false
  return Number.isInteger(solve(eq))
}

// Variable-first patterns (add/sub/div) capture [, variable, a, b]; the coefficient-first
// pattern (mul) captures [, a, variable, b]. Each is matched WITHIN free text so a prompt like
// "The scale shows x + 2 = 5." yields the embedded equation.
const SEARCHERS: { op: LinearOp; re: RegExp }[] = [
  { op: 'mul', re: /(-?\d+)\s*([a-zA-Z])\s*=\s*(-?\d+)/ },
  { op: 'div', re: /([a-zA-Z])\s*\/\s*(-?\d+)\s*=\s*(-?\d+)/ },
  { op: 'add', re: /([a-zA-Z])\s*\+\s*(\d+)\s*=\s*(-?\d+)/ },
  { op: 'sub', re: /([a-zA-Z])\s*-\s*(\d+)\s*=\s*(-?\d+)/ },
]

const toEquation = (op: LinearOp, match: RegExpExecArray): LinearEquation => {
  if (op === 'mul') {
    return { variable: match[2], op, a: Number(match[1]), b: Number(match[3]) }
  }
  return { variable: match[1], op, a: Number(match[2]), b: Number(match[3]) }
}

type ParsedEquation = { matched: string; index: number; equation: LinearEquation }

// Find the first usable equation in `text` (earliest start, longest on ties). Returns the exact
// matched substring too, so callers can replace it in-place without reformatting the surroundings.
const parseEquationInText = (text: string): ParsedEquation | null => {
  let best: ParsedEquation | null = null
  for (const { op, re } of SEARCHERS) {
    const match = re.exec(text)
    if (!match || match.index === undefined) continue
    const equation = toEquation(op, match)
    if (!isUsableEquation(equation)) continue
    const candidate: ParsedEquation = { matched: match[0], index: match.index, equation }
    if (
      !best ||
      candidate.index < best.index ||
      (candidate.index === best.index && candidate.matched.length > best.matched.length)
    ) {
      best = candidate
    }
  }
  return best
}

// --- Variant generation ---------------------------------------------------------------------

// Inclusive integer in [min, max] drawn from the injected rng.
const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))

const signOf = (value: number): number => (value < 0 ? -1 : 1)

// Bounded retries so generation never loops forever; if we cannot find a genuinely different,
// well-posed problem we give up and the caller falls back to the original.
const MAX_VARIATION_ATTEMPTS = 60

// Operand ranges for the one-step variants. Deliberately BROAD (not a tiny fixed pool) so Story
// Mode serves genuinely randomized numbers, while staying integer and pedagogically friendly:
// additive operands span 1..15 and multiplicative factors 2..12 (so products/solutions stay a
// reasonable size). Only the NUMBERS are randomized — the operation and sign-class are preserved
// so difficulty/skill stay equivalent and the recomputed answer key below is always valid.
const ADDITIVE_MIN = 1
const ADDITIVE_MAX = 15
const FACTOR_MIN = 2
const FACTOR_MAX = 12

// Produce a fresh equation of the SAME operation and sign-class (so difficulty/skill stay
// equivalent) whose numbers differ from the original, drawn from broad random ranges.
const generateVariant = (eq: LinearEquation, rng: Rng): LinearEquation | null => {
  const solutionSign = signOf(solve(eq))
  const variable = eq.variable

  for (let attempt = 0; attempt < MAX_VARIATION_ATTEMPTS; attempt += 1) {
    let candidate: LinearEquation
    if (eq.op === 'add') {
      const a = randInt(rng, ADDITIVE_MIN, ADDITIVE_MAX)
      const s = solutionSign * randInt(rng, ADDITIVE_MIN, ADDITIVE_MAX)
      candidate = { variable, op: 'add', a, b: s + a }
    } else if (eq.op === 'sub') {
      const a = randInt(rng, ADDITIVE_MIN, ADDITIVE_MAX)
      const s = solutionSign * randInt(rng, ADDITIVE_MIN, ADDITIVE_MAX)
      candidate = { variable, op: 'sub', a, b: s - a }
    } else if (eq.op === 'mul') {
      const a = signOf(eq.a) * randInt(rng, FACTOR_MIN, FACTOR_MAX)
      const s = solutionSign * randInt(rng, FACTOR_MIN, FACTOR_MAX)
      candidate = { variable, op: 'mul', a, b: a * s }
    } else {
      // div: v / a = b, solution = a · b. Keep the displayed right-hand side positive.
      const a = signOf(eq.a) * randInt(rng, FACTOR_MIN, FACTOR_MAX)
      const b = randInt(rng, FACTOR_MIN, FACTOR_MAX)
      candidate = { variable, op: 'div', a, b }
    }

    if (!isUsableEquation(candidate)) continue
    // Require a visibly different problem so the learner actually sees new numbers.
    if (candidate.a === eq.a && candidate.b === eq.b) continue
    return candidate
  }
  return null
}

// Every one-step linear solution embedded in `text`. Unlike parseEquationInText (which returns
// only the first/best equation, for in-place rewriting), this reports the solution of EVERY
// usable one-step equation it finds, so the themed-coherence guard can prove a re-themed prompt
// never states an equation whose solution disagrees with the canonical (code) one. PURE; the
// `equation`-form coverage here (spaced and negative `v / a = b`, `a·v = b`, `v ± a = b`)
// complements the multi-term `linearSolutionsInText` in `numberVariants.ts`.
export const oneStepSolutionsInText = (text: string): number[] => {
  const out: number[] = []
  for (const { op, re } of SEARCHERS) {
    const global = new RegExp(re.source, 'g')
    for (let match = global.exec(text); match; match = global.exec(text)) {
      const equation = toEquation(op, match)
      if (isUsableEquation(equation)) out.push(solve(equation))
    }
  }
  return out
}

// --- Text rebuilding ------------------------------------------------------------------------

const formatEquation = (eq: LinearEquation): string => {
  const v = eq.variable
  switch (eq.op) {
    case 'add':
      return `${v} + ${eq.a} = ${eq.b}`
    case 'sub':
      return `${v} - ${eq.a} = ${eq.b}`
    case 'mul':
      return `${eq.a}${v} = ${eq.b}`
    case 'div':
      return `${v} / ${eq.a} = ${eq.b}`
  }
}

// Accepted answers mirror the authoring style (`3`, `x=3`, `x = 3`); the bare number guarantees a
// match for any variable name since `normalizeExpression` only strips an `x=` prefix.
const buildAccept = (variable: string, solution: number): string[] => {
  const value = String(solution)
  return Array.from(new Set([value, `${variable}=${value}`, `${variable} = ${value}`]))
}

// Method-only hint that stays correct for the variant's numbers (no stale specific answer).
const inverseHint = (eq: LinearEquation): string => {
  const v = eq.variable
  switch (eq.op) {
    case 'add':
      return `Undo the + ${eq.a} by subtracting ${eq.a} from both sides.`
    case 'sub':
      return `Undo the - ${eq.a} by adding ${eq.a} to both sides.`
    case 'mul':
      return `${eq.a}${v} means ${eq.a} times ${v}, so divide both sides by ${eq.a}.`
    case 'div':
      return `${v} is divided by ${eq.a}, so multiply both sides by ${eq.a}.`
  }
}

const buildInputFeedback = (eq: LinearEquation, solution: number) => ({
  correct: `Correct. ${eq.variable} = ${solution}.`,
  incorrect: inverseHint(eq),
  reveal: `${eq.variable} = ${solution}.`,
})

const buildSequenceFeedback = (eq: LinearEquation, solution: number, correctMoveLabel: string) => ({
  correct: `Correct. ${eq.variable} = ${solution}.`,
  incorrect: `Keep the equation balanced first, then name the value of ${eq.variable}.`,
  incomplete: `Choose the balancing move, then the resulting value of ${eq.variable}.`,
  reveal: `Tap "${correctMoveLabel}", then "${eq.variable} = ${solution}".`,
})

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A tile whose whole label is "<variable> = <number>" (the "resulting value" tiles).
const resultPattern = (variable: string): RegExp =>
  new RegExp(`^\\s*${escapeRegExp(variable)}\\s*=\\s*(-?\\d+)\\s*$`)

const firstIntegerOf = (text: string): number | null => {
  const match = text.match(/-?\d+/)
  return match ? Number(match[0]) : null
}

const replaceFirstInteger = (text: string, value: number): string => text.replace(/-?\d+/, String(value))

// --- Per-type randomizers -------------------------------------------------------------------

const randomizeInput = (step: Extract<LessonStep, { type: 'input' }>, rng: Rng): LessonStep => {
  // The equation may live in the prompt, the optional `equation` field, or both.
  const fromPrompt = parseEquationInText(step.prompt)
  const fromField = typeof step.equation === 'string' ? parseEquationInText(step.equation) : null
  const source = fromPrompt ?? fromField
  if (!source) return step

  const solution = solve(source.equation)
  // SAFETY: only vary when our recomputed solution is exactly what the bundled key accepts.
  if (!checkInputStep(step, String(solution)).correct) return step

  const variant = generateVariant(source.equation, rng)
  if (!variant) return step
  const variantSolution = solve(variant)
  const newEquation = formatEquation(variant)

  const clone = structuredClone(step)
  if (fromPrompt) clone.prompt = step.prompt.replace(fromPrompt.matched, newEquation)
  if (typeof clone.equation === 'string') clone.equation = newEquation
  clone.accept = buildAccept(variant.variable, variantSolution)
  clone.feedback = buildInputFeedback(variant, variantSolution)
  return clone
}

const randomizeSequence = (step: Extract<LessonStep, { type: 'sequence' }>, rng: Rng): LessonStep => {
  // Only the "balance story" shape is recognized: [correct move, resulting value] plus a move
  // distractor and a "value = right-hand side" distractor.
  if (step.correctOrder.length !== 2 || step.tiles.length !== 4) return step

  const eqText = typeof step.equation === 'string' ? step.equation : ''
  const parsed = parseEquationInText(eqText)
  if (!parsed) return step
  const { equation } = parsed

  const solution = solve(equation)
  // SAFETY: the authored correct order must really grade as correct before we touch anything.
  if (!checkSequenceStep(step, step.correctOrder).correct) return step

  const tileById = new Map(step.tiles.map((tile) => [tile.id, tile]))
  const correctMove = tileById.get(step.correctOrder[0])
  const correctResult = tileById.get(step.correctOrder[1])
  if (!correctMove || !correctResult) return step

  const result = resultPattern(equation.variable)
  // The correct result tile must display the solution; the correct move tile must mention `a`.
  const correctResultMatch = correctResult.label.match(result)
  if (!correctResultMatch || Number(correctResultMatch[1]) !== solution) return step
  if (firstIntegerOf(correctMove.label) !== equation.a) return step

  const distractors = step.tiles.filter(
    (tile) => tile.id !== correctMove.id && tile.id !== correctResult.id,
  )
  if (distractors.length !== 2) return step
  const distractorResult = distractors.find((tile) => result.test(tile.label))
  const distractorMove = distractors.find((tile) => !result.test(tile.label))
  if (!distractorResult || !distractorMove) return step

  // The result distractor must display the raw right-hand side; the move distractor mentions `a`.
  const distractorResultMatch = distractorResult.label.match(result)
  if (!distractorResultMatch || Number(distractorResultMatch[1]) !== equation.b) return step
  if (firstIntegerOf(distractorMove.label) !== equation.a) return step

  // We must be able to rewrite the equation shown in the prompt as well.
  const fromPrompt = parseEquationInText(step.prompt)
  if (!fromPrompt) return step

  const variant = generateVariant(equation, rng)
  if (!variant) return step
  const variantSolution = solve(variant)
  const newEquation = formatEquation(variant)

  const newLabels = new Map<string, string>([
    [correctResult.id, `${variant.variable} = ${variantSolution}`],
    [distractorResult.id, `${variant.variable} = ${variant.b}`],
    [correctMove.id, replaceFirstInteger(correctMove.label, variant.a)],
    [distractorMove.id, replaceFirstInteger(distractorMove.label, variant.a)],
  ])

  const clone = structuredClone(step)
  clone.equation = newEquation
  clone.prompt = step.prompt.replace(fromPrompt.matched, newEquation)
  clone.tiles = clone.tiles.map((tile) => ({ ...tile, label: newLabels.get(tile.id) ?? tile.label }))
  clone.feedback = buildSequenceFeedback(variant, variantSolution, newLabels.get(correctMove.id)!)
  return clone
}

// --- Public entry point ---------------------------------------------------------------------

// Deterministically produce a number-variant of `step` using `rng`, or return the ORIGINAL step
// (same reference) when it cannot be safely varied. Pure: depends only on (step, rng draws).
export function randomizeQuestionNumbers(step: LessonStep, rng: Rng): LessonStep {
  if (step.type === 'input') {
    // One-step linear first; if that can't safely vary it, try the multi-step engine, then the
    // coordinate-walk engine. (Each handler bails BEFORE drawing from `rng` on shapes it does not
    // recognize, so chaining keeps the whole function a deterministic pure function of the seed.)
    const oneStep = randomizeInput(step, rng)
    if (oneStep !== step) return oneStep
    const multiStep = randomizeMultiStepInput(step, rng)
    if (multiStep !== step) return multiStep
    return randomizeCoordinateWalkInput(step, rng)
  }
  if (step.type === 'sequence') {
    // One-step balance-story first; if that can't safely vary it (it bails on multi-tile,
    // multi-step orders BEFORE drawing from `rng`), try the multi-step template engine.
    const oneStep = randomizeSequence(step, rng)
    if (oneStep !== step) return oneStep
    return randomizeSequenceVariant(step, rng)
  }
  if (step.type === 'operation-choice') return randomizeOperationChoiceVariant(step, rng)
  // mcq / concept / spatial steps: no safely recomputable numeric key (mcq answers here are
  // conceptual and tightly coupled to fixed numbers, so they cannot be safely number-varied).
  return step
}
