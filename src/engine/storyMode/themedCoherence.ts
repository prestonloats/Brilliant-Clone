// Story Mode themed-question COHERENCE guard.
//
// The number-variation engine (`randomizeQuestionNumbers`) produces a fully coherent variant: the
// prompt, the displayed `equation`, the recomputed answer key, and every option/tile label are all
// derived from ONE randomized parameter set, so they always agree. The LLM then re-themes only the
// DISPLAY TEXT of that variant (`applyRetheme` overwrites prompt + option/tile labels and copies
// the answer key verbatim). The weak link is the LLM itself: despite the "never change a number"
// instruction, a model sometimes rewrites the prompt or a label with a DIFFERENT number, so the
// shown question, the shown equation, and the (code-computed) answer stop matching up — the exact
// "sometimes they don't match" bug.
//
// This module is the deterministic backstop. Given the canonical (code) variant and the themed
// step, it proves the themed DISPLAY TEXT still states the SAME math, so an incoherent re-theme can
// be rejected (the caller falls back to showing the coherent, un-themed variant). It is PURE and
// fully unit-testable, and it NEVER trusts the LLM's numbers — the canonical numbers always win.
//
// Two checks, applied per step type:
//   1. LABELS (mcq/operation-choice options, sequence tiles): every integer in the canonical label
//      must still appear in the themed label (matched by id). Labels are pure math, so a changed or
//      dropped number means the answer/distractor drifted. Extra incidental numbers are allowed
//      (the wording may add flavor), so this is a multiset-SUBSET check, not strict equality.
//   2. PROMPT EQUATIONS (input/sequence only): any linear equation the themed prompt states must
//      solve to the SAME value as the canonical equation. operation-choice/mcq prompts are skipped
//      here because they intentionally embed a WRONG worked chain (e.g. "3x + 6 = 21 -> 3x = 27")
//      or non-equation comparisons, which a solution-equality check would wrongly flag.
// For `input` questions whose math lives ONLY in the prompt (no separate `equation` field shown
// from code), the themed prompt must additionally (3) still CONTAIN the equation, and (4) keep EVERY
// numeric given from the canonical prompt — so the rewrite can never silently drop a number the
// learner needs. Check (4) covers prompt-only questions that are NOT a single solvable equation
// (e.g. "slope -3 and passes through (2, 1) ... find b"), where the solution check (2) is vacuous
// but dropping the point (2, 1) still makes the question unanswerable.
//   3. COORDINATE WALKS (input only): a walk question's answer is a DESTINATION (x, y), not a
//      scalar, so checks (1)/(2) are vacuous and (4)'s numbers can be reproduced inside a totally
//      different question. When the canonical prompt is a walk, the themed prompt must parse back to
//      the SAME destination coordinate — the coordinate analogue of the equation-solution check —
//      so a walk can never be re-themed into a different (scalar-answer) question graded against the
//      code's coordinate key.

import type { LessonStep } from '../../domain'
import { oneStepSolutionsInText } from './randomizeQuestionNumbers'
import { coordinateWalkInText, linearSolutionsInText } from './numberVariants'

// Signed whole-number tokens (a leading '-' counts only when glued to the digits, so "x = -15"
// reads as -15 while "x - 5" reads as 5). Mirrors how negative answers are actually displayed.
const SIGNED_INTEGER = /-?\d+/g

const integersIn = (text: string): number[] => {
  const matches = text.match(SIGNED_INTEGER)
  return matches ? matches.map(Number) : []
}

// True when every value in `sub` appears in `sup` at least as many times (multiset subset).
const isMultisetSubset = (sub: number[], sup: number[]): boolean => {
  const counts = new Map<number, number>()
  for (const value of sup) counts.set(value, (counts.get(value) ?? 0) + 1)
  for (const value of sub) {
    const remaining = counts.get(value) ?? 0
    if (remaining === 0) return false
    counts.set(value, remaining - 1)
  }
  return true
}

// Every distinct linear solution the text asserts. Multi-term equations (e.g. `2x + 4 = 16`,
// variables-on-both-sides, `x/3 - 4 = 2`) are read by the multi-term parser; only when it finds
// nothing do we fall back to the one-step parser (which also covers spaced/negative `v / a = b`).
// Falling back ONLY when the multi-term parser is silent avoids the classic one-step MISPARSE of a
// two-step equation (reading `2x + 4 = 16` as `x + 4 = 16`) from polluting the set.
const solutionsInText = (text: string): number[] => {
  const multi = linearSolutionsInText(text)
  return multi.length > 0 ? multi : oneStepSolutionsInText(text)
}

const hasEquationField = (step: LessonStep): boolean =>
  'equation' in step && typeof step.equation === 'string' && step.equation.trim() !== ''

const promptOf = (step: LessonStep): string => ('prompt' in step ? step.prompt : '')

// The single canonical solution the variant's shown math represents, or null when it cannot be
// determined (then the prompt-equation check is skipped — the displayed `equation` field, copied
// from the canonical variant, still carries the correct math).
const canonicalSolution = (canonical: LessonStep): number | null => {
  const text = hasEquationField(canonical)
    ? (canonical as { equation: string }).equation
    : promptOf(canonical)
  const distinct = new Set(solutionsInText(text))
  return distinct.size === 1 ? [...distinct][0] : null
}

