import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryTheme } from '../src/content/storyTypes'
import { getSceneDescription, getSceneLabel } from '../src/story/scenery'
import { describeSceneSetting, themeWithSceneSetting } from '../src/story/scenePremise'

// A minimal theme; the helpers only read `freeformInterest`, so the rest is filler.
const baseTheme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: [],
  premise: '',
  protagonist: '',
  ...over,
})

// --- describeSceneSetting -------------------------------------------------------------------

test('describeSceneSetting contains the scene label AND description for a sample scene', () => {
  const sceneId: SceneId = 'pirate-cove'
  const phrase = describeSceneSetting(sceneId)
  assert.ok(phrase.includes(getSceneLabel(sceneId)), 'should include the scene label text')
  assert.ok(phrase.includes(getSceneDescription(sceneId)), 'should include the scene description text')
})

test('describeSceneSetting carries the label + description across several scenes', () => {
  for (const sceneId of ['lunar-base', 'cozy-kitchen', 'fashion-runway'] as SceneId[]) {
    const phrase = describeSceneSetting(sceneId)
    assert.ok(phrase.includes(getSceneLabel(sceneId)), `missing label for ${sceneId}`)
    assert.ok(phrase.includes(getSceneDescription(sceneId)), `missing description for ${sceneId}`)
  }
})

test('describeSceneSetting returns an empty string for an unknown scene id (defensive)', () => {
  assert.equal(describeSceneSetting('not-a-real-scene' as SceneId), '')
})

// --- themeWithSceneSetting ------------------------------------------------------------------

// rule 6 (custom-only): a theme that already carries the learner's typed custom interest text must
// KEEP that text verbatim AND fold in the chosen scene's setting.
test('themeWithSceneSetting preserves existing custom freeform text and adds the setting', () => {
  const sceneId: SceneId = 'pirate-cove'
  const custom = 'dragons and dungeons'
  const next = themeWithSceneSetting(baseTheme({ freeformInterest: custom }), sceneId)
  const freeform = next.freeformInterest ?? ''
  assert.ok(freeform.includes(custom), 'must preserve the original custom text')
  assert.ok(freeform.includes(getSceneLabel(sceneId)), 'must incorporate the scene setting (label)')
  assert.ok(freeform.includes(getSceneDescription(sceneId)), 'must incorporate the scene setting (description)')
})

// no custom text (rule 4 — story built purely from the chosen scene): the setting becomes the seed.
test('themeWithSceneSetting sets the setting as the freeform seed when there is no custom text', () => {
  const sceneId: SceneId = 'lunar-base'
  const next = themeWithSceneSetting(baseTheme(), sceneId)
  assert.equal(next.freeformInterest, describeSceneSetting(sceneId))
})

test('themeWithSceneSetting treats blank/whitespace freeform as no custom text', () => {
  const sceneId: SceneId = 'cozy-kitchen'
  const next = themeWithSceneSetting(baseTheme({ freeformInterest: '   ' }), sceneId)
  assert.equal(next.freeformInterest, describeSceneSetting(sceneId))
})

// Purity: the input theme is never mutated, a fresh object is returned, and every other field is
// carried through unchanged (so the helper is safe to drop into the begin-adventure flow).
test('themeWithSceneSetting is pure and preserves the other theme fields', () => {
  const theme = baseTheme({
    interestIds: ['fantasy'],
    premise: 'p',
    protagonist: 'Rowan',
    freeformInterest: 'knights',
  })
  const snapshot = JSON.parse(JSON.stringify(theme)) as StoryTheme
  const next = themeWithSceneSetting(theme, 'pirate-cove')
  assert.deepEqual(theme, snapshot, 'input theme must not be mutated')
  assert.notEqual(next, theme, 'should return a new theme object')
  assert.deepEqual(next.interestIds, ['fantasy'])
  assert.equal(next.premise, 'p')
  assert.equal(next.protagonist, 'Rowan')
})

// A bad/unknown scene id must never wipe the learner's existing custom text.
test('themeWithSceneSetting leaves custom text untouched for an unknown scene id', () => {
  const next = themeWithSceneSetting(baseTheme({ freeformInterest: 'knights' }), 'not-a-real-scene' as SceneId)
  assert.equal(next.freeformInterest, 'knights')
})
