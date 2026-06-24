import { useState } from 'react'
import { MathText } from '../../MathText'
import { checkSliderStep } from '../../engine'
import type { PlotPoint, SliderStep, StepResult } from '../../domain'
import type { CompleteOptions } from '../types'
import { PLOT_AREA, PLOT_PADDING, PLOT_VIEW_BOX, clampToRange } from '../plotGeometry'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'

// Formats a slope/intercept pair as a slope-intercept equation, e.g. "y = 3x + 2",
// "y = -x", "y = 2x", or "y = 5" (a flat line). Used for the live readout and the
// screen-reader value text on each slider.
function formatLineEquation(slope: number, intercept: number): string {
  if (slope === 0) return `y = ${intercept}`
  const slopePart = slope === 1 ? 'x' : slope === -1 ? '-x' : `${slope}x`
  if (intercept === 0) return `y = ${slopePart}`
  return `y = ${slopePart} ${intercept > 0 ? '+' : '-'} ${Math.abs(intercept)}`
}

// Clips the infinite line y = mx + b to the visible square grid, returning the two points
// where it enters and leaves the box so the SVG segment never spills past the axes.
function sliderLineEndpoints(
  slope: number,
  intercept: number,
  range: { min: number; max: number },
): [PlotPoint, PlotPoint] {
  const { min, max } = range
  const within = (value: number) => value >= min - 1e-9 && value <= max + 1e-9
  const candidates: PlotPoint[] = []
  const pushUnique = (point: PlotPoint) => {
    const key = (value: number) => Math.round(value * 1000) / 1000
    if (candidates.some((existing) => key(existing.x) === key(point.x) && key(existing.y) === key(point.y))) return
    candidates.push(point)
  }

  const yAtMin = slope * min + intercept
  if (within(yAtMin)) pushUnique({ x: min, y: yAtMin })
  const yAtMax = slope * max + intercept
  if (within(yAtMax)) pushUnique({ x: max, y: yAtMax })
  if (slope !== 0) {
    const xAtMax = (max - intercept) / slope
    if (within(xAtMax)) pushUnique({ x: xAtMax, y: max })
    const xAtMin = (min - intercept) / slope
    if (within(xAtMin)) pushUnique({ x: xAtMin, y: min })
  }

  if (candidates.length >= 2) return [candidates[0], candidates[1]]
  // Fallback (line barely grazes the box): draw across the full width.
  return [
    { x: min, y: slope * min + intercept },
    { x: max, y: slope * max + intercept },
  ]
}

// Neutral non-target starting values so a fresh task is never pre-solved: a flat line on
// the x-axis (m = 0, b = 0) when both sit inside the controls, otherwise the low corner.
function sliderInitialValue(step: SliderStep): { slope: number; intercept: number } {
  const slope = clampToRange(0, step.slope.min, step.slope.max)
  const intercept = clampToRange(0, step.intercept.min, step.intercept.max)
  if (slope === step.target.slope && intercept === step.target.intercept) {
    return { slope: step.slope.min, intercept: step.intercept.min }
  }
  return { slope, intercept }
}

