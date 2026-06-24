import { algebraCourse, lessons, type LessonId, type LessonProgress, type SkillMastery } from '../domain'
import { buildLessonGraph, isLessonUnlocked, type LessonGraphConnector, type ProgressByLesson } from '../engine'
import { CoursePathNode } from './CoursePathNode'

type CoursePathGraphProps = {
  progress: LessonProgress | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  featuredLessonId: LessonId
  onLaunchLesson: (lessonId: LessonId) => void
  onRetakeLesson: (lessonId: LessonId) => void
}

export function CoursePathGraph({
  progress,
  progressByLesson,
  mastery,
  featuredLessonId,
  onLaunchLesson,
  onRetakeLesson,
}: CoursePathGraphProps) {
  const graph = buildLessonGraph(algebraCourse, lessons)

  return (
    <section className="path-graph-section" aria-label="Your learning path">
      <ol className="path-graph">
        {graph.stages.map((stage) => (
          <li
            className={`path-stage connector-stage-${stage.connector} ${stage.nodeIds.length > 1 ? 'is-branch' : ''}`}
            key={stage.rank}
          >
            {stage.connector !== 'start' && (
              <StageConnector
                connector={stage.connector}
                locked={!stage.nodeIds.some((lessonId) => isLessonUnlocked(lessons[lessonId], progressByLesson))}
              />
            )}
            <div className="stage-nodes">
              {stage.nodeIds.map((lessonId) => (
                <CoursePathNode
                  key={lessonId}
                  node={graph.nodes[lessonId]}
                  progress={progress}
                  progressByLesson={progressByLesson}
                  mastery={mastery}
                  featuredLessonId={featuredLessonId}
                  onLaunchLesson={onLaunchLesson}
                  onRetakeLesson={onRetakeLesson}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StageConnector({ connector, locked }: { connector: LessonGraphConnector; locked: boolean }) {
  const className = `stage-connector connector-${connector}${locked ? ' is-locked' : ''}`

  if (connector === 'split') {
    return (
      <div className={className} aria-hidden="true">
        <svg viewBox="0 0 200 46" preserveAspectRatio="none" className="connector-art">
          <path d="M100 0 L100 14 M100 14 L50 46 M100 14 L150 46" />
        </svg>
      </div>
    )
  }

  if (connector === 'merge') {
    return (
      <div className={className} aria-hidden="true">
        <svg viewBox="0 0 200 46" preserveAspectRatio="none" className="connector-art">
          <path d="M50 0 L100 32 M150 0 L100 32 M100 32 L100 46" />
        </svg>
      </div>
    )
  }

  return (
    <div className={className} aria-hidden="true">
      <span className="connector-line" />
    </div>
  )
}
