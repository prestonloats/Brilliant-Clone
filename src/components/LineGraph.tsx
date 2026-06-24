import type { PlotPoint } from '../domain'
import { PLOT_AREA, PLOT_PADDING, PLOT_VIEW_BOX } from '../lesson/plotGeometry'

// Clips the infinite line y = mx + b to the visible square grid (same approach the slider step
// uses), returning the two points where it enters and leaves the box so the segment never
// spills past the axes.
function lineEndpoints(
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
  return [
    { x: min, y: slope * min + intercept },
    { x: max, y: slope * max + intercept },
  ]
}

// A static coordinate-plane graph of the line y = mx + b, with optional labelled points.
// Read-only (no interaction); used to show a line alongside a question.
export function LineGraph({
  range,
  slope,
  intercept,
  points = [],
  label,
}: {
  range: { min: number; max: number }
  slope: number
  intercept: number
  points?: PlotPoint[]
  label?: string
}) {
  const span = range.max - range.min || 1
  const ticks = Array.from({ length: span + 1 }, (_, index) => range.min + index)
  const toSvgX = (x: number) => PLOT_PADDING + ((x - range.min) / span) * PLOT_AREA
  const toSvgY = (y: number) => PLOT_PADDING + ((range.max - y) / span) * PLOT_AREA
  const [start, end] = lineEndpoints(slope, intercept, range)

  return (
    <svg
      className="plot-grid line-graph"
      viewBox={`0 0 ${PLOT_VIEW_BOX} ${PLOT_VIEW_BOX}`}
      role="img"
      aria-label={label ?? 'Graph of a line'}
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
      <line className="slider-line" x1={toSvgX(start.x)} y1={toSvgY(start.y)} x2={toSvgX(end.x)} y2={toSvgY(end.y)} />
      {points.map((point) => (
        <g className="slider-intercept-point" key={`point-${point.x}-${point.y}`}>
          <circle cx={toSvgX(point.x)} cy={toSvgY(point.y)} r={6} />
          <text className="plot-point-label" x={toSvgX(point.x) + 11} y={toSvgY(point.y) - 10} textAnchor="start">
            ({point.x}, {point.y})
          </text>
        </g>
      ))}
    </svg>
  )
}
