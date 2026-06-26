import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryInterestId } from '../src/domain'
import { mulberry32 } from '../src/engine/storyMode/randomizeQuestionNumbers'
import { pairScenes, singlesFor, tripleScenes } from '../src/story/sceneCategories'
import { SCENE_IDS, defaultSceneForInterests, isSceneId } from '../src/story/scenery'
import { selectTripleScene } from '../src/story/selectTripleScene'

// Subtask R3 — triple scene selection (rule 3). The primary pool is `tripleScenes(a,b,c)`; the
// missing-combo fallbacks (pairs -> singles -> defaultSceneForInterests) are DEFENSIVE: with the
// complete catalog every one of the 56 real triples already has exactly one tile, so the only way
// to exercise a fallback is to feed an interest id that is NOT in the catalog (cast a plain string).

const INTERESTS: StoryInterestId[] = ['space', 'fantasy', 'mystery', 'sports', 'animals', 'pirates', 'cooking', 'fashion']

// A NON-catalog interest id (forces the categorization lookups to return an empty pool, so a
// fallback branch is taken). Widening `string` -> the union is a safe cast (no overlap warning).
const notReal = (s: string): StoryInterestId => s as StoryInterestId

// Every 3-combination of the eight real interests (all 56 should resolve in the primary pool).
const tripleCombos = (): [StoryInterestId, StoryInterestId, StoryInterestId][] => {
  const out: [StoryInterestId, StoryInterestId, StoryInterestId][] = []
  for (let i = 0; i < INTERESTS.length; i += 1) {
    for (let j = i + 1; j < INTERESTS.length; j += 1) {
      for (let k = j + 1; k < INTERESTS.length; k += 1) {
        out.push([INTERESTS[i], INTERESTS[j], INTERESTS[k]])
      }
    }
  }
  return out
}

// --- Primary pool: real triples resolve in `tripleScenes(a,b,c)` ------------------------------

test('every real triple resolves to a scene inside tripleScenes(a,b,c)', () => {
  let count = 0
  for (const [a, b, c] of tripleCombos()) {
    const { sceneId } = selectTripleScene(a, b, c, { rng: mulberry32(1) })
    assert.notEqual(sceneId, null, `triple {${a},${b},${c}} should resolve to a scene`)
    assert.ok(
      tripleScenes(a, b, c).includes(sceneId as SceneId),
      `${sceneId} is not in tripleScenes(${a},${b},${c})`,
    )
    count += 1
  }
  assert.equal(count, 56, 'should have checked all 56 interest triples')
})

// --- Determinism: same seed -> identical result, for every real triple ------------------------

test('selectTripleScene is deterministic under a fixed seed', () => {
  for (const [a, b, c] of tripleCombos()) {
    const first = selectTripleScene(a, b, c, { rng: mulberry32(42) })
    const second = selectTripleScene(a, b, c, { rng: mulberry32(42) })
    assert.deepEqual(first, second, `triple {${a},${b},${c}} must be deterministic for one seed`)
  }
})

// --- The rng actually drives the pick (different seeds spread across a multi-scene pool) -------

test('the injected rng varies the pick across a multi-scene pool', () => {
  // The single-topic fallback pool for `space` has many scenes, so different seeds should land on
  // different scenes (proving the choice is rng-driven, not a fixed first element).
  const pool = singlesFor('space')
  assert.ok(pool.length >= 2, 'precondition: space has multiple single-topic scenes')
  const seen = new Set<SceneId>()
  for (let seed = 0; seed < 50; seed += 1) {
    const { sceneId } = selectTripleScene('space', notReal('zzx1'), notReal('zzx2'), { rng: mulberry32(seed) })
    assert.ok(sceneId && pool.includes(sceneId), `${sceneId} should be a space single-topic scene`)
    seen.add(sceneId as SceneId)
  }
  assert.ok(seen.size >= 2, 'different seeds should produce different scenes')
})

// --- Fallback 1: pair union when the triple pool is empty -------------------------------------

test('falls back to the pair union when no triple scene exists', () => {
  // {space, fantasy, <not real>} has no triple tile, but the {space, fantasy} pair tile exists.
  const a: StoryInterestId = 'space'
  const b: StoryInterestId = 'fantasy'
  const c = notReal('zzx3')
  assert.equal(tripleScenes(a, b, c).length, 0, 'precondition: no triple tile for this combo')
  const pairUnion = [...pairScenes(a, b), ...pairScenes(a, c), ...pairScenes(b, c)]
  assert.ok(pairUnion.length > 0, 'precondition: the pair union is non-empty')

  const { sceneId } = selectTripleScene(a, b, c, { rng: mulberry32(7) })
  assert.notEqual(sceneId, null)
  assert.ok(pairUnion.includes(sceneId as SceneId), `${sceneId} should come from the pair union`)
  assert.ok(pairUnion.includes('space-fantasy'), 'the pair union should include the space-fantasy blend tile')
})

