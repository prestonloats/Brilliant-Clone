import type { PlotPoint } from '../domain'

export const PLOT_VIEW_BOX = 360
export const PLOT_PADDING = 34
export const PLOT_AREA = PLOT_VIEW_BOX - PLOT_PADDING * 2

export const clampToRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

// Clips the infinite line y = mx + b to the visible square grid, returning the two points
// where it enters and leaves the box so the SVG segment never spills past the axes. Shared by
// the static LineGraph and the interactive slider step.
export function lineEndpoints(
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
