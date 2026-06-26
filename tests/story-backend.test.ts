import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { LocalBackend, normalizeStorySession } from '../src/backend'
import type { StorySession } from '../src/domain'
import {
  assertVerifiedEmailForWrite,
  firebaseStoryPath,
  firebaseStorySessionPath,
  requireMatchingUserId,
  toFirestoreStoryPointer,
  toFirestoreStorySession,
} from '../src/firebaseBackendCore'
import { installLocalStorage, MemoryStorage, setActiveUser } from './helpers/localStorage'

let storage: MemoryStorage

beforeEach(() => {
  storage = installLocalStorage()
})

// A fully-valid v2 session covering every field, including the optional `currentQuestion`,
// `theme.freeformInterest`, a multi-entry question `history` (whose last entry is the live
// question), and a segment `userChoice`, so the round-trip tests prove that normalization is a
// structural identity on good data (adds/drops nothing).
const storySession = (userId: string, id = 'story-1'): StorySession => {
  const currentQuestion = {
    sourceLessonId: 'balancing-equations' as const,
    sourceStepId: 'input-box-value',
    stepType: 'input' as const,
    themedPrompt: 'How many fuel cells balance the reactor core?',
    themed: true,
    generatedAt: '2026-06-23T00:05:00.000Z',
  }
  return {
    id,
    userId,
    theme: {
      interestIds: ['space', 'fashion'],
      freeformInterest: 'asteroid mining',
      premise: 'A lone navigator charts a living nebula.',
      protagonist: 'Captain Vega',
    },
    status: 'active',
    questionsSolvedTotal: 12,
    questionsSinceCheckpoint: 2,
    currentQuestion,
    history: [
      {
        sourceLessonId: 'balancing-equations',
        sourceStepId: 'past-input',
        stepType: 'input',
        themedPrompt: 'An earlier reactor puzzle, now solved.',
        themed: true,
        generatedAt: '2026-06-23T00:02:00.000Z',
      },
      currentQuestion,
    ],
    historyIndex: 1,
    servedStepIds: ['balancing-equations:past-input', 'balancing-equations:input-box-value'],
    segments: [
      {
        index: 0,
        text: 'The hum of the engines fills the cabin as Vega sets course for the nebula.',
        userChoice: 'Chart a path through the glowing clouds',
        createdAt: '2026-06-23T00:00:00.000Z',
      },
    ],
    narrativeSummary: 'Vega began the journey and chose the nebula route.',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:05:00.000Z',
    schemaVersion: 2,
  }
}

// `assert.ok` is not a TypeScript narrowing guard, so wrap it in an assertion function that
// both fails the test and narrows `StorySession | null` to `StorySession` for later access.
function assertSession(value: StorySession | null): asserts value is StorySession {
  assert.ok(value, 'expected a normalized story session')
}

// --- Local library round-trips --------------------------------------------------------------

test('local story session round-trips by id for the active user', () => {
  const backend = new LocalBackend()
  const session = storySession('user-1')
  setActiveUser('user-1')

  backend.story.saveStorySession(session)

  assert.deepEqual(backend.story.getStorySession('user-1', session.id), session)
  assert.deepEqual(backend.story.listStorySessions('user-1'), [session])
})

test('local story keeps MANY sessions per user with an active pointer', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')
  const first = storySession('user-1', 'story-a')
  const second = storySession('user-1', 'story-b')

  backend.story.saveStorySession(first)
  backend.story.saveStorySession(second)
  backend.story.setActiveStorySessionId('user-1', 'story-b')

  const ids = backend.story.listStorySessions('user-1').map((entry) => entry.id).sort()
  assert.deepEqual(ids, ['story-a', 'story-b'])
  assert.deepEqual(backend.story.getStorySession('user-1', 'story-a'), first)
  assert.deepEqual(backend.story.getStorySession('user-1', 'story-b'), second)
  assert.equal(backend.story.getActiveStorySessionId('user-1'), 'story-b')
})

test('local story active pointer ignores a dangling/foreign session id', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')
  backend.story.saveStorySession(storySession('user-1', 'story-a'))

  // Pointer to a session that does not exist -> treated as "no active session".
  backend.story.setActiveStorySessionId('user-1', 'missing')
  assert.equal(backend.story.getActiveStorySessionId('user-1'), null)

  backend.story.setActiveStorySessionId('user-1', 'story-a')
  assert.equal(backend.story.getActiveStorySessionId('user-1'), 'story-a')
  backend.story.setActiveStorySessionId('user-1', null)
  assert.equal(backend.story.getActiveStorySessionId('user-1'), null)
})

test('local story delete removes the session and clears it as active', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')
  backend.story.saveStorySession(storySession('user-1', 'story-a'))
  backend.story.saveStorySession(storySession('user-1', 'story-b'))
  backend.story.setActiveStorySessionId('user-1', 'story-a')

  backend.story.deleteStorySession('user-1', 'story-a')

  assert.equal(backend.story.getStorySession('user-1', 'story-a'), null)
  assert.deepEqual(
    backend.story.listStorySessions('user-1').map((entry) => entry.id),
    ['story-b'],
  )
  // Deleting the active session clears the pointer (so the controller can re-point).
  assert.equal(backend.story.getActiveStorySessionId('user-1'), null)
})

