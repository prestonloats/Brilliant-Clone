import type { Lesson, LessonProgress } from '../domain'
import { getBestLessonScore, getLatestLessonScore } from '../engine'
import { getLessonScoreDetail } from '../course/courseHelpers'
import { useCountUp } from '../hooks/useCountUp'

const SCORE_RING_RADIUS = 54
const SCORE_RING_CIRCUMFERENCE = 2 * Math.PI * SCORE_RING_RADIUS

const CELEBRATION_PIECES: { x: string; delay: string; color: string }[] = [
  { x: '-48px', delay: '0ms', color: '#2563eb' },
  { x: '-26px', delay: '110ms', color: '#22c55e' },
  { x: '-8px', delay: '40ms', color: '#f59e0b' },
  { x: '12px', delay: '150ms', color: '#ec4899' },
  { x: '30px', delay: '70ms', color: '#8b5cf6' },
  { x: '48px', delay: '190ms', color: '#22c55e' },
  { x: '-38px', delay: '220ms', color: '#f59e0b' },
  { x: '40px', delay: '20ms', color: '#2563eb' },
]

export function CompleteScreen({
  lesson,
  progress,
  recommendation,
  onCourse,
  onRetake,
}: {
  lesson: Lesson
  progress: LessonProgress
  recommendation: { title: string; body: string }
  onCourse: () => void
  onRetake: () => void
}) {
  const copy = getCompletionCopy(lesson)
  const latestScore = getLatestLessonScore(lesson, progress)
  const bestScore = getBestLessonScore(lesson, progress)
  const displayScore = useCountUp(latestScore?.scorePercent ?? 0)
  const ringOffset = SCORE_RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, displayScore)) / 100)

  return (
    <section className="complete-card card">
      <p className="eyebrow">Lesson complete</p>
      <h1>{copy.title}</h1>
      <p className="lead">{copy.body}</p>
      {latestScore && (
        <div className="score-card">
          <span>First-try score</span>
          <div className="score-figure">
            <div
              className="score-ring"
              role="img"
              aria-label={`First-try score ${latestScore.scorePercent} percent`}
            >
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="score-ring-track" cx="60" cy="60" r={SCORE_RING_RADIUS} />
                <circle
                  className="score-ring-value"
                  cx="60"
                  cy="60"
                  r={SCORE_RING_RADIUS}
                  transform="rotate(-90 60 60)"
                  style={{
                    strokeDasharray: SCORE_RING_CIRCUMFERENCE,
                    strokeDashoffset: ringOffset,
                  }}
                />
              </svg>
              <strong aria-hidden="true">{displayScore}%</strong>
            </div>
            <span className="score-celebrate" aria-hidden="true">
              {CELEBRATION_PIECES.map((piece, index) => (
                <i
                  key={index}
                  style={
                    {
                      '--cx': piece.x,
                      '--cd': piece.delay,
                      '--cc': piece.color,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          </div>
          <p>{getLessonScoreDetail(lesson, progress)}</p>
          {bestScore && bestScore.scorePercent !== latestScore.scorePercent && <small>Best score: {bestScore.scorePercent}%</small>}
        </div>
      )}
      <div className="next-card">
        <span>Recommended next</span>
        <strong>{recommendation.title}</strong>
        <p>{recommendation.body}</p>
      </div>
      <div className="complete-actions">
        <button className="primary-action" type="button" onClick={onCourse}>
          Back to course path
        </button>
        <button className="secondary-action" type="button" onClick={onRetake}>
          Retake lesson
        </button>
      </div>
    </section>
  )
}

function getCompletionCopy(lesson: Lesson) {
  if (lesson.id === 'graphing-lines') {
    return {
      title: 'You graphed lines from equations.',
      body: 'You used slope, intercepts, points, and tables to recognize linear equations.',
    }
  }

  if (lesson.id === 'coordinate-plane') {
    return {
      title: 'You read the coordinate plane.',
      body: 'You located points by moving horizontally for x and vertically for y.',
    }
  }

  if (lesson.id === 'like-terms-variables-both-sides') {
    return {
      title: 'You solved after gathering terms.',
      body: 'You classified x-terms, combined like terms, caught a wrong sign move, and gathered variables before isolating x.',
    }
  }

  if (lesson.id === 'two-step-equations') {
    return {
      title: 'You solved two-step equations.',
      body: 'You worked backward through two operations while keeping both sides equal.',
    }
  }

  if (lesson.id === 'one-step-equations') {
    return {
      title: 'You solved one-step equations.',
      body: 'You chose inverse operations and applied them to both sides to isolate x.',
    }
  }

  return {
    title: 'You solved by keeping balance.',
    body: 'You used equality and inverse operations to isolate x without breaking the equation.',
  }
}
