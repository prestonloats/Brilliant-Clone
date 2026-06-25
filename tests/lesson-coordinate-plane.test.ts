import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coordinatePlaneLesson } from '../src/content/lessons/coordinate-plane'
import type { LessonStep, PlotHintWhen } from '../src/content/types'
import { checkInputStep, checkPlotStep } from '../src/engine'
import { findHintText, findStepIn } from './helpers/findStep'

const step = findStepIn(coordinatePlaneLesson)

const plotHint = (plot: Extract<LessonStep, { type: 'plot' }>, when: PlotHintWhen) =>
  findHintText(plot, when)

test('coordinate-plane keeps its path metadata and ends on a concept summary', () => {
  assert.equal(coordinatePlaneLesson.id, 'coordinate-plane')
  assert.deepEqual(coordinatePlaneLesson.skillIds, ['coordinate-plane'])
  assert.deepEqual(coordinatePlaneLesson.prerequisites, ['two-step-equations'])

  const finalStep = coordinatePlaneLesson.steps.at(-1)
  assert.equal(finalStep?.type, 'concept')
  assert.equal(finalStep?.id, 'complete-coordinate-plane-summary')

  const ids = coordinatePlaneLesson.steps.map((candidate) => candidate.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('the interactive plot tasks sit between quadrants and the final summary', () => {
  const indexOf = (id: string) => coordinatePlaneLesson.steps.findIndex((candidate) => candidate.id === id)
  const summaryIndex = indexOf('complete-coordinate-plane-summary')
  const quadrantIndex = indexOf('choose-quadrant')

  const laterIds = ['plot-point-each-quadrant', 'input-net-coordinate-walk', 'choose-point-in-quadrant-two']
  laterIds.forEach((id) => {
    const at = indexOf(id)
    assert.ok(at > quadrantIndex, `${id} should come after choose-quadrant`)
    assert.ok(at < summaryIndex, `${id} should come before the summary`)
  })

  // The lesson ends on a concept summary; the Quadrant II plot is the final assessed step.
  assert.equal(coordinatePlaneLesson.steps.at(-1)?.type, 'concept')
  assert.equal(coordinatePlaneLesson.steps[summaryIndex - 1].id, 'choose-point-in-quadrant-two')
})

test('recognition MCQs and the misleading manipulative became real plot tasks', () => {
  const plotIds = [
    'choose-coordinate-point',
    'choose-quadrant',
    'plot-point-each-quadrant',
    'choose-point-in-quadrant-two',
  ]
  plotIds.forEach((id) => {
    const plot = step(id, 'plot')
    assert.ok(plot.feedback.correct.length > 0)
    assert.ok(plot.feedback.incorrect.length > 0)
    assert.ok(plot.feedback.reveal.length > 0)
    assert.ok((plot.feedback.hints?.length ?? 0) > 0)
    assert.ok(plot.range.min < plot.range.max)
  })

  // The misleading "symmetric star map" manipulative is gone entirely.
  assert.equal(coordinatePlaneLesson.steps.some((candidate) => candidate.type === 'manipulative'), false)
})

test('checkPlotStep: exact-point task rewards (-4, 2) and flags reversed coordinates', () => {
  const plot = step('choose-coordinate-point', 'plot')
  assert.deepEqual(plot.target, { kind: 'points', points: [{ x: -4, y: 2 }] })

  const solved = checkPlotStep(plot, [{ x: -4, y: 2 }], 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, plot.feedback.correct)

  assert.equal(checkPlotStep(plot, [], 1).feedback, plotHint(plot, 'empty'))
  assert.equal(checkPlotStep(plot, [{ x: 2, y: -4 }], 1).feedback, plotHint(plot, 'swapped'))
  assert.equal(checkPlotStep(plot, [{ x: -3, y: 1 }], 1).feedback, plotHint(plot, 'close'))
  assert.equal(checkPlotStep(plot, [{ x: -4, y: 2 }, { x: 0, y: 0 }], 1).feedback, plotHint(plot, 'too-many'))

  const thirdMiss = checkPlotStep(plot, [{ x: 1, y: 1 }], 3)
  assert.equal(thirdMiss.correct, false)
  assert.equal(thirdMiss.reveal, plot.feedback.reveal)
})

test('checkPlotStep: Quadrant IV task checks the sign pattern and axis edge case', () => {
  const plot = step('choose-quadrant', 'plot')
  assert.deepEqual(plot.target, { kind: 'quadrants', quadrants: [4] })

  assert.equal(checkPlotStep(plot, [{ x: 3, y: -2 }], 1).correct, true)
  assert.equal(checkPlotStep(plot, [], 1).feedback, plotHint(plot, 'empty'))
  assert.equal(checkPlotStep(plot, [{ x: 3, y: 0 }], 1).feedback, plotHint(plot, 'on-axis'))
  assert.equal(checkPlotStep(plot, [{ x: 3, y: 2 }], 1).feedback, plotHint(plot, 'wrong-quadrant'))

  const thirdMiss = checkPlotStep(plot, [{ x: -1, y: -1 }], 3)
  assert.equal(thirdMiss.correct, false)
  assert.equal(thirdMiss.reveal, plot.feedback.reveal)
})

test('checkPlotStep: four-quadrant map needs one off-axis point per quadrant', () => {
  const plot = step('plot-point-each-quadrant', 'plot')
  assert.deepEqual(plot.target, { kind: 'quadrants', quadrants: [1, 2, 3, 4] })

  const solved = checkPlotStep(
    plot,
    [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }],
    1,
  )
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, plot.feedback.correct)

  // Two distinct quadrants covered but not all four yet -> incomplete.
  assert.equal(checkPlotStep(plot, [{ x: 1, y: 1 }, { x: -1, y: 1 }], 1).feedback, plotHint(plot, 'incomplete'))
  // Four points, but two share Quadrant I -> wrong-quadrant.
  assert.equal(
    checkPlotStep(plot, [{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: -1, y: -1 }, { x: 1, y: -1 }], 1).feedback,
    plotHint(plot, 'wrong-quadrant'),
  )
  assert.equal(checkPlotStep(plot, [{ x: 0, y: 2 }], 1).feedback, plotHint(plot, 'on-axis'))
  assert.equal(
    checkPlotStep(
      plot,
      [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 2, y: 2 }],
      1,
    ).feedback,
    plotHint(plot, 'too-many'),
  )
})

