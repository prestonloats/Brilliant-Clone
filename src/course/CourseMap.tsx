import {
  algebraCourse,
  lessons,
  type Lesson,
  type LessonId,
  type LessonProgress,
  type SkillMastery,
  type UserProfile,
} from '../domain'
import { getCourseProgressSummary, type ProgressByLesson } from '../engine'
import { ProgressBar } from '../components/ProgressBar'
import {
  getLessonProgressLabel,
  getLessonProgressPercent,
  getReviewSuggestedLessonId,
  getScoreSummaryText,
} from './courseHelpers'
import { CoursePathGraph } from './CoursePathGraph'

type CourseMapProps = {
  user: UserProfile
  activeLesson: Lesson
  progress: LessonProgress | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  onLaunchLesson: (lessonId: LessonId) => void
  onRetakeLesson: (lessonId: LessonId) => void
}

export function CourseMap({
  user,
  activeLesson,
  progress,
  progressByLesson,
  mastery,
  onLaunchLesson,
  onRetakeLesson,
}: CourseMapProps) {
  const reviewLessonId = getReviewSuggestedLessonId(progressByLesson, mastery)
  const pathSummary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson, activeLesson.id)
  const featuredLessonId = pathSummary.recommendedLessonId
  const reviewLesson = reviewLessonId && reviewLessonId !== featuredLessonId ? lessons[reviewLessonId] : null
  const featuredLesson = lessons[featuredLessonId]
  const featuredProgress = progressByLesson[featuredLessonId]
  const featuredProgressPercent = getLessonProgressPercent(featuredLesson, featuredProgress)
  const featuredScore = getScoreSummaryText(pathSummary.recommendedLatestScore, pathSummary.recommendedBestScore)
  const lastCompletedLesson = pathSummary.lastCompletedLessonId ? lessons[pathSummary.lastCompletedLessonId] : null
  const lastCompletedScore = getScoreSummaryText(
    pathSummary.lastCompletedLatestScore,
    pathSummary.lastCompletedBestScore,
  )
  const progressLabel = `${pathSummary.completedLessons} of ${pathSummary.totalLessons} lessons complete`
  const actionLabel =
    pathSummary.recommendedAction === 'view-summary'
      ? 'View summary'
      : pathSummary.recommendedAction === 'continue'
        ? 'Continue'
        : 'Start'

  return (
    <section className="screen-stack">
      <div className="hero-card card">
        <p className="eyebrow">Welcome back, {user.displayName}</p>
        <h1>{algebraCourse.title}</h1>
        <p className="lead">{algebraCourse.description}</p>
        <div className="path-overview" aria-label="Course progress overview">
          <div className="overview-stat">
            <span>Path progress</span>
            <strong>{progressLabel}</strong>
            <small>{pathSummary.percentComplete}% complete</small>
          </div>
          <div className="overview-stat">
            <span>Last completed</span>
            <strong>{lastCompletedLesson?.title ?? 'Nothing completed yet'}</strong>
            <small>{lastCompletedScore || (lastCompletedLesson ? 'Completed' : 'Start the first lesson to begin your path.')}</small>
          </div>
        </div>
        <div className="continue-panel">
          <div>
            <span>Recommended next</span>
            <strong>{featuredLesson.title}</strong>
            <span>{getLessonProgressLabel(featuredLesson, featuredProgress, mastery)}</span>
            {featuredScore && <small className="score-line">{featuredScore}</small>}
          </div>
          <div className="continue-actions">
            <button className="primary-action" type="button" onClick={() => onLaunchLesson(featuredLesson.id)}>
              {actionLabel}
            </button>
            {featuredProgress?.status === 'completed' && (
              <button className="secondary-inline" type="button" onClick={() => onRetakeLesson(featuredLesson.id)}>
                Retake
              </button>
            )}
          </div>
        </div>
        {reviewLesson && (
          <p className="review-note">
            Review suggested for {reviewLesson.title}, but {featuredLesson.title} is unlocked when you are ready.
          </p>
        )}
        <ProgressBar value={pathSummary.percentComplete} label={progressLabel} />
        {featuredProgress && featuredProgress.status !== 'completed' && (
          <ProgressBar value={featuredProgressPercent} label={`${featuredLesson.title}: ${featuredProgressPercent}% complete`} />
        )}
      </div>

      <CoursePathGraph
        progress={progress}
        progressByLesson={progressByLesson}
        mastery={mastery}
        featuredLessonId={featuredLessonId}
        onLaunchLesson={onLaunchLesson}
        onRetakeLesson={onRetakeLesson}
      />
    </section>
  )
}
