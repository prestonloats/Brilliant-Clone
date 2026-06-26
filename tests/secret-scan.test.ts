// Guards the build-time secret scanner (src/secretScan.ts): an OpenAI/Anthropic `sk-...` secret must
// never be allowed into a VITE_* var (which Vite inlines into the public client bundle), while the
// app's intentional free, restricted Gemini client key (AIza.../AQ.) path stays allowed.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findClientSecretLeaks, formatSecretLeakError, looksLikeProviderSecret } from '../src/secretScan'

// --- looksLikeProviderSecret -------------------------------------------------

test('looksLikeProviderSecret flags OpenAI/Anthropic-style sk- secret keys', () => {
  assert.equal(looksLikeProviderSecret('sk-' + 'a'.repeat(48)), true) // legacy
  assert.equal(looksLikeProviderSecret('sk-proj-' + 'A1b2C3d4'.repeat(6)), true) // project
  assert.equal(looksLikeProviderSecret('sk-svcacct-' + 'x'.repeat(40)), true) // service account
  assert.equal(looksLikeProviderSecret('sk-ant-' + 'y'.repeat(40)), true) // Anthropic
  assert.equal(looksLikeProviderSecret('  sk-' + 'z'.repeat(48) + '  '), true) // tolerates surrounding whitespace
})

test('looksLikeProviderSecret ignores Gemini client keys, blanks, and short tokens', () => {
  // Gemini keys are intentionally allowed client-side (free, restricted local-dev path).
  assert.equal(looksLikeProviderSecret('AIzaSyA' + 'b'.repeat(32)), false)
  assert.equal(looksLikeProviderSecret('AQ.Ab8' + 'c'.repeat(40)), false)
  assert.equal(looksLikeProviderSecret(''), false)
  assert.equal(looksLikeProviderSecret('   '), false)
  assert.equal(looksLikeProviderSecret('local'), false)
  assert.equal(looksLikeProviderSecret('sk-test'), false) // too short to be a real key
  assert.equal(looksLikeProviderSecret(undefined), false)
  assert.equal(looksLikeProviderSecret(12345), false)
  // An incidental "sk-" substring inside a longer non-key value must not trip the anchored match.
  assert.equal(looksLikeProviderSecret('https://api.example.com/v1/sk-' + 'q'.repeat(40)), false)
})

// --- findClientSecretLeaks ---------------------------------------------------

test('findClientSecretLeaks flags only VITE_-exposed vars holding a secret', () => {
  const leaks = findClientSecretLeaks({
    VITE_BACKEND_PROVIDER: 'local',
    VITE_GEMINI_API_KEY: 'AIzaSyA' + 'b'.repeat(32), // allowed Gemini client key
    VITE_OPENAI_API_KEY: 'sk-proj-' + 'Z'.repeat(40), // LEAK: bundled secret
    OPENAI_API_KEY: 'sk-' + 'q'.repeat(48), // server-only, never bundled -> not a leak
  })
  assert.deepEqual(leaks, ['VITE_OPENAI_API_KEY'])
})

test('findClientSecretLeaks catches an OpenAI key pasted into the existing Gemini var', () => {
  const leaks = findClientSecretLeaks({ VITE_GEMINI_API_KEY: 'sk-' + 'k'.repeat(48) })
  assert.deepEqual(leaks, ['VITE_GEMINI_API_KEY'])
})

test('findClientSecretLeaks returns nothing for a clean client env', () => {
  assert.deepEqual(
    findClientSecretLeaks({ VITE_BACKEND_PROVIDER: 'local', VITE_GEMINI_API_KEY: '', VITE_STORY_AI_PROXY_URL: '/api/story' }),
    [],
  )
})

test('findClientSecretLeaks reports multiple offenders sorted', () => {
  const leaks = findClientSecretLeaks({
    VITE_OPENAI_API_KEY: 'sk-' + '1'.repeat(48),
    VITE_ALT_KEY: 'sk-ant-' + '2'.repeat(40),
  })
  assert.deepEqual(leaks, ['VITE_ALT_KEY', 'VITE_OPENAI_API_KEY'])
})

// --- formatSecretLeakError ---------------------------------------------------

test('formatSecretLeakError names the offending keys and points to the proxy fix', () => {
  const msg = formatSecretLeakError(['VITE_OPENAI_API_KEY'])
  assert.match(msg, /VITE_OPENAI_API_KEY/)
  assert.match(msg, /client bundle/i)
  assert.match(msg, /proxy/i)
  assert.match(msg, /looks like/i) // singular for one key
})

test('formatSecretLeakError pluralizes for multiple keys', () => {
  const msg = formatSecretLeakError(['VITE_A', 'VITE_B'])
  assert.match(msg, /VITE_A, VITE_B look like/)
})
