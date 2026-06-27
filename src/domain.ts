// Public domain barrel.
//
// Content-model types and course/lesson data now live under `src/content/*`, split so
// each lesson can be edited in isolation. This file re-exports them so every existing
// import from './domain' keeps working unchanged, and it owns the runtime/persistence
// types (user profile, progress, mastery, attempts) used by the app and backends.

export type * from './content/types'

import type { LessonId, SkillId } from './content/types'

export { skills } from './content/skills'
export { algebraCourse } from './content/course'
export {
  lessons,
  balancingEquationsLesson,
  oneStepEquationsLesson,
  twoStepEquationsLesson,
  likeTermsVariablesBothSidesLesson,
  coordinatePlaneLesson,
  graphingLinesLesson,
} from './content/lessons'

// Story Mode content/session types live with the content model but are part of the
// runtime/persistence surface, so they are re-exported here alongside the other
// persistence types (LessonProgress, SkillMastery, ...) for one-stop importing.
export type {
  StoryInterestId,
  StoryInterest,
  SceneId,
  CharacterPreset,
  CustomCharacter,
  MainCharacterSource,
  StoryTheme,
  StorySegment,
  ChapterBeat,
  ThemedQuestion,
  StorySessionStatus,
  StorySession,
} from './content/storyTypes'

export type UserProfile = {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  // Whether the account's email ownership has been confirmed. Local demo accounts are
  // always treated as verified; Firebase reflects the live Auth user's `emailVerified`.
  emailVerified?: boolean
  createdAt: string
}

export type StepResult = {
  correct: boolean
  attempts: number
  feedback: string
}

export type LessonScore = {
  scorePercent: number
  correctFirstTryCount: number
  assessedStepCount: number
  completedAt: string
}

export type LessonProgress = {
  userId: string
  lessonId: LessonId
  status: 'notStarted' | 'inProgress' | 'completed'
  currentStepIndex: number
  stepResults: Record<string, StepResult>
  latestScore?: LessonScore
  bestScore?: LessonScore
  completionHistory?: LessonScore[]
  startedAt: string
  completedAt?: string
  updatedAt: string
}

export type SkillMastery = {
  userId: string
  skillId: SkillId
  score: number
  attempts: number
  correct: number
  lastPracticedAt: string
}

// Per-user, per-skill learning-science state for Story Mode practice (Phase 3). This is the
// dedicated practice store the NARROWED pure-review invariant allows Story Mode to write: it is
// kept SEPARATE from the lesson `SkillMastery` ratio (a naive cumulative correct/attempts) so the
// spaced-repetition schedule + recency-weighted mastery estimate never corrupt lesson grading.
export type SkillPracticeState = {
  userId: string
  skillId: SkillId
  // Recency-weighted (EWMA) estimate of FIRST-TRY recall success, 0..1 — the retrieval-strength signal.
  proficiency: number
  // Consecutive first-try-correct retrievals; resets to 0 on any miss. Part of the mastery signal.
  streak: number
  // Spaced-repetition schedule (SM-2-lite): current interval, ease factor, and when it is next due.
  intervalDays: number
  ease: number
  dueAt: string
  // Times a scheduled item was missed (its interval reset); useful for insights + leech detection.
  lapses: number
  // Lifetime retrieval counts for insights / transparency.
  totalAttempts: number
  firstTryCorrect: number
  lastSeenAt: string
  updatedAt: string
}

// The signal recorded for ONE practiced question: whether the learner got it right on the FIRST
// try (the retrieval-practice measure). `at` is injectable so the schedule + tests are deterministic.
export type PracticeOutcome = {
  firstTryCorrect: boolean
  at?: string
}

// Which surface produced a retrieval attempt. Additive/optional for back-compat: legacy events and
// ordinary lesson play omit it (treated as 'lesson'); Story Mode practice records 'story' so
// learning-science measurement can separate guided lessons from spaced/interleaved practice.
export type AttemptSource = 'lesson' | 'story'

export type AttemptEvent = {
  id: string
  userId: string
  lessonId: LessonId
  stepId: string
  correct: boolean
  attemptCount: number
  msToAnswer: number
  at: string
  source?: AttemptSource
}
