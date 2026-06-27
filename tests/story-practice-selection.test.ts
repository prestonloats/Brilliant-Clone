// Story Mode practice-aware selection proof (Phase 3b/3c/3d).
//
// `selectNextArchitecture` now folds the learning-science practice store into selection: it prefers
// DUE skills (spaced repetition), boosts the most OVERDUE ones, and lets the recency-weighted
// practice proficiency SUPERSEDE the lesson mastery ratio for struggle/mastered weighting. These
// tests pin those behaviors with injected `practice` + `now` so they stay deterministic, and confirm
// selection still never empties the pool when nothing is due.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LessonId, LessonProgress, SkillId, SkillMastery, SkillPracticeState } from '../src/domain'
import {
  ARCHITECTURE_CATALOG,
  selectNextArchitecture,
  type ProgressByLesson,
  type QuestionArchitecture,
  type SelectArchitectureInput,
} from '../src/engine'

const NOW = '2026-02-01T00:00:00.000Z'
const DAY_MS = 24 * 60 * 60 * 1000
const plusDays = (days: number): string => new Date(Date.parse(NOW) + days * DAY_MS).toISOString()

const completed = (lessonId: LessonId): LessonProgress => ({
  userId: 'u',
  lessonId,
  status: 'completed',
  currentStepIndex: 0,
  stepResults: {},
  startedAt: NOW,
  completedAt: NOW,
  updatedAt: NOW,
})

const practiceState = (skillId: SkillId, over: Partial<SkillPracticeState> = {}): SkillPracticeState => ({
  userId: 'u',
  skillId,
  proficiency: 0.9,
  streak: 0,
  intervalDays: 1,
  ease: 2.5,
  dueAt: NOW,
  lapses: 0,
  totalAttempts: 5,
  firstTryCorrect: 4,
  lastSeenAt: NOW,
  updatedAt: NOW,
  ...over,
})

const makeMastery = (skillId: SkillId, score: number): SkillMastery => ({
  userId: 'u',
  skillId,
  score,
  attempts: 10,
  correct: Math.round(score * 10),
  lastPracticedAt: NOW,
})

const byId = (id: string): QuestionArchitecture => {
  const found = ARCHITECTURE_CATALOG.find((architecture) => architecture.id === id)
  assert.ok(found, `architecture "${id}" not found`)
  return found
}

const select = (over: Partial<SelectArchitectureInput>): QuestionArchitecture | null =>
  selectNextArchitecture({ progressByLesson: {}, servedKeys: [], now: NOW, rng: () => 0, ...over })

// Both architectures are ENTRY-TIER (no mastery prerequisite) so these weighting/spacing tests are
// not affected by the mastery-gate; they train DIFFERENT skills so interleaving does not collapse them.
const twoSkillPool = [byId('one-step-linear'), byId('coordinate-walk')] // one-step-equations, coordinate-plane
const twoSkillProgress: ProgressByLesson = {
  'one-step-equations': completed('one-step-equations'),
  'coordinate-plane': completed('coordinate-plane'),
}

// --- Spaced repetition: due-first --------------------------------------------------------------

test('prefers a DUE / never-practiced skill over one whose interval has not elapsed', () => {
  // one-step-equations is NOT due (dueAt 5 days out); coordinate-plane has no practice -> treated as
  // due. Due-first restricts to coordinate-walk regardless of rng, so the not-due skill never serves.
  const practice = [practiceState('one-step-equations', { dueAt: plusDays(5) })]
  for (let i = 0; i < 30; i += 1) {
    assert.equal(
      select({ pool: twoSkillPool, progressByLesson: twoSkillProgress, practice, rng: () => i / 30 })?.id,
      'coordinate-walk',
    )
  }
})

test('falls back to the full pool when NOTHING is due (never empties)', () => {
  // Both skills not due -> due-first relaxes and keeps both, so a question is still always served.
  const practice = [
    practiceState('one-step-equations', { dueAt: plusDays(3) }),
    practiceState('coordinate-plane', { dueAt: plusDays(4) }),
  ]
  const ids = new Set<string>()
  for (let i = 0; i < 30; i += 1) {
    const result = select({ pool: twoSkillPool, progressByLesson: twoSkillProgress, practice, rng: () => i / 30 })
    assert.ok(result)
    ids.add(result.id)
  }
  // Both remain reachable (the pool was not narrowed to one).
  assert.ok(ids.has('one-step-linear') && ids.has('coordinate-walk'))
})

// --- Spaced repetition: overdue boost ---------------------------------------------------------

test('boosts the MORE overdue of two due skills', () => {
  // Both due + equal proficiency. coordinate-plane is 2 intervals overdue (boost), one-step just due.
  // Control: both just due -> weights equal (0.75 each); at rng 0.4 the first (linear) wins.
  const equal = [practiceState('one-step-equations'), practiceState('coordinate-plane')]
  assert.equal(
    select({ pool: twoSkillPool, progressByLesson: twoSkillProgress, practice: equal, rng: () => 0.4 })?.id,
    'one-step-linear',
  )
  // With coordinate-plane now overdue (dueAt 2 days in the past -> overdue boost), the same rng flips.
  const overdue = [practiceState('one-step-equations'), practiceState('coordinate-plane', { dueAt: plusDays(-2) })]
  assert.equal(
    select({ pool: twoSkillPool, progressByLesson: twoSkillProgress, practice: overdue, rng: () => 0.4 })?.id,
    'coordinate-walk',
  )
})

// --- Mastery: practice proficiency supersedes the lesson mastery ratio -------------------------

test('practice proficiency supersedes the lesson mastery score for weighting', () => {
  // Lesson mastery says one-step is WEAK (0.2 -> struggle x2), but the practice store says it is
  // strong (proficiency 0.9 -> mastered x0.75). The practice signal must win.
  const mastery = [makeMastery('one-step-equations', 0.2)]
  const practice = [practiceState('one-step-equations', { proficiency: 0.9 })]

  // Mastery-only (no practice): one-step is boosted (x2) -> at rng 0.5 the struggling skill is picked.
  assert.equal(
    select({ pool: twoSkillPool, progressByLesson: twoSkillProgress, mastery, rng: () => 0.5 })?.id,
    'one-step-linear',
  )
  // With practice proficiency 0.9 it is DOWN-weighted (x0.75) instead, so the same rng picks the other.
  assert.equal(
    select({ pool: twoSkillPool, progressByLesson: twoSkillProgress, mastery, practice, rng: () => 0.5 })?.id,
    'coordinate-walk',
  )
})

// --- Mastery learning: tier-unlock gating -----------------------------------------------------

test('gates a harder architecture until its prerequisite skill is mastered', () => {
  const pool = [byId('one-step-linear'), byId('two-step-linear')] // two-step requires one-step mastered
  const progressByLesson: ProgressByLesson = {
    'one-step-equations': completed('one-step-equations'),
    'two-step-equations': completed('two-step-equations'),
  }
  // No practice yet: one-step is not mastered, so two-step-linear stays LOCKED across all rng.
  for (let i = 0; i < 30; i += 1) {
    assert.equal(select({ pool, progressByLesson, rng: () => i / 30 })?.id, 'one-step-linear')
  }
  // Mastering one-step (proficiency high + streak >= 3) unlocks two-step-linear -> it becomes reachable.
  const practice = [practiceState('one-step-equations', { proficiency: 1, streak: 3 })]
  const reachable = new Set<string>()
  for (let i = 0; i < 30; i += 1) {
    const result = select({ pool, progressByLesson, practice, rng: () => i / 30 })
    if (result) reachable.add(result.id)
  }
  assert.ok(reachable.has('two-step-linear'))
})
