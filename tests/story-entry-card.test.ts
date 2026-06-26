import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getStoryEntryState } from '../src/story/storyEntryState'

// `getStoryEntryState` maps (unlock gate, provider configured, active session) -> the entry
// card's UI state. The card is a pure render of this, so these cases pin the
// locked / needs-provider / ready precedence (and which CTA shows) without a DOM. The behavior
// must match the pre-refactor card: the unlock gate wins first; an active session can always
// resume (offline-safe) even with no provider; otherwise a brand-new adventure needs a provider.

test('stays locked until the unlock gate is met, regardless of provider/session', () => {
  for (const providerConfigured of [false, true]) {
    for (const hasActiveSession of [false, true]) {
      assert.deepEqual(
        getStoryEntryState({ unlocked: false, providerConfigured, hasActiveSession }),
        { status: 'locked', action: null },
      )
    }
  }
})

test('unlocked with no provider and no session -> needs-provider hint, no CTA', () => {
  assert.deepEqual(
    getStoryEntryState({ unlocked: true, providerConfigured: false, hasActiveSession: false }),
    { status: 'needs-provider', action: null },
  )
})

test('unlocked with a provider and no session -> ready to start a new adventure', () => {
  assert.deepEqual(
    getStoryEntryState({ unlocked: true, providerConfigured: true, hasActiveSession: false }),
    { status: 'ready', action: 'start' },
  )
})

test('unlocked with an active session -> ready to resume even without a provider', () => {
  // Resume is offline-safe for already-generated content, so it must never require a provider.
  assert.deepEqual(
    getStoryEntryState({ unlocked: true, providerConfigured: false, hasActiveSession: true }),
    { status: 'ready', action: 'resume' },
  )
  assert.deepEqual(
    getStoryEntryState({ unlocked: true, providerConfigured: true, hasActiveSession: true }),
    { status: 'ready', action: 'resume' },
  )
})
