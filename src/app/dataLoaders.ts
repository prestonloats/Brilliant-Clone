import type { Backend } from '../backend'
import { algebraCourse, lessons, type LessonId, type UserProfile } from '../domain'
import { createInitialProgress, getRecommendedPathLessonId, type ProgressByLesson } from '../engine'

export async function getInitialLessonSession(backend: Backend, user: UserProfile) {
  const [progressByLesson, mastery, attempts] = await Promise.all([
    getProgressByLesson(backend, user.id),
    backend.mastery.getUserMastery(user.id),
    backend.attempts.getAttempts(user.id),
  ])
  const activeLessonId = getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson, algebraCourse.lessonOrder[0])
  // Only surface progress that was actually saved. A brand-new learner sees "Start" with
  // no 0% bar until they begin a lesson, so we never create or persist an inProgress
  // record here; that happens in launchLesson when they actually start.
  const progress = progressByLesson[activeLessonId] ?? null

  return {
    activeLessonId,
    progress,
    progressByLesson,
    mastery,
    attempts,
  }
}

export async function getProgressForUser(backend: Backend, user: UserProfile, lessonId: LessonId) {
  const saved = await backend.progress.getLessonProgress(user.id, lessonId)
  if (saved) return saved

  const progress = createInitialProgress(user.id, lessonId)
  await backend.progress.saveLessonProgress(progress)
  return progress
}

export async function getProgressByLesson(backend: Backend, userId: string): Promise<ProgressByLesson> {
  const lessonProgress = await Promise.all(
    algebraCourse.lessonOrder.map(async (lessonId) => ({
      lessonId,
      progress: await backend.progress.getLessonProgress(userId, lessonId),
    })),
  )

  return lessonProgress.reduce<ProgressByLesson>((items, { lessonId, progress }) => {
    if (progress) {
      items[lessonId] = progress
    }
    return items
  }, {})
}
