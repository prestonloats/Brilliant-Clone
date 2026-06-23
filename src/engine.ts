import type {
  BalanceOperation,
  BalanceSide,
  BalanceState,
  Course,
  Lesson,
  LessonId,
  LessonProgress,
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
        id: `added-${amount}-${Date.now()}`,
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

export const applyStepResult = (
  progress: LessonProgress,
  step: LessonStep,
  result: CheckResult,
  nextStepIndex: number,
  lessonStepCount: number,
  countAttempt = true,
): LessonProgress => {
  const previous = progress.stepResults[step.id]
  const stepResult: StepResult = {
    correct: result.correct,
    attempts: (previous?.attempts ?? 0) + (countAttempt ? 1 : 0),
    feedback: result.feedback,
  }
  const completed = result.correct && nextStepIndex >= lessonStepCount

  return {
    ...progress,
    status: completed ? 'completed' : 'inProgress',
    currentStepIndex: result.correct ? Math.min(nextStepIndex, lessonStepCount - 1) : progress.currentStepIndex,
    stepResults: { ...progress.stepResults, [step.id]: stepResult },
    completedAt: completed ? new Date().toISOString() : progress.completedAt,
    updatedAt: new Date().toISOString(),
  }
}

export const getRecommendedNextLesson = (lesson: Lesson, mastery: SkillMastery[]) => {
  const lessonMastery = lesson.skillIds.map((skillId) => mastery.find((item) => item.skillId === skillId)?.score ?? 0)
  const averageMastery =
    lessonMastery.length === 0
      ? 0
      : lessonMastery.reduce((total, score) => total + score, 0) / lessonMastery.length

  if (averageMastery < MASTERY_READY_THRESHOLD) {
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

  if (lesson.nextLessonId === 'two-step-equations') {
    return {
      title: 'Two-Step Equations',
      body: 'Next, decide which operation to undo first when x has two changes.',
    }
  }

  return {
    title: 'One-Step Equations',
    body: 'Next, use the same balancing idea with multiplication and division.',
  }
}

export const isLessonUnlocked = (lesson: Lesson, progressByLesson: ProgressByLesson) =>
  lesson.steps.length > 0 &&
  lesson.prerequisites.every((lessonId) => progressByLesson[lessonId]?.status === 'completed')

export const getRecommendedPathLessonId = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  preferredLessonId?: LessonId,
) => {
  const availableInProgress = course.lessonOrder.find((lessonId) => {
    const lesson = lessonCatalog[lessonId]
    return isLessonUnlocked(lesson, progressByLesson) && progressByLesson[lessonId]?.status === 'inProgress'
  })

  if (availableInProgress) return availableInProgress

  const nextAvailable = course.lessonOrder.find((lessonId) => {
    const lesson = lessonCatalog[lessonId]
    return isLessonUnlocked(lesson, progressByLesson) && progressByLesson[lessonId]?.status !== 'completed'
  })

  if (nextAvailable) return nextAvailable

  if (preferredLessonId && lessonCatalog[preferredLessonId]?.steps.length) {
    return preferredLessonId
  }

  return course.lessonOrder.find((lessonId) => lessonCatalog[lessonId].steps.length > 0) ?? course.lessonOrder[0]
}

