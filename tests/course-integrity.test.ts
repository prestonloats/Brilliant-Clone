import assert from 'node:assert/strict'
import { test } from 'node:test'

import { algebraCourse, lessons, skills } from '../src/domain'
import type {
  Lesson,
  LessonId,
  LessonStep,
  ManipulativeGoal,
  PlotPoint,
  PlotTarget,
  QuadrantId,
  SkillId,
} from '../src/domain'
import {
  checkDragTermsStep,
  checkInputStep,
  checkManipulativeStep,
  checkOperationChoiceStep,
  checkPlotStep,
  checkSequenceStep,
  checkSliderStep,
  isAssessedLessonStep,
} from '../src/engine'

// Course-wide integrity checks. The per-lesson test files pin specific authored steps;
// these tests lock cross-cutting invariants over the WHOLE catalog so an authoring slip in
// any lesson (a typo'd id, a broken prerequisite, an unsatisfiable "correct" answer) fails
// CI instead of only surfacing in manual QA.

const orderedLessonIds = algebraCourse.lessonOrder
const lessonList: Lesson[] = orderedLessonIds.map((lessonId) => lessons[lessonId])
const skillIds = new Set<SkillId>(skills.map((skill) => skill.id))

// Generic cycle detector over a prerequisite adjacency function, shared by the lesson and
// skill dependency graphs. A DFS that re-enters a node still on the stack means a cycle.
const assertAcyclic = (
  nodeIds: string[],
  prerequisitesOf: (id: string) => string[],
  label: string,
) => {
  const visiting = new Set<string>()
  const done = new Set<string>()

  const visit = (id: string, trail: string[]) => {
    if (done.has(id)) return
    assert.ok(!visiting.has(id), `${label} has a cycle: ${[...trail, id].join(' -> ')}`)
    visiting.add(id)
    prerequisitesOf(id).forEach((next) => visit(next, [...trail, id]))
    visiting.delete(id)
    done.add(id)
  }

  nodeIds.forEach((id) => visit(id, []))
}

// --- Catalog & dependency-graph invariants --------------------------------------------

test('every lesson in the course order exists, matches its key, and is fully authored', () => {
  orderedLessonIds.forEach((lessonId) => {
    const lesson = lessons[lessonId]
    assert.ok(lesson, `lessonOrder references missing lesson "${lessonId}"`)
    assert.equal(lesson.id, lessonId, `catalog key "${lessonId}" must match lesson.id "${lesson.id}"`)
    // No "shells": a lesson with no steps would silently drop out of the playable path
    // (isLessonUnlocked / getPathLessonIds both require steps.length > 0).
    assert.ok(lesson.steps.length > 0, `lesson "${lessonId}" has no steps (a shell)`)
    assert.ok(lesson.steps.some(isAssessedLessonStep), `lesson "${lessonId}" has no assessed steps`)
  })
})

test('the course node list and lessonOrder describe exactly the same lessons', () => {
  const nodeIds = algebraCourse.lessons.map((node) => node.id).sort()
  const orderIds = [...orderedLessonIds].sort()
  const catalogIds = (Object.keys(lessons) as LessonId[]).sort()

  assert.deepEqual(nodeIds, orderIds, 'course.lessons nodes must match lessonOrder')
  assert.deepEqual(catalogIds, orderIds, 'lesson catalog must match lessonOrder')
})

test('step ids are unique within every lesson', () => {
  lessonList.forEach((lesson) => {
    const ids = lesson.steps.map((step) => step.id)
    assert.equal(new Set(ids).size, ids.length, `lesson "${lesson.id}" has duplicate step ids`)
  })
})

test('lesson prerequisites and nextLessonId reference real lessons', () => {
  lessonList.forEach((lesson) => {
    lesson.prerequisites.forEach((prerequisiteId) => {
      assert.ok(lessons[prerequisiteId], `lesson "${lesson.id}" lists unknown prerequisite "${prerequisiteId}"`)
    })
    if (lesson.nextLessonId) {
      assert.ok(lessons[lesson.nextLessonId], `lesson "${lesson.id}" points nextLessonId at unknown "${lesson.nextLessonId}"`)
    }
  })
})

