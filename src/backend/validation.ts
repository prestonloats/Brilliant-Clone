// Runtime guards, normalizers, and sign-up validation that defend the local store against untrusted JSON.

import type {
  AttemptEvent,
  LessonId,
  LessonProgress,
  LessonScore,
  SkillMastery,
  StepResult,
  UserProfile,
} from '../domain'
import { lessons } from '../domain'
import { isValidEmail } from '../authValidation'
import type { LocalDatabase, SignUpInput } from './types'

export const emptyDatabase = (): LocalDatabase => ({
  users: {},
  progress: {},
  mastery: {},
  attempts: [],
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isLessonId = (value: unknown): value is LessonId =>
  isString(value) && value in lessons

const isStepResult = (value: unknown): value is StepResult => {
  if (!isRecord(value)) return false

  return (
    typeof value.correct === 'boolean' &&
    isNumber(value.attempts) &&
    Number.isInteger(value.attempts) &&
    value.attempts >= 0 &&
    isString(value.feedback)
  )
}

const isLessonScore = (value: unknown): value is LessonScore => {
  if (!isRecord(value)) return false

  return (
    isNumber(value.scorePercent) &&
    Number.isInteger(value.scorePercent) &&
    value.scorePercent >= 0 &&
    value.scorePercent <= 100 &&
    isNumber(value.correctFirstTryCount) &&
    Number.isInteger(value.correctFirstTryCount) &&
    value.correctFirstTryCount >= 0 &&
    isNumber(value.assessedStepCount) &&
    Number.isInteger(value.assessedStepCount) &&
    value.assessedStepCount >= 0 &&
    value.correctFirstTryCount <= value.assessedStepCount &&
    isString(value.completedAt)
  )
}

const normalizeRecordWith = <Value>(
  value: unknown,
  normalize: (candidate: unknown) => Value | null,
): Record<string, Value> => {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<Record<string, Value>>((record, [key, candidate]) => {
    const normalized = normalize(candidate)
    if (normalized !== null) {
      record[key] = normalized
    }

    return record
  }, {})
}

export const normalizeUserProfile = (value: unknown): UserProfile | null => {
  if (!isRecord(value)) return null

  if (
    !isString(value.id) ||
    !isString(value.email) ||
    !isString(value.displayName) ||
    !isString(value.createdAt) ||
    (value.avatarUrl !== undefined && !isString(value.avatarUrl))
  ) {
    return null
  }

  return {
    id: value.id,
    email: value.email,
    displayName: value.displayName,
    ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}),
    ...(typeof value.emailVerified === 'boolean' ? { emailVerified: value.emailVerified } : {}),
    createdAt: value.createdAt,
  }
}

const normalizeStepResults = (
  value: unknown,
  lessonId: LessonId,
): Record<string, StepResult> => {
  if (!isRecord(value)) return {}

  const validStepIds = new Set(lessons[lessonId].steps.map((step) => step.id))

  return Object.entries(value).reduce<Record<string, StepResult>>((results, [stepId, result]) => {
    if (validStepIds.has(stepId) && isStepResult(result)) {
      results[stepId] = result
    }

    return results
  }, {})
}

export const normalizeLessonProgress = (value: unknown): LessonProgress | null => {
  if (!isRecord(value)) return null
  if (!isString(value.userId) || !isLessonId(value.lessonId)) return null
  if (
    value.status !== 'notStarted' &&
    value.status !== 'inProgress' &&
    value.status !== 'completed'
  ) {
    return null
  }
  if (!isNumber(value.currentStepIndex) || !Number.isInteger(value.currentStepIndex)) return null

  const lesson = lessons[value.lessonId]
  if (value.currentStepIndex < 0 || value.currentStepIndex >= lesson.steps.length) return null
  if (!isString(value.startedAt) || !isString(value.updatedAt)) return null
  if (value.completedAt !== undefined && !isString(value.completedAt)) return null
  const completionHistory = Array.isArray(value.completionHistory)
    ? value.completionHistory.filter(isLessonScore)
    : []

  return {
    userId: value.userId,
    lessonId: value.lessonId,
    status: value.status,
    currentStepIndex: value.currentStepIndex,
    stepResults: normalizeStepResults(value.stepResults, value.lessonId),
    ...(isLessonScore(value.latestScore) ? { latestScore: value.latestScore } : {}),
    ...(isLessonScore(value.bestScore) ? { bestScore: value.bestScore } : {}),
    ...(completionHistory.length > 0 ? { completionHistory } : {}),
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    ...(value.completedAt ? { completedAt: value.completedAt } : {}),
  }
}

export const isSkillMastery = (value: unknown): value is SkillMastery => {
  if (!isRecord(value)) return false

  return (
    isString(value.userId) &&
    isString(value.skillId) &&
    isNumber(value.score) &&
    isNumber(value.attempts) &&
    isNumber(value.correct) &&
    isString(value.lastPracticedAt)
  )
}

export const isAttemptEvent = (value: unknown): value is AttemptEvent => {
  if (!isRecord(value)) return false

  return (
    isString(value.id) &&
    isString(value.userId) &&
    isString(value.lessonId) &&
    isString(value.stepId) &&
    typeof value.correct === 'boolean' &&
    isNumber(value.attemptCount) &&
    isNumber(value.msToAnswer) &&
    isString(value.at)
  )
}

export const normalizeDatabase = (value: unknown): LocalDatabase => {
  if (!isRecord(value)) return emptyDatabase()

  return {
    users: normalizeRecordWith(value.users, normalizeUserProfile),
    progress: normalizeRecordWith(value.progress, normalizeLessonProgress),
    mastery: normalizeRecordWith(value.mastery, (candidate) =>
      isSkillMastery(candidate) ? candidate : null,
    ),
    attempts: Array.isArray(value.attempts) ? value.attempts.filter(isAttemptEvent) : [],
  }
}

export const validateSignUpInput = (input: SignUpInput) => {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()

  if (!email) {
    throw new Error('Email is required.')
  }
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email address.')
  }
  if (!displayName) {
    throw new Error('Display name is required.')
  }

  return { email, displayName }
}
