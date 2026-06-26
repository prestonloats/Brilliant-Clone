import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend'
import type { SceneId, StoryInterestId, StorySession, StoryTheme } from '../src/domain'
import { mulberry32 } from '../src/engine'
import {
  NO_SCENE,
  SCENERY_CATALOG,
  SCENE_IDS,
  coerceSceneId,
  defaultSceneForInterests,
  getSceneDescription,
  getSceneLabel,
  isSceneId,
  scenerySrc,
  scenesForInterests,
} from '../src/story/scenery'
import { buildScenePrompt, parseSceneId } from '../src/story/storyPrompts'
import { appendSegment, createInitialSession } from '../src/story/storySessionReducer'

const ISO = '2026-06-25T00:00:00.000Z'

const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['fantasy'],
  premise: 'A young mapmaker hunts for a hidden kingdom.',
  protagonist: 'Rowan',
  ...over,
})

// --- Catalog integrity ----------------------------------------------------------------------

test('every catalog entry has a unique id, label, description, and asset path', () => {
  assert.ok(SCENERY_CATALOG.length > 0)
  const ids = new Set<string>()
  for (const entry of SCENERY_CATALOG) {
    assert.equal(typeof entry.id, 'string')
    assert.ok(entry.label.trim().length > 0, `missing label for ${entry.id}`)
    assert.ok(entry.description.trim().length > 0, `missing description for ${entry.id}`)
    assert.equal(ids.has(entry.id), false, `duplicate id ${entry.id}`)
    ids.add(entry.id)
  }
  assert.equal(SCENE_IDS.length, SCENERY_CATALOG.length)
})

test('scenerySrc points at the public asset path', () => {
  assert.equal(scenerySrc('outer-space'), '/scenery/outer-space.webp')
  for (const id of SCENE_IDS) assert.equal(scenerySrc(id), `/scenery/${id}.webp`)
})

// Guards against the silent breakage that started this whole feature: a catalog id with no asset
// (broken <img>) or an orphan image no code can ever select.
test('the catalog and the public/scenery assets match one-to-one', () => {
  const dir = join(process.cwd(), 'public', 'scenery')
  for (const id of SCENE_IDS) {
    assert.ok(existsSync(join(dir, `${id}.webp`)), `missing asset for catalog id ${id}`)
  }
  const assetIds = readdirSync(dir)
    .filter((name) => name.endsWith('.webp'))
    .map((name) => name.slice(0, -'.webp'.length))
  const catalogIds = new Set<string>(SCENE_IDS)
  for (const assetId of assetIds) {
    assert.ok(catalogIds.has(assetId), `orphan asset with no catalog entry: ${assetId}.webp`)
  }
  assert.equal(assetIds.length, SCENE_IDS.length)
})

// --- Lookups --------------------------------------------------------------------------------

test('isSceneId only accepts known ids', () => {
  assert.equal(isSceneId('outer-space'), true)
  assert.equal(isSceneId('not-a-scene'), false)
  assert.equal(isSceneId(''), false)
  assert.equal(isSceneId(42), false)
  assert.equal(isSceneId(undefined), false)
})

test('coerceSceneId tolerates quotes/case/whitespace and rejects unknowns', () => {
  assert.equal(coerceSceneId('crystal-cavern'), 'crystal-cavern')
  assert.equal(coerceSceneId('  CRYSTAL-CAVERN '), 'crystal-cavern')
  assert.equal(coerceSceneId('"forest-clearing"'), 'forest-clearing')
  assert.equal(coerceSceneId(NO_SCENE), null)
  assert.equal(coerceSceneId('totally-made-up'), null)
  assert.equal(coerceSceneId(123), null)
  assert.equal(coerceSceneId(undefined), null)
})

test('label/description lookups return empty string for an unknown id', () => {
  assert.equal(getSceneLabel('outer-space'), 'Outer space')
  assert.ok(getSceneDescription('outer-space').length > 0)
  assert.equal(getSceneLabel('nope' as SceneId), '')
  assert.equal(getSceneDescription('nope' as SceneId), '')
})

// --- Prompt + parsing -----------------------------------------------------------------------

