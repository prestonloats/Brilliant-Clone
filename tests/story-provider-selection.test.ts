// Guards env-based Story Mode provider selection (the PURE core that `createStoryAI` switches on).
//
// The user removed Gemini and set OPENAI_API_KEY, so the direct OpenAI developer provider must be
// chosen from that key — while an EXPLICIT proxy/firebase override still wins (so a deliberate secure
// setup is never silently downgraded) and a legacy Gemini key remains a last resort. We test the pure
// `selectStoryProvider` (which `createStoryAI` delegates to), so these assertions never import or
// construct an SDK, never touch the network, and never pull the adapter/firebase modules into the
// type graph.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { selectStoryProvider, type StoryAiEnv } from '../src/story/selectStoryProvider'

// Shaped like real keys (the selector only checks presence/non-blank, never validates the format).
const OPENAI_KEY = 'sk-proj-' + 'A1b2C3d4'.repeat(6)
const GEMINI_KEY = 'AIzaSy' + 'b'.repeat(33)

// --- the user's scenario: OPENAI_API_KEY present -> direct OpenAI ----------------------------

test('OPENAI_API_KEY selects the direct OpenAI developer provider', () => {
  assert.equal(selectStoryProvider({ OPENAI_API_KEY: OPENAI_KEY }), 'openai')
})

test('VITE_OPENAI_API_KEY is accepted as a fallback name', () => {
  assert.equal(selectStoryProvider({ VITE_OPENAI_API_KEY: OPENAI_KEY }), 'openai')
})

test('OpenAI is preferred over a legacy Gemini key', () => {
  assert.equal(selectStoryProvider({ OPENAI_API_KEY: OPENAI_KEY, VITE_GEMINI_API_KEY: GEMINI_KEY }), 'openai')
})

// --- explicit overrides win (keep deliberate secure setups intact) --------------------------

test('an explicit proxy/firebase provider wins over a present OpenAI key', () => {
  const env: StoryAiEnv = { VITE_STORY_AI_PROVIDER: 'proxy', OPENAI_API_KEY: OPENAI_KEY }
  assert.equal(selectStoryProvider(env), 'proxy')
  assert.equal(selectStoryProvider({ ...env, VITE_STORY_AI_PROVIDER: 'firebase' }), 'firebase')
})

// --- fallbacks + "absent" handling ----------------------------------------------------------

test('falls back to a legacy Gemini key only when no OpenAI key is set', () => {
  assert.equal(selectStoryProvider({ VITE_GEMINI_API_KEY: GEMINI_KEY }), 'gemini')
})

test('a blank OpenAI key counts as absent', () => {
  assert.equal(selectStoryProvider({ OPENAI_API_KEY: '   ' }), null)
  assert.equal(selectStoryProvider({ OPENAI_API_KEY: '', VITE_OPENAI_API_KEY: '' }), null)
})

test('nothing configured -> null (createStoryAI then returns null and the entry shows the hint)', () => {
  assert.equal(selectStoryProvider({}), null)
  assert.equal(selectStoryProvider({ OPENAI_API_KEY: '', VITE_GEMINI_API_KEY: '' }), null)
})
