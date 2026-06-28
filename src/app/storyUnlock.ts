// PURE Story Mode unlock gate (extracted from LearningApp.tsx).
//
// Story Mode unlocks only after the first two lessons — Balancing Equations and One-Step Equations —
// are completed (plan section 8). Kept React-free so the gate condition is unit-testable under
// `node --test` (the app has no DOM/React test harness); LearningApp just calls it with the current
// per-lesson progress map. Completion itself is delegated to the engine's `hasCompletedLesson`.

import { hasCompletedLesson, type ProgressByLesson } from '../engine'

export const isStoryUnlocked = (progressByLesson: ProgressByLesson): boolean =>
  hasCompletedLesson(progressByLesson['balancing-equations']) &&
  hasCompletedLesson(progressByLesson['one-step-equations'])
