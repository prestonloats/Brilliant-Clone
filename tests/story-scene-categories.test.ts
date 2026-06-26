import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StoryInterestId } from '../src/domain'
import { SCENE_IDS } from '../src/story/scenery'
import {
  SCENE_PRIMARY_INTERESTS,
  interestsForScene,
  pairScenes,
  scenesForExactInterests,
  singlesFor,
  tripleScenes,
  uncommonScenes,
} from '../src/story/sceneCategories'

// The 8 suggested interests (mirrors StoryInterestId / INTEREST_CATALOG).
const INTERESTS: StoryInterestId[] = ['space', 'fantasy', 'mystery', 'sports', 'animals', 'pirates', 'cooking', 'fashion']
const INTEREST_SET = new Set<string>(INTERESTS)

// Order-insensitive set equality on interest id lists.
const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((x) => sb.has(x))
}

// A scene id is a "combo" when ALL of its '-'-split tokens are interest ids. An optional trailing
// "-<n>" variant suffix (e.g. `cooking-fashion-2`) is ignored so duplicate blend images count as the
// same combo their base id names.
const isComboId = (id: string): boolean => {
  const tokens = id.replace(/-\d+$/, '').split('-')
  return tokens.length >= 2 && tokens.every((t) => INTEREST_SET.has(t))
}

const inTable = (id: string): boolean => Object.prototype.hasOwnProperty.call(SCENE_PRIMARY_INTERESTS, id)

// --- Partition: every scene lands in exactly one bucket ---------------------------------------

test('every scene is categorized exactly once: combos + table + uncommon partition the catalog', () => {
  let combos = 0
  let tabled = 0
  let uncommon = 0
  for (const id of SCENE_IDS) {
    const ints = interestsForScene(id)
    if (isComboId(id)) {
      assert.equal(inTable(id), false, `${id} is a combo and must not also be in the explicit table`)
      assert.ok(ints.length >= 2, `${id} combo should resolve to >= 2 interests`)
      combos += 1
    } else if (inTable(id)) {
      assert.ok(ints.length >= 1, `${id} table entry must be non-empty`)
      tabled += 1
    } else {
      assert.equal(ints.length, 0, `${id} is uncommon and must have an empty interest set`)
      uncommon += 1
    }
  }
  assert.equal(combos + tabled + uncommon, SCENE_IDS.length, 'buckets must cover the whole catalog')
  assert.equal(combos, 195, 'expected 84 base blend tiles (28 pairs + 56 triples) + 111 variant tiles')
  assert.equal(tabled, 162, 'expected 131 single-topic + 31 hand-assigned multi-interest scenes')
  assert.equal(uncommon, 67)
})

// --- interestsForScene basic shape ------------------------------------------------------------

test('interestsForScene returns a duplicate-free subset of the 8 valid interest ids', () => {
  for (const id of SCENE_IDS) {
    const ints = interestsForScene(id)
    assert.equal(new Set(ints).size, ints.length, `${id} returned duplicate interests`)
    for (const i of ints) assert.ok(INTEREST_SET.has(i), `${id} returned invalid interest "${i}"`)
  }
})

test('combo scenes derive their interest set from the id tokens (all tokens valid)', () => {
  assert.ok(sameSet(interestsForScene('fantasy-cooking'), ['fantasy', 'cooking']))
  assert.ok(sameSet(interestsForScene('cooking-fashion'), ['cooking', 'fashion']))
  assert.ok(sameSet(interestsForScene('fantasy-cooking-fashion'), ['fantasy', 'cooking', 'fashion']))
  assert.ok(sameSet(interestsForScene('space-sports-pirates'), ['space', 'sports', 'pirates']))
})

// --- Pairs: all 28 interest pairs reachable ---------------------------------------------------

