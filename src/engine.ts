import type {
  BalanceOperation,
  BalanceSide,
  BalanceState,
  Course,
  DragTermsHintWhen,
  Lesson,
  LessonId,
  LessonProgress,
  LessonScore,
  LessonStep,
  ManipulativeHintWhen,
  PlotHintWhen,
  PlotPoint,
  SkillMastery,
  SliderHintWhen,
  StepResult,
} from './domain'

export type CheckResult = {
  correct: boolean
  feedback: string
  reveal?: string
  retryGuidance?: string
}

export type BalanceCheckMeta = {
  movedOneSideOnly?: boolean
}

export type ProgressByLesson = Partial<Record<LessonId, LessonProgress>>

export const MASTERY_READY_THRESHOLD = 0.65

export type CourseProgressSummary = {
  totalLessons: number
  completedLessons: number
  percentComplete: number
  lastCompletedLessonId?: LessonId
  recommendedLessonId: LessonId
  recommendedAction: 'start' | 'continue' | 'view-summary'
  lastCompletedLatestScore?: LessonScore
  lastCompletedBestScore?: LessonScore
  recommendedLatestScore?: LessonScore
  recommendedBestScore?: LessonScore
}

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

export const checkInputStep = (
  step: Extract<LessonStep, { type: 'input' }>,
  answer: string,
  attemptNumber = 1,
): CheckResult => {
  const normalizedAnswer = normalizeExpression(answer)
  const accepted = step.accept.some((value) => {
    if (normalizeExpression(value) === normalizedAnswer) return true

    const acceptedNumber = safeEvaluateNumber(value)
    const answerNumber = safeEvaluateNumber(answer)
    return Number.isFinite(acceptedNumber) && Math.abs(acceptedNumber - answerNumber) < 0.001
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
  const complete = selectedIds.length === step.correctOrder.length
  const ordered = complete && selectedIds.every((id, index) => id === step.correctOrder[index])

  if (ordered) {
    return { correct: true, feedback: step.feedback.correct }
  }

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
  const hintFor = (when: ManipulativeHintWhen) =>
    step.feedback.hints?.find((hint) => hint.when === when)?.text ??
    step.feedback.hints?.find((hint) => hint.when === 'default')?.text ??
    step.feedback.incorrect
  const wrong = (when: ManipulativeHintWhen) =>
    buildWrongResult({
      attemptNumber,
      hint: hintFor(when),
      explanation: step.feedback.incorrect,
      reveal: step.feedback.reveal,
    })

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
export const quadrantOf = (point: PlotPoint): 1 | 2 | 3 | 4 | null => {
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
  const hintFor = (when: PlotHintWhen) =>
    step.feedback.hints?.find((hint) => hint.when === when)?.text ??
    step.feedback.hints?.find((hint) => hint.when === 'default')?.text ??
    step.feedback.incorrect
  const wrong = (when: PlotHintWhen) =>
    buildWrongResult({
      attemptNumber,
      hint: hintFor(when),
      explanation: step.feedback.incorrect,
      reveal: step.feedback.reveal,
    })

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
  const hintFor = (when: SliderHintWhen) =>
    step.feedback.hints?.find((hint) => hint.when === when)?.text ??
    step.feedback.hints?.find((hint) => hint.when === 'default')?.text ??
    step.feedback.incorrect
  const wrong = (when: SliderHintWhen) =>
    buildWrongResult({
      attemptNumber,
      hint: hintFor(when),
      explanation: step.feedback.incorrect,
      reveal: step.feedback.reveal,
    })

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
  const hintFor = (when: DragTermsHintWhen) =>
    step.feedback.hints?.find((hint) => hint.when === when)?.text ??
    step.feedback.hints?.find((hint) => hint.when === 'default')?.text ??
    step.feedback.incorrect
  const wrong = (when: DragTermsHintWhen) =>
    buildWrongResult({
      attemptNumber,
      hint: hintFor(when),
      explanation: step.feedback.incorrect,
      reveal: step.feedback.reveal,
    })

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

export const sideTotal = (items: BalanceState[BalanceSide]) =>
  items.reduce((total, item) => total + item.value, 0)

export const isLevel = (state: BalanceState) => sideTotal(state.left) === sideTotal(state.right)

export const applyBalanceOperation = (state: BalanceState, operation: BalanceOperation): BalanceState => {
  const next = cloneBalanceState(state)
  const sides: BalanceSide[] = operation.sides === 'both' ? ['left', 'right'] : [operation.sides]

  sides.forEach((side) => {
    next[side] = applyAmount(next[side], operation.amount)
  })

  return next
}

export const checkBalanceStep = (
  step: Extract<LessonStep, { type: 'balance' }>,
  state: BalanceState,
  meta: BalanceCheckMeta = {},
  attemptNumber = 1,
): CheckResult => {
  const hint = (when: Parameters<typeof findHint>[1]) => findHint(step, when)
  const wrong = (when: Parameters<typeof findHint>[1]) =>
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
    // Combine the single-block shorthand and the multi-block list, then require EVERY listed
    // block to sit on its named pan. With a full required list this rejects the trivially
    // empty scale (0 = 0) and any mirrored/decoy arrangement that happens to be level but
    // does not place each block where it belongs.
    const required = [
      ...(step.goal.requireItemOnSide ? [step.goal.requireItemOnSide] : []),
      ...(step.goal.requireItemsOnSide ?? []),
    ]
    const requiredMet = required.every((placement) =>
      state[placement.side].some((item) => item.id === placement.itemId),
    )

    if (!requiredMet) {
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
  when: 'not-level' | 'missing-item' | 'one-side-only' | 'not-isolated' | 'default',
) => step.feedback.hints.find((hint) => hint.when === when)?.text ?? step.feedback.hints.at(-1)?.text ?? step.feedback.reveal

const cloneBalanceState = (state: BalanceState): BalanceState => ({
  ...state,
  left: state.left.map((item) => ({ ...item })),
  right: state.right.map((item) => ({ ...item })),
  bank: state.bank?.map((item) => ({ ...item })),
})

const createWeightId = (amount: number) => {
  const cryptoApi = globalThis.crypto
  const suffix =
    cryptoApi && typeof cryptoApi.randomUUID === 'function'
      ? cryptoApi.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `added-${amount}-${suffix}`
}

const applyAmount = (items: BalanceState[BalanceSide], amount: number) => {
  if (amount === 0) return items

  if (amount > 0) {
    const inverseIndex = items.findIndex((item) => item.kind === 'weight' && item.value === -amount)
    if (inverseIndex >= 0) {
      return items.filter((_, index) => index !== inverseIndex)
    }

    return [
      ...items,
      {
        id: createWeightId(amount),
        label: String(amount),
        value: amount,
        kind: 'weight' as const,
      },
    ]
  }

  const valueToRemove = Math.abs(amount)
  const exactIndex = items.findIndex((item) => item.kind === 'weight' && item.value === valueToRemove)
  if (exactIndex >= 0) {
    return items.filter((_, index) => index !== exactIndex)
  }

  return items.map((item) => {
    if (item.kind === 'weight' && item.value > valueToRemove) {
      const nextValue = item.value - valueToRemove
      return { ...item, id: `${item.id}-minus-${valueToRemove}`, label: String(nextValue), value: nextValue }
    }
    return item
  })
}

export const createInitialProgress = (userId: string, lessonId: LessonId): LessonProgress => {
  const now = new Date().toISOString()
  return {
    userId,
    lessonId,
    status: 'inProgress',
    currentStepIndex: 0,
    stepResults: {},
    startedAt: now,
    updatedAt: now,
  }
}

export const isAssessedLessonStep = (step: LessonStep) => step.type !== 'concept'

export const calculateLessonScore = (
  lesson: Lesson,
  progress: LessonProgress,
  completedAt = new Date().toISOString(),
): LessonScore => {
  const assessedSteps = lesson.steps.filter(isAssessedLessonStep)
  const correctFirstTryCount = assessedSteps.filter((step) => {
    const result = progress.stepResults[step.id]
    return result?.correct === true && result.attempts <= 1
  }).length

  return {
    scorePercent:
      assessedSteps.length === 0 ? 100 : Math.round((correctFirstTryCount / assessedSteps.length) * 100),
    correctFirstTryCount,
    assessedStepCount: assessedSteps.length,
    completedAt,
  }
}

export const getLessonCompletionHistory = (progress?: LessonProgress): LessonScore[] => {
  if (!progress) return []
  if (progress.completionHistory?.length) return progress.completionHistory
  return progress.latestScore ? [progress.latestScore] : []
}

const selectBestScore = (scores: LessonScore[]) =>
  scores.reduce<LessonScore | undefined>((best, score) => {
    if (!best) return score
    return score.scorePercent >= best.scorePercent ? score : best
  }, undefined)

export const getLatestLessonScore = (lesson: Lesson, progress?: LessonProgress) => {
  if (!progress) return undefined

  return (
    progress.latestScore ??
    getLessonCompletionHistory(progress).at(-1) ??
    (progress.status === 'completed' && progress.completedAt
      ? calculateLessonScore(lesson, progress, progress.completedAt)
      : undefined)
  )
}

export const getBestLessonScore = (lesson: Lesson, progress?: LessonProgress) => {
  if (!progress) return undefined

  const scores = [
    ...getLessonCompletionHistory(progress),
    ...(progress.latestScore ? [progress.latestScore] : []),
    ...(progress.bestScore ? [progress.bestScore] : []),
  ]
  const legacyScore =
    progress.status === 'completed' && progress.completedAt
      ? calculateLessonScore(lesson, progress, progress.completedAt)
      : undefined

  return selectBestScore(legacyScore ? [...scores, legacyScore] : scores)
}

export const hasCompletedLesson = (progress?: LessonProgress) =>
  progress?.status === 'completed' || getLessonCompletionHistory(progress).length > 0

export const restartLessonProgress = (progress: LessonProgress, lesson?: Lesson): LessonProgress => {
  const now = new Date().toISOString()
  const legacyScore =
    progress.status === 'completed' && lesson && progress.completedAt
      ? calculateLessonScore(lesson, progress, progress.completedAt)
      : undefined
  const completionHistory = getLessonCompletionHistory(progress)
  const preservedHistory = completionHistory.length > 0 ? completionHistory : legacyScore ? [legacyScore] : []
  const latestScore = progress.latestScore ?? preservedHistory.at(-1)
  const bestScore = progress.bestScore ?? selectBestScore(preservedHistory)

  return {
    userId: progress.userId,
    lessonId: progress.lessonId,
    status: 'inProgress',
    currentStepIndex: 0,
    stepResults: {},
    ...(latestScore ? { latestScore } : {}),
    ...(bestScore ? { bestScore } : {}),
    ...(preservedHistory.length > 0 ? { completionHistory: preservedHistory } : {}),
    startedAt: now,
    updatedAt: now,
  }
}

export const applyStepResult = (
  progress: LessonProgress,
  step: LessonStep,
  result: CheckResult,
  nextStepIndex: number,
  lesson: Lesson,
  countAttempt = true,
): LessonProgress => {
  const lessonStepCount = lesson.steps.length
  const previous = progress.stepResults[step.id]
  const stepResult: StepResult = {
    correct: result.correct,
    attempts: (previous?.attempts ?? 0) + (countAttempt ? 1 : 0),
    feedback: result.feedback,
  }
  const completed = result.correct && nextStepIndex >= lessonStepCount
  const now = new Date().toISOString()
  const completedAt = completed ? now : progress.completedAt

  const nextProgress: LessonProgress = {
    ...progress,
    status: completed ? 'completed' : 'inProgress',
    currentStepIndex: result.correct ? Math.min(nextStepIndex, lessonStepCount - 1) : progress.currentStepIndex,
    stepResults: { ...progress.stepResults, [step.id]: stepResult },
    completedAt,
    updatedAt: now,
  }

  if (!completed || !completedAt) {
    return nextProgress
  }

  const completionScore = calculateLessonScore(lesson, nextProgress, completedAt)
  const completionHistory = [...getLessonCompletionHistory(progress), completionScore]
  const bestScore = selectBestScore([
    ...completionHistory,
    ...(progress.bestScore ? [progress.bestScore] : []),
  ])

  return {
    ...nextProgress,
    latestScore: completionScore,
    ...(bestScore ? { bestScore } : {}),
    completionHistory,
  }
}

export type NextLessonRecommendation = {
  // The lesson the learner should open next, when there is one. Omitted for a review
  // recommendation (stay on the just-finished lesson) and for end-of-path.
  lessonId?: LessonId
  kind: 'review' | 'next' | 'complete'
  title: string
  body: string
}

// Recommendation shown after finishing a lesson. It is branch-aware: instead of trusting
// the raw linear `nextLessonId` (which can be locked at a merge or already completed on a
// parallel branch), it walks the dependency graph for the next unlocked, not-yet-completed
// lesson. If the just-finished lesson's mastery is still low it recommends reviewing it,
// and it falls back to an end-of-path message when nothing is available.
export const getRecommendedNextLesson = (
  lesson: Lesson,
  mastery: SkillMastery[],
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
): NextLessonRecommendation => {
  const lessonMastery = lesson.skillIds.map((skillId) => mastery.find((item) => item.skillId === skillId)?.score ?? 0)
  const averageMastery =
    lessonMastery.length === 0
      ? 0
      : lessonMastery.reduce((total, score) => total + score, 0) / lessonMastery.length
  const hasAssessedSteps = lesson.steps.some(isAssessedLessonStep)

  if (hasAssessedSteps && averageMastery < MASTERY_READY_THRESHOLD) {
    return {
      lessonId: lesson.id,
      kind: 'review',
      title: `Review ${lesson.title}`,
      body: 'Practice this lesson once more before moving on. The scale should feel automatic.',
    }
  }

  const nextLessonId = getNextAvailableLessonId(course, lessonCatalog, progressByLesson, lesson.id)

  if (!nextLessonId) {
    return {
      kind: 'complete',
      title: 'Course path complete',
      body: 'You have completed the available lessons in this path.',
    }
  }

  return { lessonId: nextLessonId, kind: 'next', ...nextLessonRecommendations[nextLessonId] }
}

// First path lesson whose prerequisites are satisfied and that has not been completed,
// skipping the lesson just finished. Used by the completion-screen recommendation so it
// never points at a locked or already-completed lesson.
const getNextAvailableLessonId = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  excludeLessonId?: LessonId,
): LessonId | undefined => {
  const pathLessonIds = getPathLessonIds(course, lessonCatalog)
  return pathLessonIds.find((lessonId) => {
    if (lessonId === excludeLessonId) return false
    const candidate = lessonCatalog[lessonId]
    return isLessonUnlocked(candidate, progressByLesson) && !hasCompletedLesson(progressByLesson[lessonId])
  })
}

const nextLessonRecommendations: Record<LessonId, { title: string; body: string }> = {
  'balancing-equations': {
    title: 'Balancing Equations',
    body: 'Start by making the equals sign feel like a balance.',
  },
  'one-step-equations': {
    title: 'One-Step Equations',
    body: 'Next, use the same balancing idea with multiplication and division.',
  },
  'two-step-equations': {
    title: 'Two-Step Equations',
    body: 'Next, decide which operation to undo first when x has two changes.',
  },
  'like-terms-variables-both-sides': {
    title: 'Like Terms & Variables on Both Sides',
    body: 'Next, gather matching terms and prepare to move variables while preserving equality.',
  },
  'coordinate-plane': {
    title: 'Coordinate Plane',
    body: 'Next, place algebra on a grid by reading and plotting points.',
  },
  'graphing-lines': {
    title: 'Graphing Lines',
    body: 'Next, connect slope-intercept equations to the lines they draw.',
  },
}

export const isLessonUnlocked = (lesson: Lesson, progressByLesson: ProgressByLesson) =>
  lesson.steps.length > 0 &&
  lesson.prerequisites.every((lessonId) => hasCompletedLesson(progressByLesson[lessonId]))

// How one path stage connects to the previous one. Derived from the dependency
// graph so the path page can draw a chain that visibly splits and merges.
export type LessonGraphConnector = 'start' | 'linear' | 'split' | 'merge' | 'parallel'

export type LessonGraphNode = {
  id: LessonId
  // Longest prerequisite distance from a root lesson; used as the vertical row.
  rank: number
  prerequisites: LessonId[]
  // Lessons that list this lesson as one of their prerequisites.
  unlocks: LessonId[]
}

export type LessonGraphStage = {
  rank: number
  connector: LessonGraphConnector
  nodeIds: LessonId[]
}

export type LessonGraph = {
  nodes: Record<LessonId, LessonGraphNode>
  stages: LessonGraphStage[]
}

// Turns the lesson prerequisite lists into a layered dependency graph: lessons are
// grouped into stages by rank, and each stage records whether the path is splitting
// into parallel branches or merging them back together. The shape is computed from
// `prerequisites` alone so content edits to the graph stay reflected automatically.
export const buildLessonGraph = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
): LessonGraph => {
  const orderedIds = course.lessonOrder.filter((lessonId) => Boolean(lessonCatalog[lessonId]))
  const orderIndex = new Map(orderedIds.map((lessonId, index) => [lessonId, index]))
  const byOrder = (a: LessonId, b: LessonId) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0)

  const rankById = new Map<LessonId, number>()
  const resolveRank = (lessonId: LessonId): number => {
    const cached = rankById.get(lessonId)
    if (cached !== undefined) return cached

    const prerequisites = lessonCatalog[lessonId]?.prerequisites ?? []
    const rank =
      prerequisites.length === 0
        ? 0
        : Math.max(...prerequisites.map((prerequisiteId) => resolveRank(prerequisiteId))) + 1

    rankById.set(lessonId, rank)
    return rank
  }

  const unlocksById = new Map<LessonId, LessonId[]>()
  orderedIds.forEach((lessonId) => {
    lessonCatalog[lessonId].prerequisites.forEach((prerequisiteId) => {
      const dependents = unlocksById.get(prerequisiteId) ?? []
      dependents.push(lessonId)
      unlocksById.set(prerequisiteId, dependents)
    })
  })

  const nodes = orderedIds.reduce(
    (accumulator, lessonId) => {
      accumulator[lessonId] = {
        id: lessonId,
        rank: resolveRank(lessonId),
        prerequisites: [...lessonCatalog[lessonId].prerequisites],
        unlocks: (unlocksById.get(lessonId) ?? []).slice().sort(byOrder),
      }
      return accumulator
    },
    {} as Record<LessonId, LessonGraphNode>,
  )

  const ranks = [...new Set(orderedIds.map((lessonId) => nodes[lessonId].rank))].sort((a, b) => a - b)

  let previousCount = 0
  const stages = ranks.map<LessonGraphStage>((rank, stageIndex) => {
    const nodeIds = orderedIds.filter((lessonId) => nodes[lessonId].rank === rank).sort(byOrder)
    const hasMerge = nodeIds.some((lessonId) => nodes[lessonId].prerequisites.length > 1)

    let connector: LessonGraphConnector
    if (stageIndex === 0) {
      connector = 'start'
    } else if (hasMerge) {
      connector = 'merge'
    } else if (previousCount <= 1 && nodeIds.length > 1) {
      connector = 'split'
    } else if (previousCount > 1 && nodeIds.length > 1) {
      connector = 'parallel'
    } else {
      connector = 'linear'
    }

    previousCount = nodeIds.length
    return { rank, connector, nodeIds }
  })

  return { nodes, stages }
}

const getPathLessonIds = (course: Course, lessonCatalog: Record<LessonId, Lesson>) =>
  course.lessonOrder.filter((lessonId) => lessonCatalog[lessonId]?.steps.length > 0)

const getLastCompletedPathLessonId = (lessonIds: LessonId[], progressByLesson: ProgressByLesson) =>
  lessonIds.findLast((lessonId) => hasCompletedLesson(progressByLesson[lessonId]))

export const getRecommendedPathLessonId = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  preferredLessonId?: LessonId,
) => {
  const pathLessonIds = getPathLessonIds(course, lessonCatalog)
  const availableInProgress = pathLessonIds.find((lessonId) => {
    const lesson = lessonCatalog[lessonId]
    return isLessonUnlocked(lesson, progressByLesson) && progressByLesson[lessonId]?.status === 'inProgress'
  })

  if (availableInProgress) return availableInProgress

  const nextAvailable = pathLessonIds.find((lessonId) => {
    const lesson = lessonCatalog[lessonId]
    return isLessonUnlocked(lesson, progressByLesson) && progressByLesson[lessonId]?.status !== 'completed'
  })

  if (nextAvailable) return nextAvailable

  const lastCompletedLessonId = getLastCompletedPathLessonId(pathLessonIds, progressByLesson)
  if (lastCompletedLessonId) return lastCompletedLessonId

  if (preferredLessonId && lessonCatalog[preferredLessonId]?.steps.length) {
    return preferredLessonId
  }

  return pathLessonIds[0] ?? course.lessonOrder[0]
}

export const getCourseProgressSummary = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  preferredLessonId?: LessonId,
): CourseProgressSummary => {
  const pathLessonIds = getPathLessonIds(course, lessonCatalog)
  const completedLessonIds = pathLessonIds.filter((lessonId) => hasCompletedLesson(progressByLesson[lessonId]))
  const lastCompletedLessonId = getLastCompletedPathLessonId(pathLessonIds, progressByLesson)
  const recommendedLessonId = getRecommendedPathLessonId(course, lessonCatalog, progressByLesson, preferredLessonId)
  const recommendedLesson = lessonCatalog[recommendedLessonId]
  const recommendedProgress = progressByLesson[recommendedLessonId]
  const lastCompletedLesson = lastCompletedLessonId ? lessonCatalog[lastCompletedLessonId] : undefined
  const lastCompletedProgress = lastCompletedLessonId ? progressByLesson[lastCompletedLessonId] : undefined

  return {
    totalLessons: pathLessonIds.length,
    completedLessons: completedLessonIds.length,
    percentComplete:
      pathLessonIds.length === 0 ? 0 : Math.round((completedLessonIds.length / pathLessonIds.length) * 100),
    ...(lastCompletedLessonId ? { lastCompletedLessonId } : {}),
    recommendedLessonId,
    recommendedAction: recommendedProgress?.status === 'completed' ? 'view-summary' : recommendedProgress ? 'continue' : 'start',
    ...(lastCompletedLesson
      ? {
          lastCompletedLatestScore: getLatestLessonScore(lastCompletedLesson, lastCompletedProgress),
          lastCompletedBestScore: getBestLessonScore(lastCompletedLesson, lastCompletedProgress),
        }
      : {}),
    recommendedLatestScore: getLatestLessonScore(recommendedLesson, recommendedProgress),
    recommendedBestScore: getBestLessonScore(recommendedLesson, recommendedProgress),
  }
}

