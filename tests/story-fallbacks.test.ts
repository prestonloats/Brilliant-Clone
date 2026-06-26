// Story Mode OFFLINE fallback proof (plan fixes #1, #3, #5) + transient-retry detection (#2).
//
// When the AI provider is unavailable or a generation fails/blocks, Story Mode now commits
// theme-aware, DISTINCT-per-beat fallbacks instead of one shared canned bridge, and falls back to an
// INTEREST-AWARE protagonist instead of a hardcoded "the Explorer". These tests pin that down purely
// (no network), plus the transient-error classifier that decides which failures get retried.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StoryTheme } from '../src/domain'
import {
  fallbackProtagonist,
  isQuotaError,
  isTransientError,
  storyFallbackBeat,
} from '../src/story/storyPrompts'

const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: [],
  premise: '',
  protagonist: '',
  ...over,
})

const BEAT_KINDS = ['opening', 'bridge', 'outcome'] as const

// --- interest-aware protagonist fallback (no more "the Explorer") ----------------------------

test('fallbackProtagonist maps the chosen interest to a fitting role, never "the Explorer"', () => {
  assert.equal(fallbackProtagonist(theme({ interestIds: ['sports'] })), 'the Captain')
  assert.equal(fallbackProtagonist(theme({ interestIds: ['cooking'] })), 'the Chef')
  assert.equal(fallbackProtagonist(theme({ interestIds: ['space'] })), 'the Pilot')
  assert.equal(fallbackProtagonist(theme({ interestIds: ['mystery'] })), 'the Detective')
  // The first recognized interest wins when several are chosen.
  assert.equal(fallbackProtagonist(theme({ interestIds: ['fashion', 'sports'] })), 'the Designer')
  // Generic but explicitly NOT the old "the Explorer" when there is no chosen interest.
  const generic = fallbackProtagonist(theme())
  assert.equal(generic, 'the Adventurer')
  assert.notEqual(generic, 'the Explorer')
})

// --- distinct, theme-aware beat fallbacks (no collision) -------------------------------------

test('opening, bridge, and outcome fallbacks are DISTINCT (a failed continuation never reprints the opening)', () => {
  const t = theme({ interestIds: ['sports'], protagonist: 'the Captain' })
  const opening = storyFallbackBeat('opening', t)
  const bridge = storyFallbackBeat('bridge', t)
  const outcome = storyFallbackBeat('outcome', t)
  assert.notEqual(opening, bridge)
  assert.notEqual(opening, outcome)
  assert.notEqual(bridge, outcome)
  // The exact byte-identical collision the old single CANNED_BRIDGE_SEGMENT caused must be impossible.
  assert.notEqual(opening.trim(), outcome.trim())
})

test('each beat kind offers more than one variant so consecutive fallbacks can differ', () => {
  const t = theme({ interestIds: ['fantasy'], protagonist: 'the Hero' })
  for (const kind of BEAT_KINDS) {
    assert.notEqual(storyFallbackBeat(kind, t, 0), storyFallbackBeat(kind, t, 1))
    // The variant index wraps, so any integer is valid and stable (deterministic).
    assert.equal(storyFallbackBeat(kind, t, 2), storyFallbackBeat(kind, t, 0))
    assert.equal(storyFallbackBeat(kind, t, -1), storyFallbackBeat(kind, t, 1))
  }
})

test('beat fallbacks are theme-aware: they weave in the protagonist (and interests for the opening)', () => {
  const t = theme({ interestIds: ['cooking'], protagonist: 'the Chef' })
  for (const kind of BEAT_KINDS) {
    assert.match(storyFallbackBeat(kind, t), /the Chef/i)
  }
  assert.match(storyFallbackBeat('opening', t), /cooking/i)
})

test('beat fallbacks use the interest-aware hero name when no protagonist is set yet', () => {
  // protagonist '' -> fallbackProtagonist(theme) = "the Captain" for sports.
  const t = theme({ interestIds: ['sports'] })
  for (const kind of BEAT_KINDS) {
    assert.match(storyFallbackBeat(kind, t), /the Captain/i)
  }
})

test('beat fallbacks read like real ~2-paragraph beats (not one-line stubs)', () => {
  const t = theme({ interestIds: ['space'], protagonist: 'the Pilot' })
  for (const kind of BEAT_KINDS) {
    const text = storyFallbackBeat(kind, t)
    const paragraphs = text.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0)
    assert.equal(paragraphs.length, 2, `${kind} should be two short paragraphs`)
    const sentences = text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0)
    assert.ok(sentences.length >= 4, `${kind} should have >= 4 sentences, got ${sentences.length}`)
  }
})

// --- transient-error detection (drives the session-start burst retry) ------------------------

test('isTransientError retries timeouts, 5xx, and network blips ON TOP OF quota errors', () => {
  // Timeouts (the withTimeout rejection shape) + 5xx/unavailable/overloaded + network blips.
  assert.equal(isTransientError(new Error('firebase-ai timed out after 15000ms')), true)
  assert.equal(isTransientError({ status: 503 }), true)
  assert.equal(isTransientError({ status: 500, message: 'internal error' }), true)
  assert.equal(isTransientError({ error: { status: 'UNAVAILABLE' } }), true)
  assert.equal(isTransientError(new Error('fetch failed')), true)
  assert.equal(isTransientError('The model is overloaded. Please try again later.'), true)
  // Quota is a subset of transient, so both classifiers agree on a 429.
  assert.equal(isTransientError({ status: 429 }), true)
  assert.equal(isQuotaError({ status: 429 }), true)
  // Deterministic client/safety errors are NOT retried (would just fail again).
  assert.equal(isTransientError({ status: 400, message: 'invalid argument' }), false)
  assert.equal(isTransientError(new Error('safety block')), false)
  assert.equal(isTransientError('bad request'), false)
  assert.equal(isTransientError(null), false)
})
