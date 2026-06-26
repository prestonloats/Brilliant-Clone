// The core Story Mode safety mechanism (plan 5.3).
//
// `applyRetheme` reconstructs a themed question from the ORIGINAL bundled `LessonStep`
// plus the LLM's `RethemeResult`. It is a PURE function and the single guarantee that a
// re-theme can never change grading:
//
//   - It deep-clones the original (`structuredClone`) and overwrites ONLY display text
//     (`prompt`, option/tile `label`s).
//   - It NEVER reads or derives an answer key (`accept`, `correctId`, `correctOrder`,
//     `acceptableOrders`, feedback) from the result — those are copied from the original.
//   - For choice/sequence steps it REQUIRES the themed id set to EXACTLY equal the source
//     id set; otherwise (or on any other validation failure) it returns the original
//     unchanged with `themed: false` so the UI shows the original question.
//
// Because the answer key only ever comes from the original object, a bad rewrite can at
// worst look wrong; it can never make a wrong answer count as correct.

import type { LessonStep } from '../domain'
import type { RethemeResult } from './storyAi'

type LabeledItem = { id: string; label: string }

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

// Exact set equality on ids: same count, no missing ids, no extra ids, no duplicates.
const hasExactIdSet = (themed: ReadonlyArray<LabeledItem>, source: ReadonlyArray<{ id: string }>): boolean => {
  if (!Array.isArray(themed) || themed.length !== source.length) return false
  const themedIds = new Set(themed.map((item) => item?.id))
  // A duplicate id would shrink the set below the source length even when counts match.
  if (themedIds.size !== source.length) return false
  return source.every((item) => themedIds.has(item.id))
}

// Every themed item must carry a non-empty label (no blank display text gets through).
const allLabelsPresent = (themed: ReadonlyArray<LabeledItem>): boolean =>
  themed.every((item) => isNonEmptyString(item.label))

const fallback = (original: LessonStep) => ({ step: original, themed: false as const })

export function applyRetheme(
  original: LessonStep,
  result: RethemeResult,
): { step: LessonStep; themed: boolean } {
  // Only the four rethemable assessed types are supported in v1; anything else (concept,
  // balance, plot, slider, manipulative, dragTerms) always falls back to the original.
  if (
    original.type !== 'input' &&
    original.type !== 'mcq' &&
    original.type !== 'operation-choice' &&
    original.type !== 'sequence'
  ) {
    return fallback(original)
  }

  // A themed prompt is mandatory for every supported type.
  if (!result || !isNonEmptyString(result.themedPrompt)) {
    return fallback(original)
  }

  const clone = structuredClone(original)

  if (clone.type === 'input') {
    clone.prompt = result.themedPrompt
    // accept[], equation, and feedback stay exactly as authored.
    return { step: clone, themed: true }
  }

  if (clone.type === 'mcq' || clone.type === 'operation-choice') {
    const themedOptions = result.themedOptions ?? []
    const sourceItems = clone.type === 'mcq' ? clone.options : clone.choices

    if (!hasExactIdSet(themedOptions, sourceItems) || !allLabelsPresent(themedOptions)) {
      return fallback(original)
    }

    const labelById = new Map(themedOptions.map((item) => [item.id, item.label]))
    clone.prompt = result.themedPrompt
    for (const item of sourceItems) {
      // Non-null asserted: hasExactIdSet guarantees every source id is present.
      item.label = labelById.get(item.id)!
      // correctId / detail / feedback are deliberately left untouched.
    }
    return { step: clone, themed: true }
  }

  // sequence
  const themedTiles = result.themedTiles ?? []
  if (!hasExactIdSet(themedTiles, clone.tiles) || !allLabelsPresent(themedTiles)) {
    return fallback(original)
  }

  const labelById = new Map(themedTiles.map((item) => [item.id, item.label]))
  clone.prompt = result.themedPrompt
  for (const tile of clone.tiles) {
    tile.label = labelById.get(tile.id)!
  }
  // correctOrder / acceptableOrders / feedback stay exactly as authored.
  return { step: clone, themed: true }
}
