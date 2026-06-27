import type { BackendProvider } from './firebaseConfigCore'
import type {
  AttemptEvent,
  LessonId,
  LessonProgress,
  SkillId,
  SkillMastery,
  SkillPracticeState,
  StorySession,
  UserProfile,
} from './domain'

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

// The per-user Story Mode practice store: one document per skill at practice/{uid}/skills/{skillId},
// mirroring the mastery layout (small payload, read/written whole, transactional update).
export const firebasePracticePath = (uid: string, skillId: SkillId) =>
  `practice/${assertSafeDocumentId(uid, 'uid')}/skills/${assertSafeDocumentId(skillId, 'skillId')}`

export const firebaseAttemptPath = (uid: string, attemptId: string) =>
  `attempts/${assertSafeDocumentId(uid, 'uid')}/events/${assertSafeDocumentId(attemptId, 'attemptId')}`

// The per-user Story parent document at story/{uid}. In schema v2 it holds the active-session
// POINTER ({ userId, activeSessionId }); under the legacy schema it held the single session doc,
// which the reader migrates into the sessions subcollection below.
export const firebaseStoryPath = (uid: string) => `story/${assertSafeDocumentId(uid, 'uid')}`

// The per-user saved-stories collection: one whole session document per id at
// story/{uid}/sessions/{sessionId} (small payload, read/written whole), mirroring progress docs.
export const firebaseStorySessionPath = (uid: string, sessionId: string) =>
  `story/${assertSafeDocumentId(uid, 'uid')}/sessions/${assertSafeDocumentId(sessionId, 'sessionId')}`

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

export const toFirestoreSkillPracticeState = (
  uid: string,
  practice: SkillPracticeState,
): SkillPracticeState => ({
  ...practice,
  userId: uid,
})

export const toFirestoreAttemptEvent = (uid: string, event: AttemptEvent): AttemptEvent => ({
  ...event,
  userId: uid,
})

// Stamp the authenticated uid onto the session so a payload can never persist story data under
// a different user id (mirrors `toFirestoreLessonProgress`). Read back via `normalizeStorySession`.
export const toFirestoreStorySession = (uid: string, session: StorySession): StorySession => ({
  ...session,
  userId: uid,
})

// The active-session pointer document body written to story/{uid}. Carries the authenticated uid
// (so the `writesUserId` rule guard passes) and the chosen session id (null clears the pointer).
export const toFirestoreStoryPointer = (
  uid: string,
  activeSessionId: string | null,
): { userId: string; activeSessionId: string | null } => ({
  userId: uid,
  activeSessionId,
})
