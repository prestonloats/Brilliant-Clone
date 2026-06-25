import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { createAttemptEvent, createBackend, LocalBackend, type Backend } from '../src/backend'
import type { AttemptEvent, LessonProgress, LessonScore, SkillMastery } from '../src/domain'
import {
  getBackendProviderFromEnv,
  getFirebaseConfigFromEnv,
  getMissingFirebaseEnvKeysFromEnv,
} from '../src/firebaseConfigCore'
import {
  assertVerifiedEmailForWrite,
  EMAIL_VERIFICATION_REQUIRED_MESSAGE,
  firebaseAttemptPath,
  firebaseMasteryPath,
  firebaseProgressPath,
  firebaseUserPath,
  isEmailVerificationRequired,
  requireMatchingUserId,
  toFirestoreAttemptEvent,
  toFirestoreLessonProgress,
  toFirestoreSkillMastery,
  toFirestoreUserProfile,
} from '../src/firebaseBackendCore'
import {
  getSessionStorage,
  installLocalStorage,
  MemoryStorage,
  SESSION_KEY,
  setActiveUser,
  STORAGE_KEY,
} from './helpers/localStorage'
import { lessonProgress } from './helpers/fixtures'

let storage: MemoryStorage

const lessonScore = (scorePercent = 80): LessonScore => ({
  scorePercent,
  correctFirstTryCount: 4,
  assessedStepCount: 5,
  completedAt: '2026-06-23T00:02:00.000Z',
})

const skillMastery = (userId: string): SkillMastery => ({
  userId,
  skillId: 'equality',
  score: 1,
  attempts: 1,
  correct: 1,
  lastPracticedAt: '2026-06-23T00:00:00.000Z',
})

const attemptEvent = (userId: string): AttemptEvent => ({
  id: `attempt-${userId}`,
  userId,
  lessonId: 'balancing-equations',
  stepId: 'input-box-value',
  correct: true,
  attemptCount: 1,
  msToAnswer: 1200,
  at: '2026-06-23T00:00:00.000Z',
})

beforeEach(() => {
  storage = installLocalStorage()
})

test('local auth signs up, logs in, and logs out', () => {
  const backend = new LocalBackend()

  const user = backend.auth.signUp({
    email: ' learner@example.com ',
    displayName: ' Learner One ',
  })

  assert.equal(user.email, 'learner@example.com')
  assert.equal(user.displayName, 'Learner One')
  assert.equal(backend.auth.getCurrentUser()?.id, user.id)

  backend.auth.signOut()
  assert.equal(backend.auth.getCurrentUser(), null)

  const signedIn = backend.auth.signIn('learner@example.com')
  assert.equal(signedIn.id, user.id)
})

test('local auth does not persist plaintext passwords', () => {
  const backend = new LocalBackend()

  backend.auth.signUp({
    email: 'learner@example.com',
    password: 'real-password-that-local-mode-must-ignore',
    displayName: 'Learner',
  })

  const raw = storage.getItem(STORAGE_KEY)
  assert.ok(raw)
  assert.doesNotMatch(raw, /real-password-that-local-mode-must-ignore/)
  assert.doesNotMatch(raw, /"password"/)
})

test('local auth keeps the active session out of persistent storage', () => {
  const backend = new LocalBackend()

  const user = backend.auth.signUp({
    email: 'learner@example.com',
    displayName: 'Learner',
  })

  assert.equal(backend.auth.getCurrentUser()?.id, user.id)
  assert.doesNotMatch(storage.getItem(STORAGE_KEY) ?? '', /currentUserId/)
  assert.equal(getSessionStorage().getItem(SESSION_KEY), user.id)

  backend.auth.signOut()
  assert.equal(getSessionStorage().getItem(SESSION_KEY), null)
})

test('local auth normalizes email for resume and duplicate checks', () => {
  const backend = new LocalBackend()

  const user = backend.auth.signUp({
    email: ' Learner@Example.COM ',
    displayName: 'Learner',
  })

  backend.auth.signOut()

  assert.equal(backend.auth.signIn(' LEARNER@example.com ').id, user.id)
  assert.throws(
    () =>
      backend.auth.signUp({
        email: 'learner@EXAMPLE.com',
        displayName: 'Duplicate',
      }),
    /already exists/i,
  )
})

