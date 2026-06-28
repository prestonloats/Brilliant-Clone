// Locks the PURE Story Mode unlock gate extracted from LearningApp.tsx into src/app/storyUnlock.ts.
// LearningApp is React (no DOM/node test harness), so the "completed the first two lessons" gate was
// pulled into a React-free helper that this suite pins down — including its delegation to the
// engine's hasCompletedLesson (a recorded score, not just status:'completed', counts).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LessonId, LessonProgress, LessonScore } from '../src/domain'
import type { ProgressByLesson } from '../src/engine'
import { isStoryUnlocked } from '../src/app/storyUnlock'

const ISO = '2026-06-25T00:00:00.000Z'

const progress = (lessonId: LessonId, over: Partial<LessonProgress> = {}): LessonProgress => ({
  userId: 'u1',
  lessonId,
  status: 'inProgress',
  currentStepIndex: 0,
  stepResults: {},
  startedAt: ISO,
  updatedAt: ISO,
  ...over,
})

const completed = (lessonId: LessonId): LessonProgress => progress(lessonId, { status: 'completed' })

test('Story Mode unlocks only when BOTH gating lessons are completed', () => {
  const both: ProgressByLesson = {
    'balancing-equations': completed('balancing-equations'),
    'one-step-equations': completed('one-step-equations'),
  }
  assert.equal(isStoryUnlocked(both), true)
})

test('Story Mode stays locked when either gating lesson is missing or incomplete', () => {
  assert.equal(isStoryUnlocked({}), false)
  assert.equal(isStoryUnlocked({ 'balancing-equations': completed('balancing-equations') }), false)
  assert.equal(isStoryUnlocked({ 'one-step-equations': completed('one-step-equations') }), false)

  const oneIncomplete: ProgressByLesson = {
    'balancing-equations': completed('balancing-equations'),
    'one-step-equations': progress('one-step-equations', { status: 'inProgress' }),
  }
  assert.equal(isStoryUnlocked(oneIncomplete), false)
})

test('completing OTHER lessons does not unlock Story Mode', () => {
  const wrong: ProgressByLesson = {
    'two-step-equations': completed('two-step-equations'),
    'coordinate-plane': completed('coordinate-plane'),
  }
  assert.equal(isStoryUnlocked(wrong), false)
})

test('the gate delegates completion to hasCompletedLesson (a recorded score counts as completed)', () => {
  const score: LessonScore = { scorePercent: 90, correctFirstTryCount: 9, assessedStepCount: 10, completedAt: ISO }
  const viaScore: ProgressByLesson = {
    // status is only 'inProgress', but a recorded latestScore still reads as completed via the engine.
    'balancing-equations': progress('balancing-equations', { latestScore: score }),
    'one-step-equations': completed('one-step-equations'),
  }
  assert.equal(isStoryUnlocked(viaScore), true)
})
