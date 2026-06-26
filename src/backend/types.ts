// Shared backend types: local-store shapes, sign-up input, and the async repository / Backend contracts (plus their sync local variants).

import type {
  AttemptEvent,
  LessonId,
  LessonProgress,
  SkillId,
  SkillMastery,
  StorySession,
  UserProfile,
} from '../domain'

export type LocalDatabase = {
  users: Record<string, LocalUser>
  progress: Record<string, LessonProgress>
  mastery: Record<string, SkillMastery>
  attempts: AttemptEvent[]
  // Story Mode is now a LIBRARY: many saved sessions per user, keyed by `session.id` (schema
  // v2), plus a per-user active-session pointer. Legacy single-session data (keyed by userId
  // with no `id`) is migrated into this shape on read by `normalizeDatabase`.
  story: Record<string, StorySession>
  storyActive: Record<string, string> // userId -> active sessionId
}

export type LocalUser = UserProfile & { passwordHash?: string; passwordSalt?: string }

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
  // Update the signed-in user's display name and return the normalized, updated profile.
  updateDisplayName(name: string): MaybePromise<UserProfile>
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

// Story Mode persists a LIBRARY of whole `StorySession` documents per user (each read/written
// as one document, mirroring how `progress` writes a whole record), plus a per-user active
// session pointer. Each session is addressed by its stable `id`.
export type StoryRepository = {
  listStorySessions(userId: string): MaybePromise<StorySession[]>
  getStorySession(userId: string, sessionId: string): MaybePromise<StorySession | null>
  saveStorySession(session: StorySession): MaybePromise<void>
  deleteStorySession(userId: string, sessionId: string): MaybePromise<void>
  getActiveStorySessionId(userId: string): MaybePromise<string | null>
  setActiveStorySessionId(userId: string, sessionId: string | null): MaybePromise<void>
}

export type BackendProvider = 'local' | 'firebase'

export type Backend = {
  readonly provider: BackendProvider
  auth: AuthRepository
  progress: ProgressRepository
  mastery: MasteryRepository
  attempts: AttemptRepository
  story: StoryRepository
}

export type LocalAuthRepository = {
  getCurrentUser(): UserProfile | null
  signUp(input: SignUpInput): UserProfile
  signIn(email: string, password?: string): UserProfile
  signOut(): void
  resendEmailVerification(): void
  reloadCurrentUser(): UserProfile | null
  updateDisplayName(name: string): UserProfile
}

export type LocalProgressRepository = {
  getLessonProgress(userId: string, lessonId: LessonId): LessonProgress | null
  saveLessonProgress(progress: LessonProgress): void
}

export type LocalMasteryRepository = {
  getUserMastery(userId: string): SkillMastery[]
  updateSkillMastery(userId: string, skillId: SkillId, correct: boolean): SkillMastery
}

export type LocalAttemptRepository = {
  recordAttempt(event: AttemptEvent): void
  getAttempts(userId: string): AttemptEvent[]
}

export type LocalStoryRepository = {
  listStorySessions(userId: string): StorySession[]
  getStorySession(userId: string, sessionId: string): StorySession | null
  saveStorySession(session: StorySession): void
  deleteStorySession(userId: string, sessionId: string): void
  getActiveStorySessionId(userId: string): string | null
  setActiveStorySessionId(userId: string, sessionId: string | null): void
}

export type CreateBackendOptions = {
  firebaseBackend?: Backend
}
