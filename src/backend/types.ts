// Shared backend types: local-store shapes, sign-up input, and the async repository / Backend contracts (plus their sync local variants).

import type {
  AttemptEvent,
  LessonId,
  LessonProgress,
  SkillId,
  SkillMastery,
  UserProfile,
} from '../domain'

export type LocalDatabase = {
  users: Record<string, LocalUser>
  progress: Record<string, LessonProgress>
  mastery: Record<string, SkillMastery>
  attempts: AttemptEvent[]
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

export type LocalAuthRepository = {
  getCurrentUser(): UserProfile | null
  signUp(input: SignUpInput): UserProfile
  signIn(email: string, password?: string): UserProfile
  signOut(): void
  resendEmailVerification(): void
  reloadCurrentUser(): UserProfile | null
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

export type CreateBackendOptions = {
  firebaseBackend?: Backend
}
