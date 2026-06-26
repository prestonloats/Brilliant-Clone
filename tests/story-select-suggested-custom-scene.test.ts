import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryTheme } from '../src/domain'
import { mulberry32 } from '../src/engine'
import { pairScenes, singlesFor, tripleScenes } from '../src/story/sceneCategories'
import { scenesForInterests } from '../src/story/scenery'
import { selectSuggestedPlusCustomScene } from '../src/story/selectSuggestedPlusCustomScene'
import type { SceneMatchRequest } from '../src/story/storyAi'

const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['fantasy'],
  freeformInterest: 'dragon, bakery',
  premise: 'A young mapmaker hunts for a hidden kingdom.',
  protagonist: 'Rowan',
  ...over,
})

// A matcher that always resolves to the given value (the FAKE the tests inject — no network).
const matcherReturning = (value: SceneId | null) => async (): Promise<SceneId | null> => value

// --- (a) the matcher's non-null pick wins outright --------------------------------------------

test('uses the matcher result when it returns a non-null SceneId', async () => {
  // A kitchen for a space theme proves rule 5 trusts the matcher's pick verbatim (it is NOT
  // second-guessed against the suggested pool).
  const { sceneId } = await selectSuggestedPlusCustomScene(theme({ interestIds: ['space'] }), {
    matcher: matcherReturning('cozy-kitchen'),
    rng: mulberry32(1),
  })
  assert.equal(sceneId, 'cozy-kitchen')
})

test('hands the matcher the broad scenesForInterests shortlist with emphasizeCustom set', async () => {
  const t = theme({ interestIds: ['fantasy', 'cooking'], freeformInterest: 'dragon, bakery' })
  let calls = 0
  const matcher = async (req: SceneMatchRequest): Promise<SceneId | null> => {
    calls += 1
    assert.equal(req.emphasizeCustom, true, 'rule 5 must emphasize the custom topic')
    assert.equal(req.theme, t, 'the theme is forwarded unchanged')
    assert.deepEqual([...req.candidates], scenesForInterests(t), 'candidates are the broad pool')
    return null
  }
  await selectSuggestedPlusCustomScene(t, { matcher, rng: mulberry32(0) })
  assert.equal(calls, 1, 'the matcher must be consulted exactly once')
})

// --- (b) matcher returns null -> fall back into the suggested pool by interest count ----------

test('matcher returning null falls back to the suggested pool by interest count', async () => {
  const nullMatcher = matcherReturning(null)

  // n = 1 -> singlesFor(x)
  const { sceneId: s1 } = await selectSuggestedPlusCustomScene(theme({ interestIds: ['space'] }), {
    matcher: nullMatcher,
    rng: mulberry32(3),
  })
  assert.ok(s1 !== null)
  assert.ok(singlesFor('space').includes(s1), 'n=1 should draw from singlesFor')

  // n = 2 -> pairScenes(a, b)
  const { sceneId: s2 } = await selectSuggestedPlusCustomScene(theme({ interestIds: ['cooking', 'fashion'] }), {
    matcher: nullMatcher,
    rng: mulberry32(3),
  })
  assert.ok(s2 !== null)
  assert.ok(pairScenes('cooking', 'fashion').includes(s2), 'n=2 should draw from pairScenes')

  // n = 3 -> tripleScenes(a, b, c)
  const { sceneId: s3 } = await selectSuggestedPlusCustomScene(theme({ interestIds: ['space', 'fantasy', 'cooking'] }), {
    matcher: nullMatcher,
    rng: mulberry32(3),
  })
  assert.ok(s3 !== null)
  assert.ok(tripleScenes('space', 'fantasy', 'cooking').includes(s3), 'n=3 should draw from tripleScenes')
})

// --- (c) no matcher provided -> same suggested fallback, deterministic with a seeded rng -------

test('with no matcher it uses the suggested pool and is deterministic for a fixed seed', async () => {
  const t = theme({ interestIds: ['space'] })
  const a = await selectSuggestedPlusCustomScene(t, { rng: mulberry32(42) })
  const b = await selectSuggestedPlusCustomScene(t, { rng: mulberry32(42) })
  assert.ok(a.sceneId !== null)
  assert.equal(a.sceneId, b.sceneId, 'a fixed seed must reproduce the same pick')
  assert.ok(singlesFor('space').includes(a.sceneId), 'the pick comes from the n=1 suggested pool')
})

test('no-matcher fallback spreads a single interest across many scenes (seeded rng)', async () => {
  const t = theme({ interestIds: ['space'] })
  const seen = new Set<SceneId>()
  for (let seed = 0; seed < 200; seed += 1) {
    const { sceneId } = await selectSuggestedPlusCustomScene(t, { rng: mulberry32(seed) })
    assert.ok(sceneId !== null)
    seen.add(sceneId)
  }
  assert.ok(seen.size > 3, `expected variety across seeds, only saw ${seen.size} distinct scenes`)
})

// --- avoidSceneId is excluded whenever the pool has an alternative -----------------------------

test('excludes avoidSceneId when the pool has alternatives', async () => {
  const t = theme({ interestIds: ['space'] })
  const pool = singlesFor('space')
  assert.ok(pool.length > 1, 'this guard needs a pool with alternatives')
  const avoid = pool[0]
  for (let seed = 0; seed < 100; seed += 1) {
    const { sceneId } = await selectSuggestedPlusCustomScene(t, { rng: mulberry32(seed), avoidSceneId: avoid })
    assert.ok(sceneId !== null)
    assert.notEqual(sceneId, avoid, `seed ${seed} returned the avoided scene`)
    assert.ok(pool.includes(sceneId), 'pick stays inside the n=1 pool')
  }
})

// --- never throws: a rejecting matcher degrades to the offline fallback ------------------------

test('never throws: a rejecting matcher falls back to the suggested pool', async () => {
  const boom = async (): Promise<SceneId | null> => {
    throw new Error('network down')
  }
  const { sceneId } = await selectSuggestedPlusCustomScene(theme({ interestIds: ['fantasy'] }), {
    matcher: boom,
    rng: mulberry32(5),
  })
  assert.ok(sceneId !== null)
  assert.ok(singlesFor('fantasy').includes(sceneId), 'a matcher failure still yields an on-theme scene')
})

// --- the result is always a real catalog scene (rule 5 backstops to a non-null id) ------------

test('always resolves to a valid catalog SceneId across interest-count cases', async () => {
  const cases: StoryTheme[] = [
    theme({ interestIds: ['pirates'] }),
    theme({ interestIds: ['cooking', 'fashion'] }),
    theme({ interestIds: ['space', 'fantasy', 'cooking'] }),
  ]
  for (const t of cases) {
    const { sceneId } = await selectSuggestedPlusCustomScene(t, { matcher: matcherReturning(null), rng: mulberry32(9) })
    assert.ok(sceneId !== null, `expected a scene for ${JSON.stringify(t.interestIds)}`)
  }
})