test('the lesson prerequisite graph is acyclic and lessonOrder is a valid topological order', () => {
  assertAcyclic(orderedLessonIds, (id) => lessons[id as LessonId].prerequisites, 'lesson prerequisite graph')

  const seen = new Set<LessonId>()
  orderedLessonIds.forEach((lessonId) => {
    lessons[lessonId].prerequisites.forEach((prerequisiteId) => {
      assert.ok(
        seen.has(prerequisiteId),
        `lessonOrder lists "${lessonId}" before its prerequisite "${prerequisiteId}"`,
      )
    })
    seen.add(lessonId)
  })
})

test('every skill a lesson exercises exists, and the skill graph is acyclic', () => {
  lessonList.forEach((lesson) => {
    assert.ok(lesson.skillIds.length > 0, `lesson "${lesson.id}" exercises no skills`)
    lesson.skillIds.forEach((skillId) => {
      assert.ok(skillIds.has(skillId), `lesson "${lesson.id}" references unknown skill "${skillId}"`)
    })
  })

  skills.forEach((skill) => {
    skill.prerequisites.forEach((prerequisiteId) => {
      assert.ok(skillIds.has(prerequisiteId), `skill "${skill.id}" lists unknown prerequisite "${prerequisiteId}"`)
    })
  })

  assertAcyclic(
    skills.map((skill) => skill.id),
    (id) => skills.find((skill) => skill.id === id)?.prerequisites ?? [],
    'skill prerequisite graph',
  )
})

// --- Authored "correct answer" round-trips --------------------------------------------
//
// For every assessed step that has a pure engine checker, derive the canonical correct
// answer straight from the authored data and feed it back through the checker. This proves
// each authored answer is actually satisfiable and wired to the "correct" feedback, so an
// unreachable answer key can never ship.

const canonicalManipulativeCounts = (goal: ManipulativeGoal): number[] => {
  if (goal.type === 'equal-groups' || goal.type === 'build-product') {
    return Array.from({ length: goal.groups }, () => goal.perGroup)
  }
  return [goal.count]
}

// A representative interior point for a quadrant, matching the engine's own sign mapping
// (I:(+,+), II:(-,+), III:(-,-), IV:(+,-)).
const representativePoint = (quadrant: QuadrantId): PlotPoint => ({
  x: quadrant === 1 || quadrant === 4 ? 1 : -1,
  y: quadrant === 1 || quadrant === 2 ? 1 : -1,
})

const canonicalPlotPoints = (target: PlotTarget): PlotPoint[] =>
  target.kind === 'points'
    ? target.points.map((point) => ({ ...point }))
    : target.quadrants.map(representativePoint)

