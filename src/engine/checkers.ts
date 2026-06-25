// Pure step checkers.
//
// One checker per interactive step type. Each takes the authored step plus the learner's
// current answer and returns a `CheckResult`, escalating feedback by attempt
// (hint -> explanation -> reveal) through the shared `buildWrongResult` helper. The balance
// checker reuses the `sideTotal`/`isLevel` predicates from the balance module.

import type { BalanceHintWhen, BalanceState, LessonStep, PlotPoint } from '../domain'
import type { BalanceCheckMeta, CheckResult } from './types'
import { isLevel, sideTotal } from './balance'

export const normalizeExpression = (value: string) =>
  value.toLowerCase().replace(/\s+/g, '').replace(/^x=/, '')

const buildWrongResult = ({
  attemptNumber,
  explanation,
  hint,
  reveal,
  keepHint = false,
}: {
  attemptNumber: number
  explanation: string
  hint: string
  reveal?: string
  // When true (choice steps) the per-option misconception (`hint`) stays as the main
  // feedback on every attempt. The generic `explanation` layers in at attempt 2 and the
  // exact `reveal` takes over at attempt 3, so a newly chosen wrong option always
  // explains itself instead of being overwritten by the generic message.
  keepHint?: boolean
}): CheckResult => {
  if (keepHint) {
    if (attemptNumber >= 3 && reveal) {
      return {
        correct: false,
        feedback: hint,
        reveal,
        retryGuidance: 'Use the reveal, then make the choice it points to so you still finish it yourself.',
      }
    }

    if (attemptNumber >= 2) {
      const layeredExplanation = explanation && explanation !== hint ? explanation : undefined
      return {
        correct: false,
        feedback: hint,
        ...(layeredExplanation ? { reveal: layeredExplanation } : {}),
        retryGuidance: reveal
          ? 'Use this explanation to retry. One more miss will show the exact move.'
          : 'Use this explanation to retry.',
      }
    }

    return {
      correct: false,
      feedback: hint,
      retryGuidance: 'Use the hint, then try again.',
    }
  }

  if (attemptNumber >= 3 && reveal) {
    return {
      correct: false,
      feedback: explanation,
      reveal,
      retryGuidance: 'Use the reveal, then try the step again so you still finish it yourself.',
    }
  }

  if (attemptNumber >= 2) {
    return {
      correct: false,
      feedback: explanation,
      retryGuidance: reveal
        ? 'Use this explanation to retry. One more miss will show the exact move.'
        : 'Use this explanation to retry.',
    }
  }

  return {
    correct: false,
    feedback: hint,
    retryGuidance: 'Use the hint, then try again.',
  }
}

// Shared hint/feedback factory for the data-driven checkers (manipulative, plot, slider,
// dragTerms). Each resolves an authored hint by `when`, falls back to the `default` hint and
// then the generic `incorrect`, and wraps it in `buildWrongResult` with the same escalation.
const makeHintHelpers = <W extends string>(
  step: { feedback: { incorrect: string; reveal: string; hints?: { when: W; text: string }[] } },
  attemptNumber: number,
) => {
  const hintFor = (when: W) =>
    step.feedback.hints?.find((hint) => hint.when === when)?.text ??
    step.feedback.hints?.find((hint) => hint.when === 'default')?.text ??
    step.feedback.incorrect
  const wrong = (when: W) =>
    buildWrongResult({
      attemptNumber,
      hint: hintFor(when),
      explanation: step.feedback.incorrect,
      reveal: step.feedback.reveal,
    })
  return { wrong }
}

const safeEvaluateNumber = (value: string) => {
  const normalized = normalizeExpression(value)
  if (!/^-?\d+(\.\d+)?(\/-?\d+(\.\d+)?)?$/.test(normalized)) {
    return Number.NaN
  }

  if (normalized.includes('/')) {
    const [numerator, denominator] = normalized.split('/').map(Number)
    return denominator === 0 ? Number.NaN : numerator / denominator
  }

  return Number(normalized)
}

// Absolute tolerance for accepting a typed numeric answer (e.g. 0.5 vs 1/2). Deliberately
// looser than the slider's 1e-9 epsilon because learners hand-type decimal approximations.
const INPUT_NUMERIC_TOLERANCE = 0.001

