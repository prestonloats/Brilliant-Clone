// LocalBackend practice repository proof (Phase 3).
//
// The practice store is the new dedicated learning-science persistence Story Mode writes to. These
// tests confirm the Local repo seeds + advances a per-skill state via the shared pure update, keeps
// states isolated per user, requires the active user (mirroring the other repos), and round-trips
// through `normalizeDatabase` on reload (with malformed entries dropped, never crashing).

import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { LocalBackend } from '../src/backend'
import { isSkillMastered } from '../src/engine'
import {
  installLocalStorage,
  MemoryStorage,
  setActiveUser,
  STORAGE_KEY,
} from './helpers/localStorage'

let storage: MemoryStorage

beforeEach(() => {
  storage = installLocalStorage()
})

test('local practice seeds and advances a per-skill state from outcomes', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  const first = backend.practice.updatePractice('user-1', 'one-step-equations', {
    firstTryCorrect: true,
    at: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(first.userId, 'user-1')
  assert.equal(first.skillId, 'one-step-equations')
  assert.equal(first.proficiency, 1)
  assert.equal(first.streak, 1)
  assert.equal(first.totalAttempts, 1)
  assert.equal(first.firstTryCorrect, 1)

  const second = backend.practice.updatePractice('user-1', 'one-step-equations', {
    firstTryCorrect: false,
    at: '2026-01-01T01:00:00.000Z',
  })
  assert.equal(second.streak, 0)
  assert.equal(second.lapses, 1)
  assert.equal(second.totalAttempts, 2)
})

test('local practice is isolated by user', () => {
  const backend = new LocalBackend()

  setActiveUser('user-1')
  backend.practice.updatePractice('user-1', 'one-step-equations', { firstTryCorrect: true })
  setActiveUser('user-2')
  backend.practice.updatePractice('user-2', 'two-step-equations', { firstTryCorrect: true })

  assert.deepEqual(
    backend.practice.getUserPractice('user-2').map((state) => state.skillId),
    ['two-step-equations'],
  )
  setActiveUser('user-1')
  assert.deepEqual(
    backend.practice.getUserPractice('user-1').map((state) => state.skillId),
    ['one-step-equations'],
  )
})

test('local practice rejects access for non-active users', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.throws(
    () => backend.practice.updatePractice('user-2', 'one-step-equations', { firstTryCorrect: true }),
    /sign in with this local demo profile/i,
  )
})

test('local practice survives a reload and reaches mastery across attempts', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  for (const at of ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-05T00:00:00.000Z']) {
    backend.practice.updatePractice('user-1', 'one-step-equations', { firstTryCorrect: true, at })
  }

  // A fresh backend re-reads from storage, forcing the value through normalizeDatabase.
  const reloaded = new LocalBackend()
  const states = reloaded.practice.getUserPractice('user-1')
  assert.equal(states.length, 1)
  assert.equal(states[0].streak, 3)
  assert.equal(isSkillMastered(states[0]), true)
})

test('local backend drops malformed persisted practice entries without crashing', () => {
  const valid = {
    userId: 'user-1',
    skillId: 'one-step-equations',
    proficiency: 0.8,
    streak: 2,
    intervalDays: 3,
    ease: 2.6,
    dueAt: '2026-01-04T00:00:00.000Z',
    lapses: 0,
    totalAttempts: 4,
    firstTryCorrect: 3,
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      users: {},
      progress: {},
      mastery: {},
      attempts: [],
      practice: {
        'bad-entry': { userId: 'user-1' },
        'user-1:one-step-equations': valid,
      },
    }),
  )

  const backend = new LocalBackend()
  setActiveUser('user-1')
  assert.deepEqual(backend.practice.getUserPractice('user-1'), [valid])
})
