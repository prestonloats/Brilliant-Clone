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
  getLessonActionLabel,
  getLessonProgressLabel,
  getLessonProgressPercent,
  getReviewSuggestedLessonId,
  getScoreSummaryText,
} from './courseHelpers'
import { getCourseMasterySummary } from './masteryCelebration'
import { MasterySparkles } from './MasterySparkles'
import { CoursePathGraph } from './CoursePathGraph'
import { StoryEntryCard } from '../story/StoryEntryCard'

type CourseMapProps = {
  user: UserProfile
  activeLesson: Lesson
  progress: LessonProgress | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  onLaunchLesson: (lessonId: LessonId) => void
  onRetakeLesson: (lessonId: LessonId) => void
  storyUnlocked: boolean
  storyProviderConfigured: boolean
  storyHasActiveSession: boolean
  storySavedCount: number
  storyBusy: boolean
  onOpenStory: () => void
  onOpenStoryLibrary: () => void
}

export function CourseMap({
  user,
  activeLesson,
  progress,
  progressByLesson,
  mastery,
  onLaunchLesson,
  onRetakeLesson,
  storyUnlocked,
  storyProviderConfigured,
  storyHasActiveSession,
  storySavedCount,
  storyBusy,
  onOpenStory,
  onOpenStoryLibrary,
}: CourseMapProps) {
  const reviewLessonId = getReviewSuggestedLessonId(progressByLesson, mastery)
  const pathSummary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson, activeLesson.id)
  const masterySummary = getCourseMasterySummary(algebraCourse, lessons, progressByLesson, mastery)
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
  const actionLabel = getLessonActionLabel({
    completed: pathSummary.recommendedAction === 'view-summary',
    started: pathSummary.recommendedAction === 'continue',
  })

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
          <div className={`overview-stat ${masterySummary.masteredCount > 0 ? 'overview-stat-mastery' : ''}`}>
            <span>Subjects mastered</span>
            <strong>
              {masterySummary.masteredCount} of {masterySummary.totalLessons}
            </strong>
            <small>{masterySummary.percentMastered}% mastered</small>
          </div>
        </div>
        {masterySummary.masteredCount > 0 && (
          <div className={`mastery-banner ${masterySummary.allMastered ? 'is-complete' : ''}`}>
            <span className="mastery-banner-icon" aria-hidden="true">
              {masterySummary.allMastered ? '🎉' : '🏆'}
            </span>
            <div className="mastery-banner-copy">
              <strong>{masterySummary.headline}</strong>
              <span>{masterySummary.message}</span>
            </div>
            {masterySummary.allMastered && <MasterySparkles seed={masterySummary.totalLessons} count={20} />}
          </div>
        )}
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

      <StoryEntryCard
        unlocked={storyUnlocked}
        providerConfigured={storyProviderConfigured}
        hasActiveSession={storyHasActiveSession}
        savedCount={storySavedCount}
        busy={storyBusy}
        onOpen={onOpenStory}
        onOpenLibrary={onOpenStoryLibrary}
      />

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