test('checkPlotStep: Quadrant II mastery check rewards (-, +) and escalates to reveal', () => {
  const plot = step('choose-point-in-quadrant-two', 'plot')
  assert.deepEqual(plot.target, { kind: 'quadrants', quadrants: [2] })

  assert.equal(checkPlotStep(plot, [{ x: -2, y: 3 }], 1).correct, true)
  assert.equal(checkPlotStep(plot, [{ x: 2, y: 3 }], 1).feedback, plotHint(plot, 'wrong-quadrant'))

  const thirdMiss = checkPlotStep(plot, [{ x: 1, y: -1 }], 3)
  assert.equal(thirdMiss.correct, false)
  assert.equal(thirdMiss.reveal, plot.feedback.reveal)
})

test('net-coordinate walk input still accepts equivalent forms and targets sign mistakes', () => {
  const walk = step('input-net-coordinate-walk', 'input')

  assert.equal(checkInputStep(walk, '(-2,-5)', 1).correct, true)
  assert.equal(checkInputStep(walk, '-2,-5', 1).correct, true)
  assert.equal(checkInputStep(walk, 'x=-2,y=-5', 1).correct, true)

  assert.equal(checkInputStep(walk, '(-5,-2)', 1).feedback, walk.feedback.hintsByAnswer?.['(-5,-2)'])

  const thirdMiss = checkInputStep(walk, '(-5,-2)', 3)
  assert.equal(thirdMiss.correct, false)
  assert.equal(thirdMiss.feedback, walk.feedback.incorrect)
  assert.equal(thirdMiss.reveal, walk.feedback.reveal)
})