test('buildScenePrompt lists every id and includes the premise, beat, and no-match sentinel', () => {
  const prompt = buildScenePrompt({ theme: theme(), sceneText: 'Rowan creeps into a glittering cave of crystals.' })
  for (const id of SCENE_IDS) assert.ok(prompt.includes(id), `prompt missing id ${id}`)
  assert.ok(prompt.includes('A young mapmaker hunts for a hidden kingdom.'))
  assert.ok(prompt.includes('Rowan creeps into a glittering cave of crystals.'))
  assert.ok(prompt.includes(NO_SCENE))
})

// Regression for the "scene over-relies on the primary interest" bug: the scene-match prompt is the
// ONLY builder that historically never saw the interests, so a custom interest like "dragon" could
// not influence the pick and the model defaulted to a plain bakery over the cataloged dragon-bakery.
test('buildScenePrompt weaves in the chosen interests (incl. freeform) and a combo-preference rule', () => {
  const prompt = buildScenePrompt({
    theme: theme({ interestIds: ['fantasy', 'cooking'], freeformInterest: 'dragon, bakery' }),
    // Deliberately neutral scene text so the interest terms below can ONLY come from the interests.
    sceneText: 'The hero stops to think about the next move.',
  })
  assert.ok(prompt.toLowerCase().includes('dragon'), 'prompt should carry the freeform interest "dragon"')
  assert.ok(prompt.toLowerCase().includes('bakery'), 'prompt should carry the freeform interest "bakery"')
  assert.ok(/interests/i.test(prompt), 'prompt should label an interests line')
  assert.ok(prompt.includes('reflects the MOST'), 'prompt should include the combo-preference rule')
})