export const checkInputStep = (
  step: Extract<LessonStep, { type: 'input' }>,
  answer: string,
  attemptNumber = 1,
): CheckResult => {
  const normalizedAnswer = normalizeExpression(answer)
  const answerNumber = safeEvaluateNumber(answer)
  const accepted = step.accept.some((value) => {
    if (normalizeExpression(value) === normalizedAnswer) return true

    const acceptedNumber = safeEvaluateNumber(value)
    return Number.isFinite(acceptedNumber) && Math.abs(acceptedNumber - answerNumber) < INPUT_NUMERIC_TOLERANCE
  })

  if (accepted) {
    return { correct: true, feedback: step.feedback.correct }
  }

  return buildWrongResult({
    attemptNumber,
    hint: step.feedback.hintsByAnswer?.[normalizedAnswer] ?? step.feedback.incorrect,
    explanation: step.feedback.incorrect,
    reveal: step.feedback.reveal,
  })
}

export const checkOperationChoiceStep = (
  step: Extract<LessonStep, { type: 'operation-choice' }>,
  choiceId: string,
  attemptNumber = 1,
): CheckResult => {
  const choice = step.choices.find((candidate) => candidate.id === choiceId)

  if (choiceId === step.correctId) {
    return { correct: true, feedback: step.feedback.correct || choice?.feedback || 'Correct.' }
  }

  return buildWrongResult({
    attemptNumber,
    hint: choice?.feedback ?? step.feedback.incorrect,
    explanation: step.feedback.incorrect,
    reveal: step.feedback.reveal,
    keepHint: true,
  })
}

export const checkSequenceStep = (
  step: Extract<LessonStep, { type: 'sequence' }>,
  selectedIds: string[],
  attemptNumber = 1,
): CheckResult => {
  // Some steps have moves that commute (e.g. subtracting the x-term and the constant in either
  // order), so correctOrder plus any authored acceptableOrders all count as solved.
  const acceptedOrders = [step.correctOrder, ...(step.acceptableOrders ?? [])]
  const ordered = acceptedOrders.some(
    (order) => selectedIds.length === order.length && selectedIds.every((id, index) => id === order[index]),
  )

  if (ordered) {
    return { correct: true, feedback: step.feedback.correct }
  }

  const complete = selectedIds.length === step.correctOrder.length
  const misplacedTileId = selectedIds.find((id, index) => id !== step.correctOrder[index])
  const hint = !complete
    ? step.feedback.incomplete
    : misplacedTileId
      ? step.feedback.hintsByTile?.[misplacedTileId] ?? step.feedback.incorrect
      : step.feedback.incorrect

  return buildWrongResult({
    attemptNumber,
    hint,
    explanation: step.feedback.incorrect,
    reveal: step.feedback.reveal,
  })
}

// Pure checker for the data-driven manipulative puzzle. `groupCounts[i]` is how many
// objects the learner placed in group zone i. Escalates hints by attempt the same way
// the other step checkers do (hint -> explanation -> reveal), driven by authored data.
export const checkManipulativeStep = (
  step: Extract<LessonStep, { type: 'manipulative' }>,
  groupCounts: number[],
  attemptNumber = 1,
): CheckResult => {
  const { wrong } = makeHintHelpers(step, attemptNumber)

  const placed = groupCounts.reduce((total, count) => total + count, 0)

  if (step.goal.type === 'equal-groups') {
    const { groups, perGroup } = step.goal
    const targetZones = groupCounts.slice(0, groups)
    const solved =
      groupCounts.length === groups &&
      placed === groups * perGroup &&
      targetZones.every((count) => count === perGroup)

    if (solved) return { correct: true, feedback: step.feedback.correct }
    if (placed === 0) return wrong('empty')
    if (targetZones.some((count) => count > perGroup)) return wrong('too-many')
    if (new Set(targetZones).size > 1) return wrong('uneven')
    if (targetZones.some((count) => count < perGroup)) return wrong('too-few')
    return wrong('default')
  }

  // build-product: the learner sets the number of groups and a single per-group count, so
  // `groupCounts` arrives as `numGroups` copies of the per-group value. The puzzle is solved
  // when both match the targets (which makes the live total = groups x perGroup equal x). The
  // total is discovered, never pre-given, so there is no "uses every item" condition here.
  if (step.goal.type === 'build-product') {
    const { groups, perGroup } = step.goal
    const numGroups = groupCounts.length
    const solved = numGroups === groups && groupCounts.every((count) => count === perGroup)

    if (solved) return { correct: true, feedback: step.feedback.correct }
    if (placed === 0) return wrong('empty')
    if (numGroups !== groups) return wrong('groups')
    return wrong('per-group')
  }

  const { count } = step.goal
  if (placed === count) return { correct: true, feedback: step.feedback.correct }
  if (placed === 0) return wrong('empty')
  if (placed > count) return wrong('too-many')
  return wrong('too-few')
}

