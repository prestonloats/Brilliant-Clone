import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  type Firestore,
} from 'firebase/firestore'

import {
  isAttemptEvent,
  isSkillMastery,
  isSkillPracticeState,
  legacyStorySessionId,
  normalizeLessonProgress,
  normalizeStorySession,
  normalizeUserProfile,
  validateDisplayNameInput,
  validateSignUpInput,
  type Backend,
  type SignUpInput,
} from './backend'
import { PASSWORD_MIN_LENGTH } from './authValidation'
import type {
  AttemptEvent,
  LessonId,
  LessonProgress,
  PracticeOutcome,
  SkillId,
  SkillMastery,
  SkillPracticeState,
  StorySession,
  UserProfile,
} from './domain'
import { applyMasteryOutcome, emptySkillMastery } from './engine/practice/applyMasteryOutcome'
import { applyPracticeOutcome } from './engine/practice/applyOutcome'
import { createInitialPracticeState } from './engine/practice/mastery'
import {
  assertVerifiedEmailForWrite,
  firebaseAttemptPath,
  firebaseMasteryPath,
  firebasePracticePath,
  firebaseProgressPath,
  firebaseStoryPath,
  firebaseStorySessionPath,
  firebaseUserPath,
  requireMatchingUserId,
  toFirestoreAttemptEvent,
  toFirestoreLessonProgress,
  toFirestoreSkillMastery,
  toFirestoreSkillPracticeState,
  toFirestoreStoryPointer,
  toFirestoreStorySession,
  toFirestoreUserProfile,
} from './firebaseBackendCore'
import type { FirebaseServices } from './firebaseServices'

const requireFirebasePassword = (password: string | undefined) => {
  if (!password) {
    throw new Error('Password is required for Firebase authentication.')
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Firebase passwords must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  }

  return password
}

const createdAtFromFirebaseUser = (user: User) => {
  const createdAt = user.metadata.creationTime ? new Date(user.metadata.creationTime) : new Date()
  return Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString()
}

const profileFromFirebaseUser = (user: User, displayNameFallback?: string): UserProfile => {
  if (!user.email) {
    throw new Error('Firebase account is missing an email address.')
  }

  return {
    id: user.uid,
    email: user.email,
    displayName: user.displayName || displayNameFallback || user.email.split('@')[0] || 'Learner',
    ...(user.photoURL ? { avatarUrl: user.photoURL } : {}),
    emailVerified: user.emailVerified,
    createdAt: createdAtFromFirebaseUser(user),
  }
}

export class FirebaseBackend implements Backend {
  readonly provider = 'firebase'
  private readonly firebaseAuth: Auth
  private readonly firestore: Firestore

  constructor(services: FirebaseServices) {
    this.firebaseAuth = services.auth
    this.firestore = services.db
  }

