// Browser-storage backend.
//
// The `LocalBackend` implements the full `Backend` contract synchronously on top of
// `localStorage` (the database) and `sessionStorage` (the active user), with a raw-string read
// cache so repeated reads skip re-parsing/normalizing. It leans on `./validation` for
// `emptyDatabase`/`normalizeDatabase`/`validateSignUpInput`. `createId` is exported for the
// factory's `createAttemptEvent`; it is not part of the public `./backend` barrel.

import type { LessonId, SkillId, SkillMastery, UserProfile } from '../domain'
import type {
  Backend,
  LocalAttemptRepository,
  LocalAuthRepository,
  LocalDatabase,
  LocalMasteryRepository,
  LocalProgressRepository,
  LocalUser,
} from './types'
import { emptyDatabase, normalizeDatabase, validateSignUpInput } from './validation'

const STORAGE_KEY = 'balance-local-backend-v1'
const SESSION_KEY = 'balance-local-session-v1'

export const createId = (prefix: string) => {
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
