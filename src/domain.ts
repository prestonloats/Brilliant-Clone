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

export type AttemptEvent = {
  id: string
  userId: string
  lessonId: LessonId
  stepId: string
  correct: boolean
  attemptCount: number
  msToAnswer: number
  at: string
}
