import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryInterestId } from '../src/domain'
import { mulberry32 } from '../src/engine'
import { singlesFor } from '../src/story/sceneCategories'
import { selectSingleScene } from '../src/story/selectSingleScene'

// The 8 suggested interests (mirrors StoryInterestId / INTEREST_CATALOG).
const INTERESTS: StoryInterestId[] = ['space', 'fantasy', 'mystery', 'sports', 'animals', 'pirates', 'cooking', 'fashion']

// --- Rule 1: the pick always lands in the interest's pure single-topic pool --------------------

test('selectSingleScene always returns a pure single-topic scene of that interest (every interest)', () => {
  for (const interest of INTERESTS) {
    const pool = new Set<SceneId>(singlesFor(interest))
    assert.ok(pool.size > 0, `precondition: ${interest} should have pure single-topic scenes`)
    for (let seed = 0; seed < 200; seed += 1) {
      const { sceneId } = selectSingleScene(interest, { rng: mulberry32(seed) })
      assert.ok(sceneId && pool.has(sceneId), `seed ${seed}: ${sceneId} escaped singlesFor(${interest})`)
    }
  }
})

// --- Deterministic for a fixed seed (mirrors the persisted variant-seed rule) ------------------

test('selectSingleScene is deterministic for a fixed seed', () => {
  for (const interest of INTERESTS) {
    for (const seed of [0, 1, 7, 42, 4242]) {
      const a = selectSingleScene(interest, { rng: mulberry32(seed) })
      const b = selectSingleScene(interest, { rng: mulberry32(seed) })
      assert.deepEqual(a, b, `${interest}@${seed} must be reproducible for a fixed seed`)
    }
  }
})

// --- Distribution: a single interest spreads across MANY scenes over many seeds ----------------

test('selectSingleScene spreads a single interest across more than one scene (seeded rng)', () => {
  for (const interest of INTERESTS) {
    const poolSize = singlesFor(interest).length
    const seen = new Set<SceneId>()
    for (let seed = 0; seed < 200; seed += 1) {
      const { sceneId } = selectSingleScene(interest, { rng: mulberry32(seed) })
      if (sceneId) seen.add(sceneId)
    }
    // With alternatives available the pick must not collapse to a single fixed image.
    const expected = Math.min(2, poolSize)
    assert.ok(seen.size >= expected, `${interest}: expected variety, only saw ${seen.size} of ${poolSize}`)
  }
})

// --- Anti-repeat: avoidSceneId is excluded whenever the pool has an alternative ----------------

test('selectSingleScene never returns avoidSceneId when the pool has alternatives', () => {
  for (const interest of INTERESTS) {
    const pool = singlesFor(interest)
    if (pool.length < 2) continue
    const avoidSceneId = pool[0]
    for (let seed = 0; seed < 300; seed += 1) {
      const { sceneId } = selectSingleScene(interest, { rng: mulberry32(seed), avoidSceneId })
      assert.notEqual(sceneId, avoidSceneId, `seed ${seed}: ${interest} returned the avoided ${avoidSceneId}`)
      assert.ok(sceneId && pool.includes(sceneId), `seed ${seed}: ${sceneId} escaped singlesFor(${interest})`)
    }
  }
})

// --- An avoidSceneId outside the pool is simply ignored (filter is a safe no-op) ---------------

test('selectSingleScene ignores an avoidSceneId that is not in the interest pool', () => {
  for (const interest of INTERESTS) {
    const pool = new Set<SceneId>(singlesFor(interest))
    // A scene from a DIFFERENT interest, guaranteed absent from this interest's single pool.
    const foreign = INTERESTS.filter((other) => other !== interest)
      .flatMap((other) => singlesFor(other))
      .find((id) => !pool.has(id))
    assert.ok(foreign, `precondition: a foreign scene id should exist for ${interest}`)
    for (let seed = 0; seed < 50; seed += 1) {
      const { sceneId } = selectSingleScene(interest, { rng: mulberry32(seed), avoidSceneId: foreign })
      assert.ok(sceneId && pool.has(sceneId), `seed ${seed}: ${sceneId} escaped singlesFor(${interest})`)
    }
  }
})

// --- Never throws and works with the default (Math.random) rng --------------------------------

test('selectSingleScene never throws and works without an injected rng', () => {
  for (const interest of INTERESTS) {
    const pool = new Set<SceneId>(singlesFor(interest))
    for (let i = 0; i < 50; i += 1) {
      const { sceneId } = selectSingleScene(interest)
      assert.ok(sceneId && pool.has(sceneId), `${interest}: ${sceneId} escaped singlesFor(${interest})`)
    }
  }
})