// The scene picker now receives an on-interest SHORTLIST (so it spreads picks across on-interest
// scenes) plus a "do not repeat the last image" variety hint (the AI side of the distribution +
// anti-repeat fix). Both are optional and threaded through pickScene -> buildScenePrompt verbatim.
test('buildScenePrompt includes the interest shortlist and a do-not-repeat hint when provided', () => {
  const interestScenes = scenesForInterests({ interestIds: ['space'] })
  const prompt = buildScenePrompt({
    theme: theme({ interestIds: ['space'] }),
    sceneText: 'The crew drifts toward a distant light.',
    interestScenes,
    previousSceneId: 'outer-space',
  })
  assert.ok(/images that fit the reader's interests/i.test(prompt), 'should label the interest shortlist')
  assert.ok(prompt.includes(interestScenes.join(', ')), 'should render the shortlist ids')
  assert.ok(prompt.includes('do not repeat the previous scene "outer-space"'), 'should add the variety hint')
})

// Back-compat: without the new optional hints the prompt reads exactly as before — full catalog,
// no shortlist block, no variety hint.
test('buildScenePrompt omits the shortlist + variety hint when they are not provided', () => {
  const prompt = buildScenePrompt({ theme: theme(), sceneText: 'A quiet moment.' })
  assert.ok(!/images that fit the reader's interests/i.test(prompt))
  assert.ok(!/do not repeat the previous scene/i.test(prompt))
  assert.ok(prompt.includes(NO_SCENE))
  for (const id of SCENE_IDS) assert.ok(prompt.includes(id), `prompt missing id ${id}`)
})

// --- scenesForInterests (the IN-interest pool the distribution draws from) -------------------

// A single broad interest must map to MANY scenes, so the per-beat image can distribute across them
// instead of always showing one fixed picture (the bug this fix targets).
test('scenesForInterests returns multiple catalog scenes for a single broad interest', () => {
  for (const id of ['fashion', 'space', 'fantasy'] as const) {
    const pool = scenesForInterests({ interestIds: [id] })
    assert.ok(pool.length > 1, `${id} should map to multiple scenes, got ${pool.length}`)
    assert.equal(new Set(pool).size, pool.length, `${id} pool should have no duplicates`)
    for (const sceneId of pool) assert.ok(isSceneId(sceneId), `${sceneId} should be a catalog id`)
  }
})

// Every preset interest the learner can pick must resolve to a non-empty pool (else a single
// interest would have nothing to distribute over and would fall through to the neutral default).
test('scenesForInterests is non-empty for every preset interest', () => {
  const presets: StoryInterestId[] = [
    'space',
    'fantasy',
    'mystery',
    'sports',
    'animals',
    'pirates',
    'cooking',
    'fashion',
  ]
  for (const id of presets) {
    assert.ok(scenesForInterests({ interestIds: [id] }).length > 0, `empty pool for ${id}`)
  }
})

// The new scenery art (fashion boutiques/studios, pirate coves/ships, kitchens/bakeries, detective
// + spooky mystery scenes, and spaceship/space-station sci-fi rooms) is meant to RAISE the per-
// interest distribution so the formerly-THIN interests now draw from many scenes instead of a
// handful. Guards that the new images stay wired into BOTH the catalog and the keyword fingerprints
// (a scene only joins a pool when its id+label+description matches the interest's keywords).
test('scenesForInterests is no longer thin for the formerly-sparse interests', () => {
  const minimums: Partial<Record<StoryInterestId, number>> = {
    fashion: 10,
    pirates: 10,
    cooking: 10,
    space: 10,
    mystery: 10,
  }
  for (const [id, min] of Object.entries(minimums) as Array<[StoryInterestId, number]>) {
    const pool = scenesForInterests({ interestIds: [id] })
    assert.ok(pool.length >= min, `${id} pool is too thin: ${pool.length} < ${min}`)
    assert.equal(new Set(pool).size, pool.length, `${id} pool has duplicates`)
    for (const sceneId of pool) assert.ok(isSceneId(sceneId), `${sceneId} should be a catalog id`)
  }
})

// A SINGLE interest prefers PURE single-topic scenes, so the multi-interest "A blend of ..." combo
// tiles are excluded; a 2+ interest SET keeps the matching combo art (it is on-theme then).
test('scenesForInterests drops blend-combo tiles for a single interest but keeps them for a set', () => {
  const blendIds = new Set(
    SCENERY_CATALOG.filter((entry) => entry.description.trim().toLowerCase().startsWith('a blend of')).map(
      (entry) => entry.id,
    ),
  )
  const single = scenesForInterests({ interestIds: ['fashion'] })
  for (const sceneId of single) {
    assert.equal(blendIds.has(sceneId), false, `single interest leaked combo tile ${sceneId}`)
  }
  assert.ok(single.includes('fashion-runway'), 'a single interest should still include its pure scenes')

  const pair = scenesForInterests({ interestIds: ['cooking', 'fashion'] })
  assert.ok(pair.includes('cooking-fashion'), 'a 2-interest set should include the matching combo tile')
})

// --- defaultSceneForInterests (now DISTRIBUTES across the interest pool) ---------------------

// With a seeded rng the offline backstop spreads a SINGLE interest across MANY scenes (the whole
// point of the fix) instead of returning one deterministic image every time.
test('defaultSceneForInterests spreads a single interest across many scenes (seeded rng)', () => {
  const seen = new Set<SceneId>()
  for (let seed = 0; seed < 200; seed += 1) {
    const chosen = defaultSceneForInterests({ interestIds: ['space'] }, mulberry32(seed))
    assert.ok(isSceneId(chosen))
    seen.add(chosen)
  }
  assert.ok(seen.size > 3, `expected variety across seeds, only saw ${seen.size} distinct scenes`)
})

// Every distributed pick stays INSIDE the interest pool, including the combo art for a 2-interest
// set. (The old "prefer a combo that reflects MORE interests" intent now lives in that pool + the AI
// prompt; the offline default simply distributes within it.)
test('defaultSceneForInterests only ever returns scenes from the interest pool', () => {
  const t = theme({ interestIds: ['fantasy', 'cooking'], freeformInterest: 'dragon, bakery' })
  const pool = new Set(scenesForInterests(t))
  assert.ok(pool.has('dragon-bakery'), 'the combo scene should be reachable from the pool')
  for (let seed = 0; seed < 100; seed += 1) {
    assert.ok(pool.has(defaultSceneForInterests(t, mulberry32(seed))), `pick escaped the pool at seed ${seed}`)
  }
})

// A single interest's distributed pick must also come from its (blend-free) pool.
test('defaultSceneForInterests returns an on-theme pool scene for a single interest', () => {
  const pool = new Set(scenesForInterests({ interestIds: ['cooking'] }))
  assert.ok(pool.has('cozy-kitchen'))
  for (let seed = 0; seed < 50; seed += 1) {
    assert.ok(pool.has(defaultSceneForInterests({ interestIds: ['cooking'] }, mulberry32(seed))))
  }
})

// Deterministic for a fixed seed, so a seeded pick is reproducible (mirrors the variant-seed rule).
test('defaultSceneForInterests is deterministic for a fixed seed', () => {
  const cases: Array<Pick<StoryTheme, 'interestIds' | 'freeformInterest'>> = [
    { interestIds: ['fashion'] },
    { interestIds: ['space'] },
    { interestIds: ['fantasy', 'cooking'], freeformInterest: 'dragon, bakery' },
  ]
  for (const t of cases) {
    for (const seed of [0, 1, 7, 42, 4242]) {
      assert.equal(defaultSceneForInterests(t, mulberry32(seed)), defaultSceneForInterests(t, mulberry32(seed)))
    }
  }
})

test('defaultSceneForInterests falls back to the neutral default for empty interests', () => {
  assert.equal(defaultSceneForInterests({ interestIds: [] }), 'rolling-hills')
})

test('defaultSceneForInterests always returns a valid catalog SceneId', () => {
  const cases: Array<Pick<StoryTheme, 'interestIds' | 'freeformInterest'>> = [
    { interestIds: [] },
    { interestIds: ['space'] },
    { interestIds: ['pirates'] },
    { interestIds: ['fantasy', 'cooking'], freeformInterest: 'dragon, bakery' },
    { interestIds: ['animals'], freeformInterest: 'zzzzz nonsense words' },
  ]
  for (const t of cases) {
    assert.ok(isSceneId(defaultSceneForInterests(t)), `not a SceneId for ${JSON.stringify(t)}`)
  }
})

test('parseSceneId extracts a known id from noisy model output', () => {
  assert.equal(parseSceneId('outer-space'), 'outer-space')
  assert.equal(parseSceneId('  "Outer-Space"  '), 'outer-space')
  assert.equal(parseSceneId('```\nforest-clearing\n```'), 'forest-clearing')
  assert.equal(parseSceneId('crystal-cavern\nbecause it is a cave of crystals'), 'crystal-cavern')
})

test('parseSceneId returns null for the no-match sentinel, unknowns, and empties', () => {
  assert.equal(parseSceneId('none'), null)
  assert.equal(parseSceneId('NONE'), null)
  assert.equal(parseSceneId('a-made-up-place'), null)
  assert.equal(parseSceneId(''), null)
  assert.equal(parseSceneId(null), null)
  assert.equal(parseSceneId(undefined), null)
})

// --- appendSegment carries the scene ---------------------------------------------------------

test('appendSegment stores a sceneId when given and omits the key when absent', () => {
  const base = createInitialSession(theme(), 'user-1', ISO, 'story-1')

  const withScene = appendSegment(base, { text: 'Into the cavern.', sceneId: 'crystal-cavern', now: ISO })
  assert.equal(withScene.segments[0].sceneId, 'crystal-cavern')

  const withoutScene = appendSegment(base, { text: 'A quiet road.', now: ISO })
  // The key must be OMITTED (not undefined) so the Firestore payload stays valid.
  assert.equal('sceneId' in withoutScene.segments[0], false)
})

// --- Persistence round-trip -----------------------------------------------------------------

test('normalizeStorySession keeps a known sceneId and drops unknown/absent ones', () => {
  const raw = {
    id: 'story-1',
    userId: 'user-1',
    theme: theme(),
    status: 'active',
    questionsSolvedTotal: 0,
    questionsSinceCheckpoint: 0,
    history: [],
    historyIndex: 0,
    servedStepIds: [],
    segments: [
      { index: 0, text: 'Known scene.', sceneId: 'castle-hall', createdAt: ISO },
      { index: 1, text: 'Bogus scene.', sceneId: 'not-a-real-scene', createdAt: ISO },
      { index: 2, text: 'No scene.', createdAt: ISO },
    ],
    narrativeSummary: '',
    createdAt: ISO,
    updatedAt: ISO,
    schemaVersion: 2,
  }

  const normalized = normalizeStorySession(raw) as StorySession
  assert.equal(normalized.segments.length, 3)
  assert.equal(normalized.segments[0].sceneId, 'castle-hall')
  assert.equal('sceneId' in normalized.segments[1], false)
  assert.equal('sceneId' in normalized.segments[2], false)
})
