import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StorySegment, StorySession, StoryInterestId, StoryTheme } from '../src/domain'
import { getInterestEmoji, getInterestLabel } from '../src/story/interests'
import { storyChapterCount, storySessionTitle } from '../src/story/storyLibrary'
import { computeStoryModeStats } from '../src/story/storyStats'

// Fixture factories mirror tests/story-library.test.ts: a valid base shape plus `...over` overrides.
const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['space', 'fashion'],
  freeformInterest: 'asteroid mining',
  premise: 'A lone navigator charts a living nebula.',
  protagonist: 'Captain Vega',
  ...over,
})

const segment = (over: Partial<StorySegment> = {}): StorySegment => ({
  index: 0,
  text: 'A narrative beat.',
  createdAt: '2026-06-23T00:00:00.000Z',
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

test('empty input yields a fully zeroed stats object', () => {
  const stats = computeStoryModeStats([])
  assert.equal(stats.hasPlayed, false)
  assert.equal(stats.storiesStarted, 0)
  assert.equal(stats.activeStories, 0)
  assert.equal(stats.completedStories, 0)
  assert.equal(stats.questionsSolved, 0)
  assert.equal(stats.chaptersReached, 0)
  assert.equal(stats.storyBeats, 0)
  assert.equal(stats.scenesExplored, 0)
  assert.equal(stats.charactersCreated, 0)
  assert.deepEqual(stats.topInterests, [])
  assert.equal(stats.longestAdventure, null)
})

test('aggregates counts and sums across multiple sessions', () => {
  const a = session({
    id: 'a',
    status: 'active',
    questionsSolvedTotal: 12, // chapter floor(12/5)+1 = 3
    segments: [segment({ index: 0 }), segment({ index: 1 })], // 2 beats
    theme: theme({ characters: [{ id: 'c1', name: 'Buddy' }] }), // 1 character
  })
  const b = session({
    id: 'b',
    status: 'ended',
    questionsSolvedTotal: 5, // chapter floor(5/5)+1 = 2
    segments: [segment(), segment(), segment()], // 3 beats
    theme: theme({
      characters: [
        { id: 'c1', name: 'Buddy' },
        { id: 'c2', name: 'Rex' },
      ],
    }), // 2 characters
  })
  const c = session({
    id: 'c',
    status: 'active',
    questionsSolvedTotal: 0, // chapter floor(0/5)+1 = 1
    segments: [], // 0 beats
    theme: theme({ characters: [] }), // 0 characters
  })

  const stats = computeStoryModeStats([a, b, c])
  assert.equal(stats.hasPlayed, true)
  assert.equal(stats.storiesStarted, 3)
  assert.equal(stats.activeStories, 2)
  assert.equal(stats.completedStories, 1)
  assert.equal(stats.questionsSolved, 17) // 12 + 5 + 0
  assert.equal(stats.storyBeats, 5) // 2 + 3 + 0
  assert.equal(stats.charactersCreated, 3) // 1 + 2 + 0
  // chaptersReached sums storyChapterCount per session (3 + 2 + 1 = 6).
  assert.equal(stats.chaptersReached, storyChapterCount(a) + storyChapterCount(b) + storyChapterCount(c))
  assert.equal(stats.chaptersReached, 6)
})

test('scenesExplored counts distinct defined sceneIds and ignores undefined', () => {
  const a = session({
    id: 'a',
    segments: [
      segment({ index: 0, sceneId: 'outer-space' }),
      segment({ index: 1, sceneId: 'pirate-cove' }),
      segment({ index: 2 }), // no sceneId -> ignored
    ],
  })
  const b = session({
    id: 'b',
    segments: [
      segment({ index: 0, sceneId: 'outer-space' }), // duplicate across sessions -> counted once
      segment({ index: 1, sceneId: 'fairy-castle' }),
    ],
  })

  const stats = computeStoryModeStats([a, b])
  // Distinct defined scenes: outer-space, pirate-cove, fairy-castle.
  assert.equal(stats.scenesExplored, 3)
  // Every segment still contributes to the beat count, including the scene-less one.
  assert.equal(stats.storyBeats, 5)
})

test('topInterests ranks by count desc then catalog order, dedupes, and drops unknown ids', () => {
  const garbageInterest = 'totally-made-up' as unknown as StoryInterestId
  const sessions = [
    session({ id: 's1', theme: theme({ interestIds: ['space', 'fantasy'] }) }),
    session({ id: 's2', theme: theme({ interestIds: ['space', 'mystery'] }) }),
    session({ id: 's3', theme: theme({ interestIds: ['fantasy', 'space'] }) }),
    session({ id: 's4', theme: theme({ interestIds: ['mystery'] }) }),
    session({ id: 's5', theme: theme({ interestIds: ['sports', 'sports'] }) }), // within-session dup -> once
    session({ id: 's6', theme: theme({ interestIds: ['animals', garbageInterest] }) }), // garbage dropped
  ]

  const stats = computeStoryModeStats(sessions)

  // space=3, fantasy=2, mystery=2, sports=1, animals=1; cooking/fashion never chosen (omitted).
  assert.deepEqual(
    stats.topInterests.map((t) => t.id),
    ['space', 'fantasy', 'mystery', 'sports', 'animals'],
  )
  assert.deepEqual(
    stats.topInterests.map((t) => t.count),
    [3, 2, 2, 1, 1],
  )
  // The unknown id contributed nothing and never appears in the tally.
  assert.equal(
    stats.topInterests.some((t) => (t.id as string) === 'totally-made-up'),
    false,
  )
  // Labels/emojis come straight from the interests.ts helpers.
  assert.equal(stats.topInterests[0].label, getInterestLabel('space'))
  assert.equal(stats.topInterests[0].emoji, getInterestEmoji('space'))
})

test('longestAdventure picks the most-solved session and mirrors title/chapters helpers', () => {
  const winner = session({ id: 'epic', questionsSolvedTotal: 23, theme: theme({ protagonist: 'Captain Vega' }) })
  const small = session({ id: 'small', questionsSolvedTotal: 4 })

  const stats = computeStoryModeStats([small, winner])
  assert.equal(stats.longestAdventure?.id, 'epic')
  assert.equal(stats.longestAdventure?.questionsSolved, 23)
  assert.equal(stats.longestAdventure?.title, storySessionTitle(winner))
  assert.equal(stats.longestAdventure?.title, 'Captain Vega')
  assert.equal(stats.longestAdventure?.chapters, storyChapterCount(winner))
  assert.equal(stats.longestAdventure?.chapters, 5) // floor(23/5)+1
})

test('longestAdventure tie-breaks on updatedAt then id, independent of input order', () => {
  // Equal questionsSolvedTotal -> the more recently updated wins.
  const earlier = session({ id: 'a', questionsSolvedTotal: 30, updatedAt: '2026-06-23T00:00:00.000Z' })
  const later = session({ id: 'b', questionsSolvedTotal: 30, updatedAt: '2026-06-24T00:00:00.000Z' })
  assert.equal(computeStoryModeStats([earlier, later]).longestAdventure?.id, 'b')
  assert.equal(computeStoryModeStats([later, earlier]).longestAdventure?.id, 'b')

  // Equal questionsSolvedTotal AND updatedAt -> the smaller id wins.
  const idHigh = session({ id: 'story-z', questionsSolvedTotal: 30, updatedAt: '2026-06-24T00:00:00.000Z' })
  const idLow = session({ id: 'story-a', questionsSolvedTotal: 30, updatedAt: '2026-06-24T00:00:00.000Z' })
  assert.equal(computeStoryModeStats([idHigh, idLow]).longestAdventure?.id, 'story-a')
  assert.equal(computeStoryModeStats([idLow, idHigh]).longestAdventure?.id, 'story-a')
})

test('computeStoryModeStats is pure and robust to sparse/legacy sessions', () => {
  const populated = session({
    id: 'pure',
    segments: [segment({ sceneId: 'outer-space' })],
    theme: theme({ characters: [{ id: 'c1', name: 'Buddy' }] }),
  })
  // Sparse/legacy: empty interestIds + segments, no characters, no freeform.
  const sparse = session({
    id: 'sparse',
    questionsSolvedTotal: 0,
    segments: [],
    theme: { interestIds: [], premise: '', protagonist: '' },
  })
  const input = [populated, sparse]
  const snapshot = structuredClone(input)

  // Must not throw on the sparse session and must not mutate any input.
  assert.doesNotThrow(() => computeStoryModeStats(input))
  assert.deepEqual(input, snapshot)
})
