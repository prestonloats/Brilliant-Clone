import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { createAttemptEvent, LocalBackend } from '../src/backend'
import type { AttemptEvent, LessonProgress, SkillMastery } from '../src/domain'

const STORAGE_KEY = 'balance-local-backend-v1'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

let storage: MemoryStorage

const installLocalStorage = () => {
  const nextStorage = new MemoryStorage()

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: nextStorage },
    configurable: true,
    writable: true,
  })

  return nextStorage
}

const lessonProgress = (userId: string, currentStepIndex = 2): LessonProgress => ({
  userId,
  lessonId: 'balancing-equations',
  status: 'inProgress',
  currentStepIndex,
  stepResults: {
    'input-box-value': {
      correct: true,
      attempts: 1,
      feedback: 'Yes.',
    },
  },
  startedAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:01:00.000Z',
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
    password: 'secret',
    displayName: ' Learner One ',
  })

  assert.equal(user.email, 'learner@example.com')
  assert.equal(user.displayName, 'Learner One')
  assert.equal(backend.auth.getCurrentUser()?.id, user.id)

  backend.auth.signOut()
  assert.equal(backend.auth.getCurrentUser(), null)

  const signedIn = backend.auth.signIn('learner@example.com', 'secret')
  assert.equal(signedIn.id, user.id)
})

test('local auth normalizes email for login and duplicate checks', () => {
  const backend = new LocalBackend()

  const user = backend.auth.signUp({
    email: ' Learner@Example.COM ',
    password: 'secret',
    displayName: 'Learner',
  })

  backend.auth.signOut()

  assert.equal(backend.auth.signIn(' LEARNER@example.com ', 'secret').id, user.id)
  assert.throws(
    () =>
      backend.auth.signUp({
        email: 'learner@EXAMPLE.com',
        password: 'secret',
        displayName: 'Duplicate',
      }),
    /already exists/i,
  )
})

test('local auth rejects invalid sign-up input with clear errors', () => {
  const backend = new LocalBackend()

  assert.throws(
    () => backend.auth.signUp({ email: ' ', password: 'secret', displayName: 'Learner' }),
    /email is required/i,
  )
  assert.throws(
    () => backend.auth.signUp({ email: 'learner', password: 'secret', displayName: 'Learner' }),
    /valid email/i,
  )
  assert.throws(
    () => backend.auth.signUp({ email: 'learner@example.com', password: 'secret', displayName: ' ' }),
    /display name is required/i,
  )
  assert.throws(
    () => backend.auth.signUp({ email: 'learner@example.com', password: ' ', displayName: 'Learner' }),
    /password is required/i,
  )
  assert.throws(
    () => backend.auth.signUp({ email: 'learner@example.com', password: '12345', displayName: 'Learner' }),
    /at least 6 characters/i,
  )

  assert.equal(backend.auth.getCurrentUser(), null)
})

test('local auth rejects bad sign-in credentials without changing session', () => {
  const backend = new LocalBackend()
  const user = backend.auth.signUp({
    email: 'learner@example.com',
    password: 'secret',
    displayName: 'Learner',
  })

  assert.throws(() => backend.auth.signIn('learner@example.com', 'wrong-password'), /check your email and password/i)
  assert.equal(backend.auth.getCurrentUser()?.id, user.id)

  backend.auth.signOut()

  assert.throws(() => backend.auth.signIn('missing@example.com', 'secret'), /check your email and password/i)
  assert.equal(backend.auth.getCurrentUser(), null)
})

test('local progress saves and resumes by user and lesson', () => {
  const backend = new LocalBackend()
  const saved = lessonProgress('user-1')

  backend.progress.saveLessonProgress(saved)

  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), saved)
  assert.equal(backend.progress.getLessonProgress('user-2', 'balancing-equations'), null)
  assert.equal(backend.progress.getLessonProgress('user-1', 'one-step-equations'), null)
})

test('local mastery counts correct and incorrect attempts', () => {
  const backend = new LocalBackend()

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
  assert.deepEqual(backend.mastery.getUserMastery('user-2'), [])
})

test('local mastery is isolated by user and skill with rounded scores', () => {
  const backend = new LocalBackend()

  backend.mastery.updateSkillMastery('user-1', 'equality', true)
  backend.mastery.updateSkillMastery('user-1', 'equality', false)
  const userOneEquality = backend.mastery.updateSkillMastery('user-1', 'equality', true)
  const userOneInverse = backend.mastery.updateSkillMastery('user-1', 'inverse-operations', false)
  const userTwoEquality = backend.mastery.updateSkillMastery('user-2', 'equality', true)

  assert.equal(userOneEquality.attempts, 3)
  assert.equal(userOneEquality.correct, 2)
  assert.equal(userOneEquality.score, 0.67)
  assert.equal(userOneInverse.score, 0)
  assert.equal(userTwoEquality.score, 1)
  assert.deepEqual(
    backend.mastery.getUserMastery('user-1').map((item) => item.skillId).sort(),
    ['equality', 'inverse-operations'],
  )
  assert.deepEqual(
    backend.mastery.getUserMastery('user-2').map((item) => item.skillId),
    ['equality'],
  )
})

test('local attempts are recorded and filtered by user', () => {
  const backend = new LocalBackend()
  const first = createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', true, 1, 1200)
  const second = createAttemptEvent('user-2', 'balancing-equations', 'input-box-value', false, 2, 1800)

  backend.attempts.recordAttempt(first)
  backend.attempts.recordAttempt(second)

  assert.deepEqual(backend.attempts.getAttempts('user-1'), [first])
})

test('local backend recovers from corrupt localStorage without crashing', () => {
  storage.setItem(STORAGE_KEY, '{this is not json')

  const backend = new LocalBackend()

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
  assert.equal(backend.auth.signIn('learner@example.com', 'secret').id, 'user-1')
  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), progress)
  assert.deepEqual(backend.mastery.getUserMastery('user-1'), [mastery])
  assert.deepEqual(backend.attempts.getAttempts('user-1'), [attempt])
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

  assert.deepEqual(backend.progress.getLessonProgress('user-1', 'balancing-equations'), null)
  assert.deepEqual(backend.progress.getLessonProgress('user-2', 'balancing-equations'), null)
  assert.deepEqual(backend.progress.getLessonProgress('user-3', 'balancing-equations'), null)
  assert.deepEqual(backend.progress.getLessonProgress('user-4', 'balancing-equations'), null)
  assert.deepEqual(backend.progress.getLessonProgress('user-5', 'balancing-equations'), valid)
  assert.doesNotThrow(() => backend.progress.saveLessonProgress(valid))
  assert.deepEqual(backend.progress.getLessonProgress('user-5', 'balancing-equations'), valid)
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
