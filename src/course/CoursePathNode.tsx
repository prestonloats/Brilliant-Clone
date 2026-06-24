import { algebraCourse, lessons, type LessonId, type LessonProgress, type SkillMastery } from '../domain'
import { isLessonUnlocked, type LessonGraphNode, type ProgressByLesson } from '../engine'
import { formatList, getLessonActionLabel, getLessonScoreText, getPathStatus } from './courseHelpers'
import { getNodeMasteryCelebration } from './masteryCelebration'
import { MasterySparkles } from './MasterySparkles'

type CoursePathNodeProps = {
  node: LessonGraphNode
  progress: LessonProgress | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  featuredLessonId: LessonId
  onLaunchLesson: (lessonId: LessonId) => void
  onRetakeLesson: (lessonId: LessonId) => void
}

export function CoursePathNode({
  node,
  progress,
  progressByLesson,
  mastery,
  featuredLessonId,
  onLaunchLesson,
  onRetakeLesson,
}: CoursePathNodeProps) {
  const lesson = lessons[node.id]
  const courseNode = algebraCourse.lessons.find((item) => item.id === node.id)
  const lessonProgress = progress && node.id === progress.lessonId ? progress : progressByLesson[node.id]
  const unlocked = isLessonUnlocked(lesson, progressByLesson)
  const completed = lessonProgress?.status === 'completed'
  const recommended = node.id === featuredLessonId && !completed && unlocked
  const status = getPathStatus({ recommended, unlocked, lesson, lessonProgress, mastery })
  const celebration = getNodeMasteryCelebration(lesson, lessonProgress, mastery)
  const scoreText = getLessonScoreText(lesson, lessonProgress)
  const position = algebraCourse.lessonOrder.indexOf(node.id) + 1

  const prerequisiteTitles = node.prerequisites.map((lessonId) => lessons[lessonId].title)
  const unlockTitles = node.unlocks.map((lessonId) => lessons[lessonId].title)
  const dependencyLine =
    prerequisiteTitles.length === 0
      ? 'Start here, no prerequisites'
      : `${unlocked ? 'Builds on' : 'Requires'} ${formatList(prerequisiteTitles)}`
  const dependencyTag = prerequisiteTitles.length === 0 ? 'Start' : unlocked ? 'Open' : 'Locked'

  return (
    <article
      className={`path-node graph-node ${status.className} ${recommended ? 'is-recommended' : ''} ${celebration.className}`}
      aria-current={recommended ? 'step' : undefined}
    >
      {celebration.isMastered && (
        <>
          <span className="mastery-badge" aria-hidden="true">
            {celebration.icon}
          </span>
          <MasterySparkles seed={position} count={14} />
        </>
      )}
      <div className="graph-node-head">
        <span className="node-number" aria-hidden="true">
          {position}
        </span>
        <div className="graph-node-titles">
          <h3>{courseNode?.title ?? lesson.title}</h3>
          <span className="status-pill">{status.label}</span>
        </div>
      </div>
      <p className="graph-node-desc">{courseNode?.description ?? lesson.subtitle}</p>
      <p className="node-deps">
        <span className="dep-tag">{dependencyTag}</span>
        <span>{dependencyLine}</span>
      </p>
      {unlockTitles.length > 1 && (
        <p className="node-deps node-deps-branch">
          <span className="dep-tag">Branches</span>
          <span>Unlocks {formatList(unlockTitles)} as two parallel paths</span>
        </p>
      )}
      {scoreText && <p className="score-line">{scoreText}</p>}
      <div className="graph-node-actions">
        {unlocked ? (
          <>
            <button type="button" onClick={() => onLaunchLesson(node.id)}>
              {getLessonActionLabel({ completed, started: Boolean(lessonProgress) })}
            </button>
            {completed && (
              <button type="button" onClick={() => onRetakeLesson(node.id)}>
                Retake
              </button>
            )}
          </>
        ) : (
          <span className="locked-hint">Finish {formatList(prerequisiteTitles)} to unlock</span>
        )}
      </div>
    </article>
  )
}
