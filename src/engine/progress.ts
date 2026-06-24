// Lesson progress and scoring.
//
// Pure helpers that create, score, and advance a learner's `LessonProgress`. Scoring is
// first-try based over the assessed (non-concept) steps; the history/best/latest helpers keep
// retakes comparable, and `applyStepResult` records each attempt and finalizes a completion.

import type { Lesson, LessonId, LessonProgress, LessonScore, LessonStep, StepResult } from '../domain'
import type { CheckResult } from './types'

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
