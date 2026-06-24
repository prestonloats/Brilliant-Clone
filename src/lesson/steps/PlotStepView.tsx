import { useRef, useState } from 'react'
import { checkPlotStep } from '../../engine'
import type { PlotPoint, PlotStep } from '../../domain'
import { FeedbackPanel } from '../../components/FeedbackPanel'
import { RetryPrompt } from '../../components/RetryPrompt'
import type { CompleteOptions, StepPriorResult } from '../types'
import { PLOT_AREA, PLOT_PADDING, PLOT_VIEW_BOX, clampToRange } from '../plotGeometry'

const PLOT_QUADRANT_LABELS: Record<1 | 2 | 3 | 4, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

function describePlotGoal(step: PlotStep): string {
  if (step.target.kind === 'points') {
    const count = step.target.points.length
    return count === 1 ? 'Goal: place 1 point.' : `Goal: place ${count} points.`
  }
  const quadrants = step.target.quadrants
  if (quadrants.length === 1) {
    return `Goal: place 1 point in Quadrant ${PLOT_QUADRANT_LABELS[quadrants[0]]}.`
  }
  return `Goal: place ${quadrants.length} points, one in each quadrant.`
}

// A representative off-axis point per quadrant so a previously-solved quadrant task can be
// re-shown as solved on return (mirrors the resume behaviour of the other interactive steps).
function plotRepresentativePoint(quadrant: 1 | 2 | 3 | 4, range: { min: number; max: number }): PlotPoint {
  const magnitude = Math.max(1, Math.min(2, Math.min(range.max, Math.abs(range.min))))
  return {
    x: quadrant === 1 || quadrant === 4 ? magnitude : -magnitude,
    y: quadrant === 1 || quadrant === 2 ? magnitude : -magnitude,
  }
}

