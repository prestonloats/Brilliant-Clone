import assert from 'node:assert/strict'
import { test } from 'node:test'

import { graphingLinesLesson } from '../src/domain'
import type { LessonStep, SliderHintWhen } from '../src/domain'
import { checkInputStep, checkOperationChoiceStep, checkSliderStep } from '../src/engine'
import { findHintText, findStep as findLessonStep } from './helpers/findStep'

const findStep = <Type extends LessonStep['type']>(id: string, type: Type) =>
  findLessonStep(graphingLinesLesson, id, type)

test('graphing-lines match-line slider accepts the described slope and intercept', () => {
  const matchLine = findStep('match-slope-intercept-line', 'slider')
  assert.deepEqual(matchLine.target, { slope: 3, intercept: 2 })
  assert.ok(matchLine.range.min < 0 && matchLine.range.max > 0)

  const solved = checkSliderStep(matchLine, { slope: 3, intercept: 2 }, 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, matchLine.feedback.correct)
})

test('graphing-lines match-line slider escalates targeted m/b hints to a reveal', () => {
  const matchLine = findStep('match-slope-intercept-line', 'slider')
  const hintText = (when: SliderHintWhen) => findHintText(matchLine, when)

  // Each misconfigured line surfaces the misconception-specific hint on the first miss.
  assert.equal(checkSliderStep(matchLine, { slope: -3, intercept: 2 }, 1).feedback, hintText('slope-direction'))
  assert.equal(checkSliderStep(matchLine, { slope: 5, intercept: 2 }, 1).feedback, hintText('slope-off'))
  assert.equal(checkSliderStep(matchLine, { slope: 3, intercept: -1 }, 1).feedback, hintText('intercept-off'))
  assert.equal(checkSliderStep(matchLine, { slope: 4, intercept: 1 }, 1).feedback, hintText('close'))
  assert.equal(checkSliderStep(matchLine, { slope: 5, intercept: -2 }, 1).feedback, hintText('both-off'))

  const reveal = checkSliderStep(matchLine, { slope: 5, intercept: -2 }, 3)
  assert.equal(reveal.correct, false)
  assert.equal(reveal.feedback, matchLine.feedback.incorrect)
  assert.equal(reveal.reveal, matchLine.feedback.reveal)
})

test('graphing-lines build-slope slider targets a real rise-over-run line', () => {
  const buildLine = findStep('build-slope-line', 'slider')
  assert.deepEqual(buildLine.target, { slope: 2, intercept: 0 })

  assert.equal(checkSliderStep(buildLine, { slope: 2, intercept: 0 }, 1).correct, true)
  // Through the origin but flat: the intercept matches, so only the slope hint shows.
  assert.equal(
    checkSliderStep(buildLine, { slope: 0, intercept: 0 }, 1).feedback,
    findHintText(buildLine, 'slope-off'),
  )
  // A line that falls instead of climbs is caught as a wrong slope direction.
  assert.equal(
    checkSliderStep(buildLine, { slope: -2, intercept: 0 }, 1).feedback,
    findHintText(buildLine, 'slope-direction'),
  )
})

test('graphing-lines mastery check connects a two-point graph to its equation', () => {
  const fromGraph = findStep('mastery-equation-from-graph', 'operation-choice')
  assert.ok(fromGraph.choices.some((choice) => choice.id === fromGraph.correctId))

  const solved = checkOperationChoiceStep(fromGraph, 'y-equals-negative-two-x-plus-five', 1)
  assert.equal(solved.correct, true)
  assert.equal(solved.feedback, fromGraph.feedback.correct)

  const riseWithoutRun = checkOperationChoiceStep(fromGraph, 'y-equals-negative-four-x-plus-five', 1)
  assert.equal(riseWithoutRun.correct, false)
  assert.equal(riseWithoutRun.feedback, 'The rise is -4, but slope is rise over run: -4 / 2 = -2, not -4.')

  const reveal = checkOperationChoiceStep(fromGraph, 'y-equals-two-x-plus-five', 3)
  assert.equal(reveal.reveal, fromGraph.feedback.reveal)
})

