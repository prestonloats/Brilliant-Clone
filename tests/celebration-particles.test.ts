import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getCelebrationParticles } from '../src/course/celebrationParticles'

test('default count is 12 and explicit count is respected', () => {
  assert.equal(getCelebrationParticles(7).length, 12)
  assert.equal(getCelebrationParticles(7, 5).length, 5)
})

test('deterministic: same (seed, count) is deeply equal', () => {
  assert.deepEqual(getCelebrationParticles(42), getCelebrationParticles(42))
  assert.deepEqual(getCelebrationParticles(42, 7), getCelebrationParticles(42, 7))
})

test('seed sensitivity: different seeds differ', () => {
  assert.notDeepEqual(getCelebrationParticles(1), getCelebrationParticles(2))
})

test('every field is within bounds and id equals its index', () => {
  const particles = getCelebrationParticles(123, 30)
  assert.equal(particles.length, 30)
  particles.forEach((p, i) => {
    assert.equal(p.id, i)
    assert.ok(Number.isFinite(p.left) && p.left >= 0 && p.left <= 100, `left out of range: ${p.left}`)
    assert.ok(Number.isFinite(p.top) && p.top >= 0 && p.top <= 100, `top out of range: ${p.top}`)
    assert.ok(Number.isFinite(p.delay) && p.delay >= 0 && p.delay <= 600, `delay out of range: ${p.delay}`)
    assert.ok(Number.isFinite(p.size) && p.size >= 6 && p.size <= 14, `size out of range: ${p.size}`)
    assert.ok(Number.isFinite(p.rotate) && p.rotate >= 0 && p.rotate < 360, `rotate out of range: ${p.rotate}`)
    assert.ok(Number.isFinite(p.hue) && p.hue >= 0 && p.hue < 360, `hue out of range: ${p.hue}`)
  })
})

test('count clamping: zero and negative -> empty, fractional floored', () => {
  assert.deepEqual(getCelebrationParticles(1, 0), [])
  assert.deepEqual(getCelebrationParticles(1, -4), [])
  assert.equal(getCelebrationParticles(1, 3.9).length, 3)
})

test('robust seed: NaN does not throw and returns default-length array', () => {
  const particles = getCelebrationParticles(Number.NaN)
  assert.ok(Array.isArray(particles))
  assert.equal(particles.length, 12)
  // Non-finite seed is coerced (NaN >>> 0 === 0), so it must equal seed 0's output.
  assert.deepEqual(particles, getCelebrationParticles(0))
})
