import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryTheme } from '../src/domain'
import { mulberry32 } from '../src/engine'
import { pairScenes, singlesFor, tripleScenes, uncommonScenes } from '../src/story/sceneCategories'
import { isSceneId } from '../src/story/scenery'
import { selectSceneForBeat } from '../src/story/selectSceneForBeat'
import type { SceneMatchRequest } from '../src/story/storyAi'

// Pure test of the scene-selection DISPATCHER: with a FAKE matcher + a seeded rng it must route each
// of the 6 interest-selection modes to the right categorized rule, carry `settingTieIn` only where a
// rule grounds the premise in a scene's setting (rule 4 always; rule 6 when nothing matched), and be
// deterministic for a fixed seed. No network: the matcher is always injected.

// A minimal theme builder; defaults to NO interests + NO custom text (the 'none' mode).
const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: [],
  premise: 'A bright new adventure stretches out ahead.',
  protagonist: 'Rowan',
  ...over,
})

// A matcher that always resolves to the same value (the fake the tests inject — never the network).
const matcherReturning = (value: SceneId | null) => async (): Promise<SceneId | null> => value

// Representative seeds reused across the deterministic/coverage tests.
const SEEDS = [0, 1, 7, 42, 123, 4242]

// --- mode 'single' -> selectSingleScene(interest) (rule 1) ------------------------------------

test("'single' routes to singlesFor(interest) and sets no tie-in", async () => {
  const t = theme({ interestIds: ['space'] })
  for (const seed of SEEDS) {
    const { sceneId, settingTieIn } = await selectSceneForBeat(t, { rng: mulberry32(seed) })
    assert.ok(sceneId !== null && isSceneId(sceneId), `seed ${seed} returned a non-catalog id`)
    assert.ok(singlesFor('space').includes(sceneId), `${sceneId} not in singlesFor(space)`)
    assert.equal(settingTieIn, undefined, 'rule 1 must not flag a setting tie-in')
  }
})

// --- mode 'pair' -> selectPairScene(a, b) (rule 2) -------------------------------------------

test("'pair' routes to pairScenes(a, b) and sets no tie-in", async () => {
  const t = theme({ interestIds: ['cooking', 'fashion'] })
  for (const seed of SEEDS) {
    const { sceneId, settingTieIn } = await selectSceneForBeat(t, { rng: mulberry32(seed) })
    assert.ok(sceneId !== null && pairScenes('cooking', 'fashion').includes(sceneId), `${sceneId} not in pairScenes`)
    assert.equal(settingTieIn, undefined, 'rule 2 must not flag a setting tie-in')
  }
})

// --- mode 'triple' -> selectTripleScene(a, b, c) (rule 3) ------------------------------------

test("'triple' routes to tripleScenes(a, b, c) and sets no tie-in", async () => {
  const t = theme({ interestIds: ['space', 'fantasy', 'cooking'] })
  for (const seed of SEEDS) {
    const { sceneId, settingTieIn } = await selectSceneForBeat(t, { rng: mulberry32(seed) })
    assert.ok(
      sceneId !== null && tripleScenes('space', 'fantasy', 'cooking').includes(sceneId),
      `${sceneId} not in tripleScenes`,
    )
    assert.equal(settingTieIn, undefined, 'rule 3 must not flag a setting tie-in')
  }
})

// --- mode 'none' -> selectUncommonScene() (rule 4, ALWAYS settingTieIn:true) ------------------

test("'none' routes to uncommonScenes() and ALWAYS carries settingTieIn:true", async () => {
  const t = theme({ interestIds: [] })
  const pool = uncommonScenes()
  for (const seed of SEEDS) {
    const { sceneId, settingTieIn } = await selectSceneForBeat(t, { rng: mulberry32(seed) })
    assert.equal(settingTieIn, true, 'rule 4 must always flag a setting tie-in')
    assert.ok(sceneId !== null && pool.includes(sceneId), `${sceneId} not an uncommon scene`)
  }
})

// --- mode 'suggestedPlusCustom' -> selectSuggestedPlusCustomScene(theme) (rule 5) -------------

test("'suggestedPlusCustom' returns the matcher's pick verbatim when non-null", async () => {
  const t = theme({ interestIds: ['space'], freeformInterest: 'volcanoes and lava' })
  const { sceneId, settingTieIn } = await selectSceneForBeat(t, {
    matcher: matcherReturning('cozy-kitchen'),
    rng: mulberry32(1),
  })
  assert.equal(sceneId, 'cozy-kitchen')
  assert.equal(settingTieIn, undefined, 'rule 5 never marks a setting tie-in')
})

test("'suggestedPlusCustom' falls back to the suggested pool when the matcher returns null", async () => {
  const t = theme({ interestIds: ['space'], freeformInterest: 'volcanoes and lava' })
  for (const seed of SEEDS) {
    const { sceneId, settingTieIn } = await selectSceneForBeat(t, { matcher: matcherReturning(null), rng: mulberry32(seed) })
    assert.ok(sceneId !== null && singlesFor('space').includes(sceneId), `${sceneId} escaped the n=1 suggested pool`)
    assert.equal(settingTieIn, undefined)
  }
})

// --- mode 'customOnly' -> selectCustomOnlyScene(theme) (rule 6) -------------------------------

