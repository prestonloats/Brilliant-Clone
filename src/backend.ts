import type {
  AttemptEvent,
  LessonId,
  LessonProgress,
  LessonScore,
  SkillId,
  SkillMastery,
  StepResult,
  UserProfile,
} from './domain'
import { lessons } from './domain'
import { isValidEmail } from './authValidation'

type LocalDatabase = {
  users: Record<string, LocalUser>
  progress: Record<string, LessonProgress>
  mastery: Record<string, SkillMastery>
  attempts: AttemptEvent[]
}

type LocalUser = UserProfile

export type SignUpInput = {
  email: string
  password?: string
  displayName: string
}

export type MaybePromise<Value> = Value | Promise<Value>

export type AuthRepository = {
  getCurrentUser(): MaybePromise<UserProfile | null>
  signUp(input: SignUpInput): MaybePromise<UserProfile>
  signIn(email: string, password?: string): MaybePromise<UserProfile>
  signOut(): MaybePromise<void>
  resendEmailVerification(): MaybePromise<void>
  reloadCurrentUser(): MaybePromise<UserProfile | null>
}

export type ProgressRepository = {
  getLessonProgress(userId: string, lessonId: LessonId): MaybePromise<LessonProgress | null>
  saveLessonProgress(progress: LessonProgress): MaybePromise<void>
}

export type MasteryRepository = {
  getUserMastery(userId: string): MaybePromise<SkillMastery[]>
  updateSkillMastery(userId: string, skillId: SkillId, correct: boolean): MaybePromise<SkillMastery>
}

export type AttemptRepository = {
  recordAttempt(event: AttemptEvent): MaybePromise<void>
  getAttempts(userId: string): MaybePromise<AttemptEvent[]>
}

export type BackendProvider = 'local' | 'firebase'

export type Backend = {
  readonly provider: BackendProvider
  auth: AuthRepository
  progress: ProgressRepository
  mastery: MasteryRepository
  attempts: AttemptRepository
}

type LocalAuthRepository = {
  getCurrentUser(): UserProfile | null
  signUp(input: SignUpInput): UserProfile
  signIn(email: string): UserProfile
  signOut(): void
  resendEmailVerification(): void
  reloadCurrentUser(): UserProfile | null
}

type LocalProgressRepository = {
  getLessonProgress(userId: string, lessonId: LessonId): LessonProgress | null
  saveLessonProgress(progress: LessonProgress): void
}

type LocalMasteryRepository = {
  getUserMastery(userId: string): SkillMastery[]
  updateSkillMastery(userId: string, skillId: SkillId, correct: boolean): SkillMastery
}

type LocalAttemptRepository = {
  recordAttempt(event: AttemptEvent): void
  getAttempts(userId: string): AttemptEvent[]
}

const STORAGE_KEY = 'balance-local-backend-v1'
const SESSION_KEY = 'balance-local-session-v1'

