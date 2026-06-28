// Story Mode LIVE text scanners.
//
// These PURE scanners read free text (a prompt or equation field) and report the math it states —
// the linear solution(s) it embeds and the coordinate a movement walk lands on. They are used by the
// themed-coherence guard (`themedCoherence.ts`) to prove a re-themed prompt never silently changes
// the underlying question, so they are on the LIVE path (unlike the legacy variant generators).
//
// Extracted verbatim from the former monolithic `numberVariants.ts`; behavior is unchanged.

import { detectVariable, parseSide, RUN_SOURCE, solveModel } from './linearParser'

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

// --- coordinate-walk parsing primitives (shared by the live scanner + the legacy generator) ----

export type WalkDirection = 'left' | 'right' | 'up' | 'down'
export type WalkMove = { magnitude: number; direction: WalkDirection }

// A movement like "7 right" / "8 down" (digits, optional space, a direction word). A bare "(0, 0)"
// origin has no trailing direction word, so it is never matched (its zeros are left untouched).
const WALK_MOVE_SOURCE = '(\\d+)\\s*(left|right|up|down)'

export const parseWalkMoves = (text: string): WalkMove[] => {
  const moves: WalkMove[] = []
  for (const match of text.matchAll(new RegExp(WALK_MOVE_SOURCE, 'gi'))) {
    moves.push({ magnitude: Number(match[1]), direction: match[2].toLowerCase() as WalkDirection })
  }
  return moves
}

export const finalCoordinate = (moves: readonly WalkMove[]): { x: number; y: number } => {
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
