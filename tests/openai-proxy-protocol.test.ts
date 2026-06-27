// Guards the PURE OpenAI proxy protocol (src/story/openAiProxyProtocol.ts): the request mapping and
// response parsing shared by the browser adapter and the dev proxy, tested without a network.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  OPENAI_MODERATION_MODEL,
  OPENAI_STORY_MODELS,
  PROXY_LIMITS,
  clampOutputTokens,
  extractCompletionText,
  extractModerationFlag,
  normalizeProxyRequest,
  toChatCompletionsBody,
  type ProxyGenerateRequest,
} from '../src/story/openAiProxyProtocol'

// --- model defaults ----------------------------------------------------------

test('OPENAI_STORY_MODELS pins the approved mini primary + nano fallback', () => {
  assert.equal(OPENAI_STORY_MODELS.primary, 'gpt-5.4-mini')
  assert.equal(OPENAI_STORY_MODELS.fallback, 'gpt-5.4-nano')
  assert.equal(OPENAI_MODERATION_MODEL, 'omni-moderation-latest')
})

// --- toChatCompletionsBody ---------------------------------------------------

const baseReq: ProxyGenerateRequest = { op: 'generate', model: 'gpt-5.4-mini', system: 'SYS', prompt: 'P' }

test('toChatCompletionsBody maps system+prompt to the two-message Chat Completions shape', () => {
  const body = toChatCompletionsBody(baseReq)
  assert.equal(body.model, 'gpt-5.4-mini')
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'P' },
  ])
})

test('toChatCompletionsBody requests a JSON object only when json is set', () => {
  assert.equal(toChatCompletionsBody(baseReq).response_format, undefined)
  assert.deepEqual(toChatCompletionsBody({ ...baseReq, json: true }).response_format, { type: 'json_object' })
})

test('toChatCompletionsBody uses max_completion_tokens (never the deprecated max_tokens) and omits temperature', () => {
  const body = toChatCompletionsBody({ ...baseReq, maxOutputTokens: 256 })
  assert.equal(body.max_completion_tokens, 256)
  assert.equal('max_tokens' in body, false)
  assert.equal('temperature' in body, false)
  // When no cap is given, the field is omitted entirely (model default applies).
  assert.equal('max_completion_tokens' in toChatCompletionsBody(baseReq), false)
})

// --- extractCompletionText ---------------------------------------------------

test('extractCompletionText pulls choices[0].message.content', () => {
  const data = { choices: [{ message: { role: 'assistant', content: 'hello world' } }] }
  assert.equal(extractCompletionText(data), 'hello world')
})

test('extractCompletionText returns null for empty/malformed/blank shapes', () => {
  assert.equal(extractCompletionText(null), null)
  assert.equal(extractCompletionText({}), null)
  assert.equal(extractCompletionText({ choices: [] }), null)
  assert.equal(extractCompletionText({ choices: [{}] }), null)
  assert.equal(extractCompletionText({ choices: [{ message: { content: '' } }] }), null)
  assert.equal(extractCompletionText({ choices: [{ message: { content: 123 } }] }), null)
})

// --- extractModerationFlag ---------------------------------------------------

test('extractModerationFlag reads results[0].flagged', () => {
  assert.equal(extractModerationFlag({ results: [{ flagged: true }] }), true)
  assert.equal(extractModerationFlag({ results: [{ flagged: false }] }), false)
})

test('extractModerationFlag defaults to false on any unexpected shape', () => {
  assert.equal(extractModerationFlag(null), false)
  assert.equal(extractModerationFlag({}), false)
  assert.equal(extractModerationFlag({ results: [] }), false)
  assert.equal(extractModerationFlag({ results: [{}] }), false)
})

// --- PROXY_LIMITS ------------------------------------------------------------

test('PROXY_LIMITS leave generous headroom above real Story Mode usage', () => {
  // The largest legit budget is 1200 output tokens (start/prose); the ceiling must sit well above it
  // so real play is never clamped, yet finite so a hostile request cannot demand an unbounded budget.
  assert.ok(PROXY_LIMITS.maxOutputTokens >= 1200)
  for (const limit of Object.values(PROXY_LIMITS)) {
    assert.ok(Number.isInteger(limit) && limit > 0, `expected a positive integer limit, got ${limit}`)
  }
})

// --- clampOutputTokens -------------------------------------------------------

test('clampOutputTokens passes an in-range budget through unchanged', () => {
  assert.equal(clampOutputTokens(1), 1)
  assert.equal(clampOutputTokens(256), 256)
  assert.equal(clampOutputTokens(1200), 1200)
  assert.equal(clampOutputTokens(PROXY_LIMITS.maxOutputTokens), PROXY_LIMITS.maxOutputTokens)
})

test('clampOutputTokens caps a hostile over-budget request at the ceiling', () => {
  assert.equal(clampOutputTokens(PROXY_LIMITS.maxOutputTokens + 1), PROXY_LIMITS.maxOutputTokens)
  assert.equal(clampOutputTokens(1_000_000), PROXY_LIMITS.maxOutputTokens)
  assert.equal(clampOutputTokens(Number.MAX_SAFE_INTEGER), PROXY_LIMITS.maxOutputTokens)
})

test('clampOutputTokens floors fractional values', () => {
  assert.equal(clampOutputTokens(256.9), 256)
  assert.equal(clampOutputTokens(1.2), 1)
})

