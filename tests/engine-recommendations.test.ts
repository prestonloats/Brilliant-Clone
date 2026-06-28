import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  algebraCourse,
  balancingEquationsLesson,
  lessons,
  type LessonId,
  type LessonProgress,
  type SkillMastery,
} from '../src/domain'
import {
  createInitialProgress,
  getCourseProgressSummary,
  getRecommendedNextLesson,
  getRecommendedPathLessonId,
  isLessonUnlocked,
  type ProgressByLesson,
} from '../src/engine'

const completedProgress = (lessonId: LessonId): LessonProgress => ({
  ...createInitialProgress('user-1', lessonId),
  status: 'completed',
  currentStepIndex: lessons[lessonId].steps.length - 1,
  completedAt: '2026-06-23T00:00:00.000Z',
})

// Progress map with the given lessons marked completed, for branch-aware recommendation tests.
const completedThrough = (...lessonIds: LessonId[]): ProgressByLesson =>
  lessonIds.reduce<ProgressByLesson>((accumulator, lessonId) => {
    accumulator[lessonId] = completedProgress(lessonId)
    return accumulator
  }, {})

test('recommendations distinguish clean mastery from repeated misses', () => {
  const cleanMastery: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 1,
    attempts: 5,
    correct: 5,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const missedMastery: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 0.62,
    attempts: 8,
    correct: 5,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))

  const afterBalancing = completedThrough('balancing-equations')

  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, cleanMastery, algebraCourse, lessons, afterBalancing).title,
    'One-Step Equations',
  )
  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, missedMastery, algebraCourse, lessons, afterBalancing).title,
    'Review Balancing Equations',
  )
})

test('recommendations use average mastery threshold and end-of-path copy', () => {
  const masteryAtThreshold: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 0.65,
    attempts: 20,
    correct: 13,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const missingSkillMastery: SkillMastery[] = [
    {
      userId: 'user-1',
      skillId: 'equality',
      score: 1,
      attempts: 4,
      correct: 4,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    },
  ]
  const twoStepMastery: SkillMastery[] = [
    {
      userId: 'user-1',
      skillId: 'two-step-equations',
      score: 1,
      attempts: 4,
      correct: 4,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    },
  ]
  const likeTermsMastery: SkillMastery[] = lessons['like-terms-variables-both-sides'].skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 1,
    attempts: 4,
    correct: 4,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const graphingMastery: SkillMastery[] = lessons['graphing-lines'].skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 1,
    attempts: 4,
    correct: 4,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))

  const afterBalancing = completedThrough('balancing-equations')
  const afterTwoStep = completedThrough('balancing-equations', 'one-step-equations', 'two-step-equations')
  const afterLikeTerms = completedThrough(
    'balancing-equations',
    'one-step-equations',
    'two-step-equations',
    'like-terms-variables-both-sides',
  )
  const everythingDone = completedThrough(...algebraCourse.lessonOrder)

  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, masteryAtThreshold, algebraCourse, lessons, afterBalancing).title,
    'One-Step Equations',
  )
  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, missingSkillMastery, algebraCourse, lessons, afterBalancing)
      .title,
    'Review Balancing Equations',
  )
  // After Two-Step, both branches unlock; the next available lesson is the first branch.
  assert.equal(
    getRecommendedNextLesson(lessons['two-step-equations'], twoStepMastery, algebraCourse, lessons, afterTwoStep).title,
    'Like Terms & Variables on Both Sides',
  )
  // Finishing Like Terms with Coordinate Plane still open points to the other branch, not
  // the locked merge lesson (Graphing Lines) a naive linear order would have chosen.
  assert.equal(
    getRecommendedNextLesson(
      lessons['like-terms-variables-both-sides'],
      likeTermsMastery,
      algebraCourse,
      lessons,
      afterLikeTerms,
    ).title,
    'Coordinate Plane',
  )
  assert.equal(
    getRecommendedNextLesson(lessons['graphing-lines'], graphingMastery, algebraCourse, lessons, everythingDone).title,
    'Course path complete',
  )
})