// The quadrant a point falls in, or null when it sits on an axis (so it is in none).
// Numbered counterclockwise from the upper right: I (+,+), II (-,+), III (-,-), IV (+,-).
const quadrantOf = (point: PlotPoint): 1 | 2 | 3 | 4 | null => {
  if (point.x === 0 || point.y === 0) return null
  if (point.x > 0) return point.y > 0 ? 1 : 4
  return point.y > 0 ? 2 : 3
}

const samePoint = (a: PlotPoint, b: PlotPoint) => a.x === b.x && a.y === b.y

// Counts how many placed points fall in each quadrant (axis points are ignored here; the
// caller checks for those first), so an exact and a sub-multiset comparison stay simple.
const countByQuadrant = (points: PlotPoint[]) => {
  const counts = new Map<number, number>()
  points.forEach((point) => {
    const quadrant = quadrantOf(point)
    if (quadrant !== null) counts.set(quadrant, (counts.get(quadrant) ?? 0) + 1)
  })
  return counts
}

// Pure checker for the data-driven coordinate-grid task. `placed` is the list of points the
// learner dropped on the grid. Escalates hints by attempt the same way the other checkers do
// (hint -> explanation -> reveal), driven entirely by authored data.
export const checkPlotStep = (
  step: Extract<LessonStep, { type: 'plot' }>,
  placed: PlotPoint[],
  attemptNumber = 1,
): CheckResult => {
  const { wrong } = makeHintHelpers(step, attemptNumber)

  if (placed.length === 0) return wrong('empty')

  if (step.target.kind === 'points') {
    const required = step.target.points
    const leftover = [...placed]
    let matched = 0
    required.forEach((target) => {
      const index = leftover.findIndex((point) => samePoint(point, target))
      if (index >= 0) {
        matched += 1
        leftover.splice(index, 1)
      }
    })

    if (matched === required.length && leftover.length === 0) {
      return { correct: true, feedback: step.feedback.correct }
    }

    if (placed.length > required.length) return wrong('too-many')

    // A reversed coordinate (e.g. (2, -4) for the target (-4, 2)) is the classic ordered-pair
    // slip, so it gets its own hint before the more generic ones.
    const swapped = placed.some((point) =>
      required.some((target) => target.x !== target.y && samePoint(point, { x: target.y, y: target.x })),
    )
    if (swapped) return wrong('swapped')

    if (placed.length < required.length) return wrong('incomplete')

    // Right number of points, but at least one is off: nudge toward the target when a point is
    // already in the correct quadrant, otherwise fall back to the generic miss.
    const close = placed.some((point) =>
      required.some((target) => quadrantOf(point) !== null && quadrantOf(point) === quadrantOf(target)),
    )
    return wrong(close ? 'close' : 'default')
  }

  const requiredQuadrants = step.target.quadrants
  if (placed.some((point) => quadrantOf(point) === null)) return wrong('on-axis')
  if (placed.length > requiredQuadrants.length) return wrong('too-many')

  const placedCounts = countByQuadrant(placed)
  const requiredCounts = countByQuadrant(
    requiredQuadrants.map((quadrant) => ({ x: quadrant === 1 || quadrant === 4 ? 1 : -1, y: quadrant <= 2 ? 1 : -1 })),
  )
  const withinRequired = [...placedCounts.entries()].every(
    ([quadrant, count]) => count <= (requiredCounts.get(quadrant) ?? 0),
  )

  if (placed.length < requiredQuadrants.length) {
    return withinRequired ? wrong('incomplete') : wrong('wrong-quadrant')
  }

  const exactMatch =
    withinRequired &&
    placedCounts.size === requiredCounts.size &&
    [...requiredCounts.entries()].every(([quadrant, count]) => placedCounts.get(quadrant) === count)
  if (exactMatch) {
    return { correct: true, feedback: step.feedback.correct }
  }
  return wrong('wrong-quadrant')
}

