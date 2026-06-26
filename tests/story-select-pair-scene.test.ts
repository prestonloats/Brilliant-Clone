import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryInterestId } from '../src/domain'
import { mulberry32 } from '../src/engine'
import { interestsForScene, pairScenes, singlesFor } from '../src/story/sceneCategories'
import { isSceneId } from '../src/story/scenery'
import {
  memberSingles,
  pairSceneCandidates,
  pickFromPool,
  selectPairScene,
} from '../src/story/selectPairScene'

// The 8 suggested interests (mirrors StoryInterestId / INTEREST_CATALOG).
const INTERESTS: StoryInterestId[] = ['space', 'fantasy', 'mystery', 'sports', 'animals', 'pirates', 'cooking', 'fashion']

// Every unordered interest pair (C(8,2) = 28).
const ALL_PAIRS: Array<[StoryInterestId, StoryInterestId]> = []
for (let i = 0; i < INTERESTS.length; i += 1) {
  for (let j = i + 1; j < INTERESTS.length; j += 1) ALL_PAIRS.push([INTERESTS[i], INTERESTS[j]])
}

// A few representative seeds reused across the deterministic tests.
const SEEDS = [0, 1, 7, 42, 123, 4242]

// Order-insensitive set equality on interest id lists.
const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((x) => sb.has(x))
}

// Catalog assumptions the avoid-tests rely on: at least one pair with multiple exact-{a,b} scenes
// (alternatives exist) and at least one with a single scene (no alternative). Found dynamically so a
// future catalog tweak can't silently invalidate the tests — they fail loudly here instead.
const MULTI_SCENE_PAIR = ALL_PAIRS.find(([a, b]) => pairScenes(a, b).length >= 2)
const SINGLE_SCENE_PAIR = ALL_PAIRS.find(([a, b]) => pairScenes(a, b).length === 1)

// --- Primary path: every pair resolves to an exact-{a,b} scene -------------------------------

test('selectPairScene resolves every interest pair to a scene whose interest set is exactly {a, b}', () => {
  for (const [a, b] of ALL_PAIRS) {
    const pool = pairScenes(a, b)
    for (const seed of SEEDS) {
      const result = selectPairScene(a, b, { rng: mulberry32(seed) })
      assert.notEqual(result.sceneId, null, `null scene for {${a}, ${b}} @ seed ${seed}`)
      const sceneId = result.sceneId as SceneId
      assert.ok(isSceneId(sceneId), `${sceneId} is not a catalog id for {${a}, ${b}}`)
      assert.ok(pool.includes(sceneId), `${sceneId} is not in pairScenes(${a}, ${b})`)
      assert.ok(sameSet(interestsForScene(sceneId), [a, b]), `${sceneId} is not exactly {${a}, ${b}}`)
      // Rule 2 only ever populates `sceneId`; it never marks a looser setting tie-in.
      assert.equal(result.settingTieIn, undefined, 'rule 2 should not set settingTieIn')
    }
  }
})

// --- Determinism + order-insensitivity -------------------------------------------------------

test('selectPairScene is deterministic for a fixed seed and order-insensitive in its pair args', () => {
  for (const [a, b] of ALL_PAIRS) {
    for (const seed of SEEDS) {
      const first = selectPairScene(a, b, { rng: mulberry32(seed) })
      const again = selectPairScene(a, b, { rng: mulberry32(seed) })
      assert.deepEqual(again, first, `non-deterministic for {${a}, ${b}} @ seed ${seed}`)
      const swapped = selectPairScene(b, a, { rng: mulberry32(seed) })
      assert.deepEqual(swapped, first, `order-sensitive for {${a}, ${b}} @ seed ${seed}`)
    }
  }
})

// --- Distribution: a multi-scene pair spreads across its pool ---------------------------------

test('selectPairScene spreads picks across a pair that has several scenes (seeded)', () => {
  assert.ok(MULTI_SCENE_PAIR, 'expected at least one interest pair with 2+ exact-set scenes')
  const [a, b] = MULTI_SCENE_PAIR
  const seen = new Set<SceneId>()
  for (let seed = 0; seed < 200; seed += 1) {
    const { sceneId } = selectPairScene(a, b, { rng: mulberry32(seed) })
    assert.ok(sceneId && pairScenes(a, b).includes(sceneId))
    if (sceneId) seen.add(sceneId)
  }
  assert.ok(seen.size > 1, `expected variety for {${a}, ${b}}, only saw ${seen.size} distinct scene(s)`)
})

// --- avoidSceneId behavior -------------------------------------------------------------------

test('selectPairScene avoids avoidSceneId when the pool has alternatives', () => {
  assert.ok(MULTI_SCENE_PAIR, 'expected at least one interest pair with 2+ exact-set scenes')
  const [a, b] = MULTI_SCENE_PAIR
  const avoid = pairScenes(a, b)[0]
  for (let seed = 0; seed < 200; seed += 1) {
    const { sceneId } = selectPairScene(a, b, { rng: mulberry32(seed), avoidSceneId: avoid })
    assert.notEqual(sceneId, avoid, `did not avoid ${avoid} for {${a}, ${b}} @ seed ${seed}`)
    assert.ok(sceneId && pairScenes(a, b).includes(sceneId), 'pick must still come from the pair pool')
  }
})

