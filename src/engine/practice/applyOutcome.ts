// Single PURE entry point for advancing a SkillPracticeState by one practiced question (Phase 3a).
//
// Composes the recency-weighted mastery update (`nextProficiency` + streak) with the
// spaced-repetition reschedule (`nextSchedule`) and bumps the lifetime counts, so BOTH backends
// (Local + Firebase) and the tests share ONE implementation instead of duplicating the math the
// way `updateSkillMastery` does today. Deterministic given `outcome.at`.

import type { PracticeOutcome, SkillPracticeState } from '../../domain'
import { nextProficiency } from './mastery'
import { nextSchedule } from './scheduler'

export const applyPracticeOutcome = (
  state: SkillPracticeState,
  outcome: PracticeOutcome,
): SkillPracticeState => {
  const now = outcome.at ?? new Date().toISOString()
  const { firstTryCorrect } = outcome
  return {
    ...state,
    proficiency: nextProficiency(state, firstTryCorrect),
    streak: firstTryCorrect ? state.streak + 1 : 0,
    ...nextSchedule(state, firstTryCorrect, now),
    totalAttempts: state.totalAttempts + 1,
    firstTryCorrect: state.firstTryCorrect + (firstTryCorrect ? 1 : 0),
    lastSeenAt: now,
    updatedAt: now,
  }
}
