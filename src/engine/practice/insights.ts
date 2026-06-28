// Story Mode practice insights (Phase 3 "measure / show the effect").
//
// PURE summaries over the practice store + the story attempt log, used by the UI to SHOW the effect
// of the learning-science techniques:
//   - `summarizePractice`  -> mastery progress (learning / practiced / mastered) + due counts;
//   - `computeRetention`   -> the headline "did it stick?" metric: first-try accuracy + latency on
//                             SPACED re-exposures of a skill vs. its first exposure.
// No I/O; deterministic given an injected `now`.

import type { AttemptEvent, SkillId, SkillPracticeState } from '../../domain'
import { isSkillMastered, masteryLevel, masteryProgress, type MasteryLevel } from './mastery'
import { isDue } from './scheduler'

export type SkillProgressView = {
  skillId: SkillId
  level: MasteryLevel
  proficiency: number
  // 0..1 progress toward mastery (reaches 1 only when actually mastered). Drives the Profile bars.
  masteryProgress: number
  streak: number
  mastered: boolean
  due: boolean
  totalAttempts: number
}

export type PracticeSummary = {
  bySkill: SkillProgressView[]
  masteredCount: number
  practicedCount: number
  learningCount: number
  dueCount: number
  totalRetrievals: number
}

// Per-skill mastery snapshot for the progress meters, plus rolled-up counts for headline badges.
// Skills are ordered by proficiency descending so the strongest surface first in the UI.
export function summarizePractice(
  practice: SkillPracticeState[],
  now: string = new Date().toISOString(),
): PracticeSummary {
  const bySkill: SkillProgressView[] = practice
    .map((state) => ({
      skillId: state.skillId,
      level: masteryLevel(state),
      proficiency: state.proficiency,
      masteryProgress: masteryProgress(state),
      streak: state.streak,
      mastered: isSkillMastered(state),
      due: isDue(state, now),
      totalAttempts: state.totalAttempts,
    }))
    .sort((a, b) => b.masteryProgress - a.masteryProgress)

  const count = (level: MasteryLevel) => bySkill.filter((entry) => entry.level === level).length
  return {
    bySkill,
    masteredCount: count('mastered'),
    practicedCount: count('practiced'),
    learningCount: count('learning'),
    dueCount: bySkill.filter((entry) => entry.due).length,
    totalRetrievals: practice.reduce((sum, state) => sum + state.totalAttempts, 0),
  }
}

export type SkillRetention = {
  skillId: SkillId
  firstTryAccuracyInitial: number // first-try accuracy on the FIRST exposure window
  firstTryAccuracyLater: number // first-try accuracy on later (spaced) exposures
  retentionLift: number // later - initial; positive = practice is "sticking"
  avgMsInitial: number
  avgMsLater: number
  exposures: number
}

export type RetentionReport = {
  bySkill: SkillRetention[]
  overallInitialAccuracy: number
  overallLaterAccuracy: number
  retentionLift: number
  sampleSize: number // total spaced (later) re-exposures measured
}

// Map a story attempt's persisted key (`arch:<id>` in `AttemptEvent.stepId`) to the skill it
// trained, so retention can be grouped by skill. Injected so this module stays dependency-light;
// callers pass `skillForStepId` (from the question-bank rebuild module).
export type SkillForStepId = (stepId: string) => SkillId | undefined

const round2 = (value: number): number => Math.round(value * 100) / 100
const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length)

// Retention lift per skill: compare first-try correctness (and latency) on the FIRST exposure to
// later, spaced exposures. Only `source:'story'` attempts are considered (lesson play is separate),
// and only skills with at least one LATER exposure are reported (a single exposure has no "stuck"
// signal yet). Attempts are ordered by timestamp; the first is "initial", the rest "later".
export function computeRetention(
  attempts: AttemptEvent[],
  skillFor: SkillForStepId,
): RetentionReport {
  const storyAttempts = attempts
    .filter((attempt) => attempt.source === 'story')
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at))

  const bySkillId = new Map<SkillId, AttemptEvent[]>()
  for (const attempt of storyAttempts) {
    const skillId = skillFor(attempt.stepId)
    if (!skillId) continue
    const list = bySkillId.get(skillId) ?? []
    list.push(attempt)
    bySkillId.set(skillId, list)
  }

  const bySkill: SkillRetention[] = []
  let initialCorrect = 0
  let initialTotal = 0
  let laterCorrect = 0
  let laterTotal = 0

  for (const [skillId, events] of bySkillId) {
    if (events.length < 2) continue // need at least one re-exposure to measure retention
    const initial = events.slice(0, 1)
    const later = events.slice(1)
    const acc = (list: AttemptEvent[]) => mean(list.map((event) => (event.correct ? 1 : 0)))
    const lat = (list: AttemptEvent[]) => mean(list.map((event) => event.msToAnswer))

    bySkill.push({
      skillId,
      firstTryAccuracyInitial: round2(acc(initial)),
      firstTryAccuracyLater: round2(acc(later)),
      retentionLift: round2(acc(later) - acc(initial)),
      avgMsInitial: Math.round(lat(initial)),
      avgMsLater: Math.round(lat(later)),
      exposures: events.length,
    })

    initialCorrect += initial.filter((event) => event.correct).length
    initialTotal += initial.length
    laterCorrect += later.filter((event) => event.correct).length
    laterTotal += later.length
  }

  const overallInitialAccuracy = initialTotal === 0 ? 0 : round2(initialCorrect / initialTotal)
  const overallLaterAccuracy = laterTotal === 0 ? 0 : round2(laterCorrect / laterTotal)
  return {
    bySkill: bySkill.sort((a, b) => b.retentionLift - a.retentionLift),
    overallInitialAccuracy,
    overallLaterAccuracy,
    retentionLift: round2(overallLaterAccuracy - overallInitialAccuracy),
    sampleSize: laterTotal,
  }
}