test('selectPairScene keeps the only scene even when it equals avoidSceneId', () => {
  assert.ok(SINGLE_SCENE_PAIR, 'expected at least one interest pair with exactly one scene')
  const [a, b] = SINGLE_SCENE_PAIR
  const only = pairScenes(a, b)[0]
  for (const seed of SEEDS) {
    const { sceneId } = selectPairScene(a, b, { rng: mulberry32(seed), avoidSceneId: only })
    assert.equal(sceneId, only, `a one-scene pair must keep its scene for {${a}, ${b}} @ seed ${seed}`)
  }
})

// --- pairSceneCandidates: the primary pool is used whenever it exists -------------------------

test('pairSceneCandidates returns the exact-{a,b} primary pool for every real pair', () => {
  for (const [a, b] of ALL_PAIRS) {
    const candidates = pairSceneCandidates(a, b)
    assert.ok(candidates.length > 0, `empty candidate pool for {${a}, ${b}}`)
    assert.deepEqual(candidates, pairScenes(a, b), `candidates for {${a}, ${b}} should equal pairScenes`)
  }
})

// --- memberSingles: the (defensive) missing-combo fallback pool -------------------------------

test('memberSingles is the deduped union of each interest\'s single-topic scenes', () => {
  for (const [a, b] of [['fantasy', 'cooking'], ['space', 'pirates']] as Array<[StoryInterestId, StoryInterestId]>) {
    const ms = memberSingles(a, b)
    assert.ok(ms.length > 0, `member-singles fallback empty for {${a}, ${b}}`)
    assert.equal(new Set(ms).size, ms.length, `member-singles has duplicates for {${a}, ${b}}`)
    const expected = [...new Set([...singlesFor(a), ...singlesFor(b)])]
    assert.deepEqual(ms, expected, `member-singles for {${a}, ${b}} should be the deduped a∪b union`)
    const union = new Set<SceneId>([...singlesFor(a), ...singlesFor(b)])
    for (const id of ms) assert.ok(union.has(id), `${id} not a single of ${a} or ${b}`)
    assert.ok(singlesFor(a).some((id) => ms.includes(id)), `missing ${a}'s singles`)
    assert.ok(singlesFor(b).some((id) => ms.includes(id)), `missing ${b}'s singles`)
  }
})

// Simulates the cascade selectPairScene runs when a pair's primary pool is empty: pick from the
// member-singles fallback. (Every real pair has a tile today, so this path is exercised here.)
test('pickFromPool over memberSingles yields a member single (missing-combo fallback simulation)', () => {
  const [a, b]: [StoryInterestId, StoryInterestId] = ['cooking', 'fashion']
  const ms = memberSingles(a, b)
  const union = new Set<SceneId>([...singlesFor(a), ...singlesFor(b)])
  for (const seed of SEEDS) {
    const picked = pickFromPool(ms, mulberry32(seed))
    assert.notEqual(picked, null)
    assert.ok(picked && union.has(picked), `${picked} escaped the member-singles fallback`)
  }
})

// --- pickFromPool: the reusable selection core -----------------------------------------------

test('pickFromPool returns null for an empty pool', () => {
  assert.equal(pickFromPool([], mulberry32(0)), null)
  assert.equal(pickFromPool([], () => 0.5, 'outer-space'), null)
})

test('pickFromPool clamps the rng draw into bounds (first, last, and the rng=1 edge)', () => {
  const pool: SceneId[] = ['outer-space', 'enchanted-forest', 'cozy-kitchen']
  assert.equal(pickFromPool(pool, () => 0), 'outer-space', 'rng 0 should pick the first')
  assert.equal(pickFromPool(pool, () => 0.9999), 'cozy-kitchen', 'rng ~1 should pick the last')
  assert.equal(pickFromPool(pool, () => 1), 'cozy-kitchen', 'rng exactly 1 must stay in bounds (last)')
})

test('pickFromPool excludes avoid when alternatives remain but keeps it as the sole option', () => {
  const pool: SceneId[] = ['outer-space', 'enchanted-forest', 'cozy-kitchen']
  // With alternatives, the avoided id is never returned, whatever the draw.
  for (let seed = 0; seed < 100; seed += 1) {
    const picked = pickFromPool(pool, mulberry32(seed), 'outer-space')
    assert.notEqual(picked, 'outer-space')
    assert.ok(picked && pool.includes(picked))
  }
  // Avoiding the FIRST id shifts a draw of 0 onto the next remaining option.
  assert.equal(pickFromPool(pool, () => 0, 'outer-space'), 'enchanted-forest')
  // A single-element pool returns its element even when that element is the one to avoid.
  assert.equal(pickFromPool(['cozy-kitchen'], () => 0, 'cozy-kitchen'), 'cozy-kitchen')
})
