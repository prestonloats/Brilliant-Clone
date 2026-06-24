// Pure, deterministic helpers describing how mastery is celebrated on the Path page.
//
// These describe presentation only (labels, glyphs, class names, and copy); the actual
// mastery rules live in `getCompletionState` (see ./courseHelpers), which stays the single
// source of truth. React components consume these helpers; nothing here touches the DOM,
// the clock, or randomness, so the output is a pure function of its inputs.

import type { Course, Lesson, LessonId, LessonProgress, SkillMastery } from '../domain'
import { getBestLessonScore, hasCompletedLesson, MASTERY_READY_THRESHOLD, type ProgressByLesson } from '../engine'
import { getAverageLessonMastery, getCompletionState } from './courseHelpers'

export type NodeMasteryCelebration = {
  isMastered: boolean
  // 'Mastered' when mastered, '' otherwise.
  badgeLabel: string
  // A short celebratory glyph when mastered, '' otherwise.
  icon: string
  // 'is-mastered' when mastered, '' otherwise.
  className: string
}

const MASTERY_BADGE_LABEL = 'Mastered'
const MASTERY_ICON = '🏆'
const MASTERY_CLASS_NAME = 'is-mastered'

// Whether the learner's best recorded completion was a clean, mastery-grade run (every
// assessed step right on the first try). Lessons with no assessed steps count as clean.
function hasCleanCompletion(lesson: Lesson, progress: LessonProgress | undefined): boolean {
  const best = getBestLessonScore(lesson, progress)
  if (!best) return false
  return best.assessedStepCount === 0 || best.correctFirstTryCount === best.assessedStepCount
}

// True when a subject should wear its mastered visuals on the Path page: either it is
// mastered right now, OR it is being retaken after a previous mastered completion. A retake
// resets the live run to `inProgress`, so without this the gold/trophy/sparkle treatment
// would vanish the moment a learner reopens a subject they already mastered.
export function isLessonMasteredForDisplay(
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
    return { isMastered: false, badgeLabel: '', icon: '', className: '' }
  }

  return {
    isMastered: true,
    badgeLabel: MASTERY_BADGE_LABEL,
    icon: MASTERY_ICON,
    className: MASTERY_CLASS_NAME,
  }
}

export type CourseMasterySummary = {
  totalLessons: number
  masteredCount: number
  // Lessons whose completion state is not 'not-completed'.
  completedCount: number
  // Math.round(masteredCount / totalLessons * 100), 0 when totalLessons is 0.
  percentMastered: number
  allMastered: boolean
  // Mastered lesson ids in course.lessonOrder order.
  masteredLessonIds: LessonId[]
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
  let completedCount = 0

  for (const lessonId of course.lessonOrder) {
    const lesson = lessonsById[lessonId]
    if (!lesson) continue

    const progress = progressByLesson[lessonId]
    // Count "ever completed" so an in-progress retake of a finished subject still counts.
    if (hasCompletedLesson(progress)) completedCount += 1
    if (isLessonMasteredForDisplay(lesson, progress, mastery)) masteredLessonIds.push(lessonId)
  }

  const masteredCount = masteredLessonIds.length
  const percentMastered = totalLessons === 0 ? 0 : Math.round((masteredCount / totalLessons) * 100)
  const allMastered = totalLessons > 0 && masteredCount === totalLessons
  const copy = getMasteryCopy(course, masteredCount, totalLessons, allMastered)

  return {
    totalLessons,
    masteredCount,
    completedCount,
    percentMastered,
    allMastered,
    masteredLessonIds,
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
