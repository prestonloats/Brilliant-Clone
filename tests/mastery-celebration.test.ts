import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  lessons,
  skills,
  type Course,
  type Lesson,
  type LessonId,
  type LessonProgress,
  type SkillMastery,
} from '../src/domain'
import { createInitialProgress, restartLessonProgress, type ProgressByLesson } from '../src/engine'
import { getCompletionState } from '../src/course/courseHelpers'
import { getCourseMasterySummary, getNodeMasteryCelebration } from '../src/course/masteryCelebration'

// A clean, fully-correct completion: every assessed (non-concept) step right on the first try.
const masteredProgress = (lesson: Lesson): LessonProgress => {
  const assessed = lesson.steps.filter((s) => s.type !== 'concept')
  return {
    ...createInitialProgress('u', lesson.id),
    status: 'completed',
    currentStepIndex: lesson.steps.length - 1,
    completedAt: '2026-06-23T00:00:00.000Z',
    stepResults: Object.fromEntries(
      assessed.map((s) => [s.id, { correct: true, attempts: 1, feedback: 'ok' }]),
    ),
  }
}

// Every skill maxed out, so any lesson clears the mastery threshold.
const fullMastery: SkillMastery[] = skills.map((s) => ({
  userId: 'u',
  skillId: s.id,
  score: 1,
  attempts: 4,
  correct: 4,
  lastPracticedAt: '2026-06-23T00:00:00.000Z',
}))

