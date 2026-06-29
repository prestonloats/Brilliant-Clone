// DRIFT GUARD for worker/worker.js — the Cloudflare Worker is now the ONLY standalone production
// proxy that spends the billable OpenAI key (the Firebase Cloud Function mirror was removed). It is a
// self-contained deploy bundle that CANNOT import the app's TypeScript, so it keeps an INLINE copy of
// the security-critical denial-of-wallet controls defined in src/story/openAiProxyProtocol.ts: the
// output-token cap, the prompt / input / body size caps, the model allow-list, the moderation model,
// and the reasoning-model detection.
//
// The canonical contract is unit-tested in openai-proxy-protocol.test.ts, but nothing catches the
// worker's inline copy DRIFTING out of sync — e.g. someone tightening maxOutputTokens in the protocol
// while the deployed worker keeps forwarding a costly 8k-token request, swapping the pinned models in
// one place but not the other, or deleting an abuse guard while leaving its now-dead constant behind.
// This test reads the worker source and asserts (a) its constants still equal the canonical, tested
// values and (b) the code that ENFORCES them — including the worker-only rate limit + body-size cap +
// fail-closed moderation — is still present, so the inline mirror can never silently diverge.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  OPENAI_MODERATION_MODEL,
  PROXY_LIMITS,
  defaultAllowedStoryModels,
  isReasoningModel,
} from '../src/story/openAiProxyProtocol'

// npm test runs from the repo root, so the worker bundle resolves relative to cwd. readFileSync throws
// a clear ENOENT if the worker is ever moved/renamed — itself a signal worth failing on.
const WORKER_PATH = 'worker/worker.js'
const WORKER_SOURCE = (() => {
  const source = readFileSync(join(process.cwd(), WORKER_PATH), 'utf8')
  assert.ok(source.trim().length > 0, `${WORKER_PATH} is empty`)
  return source
})()

// Read a `const NAME = <number>` literal, tolerating digit separators (e.g. 1_000_000).
const numConst = (name: string): number => {
  const match = WORKER_SOURCE.match(new RegExp(`\\b${name}\\s*=\\s*([0-9_]+)\\b`))
  assert.ok(match, `could not find numeric constant ${name}`)
  return Number(match[1].replace(/_/g, ''))
}

// Read a `const NAME = '...'` single/double-quoted string literal.
const stringConst = (name: string): string => {
  const match = WORKER_SOURCE.match(new RegExp(`\\b${name}\\s*=\\s*['"]([^'"]+)['"]`))
  assert.ok(match, `could not find string constant ${name}`)
  return match[1]
}

// Read the quoted entries of a `const NAME = [ ... ]` (or `new Set([ ... ])`) literal.
const stringList = (openerPattern: string): string[] => {
  const match = WORKER_SOURCE.match(new RegExp(`${openerPattern}\\s*\\[([^\\]]*)\\]`))
  assert.ok(match, `could not find list for /${openerPattern}/`)
  return (match[1].match(/['"][^'"]+['"]/g) ?? []).map((quoted) => quoted.slice(1, -1))
}

// Rebuild the inline `isReasoningModel` regex literal so we can check it classifies models IDENTICALLY
// to the canonical helper (more robust than a textual match: an equivalent rewrite still passes).
const reasoningRegex = (): RegExp => {
  const match = WORKER_SOURCE.match(/isReasoningModel\s*=\s*\(model\)\s*=>\s*\/(.+?)\/([a-z]*)\.test\(model\)/)
  assert.ok(match, 'could not find isReasoningModel regex literal')
  return new RegExp(match[1], match[2])
}

// --- constants mirror the canonical PROXY_LIMITS / models / moderation model ------------------

test('worker token + size caps mirror PROXY_LIMITS (incl. the worker-only body cap)', () => {
  assert.equal(numConst('MAX_OUTPUT_TOKENS'), PROXY_LIMITS.maxOutputTokens)
  assert.equal(numConst('MAX_SYSTEM_CHARS'), PROXY_LIMITS.maxSystemChars)
  assert.equal(numConst('MAX_PROMPT_CHARS'), PROXY_LIMITS.maxPromptChars)
  assert.equal(numConst('MAX_INPUT_CHARS'), PROXY_LIMITS.maxInputChars)
  assert.equal(numConst('MAX_BODY_BYTES'), PROXY_LIMITS.maxBodyBytes)
})