// The themed prompt may not state an equation with a DIFFERENT solution than the canonical one,
// and (for input questions with no separate equation field) must still state it at all.
const promptEquationsCoherent = (canonical: LessonStep, themed: LessonStep): boolean => {
  const solution = canonicalSolution(canonical)
  if (solution === null) return true // nothing to compare against; rely on the shown equation field

  const themedSolutions = solutionsInText(promptOf(themed))
  if (themedSolutions.some((value) => value !== solution)) return false

  // No code-shown equation field => the prompt is the ONLY carrier of the math, so it must survive.
  if (canonical.type === 'input' && !hasEquationField(canonical) && themedSolutions.length === 0) {
    return false
  }
  return true
}

// For an INPUT question whose math lives ONLY in the prompt (no separate `equation` field), the
// themed prompt must KEEP every numeric given from the canonical prompt. This catches a re-theme
// that silently DROPS a given even when no single equation can be parsed to compare solutions — the
// real bug: "A line has slope -3 and passes through the point (2, 1) ... find its y-intercept b"
// themed down to "find the y-intercept b where the line y = -3x + b hits the vertical axis" drops
// the point (2, 1), leaving a circular, unanswerable question (b is the y-intercept by definition).
// `promptEquationsCoherent` can't catch it because "y = mx + b" has no single canonical solution to
// compare. Multiset-SUBSET (extra story numbers are allowed; every canonical given must survive).
const promptGivensPreserved = (canonical: LessonStep, themed: LessonStep): boolean => {
  if (canonical.type !== 'input' || hasEquationField(canonical)) return true
  return isMultisetSubset(integersIn(promptOf(canonical)), integersIn(promptOf(themed)))
}

// For an INPUT coordinate-walk question — no equation, the answer is a DESTINATION (x, y) (the
// `coordinate-walk` architecture and the bundled coordinate-plane walks) — the themed prompt must
// still describe a walk that LANDS ON THE SAME coordinate. The two checks above cannot catch this
// class: a walk has no solvable equation (so `promptEquationsCoherent` is vacuous), and its move
// magnitudes are just a multiset the LLM can faithfully reproduce INSIDE A DIFFERENT question (so
// `promptGivensPreserved` passes too). That is the real bug: "move 2 right, 5 up, 1 left -> (x, y)"
// re-themed as "for the line y = 2x - 5, what is y when x = 1?" reuses the same integers {2, 5, 1}
// yet asks for a single number instead of a coordinate, so the learner's correct line answer is
// graded against the code's coordinate key and rejected. Parsing the walk back out of the themed
// text and comparing the destination is the coordinate analogue of the equation-solution check, so
// the shown question can never quietly become a different (scalar-answer) question.
const promptWalksCoherent = (canonical: LessonStep, themed: LessonStep): boolean => {
  const canonicalWalk = coordinateWalkInText(promptOf(canonical))
  if (canonicalWalk === null) return true // canonical isn't a coordinate walk; nothing to enforce
  const themedWalk = coordinateWalkInText(promptOf(themed))
  return themedWalk !== null && themedWalk.x === canonicalWalk.x && themedWalk.y === canonicalWalk.y
}

// Every canonical label's numbers must survive in the themed label with the SAME id.
const labelsCoherent = (
  canonicalItems: ReadonlyArray<{ id: string; label: string }>,
  themedItems: ReadonlyArray<{ id: string; label: string }>,
): boolean => {
  const themedById = new Map(themedItems.map((item) => [item.id, item.label]))
  for (const item of canonicalItems) {
    const themedLabel = themedById.get(item.id)
    if (themedLabel === undefined) return false
    if (!isMultisetSubset(integersIn(item.label), integersIn(themedLabel))) return false
  }
  return true
}

// True when the themed step's DISPLAY TEXT states the same math as the canonical (code) variant.
// A false result means the re-theme drifted the numbers and must be rejected in favor of the
// coherent variant. Defensive: a type mismatch (should never happen post-`applyRetheme`) is
// treated as incoherent.
export function isThemedStepCoherent(canonical: LessonStep, themed: LessonStep): boolean {
  if (canonical.type !== themed.type) return false

  if (themed.type === 'input') {
    return (
      promptEquationsCoherent(canonical, themed) &&
      promptGivensPreserved(canonical, themed) &&
      promptWalksCoherent(canonical, themed)
    )
  }
  if (themed.type === 'sequence') {
    const canonicalTiles = canonical.type === 'sequence' ? canonical.tiles : []
    return promptEquationsCoherent(canonical, themed) && labelsCoherent(canonicalTiles, themed.tiles)
  }
  if (themed.type === 'operation-choice') {
    const canonicalChoices = canonical.type === 'operation-choice' ? canonical.choices : []
    // Prompt equations are intentionally NOT checked (the prompt embeds a wrong worked chain).
    return labelsCoherent(canonicalChoices, themed.choices)
  }
  if (themed.type === 'mcq') {
    const canonicalOptions = canonical.type === 'mcq' ? canonical.options : []
    return labelsCoherent(canonicalOptions, themed.options)
  }
  // Any other type is never number-varied or re-themed in v1; treat as coherent.
  return true
}