export function SliderStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: SliderStep
  priorResult?: StepResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const { range } = step
  const { feedback, correct, attempts, reveal, retryGuidance, submit, clearStatus } = useCheckableStep({
    priorResult,
    onComplete,
  })
  const initial = sliderInitialValue(step)
  const [slope, setSlope] = useState(priorResult?.correct ? step.target.slope : initial.slope)
  const [intercept, setIntercept] = useState(priorResult?.correct ? step.target.intercept : initial.intercept)

  const span = range.max - range.min || 1
  const ticks = Array.from({ length: span + 1 }, (_, index) => range.min + index)
  const toSvgX = (x: number) => PLOT_PADDING + ((x - range.min) / span) * PLOT_AREA
  const toSvgY = (y: number) => PLOT_PADDING + ((range.max - y) / span) * PLOT_AREA

  const slopeStep = step.slope.step ?? 1
  const interceptStep = step.intercept.step ?? 1
  const equation = formatLineEquation(slope, intercept)
  const [lineStart, lineEnd] = sliderLineEndpoints(slope, intercept, range)

  // The rise-over-run guide (run 1 right, then rise m up from the y-intercept) only renders
  // when the whole step fits on the grid, so a steep slope hides it instead of overflowing.
  const interceptInRange = intercept >= range.min && intercept <= range.max
  const riseEnd = intercept + slope
  const guideVisible =
    slope !== 0 &&
    interceptInRange &&
    1 >= range.min &&
    1 <= range.max &&
    riseEnd >= range.min &&
    riseEnd <= range.max

  const updateSlope = (next: number) => {
    if (correct) return
    setSlope(next)
    clearStatus()
  }

  const updateIntercept = (next: number) => {
    if (correct) return
    setIntercept(next)
    clearStatus()
  }

  const check = () => {
    submit(checkSliderStep(step, { slope, intercept }, attempts + 1))
  }

  const reset = () => {
    setSlope(initial.slope)
    setIntercept(initial.intercept)
    clearStatus()
  }

  return (
    <article className="lesson-card card slider-card">
      <p className="eyebrow">Drag it</p>
      <h1 className="build-prompt">{step.prompt}</h1>
      <p className="slider-goal" role="note">
        Goal: drag the m and b sliders until the live line matches the description.
      </p>

      <div className="slider-stage">
        <svg
          className={`plot-grid slider-grid ${correct ? 'is-correct' : ''}`}
          viewBox={`0 0 ${PLOT_VIEW_BOX} ${PLOT_VIEW_BOX}`}
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <g key={`grid-${tick}`}>
              <line className="plot-gridline" x1={toSvgX(tick)} y1={toSvgY(range.min)} x2={toSvgX(tick)} y2={toSvgY(range.max)} />
              <line className="plot-gridline" x1={toSvgX(range.min)} y1={toSvgY(tick)} x2={toSvgX(range.max)} y2={toSvgY(tick)} />
            </g>
          ))}
          <line className="plot-axis" x1={toSvgX(range.min)} y1={toSvgY(0)} x2={toSvgX(range.max)} y2={toSvgY(0)} />
          <line className="plot-axis" x1={toSvgX(0)} y1={toSvgY(range.min)} x2={toSvgX(0)} y2={toSvgY(range.max)} />
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text key={`xlabel-${tick}`} className="plot-tick-label" x={toSvgX(tick)} y={toSvgY(0) + 15} textAnchor="middle">
                {tick}
              </text>
            ))}
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text key={`ylabel-${tick}`} className="plot-tick-label" x={toSvgX(0) - 9} y={toSvgY(tick) + 4} textAnchor="end">
                {tick}
              </text>
            ))}
          <text className="plot-axis-name" x={toSvgX(range.max) - 2} y={toSvgY(0) - 9} textAnchor="end">
            x
          </text>
          <text className="plot-axis-name" x={toSvgX(0) + 11} y={toSvgY(range.max) + 6} textAnchor="start">
            y
          </text>
          {guideVisible && (
            <g className="slider-guide">
              <line x1={toSvgX(0)} y1={toSvgY(intercept)} x2={toSvgX(1)} y2={toSvgY(intercept)} />
              <line x1={toSvgX(1)} y1={toSvgY(intercept)} x2={toSvgX(1)} y2={toSvgY(riseEnd)} />
              <text className="slider-guide-label" x={toSvgX(0.5)} y={toSvgY(intercept) + 14} textAnchor="middle">
                run 1
              </text>
              <text className="slider-guide-label" x={toSvgX(1) + 6} y={toSvgY((intercept + riseEnd) / 2) + 4} textAnchor="start">
                rise {slope}
              </text>
            </g>
          )}
          <line className="slider-line" x1={toSvgX(lineStart.x)} y1={toSvgY(lineStart.y)} x2={toSvgX(lineEnd.x)} y2={toSvgY(lineEnd.y)} />
          {interceptInRange && (
            <g className="slider-intercept-point">
              <circle cx={toSvgX(0)} cy={toSvgY(intercept)} r={6} />
              <text className="plot-point-label" x={toSvgX(0) + 11} y={toSvgY(intercept) - 10} textAnchor="start">
                b = {intercept}
              </text>
            </g>
          )}
        </svg>

        <div className="slider-controls">
          <p className="slider-equation" aria-live="polite">
            <MathText>{equation}</MathText>
          </p>
          <label className="slider-control">
            <span className="slider-control-head">
              <span>Slope m</span>
              <span className="slider-value">{slope}</span>
            </span>
            <input
              type="range"
              min={step.slope.min}
              max={step.slope.max}
              step={slopeStep}
              value={slope}
              disabled={correct}
              aria-label="Slope m"
              aria-valuetext={`slope ${slope}, line ${equation}`}
              onChange={(event) => updateSlope(Number(event.target.value))}
            />
            <span className="slider-range-ends" aria-hidden="true">
              <span>{step.slope.min}</span>
              <span>{step.slope.max}</span>
            </span>
          </label>
          <label className="slider-control">
            <span className="slider-control-head">
              <span>Intercept b</span>
              <span className="slider-value">{intercept}</span>
            </span>
            <input
              type="range"
              min={step.intercept.min}
              max={step.intercept.max}
              step={interceptStep}
              value={intercept}
              disabled={correct}
              aria-label="Intercept b"
              aria-valuetext={`intercept ${intercept}, line ${equation}`}
              onChange={(event) => updateIntercept(Number(event.target.value))}
            />
            <span className="slider-range-ends" aria-hidden="true">
              <span>{step.intercept.min}</span>
              <span>{step.intercept.max}</span>
            </span>
          </label>
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check
      </button>
      <StepFeedback
        feedback={feedback}
        correct={correct}
        attempts={attempts}
        reveal={reveal}
        retryGuidance={retryGuidance}
        defaultRetryMessage="Adjust the m and b sliders, then check again."
        retryActionLabel="Reset"
        onRetryAction={reset}
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
