// Story Mode question-architecture rng helper proof (WAVE 1 foundation).
//
// The code-authoritative question-architecture bank gives architecture authors two PURE,
// deterministic rng helpers for filling randomized slots: `randInt` (an inclusive integer in
// [min, max], optionally snapped to a `step` grid) and `pick` (a uniform choice from a list).
// Both MUST be deterministic for a fixed seed so a persisted `paramSeed` rebuilds the EXACT
// same filled instance on resume, mirroring how `variantSeed` rebuilds a number variant. These
// tests prove range/step/membership and determinism across many seeds, using the same seeded
// `mulberry32` PRNG the rest of the engine uses.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mulberry32 } from '../src/engine'
import { pick, randInt } from '../src/engine/storyMode/questionBank/architectureTypes'

test('randInt returns an integer within [min, max] for many seeds', () => {
  const min = -3
  const max = 9
  for (let seed = 0; seed < 200; seed += 1) {
    const value = randInt(mulberry32(seed), min, max)
    assert.ok(Number.isInteger(value), `expected an integer, got ${value}`)
    assert.ok(value >= min && value <= max, `expected ${value} in [${min}, ${max}]`)
  }
})

test('randInt eventually covers both endpoints', () => {
  const min = 0
  const max = 4
  const seen = new Set<number>()
  for (let seed = 0; seed < 500; seed += 1) {
    seen.add(randInt(mulberry32(seed), min, max))
  }
  for (let value = min; value <= max; value += 1) {
    assert.ok(seen.has(value), `expected randInt to eventually return ${value}`)
  }
})

test('randInt is deterministic for a fixed seed', () => {
  for (const seed of [0, 1, 7, 4242, 0xbeef, 0xabcdef]) {
    const first = randInt(mulberry32(seed), 1, 1000)
    const again = randInt(mulberry32(seed), 1, 1000)
    assert.equal(first, again, `randInt @ seed ${seed} must be reproducible`)
  }
})

test('randInt respects an explicit step (only grid values, still in range)', () => {
  const min = 2
  const max = 20
  const step = 3 // grid: 2, 5, 8, 11, 14, 17, 20
  const allowed = new Set([2, 5, 8, 11, 14, 17, 20])
  const seen = new Set<number>()
  for (let seed = 0; seed < 400; seed += 1) {
    const value = randInt(mulberry32(seed), min, max, step)
    assert.ok(allowed.has(value), `value ${value} is not on the step grid`)
    assert.equal((value - min) % step, 0, `value ${value} not aligned to step ${step}`)
    assert.ok(value >= min && value <= max)
    seen.add(value)
  }
  assert.ok(seen.size > 1, 'expected more than one distinct stepped value')
})

test('randInt with a step never overshoots max on a truncated grid', () => {
  // max - min = 10 is NOT a whole multiple of step 4 (grid: 0, 4, 8), so 10/11/12 must never appear.
  const min = 0
  const max = 10
  const step = 4
  for (let seed = 0; seed < 300; seed += 1) {
    const value = randInt(mulberry32(seed), min, max, step)
    assert.ok([0, 4, 8].includes(value), `value ${value} fell off the truncated grid`)
  }
})

test('randInt collapses to min for a zero-width range', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    assert.equal(randInt(mulberry32(seed), 5, 5), 5)
    assert.equal(randInt(mulberry32(seed), 5, 5, 2), 5)
  }
})

test('pick returns an element of the array for many seeds', () => {
  const items = ['a', 'b', 'c', 'd', 'e'] as const
  for (let seed = 0; seed < 200; seed += 1) {
    const choice = pick(mulberry32(seed), items)
    assert.ok(items.includes(choice), `pick returned ${choice}, not in the list`)
  }
})

test('pick eventually returns every element', () => {
  const items = [10, 20, 30, 40]
  const seen = new Set<number>()
  for (let seed = 0; seed < 400; seed += 1) {
    seen.add(pick(mulberry32(seed), items))
  }
  assert.equal(seen.size, items.length, 'pick should be able to return every element')
})

test('pick is deterministic for a fixed seed', () => {
  const items = ['north', 'south', 'east', 'west']
  for (const seed of [0, 3, 11, 4242, 0xbeef]) {
    assert.equal(pick(mulberry32(seed), items), pick(mulberry32(seed), items))
  }
})

test('pick returns the only element of a singleton list', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    assert.equal(pick(mulberry32(seed), ['only']), 'only')
  }
})
