import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ChapterPerformance, PerformanceBand, StoryTheme } from '../src/domain'
import {
  buildContinuePrompt,
  buildSegmentPrompt,
  buildStoryBiblePrompt,
  storyFallbackBeat,
} from '../src/story/storyPrompts'

// The performance-driven consequence layer: how a chapter's first-try band is injected into the
// bridge/outcome/plan prompts, and the band-aware OFFLINE fallback beats. Pure, no network.

const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['space'],
  premise: 'A lone navigator charts a living nebula.',
  protagonist: 'Captain Vega',
  ...over,
})

const perf = (band: PerformanceBand): ChapterPerformance => ({
  band,
  firstTryCorrect: band === 'flawless' ? 5 : 1,
  answered: 5,
})

const BANDS: PerformanceBand[] = ['flawless', 'strong', 'mixed', 'struggled']
const BAND_PHRASE: Record<PerformanceBand, RegExp> = {
  flawless: /FLAWLESSLY/,
  strong: /did WELL/,
  mixed: /MIXED result/,
  struggled: /STRUGGLED/,
}

test('buildSegmentPrompt injects the per-band consequence direction (and omits it when absent)', () => {
  for (const band of BANDS) {
    const prompt = buildSegmentPrompt({ theme: theme(), recentNarrative: 'so far', questionsSolved: 5, performance: perf(band) })
    assert.match(prompt, BAND_PHRASE[band])
    assert.match(prompt, /CONSEQUENCE OF THE READER'S EFFORT/)
  }
  const none = buildSegmentPrompt({ theme: theme(), recentNarrative: 'so far', questionsSolved: 5 })
  assert.doesNotMatch(none, /CONSEQUENCE OF THE READER'S EFFORT/)
})

test('buildContinuePrompt injects the per-band consequence direction (and omits it when absent)', () => {
  const prompt = buildContinuePrompt({ theme: theme(), recentNarrative: 'so far', userChoice: 'open the hatch', performance: perf('struggled') })
  assert.match(prompt, /STRUGGLED/)
  assert.match(prompt, /SETBACK/)
  const none = buildContinuePrompt({ theme: theme(), recentNarrative: 'so far', userChoice: 'open the hatch' })
  assert.doesNotMatch(none, /CONSEQUENCE OF THE READER'S EFFORT/)
})

test('buildStoryBiblePrompt (revise) injects the per-band direction so the plan branches its tone', () => {
  const prompt = buildStoryBiblePrompt({
    theme: theme(),
    currentBible: 'PLAN: the existing plan',
    recentNarrative: 'so far',
    userChoice: 'open the hatch',
    performance: perf('flawless'),
  })
  assert.match(prompt, /FLAWLESSLY/)
})

test('the consequence direction never tells the model to surface math/scores to the reader', () => {
  const prompt = buildSegmentPrompt({ theme: theme(), recentNarrative: 'x', questionsSolved: 5, performance: perf('struggled') })
  assert.match(prompt, /do NOT mention math, scores/)
})

// --- band-aware OFFLINE fallback beats -------------------------------------------------------

test('storyFallbackBeat reflects the band for post-chapter kinds (differs from neutral and by band)', () => {
  const t = theme({ protagonist: 'the Pilot' })
  for (const kind of ['bridge', 'outcome'] as const) {
    const neutral = storyFallbackBeat(kind, t, 0)
    const flawless = storyFallbackBeat(kind, t, 0, 'flawless')
    const struggled = storyFallbackBeat(kind, t, 0, 'struggled')
    assert.notEqual(flawless, neutral)
    assert.notEqual(flawless, struggled)
    // theme-aware (weaves the hero name) and reads like a real ~2-paragraph beat
    assert.match(flawless, /the Pilot/i)
    assert.equal(flawless.split(/\n{2,}/).filter((p) => p.trim().length > 0).length, 2)
    // each band+kind offers >1 variant so consecutive same-band fallbacks can differ (anti-repeat)
    assert.notEqual(storyFallbackBeat(kind, t, 0, 'struggled'), storyFallbackBeat(kind, t, 1, 'struggled'))
  }
})

test('storyFallbackBeat ignores band for the opening kind and stays back-compatible', () => {
  const t = theme({ protagonist: 'the Pilot' })
  // 'opening' has no prior performance, so a band is ignored -> identical to the neutral opening.
  assert.equal(storyFallbackBeat('opening', t, 0, 'flawless'), storyFallbackBeat('opening', t, 0))
})
