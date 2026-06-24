import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { createAttemptEvent, LocalBackend } from '../src/backend'
import { applyBalanceOperation } from '../src/engine'
import type { BalanceOperation, BalanceState, LessonProgress } from '../src/domain'

const STORAGE_KEY = 'balance-local-backend-v1'
const SESSION_KEY = 'balance-local-session-v1'

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
let sessionStorage: MemoryStorage

const installLocalStorage = () => {
  const nextStorage = new MemoryStorage()
  const nextSessionStorage = new MemoryStorage()

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: nextStorage, sessionStorage: nextSessionStorage },
    configurable: true,
    writable: true,
  })

  sessionStorage = nextSessionStorage
  return nextStorage
}

const setActiveUser = (userId: string) => {
  sessionStorage.setItem(SESSION_KEY, userId)
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

const uuidSuffix = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

beforeEach(() => {
  storage = installLocalStorage()
})

test('cached reads return consistent data across repeated calls', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')
  const saved = lessonProgress('user-1', 3)
  backend.progress.saveLessonProgress(saved)

  const first = backend.progress.getLessonProgress('user-1', 'balancing-equations')
  const second = backend.progress.getLessonProgress('user-1', 'balancing-equations')

  assert.deepEqual(first, saved)
  assert.deepEqual(second, saved)
})

test('cache invalidates when storage is replaced out of band', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')
  const initial = lessonProgress('user-1', 2)
  backend.progress.saveLessonProgress(initial)
  assert.equal(backend.progress.getLessonProgress('user-1', 'balancing-equations')?.currentStepIndex, 2)

  const external = { ...initial, currentStepIndex: 5, updatedAt: '2026-06-23T00:05:00.000Z' }
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      users: {},
      progress: { 'user-1:balancing-equations': external },
      mastery: {},
      attempts: [],
    }),
  )

  assert.equal(backend.progress.getLessonProgress('user-1', 'balancing-equations')?.currentStepIndex, 5)
})

test('sequential writes stay consistent through the cache', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  backend.attempts.recordAttempt(
    createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', true, 1, 1000),
  )
  backend.attempts.recordAttempt(
    createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', false, 2, 1500),
  )

  const saved = lessonProgress('user-1', 4)
  backend.progress.saveLessonProgress(saved)

  assert.equal(backend.attempts.getAttempts('user-1').length, 2)
  assert.equal(backend.progress.getLessonProgress('user-1', 'balancing-equations')?.currentStepIndex, 4)
})

test('generated identifiers are unique and use crypto.randomUUID when available', () => {
  const backend = new LocalBackend()
  const first = backend.auth.signUp({ email: 'a@example.com', displayName: 'A' })
  const second = backend.auth.signUp({ email: 'b@example.com', displayName: 'B' })

  assert.notEqual(first.id, second.id)

  const attemptOne = createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', true, 1, 1000)
  const attemptTwo = createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', true, 1, 1000)
  assert.notEqual(attemptOne.id, attemptTwo.id)

  if (typeof globalThis.crypto?.randomUUID === 'function') {
    assert.match(first.id, new RegExp(`^user-${uuidSuffix}$`, 'i'))
    assert.match(attemptOne.id, new RegExp(`^attempt-${uuidSuffix}$`, 'i'))
  } else {
    assert.match(first.id, /^user-/)
    assert.match(attemptOne.id, /^attempt-/)
  }
})

test('applying a balance operation gives every added weight a unique id', () => {
  const state: BalanceState = {
    left: [{ id: 'left-1', label: '1', value: 1, kind: 'weight' }],
    right: [{ id: 'right-1', label: '1', value: 1, kind: 'weight' }],
  }
  const addBoth: BalanceOperation = { id: 'add-two-both', label: '+2 to both sides', amount: 2, sides: 'both' }

  const collectAddedIds = (next: BalanceState) =>
    [...next.left, ...next.right].filter((item) => item.id.startsWith('added-')).map((item) => item.id)

  const firstRun = applyBalanceOperation(state, addBoth)
  const secondRun = applyBalanceOperation(state, addBoth)
  const addedIds = [...collectAddedIds(firstRun), ...collectAddedIds(secondRun)]

  assert.equal(addedIds.length, 4)
  assert.equal(new Set(addedIds).size, 4)
})