const expectCanonicalAnswerAccepted = (lesson: Lesson, step: LessonStep) => {
  const where = `${lesson.id} / ${step.id}`

  switch (step.type) {
    case 'concept':
      return

    case 'input': {
      assert.ok(step.accept.length > 0, `${where}: input step lists no accepted answers`)
      step.accept.forEach((value) => {
        const result = checkInputStep(step, value)
        assert.equal(result.correct, true, `${where}: accepted answer "${value}" should validate`)
        assert.equal(result.feedback, step.feedback.correct, `${where}: "${value}" should return the correct feedback`)
      })
      return
    }

    case 'mcq': {
      // MCQ has no engine checker (it is checked in the view), so verify structurally that a
      // single authored correct option exists.
      const correct = step.options.find((option) => option.id === step.correctId)
      assert.ok(correct, `${where}: mcq correctId "${step.correctId}" matches no option`)
      return
    }

    case 'operation-choice': {
      const correct = step.choices.find((choice) => choice.id === step.correctId)
      assert.ok(correct, `${where}: operation-choice correctId "${step.correctId}" matches no choice`)
      assert.equal(
        checkOperationChoiceStep(step, step.correctId).correct,
        true,
        `${where}: the correct choice should validate`,
      )
      return
    }

    case 'sequence': {
      assert.ok(step.correctOrder.length > 0, `${where}: sequence has an empty correctOrder`)
      const tileIds = new Set(step.tiles.map((tile) => tile.id))
      step.correctOrder.forEach((id) => assert.ok(tileIds.has(id), `${where}: correctOrder id "${id}" is not a tile`))
      const result = checkSequenceStep(step, step.correctOrder)
      assert.equal(result.correct, true, `${where}: the correct order should validate`)
      assert.equal(result.feedback, step.feedback.correct)
      return
    }

    case 'dragTerms': {
      assert.ok(step.tiles.length > 0, `${where}: dragTerms has no tiles`)
      const binIds = new Set(step.bins.map((bin) => bin.id))
      step.tiles.forEach((tile) => assert.ok(binIds.has(tile.bin), `${where}: tile "${tile.id}" targets unknown bin "${tile.bin}"`))
      const placements: Record<string, string> = {}
      step.tiles.forEach((tile) => {
        placements[tile.id] = tile.bin
      })
      assert.equal(
        checkDragTermsStep(step, placements).correct,
        true,
        `${where}: every tile in its authored bin should validate`,
      )
      return
    }

    case 'manipulative': {
      assert.equal(
        checkManipulativeStep(step, canonicalManipulativeCounts(step.goal)).correct,
        true,
        `${where}: the canonical grouping should validate`,
      )
      return
    }

    case 'plot': {
      const points = canonicalPlotPoints(step.target)
      points.forEach((point) => {
        assert.ok(
          point.x >= step.range.min && point.x <= step.range.max && point.y >= step.range.min && point.y <= step.range.max,
          `${where}: canonical point (${point.x}, ${point.y}) is outside the grid range`,
        )
      })
      assert.equal(checkPlotStep(step, points).correct, true, `${where}: the canonical points should validate`)
      return
    }

    case 'slider': {
      assert.ok(
        step.target.slope >= step.slope.min && step.target.slope <= step.slope.max,
        `${where}: target slope ${step.target.slope} is outside the slope control range`,
      )
      assert.ok(
        step.target.intercept >= step.intercept.min && step.target.intercept <= step.intercept.max,
        `${where}: target intercept ${step.target.intercept} is outside the intercept control range`,
      )
      assert.equal(checkSliderStep(step, step.target).correct, true, `${where}: the target slope/intercept should validate`)
      return
    }

    case 'balance': {
      // Solving a balance step depends on bespoke operation/drag sequences (covered by the
      // per-lesson tests), so here we only assert the goal references real items and the
      // step carries the hint/reveal scaffolding the checker relies on.
      const itemIds = new Set(
        [...step.state.left, ...step.state.right, ...(step.state.bank ?? [])].map((item) => item.id),
      )
      if (step.goal.type === 'level') {
        const required = [
          ...(step.goal.requireItemOnSide ? [step.goal.requireItemOnSide] : []),
          ...(step.goal.requireItemsOnSide ?? []),
        ]
        required.forEach((placement) => {
          assert.ok(itemIds.has(placement.itemId), `${where}: required item "${placement.itemId}" is not on the scale`)
        })
      } else {
        assert.ok(itemIds.has(step.goal.unknownId), `${where}: isolate unknownId "${step.goal.unknownId}" is not on the scale`)
      }
      assert.ok(step.feedback.hints.length > 0, `${where}: balance step has no hints`)
      assert.ok(step.feedback.reveal, `${where}: balance step has no reveal`)
      return
    }

    default: {
      const exhaustive: never = step
      assert.fail(`${where}: unhandled step type ${(exhaustive as LessonStep).type}`)
    }
  }
}

test('every authored correct answer passes its engine checker', () => {
  lessonList.forEach((lesson) => {
    lesson.steps.forEach((step) => expectCanonicalAnswerAccepted(lesson, step))
  })
})