export function PlotStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: PlotStep
  priorResult?: StepPriorResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const { range, target } = step
  const requiredCount = target.kind === 'points' ? target.points.length : target.quadrants.length
  const makeSolvedPoints = (): PlotPoint[] =>
    target.kind === 'points'
      ? target.points.map((point) => ({ ...point }))
      : target.quadrants.map((quadrant) => plotRepresentativePoint(quadrant, range))

  const [points, setPoints] = useState<PlotPoint[]>(priorResult?.correct ? makeSolvedPoints() : [])
  const [cursor, setCursor] = useState<PlotPoint>({ x: 0, y: 0 })
  const [showCursor, setShowCursor] = useState(false)
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const svgRef = useRef<SVGSVGElement | null>(null)

  const span = range.max - range.min || 1
  const midpoint = (range.min + range.max) / 2
  const ticks = Array.from({ length: span + 1 }, (_, index) => range.min + index)
  const toSvgX = (x: number) => PLOT_PADDING + ((x - range.min) / span) * PLOT_AREA
  const toSvgY = (y: number) => PLOT_PADDING + ((range.max - y) / span) * PLOT_AREA

  const clearStatus = () => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }

  const placePoint = (raw: PlotPoint) => {
    if (correct) return
    const x = clampToRange(Math.round(raw.x), range.min, range.max)
    const y = clampToRange(Math.round(raw.y), range.min, range.max)
    setPoints((current) => {
      if (current.some((existing) => existing.x === x && existing.y === y)) return current
      if (requiredCount <= 1) return [{ x, y }]
      if (current.length >= requiredCount) return current
      return [...current, { x, y }]
    })
    clearStatus()
  }

  const togglePoint = (raw: PlotPoint) => {
    if (correct) return
    const x = clampToRange(Math.round(raw.x), range.min, range.max)
    const y = clampToRange(Math.round(raw.y), range.min, range.max)
    if (points.some((existing) => existing.x === x && existing.y === y)) {
      setPoints((current) => current.filter((existing) => !(existing.x === x && existing.y === y)))
      clearStatus()
      return
    }
    placePoint({ x, y })
  }

  const undo = () => {
    setPoints((current) => current.slice(0, -1))
    clearStatus()
  }

  const clearAll = () => {
    setPoints([])
    clearStatus()
  }

  const dataPointFromEvent = (event: React.PointerEvent<SVGSVGElement>): PlotPoint | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const svgX = ((event.clientX - rect.left) / rect.width) * PLOT_VIEW_BOX
    const svgY = ((event.clientY - rect.top) / rect.height) * PLOT_VIEW_BOX
    return {
      x: ((svgX - PLOT_PADDING) / PLOT_AREA) * span + range.min,
      y: range.max - ((svgY - PLOT_PADDING) / PLOT_AREA) * span,
    }
  }

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (correct) return
    const point = dataPointFromEvent(event)
    if (!point) return
    // Ignore taps that land well outside the plotting area (e.g. on the label gutter).
    if (
      point.x < range.min - 0.6 ||
      point.x > range.max + 0.6 ||
      point.y < range.min - 0.6 ||
      point.y > range.max + 0.6
    ) {
      return
    }
    const rounded = {
      x: clampToRange(Math.round(point.x), range.min, range.max),
      y: clampToRange(Math.round(point.y), range.min, range.max),
    }
    setCursor(rounded)
    togglePoint(rounded)
  }

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (correct) return
    const moves: Record<string, PlotPoint> = {
      ArrowUp: { x: 0, y: 1 },
      ArrowDown: { x: 0, y: -1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      setShowCursor(true)
      setCursor((current) => ({
        x: clampToRange(current.x + move.x, range.min, range.max),
        y: clampToRange(current.y + move.y, range.min, range.max),
      }))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setShowCursor(true)
      togglePoint(cursor)
    }
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkPlotStep(step, points, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  const placedSummary =
    points.length === 0
      ? 'No points placed yet.'
      : `Placed ${points.length} of ${requiredCount}: ${points.map((point) => `(${point.x}, ${point.y})`).join(', ')}`

  return (
    <article className="lesson-card card plot-card">
      <p className="eyebrow">Plot it</p>
      <h1>{step.prompt}</h1>
      <p className="plot-goal" role="note">
        {describePlotGoal(step)}
      </p>

      <div className="plot-stage">
        <svg
          ref={svgRef}
          className="plot-grid"
          viewBox={`0 0 ${PLOT_VIEW_BOX} ${PLOT_VIEW_BOX}`}
          role="application"
          tabIndex={correct ? -1 : 0}
          aria-label={`Coordinate grid from ${range.min} to ${range.max} on both axes. Use the arrow keys to move the cursor and Enter to place a point. ${placedSummary}`}
          onPointerDown={handlePointer}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowCursor(true)}
          onBlur={() => setShowCursor(false)}
        >
          {ticks.map((tick) => (
            <g key={`grid-${tick}`}>
              <line
                className="plot-gridline"
                x1={toSvgX(tick)}
                y1={toSvgY(range.min)}
                x2={toSvgX(tick)}
                y2={toSvgY(range.max)}
              />
              <line
                className="plot-gridline"
                x1={toSvgX(range.min)}
                y1={toSvgY(tick)}
                x2={toSvgX(range.max)}
                y2={toSvgY(tick)}
              />
            </g>
          ))}
          <line className="plot-axis" x1={toSvgX(range.min)} y1={toSvgY(0)} x2={toSvgX(range.max)} y2={toSvgY(0)} />
          <line className="plot-axis" x1={toSvgX(0)} y1={toSvgY(range.min)} x2={toSvgX(0)} y2={toSvgY(range.max)} />
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text
                key={`xlabel-${tick}`}
                className="plot-tick-label"
                x={toSvgX(tick)}
                y={toSvgY(0) + 15}
                textAnchor="middle"
              >
                {tick}
              </text>
            ))}
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text
                key={`ylabel-${tick}`}
                className="plot-tick-label"
                x={toSvgX(0) - 9}
                y={toSvgY(tick) + 4}
                textAnchor="end"
              >
                {tick}
              </text>
            ))}
          <text className="plot-axis-name" x={toSvgX(range.max) - 2} y={toSvgY(0) - 9} textAnchor="end">
            x
          </text>
          <text className="plot-axis-name" x={toSvgX(0) + 11} y={toSvgY(range.max) + 6} textAnchor="start">
            y
          </text>
          {showCursor && !correct && (
            <circle className="plot-cursor" cx={toSvgX(cursor.x)} cy={toSvgY(cursor.y)} r={9} aria-hidden="true" />
          )}
          {points.map((point, index) => {
            const onRight = point.x >= midpoint
            const onTop = point.y >= midpoint
            return (
              <g className={`plot-point ${correct ? 'is-correct' : ''}`} key={`${point.x}-${point.y}-${index}`}>
                <circle cx={toSvgX(point.x)} cy={toSvgY(point.y)} r={7} />
                <text
                  className="plot-point-label"
                  x={toSvgX(point.x) + (onRight ? -11 : 11)}
                  y={toSvgY(point.y) + (onTop ? 19 : -10)}
                  textAnchor={onRight ? 'end' : 'start'}
                >
                  ({point.x}, {point.y})
                </text>
              </g>
            )
          })}
        </svg>

        <div className="plot-controls">
          <p className="plot-placed" aria-live="polite">
            {placedSummary}
          </p>
          {points.length > 0 && !correct && (
            <div className="plot-actions">
              <button type="button" onClick={undo}>
                Undo
              </button>
              <button type="button" onClick={clearAll}>
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct || points.length === 0} onClick={check}>
        Check
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt message={retryGuidance || 'Adjust your point, or clear it and try again.'} actionLabel="Clear" onAction={clearAll} />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}
