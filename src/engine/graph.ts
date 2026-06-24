// Lesson dependency graph and course progress.
//
// Derives a layered prerequisite graph for the path view (`buildLessonGraph`) and summarizes
// where the learner is in the course (`getCourseProgressSummary` / `getRecommendedPathLessonId`).
// `getPathLessonIds` is exported for the recommendation module but is intentionally kept out of
// the public engine barrel.

import type { Course, Lesson, LessonId } from '../domain'
import type {
  CourseProgressSummary,
  LessonGraph,
  LessonGraphConnector,
  LessonGraphNode,
  LessonGraphStage,
  ProgressByLesson,
} from './types'
import { getBestLessonScore, getLatestLessonScore, hasCompletedLesson } from './progress'
import { isLessonUnlocked } from './recommendations'

// Turns the lesson prerequisite lists into a layered dependency graph: lessons are
// grouped into stages by rank, and each stage records whether the path is splitting
// into parallel branches or merging them back together. The shape is computed from
// `prerequisites` alone so content edits to the graph stay reflected automatically.
export const buildLessonGraph = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
): LessonGraph => {
  const orderedIds = course.lessonOrder.filter((lessonId) => Boolean(lessonCatalog[lessonId]))
  const orderIndex = new Map(orderedIds.map((lessonId, index) => [lessonId, index]))
  const byOrder = (a: LessonId, b: LessonId) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0)

  const rankById = new Map<LessonId, number>()
  const resolveRank = (lessonId: LessonId): number => {
    const cached = rankById.get(lessonId)
    if (cached !== undefined) return cached

    const prerequisites = lessonCatalog[lessonId]?.prerequisites ?? []
    const rank =
      prerequisites.length === 0
        ? 0
        : Math.max(...prerequisites.map((prerequisiteId) => resolveRank(prerequisiteId))) + 1

    rankById.set(lessonId, rank)
    return rank
  }

  const unlocksById = new Map<LessonId, LessonId[]>()
  orderedIds.forEach((lessonId) => {
    lessonCatalog[lessonId].prerequisites.forEach((prerequisiteId) => {
      const dependents = unlocksById.get(prerequisiteId) ?? []
      dependents.push(lessonId)
      unlocksById.set(prerequisiteId, dependents)
    })
  })

  const nodes = orderedIds.reduce(
    (accumulator, lessonId) => {
      accumulator[lessonId] = {
        id: lessonId,
        rank: resolveRank(lessonId),
        prerequisites: [...lessonCatalog[lessonId].prerequisites],
        unlocks: (unlocksById.get(lessonId) ?? []).slice().sort(byOrder),
      }
      return accumulator
    },
    {} as Record<LessonId, LessonGraphNode>,
  )

  const ranks = [...new Set(orderedIds.map((lessonId) => nodes[lessonId].rank))].sort((a, b) => a - b)

  let previousCount = 0
  const stages = ranks.map<LessonGraphStage>((rank, stageIndex) => {
    const nodeIds = orderedIds.filter((lessonId) => nodes[lessonId].rank === rank).sort(byOrder)
    const hasMerge = nodeIds.some((lessonId) => nodes[lessonId].prerequisites.length > 1)

    let connector: LessonGraphConnector
    if (stageIndex === 0) {
      connector = 'start'
    } else if (hasMerge) {
      connector = 'merge'
    } else if (previousCount <= 1 && nodeIds.length > 1) {
      connector = 'split'
    } else if (previousCount > 1 && nodeIds.length > 1) {
      connector = 'parallel'
    } else {
      connector = 'linear'
    }

    previousCount = nodeIds.length
    return { rank, connector, nodeIds }
  })

  return { nodes, stages }
}

export const getPathLessonIds = (course: Course, lessonCatalog: Record<LessonId, Lesson>) =>
  course.lessonOrder.filter((lessonId) => lessonCatalog[lessonId]?.steps.length > 0)

const getLastCompletedPathLessonId = (lessonIds: LessonId[], progressByLesson: ProgressByLesson) =>
  lessonIds.findLast((lessonId) => hasCompletedLesson(progressByLesson[lessonId]))

export const getRecommendedPathLessonId = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  preferredLessonId?: LessonId,
) => {
  const pathLessonIds = getPathLessonIds(course, lessonCatalog)
  const availableInProgress = pathLessonIds.find((lessonId) => {
    const lesson = lessonCatalog[lessonId]
    return isLessonUnlocked(lesson, progressByLesson) && progressByLesson[lessonId]?.status === 'inProgress'
  })

  if (availableInProgress) return availableInProgress

  const nextAvailable = pathLessonIds.find((lessonId) => {
    const lesson = lessonCatalog[lessonId]
    return isLessonUnlocked(lesson, progressByLesson) && progressByLesson[lessonId]?.status !== 'completed'
  })

  if (nextAvailable) return nextAvailable

  const lastCompletedLessonId = getLastCompletedPathLessonId(pathLessonIds, progressByLesson)
  if (lastCompletedLessonId) return lastCompletedLessonId

  if (preferredLessonId && lessonCatalog[preferredLessonId]?.steps.length) {
    return preferredLessonId
  }

  return pathLessonIds[0] ?? course.lessonOrder[0]
}

export const getCourseProgressSummary = (
  course: Course,
  lessonCatalog: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  preferredLessonId?: LessonId,
): CourseProgressSummary => {
  const pathLessonIds = getPathLessonIds(course, lessonCatalog)
  const completedLessonIds = pathLessonIds.filter((lessonId) => hasCompletedLesson(progressByLesson[lessonId]))
  const lastCompletedLessonId = getLastCompletedPathLessonId(pathLessonIds, progressByLesson)
  const recommendedLessonId = getRecommendedPathLessonId(course, lessonCatalog, progressByLesson, preferredLessonId)
  const recommendedLesson = lessonCatalog[recommendedLessonId]
  const recommendedProgress = progressByLesson[recommendedLessonId]
  const lastCompletedLesson = lastCompletedLessonId ? lessonCatalog[lastCompletedLessonId] : undefined
  const lastCompletedProgress = lastCompletedLessonId ? progressByLesson[lastCompletedLessonId] : undefined

  return {
    totalLessons: pathLessonIds.length,
    completedLessons: completedLessonIds.length,
    percentComplete:
      pathLessonIds.length === 0 ? 0 : Math.round((completedLessonIds.length / pathLessonIds.length) * 100),
    ...(lastCompletedLessonId ? { lastCompletedLessonId } : {}),
    recommendedLessonId,
    recommendedAction: recommendedProgress?.status === 'completed' ? 'view-summary' : recommendedProgress ? 'continue' : 'start',
    ...(lastCompletedLesson
      ? {
          lastCompletedLatestScore: getLatestLessonScore(lastCompletedLesson, lastCompletedProgress),
          lastCompletedBestScore: getBestLessonScore(lastCompletedLesson, lastCompletedProgress),
        }
      : {}),
    recommendedLatestScore: getLatestLessonScore(recommendedLesson, recommendedProgress),
    recommendedBestScore: getBestLessonScore(recommendedLesson, recommendedProgress),
  }
}