test('clampOutputTokens returns undefined for non-positive / non-finite / non-number input', () => {
  // undefined => the body omits max_completion_tokens and OpenAI's model default applies.
  assert.equal(clampOutputTokens(0), undefined)
  assert.equal(clampOutputTokens(0.4), undefined)
  assert.equal(clampOutputTokens(-50), undefined)
  assert.equal(clampOutputTokens(Number.NaN), undefined)
  assert.equal(clampOutputTokens(Number.POSITIVE_INFINITY), undefined)
  assert.equal(clampOutputTokens('256'), undefined)
  assert.equal(clampOutputTokens(undefined), undefined)
  assert.equal(clampOutputTokens(null), undefined)
})

test('toChatCompletionsBody clamps an over-budget maxOutputTokens to the ceiling', () => {
  const body = toChatCompletionsBody({ ...baseReq, maxOutputTokens: 999_999 })
  assert.equal(body.max_completion_tokens, PROXY_LIMITS.maxOutputTokens)
})

// --- normalizeProxyRequest ---------------------------------------------------

test('normalizeProxyRequest accepts a valid generate request and clamps its budget', () => {
  const result = normalizeProxyRequest({ op: 'generate', model: 'gpt-5.4-mini', system: 'SYS', prompt: 'P', json: true, maxOutputTokens: 1200 })
  assert.equal(result.ok, true)
  assert.ok(result.ok)
  assert.deepEqual(result.request, { op: 'generate', model: 'gpt-5.4-mini', system: 'SYS', prompt: 'P', json: true, maxOutputTokens: 1200 })
})

test('normalizeProxyRequest drops json when not exactly true and omits an out-of-range budget', () => {
  const result = normalizeProxyRequest({ op: 'generate', model: 'm', system: 'S', prompt: 'P', json: false, maxOutputTokens: 0 })
  assert.ok(result.ok)
  assert.equal('json' in result.request, false)
  assert.equal('maxOutputTokens' in result.request, false)
})

test('normalizeProxyRequest caps a hostile over-budget generate request', () => {
  const result = normalizeProxyRequest({ op: 'generate', model: 'm', system: 'S', prompt: 'P', maxOutputTokens: 5_000_000 })
  assert.ok(result.ok)
  assert.equal(result.request.op === 'generate' && result.request.maxOutputTokens, PROXY_LIMITS.maxOutputTokens)
})

test('normalizeProxyRequest accepts a valid moderate request', () => {
  const result = normalizeProxyRequest({ op: 'moderate', input: 'hello' })
  assert.ok(result.ok)
  assert.deepEqual(result.request, { op: 'moderate', input: 'hello' })
})

test('normalizeProxyRequest rejects a non-object body', () => {
  for (const raw of [null, undefined, 'string', 42, []]) {
    const result = normalizeProxyRequest(raw)
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.status === 400)
  }
})

test('normalizeProxyRequest rejects a missing or unknown op', () => {
  for (const raw of [{}, { op: 'delete' }, { op: 'GENERATE' }, { op: 123 }]) {
    const result = normalizeProxyRequest(raw)
    assert.ok(!result.ok)
    assert.equal(result.status, 400)
    assert.equal(result.error, 'unknown op')
  }
})

test('normalizeProxyRequest rejects generate with a missing / blank / non-string model|system|prompt', () => {
  const ok = { op: 'generate', model: 'm', system: 'S', prompt: 'P' }
  for (const bad of [
    { ...ok, model: undefined },
    { ...ok, model: '' },
    { ...ok, model: 5 },
    { ...ok, system: '' },
    { ...ok, system: null },
    { ...ok, prompt: undefined },
    { ...ok, prompt: {} },
  ]) {
    const result = normalizeProxyRequest(bad)
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(bad)}`)
    assert.ok(!result.ok && result.status === 400)
  }
})

test('normalizeProxyRequest rejects over-length model / system / prompt (cost-amplification guard)', () => {
  const ok = { op: 'generate', model: 'm', system: 'S', prompt: 'P' }
  const over = (n: number) => 'x'.repeat(n + 1)
  assert.equal(normalizeProxyRequest({ ...ok, model: over(PROXY_LIMITS.maxModelChars) }).ok, false)
  assert.equal(normalizeProxyRequest({ ...ok, system: over(PROXY_LIMITS.maxSystemChars) }).ok, false)
  assert.equal(normalizeProxyRequest({ ...ok, prompt: over(PROXY_LIMITS.maxPromptChars) }).ok, false)
  // A prompt exactly at the cap is still accepted.
  assert.equal(normalizeProxyRequest({ ...ok, prompt: 'x'.repeat(PROXY_LIMITS.maxPromptChars) }).ok, true)
})

test('normalizeProxyRequest rejects wrong-typed json / maxOutputTokens on generate', () => {
  const ok = { op: 'generate', model: 'm', system: 'S', prompt: 'P' }
  assert.equal(normalizeProxyRequest({ ...ok, json: 'yes' }).ok, false)
  assert.equal(normalizeProxyRequest({ ...ok, maxOutputTokens: '256' }).ok, false)
})

test('normalizeProxyRequest rejects moderate with a missing / blank / over-length input', () => {
  assert.equal(normalizeProxyRequest({ op: 'moderate' }).ok, false)
  assert.equal(normalizeProxyRequest({ op: 'moderate', input: '' }).ok, false)
  assert.equal(normalizeProxyRequest({ op: 'moderate', input: 99 }).ok, false)
  assert.equal(normalizeProxyRequest({ op: 'moderate', input: 'x'.repeat(PROXY_LIMITS.maxModerationInputChars + 1) }).ok, false)
})
