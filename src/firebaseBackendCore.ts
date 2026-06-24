import type { BackendProvider } from './firebaseConfigCore'
import type { AttemptEvent, LessonId, LessonProgress, SkillId, SkillMastery, UserProfile } from './domain'

const assertSafeDocumentId = (value: string, label: string) => {
  if (!value.trim() || value.includes('/')) {
    throw new Error(`${label} must be a non-empty Firestore document id segment.`)
  }

  return value
}

export const EMAIL_VERIFICATION_REQUIRED_MESSAGE =
  'Verify your email before saving learning progress. Open the verification link we sent, or resend it, then try again.'

// Firebase-only gate. Local demo accounts are always treated as verified so local mode is unaffected.
export const isEmailVerificationRequired = (
  provider: BackendProvider,
  emailVerified: boolean | undefined,
): boolean => provider === 'firebase' && emailVerified !== true

// Client-side defense-in-depth alongside the Firestore rules `email_verified` requirement
// for user-scoped writes. Throws a clear, user-facing message instead of a raw permission error.
export const assertVerifiedEmailForWrite = (emailVerified: boolean | undefined): void => {
  if (emailVerified !== true) {
    throw new Error(EMAIL_VERIFICATION_REQUIRED_MESSAGE)
  }
}

export const requireMatchingUserId = (authenticatedUid: string | null | undefined, requestedUserId: string) => {
  if (!authenticatedUid) {
    throw new Error('Sign in before accessing Firebase-backed data.')
  }

  if (authenticatedUid !== requestedUserId) {
    throw new Error('Cannot access Firebase data for a different authenticated user.')
  }

  return authenticatedUid
}

export const firebaseUserPath = (uid: string) => `users/${assertSafeDocumentId(uid, 'uid')}`

export const firebaseProgressPath = (uid: string, lessonId: LessonId) =>
  `progress/${assertSafeDocumentId(uid, 'uid')}/lessons/${assertSafeDocumentId(lessonId, 'lessonId')}`

export const firebaseMasteryPath = (uid: string, skillId: SkillId) =>
  `mastery/${assertSafeDocumentId(uid, 'uid')}/skills/${assertSafeDocumentId(skillId, 'skillId')}`

export const firebaseAttemptPath = (uid: string, attemptId: string) =>
  `attempts/${assertSafeDocumentId(uid, 'uid')}/events/${assertSafeDocumentId(attemptId, 'attemptId')}`

// `emailVerified` is intentionally omitted: the source of truth is the live Firebase Auth
// user / ID token claim, so persisting it to Firestore would only create a stale copy.
export const toFirestoreUserProfile = (uid: string, profile: UserProfile): UserProfile => ({
  id: uid,
  email: profile.email,
  displayName: profile.displayName,
  ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  createdAt: profile.createdAt,
})

export const toFirestoreLessonProgress = (uid: string, progress: LessonProgress): LessonProgress => ({
  ...progress,
  userId: uid,
})

export const toFirestoreSkillMastery = (uid: string, mastery: SkillMastery): SkillMastery => ({
  ...mastery,
  userId: uid,
})

export const toFirestoreAttemptEvent = (uid: string, event: AttemptEvent): AttemptEvent => ({
  ...event,
  userId: uid,
})
