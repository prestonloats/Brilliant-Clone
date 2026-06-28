import assert from 'node:assert/strict'
import { test } from 'node:test'

import { algebraCourse, lessons } from '../src/domain'
import { buildLessonGraph } from '../src/engine'

test('buildLessonGraph derives ranks, branch split, and merge stages', () => {
  const graph = buildLessonGraph(algebraCourse, lessons)

  assert.equal(graph.nodes['balancing-equations'].rank, 0)
  assert.equal(graph.nodes['one-step-equations'].rank, 1)
  assert.equal(graph.nodes['two-step-equations'].rank, 2)
  assert.equal(graph.nodes['like-terms-variables-both-sides'].rank, 3)
  assert.equal(graph.nodes['coordinate-plane'].rank, 3)
  assert.equal(graph.nodes['graphing-lines'].rank, 4)

  assert.deepEqual(graph.nodes['two-step-equations'].unlocks, [
    'like-terms-variables-both-sides',
    'coordinate-plane',
  ])
  assert.deepEqual(graph.nodes['graphing-lines'].prerequisites, [
    'like-terms-variables-both-sides',
    'coordinate-plane',
  ])
  assert.deepEqual(graph.nodes['graphing-lines'].unlocks, [])

  assert.deepEqual(
    graph.stages.map((stage) => stage.connector),
    ['start', 'linear', 'linear', 'split', 'merge'],
  )

  const branchStage = graph.stages.find((stage) => stage.connector === 'split')
  assert.deepEqual(branchStage?.nodeIds, ['like-terms-variables-both-sides', 'coordinate-plane'])

  const mergeStage = graph.stages.find((stage) => stage.connector === 'merge')
  assert.deepEqual(mergeStage?.nodeIds, ['graphing-lines'])
})
