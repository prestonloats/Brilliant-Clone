import assert from 'node:assert/strict'
import { test } from 'node:test'

import { algebraCourse, lessons, skills } from '../src/domain'
import type { Lesson, LessonId, SkillId } from '../src/domain'
import { buildLessonGraph } from '../src/engine'

// Structural integrity of the authored course content. The per-lesson behavior tests
// (lesson-*.test.ts) exercise solving each lesson; these tests instead guard the data shape
// the whole app and the persistence guards rely on -- unique ids, valid cross-references, a
// well-formed prerequisite DAG -- so an authoring slip (duplicate step id, dangling skill or
// prerequisite, an unsolvable choice) fails CI here instead of crashing at runtime.

const lessonEntries = Object.entries(lessons) as [LessonId, Lesson][]
const catalogIds = Object.keys(lessons) as LessonId[]
const knownSkillIds = new Set<SkillId>(skills.map((skill) => skill.id))

test('every lessons[] catalog key matches its lesson.id', () => {
  for (const [key, lesson] of lessonEntries) {
    assert.equal(lesson.id, key, `catalog key "${key}" must equal lesson.id "${lesson.id}"`)
    assert.ok(lesson.title.trim(), `${key} needs a non-empty title`)
    assert.ok(lesson.subtitle.trim(), `${key} needs a non-empty subtitle`)
  }
})

test('course lessonOrder is a duplicate-free permutation of the lesson catalog', () => {
  const { lessonOrder } = algebraCourse
  assert.equal(new Set(lessonOrder).size, lessonOrder.length, 'lessonOrder contains duplicates')
  assert.deepEqual([...lessonOrder].sort(), [...catalogIds].sort())
})

test('course.lessons nodes line up exactly with lessonOrder', () => {
  const nodeIds = algebraCourse.lessons.map((node) => node.id)
  assert.equal(new Set(nodeIds).size, nodeIds.length, 'course.lessons has duplicate ids')
  assert.deepEqual([...nodeIds].sort(), [...algebraCourse.lessonOrder].sort())
  for (const node of algebraCourse.lessons) {
    assert.ok(node.title.trim(), `course node ${node.id} needs a title`)
    assert.ok(node.description.trim(), `course node ${node.id} needs a description`)
  }
})

test('skills have unique, non-empty ids/titles/descriptions', () => {
  assert.equal(new Set(skills.map((skill) => skill.id)).size, skills.length, 'duplicate skill ids')
  for (const skill of skills) {
    assert.ok(skill.id.trim(), 'skill id must be non-empty')
    assert.ok(skill.title.trim(), `skill ${skill.id} needs a title`)
    assert.ok(skill.description.trim(), `skill ${skill.id} needs a description`)
  }
})

test('every lesson references at least one real, non-duplicated skill', () => {
  for (const [id, lesson] of lessonEntries) {
    assert.ok(lesson.skillIds.length > 0, `${id} declares no skillIds`)
    assert.equal(new Set(lesson.skillIds).size, lesson.skillIds.length, `${id} has duplicate skillIds`)
    for (const skillId of lesson.skillIds) {
      assert.ok(knownSkillIds.has(skillId), `${id} references unknown skill "${skillId}"`)
    }
  }
})

test('every authored skill is exercised by at least one lesson', () => {
  const referenced = new Set(lessonEntries.flatMap(([, lesson]) => lesson.skillIds))
  for (const skill of skills) {
    assert.ok(referenced.has(skill.id), `skill "${skill.id}" is never used by any lesson`)
  }
})

test('every lesson has at least one step and all step ids are unique', () => {
  for (const [id, lesson] of lessonEntries) {
    assert.ok(lesson.steps.length > 0, `${id} has no steps`)
    const stepIds = lesson.steps.map((step) => step.id)
    assert.equal(new Set(stepIds).size, stepIds.length, `${id} has duplicate step ids`)
    for (const step of lesson.steps) {
      assert.ok(step.id.trim(), `${id} has a step with an empty id`)
      assert.ok(step.type, `${id}/${step.id} has no type`)
    }
  }
})

test('choice steps have a correctId that matches one of their (unique) options', () => {
  for (const [lessonId, lesson] of lessonEntries) {
    for (const step of lesson.steps) {
      if (step.type === 'mcq') {
        const optionIds = step.options.map((option) => option.id)
        assert.equal(new Set(optionIds).size, optionIds.length, `${lessonId}/${step.id} duplicate option ids`)
        assert.ok(optionIds.includes(step.correctId), `${lessonId}/${step.id} correctId "${step.correctId}" is not an option`)
      } else if (step.type === 'operation-choice') {
        const choiceIds = step.choices.map((choice) => choice.id)
        assert.equal(new Set(choiceIds).size, choiceIds.length, `${lessonId}/${step.id} duplicate choice ids`)
        assert.ok(choiceIds.includes(step.correctId), `${lessonId}/${step.id} correctId "${step.correctId}" is not a choice`)
      }
    }
  }
})

