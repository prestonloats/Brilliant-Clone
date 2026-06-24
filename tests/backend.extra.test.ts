import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { createAttemptEvent, createBackend, LocalBackend } from '../src/backend'
import { installLocalStorage, MemoryStorage, setActiveUser, STORAGE_KEY } from './helpers/localStorage'

let storage: MemoryStorage

beforeEach(() => {
  storage = installLocalStorage()
})

test('createBackend("local") returns a working in-memory backend', () => {
  const backend = createBackend('local')
  assert.ok(backend instanceof LocalBackend)

  const user = backend.auth.signUp({ email: 'learner@example.com', displayName: 'Learner' })
  assert.equal(backend.auth.getCurrentUser()?.id, user.id)
  assert.equal(user.avatarUrl, undefined)
  assert.equal(typeof user.createdAt, 'string')
})

test('createAttemptEvent stamps unique ids and echoes its inputs', () => {
  const event = createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', false, 3, 950)

  assert.equal(event.userId, 'user-1')
  assert.equal(event.lessonId, 'balancing-equations')
  assert.equal(event.stepId, 'input-box-value')
  assert.equal(event.correct, false)
  assert.equal(event.attemptCount, 3)
  assert.equal(event.msToAnswer, 950)
  assert.match(event.id, /^attempt-/)
  assert.equal(typeof event.at, 'string')

  const ids = new Set(
    Array.from({ length: 100 }, () =>
      createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', true, 1, 1000).id,
    ),
  )
  assert.equal(ids.size, 100)
})

test('signing out without an active session is a safe no-op', () => {
  const backend = new LocalBackend()

  assert.doesNotThrow(() => backend.auth.signOut())
  assert.equal(backend.auth.getCurrentUser(), null)
})

test('local backend instances share the same window-backed storage and session', () => {
  const first = new LocalBackend()
  const user = first.auth.signUp({ email: 'learner@example.com', displayName: 'Learner' })

  const second = new LocalBackend()
  assert.equal(second.auth.getCurrentUser()?.id, user.id)
})

test('read repositories also reject access for non-active users', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.throws(
    () => backend.progress.getLessonProgress('user-2', 'balancing-equations'),
    /sign in with this local demo profile/i,
  )
  assert.throws(() => backend.mastery.getUserMastery('user-2'), /sign in with this local demo profile/i)
  assert.throws(() => backend.attempts.getAttempts('user-2'), /sign in with this local demo profile/i)
})

test('distinct profiles get separate ids and resume independently', () => {
  const backend = new LocalBackend()

  const learner = backend.auth.signUp({ email: 'a@example.com', displayName: 'Aaa' })
  backend.auth.signOut()
  const coach = backend.auth.signUp({ email: 'b@example.com', displayName: 'Bbb' })

  assert.notEqual(learner.id, coach.id)
  assert.equal(backend.auth.getCurrentUser()?.email, 'b@example.com')

  const raw = storage.getItem(STORAGE_KEY)
  assert.ok(raw)
  assert.equal(Object.keys((JSON.parse(raw) as { users: Record<string, unknown> }).users).length, 2)

  backend.auth.signOut()
  assert.equal(backend.auth.signIn('a@example.com').displayName, 'Aaa')
})

test('fresh users have empty mastery, attempt, and progress collections', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.deepEqual(backend.mastery.getUserMastery('user-1'), [])
  assert.deepEqual(backend.attempts.getAttempts('user-1'), [])
  assert.equal(backend.progress.getLessonProgress('user-1', 'balancing-equations'), null)
})

test('mastery score is rounded to two decimals as attempts accrue', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  backend.mastery.updateSkillMastery('user-1', 'one-step-equations', true)
  const second = backend.mastery.updateSkillMastery('user-1', 'one-step-equations', false)
  assert.equal(second.score, 0.5)

  const third = backend.mastery.updateSkillMastery('user-1', 'one-step-equations', false)
  assert.equal(third.attempts, 3)
  assert.equal(third.correct, 1)
  assert.equal(third.score, 0.33)
})