test('graphing-lines mastery check solves for the y-intercept from slope and a point', () => {
  const findB = findStep('mastery-find-intercept', 'input')

  assert.equal(checkInputStep(findB, '7', 1).correct, true)
  assert.equal(checkInputStep(findB, 'b = 7', 1).correct, true)

  const pointValueMiss = checkInputStep(findB, '1', 1)
  assert.equal(pointValueMiss.correct, false)
  assert.equal(pointValueMiss.feedback, '1 is the y-value at the point (2, 1), not the y-intercept where x = 0.')

  const signMiss = checkInputStep(findB, '-5', 1)
  assert.equal(signMiss.feedback, 'Watch the signs: 1 = -6 + b means add 6 to both sides, so b = 7, not -5.')

  const reveal = checkInputStep(findB, '1', 3)
  assert.equal(reveal.reveal, findB.feedback.reveal)
})

test('graphing-lines keeps new interactive content before a concept summary and preserves the path', () => {
  const steps = graphingLinesLesson.steps
  const ids = steps.map((step) => step.id)

  assert.equal(graphingLinesLesson.id, 'graphing-lines')
  assert.deepEqual(graphingLinesLesson.prerequisites, ['like-terms-variables-both-sides', 'coordinate-plane'])

  // Unique ids across every step.
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('match-slope-intercept-line'))
  assert.ok(ids.includes('build-slope-line'))

  // The lesson still ends on a concept summary, not an assessed step.
  const last = steps.at(-1)
  assert.equal(last?.type, 'concept')
  assert.match(last?.id ?? '', /summary/)

  // The two mastery checks are the final assessed steps, right before the summary.
  assert.equal(ids.at(-2), 'mastery-find-intercept')
  assert.equal(ids.at(-3), 'mastery-equation-from-graph')

  // Both interactive sliders are assessed steps that come before the mastery checks, with the
  // slope-intercept matcher first and the rise-over-run builder second.
  const matchLine = findStep('match-slope-intercept-line', 'slider')
  const buildLine = findStep('build-slope-line', 'slider')
  assert.notEqual(matchLine.type, 'concept')
  assert.notEqual(buildLine.type, 'concept')
  assert.ok(ids.indexOf('match-slope-intercept-line') < ids.indexOf('build-slope-line'))
  assert.ok(ids.indexOf('build-slope-line') < ids.indexOf('mastery-equation-from-graph'))
})

test('graphing-lines explains how to graph a line before the interactive steps', () => {
  const ids = graphingLinesLesson.steps.map((step) => step.id)
  assert.ok(ids.includes('concept-how-to-graph'))
  assert.ok(ids.indexOf('concept-how-to-graph') < ids.indexOf('match-slope-intercept-line'))

  const howTo = findStep('concept-how-to-graph', 'concept')
  assert.match(howTo.body, /rise over run/i)
  assert.match(howTo.body, /y-axis/i)
})

test('graphing-lines table question uses real tables and explains tables first', () => {
  const ids = graphingLinesLesson.steps.map((step) => step.id)
  assert.ok(ids.includes('concept-tables'))
  assert.ok(ids.indexOf('concept-tables') < ids.indexOf('choose-line-table'))

  const tablesConcept = findStep('concept-tables', 'concept')
  assert.ok(tablesConcept.tables && tablesConcept.tables.length > 0, 'the tables concept should show example tables')

  const tableChoice = findStep('choose-line-table', 'operation-choice')
  assert.ok(
    tableChoice.choices.every((choice) => choice.table && choice.table.x.length === choice.table.y.length),
    'every table choice should carry equal-length x and y rows',
  )
  const correct = tableChoice.choices.find((choice) => choice.id === tableChoice.correctId)
  assert.deepEqual(correct?.table, { x: [0, 1, 2], y: [1, 3, 5] })
})

test('graphing-lines shows a line graph on the equation-from-graph question', () => {
  const fromGraph = findStep('mastery-equation-from-graph', 'operation-choice')
  assert.ok(fromGraph.graph, 'the question should include a graph to read')
  assert.equal(fromGraph.graph?.slope, -2)
  assert.equal(fromGraph.graph?.intercept, 5)
  assert.deepEqual(fromGraph.graph?.points, [
    { x: 0, y: 5 },
    { x: 2, y: 1 },
  ])
})