// --- Fallback 2: single union when triple AND pair pools are empty ----------------------------

test('falls back to the single-topic union when triple and pair pools are empty', () => {
  const a: StoryInterestId = 'space'
  const b = notReal('zzx4')
  const c = notReal('zzx5')
  assert.equal(tripleScenes(a, b, c).length, 0, 'precondition: no triple tile')
  const pairUnion = [...pairScenes(a, b), ...pairScenes(a, c), ...pairScenes(b, c)]
  assert.equal(pairUnion.length, 0, 'precondition: no pair tile')
  const singleUnion = [...singlesFor(a), ...singlesFor(b), ...singlesFor(c)]
  assert.ok(singleUnion.length > 0, 'precondition: the single union is non-empty')

  const { sceneId } = selectTripleScene(a, b, c, { rng: mulberry32(9) })
  assert.notEqual(sceneId, null)
  assert.ok(singleUnion.includes(sceneId as SceneId), `${sceneId} should come from the single union`)
})

// --- Fallback 3: defaultSceneForInterests when every categorized pool is empty ----------------

test('falls back to defaultSceneForInterests when nothing is categorized', () => {
  const a = notReal('zzx6')
  const b = notReal('zzx7')
  const c = notReal('zzx8')
  assert.equal(tripleScenes(a, b, c).length, 0)
  assert.equal([...pairScenes(a, b), ...pairScenes(a, c), ...pairScenes(b, c)].length, 0)
  assert.equal([...singlesFor(a), ...singlesFor(b), ...singlesFor(c)].length, 0)

  const { sceneId } = selectTripleScene(a, b, c, { rng: mulberry32(3) })
  assert.notEqual(sceneId, null)
  assert.ok(isSceneId(sceneId), `${sceneId} should be a real catalog scene id`)
  // It must match the documented backstop helper for the same interests + seed.
  const expected = defaultSceneForInterests({ interestIds: [a, b, c] }, mulberry32(3))
  assert.equal(sceneId, expected)
})

// --- avoidSceneId: excluded when alternatives exist ------------------------------------------

test('avoidSceneId is excluded whenever an alternative exists', () => {
  const pool = singlesFor('space')
  const avoid = pool[0]
  for (let seed = 0; seed < 40; seed += 1) {
    const { sceneId } = selectTripleScene('space', notReal('zzx9'), notReal('zzxa'), {
      rng: mulberry32(seed),
      avoidSceneId: avoid,
    })
    assert.ok(sceneId && pool.includes(sceneId), `${sceneId} should still be in the pool`)
    assert.notEqual(sceneId, avoid, 'the avoided scene must never be chosen when alternatives exist')
  }
})

// --- avoidSceneId: ignored when it is the ONLY option ----------------------------------------

test('avoidSceneId is ignored when it is the only candidate', () => {
  // Real triple pools hold exactly one tile, so avoiding it leaves no alternative -> return it.
  const a: StoryInterestId = 'space'
  const b: StoryInterestId = 'fantasy'
  const c: StoryInterestId = 'mystery'
  const only = tripleScenes(a, b, c)
  assert.equal(only.length, 1, 'precondition: a real triple has exactly one tile')

  const { sceneId } = selectTripleScene(a, b, c, { rng: mulberry32(5), avoidSceneId: only[0] })
  assert.equal(sceneId, only[0], 'with no alternative the avoided tile is still returned')
})

// --- Purity / never throws: works with the default Math.random rng too -----------------------

test('selectTripleScene never throws and always yields a catalog id (default rng)', () => {
  for (const [a, b, c] of tripleCombos()) {
    const { sceneId } = selectTripleScene(a, b, c)
    assert.ok(sceneId && SCENE_IDS.includes(sceneId), `${sceneId} should be a catalog scene id`)
  }
  // Even the fully-uncategorized case returns a valid id rather than throwing.
  const { sceneId } = selectTripleScene(notReal('q1q'), notReal('q2q'), notReal('q3q'))
  assert.ok(sceneId && isSceneId(sceneId))
})