  auth = {
    getCurrentUser: async () => {
      await this.waitForAuthReady()
      const user = this.firebaseAuth.currentUser
      return user ? this.getOrCreateUserProfile(user) : null
    },
    signUp: async (input: SignUpInput) => {
      const { email, displayName } = validateSignUpInput(input)
      const password = requireFirebasePassword(input.password)
      const credential = await createUserWithEmailAndPassword(this.firebaseAuth, email, password)

      await updateProfile(credential.user, { displayName })
      // Verify email ownership before the account can save course data. Best-effort so a
      // failed send does not strand a created account; the verify screen offers a resend.
      await this.sendVerificationEmail(credential.user)

      const profile = profileFromFirebaseUser(credential.user, displayName)
      await setDoc(
        doc(this.firestore, firebaseUserPath(credential.user.uid)),
        toFirestoreUserProfile(credential.user.uid, profile),
      )

      return profile
    },
    signIn: async (email: string, password?: string) => {
      const credential = await signInWithEmailAndPassword(
        this.firebaseAuth,
        email.trim().toLowerCase(),
        requireFirebasePassword(password),
      )

      return this.getOrCreateUserProfile(credential.user)
    },
    signOut: async () => {
      await firebaseSignOut(this.firebaseAuth)
    },
    resendEmailVerification: async () => {
      await this.waitForAuthReady()
      const user = this.firebaseAuth.currentUser
      if (!user) {
        throw new Error('Sign in before requesting another verification email.')
      }
      if (user.emailVerified) return

      await sendEmailVerification(user)
    },
    reloadCurrentUser: async () => {
      await this.waitForAuthReady()
      const user = this.firebaseAuth.currentUser
      if (!user) return null

      await user.reload()
      const refreshed = this.firebaseAuth.currentUser
      if (!refreshed) return null

      // Refresh the ID token so the `email_verified` claim used by Firestore rules is current.
      if (refreshed.emailVerified) {
        await refreshed.getIdToken(true)
      }

      return this.getOrCreateUserProfile(refreshed)
    },
    updateDisplayName: async (name: string) => {
      // Validate/sanitize before touching Auth or Firestore so a bad name fails fast.
      const displayName = validateDisplayNameInput(name)
      await this.waitForAuthReady()
      const user = this.firebaseAuth.currentUser
      if (!user) {
        throw new Error('Sign in before updating your display name.')
      }

      // Same owner + verified-email guard as every other user-scoped write.
      const uid = await this.requireVerifiedUid(user.uid)
      await updateProfile(user, { displayName })

      // Pin the validated name onto the profile (authoritative over the live Auth field) and
      // persist it to users/{uid}, matching how sign-up / getOrCreate store the profile doc.
      const profile: UserProfile = { ...profileFromFirebaseUser(user), displayName }
      await setDoc(doc(this.firestore, firebaseUserPath(uid)), toFirestoreUserProfile(uid, profile), {
        merge: true,
      })

      return profile
    },
  }

  progress = {
    getLessonProgress: async (userId: string, lessonId: LessonId) => {
      const uid = await this.requireActiveUid(userId)
      const snapshot = await getDoc(doc(this.firestore, firebaseProgressPath(uid, lessonId)))
      if (!snapshot.exists()) return null

      const progress = normalizeLessonProgress(snapshot.data())
      return progress?.userId === uid ? progress : null
    },
    saveLessonProgress: async (progress: LessonProgress) => {
      const uid = await this.requireVerifiedUid(progress.userId)
      await setDoc(
        doc(this.firestore, firebaseProgressPath(uid, progress.lessonId)),
        toFirestoreLessonProgress(uid, progress),
      )
    },
  }

