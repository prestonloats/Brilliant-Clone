import type {
  BalanceOperation,
  BalanceSide,
  BalanceState,
  Course,
  Lesson,
  LessonId,
  LessonProgress,
  LessonScore,
  LessonStep,
  SkillMastery,
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
}: {
  attemptNumber: number
  explanation: string
  hint: string
  reveal?: string
}): CheckResult => {
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
    const required = step.goal.requireItemOnSide
    const requiredMet = required
      ? state[required.side].some((item) => item.id === required.itemId)
      : true

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

export const getRecommendedNextLesson = (lesson: Lesson, mastery: SkillMastery[]) => {
  const lessonMastery = lesson.skillIds.map((skillId) => mastery.find((item) => item.skillId === skillId)?.score ?? 0)
  const averageMastery =
    lessonMastery.length === 0
      ? 0
      : lessonMastery.reduce((total, score) => total + score, 0) / lessonMastery.length
  const hasAssessedSteps = lesson.steps.some(isAssessedLessonStep)

  if (hasAssessedSteps && averageMastery < MASTERY_READY_THRESHOLD) {
    return {
      title: `Review ${lesson.title}`,
      body: 'Practice this lesson once more before moving on. The scale should feel automatic.',
    }
  }

  if (!lesson.nextLessonId) {
    return {
      title: 'Course path complete',
      body: 'You have completed the available lessons in this path.',
    }
  }

  return nextLessonRecommendations[lesson.nextLessonId]
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

