import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { LocalBackend, legacyStorySessionId, normalizeStoryLibrary } from '../src/backend'
import type { StorySession, StoryTheme } from '../src/domain'
import {
  capitalizeFirst,
  sortStorySessionsByRecent,
  storyChapterCount,
  storyInterestsLabel,
  storySessionEmoji,
  storySessionTitle,
  summarizeStorySession,
} from '../src/story/storyLibrary'
import { CHECKPOINT_INTERVAL } from '../src/story/storySessionReducer'
import { installLocalStorage, MemoryStorage, setActiveUser, STORAGE_KEY } from './helpers/localStorage'

let storage: MemoryStorage

beforeEach(() => {
  storage = installLocalStorage()
})

const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['space', 'fashion'],
  freeformInterest: 'asteroid mining',
  premise: 'A lone navigator charts a living nebula.',
  protagonist: 'Captain Vega',
  ...over,
})

const session = (over: Partial<StorySession> = {}): StorySession => ({
  id: 'story-1',
  userId: 'user-1',
  theme: theme(),
  status: 'active',
  questionsSolvedTotal: 12,
  questionsSinceCheckpoint: 2,
  history: [],
  historyIndex: 0,
  servedStepIds: [],
  segments: [],
  narrativeSummary: '',
  createdAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:05:00.000Z',
  schemaVersion: 2,
  ...over,
})

// A LEGACY (pre-library) persisted session: no `id`, schema v1, keyed by userId in the store.
const legacyStored = (userId: string) => ({
  userId,
  theme: { interestIds: ['space'], premise: 'An older tale.', protagonist: 'Vega' },
  status: 'active',
  questionsSolvedTotal: 5,
  questionsSinceCheckpoint: 5,
  currentQuestion: {
    sourceLessonId: 'balancing-equations',
    sourceStepId: 'input-box-value',
    stepType: 'input',
    themedPrompt: 'A themed prompt from before the upgrade.',
    themed: true,
    generatedAt: '2026-06-22T00:00:00.000Z',
  },
  servedStepIds: ['balancing-equations:input-box-value'],
  segments: [{ index: 0, text: 'Once upon a time.', createdAt: '2026-06-22T00:00:00.000Z' }],
  narrativeSummary: '',
  createdAt: '2026-06-22T00:00:00.000Z',
  updatedAt: '2026-06-22T00:00:00.000Z',
  schemaVersion: 1,
})

// --- Library display helpers ----------------------------------------------------------------

test('capitalizeFirst uppercases only the leading character for title display', () => {
  // A lowercase-led fallback role reads as a proper title heading.
  assert.equal(capitalizeFirst('the Chef'), 'The Chef')
  assert.equal(capitalizeFirst('the Explorer'), 'The Explorer')
  // Empty string is safe and unchanged.
  assert.equal(capitalizeFirst(''), '')
  // Already-capitalized custom names are left exactly as-is (no lower-casing the rest).
  assert.equal(capitalizeFirst('Luna the Brave'), 'Luna the Brave')
  assert.equal(capitalizeFirst('Captain Vega'), 'Captain Vega')
})

test('summarizeStorySession derives card metadata', () => {
  const summary = summarizeStorySession(session())
  assert.equal(summary.id, 'story-1')
  assert.equal(summary.emoji, '🛸') // first interest (space)
  assert.equal(summary.title, 'Captain Vega') // protagonist preferred
  assert.equal(summary.premise, 'A lone navigator charts a living nebula.')
  assert.equal(summary.interestsLabel, 'Sci-fi, Fashion & design, asteroid mining')
  assert.equal(summary.questionsSolved, 12)
  assert.equal(summary.chapterCount, Math.floor(12 / CHECKPOINT_INTERVAL) + 1) // floor(12 / 5) + 1 = 3
  assert.equal(summary.status, 'active')
})

test('chapter count is monotonic with solved questions (opening = chapter 1)', () => {
  assert.equal(storyChapterCount(session({ questionsSolvedTotal: 0 })), 1)
  assert.equal(storyChapterCount(session({ questionsSolvedTotal: CHECKPOINT_INTERVAL - 1 })), 1)
  assert.equal(storyChapterCount(session({ questionsSolvedTotal: CHECKPOINT_INTERVAL })), 2)
  assert.equal(storyChapterCount(session({ questionsSolvedTotal: CHECKPOINT_INTERVAL * 2 })), 3)
})

test('title and emoji fall back gracefully for sparse themes', () => {
  // No protagonist -> interests label.
  assert.equal(
    storySessionTitle(session({ theme: theme({ protagonist: '' }) })),
    'Sci-fi, Fashion & design, asteroid mining',
  )
  // No protagonist and no interests -> generic fallback + default emoji.
  const bare = session({ theme: { interestIds: [], premise: '', protagonist: '' } })
  assert.equal(storySessionTitle(bare), 'Untitled adventure')
  assert.equal(storySessionEmoji(bare), '📖')
  assert.equal(storyInterestsLabel(bare), '')
})