  mastery = {
    getUserMastery: async (userId: string) => {
      const uid = await this.requireActiveUid(userId)
      const snapshot = await getDocs(collection(this.firestore, 'mastery', uid, 'skills'))

      return snapshot.docs
        .map((item) => item.data())
        .filter((item): item is SkillMastery => isSkillMastery(item) && item.userId === uid)
    },
    updateSkillMastery: async (userId: string, skillId: SkillId, correct: boolean) => {
      const uid = await this.requireVerifiedUid(userId)
      const masteryRef = doc(this.firestore, firebaseMasteryPath(uid, skillId))

      return runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(masteryRef)
        const current = snapshot.exists() ? snapshot.data() : null
        const now = new Date().toISOString()
        const existing =
          isSkillMastery(current) && current.userId === uid && current.skillId === skillId
            ? current
            : emptySkillMastery(uid, skillId, now)
        const updated = applyMasteryOutcome(existing, correct, now)

        transaction.set(masteryRef, toFirestoreSkillMastery(uid, updated))
        return updated
      })
    },
  }

  practice = {
    getUserPractice: async (userId: string) => {
      const uid = await this.requireActiveUid(userId)
      const snapshot = await getDocs(collection(this.firestore, 'practice', uid, 'skills'))

      return snapshot.docs
        .map((item) => item.data())
        .filter((item): item is SkillPracticeState => isSkillPracticeState(item) && item.userId === uid)
    },
    // Transactional read-modify-write of ONE skill's practice state, mirroring updateSkillMastery
    // but delegating the math to the shared pure `applyPracticeOutcome` (no duplicated formula).
    updatePractice: async (userId: string, skillId: SkillId, outcome: PracticeOutcome) => {
      const uid = await this.requireVerifiedUid(userId)
      const practiceRef = doc(this.firestore, firebasePracticePath(uid, skillId))

      return runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(practiceRef)
        const current = snapshot.exists() ? snapshot.data() : null
        const existing =
          isSkillPracticeState(current) && current.userId === uid && current.skillId === skillId
            ? current
            : createInitialPracticeState(uid, skillId, outcome.at)

        const updated = applyPracticeOutcome(existing, outcome)
        transaction.set(practiceRef, toFirestoreSkillPracticeState(uid, updated))
        return updated
      })
    },
  }

  attempts = {
    recordAttempt: async (event: AttemptEvent) => {
      const uid = await this.requireVerifiedUid(event.userId)
      const attemptRef = doc(this.firestore, firebaseAttemptPath(uid, event.id))

      await runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(attemptRef)
        if (snapshot.exists()) {
          throw new Error('Attempt events are append-only and cannot overwrite an existing event.')
        }

        transaction.set(attemptRef, toFirestoreAttemptEvent(uid, event))
      })
    },
    getAttempts: async (userId: string) => {
      const uid = await this.requireActiveUid(userId)
      const snapshot = await getDocs(collection(this.firestore, 'attempts', uid, 'events'))

      return snapshot.docs
        .map((item) => item.data())
        .filter((item): item is AttemptEvent => isAttemptEvent(item) && item.userId === uid)
        .sort((first, second) => first.at.localeCompare(second.at))
    },
  }

  story = {
    // The saved-stories library: every session under story/{uid}/sessions. When the subcollection
    // is empty we fall back to a legacy single-session doc at story/{uid} and surface it migrated
    // (read-only in memory; the next save persists it into the subcollection, see saveStorySession).
    listStorySessions: async (userId: string) => {
      const uid = await this.requireActiveUid(userId)
      const snapshot = await getDocs(collection(this.firestore, 'story', uid, 'sessions'))
      const sessions = snapshot.docs
        .map((item) => normalizeStorySession(item.data(), item.id))
        .filter((session): session is StorySession => session !== null && session.userId === uid)
      if (sessions.length > 0) return sessions

      const legacy = await this.readLegacyStorySession(uid)
      return legacy ? [legacy] : []
    },
    getStorySession: async (userId: string, sessionId: string) => {
      const uid = await this.requireActiveUid(userId)
      const snapshot = await getDoc(doc(this.firestore, firebaseStorySessionPath(uid, sessionId)))
      if (snapshot.exists()) {
        const session = normalizeStorySession(snapshot.data(), sessionId)
        return session?.userId === uid ? session : null
      }
      // Migration fallback: a legacy single-session doc surfaces under its derived legacy id.
      const legacy = await this.readLegacyStorySession(uid)
      return legacy && legacy.id === sessionId ? legacy : null
    },
    saveStorySession: async (session: StorySession) => {
      const uid = await this.requireVerifiedUid(session.userId)
      // One whole document per session at story/{uid}/sessions/{id} (small payload, written
      // whole), matching how progress docs are written. The serializer stamps the authenticated
      // uid onto the payload; the stored id matches the path so the rules id-guard passes.
      await setDoc(
        doc(this.firestore, firebaseStorySessionPath(uid, session.id)),
        toFirestoreStorySession(uid, session),
      )
    },
    deleteStorySession: async (userId: string, sessionId: string) => {
      const uid = await this.requireVerifiedUid(userId)
      await deleteDoc(doc(this.firestore, firebaseStorySessionPath(uid, sessionId)))
      // A never-resumed legacy session still lives at the parent doc (not the subcollection), so
      // clear it to a null pointer for the delete to actually stick.
      if (sessionId === legacyStorySessionId(uid) && (await this.readLegacyStorySession(uid))) {
        await setDoc(doc(this.firestore, firebaseStoryPath(uid)), toFirestoreStoryPointer(uid, null))
      }
    },
    getActiveStorySessionId: async (userId: string) => {
      const uid = await this.requireActiveUid(userId)
      const snapshot = await getDoc(doc(this.firestore, firebaseStoryPath(uid)))
      if (!snapshot.exists()) return null

      const data = snapshot.data()
      const activeSessionId = (data as { activeSessionId?: unknown }).activeSessionId
      if (typeof activeSessionId === 'string') return activeSessionId
      // Legacy single-session doc: its migrated id is the active one until a pointer is written.
      const legacy = this.normalizeLegacyStoryDoc(data, uid)
      return legacy ? legacy.id : null
    },
    setActiveStorySessionId: async (userId: string, sessionId: string | null) => {
      const uid = await this.requireVerifiedUid(userId)
      // Overwrites story/{uid} with the pointer body. When migrating, this replaces any legacy
      // session data still living at the parent doc with the clean { userId, activeSessionId }.
      await setDoc(doc(this.firestore, firebaseStoryPath(uid)), toFirestoreStoryPointer(uid, sessionId))
    },
  }

  // Interpret the story/{uid} parent doc as a LEGACY single-session document, or null when it is
  // the new pointer doc / not a usable session. Used to migrate pre-library data on read.
  private normalizeLegacyStoryDoc(data: unknown, uid: string): StorySession | null {
    if (!data || typeof data !== 'object') return null
    // A new-shape pointer doc carries an `activeSessionId` key (string OR null once cleared); it
    // is never a legacy session. Checking key presence avoids misreading a cleared pointer.
    if ('activeSessionId' in data) return null
    const session = normalizeStorySession(data, legacyStorySessionId(uid))
    return session?.userId === uid ? session : null
  }

  private async readLegacyStorySession(uid: string): Promise<StorySession | null> {
    const snapshot = await getDoc(doc(this.firestore, firebaseStoryPath(uid)))
    if (!snapshot.exists()) return null
    return this.normalizeLegacyStoryDoc(snapshot.data(), uid)
  }

  private async waitForAuthReady() {
    await this.firebaseAuth.authStateReady()
  }

  private async sendVerificationEmail(user: User) {
    if (user.emailVerified) return

    try {
      await sendEmailVerification(user)
    } catch {
      // Best-effort: the account already exists and the verify screen offers a manual resend.
    }
  }

  private async requireActiveUid(requestedUserId: string) {
    await this.waitForAuthReady()
    return requireMatchingUserId(this.firebaseAuth.currentUser?.uid, requestedUserId)
  }

  private async requireVerifiedUid(requestedUserId: string) {
    await this.waitForAuthReady()
    const user = this.firebaseAuth.currentUser
    const uid = requireMatchingUserId(user?.uid, requestedUserId)
    assertVerifiedEmailForWrite(user?.emailVerified)
    return uid
  }

  private async getOrCreateUserProfile(user: User) {
    const userRef = doc(this.firestore, firebaseUserPath(user.uid))
    const snapshot = await getDoc(userRef)
    const storedProfile = snapshot.exists() ? normalizeUserProfile(snapshot.data()) : null

    if (storedProfile?.id === user.uid) {
      // `emailVerified` is not persisted, so always reflect the live Auth user state.
      return { ...storedProfile, emailVerified: user.emailVerified }
    }

    const profile = profileFromFirebaseUser(user)
    await setDoc(userRef, toFirestoreUserProfile(user.uid, profile), { merge: true })
    return profile
  }
}
