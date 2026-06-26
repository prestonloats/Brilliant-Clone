// Pure aggregation of a user's saved Story Mode sessions into display-ready "interesting" stats.
//
// React-free + side-effect-free (like `./storyLibrary`) so a stats panel/profile card can show
// totals and highlights that are fully unit-testable under `node --test`. Nothing here reads or
// writes storage; it only derives numbers from an already-loaded `StorySession[]`, reusing the
// same chapter/title helpers the library uses so every surface agrees.

import type { StorySession, StoryInterestId } from '../domain'
import { INTEREST_CATALOG, getInterestEmoji, getInterestLabel } from './interests'
import { storyChapterCount, storySessionTitle } from './storyLibrary'

export type StoryInterestTally = {
  id: StoryInterestId
  label: string
  emoji: string
  count: number
}

export type StoryLongestAdventure = {
  id: string
  title: string
  questionsSolved: number
  chapters: number
}

export type StoryModeStats = {
  hasPlayed: boolean
  storiesStarted: number
  activeStories: number
  completedStories: number
  questionsSolved: number
  chaptersReached: number
  storyBeats: number
  scenesExplored: number
  charactersCreated: number
  topInterests: StoryInterestTally[]
  longestAdventure: StoryLongestAdventure | null
}

// Total order over sessions for "longest adventure": most questions solved wins; ties break on the
// more recent `updatedAt`, then the smaller `id`. Returns the winner so selection is independent of
// input order (and never mutates either session).
const pickLongest = (current: StorySession | null, candidate: StorySession): StorySession => {
  if (current === null) return candidate
  if (candidate.questionsSolvedTotal !== current.questionsSolvedTotal) {
    return candidate.questionsSolvedTotal > current.questionsSolvedTotal ? candidate : current
  }
  if (candidate.updatedAt !== current.updatedAt) {
    return candidate.updatedAt > current.updatedAt ? candidate : current
  }
  return candidate.id < current.id ? candidate : current
}

export const computeStoryModeStats = (sessions: StorySession[]): StoryModeStats => {
  // Catalog position of each known interest id: drives the count-tie ordering and lets us drop
  // any unknown/garbage id (membership check) defensively.
  const catalogIndex = new Map<StoryInterestId, number>(
    INTEREST_CATALOG.map((interest, index): [StoryInterestId, number] => [interest.id, index]),
  )

  let activeStories = 0
  let completedStories = 0
  let questionsSolved = 0
  let chaptersReached = 0
  let storyBeats = 0
  let charactersCreated = 0

  const interestCounts = new Map<StoryInterestId, number>()
  const sceneIds = new Set<string>()
  let longest: StorySession | null = null

  for (const session of sessions) {
    if (session.status === 'active') activeStories += 1
    else if (session.status === 'ended') completedStories += 1

    questionsSolved += session.questionsSolvedTotal
    chaptersReached += storyChapterCount(session)
    storyBeats += session.segments?.length ?? 0
    charactersCreated += session.theme.characters?.length ?? 0

    for (const segment of session.segments ?? []) {
      if (segment.sceneId !== undefined) sceneIds.add(segment.sceneId)
    }

    // Count each interest at most once per session (dedupe), ignoring ids not in the catalog.
    const seenInterests = new Set<StoryInterestId>()
    for (const id of session.theme.interestIds ?? []) {
      if (!catalogIndex.has(id) || seenInterests.has(id)) continue
      seenInterests.add(id)
      interestCounts.set(id, (interestCounts.get(id) ?? 0) + 1)
    }

    longest = pickLongest(longest, session)
  }

  const topInterests: StoryInterestTally[] = [...interestCounts.entries()]
    .map(([id, count]): StoryInterestTally => ({ id, label: getInterestLabel(id), emoji: getInterestEmoji(id), count }))
    .sort((a, b) => b.count - a.count || (catalogIndex.get(a.id) ?? 0) - (catalogIndex.get(b.id) ?? 0))

  const longestAdventure: StoryLongestAdventure | null = longest
    ? {
        id: longest.id,
        title: storySessionTitle(longest),
        questionsSolved: longest.questionsSolvedTotal,
        chapters: storyChapterCount(longest),
      }
    : null

  return {
    hasPlayed: sessions.length > 0,
    storiesStarted: sessions.length,
    activeStories,
    completedStories,
    questionsSolved,
    chaptersReached,
    storyBeats,
    scenesExplored: sceneIds.size,
    charactersCreated,
    topInterests,
    longestAdventure,
  }
}