// Zero mastery for a lesson's skills, so a clean completion still lands in "review-suggested".
const zeroMastery = (lesson: Lesson): SkillMastery[] =>
  lesson.skillIds.map((skillId) => ({
    userId: 'u',
    skillId,
    score: 0,
    attempts: 2,
    correct: 0,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))

const masterLessons = (ids: LessonId[]): ProgressByLesson => {
  const out: ProgressByLesson = {}
  for (const id of ids) out[id] = masteredProgress(lessons[id])
  return out
}

const sampleLessonId = algebraCourse.lessonOrder[0]
const sampleLesson = lessons[sampleLessonId]

test('a mastered lesson produces a full node celebration', () => {
  const assessed = sampleLesson.steps.filter((s) => s.type !== 'concept')
  assert.ok(assessed.length > 0, 'sample lesson must have at least one assessed step')

  const progress = masteredProgress(sampleLesson)
  assert.equal(getCompletionState(sampleLesson, progress, fullMastery), 'mastered')

  const celebration = getNodeMasteryCelebration(sampleLesson, progress, fullMastery)
  assert.equal(celebration.isMastered, true)
  assert.equal(celebration.badgeLabel, 'Mastered')
  assert.equal(celebration.className, 'is-mastered')
  assert.ok(celebration.icon.length > 0)
})

test('a completed-but-not-clean run is "completed", not mastered', () => {
  const assessed = sampleLesson.steps.filter((s) => s.type !== 'concept')
  const base = masteredProgress(sampleLesson)
  const dirty: LessonProgress = {
    ...base,
    stepResults: {
      ...base.stepResults,
      [assessed[0].id]: { correct: true, attempts: 2, feedback: 'ok' },
    },
  }

  assert.equal(getCompletionState(sampleLesson, dirty, fullMastery), 'completed')

  const celebration = getNodeMasteryCelebration(sampleLesson, dirty, fullMastery)
  assert.equal(celebration.isMastered, false)
  assert.equal(celebration.badgeLabel, '')
  assert.equal(celebration.icon, '')
  assert.equal(celebration.className, '')
})

test('a worse retake stays "mastered" when the best run was still 100%', () => {
  const assessed = sampleLesson.steps.filter((s) => s.type !== 'concept')
  const perfect = {
    scorePercent: 100,
    correctFirstTryCount: assessed.length,
    assessedStepCount: assessed.length,
    completedAt: '2026-06-23T00:00:00.000Z',
  }
  const worse = {
    scorePercent: Math.round(((assessed.length - 1) / assessed.length) * 100),
    correctFirstTryCount: assessed.length - 1,
    assessedStepCount: assessed.length,
    completedAt: '2026-06-24T00:00:00.000Z',
  }
  // The latest run was imperfect (one step took two tries), but a prior run was a clean 100%.
  const completedWithBest100: LessonProgress = {
    ...masteredProgress(sampleLesson),
    stepResults: {
      ...masteredProgress(sampleLesson).stepResults,
      [assessed[0].id]: { correct: true, attempts: 2, feedback: 'ok' },
    },
    latestScore: worse,
    bestScore: perfect,
    completionHistory: [perfect, worse],
  }

  assert.equal(getCompletionState(sampleLesson, completedWithBest100, fullMastery), 'mastered')
  const celebration = getNodeMasteryCelebration(sampleLesson, completedWithBest100, fullMastery)
  assert.equal(celebration.isMastered, true)
  assert.equal(celebration.className, 'is-mastered')
})

test('a completed run with low mastery is "review-suggested", not mastered', () => {
  const progress = masteredProgress(sampleLesson)
  const lowMastery = zeroMastery(sampleLesson)

  assert.equal(getCompletionState(sampleLesson, progress, lowMastery), 'review-suggested')

  const celebration = getNodeMasteryCelebration(sampleLesson, progress, lowMastery)
  assert.equal(celebration.isMastered, false)
  assert.equal(celebration.className, '')
})

test('a retake of a mastered lesson keeps the mastered node visuals', () => {
  const retake = restartLessonProgress(masteredProgress(sampleLesson), sampleLesson)
  assert.equal(retake.status, 'inProgress')
  // During a retake the live completion state is no longer "mastered" (the run reset)...
  assert.notEqual(getCompletionState(sampleLesson, retake, fullMastery), 'mastered')

  // ...but the node should still wear its mastered visuals from the prior clean completion.
  const celebration = getNodeMasteryCelebration(sampleLesson, retake, fullMastery)
  assert.equal(celebration.isMastered, true)
  assert.equal(celebration.className, 'is-mastered')
  assert.equal(celebration.badgeLabel, 'Mastered')
  assert.ok(celebration.icon.length > 0)
})

test('a retake of a completed-but-not-clean lesson does not show mastered visuals', () => {
  const assessed = sampleLesson.steps.filter((s) => s.type !== 'concept')
  const base = masteredProgress(sampleLesson)
  const dirty: LessonProgress = {
    ...base,
    stepResults: {
      ...base.stepResults,
      [assessed[0].id]: { correct: true, attempts: 2, feedback: 'ok' },
    },
  }
  const retake = restartLessonProgress(dirty, sampleLesson)

  const celebration = getNodeMasteryCelebration(sampleLesson, retake, fullMastery)
  assert.equal(celebration.isMastered, false)
  assert.equal(celebration.className, '')
})

test('a retake of a mastered lesson with low mastery drops the mastered visuals', () => {
  const retake = restartLessonProgress(masteredProgress(sampleLesson), sampleLesson)
  const celebration = getNodeMasteryCelebration(sampleLesson, retake, zeroMastery(sampleLesson))
  assert.equal(celebration.isMastered, false)
})

test('course summary keeps mastered subjects counted while they are being retaken', () => {
  const id = algebraCourse.lessonOrder[0]
  const progressByLesson: ProgressByLesson = {
    [id]: restartLessonProgress(masteredProgress(lessons[id]), lessons[id]),
  }

  const summary = getCourseMasterySummary(algebraCourse, lessons, progressByLesson, fullMastery)
  assert.equal(summary.masteredCount, 1)
  assert.deepEqual(summary.masteredLessonIds, [id])
  assert.equal(summary.completedCount, 1)
})

test('a lesson with no progress is not mastered', () => {
  const celebration = getNodeMasteryCelebration(sampleLesson, undefined, fullMastery)
  assert.equal(celebration.isMastered, false)
  assert.equal(celebration.badgeLabel, '')
  assert.equal(celebration.icon, '')
  assert.equal(celebration.className, '')
})

test('course summary with no progress is all zeros but still has copy', () => {
  const summary = getCourseMasterySummary(algebraCourse, lessons, {}, [])
  assert.equal(summary.totalLessons, 6)
  assert.equal(summary.masteredCount, 0)
  assert.equal(summary.completedCount, 0)
  assert.equal(summary.percentMastered, 0)
  assert.equal(summary.allMastered, false)
  assert.deepEqual(summary.masteredLessonIds, [])
  assert.ok(summary.headline.length > 0)
  assert.ok(summary.message.length > 0)
})

test('course summary reflects exactly two mastered subjects', () => {
  const ids = algebraCourse.lessonOrder.slice(0, 2)
  const summary = getCourseMasterySummary(algebraCourse, lessons, masterLessons(ids), fullMastery)

  assert.equal(summary.masteredCount, 2)
  assert.equal(summary.completedCount, 2)
  assert.equal(summary.allMastered, false)
  assert.equal(summary.masteredLessonIds.length, 2)
  assert.deepEqual(summary.masteredLessonIds, ids)
  assert.equal(summary.percentMastered, Math.round((2 / 6) * 100))
  assert.ok(summary.headline.includes('2'))
  assert.ok(summary.headline.includes('6'))
  assert.ok(summary.message.length > 0)
})

test('course summary celebrates a fully mastered course', () => {
  const summary = getCourseMasterySummary(
    algebraCourse,
    lessons,
    masterLessons(algebraCourse.lessonOrder),
    fullMastery,
  )

  assert.equal(summary.masteredCount, 6)
  assert.equal(summary.completedCount, 6)
  assert.equal(summary.allMastered, true)
  assert.equal(summary.percentMastered, 100)
  assert.deepEqual(summary.masteredLessonIds, algebraCourse.lessonOrder)
  assert.ok(summary.headline.includes(algebraCourse.title))
  assert.ok(summary.message.length > 0)
})

test('an empty course yields a safe, zeroed summary (no divide-by-zero)', () => {
  const emptyCourse: Course = { title: 'Empty', description: '', lessonOrder: [], lessons: [] }
  const summary = getCourseMasterySummary(emptyCourse, lessons, {}, [])

  assert.equal(summary.totalLessons, 0)
  assert.equal(summary.masteredCount, 0)
  assert.equal(summary.completedCount, 0)
  assert.equal(summary.percentMastered, 0)
  assert.equal(summary.allMastered, false)
  assert.deepEqual(summary.masteredLessonIds, [])
  assert.ok(summary.headline.length > 0)
  assert.ok(summary.message.length > 0)
})