test('sequence steps reference real tiles, with alternative orders reordering the same solution', () => {
  // correctOrder is the solution subset -- distractor tiles are allowed in `tiles`, so it need
  // not be a full permutation. The checker compares positionally against correctOrder and every
  // acceptableOrders entry, so each alternative must reorder exactly the correctOrder tiles.
  for (const [lessonId, lesson] of lessonEntries) {
    for (const step of lesson.steps) {
      if (step.type !== 'sequence') continue
      const tileIds = step.tiles.map((tile) => tile.id)
      assert.equal(new Set(tileIds).size, tileIds.length, `${lessonId}/${step.id} duplicate tile ids`)
      const tileIdSet = new Set(tileIds)

      assert.ok(step.correctOrder.length > 0, `${lessonId}/${step.id} has an empty correctOrder`)
      assert.equal(new Set(step.correctOrder).size, step.correctOrder.length, `${lessonId}/${step.id} correctOrder repeats a tile`)
      for (const id of step.correctOrder) {
        assert.ok(tileIdSet.has(id), `${lessonId}/${step.id} correctOrder references unknown tile "${id}"`)
      }

      const sortedSolution = [...step.correctOrder].sort()
      for (const order of step.acceptableOrders ?? []) {
        assert.deepEqual([...order].sort(), sortedSolution, `${lessonId}/${step.id} an acceptableOrder must reorder exactly the correctOrder tiles`)
      }
    }
  }
})

test('dragTerms steps reference real bins and have unique tile/bin ids', () => {
  for (const [lessonId, lesson] of lessonEntries) {
    for (const step of lesson.steps) {
      if (step.type !== 'dragTerms') continue
      const binIds = new Set(step.bins.map((bin) => bin.id))
      assert.equal(binIds.size, step.bins.length, `${lessonId}/${step.id} duplicate bin ids`)
      const tileIds = step.tiles.map((tile) => tile.id)
      assert.equal(new Set(tileIds).size, tileIds.length, `${lessonId}/${step.id} duplicate tile ids`)
      for (const tile of step.tiles) {
        assert.ok(binIds.has(tile.bin), `${lessonId}/${step.id} tile "${tile.id}" points to unknown bin "${tile.bin}"`)
      }
    }
  }
})

test('input steps accept at least one non-empty answer', () => {
  for (const [lessonId, lesson] of lessonEntries) {
    for (const step of lesson.steps) {
      if (step.type !== 'input') continue
      assert.ok(step.accept.length > 0, `${lessonId}/${step.id} accepts no answers`)
      for (const answer of step.accept) {
        assert.ok(answer.trim().length > 0, `${lessonId}/${step.id} has an empty accepted answer`)
      }
    }
  }
})

test('plot/slider steps use a valid inclusive range and an in-range target', () => {
  for (const [lessonId, lesson] of lessonEntries) {
    for (const step of lesson.steps) {
      if (step.type === 'plot' || step.type === 'slider') {
        assert.ok(step.range.min < step.range.max, `${lessonId}/${step.id} needs range.min < range.max`)
      }
      if (step.type === 'plot' && step.target.kind === 'points') {
        for (const point of step.target.points) {
          assert.ok(
            point.x >= step.range.min && point.x <= step.range.max && point.y >= step.range.min && point.y <= step.range.max,
            `${lessonId}/${step.id} target point (${point.x}, ${point.y}) is outside the grid range`,
          )
        }
      }
      if (step.type === 'slider') {
        assert.ok(
          step.target.slope >= step.slope.min && step.target.slope <= step.slope.max,
          `${lessonId}/${step.id} target slope ${step.target.slope} is outside the slope control range`,
        )
        assert.ok(
          step.target.intercept >= step.intercept.min && step.target.intercept <= step.intercept.max,
          `${lessonId}/${step.id} target intercept ${step.target.intercept} is outside the intercept control range`,
        )
      }
    }
  }
})

test('lesson prerequisites are real, non-self, and earlier in lessonOrder (a valid DAG)', () => {
  const orderIndex = new Map(algebraCourse.lessonOrder.map((id, index) => [id, index]))
  for (const [id, lesson] of lessonEntries) {
    assert.equal(new Set(lesson.prerequisites).size, lesson.prerequisites.length, `${id} has duplicate prerequisites`)
    for (const prerequisite of lesson.prerequisites) {
      assert.ok(lessons[prerequisite], `${id} lists unknown prerequisite "${prerequisite}"`)
      assert.notEqual(prerequisite, id, `${id} cannot be its own prerequisite`)
      assert.ok(
        (orderIndex.get(prerequisite) ?? -1) < (orderIndex.get(id) ?? -1),
        `${id} prerequisite "${prerequisite}" must appear earlier in lessonOrder (keeps the graph acyclic)`,
      )
    }
  }
})

test('buildLessonGraph yields one node per lesson, ranked above its prerequisites', () => {
  const graph = buildLessonGraph(algebraCourse, lessons)
  assert.equal(Object.keys(graph.nodes).length, algebraCourse.lessonOrder.length)
  for (const [id, lesson] of lessonEntries) {
    const node = graph.nodes[id]
    assert.ok(node, `graph is missing a node for ${id}`)
    assert.deepEqual([...node.prerequisites].sort(), [...lesson.prerequisites].sort())
    for (const prerequisite of lesson.prerequisites) {
      assert.ok(node.rank > graph.nodes[prerequisite].rank, `${id} should rank above prerequisite "${prerequisite}"`)
    }
  }
  assert.ok(graph.stages.length > 0, 'graph should have at least one stage')
  assert.equal(graph.stages[0].connector, 'start')
})
