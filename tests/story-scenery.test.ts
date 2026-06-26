import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend'
import type { SceneId, StorySession, StoryTheme } from '../src/domain'
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
  assert.equal(scenerySrc('outer-space'), '/scenery/outer-space.png')
  for (const id of SCENE_IDS) assert.equal(scenerySrc(id), `/scenery/${id}.png`)
})

// Guards against the silent breakage that started this whole feature: a catalog id with no asset
// (broken <img>) or an orphan PNG no code can ever select.
test('the catalog and the public/scenery assets match one-to-one', () => {
  const dir = join(process.cwd(), 'public', 'scenery')
  for (const id of SCENE_IDS) {
    assert.ok(existsSync(join(dir, `${id}.png`)), `missing asset for catalog id ${id}`)
  }
  const assetIds = readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .map((name) => name.slice(0, -'.png'.length))
  const catalogIds = new Set<string>(SCENE_IDS)
  for (const assetId of assetIds) {
    assert.ok(catalogIds.has(assetId), `orphan asset with no catalog entry: ${assetId}.png`)
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

// --- defaultSceneForInterests (interest-SET aware + combo preferring) ------------------------

// The OFFLINE backstop must score scenes by how many interest TERMS they reflect, so a combo that
// matches 2+ interests (dragon + bakery) beats a single-interest scene (a plain bakery) and never
// collapses to the first-recognized-preset default.
test('defaultSceneForInterests prefers a combo scene that reflects MORE of the interest set', () => {
  const chosen = defaultSceneForInterests(
    theme({ interestIds: ['fantasy', 'cooking'], freeformInterest: 'dragon, bakery' }),
  )
  assert.equal(chosen, 'dragon-bakery')
  // It must NOT just return the first-preset default (enchanted-forest for fantasy).
  assert.notEqual(chosen, 'enchanted-forest')
})

test('defaultSceneForInterests returns a sensible scene for a single interest', () => {
  assert.equal(defaultSceneForInterests({ interestIds: ['cooking'] }), 'cozy-kitchen')
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