test('local auth rejects invalid sign-up input with clear errors', () => {
  const backend = new LocalBackend()

  assert.throws(
    () => backend.auth.signUp({ email: ' ', displayName: 'Learner' }),
    /email is required/i,
  )
  assert.throws(
    () => backend.auth.signUp({ email: 'learner', displayName: 'Learner' }),
    /valid email/i,
  )
  assert.throws(
    () => backend.auth.signUp({ email: 'learner@example.com', displayName: ' ' }),
    /display name is required/i,
  )

  assert.equal(backend.auth.getCurrentUser(), null)
})

test('local auth rejects missing demo profiles without changing session', () => {
  const backend = new LocalBackend()
  const user = backend.auth.signUp({
    email: 'learner@example.com',
    displayName: 'Learner',
  })

  assert.throws(() => backend.auth.signIn('missing@example.com'), /no local demo profile/i)
  assert.equal(backend.auth.getCurrentUser()?.id, user.id)

  backend.auth.signOut()

  assert.throws(() => backend.auth.signIn('missing@example.com'), /no local demo profile/i)
  assert.equal(backend.auth.getCurrentUser(), null)
})

test('backend provider selection fails closed for firebase mode', () => {
  const localBackend = new LocalBackend()
  const fakeFirebaseBackend: Backend = {
    provider: 'firebase',
    auth: localBackend.auth,
    progress: localBackend.progress,
    mastery: localBackend.mastery,
    attempts: localBackend.attempts,
  }

  assert.equal(getBackendProviderFromEnv(undefined), 'local')
  assert.equal(getBackendProviderFromEnv('local'), 'local')
  assert.equal(getBackendProviderFromEnv('firebase'), 'firebase')
  assert.throws(() => getBackendProviderFromEnv('supabase'), /local.*firebase/i)
  assert.throws(() => createBackend('firebase'), /refused to fall back to local mode/i)
  assert.throws(
    () => createBackend('firebase', { firebaseBackend: localBackend }),
    /refused to fall back to local mode/i,
  )
  assert.equal(createBackend('firebase', { firebaseBackend: fakeFirebaseBackend }).provider, 'firebase')
})

test('firebase config validation reports missing keys without live Firebase', () => {
  assert.deepEqual(getMissingFirebaseEnvKeysFromEnv({}), [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ])
  assert.equal(
    getFirebaseConfigFromEnv({
      VITE_FIREBASE_API_KEY: 'api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'project-id',
      VITE_FIREBASE_STORAGE_BUCKET: 'project-id.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'sender',
      VITE_FIREBASE_APP_ID: 'app-id',
    })?.projectId,
    'project-id',
  )
  assert.equal(getFirebaseConfigFromEnv({ VITE_FIREBASE_PROJECT_ID: 'project-id' }), null)
})

test('firebase path helpers derive user-scoped Firestore document paths', () => {
  assert.equal(firebaseUserPath('uid-1'), 'users/uid-1')
  assert.equal(
    firebaseProgressPath('uid-1', 'balancing-equations'),
    'progress/uid-1/lessons/balancing-equations',
  )
  assert.equal(firebaseMasteryPath('uid-1', 'equality'), 'mastery/uid-1/skills/equality')
  assert.equal(firebaseAttemptPath('uid-1', 'attempt-1'), 'attempts/uid-1/events/attempt-1')
  assert.throws(() => firebaseUserPath('bad/uid'), /document id segment/i)
  assert.throws(() => firebaseAttemptPath('uid-1', 'bad/attempt'), /document id segment/i)
})

