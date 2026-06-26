import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mulberry32 } from '../src/engine'
import { uncommonScenes } from '../src/story/sceneCategories'
import { selectUncommonScene } from '../src/story/selectUncommonScene'

// Rule 4: with NO chosen interests we seed the story from a random "uncommon" (zero-interest)
// background, and the chosen image's SETTING becomes the premise — so every pick must come from
// `uncommonScenes()` and always report `settingTieIn: true`.

const POOL = uncommonScenes()
const POOL_SET = new Set(POOL)

test('the uncommon pool is the 67 zero-interest scenes (foundation sanity)', () => {
  assert.equal(POOL.length, 67)
  assert.equal(POOL_SET.size, POOL.length, 'uncommonScenes() must be duplicate-free')
})

test('always returns a scene from the uncommon pool with settingTieIn === true (seeded)', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const { sceneId, settingTieIn } = selectUncommonScene({ rng: mulberry32(seed) })
    assert.equal(settingTieIn, true)
    assert.ok(sceneId !== null && POOL_SET.has(sceneId), `seed ${seed} picked ${sceneId} outside uncommonScenes()`)
  }
})

test('settingTieIn is always true even on the default (Math.random) path', () => {
  for (let i = 0; i < 50; i += 1) {
    const { sceneId, settingTieIn } = selectUncommonScene()
    assert.equal(settingTieIn, true)
    assert.ok(sceneId !== null && POOL_SET.has(sceneId), `default rng picked ${sceneId} outside uncommonScenes()`)
  }
})

test('is deterministic: the same seed reproduces the same pick', () => {
  for (let seed = 0; seed < 64; seed += 1) {
    const a = selectUncommonScene({ rng: mulberry32(seed) })
    const b = selectUncommonScene({ rng: mulberry32(seed) })
    assert.deepEqual(a, b, `seed ${seed} was not reproducible`)
  }
})

test('spreads across the pool: many seeds yield more than one distinct scene', () => {
  const seen = new Set<string>()
  for (let seed = 0; seed < 200; seed += 1) {
    const { sceneId } = selectUncommonScene({ rng: mulberry32(seed) })
    if (sceneId) seen.add(sceneId)
  }
  assert.ok(seen.size > 1, `expected variety across seeds, only saw ${seen.size} distinct scene(s)`)
})

test('respects avoidSceneId: never returns the avoided scene when alternatives exist', () => {
  for (const avoid of [POOL[0], POOL[Math.floor(POOL.length / 2)], POOL[POOL.length - 1]]) {
    for (let seed = 0; seed < 200; seed += 1) {
      const { sceneId } = selectUncommonScene({ rng: mulberry32(seed), avoidSceneId: avoid })
      assert.notEqual(sceneId, avoid, `seed ${seed} failed to avoid ${avoid}`)
      assert.ok(sceneId !== null && POOL_SET.has(sceneId), `seed ${seed} picked ${sceneId} outside uncommonScenes()`)
    }
  }
})

test('an avoidSceneId outside the uncommon pool is harmless (still returns a pool scene)', () => {
  // 'space-station' maps to the 'space' interest, so it is NOT an uncommon scene; avoiding it must
  // simply have no effect on the (full) candidate pool.
  for (let seed = 0; seed < 100; seed += 1) {
    const { sceneId, settingTieIn } = selectUncommonScene({ rng: mulberry32(seed), avoidSceneId: 'space-station' })
    assert.equal(settingTieIn, true)
    assert.ok(sceneId !== null && POOL_SET.has(sceneId), `seed ${seed} picked ${sceneId} outside uncommonScenes()`)
  }
})
