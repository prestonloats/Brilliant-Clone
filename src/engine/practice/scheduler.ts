// Spaced-repetition scheduler for Story Mode practice (Phase 3b).
//
// PURE SM-2-lite over a `SkillPracticeState`: a correct first-try recall GROWS the interval (and
// nudges ease up); a miss RESETS the interval and brings the item back almost immediately
// ("resurface ones a learner got wrong sooner"). `isDue`/`overdueScore` let the selector prefer
// due/overdue skills. Time is injectable (ISO `now`) so scheduling is deterministic in tests.

import type { SkillPracticeState } from '../../domain'

export const MIN_EASE = 1.3
export const MAX_EASE = 3.0
// Interval ladder (in days) for the first two successful recalls, then geometric growth by ease.
export const FIRST_INTERVAL_DAYS = 1
export const SECOND_INTERVAL_DAYS = 3
// A miss resurfaces the skill very soon — within the same session — rather than days later.
export const LAPSE_INTERVAL_DAYS = 0.02 // ~30 minutes

const DAY_MS = 24 * 60 * 60 * 1000
const clampEase = (ease: number): number => Math.min(MAX_EASE, Math.max(MIN_EASE, ease))
const round1 = (value: number): number => Math.round(value * 10) / 10

export type ScheduleUpdate = Pick<SkillPracticeState, 'intervalDays' | 'ease' | 'dueAt' | 'lapses'>

export const nextSchedule = (
  state: SkillPracticeState,
  firstTryCorrect: boolean,
  now: string = new Date().toISOString(),
): ScheduleUpdate => {
  const nowMs = Date.parse(now)
  if (!firstTryCorrect) {
    // Lapse: shrink ease, reset the interval, and make it due again almost immediately.
    return {
      intervalDays: 0,
      ease: clampEase(state.ease - 0.2),
      dueAt: new Date(nowMs + LAPSE_INTERVAL_DAYS * DAY_MS).toISOString(),
      lapses: state.lapses + 1,
    }
  }
  // Correct recall: grow the interval up the ladder, then geometrically by the (raised) ease.
  const ease = clampEase(state.ease + 0.1)
  const intervalDays =
    state.intervalDays <= 0
      ? FIRST_INTERVAL_DAYS
      : state.intervalDays < SECOND_INTERVAL_DAYS
        ? SECOND_INTERVAL_DAYS
        : round1(state.intervalDays * ease)
  return {
    intervalDays,
    ease,
    dueAt: new Date(nowMs + intervalDays * DAY_MS).toISOString(),
    lapses: state.lapses,
  }
}

export const isDue = (state: SkillPracticeState, now: string = new Date().toISOString()): boolean =>
  Date.parse(state.dueAt) <= Date.parse(now)

// How overdue the item is, as a multiple of its interval: 0 when not due, growing the longer it
// sits past due. Lets the selector rank the most-overdue skills first with no extra persisted state.
export const overdueScore = (state: SkillPracticeState, now: string = new Date().toISOString()): number => {
  const nowMs = Date.parse(now)
  const dueMs = Date.parse(state.dueAt)
  if (nowMs <= dueMs) return 0
  const intervalMs = Math.max(DAY_MS * 0.0001, state.intervalDays * DAY_MS)
  return (nowMs - dueMs) / intervalMs
}
