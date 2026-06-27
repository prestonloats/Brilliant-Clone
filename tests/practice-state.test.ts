// Story Mode learning-science practice engine proof (Phase 3).
//
// `applyPracticeOutcome` is the single pure update both backends + the story controller drive from,
// composing the recency-weighted mastery estimate (`nextProficiency` + streak + `isSkillMastered`)
// with the SM-2-lite scheduler (`nextSchedule` + `isDue` + `overdueScore`). These tests pin down
// the retrieval signal (first-try correctness), the "grow on success / resurface on miss" schedule,
// the mastery flip, and determinism given an injected `at`/`now`. All pure — no I/O.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SkillPracticeState } from '../src/domain'
import {
  applyPracticeOutcome,
  createInitialPracticeState,
  FIRST_INTERVAL_DAYS,
  INITIAL_EASE,
  isDue,
  isSkillMastered,
  masteryLevel,
  nextProficiency,
  nextSchedule,
  overdueScore,
  PRACTICE_MASTERY_STREAK,
  SECOND_INTERVAL_DAYS,
} from '../src/engine'

const DAY_MS = 24 * 60 * 60 * 1000
const T0 = '2026-01-01T00:00:00.000Z'
const plusDays = (iso: string, days: number): string => new Date(Date.parse(iso) + days * DAY_MS).toISOString()

const correct = (at: string) => ({ firstTryCorrect: true, at })
const miss = (at: string) => ({ firstTryCorrect: false, at })

// Apply a sequence of outcomes from a fresh state, returning the final state.
const replay = (
  outcomes: { firstTryCorrect: boolean; at: string }[],
  start = createInitialPracticeState('u', 'one-step-equations', T0),
): SkillPracticeState => outcomes.reduce((state, outcome) => applyPracticeOutcome(state, outcome), start)

// --- Initial state --------------------------------------------------------------------------

test('a fresh practice state is empty, neutral-ease, and immediately due', () => {
  const state = createInitialPracticeState('u', 'one-step-equations', T0)
  assert.equal(state.proficiency, 0)
  assert.equal(state.streak, 0)
  assert.equal(state.intervalDays, 0)
  assert.equal(state.ease, INITIAL_EASE)
  assert.equal(state.totalAttempts, 0)
  assert.equal(state.firstTryCorrect, 0)
  assert.equal(state.lapses, 0)
  // A never-seen skill is due now so it surfaces for a first retrieval.
  assert.equal(isDue(state, T0), true)
  assert.equal(masteryLevel(state), 'learning')
})

// --- Retrieval signal (proficiency EWMA) ----------------------------------------------------

test('the first observation seeds proficiency directly (not diluted by the 0 start)', () => {
  const fresh = createInitialPracticeState('u', 'one-step-equations', T0)
  assert.equal(nextProficiency(fresh, true), 1)
  assert.equal(nextProficiency(fresh, false), 0)
})

test('proficiency is a recency-weighted EWMA after the first attempt', () => {
  // correct then miss: 1, then 1*0.6 + 0*0.4 = 0.6.
  const afterCorrect = applyPracticeOutcome(createInitialPracticeState('u', 'one-step-equations', T0), correct(T0))
  assert.equal(afterCorrect.proficiency, 1)
  const afterMiss = applyPracticeOutcome(afterCorrect, miss(plusDays(T0, 1)))
  assert.equal(afterMiss.proficiency, 0.6)
  assert.equal(afterMiss.streak, 0)
  assert.equal(afterMiss.firstTryCorrect, 1)
  assert.equal(afterMiss.totalAttempts, 2)
})

// --- Mastery signal -------------------------------------------------------------------------

test('mastery requires high proficiency AND a streak of first-try corrects', () => {
  const states = [T0, plusDays(T0, 1), plusDays(T0, 4)].map((at) => correct(at))
  const mastered = replay(states)
  assert.equal(mastered.streak, PRACTICE_MASTERY_STREAK)
  assert.equal(mastered.proficiency, 1)
  assert.equal(isSkillMastered(mastered), true)
  assert.equal(masteryLevel(mastered), 'mastered')

  // A single miss breaks the streak, so mastery is immediately lost even though proficiency stays high.
  const lapsed = applyPracticeOutcome(mastered, miss(plusDays(T0, 5)))
  assert.equal(lapsed.streak, 0)
  assert.equal(isSkillMastered(lapsed), false)
})

// --- Spaced repetition schedule -------------------------------------------------------------

test('a correct recall grows the interval up the ladder then geometrically', () => {
  const first = nextSchedule(createInitialPracticeState('u', 'one-step-equations', T0), true, T0)
  assert.equal(first.intervalDays, FIRST_INTERVAL_DAYS) // 0 -> 1
  assert.equal(first.dueAt, plusDays(T0, FIRST_INTERVAL_DAYS))

  const afterOne = replay([correct(T0)])
  const second = nextSchedule(afterOne, true, T0)
  assert.equal(second.intervalDays, SECOND_INTERVAL_DAYS) // 1 -> 3

  const afterTwo = replay([correct(T0), correct(T0)])
  const third = nextSchedule(afterTwo, true, T0)
  assert.ok(third.intervalDays > SECOND_INTERVAL_DAYS) // 3 -> 3 * ease
})

test('a miss resets the interval and resurfaces the skill almost immediately', () => {
  const mastered = replay([correct(T0), correct(plusDays(T0, 1)), correct(plusDays(T0, 4))])
  const at = plusDays(T0, 5)
  const lapsed = applyPracticeOutcome(mastered, miss(at))
  assert.equal(lapsed.intervalDays, 0)
  assert.equal(lapsed.lapses, 1)
  assert.ok(lapsed.ease < mastered.ease) // ease shrinks on a lapse
  // Due again within the hour, not days later ("resurface ones a learner got wrong sooner").
  const dueInMs = Date.parse(lapsed.dueAt) - Date.parse(at)
  assert.ok(dueInMs > 0 && dueInMs < 60 * 60 * 1000)
})

test('isDue / overdueScore rank items by how far past due they are', () => {
  // After one correct recall the item is due ~1 day later.
  const scheduled = replay([correct(T0)])
  assert.equal(isDue(scheduled, plusDays(T0, 0.5)), false)
  assert.equal(isDue(scheduled, plusDays(T0, 1)), true)
  // One interval (1 day) overdue -> ~1.0; not due -> 0.
  assert.equal(overdueScore(scheduled, plusDays(T0, 0.5)), 0)
  assert.ok(Math.abs(overdueScore(scheduled, plusDays(T0, 2)) - 1) < 1e-9)
})

// --- Determinism ----------------------------------------------------------------------------

test('applyPracticeOutcome is deterministic given an injected timestamp', () => {
  const outcomes = [correct(T0), miss(plusDays(T0, 1)), correct(plusDays(T0, 2))]
  assert.deepEqual(replay(outcomes), replay(outcomes))
})
