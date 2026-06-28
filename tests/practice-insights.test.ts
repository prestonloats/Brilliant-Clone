// Story Mode practice insights proof (Phase 3 "measure / show the effect").
//
// `summarizePractice` rolls per-skill states into mastery-progress meters + due/headline counts;
// `computeRetention` is the "did it stick?" metric — first-try accuracy on the FIRST exposure vs
// later SPACED re-exposures, grouped by skill (only `source:'story'` attempts). Both are pure and
// deterministic given an injected `now`.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AttemptEvent, LessonId, SkillId, SkillPracticeState } from '../src/domain'
import { computeRetention, PRACTICE_MASTERY_STREAK, skillForStepId, summarizePractice } from '../src/engine'

const NOW = '2026-02-01T00:00:00.000Z'
const DAY_MS = 24 * 60 * 60 * 1000
const plusDays = (days: number): string => new Date(Date.parse(NOW) + days * DAY_MS).toISOString()

const practiceState = (skillId: SkillId, over: Partial<SkillPracticeState> = {}): SkillPracticeState => ({
  userId: 'u',
  skillId,
  proficiency: 0.9,
  streak: 3,
  intervalDays: 3,
  ease: 2.6,
  dueAt: NOW,
  lapses: 0,
  totalAttempts: 5,
  firstTryCorrect: 4,
  lastSeenAt: NOW,
  updatedAt: NOW,
  ...over,
})

// A story attempt against an architecture key (`arch:<id>`), the form `recordPracticeAttempt` writes.
const storyAttempt = (archId: string, correct: boolean, at: string, ms = 1000): AttemptEvent => ({
  id: `${archId}:${at}`,
  userId: 'u',
  lessonId: 'one-step-equations' as LessonId,
  stepId: `arch:${archId}`,
  correct,
  attemptCount: 1,
  msToAnswer: ms,
  at,
  source: 'story',
})

// --- summarizePractice ----------------------------------------------------------------------

test('summarizePractice rolls states into mastery levels and due counts', () => {
  const summary = summarizePractice(
    [
      practiceState('one-step-equations', { proficiency: 0.95, streak: PRACTICE_MASTERY_STREAK, dueAt: plusDays(2) }), // mastered, not due
      practiceState('two-step-equations', { proficiency: 0.6, streak: 1, dueAt: NOW }), // practiced, due
      practiceState('graphing-lines', { proficiency: 0.2, streak: 0, dueAt: plusDays(-1) }), // learning, due
    ],
    NOW,
  )

  assert.equal(summary.masteredCount, 1)
  assert.equal(summary.practicedCount, 1)
  assert.equal(summary.learningCount, 1)
  assert.equal(summary.dueCount, 2)
  // Ordered by proficiency descending.
  assert.deepEqual(
    summary.bySkill.map((entry) => entry.skillId),
    ['one-step-equations', 'two-step-equations', 'graphing-lines'],
  )
})

test('summarizePractice is empty-safe', () => {
  const summary = summarizePractice([], NOW)
  assert.deepEqual(summary.bySkill, [])
  assert.equal(summary.masteredCount, 0)
  assert.equal(summary.totalRetrievals, 0)
})

// --- computeRetention ("did it stick?") -----------------------------------------------------

test('computeRetention reports first-try accuracy lift on spaced re-exposures', () => {
  // one-step: missed first, then correct on all later spaced exposures -> strong positive lift.
  const attempts: AttemptEvent[] = [
    storyAttempt('one-step-linear', false, plusDays(0), 4000),
    storyAttempt('one-step-linear', true, plusDays(1), 2000),
    storyAttempt('one-step-linear', true, plusDays(3), 1500),
  ]
  const report = computeRetention(attempts, skillForStepId)
  assert.equal(report.bySkill.length, 1)
  const skill = report.bySkill[0]
  assert.equal(skill.skillId, 'one-step-equations')
  assert.equal(skill.firstTryAccuracyInitial, 0)
  assert.equal(skill.firstTryAccuracyLater, 1)
  assert.equal(skill.retentionLift, 1)
  assert.ok(skill.avgMsLater < skill.avgMsInitial) // faster recall later, too
  assert.equal(report.sampleSize, 2)
})

test('computeRetention ignores lesson attempts and single-exposure skills', () => {
  const attempts: AttemptEvent[] = [
    // A lesson attempt (no source:'story') must be excluded entirely.
    { ...storyAttempt('one-step-linear', true, plusDays(0)), source: undefined },
    // A story skill seen only ONCE has no re-exposure, so it is not reported.
    storyAttempt('line-value', true, plusDays(0)),
  ]
  const report = computeRetention(attempts, skillForStepId)
  assert.deepEqual(report.bySkill, [])
  assert.equal(report.sampleSize, 0)
})
