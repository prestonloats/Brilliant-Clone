// DRIFT GUARD for the two standalone production proxies that spend the billable OpenAI key:
//   - functions/index.js  (Firebase Cloud Function, serves /api/story via the Hosting rewrite)
//   - worker/worker.js     (Cloudflare Worker, the free no-Blaze equivalent)
//
// Both are separate deploy bundles that CANNOT import the app's TypeScript, so each keeps an INLINE
// copy of the security-critical denial-of-wallet controls defined in src/story/openAiProxyProtocol.ts
// (output-token cap, prompt/input/body size caps, the model allow-list, the moderation model, and the
// reasoning-model detection). The canonical contract is unit-tested in openai-proxy-protocol.test.ts,
// but nothing catches an inline copy DRIFTING out of sync — e.g. someone tightening maxOutputTokens in
// the protocol while a deployed proxy keeps forwarding a costly 8k-token request, or adding a custom
// origin to one deployment but not the other. This test reads each proxy's source and asserts its
// guards still match the canonical, tested values so the two copies can never silently diverge.

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

// npm test runs from the repo root, so the proxy bundles resolve relative to cwd. readFileSync throws
// a clear ENOENT if a proxy is ever moved/renamed — which is itself a signal worth failing on.
const readProxy = (relPath: string): string => {
  const source = readFileSync(join(process.cwd(), relPath), 'utf8')
  assert.ok(source.trim().length > 0, `${relPath} is empty`)
  return source
}

const FUNCTION_SOURCE = readProxy('functions/index.js')
const WORKER_SOURCE = readProxy('worker/worker.js')

// Read a `const NAME = <number>` literal, tolerating digit separators (e.g. 1_000_000).
const numConst = (source: string, name: string): number => {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*([0-9_]+)\\b`))
  assert.ok(match, `could not find numeric constant ${name}`)
  return Number(match[1].replace(/_/g, ''))
}

// Read a `const NAME = '...'` single/double-quoted string literal.
const stringConst = (source: string, name: string): string => {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*['"]([^'"]+)['"]`))
  assert.ok(match, `could not find string constant ${name}`)
  return match[1]
}

// Read the quoted entries of a `const NAME = [ ... ]` array (or `new Set([ ... ])`) literal.
const stringList = (source: string, openerPattern: string): string[] => {
  const match = source.match(new RegExp(`${openerPattern}\\s*\\[([^\\]]*)\\]`))
  assert.ok(match, `could not find list for /${openerPattern}/`)
  return (match[1].match(/['"][^'"]+['"]/g) ?? []).map((quoted) => quoted.slice(1, -1))
}

// Rebuild the inline `isReasoningModel` regex literal so we can check it classifies models identically
// to the canonical helper (more robust than a textual match: equivalent patterns still pass).
const reasoningRegex = (source: string): RegExp => {
  const match = source.match(/isReasoningModel\s*=\s*\(model\)\s*=>\s*\/(.+?)\/([a-z]*)\.test\(model\)/)
  assert.ok(match, 'could not find isReasoningModel regex literal')
  return new RegExp(match[1], match[2])
}

type Proxy = {
  name: string
  source: string
  // Only the Worker enforces a request body-size cap (MAX_BODY_BYTES); the Firebase Function relies on
  // the platform's own body parsing, so it has no such inline constant.
  hasBodyCap: boolean
}

const PROXIES: Proxy[] = [
  { name: 'functions/index.js (Firebase Cloud Function)', source: FUNCTION_SOURCE, hasBodyCap: false },
  { name: 'worker/worker.js (Cloudflare Worker)', source: WORKER_SOURCE, hasBodyCap: true },
]

for (const proxy of PROXIES) {
  test(`${proxy.name}: token + size caps mirror PROXY_LIMITS`, () => {
    assert.equal(numConst(proxy.source, 'MAX_OUTPUT_TOKENS'), PROXY_LIMITS.maxOutputTokens)
    assert.equal(numConst(proxy.source, 'MAX_SYSTEM_CHARS'), PROXY_LIMITS.maxSystemChars)
    assert.equal(numConst(proxy.source, 'MAX_PROMPT_CHARS'), PROXY_LIMITS.maxPromptChars)
    assert.equal(numConst(proxy.source, 'MAX_INPUT_CHARS'), PROXY_LIMITS.maxInputChars)
    if (proxy.hasBodyCap) {
      assert.equal(numConst(proxy.source, 'MAX_BODY_BYTES'), PROXY_LIMITS.maxBodyBytes)
    }
  })

  test(`${proxy.name}: default model allow-list mirrors defaultAllowedStoryModels()`, () => {
    assert.deepEqual(stringList(proxy.source, 'DEFAULT_ALLOWED_MODELS\\s*='), defaultAllowedStoryModels())
  })

  test(`${proxy.name}: moderation model mirrors OPENAI_MODERATION_MODEL`, () => {
    assert.equal(stringConst(proxy.source, 'OPENAI_MODERATION_MODEL'), OPENAI_MODERATION_MODEL)
  })

  test(`${proxy.name}: isReasoningModel classifies models the same as the canonical helper`, () => {
    const inlineRegex = reasoningRegex(proxy.source)
    for (const model of ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5', 'o3', 'o4-mini', 'gpt-4o-mini', 'gpt-4.1', 'claude-3']) {
      assert.equal(inlineRegex.test(model), isReasoningModel(model), `reasoning mismatch for "${model}"`)
    }
  })

  test(`${proxy.name}: the abuse-guard logic that enforces the caps is still present`, () => {
    // A matching constant is worthless if the code that applies it was removed, so canary the guards:
    // the token clamp, the model allow-list membership check, and the reject paths for both.
    assert.match(proxy.source, /Math\.min\([\s\S]*?Math\.max\(/, 'output-token clamp (Math.min/Math.max) missing')
    assert.match(proxy.source, /\.includes\(/, 'model allow-list membership check missing')
    assert.match(proxy.source, /model not allowed/, 'model-not-allowed rejection missing')
    assert.match(proxy.source, /is too large/, 'oversized prompt/input rejection missing')
  })
}

// The two deployment targets must agree on which browser origins may spend the key — a custom domain
// added to one but not the other would silently 403 (or expose) the wrong surface.
test('both proxies share the same prod origin allow-list and localhost dev rule', () => {
  const functionOrigins = stringList(FUNCTION_SOURCE, 'ALLOWED_ORIGINS\\s*=\\s*new Set\\(').sort()
  const workerOrigins = stringList(WORKER_SOURCE, 'ALLOWED_ORIGINS\\s*=\\s*new Set\\(').sort()

  assert.deepEqual(workerOrigins, functionOrigins, 'worker and function prod origin allow-lists differ')
  assert.ok(
    functionOrigins.includes('https://starting-project-e6700.web.app'),
    'the Firebase Hosting prod origin must stay allow-listed',
  )

  // Both must keep the any-port localhost/127.0.0.1 dev-origin rule (Vite hops ports when one is busy).
  const localhostRule = String.raw`/^http:\/\/(localhost|127\.0\.0\.1)`
  assert.ok(FUNCTION_SOURCE.includes(localhostRule), 'function missing the localhost dev-origin rule')
  assert.ok(WORKER_SOURCE.includes(localhostRule), 'worker missing the localhost dev-origin rule')
})
