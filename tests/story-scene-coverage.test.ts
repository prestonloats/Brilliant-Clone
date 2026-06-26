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
    // Strip an optional trailing "-<n>" variant suffix (e.g. `cooking-fashion-2`) before checking, so
    // duplicate blend images validate against the same interest tokens as their base combo.
    const tokens = entry.id.replace(/-\d+$/, '').split('-')
    assert.ok(tokens.length >= 2, `blend id ${entry.id} should combine 2+ interests`)
    for (const token of tokens) {
      assert.ok(INTEREST_ID_SET.has(token), `blend id ${entry.id} has non-interest token "${token}"`)
    }
  }
})

// --- Complete blend grid for every interest pair and triple ---------------------------------

// The grid must stay COMPLETE and orphan-free: every one of the 28 interest pairs and 56 interest
// triples is covered by at least one blend tile, and no blend tile depicts a set that is not a valid
// pair/triple. Combos may now carry MULTIPLE images (a base tile plus `-<n>` variant duplicates, the
// "≥4 per pair / ≥2 per triple" coverage top-up), so tiles are grouped by their base interest set.
test('every interest pair and triple is covered by a blend tile, with no orphan blends', () => {
  const pairKeys = combinations(INTEREST_IDS, 2).map(comboKey)
  const tripleKeys = combinations(INTEREST_IDS, 3).map(comboKey)
  assert.equal(pairKeys.length, 28, 'C(8,2) should be 28 pairs')
  assert.equal(tripleKeys.length, 56, 'C(8,3) should be 56 triples')

  // Group blend tiles by interest set, ignoring any trailing "-<n>" variant suffix so a base combo
  // and its duplicate images (`cooking-fashion`, `cooking-fashion-2`, …) collapse to one key.
  const blendByKey = new Map<string, string[]>()
  for (const entry of BLEND_SCENES) {
    const key = comboKey(entry.id.replace(/-\d+$/, '').split('-'))
    const list = blendByKey.get(key) ?? []
    list.push(entry.id)
    blendByKey.set(key, list)
  }

  // None missing: every pair and every triple has at least one blend tile.
  for (const key of pairKeys) {
    assert.ok((blendByKey.get(key) ?? []).length >= 1, `no blend image for pair ${key}`)
  }
  for (const key of tripleKeys) {
    assert.ok((blendByKey.get(key) ?? []).length >= 1, `no blend image for triple ${key}`)
  }

  // None extra: every blend tile maps to a known pair/triple.
  const expectedKeys = new Set<string>([...pairKeys, ...tripleKeys])
  for (const [key, matches] of blendByKey) {
    assert.ok(expectedKeys.has(key), `unexpected blend tile(s) not matching any pair/triple: [${matches.join(', ')}]`)
  }

  assert.equal(blendByKey.size, 84, 'all 28 pairs + 56 triples should be represented (84 distinct combos)')
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

test('the raw scenery catalog has 424 entries', () => {
  assert.equal(SCENERY_CATALOG.length, 424)
})