test('next-lesson recommendation skips locked merge and already-completed branches', () => {
  const masteredFor = (lessonId: LessonId): SkillMastery[] =>
    lessons[lessonId].skillIds.map((skillId) => ({
      userId: 'user-1',
      skillId,
      score: 1,
      attempts: 4,
      correct: 4,
      lastPracticedAt: '2026-06-23T00:00:00.000Z',
    }))

  // Learner took the Coordinate Plane branch first: Like Terms is still open and the merge
  // lesson (Graphing Lines) is still locked, so a naive linear order would be wrong.
  const coordinateFirst = completedThrough(
    'balancing-equations',
    'one-step-equations',
    'two-step-equations',
    'coordinate-plane',
  )
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], coordinateFirst), false)
  const afterCoordinate = getRecommendedNextLesson(
    lessons['coordinate-plane'],
    masteredFor('coordinate-plane'),
    algebraCourse,
    lessons,
    coordinateFirst,
  )
  assert.equal(afterCoordinate.kind, 'next')
  assert.equal(afterCoordinate.lessonId, 'like-terms-variables-both-sides')

  // With both branches done, finishing Like Terms points at the now-unlocked merge lesson.
  const bothBranches = completedThrough(
    'balancing-equations',
    'one-step-equations',
    'two-step-equations',
    'coordinate-plane',
    'like-terms-variables-both-sides',
  )
  const afterLikeTerms = getRecommendedNextLesson(
    lessons['like-terms-variables-both-sides'],
    masteredFor('like-terms-variables-both-sides'),
    algebraCourse,
    lessons,
    bothBranches,
  )
  assert.equal(afterLikeTerms.kind, 'next')
  assert.equal(afterLikeTerms.lessonId, 'graphing-lines')

  // Finishing the final lesson ends the path gracefully instead of recommending a redo.
  const everythingDone = completedThrough(...algebraCourse.lessonOrder)
  const afterGraphing = getRecommendedNextLesson(
    lessons['graphing-lines'],
    masteredFor('graphing-lines'),
    algebraCourse,
    lessons,
    everythingDone,
  )
  assert.equal(afterGraphing.kind, 'complete')
  assert.equal(afterGraphing.lessonId, undefined)
})

test('path recommends one-step equations after balancing is completed', () => {
  const balancingProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed' as const,
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    completedAt: '2026-06-23T00:00:00.000Z',
  }
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': balancingProgress,
  }

  assert.equal(isLessonUnlocked(lessons['one-step-equations'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['two-step-equations'], progressByLesson), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'one-step-equations')
})

test('path recommends two-step equations after one-step is completed', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'one-step-equations': {
      ...createInitialProgress('user-1', 'one-step-equations'),
      status: 'completed',
      currentStepIndex: lessons['one-step-equations'].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
  }

  assert.equal(isLessonUnlocked(lessons['two-step-equations'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['like-terms-variables-both-sides'], progressByLesson), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'two-step-equations')
})

test('path recommends like terms after two-step equations are completed', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'one-step-equations': {
      ...createInitialProgress('user-1', 'one-step-equations'),
      status: 'completed',
      currentStepIndex: lessons['one-step-equations'].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'two-step-equations': {
      ...createInitialProgress('user-1', 'two-step-equations'),
      status: 'completed',
      currentStepIndex: lessons['two-step-equations'].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
  }

  // Branch point: completing Two-Step opens both parallel lessons, but the merge lesson stays locked.
  assert.equal(isLessonUnlocked(lessons['like-terms-variables-both-sides'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['coordinate-plane'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], progressByLesson), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'like-terms-variables-both-sides')
})

test('two-step equations unlocks both parallel branches at once', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': completedProgress('balancing-equations'),
    'one-step-equations': completedProgress('one-step-equations'),
    'two-step-equations': completedProgress('two-step-equations'),
  }

  assert.equal(isLessonUnlocked(lessons['like-terms-variables-both-sides'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['coordinate-plane'], progressByLesson), true)
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], progressByLesson), false)
})

test('graphing lines unlocks only after both parallel branches are completed', () => {
  const base: ProgressByLesson = {
    'balancing-equations': completedProgress('balancing-equations'),
    'one-step-equations': completedProgress('one-step-equations'),
    'two-step-equations': completedProgress('two-step-equations'),
  }

  const onlyLikeTerms: ProgressByLesson = {
    ...base,
    'like-terms-variables-both-sides': completedProgress('like-terms-variables-both-sides'),
  }
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], onlyLikeTerms), false)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, onlyLikeTerms), 'coordinate-plane')

  const onlyCoordinatePlane: ProgressByLesson = {
    ...base,
    'coordinate-plane': completedProgress('coordinate-plane'),
  }
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], onlyCoordinatePlane), false)
  assert.equal(
    getRecommendedPathLessonId(algebraCourse, lessons, onlyCoordinatePlane),
    'like-terms-variables-both-sides',
  )

  const bothBranches: ProgressByLesson = {
    ...base,
    'like-terms-variables-both-sides': completedProgress('like-terms-variables-both-sides'),
    'coordinate-plane': completedProgress('coordinate-plane'),
  }
  assert.equal(isLessonUnlocked(lessons['graphing-lines'], bothBranches), true)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, bothBranches), 'graphing-lines')
})