// Pure checker for the data-driven slider task. `value` is the learner's current slope (m)
// and intercept (b). It matches each against `target` within `tolerance` (defaults to an
// exact match) and escalates hints by attempt the same way the other checkers do
// (hint -> explanation -> reveal), driven entirely by authored data.
export const checkSliderStep = (
  step: Extract<LessonStep, { type: 'slider' }>,
  value: { slope: number; intercept: number },
  attemptNumber = 1,
): CheckResult => {
  const { wrong } = makeHintHelpers(step, attemptNumber)

  // A tiny default epsilon keeps fractional `step` values from failing on float rounding
  // while still behaving as an exact match for the common integer case.
  const tolerance = step.tolerance ?? 1e-9
  const slopeDelta = value.slope - step.target.slope
  const interceptDelta = value.intercept - step.target.intercept
  const slopeOff = Math.abs(slopeDelta) > tolerance
  const interceptOff = Math.abs(interceptDelta) > tolerance

  if (!slopeOff && !interceptOff) {
    return { correct: true, feedback: step.feedback.correct }
  }

  // Wrong sign on the slope is the classic "rises vs falls" slip, so it gets its own hint
  // before the more generic ones.
  const wrongSign =
    step.target.slope !== 0 && value.slope !== 0 && Math.sign(value.slope) !== Math.sign(step.target.slope)
  if (slopeOff && wrongSign) return wrong('slope-direction')

  if (slopeOff && interceptOff) {
    const close = Math.abs(slopeDelta) <= 1 + tolerance && Math.abs(interceptDelta) <= 1 + tolerance
    return wrong(close ? 'close' : 'both-off')
  }

  if (slopeOff) return wrong('slope-off')
  return wrong('intercept-off')
}

// Pure checker for the data-driven term-tile sorting task. `placements` maps each tile id to the
// bin id the learner dropped it in (tiles missing from the map are still in the tray/unsorted).
// The task is solved when every tile sits in its authored `bin`. It escalates hints by attempt
// the same way the other checkers do (hint -> explanation -> reveal), driven entirely by data.
export const checkDragTermsStep = (
  step: Extract<LessonStep, { type: 'dragTerms' }>,
  placements: Record<string, string | undefined>,
  attemptNumber = 1,
): CheckResult => {
  const { wrong } = makeHintHelpers(step, attemptNumber)

  const sortedTiles = step.tiles.filter((tile) => Boolean(placements[tile.id]))
  if (sortedTiles.length === 0) return wrong('empty')

  const everyTileSorted = sortedTiles.length === step.tiles.length
  const everyTileCorrect = step.tiles.every((tile) => placements[tile.id] === tile.bin)

  if (everyTileSorted && everyTileCorrect) {
    return { correct: true, feedback: step.feedback.correct }
  }

  // A tile in the wrong bin is the actual misconception, so surface it before nudging the
  // learner to finish sorting the remaining tiles.
  const anyMisplaced = sortedTiles.some((tile) => placements[tile.id] !== tile.bin)
  if (anyMisplaced) return wrong('misplaced')

  return wrong('incomplete')
}

export const checkBalanceStep = (
  step: Extract<LessonStep, { type: 'balance' }>,
  state: BalanceState,
  meta: BalanceCheckMeta = {},
  attemptNumber = 1,
): CheckResult => {
  const hint = (when: BalanceHintWhen) => findHint(step, when)
  const wrong = (when: BalanceHintWhen) =>
    buildWrongResult({
      attemptNumber,
      hint: hint(when),
      explanation: step.feedback.explanation ?? hint(when),
      reveal: step.feedback.reveal,
    })

  if (meta.movedOneSideOnly) {
    return wrong('one-side-only')
  }

  if (step.goal.type === 'level') {
    // Side-agnostic requirement: every listed block must sit on EITHER pan (not the tray).
    // This rejects the empty 0 = 0 start without pinning blocks to a side, so both mirror
    // arrangements that are level (e.g. {3,2} vs {5}) count as solved.
    const placedMet = (step.goal.requirePlacedItems ?? []).every((itemId) =>
      [...state.left, ...state.right].some((item) => item.id === itemId),
    )

    if (!placedMet) {
      return wrong('missing-item')
    }

    if (isLevel(state)) {
      return { correct: true, feedback: step.feedback.correct }
    }

    return wrong('not-level')
  }

  const isolateGoal = step.goal
  const allItems = [...state.left, ...state.right]
  const unknown = allItems.find((item) => item.id === isolateGoal.unknownId)
  const unknownSide = state.left.some((item) => item.id === isolateGoal.unknownId) ? 'left' : 'right'
  const sideWithUnknown = state[unknownSide]
  const otherSide = unknownSide === 'left' ? state.right : state.left
  const isolated =
    Boolean(unknown) &&
    sideWithUnknown.length === 1 &&
    sideTotal(sideWithUnknown) === isolateGoal.value &&
    sideTotal(otherSide) === isolateGoal.value

  if (isolated && isLevel(state)) {
    return { correct: true, feedback: step.feedback.correct }
  }

  return wrong('not-isolated')
}

const findHint = (
  step: Extract<LessonStep, { type: 'balance' }>,
  when: BalanceHintWhen,
) => step.feedback.hints.find((hint) => hint.when === when)?.text ?? step.feedback.hints.at(-1)?.text ?? step.feedback.reveal
