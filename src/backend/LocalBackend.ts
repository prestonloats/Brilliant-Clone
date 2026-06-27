// Browser-storage backend implementing the Backend contract over localStorage/sessionStorage.

import type { LessonId, SkillId, SkillMastery, UserProfile } from '../domain'
import type {
  Backend,
  LocalAttemptRepository,
  LocalAuthRepository,
  LocalDatabase,
  LocalMasteryRepository,
  LocalPracticeRepository,
  LocalProgressRepository,
  LocalStoryRepository,
  LocalUser,
} from './types'
import { applyPracticeOutcome } from '../engine/practice/applyOutcome'
import { createInitialPracticeState } from '../engine/practice/mastery'
import { emptyDatabase, normalizeDatabase, validateDisplayNameInput, validateSignUpInput } from './validation'
import { DEFAULT_LEGACY_PASSWORD, hashPassword, needsRehash, verifyPassword } from '../auth/passwordCredential'
import { PASSWORD_MIN_LENGTH } from '../authValidation'

export const STORAGE_KEY = 'balance-local-backend-v1'
export const SESSION_KEY = 'balance-local-session-v1'

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
  practice: LocalPracticeRepository
  story: LocalStoryRepository

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
        if (!input.password || input.password.length < PASSWORD_MIN_LENGTH) {
          throw new Error('A password with at least 6 characters is required.')
        }
        const existing = Object.values(db.users).find((user) => user.email === normalizedEmail)
        if (existing) {
          throw new Error('An account with that email already exists.')
        }

        const credential = hashPassword(input.password)
        const user: LocalUser = {
          id: createId('user'),
          email: normalizedEmail,
          displayName,
          createdAt: new Date().toISOString(),
          passwordHash: credential.hash,
          passwordSalt: credential.salt,
          passwordIterations: credential.iterations,
        }

        db.users[user.id] = user
        this.setCurrentUserId(user.id)
        this.write(db)
        return toPublicUser(user)
      },
      signIn: (email, password) => {
        const db = this.read()
        const normalizedEmail = email.trim().toLowerCase()
        const user = Object.values(db.users).find((candidate) => candidate.email === normalizedEmail)
        if (!user) {
          throw new Error('No local demo profile was found for that email.')
        }

        if (!password) {
          throw new Error('Password is required.')
        }

        // Lazy migration: accounts persisted before per-user passwords are treated as having the
        // default legacy password, so the stored credential is created on first sign-in.
        if (!user.passwordHash || !user.passwordSalt) {
          const migrated = hashPassword(DEFAULT_LEGACY_PASSWORD)
          user.passwordHash = migrated.hash
          user.passwordSalt = migrated.salt
          user.passwordIterations = migrated.iterations
          this.write(db)
        }

        const credential = {
          hash: user.passwordHash!,
          salt: user.passwordSalt!,
          iterations: user.passwordIterations,
        }
        if (!verifyPassword(password, credential)) {
          throw new Error('Incorrect password.')
        }

        // Upgrade-on-login: if the stored credential used fewer stretching rounds than the current
        // cost (e.g. a legacy 1000-round hash), transparently re-hash it now that we have the
        // plaintext and it verified.
        if (needsRehash(credential)) {
          const upgraded = hashPassword(password)
          user.passwordHash = upgraded.hash
          user.passwordSalt = upgraded.salt
          user.passwordIterations = upgraded.iterations
        }

        this.setCurrentUserId(user.id)
        this.write(db)
        return toPublicUser(user)
      },
      signOut: () => {
        this.clearCurrentUserId()
      },
      resendEmailVerification: () => {
        // Local demo accounts have no email to verify, so this is intentionally a no-op.
      },
      reloadCurrentUser: () => this.auth.getCurrentUser(),
      updateDisplayName: (name) => {
        // Active-user requirement, mirroring the other repositories: there must be a signed-in
        // local profile to update (its id is the only write target).
        const currentUserId = this.getCurrentUserId()
        const db = this.read()
        const user = currentUserId ? db.users[currentUserId] : undefined
        if (!user) {
          throw new Error('Sign in before updating your display name.')
        }

        user.displayName = validateDisplayNameInput(name)
        db.users[user.id] = user
        this.write(db)
        return toPublicUser(user)
      },
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

    this.practice = {
      getUserPractice: (userId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        return Object.values(db.practice).filter((practice) => practice.userId === userId)
      },
      // Advance ONE skill's practice state by a single outcome. Reads the existing record (or seeds
      // a fresh one) and applies the SHARED pure `applyPracticeOutcome` so Local + Firebase agree.
      updatePractice: (userId, skillId, outcome) => {
        this.requireActiveUser(userId)
        const db = this.read()
        const key = this.practiceKey(userId, skillId)
        const existing = db.practice[key] ?? createInitialPracticeState(userId, skillId, outcome.at)
        const updated = applyPracticeOutcome(existing, outcome)
        db.practice[key] = updated
        this.write(db)
        return updated
      },
    }

    this.story = {
      // The library: every saved session owned by the active user. Legacy single-session data
      // is already migrated into `db.story` (keyed by session id) by normalizeDatabase on read.
      listStorySessions: (userId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        return Object.values(db.story).filter((session) => session.userId === userId)
      },
      getStorySession: (userId, sessionId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        const session = db.story[sessionId]
        return session && session.userId === userId ? session : null
      },
      saveStorySession: (session) => {
        this.requireActiveUser(session.userId)
        const db = this.read()
        // One whole document per session, keyed by its stable id (mirrors the progress write).
        db.story[session.id] = session
        this.write(db)
      },
      deleteStorySession: (userId, sessionId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        const session = db.story[sessionId]
        if (!session || session.userId !== userId) return
        delete db.story[sessionId]
        if (db.storyActive[userId] === sessionId) delete db.storyActive[userId]
        this.write(db)
      },
      getActiveStorySessionId: (userId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        const sessionId = db.storyActive[userId]
        // Only return a pointer that still resolves to one of the user's saved sessions.
        return sessionId && db.story[sessionId]?.userId === userId ? sessionId : null
      },
      setActiveStorySessionId: (userId, sessionId) => {
        this.requireActiveUser(userId)
        const db = this.read()
        if (sessionId === null) {
          delete db.storyActive[userId]
        } else {
          db.storyActive[userId] = sessionId
        }
        this.write(db)
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

  private practiceKey(userId: string, skillId: SkillId) {
    return `${userId}:${skillId}`
  }
}