test('pairScenes is non-empty for all 28 interest pairs and is order-insensitive', () => {
  let pairs = 0
  for (let i = 0; i < INTERESTS.length; i += 1) {
    for (let j = i + 1; j < INTERESTS.length; j += 1) {
      const a = INTERESTS[i]
      const b = INTERESTS[j]
      const ab = pairScenes(a, b)
      assert.ok(ab.length > 0, `no scene for the pair {${a}, ${b}}`)
      assert.deepEqual(pairScenes(b, a), ab, `pairScenes({${a}, ${b}}) must be order-insensitive`)
      for (const id of ab) assert.ok(sameSet(interestsForScene(id), [a, b]), `${id} is not exactly {${a}, ${b}}`)
      pairs += 1
    }
  }
  assert.equal(pairs, 28)
})

// --- Triples: all 56 interest triples reachable -----------------------------------------------

test('tripleScenes is non-empty for all 56 interest triples and is order-insensitive', () => {
  let triples = 0
  for (let i = 0; i < INTERESTS.length; i += 1) {
    for (let j = i + 1; j < INTERESTS.length; j += 1) {
      for (let k = j + 1; k < INTERESTS.length; k += 1) {
        const a = INTERESTS[i]
        const b = INTERESTS[j]
        const c = INTERESTS[k]
        const t = tripleScenes(a, b, c)
        assert.ok(t.length > 0, `no scene for the triple {${a}, ${b}, ${c}}`)
        assert.deepEqual(tripleScenes(c, b, a), t, `tripleScenes({${a}, ${b}, ${c}}) must be order-insensitive`)
        for (const id of t) assert.ok(sameSet(interestsForScene(id), [a, b, c]), `${id} is not exactly {${a}, ${b}, ${c}}`)
        triples += 1
      }
    }
  }
  assert.equal(triples, 56)
})

// --- Singles: every interest has pure single-topic scenes -------------------------------------

test('singlesFor is non-empty for every interest and returns only exactly-[x] scenes', () => {
  for (const x of INTERESTS) {
    const pool = singlesFor(x)
    assert.ok(pool.length > 0, `no single-topic scene for ${x}`)
    assert.deepEqual(pool, scenesForExactInterests([x]), `singlesFor(${x}) must equal scenesForExactInterests([${x}])`)
    for (const id of pool) assert.deepEqual(interestsForScene(id), [x], `${id} returned by singlesFor(${x}) is not exactly [${x}]`)
  }
})

// --- Uncommon -------------------------------------------------------------------------------

test('uncommonScenes is exactly the scenes with an empty interest set (67, no dupes)', () => {
  const u = uncommonScenes()
  assert.equal(u.length, 67)
  assert.equal(new Set(u).size, u.length, 'uncommonScenes must not contain duplicates')
  for (const id of u) {
    assert.equal(interestsForScene(id).length, 0, `${id} is uncommon and must have no interests`)
    assert.equal(inTable(id), false, `${id} is uncommon and must not be in the table`)
    assert.equal(isComboId(id), false, `${id} is uncommon and must not be a combo`)
  }
})

// --- scenesForExactInterests semantics --------------------------------------------------------

test('scenesForExactInterests matches on set equality regardless of argument order', () => {
  assert.deepEqual(scenesForExactInterests(['cooking', 'fashion']), scenesForExactInterests(['fashion', 'cooking']))
  assert.ok(scenesForExactInterests(['fashion', 'cooking']).includes('cooking-fashion'), 'should find the combo by its set')
  for (const id of scenesForExactInterests(['fantasy', 'cooking'])) {
    assert.ok(sameSet(interestsForScene(id), ['fantasy', 'cooking']), `${id} is not exactly {fantasy, cooking}`)
  }
})

// --- Hand-assigned multi-interest intent (the documented examples) ----------------------------

test('hand-assigned multi-interest scenes match the documented intent', () => {
  assert.ok(sameSet(interestsForScene('dragon-bakery'), ['fantasy', 'cooking']))
  assert.deepEqual(interestsForScene('space-farm'), ['space'])
  assert.deepEqual(interestsForScene('wizard-arena'), ['fantasy'])
})
