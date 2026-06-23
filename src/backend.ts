import type {
  AttemptEvent,
  LessonId,
  LessonProgress,
  SkillId,
  SkillMastery,
  StepResult,
  UserProfile,
} from './domain'
import { lessons } from './domain'

type LocalDatabase = {
  currentUserId?: string
  users: Record<string, LocalUser>
  progress: Record<string, LessonProgress>
  mastery: Record<string, SkillMastery>
  attempts: AttemptEvent[]
}

type LocalUser = UserProfile & { password: string }

export type SignUpInput = {
  email: string
  password: string
  displayName: string
}

export type AuthRepository = {
  getCurrentUser(): UserProfile | null
  signUp(input: SignUpInput): UserProfile
  signIn(email: string, password: string): UserProfile
  signOut(): void
}

export type ProgressRepository = {
  getLessonProgress(userId: string, lessonId: LessonId): LessonProgress | null
  saveLessonProgress(progress: LessonProgress): void
}

export type MasteryRepository = {
  getUserMastery(userId: string): SkillMastery[]
  updateSkillMastery(userId: string, skillId: SkillId, correct: boolean): SkillMastery
}

export type AttemptRepository = {
  recordAttempt(event: AttemptEvent): void
  getAttempts(userId: string): AttemptEvent[]
}

export type Backend = {
  auth: AuthRepository
  progress: ProgressRepository
  mastery: MasteryRepository
  attempts: AttemptRepository
}

const STORAGE_KEY = 'balance-local-backend-v1'

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

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

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

const isLocalUser = (value: unknown): value is LocalUser => {
  if (!isRecord(value)) return false

  return (
    isString(value.id) &&
    isString(value.email) &&
    isString(value.displayName) &&
    isString(value.password) &&
    isString(value.createdAt) &&
    (value.avatarUrl === undefined || isString(value.avatarUrl))
  )
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

const normalizeLessonProgress = (value: unknown): LessonProgress | null => {
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

  return {
    userId: value.userId,
    lessonId: value.lessonId,
    status: value.status,
    currentStepIndex: value.currentStepIndex,
    stepResults: normalizeStepResults(value.stepResults, value.lessonId),
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

const isSkillMastery = (value: unknown): value is SkillMastery => {
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

const isAttemptEvent = (value: unknown): value is AttemptEvent => {
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

  const users = normalizeRecord(value.users, isLocalUser)
  const currentUserId =
    isString(value.currentUserId) && users[value.currentUserId]
      ? value.currentUserId
      : undefined

  return {
    users,
    progress: normalizeLessonProgressRecord(value.progress),
    mastery: normalizeRecord(value.mastery, isSkillMastery),
    attempts: Array.isArray(value.attempts) ? value.attempts.filter(isAttemptEvent) : [],
    ...(currentUserId ? { currentUserId } : {}),
  }
}

const validateSignUpInput = (input: SignUpInput) => {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  const passwordLength = input.password.trim().length

  if (!email) {
    throw new Error('Email is required.')
  }
  if (!isEmail(email)) {
    throw new Error('Enter a valid email address.')
  }
  if (!displayName) {
    throw new Error('Display name is required.')
  }
  if (passwordLength === 0) {
    throw new Error('Password is required.')
  }
  if (passwordLength < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  return { email, displayName }
}

const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const toPublicUser = (user: LocalUser): UserProfile => {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  }
}

export class LocalBackend implements Backend {
  auth: AuthRepository
  progress: ProgressRepository
  mastery: MasteryRepository
  attempts: AttemptRepository

  constructor() {
    this.auth = {
      getCurrentUser: () => {
        const db = this.read()
        if (!db.currentUserId) return null
        const user = db.users[db.currentUserId]
        return user ? toPublicUser(user) : null
      },
      signUp: (input) => {
        const db = this.read()
        const { email: normalizedEmail, displayName } = validateSignUpInput(input)
        const existing = Object.values(db.users).find((user) => user.email === normalizedEmail)
        if (existing) {
          throw new Error('An account with that email already exists.')
        }

        const user: UserProfile & { password: string } = {
          id: createId('user'),
          email: normalizedEmail,
          displayName,
          password: input.password,
          createdAt: new Date().toISOString(),
        }

        db.users[user.id] = user
        db.currentUserId = user.id
        this.write(db)
        return toPublicUser(user)
      },
      signIn: (email, password) => {
        const db = this.read()
        const normalizedEmail = email.trim().toLowerCase()
        const user = Object.values(db.users).find(
          (candidate) => candidate.email === normalizedEmail && candidate.password === password,
        )
        if (!user) {
          throw new Error('Check your email and password, then try again.')
        }

        db.currentUserId = user.id
        this.write(db)
        return toPublicUser(user)
      },
      signOut: () => {
        const db = this.read()
        delete db.currentUserId
        this.write(db)
      },
    }

    this.progress = {
      getLessonProgress: (userId, lessonId) => {
        const db = this.read()
        return db.progress[this.progressKey(userId, lessonId)] ?? null
      },
      saveLessonProgress: (progress) => {
        const db = this.read()
        db.progress[this.progressKey(progress.userId, progress.lessonId)] = progress
        this.write(db)
      },
    }

    this.mastery = {
      getUserMastery: (userId) => {
        const db = this.read()
        return Object.values(db.mastery).filter((mastery) => mastery.userId === userId)
      },
      updateSkillMastery: (userId, skillId, correct) => {
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
        const db = this.read()
        db.attempts.push(event)
        this.write(db)
      },
      getAttempts: (userId) => {
        const db = this.read()
        return db.attempts.filter((attempt) => attempt.userId === userId)
      },
    }
  }

  private read(): LocalDatabase {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDatabase()

    try {
      return normalizeDatabase(JSON.parse(raw))
    } catch {
      return emptyDatabase()
    }
  }

  private write(db: LocalDatabase) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }

  private progressKey(userId: string, lessonId: LessonId) {
    return `${userId}:${lessonId}`
  }

  private masteryKey(userId: string, skillId: SkillId) {
    return `${userId}:${skillId}`
  }
}

export const localBackend = new LocalBackend()

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

