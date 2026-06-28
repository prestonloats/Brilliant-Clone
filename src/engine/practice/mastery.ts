// Recency-weighted mastery estimate for Story Mode practice (Phase 3d foundation).
//
// PURE helpers over a `SkillPracticeState`: a fresh-state factory, an EWMA proficiency update
// (recency-weighted, UNLIKE the lesson `SkillMastery` cumulative ratio), and the mastery signal
// that gates harder material. No I/O, fully unit-testable under node:test.

import type { SkillId, SkillPracticeState } from '../../domain'

// Weight on the newest retrieval in the EWMA: higher reacts faster to recent recalls.
export const PROFICIENCY_ALPHA = 0.4
// A skill is "mastered" only when recent recall is both HIGH and STABLE: a high EWMA proficiency
// AND a run of consecutive first-try corrects, so one lucky answer can never flip mastery. Tuned to
// be demanding — mastery takes sustained, unaided accuracy, and a single miss sets it back.
export const PRACTICE_MASTERY_THRESHOLD = 0.9
export const PRACTICE_MASTERY_STREAK = 5
// "Practiced" (mid) level: enough first-try success to be past pure guessing, but not yet mastered.
export const PRACTICE_PRACTICED_THRESHOLD = 0.5
// Default SM-2 ease for a brand-new skill (mirrors the scheduler's neutral starting point).
export const INITIAL_EASE = 2.5

export type MasteryLevel = 'learning' | 'practiced' | 'mastered'

export const createInitialPracticeState = (
  userId: string,
  skillId: SkillId,
  now: string = new Date().toISOString(),
): SkillPracticeState => ({
  userId,
  skillId,
  proficiency: 0,
  streak: 0,
  intervalDays: 0,
  ease: INITIAL_EASE,
  dueAt: now,
  lapses: 0,
  totalAttempts: 0,
  firstTryCorrect: 0,
  lastSeenAt: now,
  updatedAt: now,
})

// EWMA toward 1 (first-try correct) or 0 (miss). The FIRST observation seeds the estimate directly
// so a single attempt is not diluted by the 0 starting point. Rounded to 3 dp for stable storage.
export const nextProficiency = (state: SkillPracticeState, firstTryCorrect: boolean): number => {
  const target = firstTryCorrect ? 1 : 0
  if (state.totalAttempts === 0) return target
  const blended = state.proficiency * (1 - PROFICIENCY_ALPHA) + target * PROFICIENCY_ALPHA
  return Math.round(blended * 1000) / 1000
}

export const isSkillMastered = (state: SkillPracticeState): boolean =>
  state.proficiency >= PRACTICE_MASTERY_THRESHOLD && state.streak >= PRACTICE_MASTERY_STREAK

// A coarse 3-level label for UI meters: mastered, actively practiced (some success), or still learning.
export const masteryLevel = (state: SkillPracticeState): MasteryLevel => {
  if (isSkillMastered(state)) return 'mastered'
  if (state.totalAttempts > 0 && state.proficiency >= PRACTICE_PRACTICED_THRESHOLD) return 'practiced'
  return 'learning'
}

// Progress toward MASTERY (0..1), reaching 1 EXACTLY when `isSkillMastered` is true. Combines the
// two mastery requirements — recall proficiency vs. its threshold AND the first-try streak vs. its
// target — so a full bar always means "mastered" (high recall alone is not enough; consistency
// counts). Drives the Profile mastery bars so the visual can never disagree with the mastery state.
export const masteryProgress = (state: SkillPracticeState): number => {
  const proficiencyPart = Math.min(state.proficiency / PRACTICE_MASTERY_THRESHOLD, 1)
  const streakPart = Math.min(state.streak / PRACTICE_MASTERY_STREAK, 1)
  return Math.round(((proficiencyPart + streakPart) / 2) * 100) / 100
}
