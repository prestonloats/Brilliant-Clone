// Pure, deterministic helpers describing how mastery is celebrated on the Path page.
//
// These describe presentation only (labels, glyphs, class names, and copy); the actual
// mastery rules live in `getCompletionState` (see ./courseHelpers), which stays the single
// source of truth. React components consume these helpers; nothing here touches the DOM,
// the clock, or randomness, so the output is a pure function of its inputs.

import type { Course, Lesson, LessonId, LessonProgress, SkillMastery } from '../domain'
import { getBestLessonScore, hasCompletedLesson, MASTERY_READY_THRESHOLD, type ProgressByLesson } from '../engine'
import { getAverageLessonMastery, getCompletionState, isPerfectScore } from './courseHelpers'

export type NodeMasteryCelebration = {
  isMastered: boolean
  // A short celebratory glyph when mastered, '' otherwise.
  icon: string
  className: string
}

const MASTERY_ICON = '🏆'
const MASTERY_CLASS_NAME = 'is-mastered'

// Whether the learner's best recorded completion was a clean, mastery-grade run (every
// assessed step right on the first try). Lessons with no assessed steps count as clean.
function hasCleanCompletion(lesson: Lesson, progress: LessonProgress | undefined): boolean {
  const best = getBestLessonScore(lesson, progress)
  if (!best) return false
  return isPerfectScore(best)
}

// True when a subject should wear its mastered visuals on the Path page: either it is
// mastered right now, OR it is being retaken after a previous mastered completion. A retake
// resets the live run to `inProgress`, so without this the gold/trophy/sparkle treatment
// would vanish the moment a learner reopens a subject they already mastered.
function isLessonMasteredForDisplay(
  lesson: Lesson,
  progress: LessonProgress | undefined,
  mastery: SkillMastery[],
): boolean {
  if (getCompletionState(lesson, progress, mastery) === 'mastered') return true

  const retakingAfterCompletion = progress?.status === 'inProgress' && hasCompletedLesson(progress)
  if (!retakingAfterCompletion) return false

  return hasCleanCompletion(lesson, progress) && getAverageLessonMastery(lesson, mastery) >= MASTERY_READY_THRESHOLD
}

export function getNodeMasteryCelebration(
  lesson: Lesson,
  progress: LessonProgress | undefined,
  mastery: SkillMastery[],
): NodeMasteryCelebration {
  const isMastered = isLessonMasteredForDisplay(lesson, progress, mastery)

  if (!isMastered) {
    return { isMastered: false, icon: '', className: '' }
  }

  return {
    isMastered: true,
    icon: MASTERY_ICON,
    className: MASTERY_CLASS_NAME,
  }
}

export type CourseMasterySummary = {
  totalLessons: number
  masteredCount: number
  percentMastered: number
  allMastered: boolean
  headline: string
  message: string
}

export function getCourseMasterySummary(
  course: Course,
  lessonsById: Record<LessonId, Lesson>,
  progressByLesson: ProgressByLesson,
  mastery: SkillMastery[],
): CourseMasterySummary {
  const totalLessons = course.lessonOrder.length
  const masteredLessonIds: LessonId[] = []

  for (const lessonId of course.lessonOrder) {
    const lesson = lessonsById[lessonId]
    if (!lesson) continue

    const progress = progressByLesson[lessonId]
    if (isLessonMasteredForDisplay(lesson, progress, mastery)) masteredLessonIds.push(lessonId)
  }

  const masteredCount = masteredLessonIds.length
  const percentMastered = totalLessons === 0 ? 0 : Math.round((masteredCount / totalLessons) * 100)
  const allMastered = totalLessons > 0 && masteredCount === totalLessons
  const copy = getMasteryCopy(course, masteredCount, totalLessons, allMastered)

  return {
    totalLessons,
    masteredCount,
    percentMastered,
    allMastered,
    headline: copy.headline,
    message: copy.message,
  }
}

function getMasteryCopy(
  course: Course,
  masteredCount: number,
  totalLessons: number,
  allMastered: boolean,
): { headline: string; message: string } {
  if (allMastered) {
    return {
      headline: `${course.title} mastered!`,
      message: 'Every subject is mastered. You have a rock-solid foundation to build on.',
    }
  }

  if (masteredCount > 0) {
    return {
      headline: `${masteredCount} of ${totalLessons} subjects mastered`,
      message: 'Great momentum — keep going to master every subject in the course.',
    }
  }

  return {
    headline: 'Start your mastery journey',
    message: 'Finish a subject with clean, confident first-try answers to earn your first mastery badge.',
  }
}
