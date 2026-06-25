import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { PlotPoint } from '../src/domain'
import {
  clampToRange,
  lineEndpoints,
  PLOT_AREA,
  PLOT_PADDING,
  PLOT_VIEW_BOX,
} from '../src/lesson/plotGeometry'

// plotGeometry clips the infinite line y = mx + b to the visible square grid so the rendered
// SVG segment never spills past the axes. It is shared by the static LineGraph and the
// interactive slider step but had no direct coverage; these tests pin the clipping math.

const range = { min: -5, max: 5 }

// A line segment is direction-agnostic, so compare endpoints as an order-independent set
// (rounded) to keep the tests robust to harmless changes in which boundary is found first.
const sortPoints = (points: [PlotPoint, PlotPoint]) =>
  [...points]
    .map((point) => ({ x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6 }))
    .sort((a, b) => a.x - b.x || a.y - b.y)

const assertSegment = (
  actual: [PlotPoint, PlotPoint],
  expected: [PlotPoint, PlotPoint],
) => assert.deepEqual(sortPoints(actual), sortPoints(expected))

test('the layout constants stay internally consistent', () => {
  assert.equal(PLOT_VIEW_BOX, 360)
  assert.equal(PLOT_PADDING, 34)
  assert.equal(PLOT_AREA, PLOT_VIEW_BOX - PLOT_PADDING * 2)
})

test('clampToRange clamps below, above, and passes through in-range values', () => {
  assert.equal(clampToRange(-3, 0, 5), 0)
  assert.equal(clampToRange(10, 0, 5), 5)
  assert.equal(clampToRange(3, 0, 5), 3)
  assert.equal(clampToRange(0, 0, 5), 0)
  assert.equal(clampToRange(5, 0, 5), 5)
})

test('a unit-slope line through the origin exits at opposite corners', () => {
  assertSegment(lineEndpoints(1, 0, range), [
    { x: -5, y: -5 },
    { x: 5, y: 5 },
  ])
})

test('a horizontal line spans the full width at its intercept', () => {
  assertSegment(lineEndpoints(0, 2, range), [
    { x: -5, y: 2 },
    { x: 5, y: 2 },
  ])
})

test('a steep line is clipped to where it crosses the top and bottom edges', () => {
  // y = 5x leaves the box through y = ±5 (at x = ±1), not through the left/right edges.
  assertSegment(lineEndpoints(5, 0, range), [
    { x: -1, y: -5 },
    { x: 1, y: 5 },
  ])
})

test('an offset line is clipped to the box on both axes', () => {
  // y = 2x + 1: at x = -5 -> y = -9 (out of view), so the line enters through the bottom edge
  // y = -5 (x = -3) and leaves through the right edge x = 5 (y = 11 is out, so via x at y=5).
  // Crossings within view: x at y=5 -> x = 2; x at y=-5 -> x = -3.
  assertSegment(lineEndpoints(2, 1, range), [
    { x: -3, y: -5 },
    { x: 2, y: 5 },
  ])
})

test('returned endpoints always lie within the visible range', () => {
  for (const slope of [-4, -1, 0, 0.5, 3]) {
    for (const intercept of [-4, 0, 3]) {
      const [a, b] = lineEndpoints(slope, intercept, range)
      for (const point of [a, b]) {
        assert.ok(
          point.x >= range.min - 1e-6 && point.x <= range.max + 1e-6,
          `x ${point.x} out of range for y=${slope}x+${intercept}`,
        )
        assert.ok(
          point.y >= range.min - 1e-6 && point.y <= range.max + 1e-6,
          `y ${point.y} out of range for y=${slope}x+${intercept}`,
        )
      }
    }
  }
})
