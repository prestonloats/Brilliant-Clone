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
  normalizeLessonProgress,
  normalizeUserProfile,
  validateSignUpInput,
  type Backend,
  type SignUpInput,
} from './backend'
import { PASSWORD_MIN_LENGTH } from './authValidation'
import type { AttemptEvent, LessonId, LessonProgress, SkillId, SkillMastery, UserProfile } from './domain'
import {
  assertVerifiedEmailForWrite,
  firebaseAttemptPath,
  firebaseMasteryPath,
  firebaseProgressPath,
  firebaseUserPath,
  requireMatchingUserId,
  toFirestoreAttemptEvent,
  toFirestoreLessonProgress,
  toFirestoreSkillMastery,
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
        const existing =
          isSkillMastery(current) && current.userId === uid && current.skillId === skillId
            ? current
            : ({
                userId: uid,
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
          userId: uid,
          skillId,
          score: Math.round((correctAttempts / attempts) * 100) / 100,
          attempts,
          correct: correctAttempts,
          lastPracticedAt: new Date().toISOString(),
        }

        transaction.set(masteryRef, toFirestoreSkillMastery(uid, updated))
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