test('review suggestion does not block starting the unlocked next lesson', () => {
  const balancingProgress = {
    ...createInitialProgress('user-1', 'balancing-equations'),
    status: 'completed' as const,
    currentStepIndex: balancingEquationsLesson.steps.length - 1,
    completedAt: '2026-06-23T00:00:00.000Z',
  }
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': balancingProgress,
  }
  const reviewMastery: SkillMastery[] = balancingEquationsLesson.skillIds.map((skillId) => ({
    userId: 'user-1',
    skillId,
    score: 0.5,
    attempts: 4,
    correct: 2,
    lastPracticedAt: '2026-06-23T00:00:00.000Z',
  }))
  const oneStepProgress = createInitialProgress('user-1', 'one-step-equations')

  assert.equal(
    getRecommendedNextLesson(balancingEquationsLesson, reviewMastery, algebraCourse, lessons, progressByLesson).title,
    'Review Balancing Equations',
  )
  assert.equal(isLessonUnlocked(lessons['one-step-equations'], progressByLesson), true)
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson, 'balancing-equations'), 'one-step-equations')
  assert.equal(oneStepProgress.lessonId, 'one-step-equations')
  assert.equal(isLessonUnlocked(lessons['two-step-equations'], { ...progressByLesson, 'one-step-equations': oneStepProgress }), false)
})

test('path prefers unlocked in-progress lessons before new available lessons', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    },
    'one-step-equations': {
      ...createInitialProgress('user-1', 'one-step-equations'),
      currentStepIndex: 2,
    },
  }

  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson), 'one-step-equations')
})

test('course progress summary shows path progress and first available recommendation', () => {
  const summary = getCourseProgressSummary(algebraCourse, lessons, {})

  assert.equal(summary.totalLessons, 6)
  assert.equal(summary.completedLessons, 0)
  assert.equal(summary.percentComplete, 0)
  assert.equal(summary.lastCompletedLessonId, undefined)
  assert.equal(summary.recommendedLessonId, 'balancing-equations')
  assert.equal(summary.recommendedAction, 'start')
})

test('course progress summary reports last completed scores and next lesson', () => {
  const progressByLesson: ProgressByLesson = {
    'balancing-equations': {
      ...createInitialProgress('user-1', 'balancing-equations'),
      status: 'completed',
      currentStepIndex: balancingEquationsLesson.steps.length - 1,
      latestScore: {
        scorePercent: 80,
        correctFirstTryCount: 4,
        assessedStepCount: 5,
        completedAt: '2026-06-23T00:00:00.000Z',
      },
      bestScore: {
        scorePercent: 100,
        correctFirstTryCount: 5,
        assessedStepCount: 5,
        completedAt: '2026-06-23T00:00:00.000Z',
      },
      completedAt: '2026-06-23T00:00:00.000Z',
    },
  }

  const summary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson)

  assert.equal(summary.completedLessons, 1)
  assert.equal(summary.percentComplete, 17)
  assert.equal(summary.lastCompletedLessonId, 'balancing-equations')
  assert.equal(summary.recommendedLessonId, 'one-step-equations')
  assert.equal(summary.recommendedAction, 'start')
  assert.equal(summary.lastCompletedLatestScore?.scorePercent, 80)
  assert.equal(summary.lastCompletedBestScore?.scorePercent, 100)
})

test('course progress summary uses the furthest completed lesson when the path is complete', () => {
  const progressByLesson = algebraCourse.lessonOrder.reduce<ProgressByLesson>((items, lessonId) => {
    items[lessonId] = {
      ...createInitialProgress('user-1', lessonId),
      status: 'completed',
      currentStepIndex: lessons[lessonId].steps.length - 1,
      completedAt: '2026-06-23T00:00:00.000Z',
    }
    return items
  }, {})

  const summary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson, 'balancing-equations')

  assert.equal(summary.completedLessons, 6)
  assert.equal(summary.percentComplete, 100)
  assert.equal(summary.lastCompletedLessonId, 'graphing-lines')
  assert.equal(summary.recommendedLessonId, 'graphing-lines')
  assert.equal(summary.recommendedAction, 'view-summary')
  assert.equal(getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson, 'balancing-equations'), 'graphing-lines')
})
