// Shared engine types and constants.
//
// Leaf module for the engine: it owns the result, course-summary, recommendation, and
// lesson-graph types plus the mastery threshold used across the checker, progress,
// recommendation, and graph modules. It only imports content-model types from the domain
// barrel so the other engine modules can build on it without creating cycles.

import type { LessonId, LessonProgress, LessonScore } from '../domain'

export type CheckResult = {
  correct: boolean
  feedback: string
  reveal?: string
  retryGuidance?: string
}

export type BalanceCheckMeta = {
  movedOneSideOnly?: boolean
}

export type ProgressByLesson = Partial<Record<LessonId, LessonProgress>>

export const MASTERY_READY_THRESHOLD = 0.65

export type CourseProgressSummary = {
  totalLessons: number
  completedLessons: number
  percentComplete: number
  lastCompletedLessonId?: LessonId
  recommendedLessonId: LessonId
  recommendedAction: 'start' | 'continue' | 'view-summary'
  lastCompletedLatestScore?: LessonScore
  lastCompletedBestScore?: LessonScore
  recommendedLatestScore?: LessonScore
  recommendedBestScore?: LessonScore
}

export type NextLessonRecommendation = {
  // The lesson the learner should open next, when there is one. Omitted for a review
  // recommendation (stay on the just-finished lesson) and for end-of-path.
  lessonId?: LessonId
  kind: 'review' | 'next' | 'complete'
  title: string
  body: string
}

// How one path stage connects to the previous one. Derived from the dependency
// graph so the path page can draw a chain that visibly splits and merges.
export type LessonGraphConnector = 'start' | 'linear' | 'split' | 'merge' | 'parallel'

export type LessonGraphNode = {
  id: LessonId
  // Longest prerequisite distance from a root lesson; used as the vertical row.
  rank: number
  prerequisites: LessonId[]
  // Lessons that list this lesson as one of their prerequisites.
  unlocks: LessonId[]
}

export type LessonGraphStage = {
  rank: number
  connector: LessonGraphConnector
  nodeIds: LessonId[]
}

export type LessonGraph = {
  nodes: Record<LessonId, LessonGraphNode>
  stages: LessonGraphStage[]
}