test('firebase serializers overwrite payload user ids with authenticated uid', () => {
  const uid = 'auth-uid'

  assert.equal(toFirestoreUserProfile(uid, {
    id: 'payload-user',
    email: 'learner@example.com',
    displayName: 'Learner',
    createdAt: '2026-06-23T00:00:00.000Z',
  }).id, uid)
  assert.equal(toFirestoreLessonProgress(uid, lessonProgress('payload-user')).userId, uid)
  assert.equal(toFirestoreSkillMastery(uid, skillMastery('payload-user')).userId, uid)
  assert.equal(toFirestoreAttemptEvent(uid, attemptEvent('payload-user')).userId, uid)
})

test('firebase user guard rejects cross-user repository requests', () => {
  assert.equal(requireMatchingUserId('uid-1', 'uid-1'), 'uid-1')
  assert.throws(() => requireMatchingUserId(null, 'uid-1'), /sign in/i)
  assert.throws(() => requireMatchingUserId('uid-1', 'uid-2'), /different authenticated user/i)
})

test('firebase write guard requires a verified email', () => {
  assert.doesNotThrow(() => assertVerifiedEmailForWrite(true))
  assert.throws(() => assertVerifiedEmailForWrite(false), /verify your email/i)
  assert.throws(() => assertVerifiedEmailForWrite(undefined), /verify your email/i)
  assert.match(EMAIL_VERIFICATION_REQUIRED_MESSAGE, /verify/i)
})

test('email verification gating only applies to unverified firebase users', () => {
  assert.equal(isEmailVerificationRequired('firebase', false), true)
  assert.equal(isEmailVerificationRequired('firebase', undefined), true)
  assert.equal(isEmailVerificationRequired('firebase', true), false)
  assert.equal(isEmailVerificationRequired('local', false), false)
  assert.equal(isEmailVerificationRequired('local', undefined), false)
  assert.equal(isEmailVerificationRequired('local', true), false)
})

test('firebase user serializer drops transient email verification state', () => {
  const stored = toFirestoreUserProfile('auth-uid', {
    id: 'payload-user',
    email: 'learner@example.com',
    displayName: 'Learner',
    emailVerified: true,
    createdAt: '2026-06-23T00:00:00.000Z',
  })

  assert.equal(stored.id, 'auth-uid')
  assert.equal('emailVerified' in stored, false)
})

test('local demo accounts are always verified so local writes are never gated', () => {
  const backend = new LocalBackend()

  const user = backend.auth.signUp({ email: 'learner@example.com', displayName: 'Learner' })

  assert.equal(user.emailVerified, true)
  assert.equal(backend.auth.getCurrentUser()?.emailVerified, true)
  assert.equal(isEmailVerificationRequired(backend.provider, user.emailVerified), false)
})

test('local resend verification is a no-op and reload mirrors the active profile', () => {
  const backend = new LocalBackend()
  const user = backend.auth.signUp({ email: 'learner@example.com', displayName: 'Learner' })

  assert.doesNotThrow(() => backend.auth.resendEmailVerification())
  assert.equal(backend.auth.reloadCurrentUser()?.id, user.id)

  backend.auth.signOut()
  assert.equal(backend.auth.reloadCurrentUser(), null)
})

test('local progress saves and resumes by user and lesson', () => {
  const backend = new LocalBackend()
  const saved = lessonProgress('user-1')
  setActiveUser('user-1')

  backend.progress.saveLessonProgress(saved)

  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), saved)
  setActiveUser('user-2')
  assert.equal(backend.progress.getLessonProgress('user-2', 'balancing-equations'), null)
  setActiveUser('user-1')
  assert.equal(backend.progress.getLessonProgress('user-1', 'one-step-equations'), null)
})

test('local progress persists lesson score history', () => {
  const backend = new LocalBackend()
  const latestScore = lessonScore(80)
  const bestScore = lessonScore(100)
  const saved: LessonProgress = {
    ...lessonProgress('user-1', 7),
    status: 'completed',
    latestScore,
    bestScore,
    completionHistory: [latestScore, bestScore],
    completedAt: latestScore.completedAt,
  }
  setActiveUser('user-1')

  backend.progress.saveLessonProgress(saved)

  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), saved)
})

