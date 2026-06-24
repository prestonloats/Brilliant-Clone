import { algebraCourse, lessons, type Lesson, type LessonProgress, type LessonScore, type SkillMastery } from '../domain'
import {
  getBestLessonScore,
  getLatestLessonScore,
  hasCompletedLesson,
  MASTERY_READY_THRESHOLD,
  type ProgressByLesson,
} from '../engine'

export function formatList(items: string[]) {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function getLessonProgressPercent(lesson: Lesson, progress?: LessonProgress) {
  if (!progress || lesson.steps.length === 0) return 0
  if (progress.status === 'completed') return 100
  return Math.round((progress.currentStepIndex / lesson.steps.length) * 100)
}

export function getLessonProgressLabel(lesson: Lesson, progress: LessonProgress | undefined, mastery: SkillMastery[]) {
  if (!progress) return 'Ready to start'
  if (progress.status === 'inProgress' && hasCompletedLesson(progress)) return `Retaking step ${progress.currentStepIndex + 1} of ${lesson.steps.length}`
  if (progress.status === 'completed') {
    const completionState = getCompletionState(lesson, progress, mastery)
    if (completionState === 'mastered') return 'Mastered'
    if (completionState === 'review-suggested') return 'Review suggested'
    return 'Completed'
  }
  return `Step ${progress.currentStepIndex + 1} of ${lesson.steps.length}`
}

export function getPathStatus({
  comingSoon,
  recommended,
  unlocked,
  lesson,
  lessonProgress,
  mastery,
}: {
  comingSoon: boolean
  recommended: boolean
  unlocked: boolean
  lesson: Lesson
  lessonProgress?: LessonProgress
  mastery: SkillMastery[]
}) {
  const completionState = getCompletionState(lesson, lessonProgress, mastery)

  if (lessonProgress?.status === 'inProgress' && hasCompletedLesson(lessonProgress)) {
    return { label: 'Retaking', className: 'available' }
  }
  if (completionState === 'mastered') return { label: 'Mastered', className: 'completed' }
  if (completionState === 'review-suggested') return { label: 'Review suggested', className: 'review' }
  if (completionState === 'completed') return { label: 'Completed', className: 'completed' }
  if (comingSoon) return { label: 'Coming soon', className: 'coming-soon' }
  if (recommended) return { label: 'Recommended', className: 'available' }
  if (lessonProgress?.status === 'inProgress') return { label: 'In progress', className: 'available' }
  if (unlocked) return { label: 'Available', className: 'available' }
  return { label: 'Locked', className: 'locked' }
}

export function getReviewSuggestedLessonId(progressByLesson: ProgressByLesson, mastery: SkillMastery[]) {
  return algebraCourse.lessonOrder.find((lessonId) => {
    const lesson = lessons[lessonId]
    return getCompletionState(lesson, progressByLesson[lessonId], mastery) === 'review-suggested'
  })
}

export function getCompletionState(lesson: Lesson, progress: LessonProgress | undefined, mastery: SkillMastery[]) {
  if (progress?.status !== 'completed') return 'not-completed'

  if (getAverageLessonMastery(lesson, mastery) < MASTERY_READY_THRESHOLD) {
    return 'review-suggested'
  }

  return isCleanCompletion(lesson, progress) ? 'mastered' : 'completed'
}

export function getAverageLessonMastery(lesson: Lesson, mastery: SkillMastery[]) {
  if (!lesson.steps.some((step) => step.type !== 'concept')) return 1
  if (lesson.skillIds.length === 0) return 0

  const total = lesson.skillIds.reduce(
    (sum, skillId) => sum + (mastery.find((item) => item.skillId === skillId)?.score ?? 0),
    0,
  )
  return total / lesson.skillIds.length
}

export function isCleanCompletion(lesson: Lesson, progress: LessonProgress) {
  const assessedStepIds = lesson.steps.filter((step) => step.type !== 'concept').map((step) => step.id)
  if (assessedStepIds.length === 0) return true

  return assessedStepIds.every((stepId) => {
    const result = progress.stepResults[stepId]
    return result?.correct === true && result.attempts <= 1
  })
}

export function getLessonScoreText(lesson: Lesson, progress?: LessonProgress) {
  const latestScore = getLatestLessonScore(lesson, progress)
  const bestScore = getBestLessonScore(lesson, progress)
  return getScoreSummaryText(latestScore, bestScore)
}

export function getScoreSummaryText(latestScore?: LessonScore, bestScore?: LessonScore) {
  if (!latestScore) return ''

  const latest = `Latest score: ${latestScore.scorePercent}%`
  if (bestScore && bestScore.scorePercent !== latestScore.scorePercent) {
    return `${latest} | Best: ${bestScore.scorePercent}%`
  }

  return latest
}

export function getLessonScoreDetail(lesson: Lesson, progress: LessonProgress) {
  const latestScore = getLatestLessonScore(lesson, progress)
  if (!latestScore) return 'No scored completion yet.'
  if (latestScore.assessedStepCount === 0) return 'No assessed steps in this lesson.'

  return `${latestScore.correctFirstTryCount}/${latestScore.assessedStepCount} assessed steps correct on the first try.`
}