test('local story session survives a reload through normalization', () => {
  const backend = new LocalBackend()
  const session = storySession('user-1')
  setActiveUser('user-1')
  backend.story.saveStorySession(session)
  backend.story.setActiveStorySessionId('user-1', session.id)

  // A fresh backend re-reads from storage, forcing the value through normalizeDatabase ->
  // normalizeStoryLibrary rather than returning the cached in-memory object.
  const reloaded = new LocalBackend()
  assert.deepEqual(reloaded.story.getStorySession('user-1', session.id), session)
  assert.equal(reloaded.story.getActiveStorySessionId('user-1'), session.id)
})

test('local story list is empty when none is stored for the user', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.deepEqual(backend.story.listStorySessions('user-1'), [])
  assert.equal(backend.story.getStorySession('user-1', 'story-1'), null)
  assert.equal(backend.story.getActiveStorySessionId('user-1'), null)
})

test('local story sessions are isolated per user', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')
  backend.story.saveStorySession(storySession('user-1', 'story-a'))

  setActiveUser('user-2')
  assert.deepEqual(backend.story.listStorySessions('user-2'), [])
  // A user can never read another user's session by guessing its id.
  assert.equal(backend.story.getStorySession('user-2', 'story-a'), null)
})

test('local story write is rejected for a non-active user', () => {
  const backend = new LocalBackend()
  setActiveUser('user-1')

  assert.throws(
    () => backend.story.saveStorySession(storySession('user-2')),
    /sign in with this local demo profile/i,
  )
  assert.throws(
    () => backend.story.setActiveStorySessionId('user-2', 'story-a'),
    /sign in with this local demo profile/i,
  )
})

test('local backend drops a malformed persisted story session without crashing', () => {
  const valid = storySession('user-2', 'story-valid')
  storage.setItem(
    'balance-local-backend-v1',
    JSON.stringify({
      users: {},
      progress: {},
      mastery: {},
      attempts: [],
      story: {
        'story-bad': { theme: {}, segments: [] }, // missing userId -> dropped
        'story-valid': valid,
      },
      storyActive: {},
    }),
  )

  const backend = new LocalBackend()
  setActiveUser('user-1')
  assert.deepEqual(backend.story.listStorySessions('user-1'), [])
  setActiveUser('user-2')
  assert.deepEqual(backend.story.getStorySession('user-2', 'story-valid'), valid)
})

// --- Normalization repair (v2 shape) --------------------------------------------------------

test('story normalization repairs malformed fields and stamps schema v2 + an id', () => {
  const repaired = normalizeStorySession(
    {
      userId: 'user-1',
      theme: { interestIds: ['space', 7, null], premise: 5, protagonist: 'Vega', freeformInterest: 42 },
      status: 'banana',
      questionsSolvedTotal: -3,
      questionsSinceCheckpoint: 4.9,
      servedStepIds: ['a', 2, 'b'],
      segments: 'nope',
      narrativeSummary: 99,
      schemaVersion: 7,
    },
    'story-fallback',
  )

  assertSession(repaired)
  assert.equal(repaired.id, 'story-fallback') // fallback id used when none is stored
  assert.equal(repaired.userId, 'user-1')
  assert.equal(repaired.status, 'active') // unknown enum -> safe default
  assert.deepEqual(repaired.theme.interestIds, ['space']) // non-string entries dropped
  assert.equal(repaired.theme.premise, '') // non-string coerced to ''
  assert.equal(repaired.theme.protagonist, 'Vega')
  assert.equal('freeformInterest' in repaired.theme, false) // non-string optional dropped
  assert.equal(repaired.questionsSolvedTotal, 0) // negative clamped
  assert.equal(repaired.questionsSinceCheckpoint, 4) // floored to an integer
  assert.deepEqual(repaired.servedStepIds, ['a', 'b'])
  assert.deepEqual(repaired.history, []) // no currentQuestion and no history -> empty
  assert.equal(repaired.historyIndex, 0)
  assert.deepEqual(repaired.segments, [])
  assert.equal(repaired.narrativeSummary, '') // non-string coerced
  assert.equal(repaired.schemaVersion, 2) // coerced to the current version
  assert.equal(typeof repaired.createdAt, 'string')
  assert.equal(typeof repaired.updatedAt, 'string')
})

test('story normalization keeps a stored id and mints one when absent', () => {
  const kept = normalizeStorySession({ id: 'story-kept', userId: 'u' })
  assertSession(kept)
  assert.equal(kept.id, 'story-kept')

  const minted = normalizeStorySession({ userId: 'u' })
  assertSession(minted)
  assert.equal(typeof minted.id, 'string')
  assert.ok(minted.id.length > 0)
})

