import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryTheme } from '../src/content/storyTypes'
import { uncommonScenes } from '../src/story/sceneCategories'
import { SCENE_IDS } from '../src/story/scenery'
import { selectCustomOnlyScene } from '../src/story/selectCustomOnlyScene'
import type { SceneMatchRequest } from '../src/story/storyAi'

// A minimal "custom-only" theme: the learner typed freeform text and chose NO suggested presets.
const customTheme = (freeformInterest = 'volcanoes and lava'): StoryTheme => ({
  interestIds: [],
  freeformInterest,
  premise: '',
  protagonist: '',
})

// A tiny seeded PRNG (mirrors the engine's mulberry32) so the random uncommon pick is deterministic
// in tests without importing the engine module — keeps this suite hermetic + parallel-safe.
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UNCOMMON = uncommonScenes()
const isUncommon = (id: SceneId | null): boolean => id !== null && UNCOMMON.includes(id)

// --- (a) matcher finds a close match → returned as-is, with NO setting tie-in -----------------

test('a close match from the matcher is returned as-is (no setting tie-in)', async () => {
  const calls: SceneMatchRequest[] = []
  const theme = customTheme()
  const result = await selectCustomOnlyScene(theme, {
    matcher: async (req) => {
      calls.push(req)
      return 'pirate-cove'
    },
  })

  assert.equal(result.sceneId, 'pirate-cove')
  assert.equal(result.settingTieIn, undefined, 'a close match must not flag a setting tie-in')

  // The matcher saw the WHOLE catalog, emphasizing the custom topics, for this exact theme.
  assert.equal(calls.length, 1, 'matcher should be called exactly once')
  const req = calls[0]
  assert.equal(req.emphasizeCustom, true)
  assert.equal(req.theme, theme)
  assert.deepEqual([...req.candidates], [...SCENE_IDS], 'candidates must be the whole catalog')
})

// --- (b) matcher says "no close one" (null) → random uncommon scene + setting tie-in ----------

test('no close match (matcher returns null) falls back to an uncommon scene with a setting tie-in', async () => {
  const result = await selectCustomOnlyScene(customTheme(), {
    matcher: async () => null,
    rng: () => 0,
  })

  assert.equal(result.settingTieIn, true)
  assert.ok(isUncommon(result.sceneId), `${result.sceneId} should be an uncommon scene`)
  assert.equal(result.sceneId, UNCOMMON[0], 'rng() => 0 selects the first uncommon scene')
})

// --- (c) no matcher injected → same uncommon + tie-in path ------------------------------------

test('no matcher provided also grounds the story in a random uncommon scene (setting tie-in)', async () => {
  const result = await selectCustomOnlyScene(customTheme(), { rng: () => 0 })

  assert.equal(result.settingTieIn, true)
  assert.ok(isUncommon(result.sceneId), `${result.sceneId} should be an uncommon scene`)
  assert.equal(result.sceneId, UNCOMMON[0])
})

// --- Deterministic seeded rng ----------------------------------------------------------------

test('the uncommon fallback is deterministic for a seeded rng and always a catalog uncommon scene', async () => {
  for (const seed of [1, 7, 42, 1234, 99999]) {
    const a = await selectCustomOnlyScene(customTheme(), { rng: mulberry32(seed) })
    const b = await selectCustomOnlyScene(customTheme(), { rng: mulberry32(seed) })
    assert.equal(a.sceneId, b.sceneId, `seed ${seed} must be deterministic`)
    assert.equal(a.settingTieIn, true)
    assert.ok(isUncommon(a.sceneId), `seed ${seed} produced ${a.sceneId}, not an uncommon scene`)
  }
})

test('rng at the top of its range selects the last uncommon scene (index stays in range)', async () => {
  const result = await selectCustomOnlyScene(customTheme(), { rng: () => 0.999999 })
  assert.equal(result.sceneId, UNCOMMON[UNCOMMON.length - 1])
})

// --- Respects avoidSceneId -------------------------------------------------------------------

test('avoidSceneId is excluded from the uncommon fallback when alternatives exist', async () => {
  const avoid = UNCOMMON[0]
  // rng() => 0 would normally pick index 0; with the avoided scene removed the pool starts one over.
  const result = await selectCustomOnlyScene(customTheme(), { rng: () => 0, avoidSceneId: avoid })

  assert.notEqual(result.sceneId, avoid, 'must not return the avoided scene')
  assert.equal(result.sceneId, UNCOMMON[1], 'should pick the next uncommon scene after excluding the avoided one')
  assert.equal(result.settingTieIn, true)
})

test('avoidSceneId never reappears across many seeds (and the pick stays uncommon)', async () => {
  const avoid = UNCOMMON[3]
  for (const seed of [0, 1, 2, 3, 5, 8, 13, 21, 100, 7777]) {
    const result = await selectCustomOnlyScene(customTheme(), { rng: mulberry32(seed), avoidSceneId: avoid })
    assert.notEqual(result.sceneId, avoid)
    assert.ok(isUncommon(result.sceneId), `seed ${seed} produced ${result.sceneId}, not an uncommon scene`)
  }
})

// --- Robustness: never throws ----------------------------------------------------------------

test('a throwing/rejecting matcher is treated as no close match (never throws)', async () => {
  const result = await selectCustomOnlyScene(customTheme(), {
    matcher: async () => {
      throw new Error('network down')
    },
    rng: () => 0,
  })

  assert.equal(result.settingTieIn, true)
  assert.equal(result.sceneId, UNCOMMON[0])
  assert.ok(isUncommon(result.sceneId))
})
