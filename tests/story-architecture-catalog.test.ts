// Story Mode question-architecture catalog proof (WAVE 3a).
//
// The catalog is the code-authoritative "question bank" the Story Mode selector draws from, so
// these tests pin down its structural invariants:
//   - every architecture id is unique (ids double as persisted identity + anti-repeat keys);
//   - the six WAVE 2 architectures are all present;
//   - `generate(rng)` honors the declared `stepType` AND `id` for many seeds (the contract the
//     selector/rebuild rely on);
//   - every `requiredLessonId` is a real lesson and every `skillId` is a real skill (so gating and
//     mastery weighting line up with the content model); and
//   - at least one architecture is unlocked by completing `one-step-equations`, so a learner who
//     just passed the Story Mode gate always has something to practice.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lessons, skills } from '../src/domain'
import { ARCHITECTURE_CATALOG, mulberry32 } from '../src/engine'

// A spread of uint32 seeds (zero, smalls, and a large hex) so the stepType/id contract is checked
// across very different rng draws rather than a single happy path.
const SEEDS = [0, 1, 2, 7, 42, 123, 9999, 0x1234abcd]

const EXPECTED_IDS = [
  'one-step-linear',
  'one-step-sequence',
  'two-step-linear',
  'variables-both-sides',
  'coordinate-walk',
  'line-value',
]

test('every architecture id is unique', () => {
  const ids = ARCHITECTURE_CATALOG.map((architecture) => architecture.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('catalog aggregates the six WAVE 2 architectures', () => {
  const ids = new Set(ARCHITECTURE_CATALOG.map((architecture) => architecture.id))
  for (const id of EXPECTED_IDS) {
    assert.ok(ids.has(id), `catalog is missing architecture "${id}"`)
  }
  assert.equal(ARCHITECTURE_CATALOG.length, EXPECTED_IDS.length)
})

test('generate honors the declared stepType and id for sample seeds', () => {
  for (const architecture of ARCHITECTURE_CATALOG) {
    for (const seed of SEEDS) {
      const { step } = architecture.generate(mulberry32(seed))
      assert.equal(step.type, architecture.stepType, `${architecture.id} stepType mismatch at seed ${seed}`)
      assert.equal(step.id, architecture.id, `${architecture.id} step.id mismatch at seed ${seed}`)
    }
  }
})

test('every requiredLessonId exists in the lesson catalog', () => {
  for (const architecture of ARCHITECTURE_CATALOG) {
    assert.ok(
      lessons[architecture.requiredLessonId],
      `${architecture.id} requires unknown lesson "${architecture.requiredLessonId}"`,
    )
  }
})

test('every skillId is a valid SkillId', () => {
  const validSkillIds = new Set(skills.map((skill) => skill.id))
  for (const architecture of ARCHITECTURE_CATALOG) {
    assert.ok(
      validSkillIds.has(architecture.skillId),
      `${architecture.id} references unknown skill "${architecture.skillId}"`,
    )
  }
})

test('at least one architecture is unlocked by completing one-step-equations', () => {
  assert.ok(
    ARCHITECTURE_CATALOG.some((architecture) => architecture.requiredLessonId === 'one-step-equations'),
  )
})
