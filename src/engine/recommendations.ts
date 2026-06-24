// Lesson recommendations and unlock rules.
//
// Branch-aware logic for "what should the learner do next": `getRecommendedNextLesson`
// suggests reviewing a weak lesson or advancing to the next unlocked, not-yet-completed one,
// and `isLessonUnlocked` gates a lesson on its prerequisites. The path-walking helper
// `getPathLessonIds` lives in the graph module.

import type { Course, Lesson, LessonId, SkillMastery } from '../domain'
import type { NextLessonRecommendation, ProgressByLesson } from './types'
import { MASTERY_READY_THRESHOLD } from './types'
import { hasCompletedLesson, isAssessedLessonStep } from './progress'
import { getPathLessonIds } from './graph'

// Recommendation shown after finishing a lesson. It is branch-aware: instead of trusting
// the raw linear `nextLessonId` (which can be locked at a merge or already completed on a
// parallel branch), it walks the dependency graph for the next unlocked, not-yet-completed
// lesson. If the just-finished lesson's mastery is still low it recommends reviewing it,
// and it falls back to an end-of-path message when nothing is available.
export const getRecommendedNextLesson = (
  lesson: Lesson,
  mastery: SkillMastery[],
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
): NextLessonRecommendation => {
  const lessonMastery = lesson.skillIds.map((skillId) => mastery.find((item) => item.skillId === skillId)?.score ?? 0)
  const averageMastery =
    lessonMastery.length === 0
      ? 0
      : lessonMastery.reduce((total, score) => total + score, 0) / lessonMastery.length
  const hasAssessedSteps = lesson.steps.some(isAssessedLessonStep)

  if (hasAssessedSteps && averageMastery < MASTERY_READY_THRESHOLD) {
    return {
      lessonId: lesson.id,
      kind: 'review',
      title: `Review ${lesson.title}`,
      body: 'Practice this lesson once more before moving on. The scale should feel automatic.',
    }
  }

  const nextLessonId = getNextAvailableLessonId(course, lessonCatalog, progressByLesson, lesson.id)

  if (!nextLessonId) {
    return {
      kind: 'complete',
      title: 'Course path complete',
      body: 'You have completed the available lessons in this path.',
    }
  }

  return {
    lessonId: nextLessonId,
    kind: 'next',
    title: lessonCatalog[nextLessonId].title,
    ...nextLessonRecommendations[nextLessonId],
  }
}

// First path lesson whose prerequisites are satisfied and that has not been completed,
// skipping the lesson just finished. Used by the completion-screen recommendation so it
// never points at a locked or already-completed lesson.
const getNextAvailableLessonId = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  excludeLessonId?: LessonId,
): LessonId | undefined => {
  const pathLessonIds = getPathLessonIds(course, lessonCatalog)
  return pathLessonIds.find((lessonId) => {
    if (lessonId === excludeLessonId) return false
    const candidate = lessonCatalog[lessonId]
    return isLessonUnlocked(candidate, progressByLesson) && !hasCompletedLesson(progressByLesson[lessonId])
  })
}

// Only the body copy lives here; the title is read from the lesson catalog to avoid
// duplicating (and risking drift from) each lesson's own title.
const nextLessonRecommendations: Record<LessonId, { body: string }> = {
  'balancing-equations': {
    body: 'Start by making the equals sign feel like a balance.',
  },
  'one-step-equations': {
    body: 'Next, use the same balancing idea with multiplication and division.',
  },
  'two-step-equations': {
    body: 'Next, decide which operation to undo first when x has two changes.',
  },
  'like-terms-variables-both-sides': {
    body: 'Next, gather matching terms and prepare to move variables while preserving equality.',
  },
  'coordinate-plane': {
    body: 'Next, place algebra on a grid by reading and plotting points.',
  },
  'graphing-lines': {
    body: 'Next, connect slope-intercept equations to the lines they draw.',
  },
}

export const isLessonUnlocked = (lesson: Lesson, progressByLesson: ProgressByLesson) =>
  lesson.steps.length > 0 &&
  lesson.prerequisites.every((lessonId) => hasCompletedLesson(progressByLesson[lessonId]))