test('worker default model allow-list mirrors defaultAllowedStoryModels()', () => {
  assert.deepEqual(stringList('DEFAULT_ALLOWED_MODELS\\s*='), defaultAllowedStoryModels())
})

test('worker moderation model mirrors OPENAI_MODERATION_MODEL', () => {
  assert.equal(stringConst('OPENAI_MODERATION_MODEL'), OPENAI_MODERATION_MODEL)
})

test('worker isReasoningModel classifies models the same as the canonical helper', () => {
  const inlineRegex = reasoningRegex()
  for (const model of ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5', 'o3', 'o4-mini', 'gpt-4o-mini', 'gpt-4.1', 'claude-3']) {
    assert.equal(inlineRegex.test(model), isReasoningModel(model), `reasoning mismatch for "${model}"`)
  }
})

// --- the abuse-guard CODE that applies those caps is still wired up ---------------------------

test('worker still clamps output tokens and enforces the model allow-list', () => {
  // A matching constant is worthless if the code that applies it was removed, so canary the guards:
  assert.match(WORKER_SOURCE, /Math\.min\([\s\S]*?Math\.max\(/, 'output-token clamp (Math.min/Math.max) missing')
  assert.match(WORKER_SOURCE, /models\.includes\(/, 'model allow-list membership check missing')
  assert.match(WORKER_SOURCE, /model not allowed/, 'model-not-allowed rejection missing')
  assert.match(WORKER_SOURCE, /is too large/, 'oversized prompt/input rejection missing')
})

test('worker enforces its per-IP rate limit (the primary denial-of-wallet control)', () => {
  // Origin is spoofable, so the rate limit is the real cost ceiling. Canary the binding + the 429.
  assert.match(WORKER_SOURCE, /STORY_RATE_LIMITER[\s\S]*?\.limit\(/, 'rate-limiter binding call missing')
  assert.match(WORKER_SOURCE, /\brate limited\b/, '429 rate-limited rejection missing')
})

test('worker rejects oversized bodies up front using MAX_BODY_BYTES', () => {
  // Both the Content-Length pre-check and the post-read length check must compare against the cap.
  assert.match(WORKER_SOURCE, />\s*MAX_BODY_BYTES/, 'body-size comparison against MAX_BODY_BYTES missing')
  assert.match(WORKER_SOURCE, /body too large/i, 'oversized-body (413) rejection missing')
})

test('worker fails CLOSED on a moderation error (treats the input as flagged)', () => {
  // If the moderation call itself errors we cannot vouch for the input, so it must report flagged so
  // the adapter drops the untrusted choice rather than letting unmoderated text through.
  assert.match(WORKER_SOURCE, /flagged:\s*true/, 'fail-closed moderation (flagged:true) missing')
})

test('worker keeps the method guard and forbidden-origin rejection', () => {
  assert.match(WORKER_SOURCE, /method not allowed/, 'non-POST 405 guard missing')
  assert.match(WORKER_SOURCE, /forbidden origin/, '403 forbidden-origin guard missing')
})

// --- origin allow-list: prod domains + the any-port localhost dev rule ------------------------

test('worker allow-lists the prod Firebase Hosting origins and the any-port localhost dev rule', () => {
  const origins = stringList('ALLOWED_ORIGINS\\s*=\\s*new Set\\(')
  assert.ok(
    origins.includes('https://starting-project-e6700.web.app'),
    'the Firebase Hosting prod origin must stay allow-listed',
  )
  assert.ok(
    origins.includes('https://starting-project-e6700.firebaseapp.com'),
    'the firebaseapp.com prod origin must stay allow-listed',
  )
  // Vite hops ports when one is busy, so the dev rule must accept ANY localhost/127.0.0.1 port.
  assert.match(
    WORKER_SOURCE,
    /\/\^http:\\\/\\\/\(localhost\|127\\\.0\\\.0\\\.1\)/,
    'the any-port localhost/127.0.0.1 dev-origin rule is missing or changed',
  )
})