test("'customOnly' returns the matcher's close match with NO tie-in", async () => {
  const t = theme({ interestIds: [], freeformInterest: 'volcanoes and lava' })
  const { sceneId, settingTieIn } = await selectSceneForBeat(t, {
    matcher: matcherReturning('pirate-cove'),
    rng: mulberry32(1),
  })
  assert.equal(sceneId, 'pirate-cove')
  assert.equal(settingTieIn, undefined, 'a close match must not flag a setting tie-in')
})

test("'customOnly' with no match grounds in an uncommon scene with settingTieIn:true", async () => {
  const t = theme({ interestIds: [], freeformInterest: 'volcanoes and lava' })
  const pool = uncommonScenes()
  for (const seed of SEEDS) {
    const { sceneId, settingTieIn } = await selectSceneForBeat(t, { matcher: matcherReturning(null), rng: mulberry32(seed) })
    assert.equal(settingTieIn, true, 'rule 6 ties in when nothing matched')
    assert.ok(sceneId !== null && pool.includes(sceneId), `${sceneId} not an uncommon scene`)
  }
})

// --- the matcher is consulted ONLY for the custom modes (5 & 6) -------------------------------

test('the matcher is consulted only for the custom modes (emphasizing the custom topic)', async () => {
  const seen: SceneMatchRequest[] = []
  const spy = async (req: SceneMatchRequest): Promise<SceneId | null> => {
    seen.push(req)
    return null
  }

  // Suggested-only modes (1-4) ignore the matcher entirely (pure rng picks).
  for (const t of [
    theme({ interestIds: ['space'] }),
    theme({ interestIds: ['cooking', 'fashion'] }),
    theme({ interestIds: ['space', 'fantasy', 'cooking'] }),
    theme({ interestIds: [] }),
  ]) {
    await selectSceneForBeat(t, { matcher: spy, rng: mulberry32(0) })
  }
  assert.equal(seen.length, 0, 'modes 1-4 must not consult the matcher')

  // Custom modes (5 & 6) each consult it once, with emphasizeCustom set and the theme forwarded.
  const five = theme({ interestIds: ['space'], freeformInterest: 'lava' })
  const six = theme({ interestIds: [], freeformInterest: 'lava' })
  await selectSceneForBeat(five, { matcher: spy, rng: mulberry32(0) })
  await selectSceneForBeat(six, { matcher: spy, rng: mulberry32(0) })
  assert.equal(seen.length, 2, 'modes 5 & 6 each consult the matcher once')
  assert.ok(seen.every((req) => req.emphasizeCustom === true), 'custom modes must emphasize the custom topic')
  assert.equal(seen[0].theme, five, 'rule 5 forwards its theme unchanged')
  assert.equal(seen[1].theme, six, 'rule 6 forwards its theme unchanged')
})

// --- avoidSceneId is threaded through to the chosen rule --------------------------------------

test('threads avoidSceneId to the rule (none mode never repeats when alternatives exist)', async () => {
  const pool = uncommonScenes()
  const avoid = pool[0]
  for (const seed of SEEDS) {
    const { sceneId } = await selectSceneForBeat(theme({ interestIds: [] }), {
      rng: mulberry32(seed),
      avoidSceneId: avoid,
    })
    assert.notEqual(sceneId, avoid, `seed ${seed} failed to avoid ${avoid}`)
    assert.ok(sceneId !== null && pool.includes(sceneId))
  }
})

// --- determinism: a fixed seed reproduces the same selection in every mode --------------------

test('is deterministic for a fixed seed across all six modes', async () => {
  const cases: StoryTheme[] = [
    theme({ interestIds: ['space'] }), // single
    theme({ interestIds: ['cooking', 'fashion'] }), // pair
    theme({ interestIds: ['space', 'fantasy', 'cooking'] }), // triple
    theme({ interestIds: [] }), // none
    theme({ interestIds: ['space'], freeformInterest: 'lava' }), // suggestedPlusCustom
    theme({ interestIds: [], freeformInterest: 'lava' }), // customOnly
  ]
  for (const t of cases) {
    for (const seed of SEEDS) {
      const a = await selectSceneForBeat(t, { matcher: matcherReturning(null), rng: mulberry32(seed) })
      const b = await selectSceneForBeat(t, { matcher: matcherReturning(null), rng: mulberry32(seed) })
      assert.deepEqual(a, b, `mode for ${JSON.stringify(t.interestIds)} not reproducible @ seed ${seed}`)
    }
  }
})

// --- every mode always resolves to a real catalog SceneId ------------------------------------

test('every mode resolves to a valid catalog SceneId', async () => {
  const cases: StoryTheme[] = [
    theme({ interestIds: ['pirates'] }),
    theme({ interestIds: ['cooking', 'fashion'] }),
    theme({ interestIds: ['space', 'fantasy', 'cooking'] }),
    theme({ interestIds: [] }),
    theme({ interestIds: ['space'], freeformInterest: 'lava' }),
    theme({ interestIds: [], freeformInterest: 'lava' }),
  ]
  for (const t of cases) {
    const { sceneId } = await selectSceneForBeat(t, { matcher: matcherReturning(null), rng: mulberry32(9) })
    assert.ok(sceneId !== null && isSceneId(sceneId), `expected a catalog scene for ${JSON.stringify(t.interestIds)}`)
  }
})
