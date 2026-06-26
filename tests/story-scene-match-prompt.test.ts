// Tests for the closest-match scene picker prompt (rules 5 & 6): `buildSceneMatchPrompt` lists ONLY
// the candidate shortlist (each as id + description) plus the NO_SCENE sentinel, instructs the model
// to EMPHASIZE the custom (freeform) topics, and exposes a "not close enough" escape hatch whose
// sentinel parses back to null via the SAME parser the adapters use. Pure string/parse assertions —
// no network calls, mirroring the other story prompt tests.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SceneId, StoryTheme } from '../src/domain'
import { NO_SCENE, getSceneDescription } from '../src/story/scenery'
import { buildSceneMatchPrompt } from '../src/story/sceneMatchPrompt'
import { parseSceneId } from '../src/story/storyPrompts'

const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['fantasy', 'cooking'],
  freeformInterest: 'dragon, bakery',
  premise: 'A young baker tames a hungry dragon.',
  protagonist: 'Rowan',
  ...over,
})

const CANDIDATES: SceneId[] = ['dragon-bakery', 'cozy-kitchen', 'enchanted-forest']

// Scenes that are NOT candidates and share no substring with the candidates (or their
// descriptions). Used to prove the prompt is the candidate SHORTLIST, not the whole catalog — the
// key difference from `buildScenePrompt`, which lists every catalog id.
const NON_CANDIDATES: SceneId[] = ['fashion-runway', 'pirate-ship-deck', 'outer-space', 'safari-animals']

test('buildSceneMatchPrompt lists ONLY the given candidates (id + description) plus the none option', () => {
  const prompt = buildSceneMatchPrompt({ theme: theme(), candidates: CANDIDATES, emphasizeCustom: true })

  for (const id of CANDIDATES) {
    assert.ok(prompt.includes(id), `prompt missing candidate id ${id}`)
    assert.ok(prompt.includes(getSceneDescription(id)), `prompt missing description for candidate ${id}`)
  }
  assert.ok(prompt.includes(NO_SCENE), 'prompt should offer the none sentinel as an explicit option')

  for (const id of NON_CANDIDATES) {
    assert.ok(
      !prompt.includes(id),
      `prompt leaked non-candidate id ${id} — it must be a shortlist, not the full catalog`,
    )
  }
})

test('buildSceneMatchPrompt instructs the model to emphasize the custom topics', () => {
  const prompt = buildSceneMatchPrompt({ theme: theme(), candidates: CANDIDATES, emphasizeCustom: true })
  assert.ok(/custom/i.test(prompt), 'prompt should call out the custom topics')
  assert.ok(/emphasi[sz]e|most weight/i.test(prompt), 'prompt should instruct emphasis on the custom topics')
  assert.ok(prompt.toLowerCase().includes('dragon'), 'prompt should carry the custom topic text "dragon"')
})

test('buildSceneMatchPrompt drops the strong emphasis line when emphasizeCustom is false', () => {
  const prompt = buildSceneMatchPrompt({ theme: theme(), candidates: CANDIDATES, emphasizeCustom: false })
  assert.ok(!/EMPHASIZE THE CUSTOM TOPICS/.test(prompt), 'no strong custom-emphasis line when not asked')
  // The custom topics are still shown so the model can use them — they are just not over-weighted.
  assert.ok(/custom topics/i.test(prompt))
})

test('buildSceneMatchPrompt states the not-close-enough threshold; the sentinel parses to null', () => {
  const prompt = buildSceneMatchPrompt({ theme: theme(), candidates: CANDIDATES, emphasizeCustom: true })
  assert.ok(/close enough/i.test(prompt), 'prompt should state the not-close-enough threshold')
  assert.ok(prompt.includes(NO_SCENE))

  // The sentinel the prompt asks for maps back to null via the SAME parser the adapters use, so a
  // "nothing fits" answer becomes "no image" (null) for the caller.
  assert.equal(parseSceneId(NO_SCENE), null)
  assert.equal(parseSceneId('none'), null)
  assert.equal(parseSceneId('NONE'), null)
  // A genuine candidate id still parses through to itself (not swallowed by the threshold path).
  assert.equal(parseSceneId('dragon-bakery'), 'dragon-bakery')
})

test('buildSceneMatchPrompt handles a theme with no custom topics', () => {
  const prompt = buildSceneMatchPrompt({
    theme: theme({ interestIds: ['space'], freeformInterest: undefined }),
    candidates: ['outer-space', 'spaceship-bridge'],
    emphasizeCustom: true,
  })
  // With no custom text there is nothing to over-weight, so the strong emphasis line is omitted, but
  // the prompt still lists the candidates and the none option.
  assert.ok(!/EMPHASIZE THE CUSTOM TOPICS/.test(prompt))
  assert.ok(prompt.includes('outer-space'))
  assert.ok(prompt.includes('spaceship-bridge'))
  assert.ok(prompt.includes(NO_SCENE))
})