test('local mastery counts correct and incorrect attempts', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  const first = backend.mastery.updateSkillMastery('user-1', 'equality', true)

  assert.equal(first.userId, 'user-1')
  assert.equal(first.skillId, 'equality')
  assert.equal(first.score, 1)
  assert.equal(first.attempts, 1)
  assert.equal(first.correct, 1)
  assert.equal(typeof first.lastPracticedAt, 'string')

  const updated = backend.mastery.updateSkillMastery('user-1', 'equality', false)

  assert.equal(updated.attempts, 2)
  assert.equal(updated.correct, 1)
  assert.equal(updated.score, 0.5)
  setActiveUser('user-2')
  assert.deepEqual(backend.mastery.getUserMastery('user-2'), [])
})

test('local mastery is isolated by user and skill with rounded scores', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  backend.mastery.updateSkillMastery('user-1', 'equality', true)
  backend.mastery.updateSkillMastery('user-1', 'equality', false)
  const userOneEquality = backend.mastery.updateSkillMastery('user-1', 'equality', true)
  const userOneInverse = backend.mastery.updateSkillMastery('user-1', 'inverse-operations', false)
  setActiveUser('user-2')
  const userTwoEquality = backend.mastery.updateSkillMastery('user-2', 'equality', true)

  assert.equal(userOneEquality.attempts, 3)
  assert.equal(userOneEquality.correct, 2)
  assert.equal(userOneEquality.score, 0.67)
  assert.equal(userOneInverse.score, 0)
  assert.equal(userTwoEquality.score, 1)
  setActiveUser('user-1')
  assert.deepEqual(
    backend.mastery.getUserMastery('user-1').map((item) => item.skillId).sort(),
    ['equality', 'inverse-operations'],
  )
  setActiveUser('user-2')
  assert.deepEqual(
    backend.mastery.getUserMastery('user-2').map((item) => item.skillId),
    ['equality'],
  )
})

test('local attempts are recorded and filtered by user', () => {
  const backend = new LocalBackend()
  const first = createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', true, 1, 1200)
  const second = createAttemptEvent('user-2', 'balancing-equations', 'input-box-value', false, 2, 1800)

  setActiveUser('user-1')
  backend.attempts.recordAttempt(first)
  setActiveUser('user-2')
  backend.attempts.recordAttempt(second)

  setActiveUser('user-1')
  assert.deepEqual(backend.attempts.getAttempts('user-1'), [first])
})

test('local repositories reject access for non-active users', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.throws(
    () => backend.progress.saveLessonProgress(lessonProgress('user-2')),
    /sign in with this local demo profile/i,
  )
  assert.throws(
    () => backend.mastery.updateSkillMastery('user-2', 'equality', true),
    /sign in with this local demo profile/i,
  )
  assert.throws(
    () => backend.attempts.recordAttempt(attemptEvent('user-2')),
    /sign in with this local demo profile/i,
  )
})

test('local backend recovers from corrupt localStorage without crashing', () => {
  storage.setItem(STORAGE_KEY, '{this is not json')

  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.equal(backend.auth.getCurrentUser(), null)
  assert.deepEqual(backend.attempts.getAttempts('user-1'), [])
  assert.doesNotThrow(() => backend.progress.saveLessonProgress(lessonProgress('user-1')))
})

test('local backend ignores malformed persisted collections', () => {
  const validUser = {
    id: 'user-1',
    email: 'learner@example.com',
    displayName: 'Learner',
    password: 'secret',
    createdAt: '2026-06-23T00:00:00.000Z',
  }
  const progress = lessonProgress('user-1')
  const mastery = skillMastery('user-1')
  const attempt = attemptEvent('user-1')

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      currentUserId: 'missing-user',
      users: {
        'bad-user': { id: 'bad-user' },
        'user-1': validUser,
      },
      progress: {
        bad: { userId: 'user-1' },
        'user-1:balancing-equations': progress,
      },
      mastery: {
        bad: { userId: 'user-1' },
        'user-1:equality': mastery,
      },
      attempts: [{ id: 'bad-attempt' }, attempt],
    }),
  )

  const backend = new LocalBackend()

  assert.equal(backend.auth.getCurrentUser(), null)
  assert.equal(backend.auth.signIn('learner@example.com').id, 'user-1')
  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), progress)
  assert.deepEqual(backend.mastery.getUserMastery('user-1'), [mastery])
  assert.deepEqual(backend.attempts.getAttempts('user-1'), [attempt])
  assert.doesNotMatch(storage.getItem(STORAGE_KEY) ?? '', /"password"/)
})