const emptyDatabase = (): LocalDatabase => ({
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

const normalizeRecord = <Value>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is Value,
): Record<string, Value> => {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<Record<string, Value>>((record, [key, candidate]) => {
    if (isValue(candidate)) {
      record[key] = candidate
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

const normalizeLocalUser = normalizeUserProfile

const normalizeUserRecord = (value: unknown): Record<string, LocalUser> => {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<Record<string, LocalUser>>((record, [key, candidate]) => {
    const user = normalizeLocalUser(candidate)
    if (user) {
      record[key] = user
    }

    return record
  }, {})
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

const normalizeLessonProgressRecord = (value: unknown): Record<string, LessonProgress> => {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<Record<string, LessonProgress>>((record, [key, candidate]) => {
    const progress = normalizeLessonProgress(candidate)
    if (progress) {
      record[key] = progress
    }

    return record
  }, {})
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

const normalizeDatabase = (value: unknown): LocalDatabase => {
  if (!isRecord(value)) return emptyDatabase()

  return {
    users: normalizeUserRecord(value.users),
    progress: normalizeLessonProgressRecord(value.progress),
    mastery: normalizeRecord(value.mastery, isSkillMastery),
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

const createId = (prefix: string) => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`
  }

  // Fallback for non-secure contexts that do not expose crypto.randomUUID.
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const toPublicUser = (user: LocalUser): UserProfile => {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    // Local demo accounts have no email-ownership step, so they are always treated as
    // verified. This keeps local mode writes ungated regardless of legacy stored records.
    emailVerified: true,
    createdAt: user.createdAt,
  }
}

export class LocalBackend implements Backend {
  readonly provider = 'local'
  auth: LocalAuthRepository
  progress: LocalProgressRepository
  mastery: LocalMasteryRepository
  attempts: LocalAttemptRepository

  // Cache the parsed/validated database keyed on the raw stored string so we
  // avoid re-running JSON.parse + full normalization on every read. The raw
  // comparison still detects external writes (other tabs, tests) and falls
  // back to a fresh parse, so reads stay correct.
  private cache: { raw: string; db: LocalDatabase } | null = null

  constructor() {
    this.auth = {
      getCurrentUser: () => {
        const db = this.read()
        const currentUserId = this.getCurrentUserId()
        if (!currentUserId) return null
        const user = db.users[currentUserId]
        return user ? toPublicUser(user) : null
      },
      signUp: (input) => {
        const db = this.read()
        const { email: normalizedEmail, displayName } = validateSignUpInput(input)
        const existing = Object.values(db.users).find((user) => user.email === normalizedEmail)
        if (existing) {
          throw new Error('An account with that email already exists.')
        }

        const user: UserProfile = {
          id: createId('user'),
          email: normalizedEmail,
          displayName,
          createdAt: new Date().toISOString(),
        }

        db.users[user.id] = user
        this.setCurrentUserId(user.id)
        this.write(db)
        return toPublicUser(user)
      },
      signIn: (email) => {
        const db = this.read()
        const normalizedEmail = email.trim().toLowerCase()
        const user = Object.values(db.users).find((candidate) => candidate.email === normalizedEmail)
        if (!user) {
          throw new Error('No local demo profile was found for that email.')
        }

        this.setCurrentUserId(user.id)
        this.write(db)
        return toPublicUser(user)
      },
      signOut: () => {
        this.clearCurrentUserId()
        this.write(this.read())
      },
      resendEmailVerification: () => {
        // Local demo accounts have no email to verify, so this is intentionally a no-op.
      },
      reloadCurrentUser: () => this.auth.getCurrentUser(),
    }

    this.progress = {
      getLessonProgress: (userId, lessonId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        return db.progress[this.progressKey(userId, lessonId)] ?? null
      },
      saveLessonProgress: (progress) => {
        this.requireActiveUser(progress.userId)
        const db = this.read()
        db.progress[this.progressKey(progress.userId, progress.lessonId)] = progress
        this.write(db)
      },
    }

    this.mastery = {
      getUserMastery: (userId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        return Object.values(db.mastery).filter((mastery) => mastery.userId === userId)
      },
      updateSkillMastery: (userId, skillId, correct) => {
        this.requireActiveUser(userId)
        const db = this.read()
        const key = this.masteryKey(userId, skillId)
        const existing =
          db.mastery[key] ??
          ({
            userId,
            skillId,
            score: 0,
            attempts: 0,
            correct: 0,
            lastPracticedAt: new Date().toISOString(),
          } satisfies SkillMastery)

        const attempts = existing.attempts + 1
        const correctAttempts = existing.correct + (correct ? 1 : 0)
        const updated: SkillMastery = {
          ...existing,
          score: Math.round((correctAttempts / attempts) * 100) / 100,
          attempts,
          correct: correctAttempts,
          lastPracticedAt: new Date().toISOString(),
        }

        db.mastery[key] = updated
        this.write(db)
        return updated
      },
    }

    this.attempts = {
      recordAttempt: (event) => {
        this.requireActiveUser(event.userId)
        const db = this.read()
        db.attempts.push(event)
        this.write(db)
      },
      getAttempts: (userId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        return db.attempts.filter((attempt) => attempt.userId === userId)
      },
    }
  }

  private read(): LocalDatabase {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      this.cache = null
      return emptyDatabase()
    }

    if (this.cache && this.cache.raw === raw) {
      return this.cache.db
    }

    try {
      const db = normalizeDatabase(JSON.parse(raw))
      this.cache = { raw, db }
      return db
    } catch {
      this.cache = null
      return emptyDatabase()
    }
  }

  private write(db: LocalDatabase) {
    const raw = JSON.stringify(db)
    window.localStorage.setItem(STORAGE_KEY, raw)
    this.cache = { raw, db }
  }

  private getCurrentUserId() {
    return window.sessionStorage.getItem(SESSION_KEY) ?? undefined
  }

  private setCurrentUserId(userId: string) {
    window.sessionStorage.setItem(SESSION_KEY, userId)
  }

  private clearCurrentUserId() {
    window.sessionStorage.removeItem(SESSION_KEY)
  }

  private requireActiveUser(userId: string) {
    if (this.getCurrentUserId() !== userId) {
      throw new Error('Sign in with this local demo profile before accessing its local data.')
    }
  }

  private progressKey(userId: string, lessonId: LessonId) {
    return `${userId}:${lessonId}`
  }

  private masteryKey(userId: string, skillId: SkillId) {
    return `${userId}:${skillId}`
  }
}

export const localBackend = new LocalBackend()

export type CreateBackendOptions = {
  firebaseBackend?: Backend
}

export const createBackend = (provider: BackendProvider, options: CreateBackendOptions = {}): Backend => {
  if (provider === 'firebase') {
    if (options.firebaseBackend?.provider === 'firebase') return options.firebaseBackend

    throw new Error(
      'Firebase backend mode was requested, but the Firebase adapter could not be initialized. The app refused to fall back to local mode.',
    )
  }

  return new LocalBackend()
}

export const createAttemptEvent = (
  userId: string,
  lessonId: LessonId,
  stepId: string,
  correct: boolean,
  attemptCount: number,
  msToAnswer: number,
): AttemptEvent => ({
  id: createId('attempt'),
  userId,
  lessonId,
  stepId,
  correct,
  attemptCount,
  msToAnswer,
  at: new Date().toISOString(),
})

