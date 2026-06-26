// Pure helper for the developer-only "skip this question and count it correct" control in the
// regular lesson player. `buildDevSkipCompletion` maps a lesson step to how the player should
// COMPLETE it on a dev skip: always correct, with a marker feedback, advancing to the next step,
// and recording an attempt for graded steps but NOT for non-graded 'concept' info cards.
// `shouldShowLessonDevSkip` gates the control so it never appears while the learner is reviewing
// an already-answered step read-only. Imports are type-only so this file links in isolation (the
// test build transpiles only the listed entries and erases type imports at transpile time).
import type { LessonStep } from '../domain'
import type { CompleteOptions } from './types'

export const DEV_SKIP_FEEDBACK = 'Skipped (dev tools)'

export function buildDevSkipCompletion(step: LessonStep): {
  correct: boolean
  feedback: string
  options: CompleteOptions
} {
  // 'concept' cards are info-only (never graded), so a dev skip just advances without an attempt;
  // every other step type is a graded question whose skip records a (correct) attempt.
  const recordAttempt = step.type !== 'concept'
  return {
    correct: true,
    feedback: DEV_SKIP_FEEDBACK,
    options: { advance: true, recordAttempt },
  }
}

export function shouldShowLessonDevSkip(input: { devEnabled: boolean; isReviewing: boolean }): boolean {
  return input.devEnabled && !input.isReviewing
}