test('local backend ignores malformed persisted progress records', () => {
  const valid = lessonProgress('user-5')

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      users: {},
      progress: {
        'user-1:balancing-equations': {
          ...lessonProgress('user-1'),
          currentStepIndex: '2',
        },
        'user-2:balancing-equations': {
          ...lessonProgress('user-2'),
          currentStepIndex: 999,
        },
        'user-3:balancing-equations': {
          ...lessonProgress('user-3'),
          status: 'done',
        },
        'user-4:balancing-equations': {
          ...lessonProgress('user-4'),
          lessonId: 'missing-lesson',
        },
        'user-5:balancing-equations': valid,
      },
      mastery: {},
      attempts: [],
    }),
  )

  const backend = new LocalBackend()

  setActiveUser('user-1')
  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), null)
  setActiveUser('user-2')
  assert.deepEqual(backend.progress.getLessonProgress('user-2', 'balancing-equations'), null)
  setActiveUser('user-3')
  assert.deepEqual(backend.progress.getLessonProgress('user-3', 'balancing-equations'), null)
  setActiveUser('user-4')
  assert.deepEqual(backend.progress.getLessonProgress('user-4', 'balancing-equations'), null)
  setActiveUser('user-5')
  assert.deepEqual(backend.progress.getLessonProgress('user-5', 'balancing-equations'), valid)
  assert.doesNotThrow(() => backend.progress.saveLessonProgress(valid))
  assert.deepEqual(backend.progress.getLessonProgress('user-5', 'balancing-equations'), valid)
})

test('local backend sanitizes malformed persisted lesson scores', () => {
  const bestScore = lessonScore(100)
  const progress = {
    ...lessonProgress('user-1'),
    status: 'completed',
    latestScore: {
      scorePercent: 120,
      correctFirstTryCount: 6,
      assessedStepCount: 5,
      completedAt: '2026-06-23T00:02:00.000Z',
    },
    bestScore,
    completionHistory: [
      lessonScore(80),
      {
        scorePercent: 90,
        correctFirstTryCount: -1,
        assessedStepCount: 5,
        completedAt: '2026-06-23T00:03:00.000Z',
      },
    ],
    completedAt: '2026-06-23T00:02:00.000Z',
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      users: {},
      progress: {
        'user-1:balancing-equations': progress,
      },
      mastery: {},
      attempts: [],
    }),
  )

  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), {
    ...lessonProgress('user-1'),
    status: 'completed',
    bestScore,
    completionHistory: [lessonScore(80)],
    completedAt: '2026-06-23T00:02:00.000Z',
  })
})

test('local backend sanitizes malformed persisted step results', () => {
  const progress = {
    ...lessonProgress('user-1'),
    stepResults: {
      'input-box-value': {
        correct: true,
        attempts: 1,
        feedback: 'Yes.',
      },
      'missing-step': {
        correct: true,
        attempts: 1,
        feedback: 'No matching lesson step.',
      },
      'concept-balance': {
        correct: true,
        attempts: -1,
        feedback: 'Invalid attempts.',
      },
      'predict-add-left': {
        correct: 'yes',
        attempts: 1,
        feedback: 'Invalid correct flag.',
      },
    },
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      users: {},
      progress: {
        'user-1:balancing-equations': progress,
      },
      mastery: {},
      attempts: [],
    }),
  )

  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), {
    ...lessonProgress('user-1'),
    stepResults: {
      'input-box-value': {
        correct: true,
        attempts: 1,
        feedback: 'Yes.',
      },
    },
  })
})
