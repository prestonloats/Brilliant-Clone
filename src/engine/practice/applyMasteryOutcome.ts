// Single PURE update for one practiced question's effect on a skill's running mastery record, so both
// backends (Local + Firebase) share ONE formula instead of duplicating it inside updateSkillMastery.
// `score` is the rounded running correctness ratio (correct / attempts). Mirrors the shared
// applyPracticeOutcome that already de-duplicates the practice-state math.

import type { SkillId, SkillMastery } from '../../domain'

// A fresh, zeroed mastery record for a skill the learner has not practiced yet.
export const emptySkillMastery = (userId: string, skillId: SkillId, now: string): SkillMastery => ({
  userId,
  skillId,
  score: 0,
  attempts: 0,
  correct: 0,
  lastPracticedAt: now,
})

// Advance a mastery record by one attempt: bump attempts (and correct on success) and recompute the
// rounded correctness ratio. Pure; the caller supplies `now` so Local + Firebase stay identical.
export const applyMasteryOutcome = (existing: SkillMastery, correct: boolean, now: string): SkillMastery => {
  const attempts = existing.attempts + 1
  const correctAttempts = existing.correct + (correct ? 1 : 0)
  return {
    ...existing,
    score: Math.round((correctAttempts / attempts) * 100) / 100,
    attempts,
    correct: correctAttempts,
    lastPracticedAt: now,
  }
}
