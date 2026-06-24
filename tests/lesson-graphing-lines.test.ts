import assert from 'node:assert/strict'
import { test } from 'node:test'

import { graphingLinesLesson } from '../src/domain'
import type { LessonStep, SliderHintWhen } from '../src/domain'
import { checkInputStep, checkOperationChoiceStep, checkSliderStep } from '../src/engine'

const findStep = <Type extends LessonStep['type']>(id: string, type: Type) => {
  const step = graphingLinesLesson.steps.find((candidate) => candidate.id === id)
  assert.ok(step, `expected a step with id "${id}"`)
  assert.equal(step.type, type)
  return step as Extract<LessonStep, { type: Type }>
}

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
  const hintText = (when: SliderHintWhen) => matchLine.feedback.hints?.find((hint) => hint.when === when)?.text

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
    buildLine.feedback.hints?.find((hint) => hint.when === 'slope-off')?.text,
  )
  // A line that falls instead of climbs is caught as a wrong slope direction.
  assert.equal(
    checkSliderStep(buildLine, { slope: -2, intercept: 0 }, 1).feedback,
    buildLine.feedback.hints?.find((hint) => hint.when === 'slope-direction')?.text,
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