test('story normalization drops non-records and missing/invalid user ids without throwing', () => {
  assert.equal(normalizeStorySession(null), null)
  assert.equal(normalizeStorySession('nope'), null)
  assert.equal(normalizeStorySession(42), null)
  assert.equal(normalizeStorySession([]), null)
  assert.equal(normalizeStorySession({}), null)
  assert.equal(normalizeStorySession({ userId: 5 }), null)
})

test('story normalization seeds history from currentQuestion for legacy/v1 sessions', () => {
  const session = normalizeStorySession({
    id: 'story-1',
    userId: 'user-1',
    currentQuestion: {
      sourceLessonId: 'balancing-equations',
      sourceStepId: 'input-box-value',
      stepType: 'input',
      themedPrompt: 'A themed prompt.',
      themed: true,
      generatedAt: '2026-06-23T00:00:00.000Z',
    },
    // No `history` field at all (the v1 shape).
  })

  assertSession(session)
  assert.equal(session.history.length, 1)
  assert.equal(session.history[0].sourceStepId, 'input-box-value')
  assert.equal(session.historyIndex, 0) // live edge of the one-entry history
})

test('story normalization clamps historyIndex into range', () => {
  const base = storySession('user-1')
  const tooHigh = normalizeStorySession({ ...base, historyIndex: 99 })
  assertSession(tooHigh)
  assert.equal(tooHigh.historyIndex, base.history.length - 1)

  const negative = normalizeStorySession({ ...base, historyIndex: -5 })
  assertSession(negative)
  assert.equal(negative.historyIndex, 0)
})

test('story normalization drops a malformed currentQuestion but keeps the session', () => {
  const session = normalizeStorySession({
    ...storySession('user-1'),
    currentQuestion: {
      sourceLessonId: 'not-a-real-lesson',
      sourceStepId: 'x',
      stepType: 'input',
      themedPrompt: 'p',
      themed: true,
      generatedAt: 't',
    },
    history: [],
  })

  assertSession(session)
  assert.equal('currentQuestion' in session, false)
  assert.deepEqual(session.history, [])
})

test('story normalization filters malformed history + segment entries', () => {
  const session = normalizeStorySession({
    ...storySession('user-1'),
    history: [
      {
        sourceLessonId: 'balancing-equations',
        sourceStepId: 'kept',
        stepType: 'input',
        themedPrompt: 'kept prompt',
        themed: true,
        generatedAt: '2026-06-23T00:00:00.000Z',
      },
      { sourceLessonId: 'not-a-real-lesson', sourceStepId: 'dropped', stepType: 'input', themedPrompt: 'p', themed: true, generatedAt: 't' },
      'garbage',
    ],
    historyIndex: 0,
    segments: [
      { index: 0, text: 'kept', createdAt: '2026-06-23T00:00:00.000Z' },
      { index: 'bad', text: 'dropped', createdAt: '2026-06-23T00:00:00.000Z' },
    ],
  })

  assertSession(session)
  assert.equal(session.history.length, 1)
  assert.equal(session.history[0].sourceStepId, 'kept')
  assert.equal(session.segments.length, 1)
  assert.equal(session.segments[0].text, 'kept')
})

// --- Firebase serializers / paths / guards --------------------------------------------------

test('firebase story serializer round-trips through normalization', () => {
  const session = storySession('auth-uid')
  const stored = toFirestoreStorySession('auth-uid', session)

  // The Firestore reader passes the document id as the fallback id; here the payload already
  // carries it, so the round-trip is a structural identity.
  assert.deepEqual(normalizeStorySession(stored, session.id), session)
})

test('firebase story serializer overwrites the payload user id and derives doc paths', () => {
  assert.equal(toFirestoreStorySession('auth-uid', storySession('payload-user')).userId, 'auth-uid')
  assert.equal(firebaseStoryPath('auth-uid'), 'story/auth-uid')
  assert.equal(firebaseStorySessionPath('auth-uid', 'story-1'), 'story/auth-uid/sessions/story-1')
  assert.throws(() => firebaseStorySessionPath('auth-uid', 'bad/id'), /document id segment/i)
  assert.throws(() => firebaseStorySessionPath('bad/uid', 'story-1'), /document id segment/i)
})

test('firebase story pointer serializer carries the authenticated uid', () => {
  assert.deepEqual(toFirestoreStoryPointer('auth-uid', 'story-1'), {
    userId: 'auth-uid',
    activeSessionId: 'story-1',
  })
  assert.deepEqual(toFirestoreStoryPointer('auth-uid', null), {
    userId: 'auth-uid',
    activeSessionId: null,
  })
})

test('firebase story write guards reject cross-user and unverified writes', () => {
  // saveStorySession composes requireMatchingUserId + assertVerifiedEmailForWrite (requireVerifiedUid).
  assert.throws(() => requireMatchingUserId('auth-uid', 'other-user'), /different authenticated user/i)
  assert.throws(() => requireMatchingUserId(null, 'auth-uid'), /sign in/i)
  assert.throws(() => assertVerifiedEmailForWrite(false), /verify your email/i)
  assert.throws(() => assertVerifiedEmailForWrite(undefined), /verify your email/i)
  assert.doesNotThrow(() => assertVerifiedEmailForWrite(true))
})
