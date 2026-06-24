import { algebraCourse, lessons, type LessonId, type LessonProgress, type SkillMastery } from '../domain'
import { buildLessonGraph, type LessonGraphConnector, type ProgressByLesson } from '../engine'
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
    <section className="path-graph-section" aria-labelledby="path-graph-heading">
      <div className="path-graph-head">
        <h2 id="path-graph-heading">Your learning path</h2>
        <p className="path-graph-sub">
          Each lesson unlocks once its prerequisites are complete. After Two-Step Equations the path
          splits into two parallel branches that merge again at Graphing Lines.
        </p>
      </div>
      <ol className="path-graph">
        {graph.stages.map((stage) => (
          <li
            className={`path-stage connector-stage-${stage.connector} ${stage.nodeIds.length > 1 ? 'is-branch' : ''}`}
            key={stage.rank}
          >
            {stage.connector !== 'start' && <StageConnector connector={stage.connector} />}
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

function StageConnector({ connector }: { connector: LessonGraphConnector }) {
  if (connector === 'split') {
    return (
      <div className="stage-connector connector-split" aria-hidden="true">
        <svg viewBox="0 0 200 46" preserveAspectRatio="none" className="connector-art">
          <path d="M100 0 L100 14 M100 14 L50 46 M100 14 L150 46" pathLength={1} />
        </svg>
      </div>
    )
  }

  if (connector === 'merge') {
    return (
      <div className="stage-connector connector-merge" aria-hidden="true">
        <svg viewBox="0 0 200 46" preserveAspectRatio="none" className="connector-art">
          <path d="M50 0 L100 32 M150 0 L100 32 M100 32 L100 46" pathLength={1} />
        </svg>
      </div>
    )
  }

  return (
    <div className={`stage-connector connector-${connector}`} aria-hidden="true">
      <span className="connector-line" />
    </div>
  )
}
