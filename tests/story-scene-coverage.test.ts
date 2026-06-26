import assert from 'node:assert/strict'
import { test } from 'node:test'

import { INTEREST_CATALOG } from '../src/story/interests'
import { OFF_INTEREST_SCENES, SCENERY_CATALOG, scenesForInterests } from '../src/story/scenery'

// The Story Mode scene-categorization redesign (per-interest pools, 2-/3-interest "blend" tiles,
// and the "uncommon" surprise pool) rests on a few HARD structural facts about the raw scenery
// catalog. These tests lock the counts the recon measured so a future catalog edit that quietly
// breaks the blend grid, leaks a non-interest token into a blend id, or shifts the uncommon-pool
// size fails loudly here instead of silently degrading scene selection.

// The eight preset interests every blend combo is built from.
const INTEREST_IDS = INTEREST_CATALOG.map((interest) => interest.id)
const INTEREST_ID_SET = new Set<string>(INTEREST_IDS)

// A scene is a "blend combo" tile when its description opens with "A blend of …" — the same marker
// scenery.ts itself uses (BLEND_COMBO_DESCRIPTION_PREFIX) to recognize multi-interest art.
const BLEND_DESCRIPTION_PREFIX = 'a blend of'
const BLEND_SCENES = SCENERY_CATALOG.filter((entry) =>
  entry.description.trim().toLowerCase().startsWith(BLEND_DESCRIPTION_PREFIX),
)

// An order-independent key for a set of interest tokens, so `cooking-fashion` and a generated
// `['fashion', 'cooking']` pair collapse to one comparable key regardless of token order.
const comboKey = (tokens: readonly string[]): string => [...tokens].sort().join('|')

// Every k-sized combination of the given items (used to enumerate every interest pair/triple).
const combinations = <T>(items: readonly T[], k: number): T[][] => {
  if (k === 0) return [[]]
  if (k > items.length) return []
  const [first, ...rest] = items
  return [...combinations(rest, k - 1).map((combo) => [first, ...combo]), ...combinations(rest, k)]
}

// --- The eight-interest anchor --------------------------------------------------------------

// The 28-pair / 56-triple math below is derived from EXACTLY eight interests; anchor that count
// here so a change to the interest catalog forces a deliberate update to the coverage invariants.
test('there are exactly eight preset interests', () => {
  assert.equal(INTEREST_IDS.length, 8)
  assert.equal(INTEREST_ID_SET.size, 8, 'interest ids should be unique')
})

// --- Blend-combo id integrity ---------------------------------------------------------------

// Every blend id must be built PURELY from interest tokens (split on '-'); a stray token would mean
// the id no longer maps cleanly back to the interests it depicts and would break the grid below.
test("every blend combo id's tokens are all valid interest ids", () => {
  for (const entry of BLEND_SCENES) {
    const tokens = entry.id.split('-')
    assert.ok(tokens.length >= 2, `blend id ${entry.id} should combine 2+ interests`)
    for (const token of tokens) {
      assert.ok(INTEREST_ID_SET.has(token), `blend id ${entry.id} has non-interest token "${token}"`)
    }
  }
})

// --- One image per interest pair and per interest triple ------------------------------------

// The redesign assumes a COMPLETE, NON-DUPLICATED grid: exactly one tile for each of the 28
// interest pairs and each of the 56 interest triples (84 blend tiles total), with no extra blends
// and no two tiles depicting the same interest set.
test('exactly one blend image covers each interest pair and each interest triple', () => {
  const pairKeys = combinations(INTEREST_IDS, 2).map(comboKey)
  const tripleKeys = combinations(INTEREST_IDS, 3).map(comboKey)
  assert.equal(pairKeys.length, 28, 'C(8,2) should be 28 pairs')
  assert.equal(tripleKeys.length, 56, 'C(8,3) should be 56 triples')

  const blendByKey = new Map<string, string[]>()
  for (const entry of BLEND_SCENES) {
    const key = comboKey(entry.id.split('-'))
    const list = blendByKey.get(key) ?? []
    list.push(entry.id)
    blendByKey.set(key, list)
  }

  // None missing: every pair and every triple has exactly one tile.
  for (const key of pairKeys) {
    const matches = blendByKey.get(key) ?? []
    assert.equal(matches.length, 1, `expected exactly one blend image for pair ${key}, got [${matches.join(', ')}]`)
  }
  for (const key of tripleKeys) {
    const matches = blendByKey.get(key) ?? []
    assert.equal(matches.length, 1, `expected exactly one blend image for triple ${key}, got [${matches.join(', ')}]`)
  }

  // None extra and none duplicated: every blend tile maps to a known pair/triple, exactly once.
  const expectedKeys = new Set<string>([...pairKeys, ...tripleKeys])
  for (const [key, matches] of blendByKey) {
    assert.ok(expectedKeys.has(key), `unexpected blend tile(s) not matching any pair/triple: [${matches.join(', ')}]`)
    assert.equal(matches.length, 1, `duplicate blend tiles for ${key}: [${matches.join(', ')}]`)
  }

  assert.equal(blendByKey.size, 84, 'there should be 84 distinct blend combos (28 pairs + 56 triples)')
  assert.equal(BLEND_SCENES.length, 84, 'there should be exactly 84 blend tiles, none duplicated')
})

// --- The "uncommon" (off-interest) pool ------------------------------------------------------

// The surprise pool is every scene the SUGGESTED_INTEREST_KEYWORDS fingerprint ties to ZERO
// interests. OFF_INTEREST_SCENES is exactly that exported computation; lock its measured size, and
// confirm it cleanly PARTITIONS the catalog against the matched (≥1 interest) pool from the SAME
// fingerprint logic (scenesForInterests over all eight interests), so the two pools never overlap
// and together cover the whole catalog.
test('exactly 67 scenes match zero interests (the uncommon pool)', () => {
  assert.equal(OFF_INTEREST_SCENES.length, 67)

  const matched = scenesForInterests({ interestIds: INTEREST_IDS })
  const offSet = new Set<string>(OFF_INTEREST_SCENES)
  for (const id of matched) {
    assert.equal(offSet.has(id), false, `${id} is in both the matched and uncommon pools`)
  }
  assert.equal(
    matched.length + OFF_INTEREST_SCENES.length,
    SCENERY_CATALOG.length,
    'matched + uncommon pools should partition the whole catalog',
  )
})

// --- Catalog size sanity --------------------------------------------------------------------

test('the raw scenery catalog has 313 entries', () => {
  assert.equal(SCENERY_CATALOG.length, 313)
})
