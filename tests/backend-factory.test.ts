import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { createAttemptEvent, createBackend, LocalBackend, localBackend } from '../src/backend'

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

const installLocalStorage = () => {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() },
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  installLocalStorage()
})

test('createBackend returns a working LocalBackend for the local provider', () => {
  const backend = createBackend('local')

  assert.ok(backend instanceof LocalBackend)
  const user = backend.auth.signUp({ email: 'factory@example.com', displayName: 'Factory' })
  assert.equal(user.email, 'factory@example.com')
  assert.equal(backend.auth.getCurrentUser()?.id, user.id)
})

test('createBackend fails closed for the firebase provider', () => {
  assert.throws(() => createBackend('firebase'), /refused to fall back to local mode/i)
})

test('localBackend is a ready-to-use LocalBackend singleton', () => {
  assert.ok(localBackend instanceof LocalBackend)
})

test('createAttemptEvent builds a fully-populated event with a prefixed id and ISO timestamp', () => {
  const event = createAttemptEvent('user-1', 'balancing-equations', 'input-box-value', true, 2, 1500)

  assert.equal(event.userId, 'user-1')
  assert.equal(event.lessonId, 'balancing-equations')
  assert.equal(event.stepId, 'input-box-value')
  assert.equal(event.correct, true)
  assert.equal(event.attemptCount, 2)
  assert.equal(event.msToAnswer, 1500)
  assert.match(event.id, /^attempt-[a-z0-9]+-[a-z0-9]+$/)
  assert.ok(!Number.isNaN(Date.parse(event.at)))
})