test('sortStorySessionsByRecent orders most-recently-played first', () => {
  const older = session({ id: 'older', updatedAt: '2026-06-23T00:00:00.000Z' })
  const newer = session({ id: 'newer', updatedAt: '2026-06-24T00:00:00.000Z' })
  const newest = session({ id: 'newest', updatedAt: '2026-06-25T00:00:00.000Z' })

  const sorted = sortStorySessionsByRecent([older, newest, newer])
  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ['newest', 'newer', 'older'],
  )
  // Pure: the input array is not mutated.
  assert.deepEqual([older, newest, newer].map((entry) => entry.id), ['older', 'newest', 'newer'])
})

// --- normalizeStoryLibrary: migration -------------------------------------------------------

test('normalizeStoryLibrary migrates a legacy single session into the library', () => {
  // Legacy shape: the `story` map is keyed by userId and the session has no `id`.
  const { story, storyActive } = normalizeStoryLibrary({ 'user-1': legacyStored('user-1') }, undefined)

  const legacyId = legacyStorySessionId('user-1')
  assert.equal(legacyId, 'legacy-user-1')
  assert.deepEqual(Object.keys(story), [legacyId])
  assert.equal(story[legacyId].id, legacyId)
  assert.equal(story[legacyId].userId, 'user-1')
  assert.equal(story[legacyId].schemaVersion, 2) // upgraded
  // History is seeded from the legacy currentQuestion so resume keeps a one-entry review.
  assert.equal(story[legacyId].history.length, 1)
  assert.equal(story[legacyId].history[0].sourceStepId, 'input-box-value')
  // The migrated session becomes the user's active pointer.
  assert.equal(storyActive['user-1'], legacyId)
})

test('normalizeStoryLibrary migrates legacy sessions for multiple users independently', () => {
  const { story, storyActive } = normalizeStoryLibrary(
    { 'user-1': legacyStored('user-1'), 'user-2': legacyStored('user-2') },
    undefined,
  )

  assert.equal(story['legacy-user-1'].userId, 'user-1')
  assert.equal(story['legacy-user-2'].userId, 'user-2')
  assert.equal(storyActive['user-1'], 'legacy-user-1')
  assert.equal(storyActive['user-2'], 'legacy-user-2')
})

test('normalizeStoryLibrary passes through new-shape sessions keyed by id', () => {
  const a = session({ id: 'story-a', userId: 'user-1' })
  const b = session({ id: 'story-b', userId: 'user-1' })
  const { story, storyActive } = normalizeStoryLibrary({ 'story-a': a, 'story-b': b }, { 'user-1': 'story-b' })

  assert.deepEqual(Object.keys(story).sort(), ['story-a', 'story-b'])
  // No legacy entries -> no derived pointer; the explicit valid pointer is honored.
  assert.equal(storyActive['user-1'], 'story-b')
})

test('normalizeStoryLibrary drops active pointers to missing or foreign sessions', () => {
  const a = session({ id: 'story-a', userId: 'user-1' })
  const { storyActive } = normalizeStoryLibrary(
    { 'story-a': a },
    { 'user-1': 'does-not-exist', 'user-2': 'story-a' /* foreign owner */ },
  )
  assert.equal('user-1' in storyActive, false)
  assert.equal('user-2' in storyActive, false)
})

test('normalizeStoryLibrary handles non-records and empties without throwing', () => {
  assert.deepEqual(normalizeStoryLibrary(undefined, undefined), { story: {}, storyActive: {} })
  assert.deepEqual(normalizeStoryLibrary('nope', 42), { story: {}, storyActive: {} })
  assert.deepEqual(normalizeStoryLibrary({}, {}), { story: {}, storyActive: {} })
})

// --- End-to-end migration through LocalBackend ----------------------------------------------

test('LocalBackend migrates legacy stored story data into the library on read', () => {
  // Persist the OLD single-session shape directly (no `id`, no `storyActive`).
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      users: {},
      progress: {},
      mastery: {},
      attempts: [],
      story: { 'user-1': legacyStored('user-1') },
    }),
  )

  const backend = new LocalBackend()
  setActiveUser('user-1')

  const legacyId = legacyStorySessionId('user-1')
  const list = backend.story.listStorySessions('user-1')
  assert.equal(list.length, 1)
  assert.equal(list[0].id, legacyId)
  assert.equal(list[0].userId, 'user-1')
  assert.equal(backend.story.getActiveStorySessionId('user-1'), legacyId)
  assert.deepEqual(backend.story.getStorySession('user-1', legacyId), list[0])

  // The migrated session is fully usable: saving it persists under the new id-keyed shape.
  const resaved = { ...list[0], questionsSolvedTotal: list[0].questionsSolvedTotal + 1 }
  backend.story.saveStorySession(resaved)
  const reloaded = new LocalBackend()
  assert.deepEqual(reloaded.story.getStorySession('user-1', legacyId), resaved)
})
