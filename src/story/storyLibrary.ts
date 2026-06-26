// Pure presentation helpers for the saved-stories library (capability 2).
//
// React-free + side-effect-free so the library card labels, emoji, progress, and sort order are
// unit-testable under `node --test` and shared by `StoryLibraryScreen`. Nothing here generates
// or stores anything; it only derives display metadata from a persisted `StorySession`.

import type { StorySession, StoryInterestId } from '../domain'
import { CHECKPOINT_INTERVAL } from './storySessionReducer'
import { DEFAULT_STORY_EMOJI, getInterestEmoji, getInterestLabel } from './interests'

export type StorySessionSummary = {
  id: string
  emoji: string
  // A short, human label for the card heading (protagonist > interests > fallback).
  title: string
  // The 1-2 sentence premise, or '' when none was generated yet.
  premise: string
  // Comma-joined interest labels (+ any freeform), or '' when none chosen.
  interestsLabel: string
  questionsSolved: number
  // Monotonic chapter number, matching the checkpoint screen (opening = Chapter 1).
  chapterCount: number
  status: StorySession['status']
  updatedAt: string
}

// The chapter the learner is on: opening is Chapter 1, then one per 5-question checkpoint.
// Mirrors StoryCheckpointScreen so the library and the in-story header agree.
export const storyChapterCount = (session: StorySession): number =>
  Math.floor(session.questionsSolvedTotal / CHECKPOINT_INTERVAL) + 1

// First chosen interest id, if any (drives the card emoji).
const firstInterestId = (session: StorySession): StoryInterestId | undefined => session.theme.interestIds[0]

export const storySessionEmoji = (session: StorySession): string => {
  const first = firstInterestId(session)
  return first ? getInterestEmoji(first) : DEFAULT_STORY_EMOJI
}

// All interest labels joined for a readable subtitle (built-in ids first, then any freeform).
export const storyInterestsLabel = (session: StorySession): string => {
  const labels = session.theme.interestIds.map(getInterestLabel)
  const freeform = session.theme.freeformInterest?.trim()
  if (freeform) labels.push(freeform)
  return labels.join(', ')
}

// A robust, never-empty heading: prefer a real protagonist name, then the interests, then a
// generic fallback (so even a fallback-only/legacy session reads sensibly in the library).
export const storySessionTitle = (session: StorySession): string => {
  const protagonist = session.theme.protagonist?.trim()
  if (protagonist) return protagonist
  const interests = storyInterestsLabel(session)
  if (interests) return interests
  return 'Untitled adventure'
}

export const summarizeStorySession = (session: StorySession): StorySessionSummary => ({
  id: session.id,
  emoji: storySessionEmoji(session),
  title: storySessionTitle(session),
  premise: session.theme.premise?.trim() ?? '',
  interestsLabel: storyInterestsLabel(session),
  questionsSolved: session.questionsSolvedTotal,
  chapterCount: storyChapterCount(session),
  status: session.status,
  updatedAt: session.updatedAt,
})

// Most-recently-played first. `updatedAt` advances on every meaningful play transition (solve,
// checkpoint, choice) but NOT on pure review navigation, so it is a faithful "last played".
// Ties break on createdAt (newer first) then id for a fully deterministic order.
export const sortStorySessionsByRecent = (sessions: StorySession[]): StorySession[] =>
  [...sessions].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })
