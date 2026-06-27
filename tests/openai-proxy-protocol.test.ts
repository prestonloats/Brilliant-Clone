// Guards the PURE OpenAI proxy protocol (src/story/openAiProxyProtocol.ts): the request mapping and
// response parsing shared by the browser adapter and the dev proxy, tested without a network.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  OPENAI_MODERATION_MODEL,
  OPENAI_STORY_MODELS,
  PROXY_LIMITS,
  clampMaxOutputTokens,
  defaultAllowedStoryModels,
  extractCompletionText,
  extractModerationFlag,
  isReasoningModel,
  toChatCompletionsBody,
  validateProxyRequest,
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

test('toChatCompletionsBody pins LOW reasoning effort for reasoning models so reasoning tokens cannot starve the visible answer', () => {
  // The pinned story models (gpt-5.4-mini / -nano) are reasoning-class -> low effort. NOTE: 'low',
  // not 'minimal' — gpt-5.4 models 400 on 'minimal' (only none/low/medium/high/xhigh are accepted).
  assert.equal(toChatCompletionsBody(baseReq).reasoning_effort, 'low')
  assert.equal(toChatCompletionsBody({ ...baseReq, model: 'gpt-5.4-nano' }).reasoning_effort, 'low')
})

test('toChatCompletionsBody OMITS reasoning_effort for non-reasoning models (which reject the field)', () => {
  assert.equal('reasoning_effort' in toChatCompletionsBody({ ...baseReq, model: 'gpt-4o-mini' }), false)
})

test('isReasoningModel matches only the gpt-5 / o-series reasoning families', () => {
  assert.equal(isReasoningModel('gpt-5.4-mini'), true)
  assert.equal(isReasoningModel('gpt-5.4-nano'), true)
  assert.equal(isReasoningModel('gpt-5'), true)
  assert.equal(isReasoningModel('o4-mini'), true)
  assert.equal(isReasoningModel('o3'), true)
  assert.equal(isReasoningModel('gpt-4o-mini'), false)
  assert.equal(isReasoningModel('gpt-4.1'), false)
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

// --- clampMaxOutputTokens ----------------------------------------------------

test('clampMaxOutputTokens bounds the budget into [1, cap] and defaults a missing/invalid value to the cap', () => {
  assert.equal(clampMaxOutputTokens(256), 256)
  assert.equal(clampMaxOutputTokens(0), 1)
  assert.equal(clampMaxOutputTokens(-5), 1)
  assert.equal(clampMaxOutputTokens(PROXY_LIMITS.maxOutputTokens + 10_000), PROXY_LIMITS.maxOutputTokens)
  assert.equal(clampMaxOutputTokens(undefined), PROXY_LIMITS.maxOutputTokens)
  assert.equal(clampMaxOutputTokens('1000' as unknown), PROXY_LIMITS.maxOutputTokens)
  assert.equal(clampMaxOutputTokens(123.9), 123)
})

// --- validateProxyRequest (shared abuse guard) -------------------------------

test('validateProxyRequest accepts an allow-listed generate request and clamps its token budget', () => {
  const result = validateProxyRequest({
    op: 'generate',
    model: OPENAI_STORY_MODELS.primary,
    system: 'SYS',
    prompt: 'P',
    json: true,
    maxOutputTokens: 999_999,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.request, {
      op: 'generate',
      model: OPENAI_STORY_MODELS.primary,
      system: 'SYS',
      prompt: 'P',
      json: true,
      maxOutputTokens: PROXY_LIMITS.maxOutputTokens,
    })
  }
})

test('validateProxyRequest rejects a model that is not on the allow-list', () => {
  const result = validateProxyRequest({ op: 'generate', model: 'gpt-4o', system: 'S', prompt: 'P' })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.match(result.error, /model not allowed/i)
  }
})

test('validateProxyRequest honors a custom allow-list', () => {
  assert.equal(validateProxyRequest({ op: 'generate', model: 'x', system: 'S', prompt: 'P' }, ['x']).ok, true)
  assert.equal(
    validateProxyRequest({ op: 'generate', model: OPENAI_STORY_MODELS.primary, system: 'S', prompt: 'P' }, ['x']).ok,
    false,
  )
})

test('validateProxyRequest rejects oversized prompts/system with 413', () => {
  const big = 'a'.repeat(PROXY_LIMITS.maxPromptChars + 1)
  const result = validateProxyRequest({ op: 'generate', model: OPENAI_STORY_MODELS.primary, system: 'S', prompt: big })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.status, 413)
})

test('validateProxyRequest requires string system and prompt', () => {
  const result = validateProxyRequest({ op: 'generate', model: OPENAI_STORY_MODELS.primary, system: 1, prompt: 2 })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.status, 400)
})

test('validateProxyRequest accepts a moderate request and caps the input size', () => {
  const ok = validateProxyRequest({ op: 'moderate', input: 'hi' })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.request, { op: 'moderate', input: 'hi' })

  const tooBig = validateProxyRequest({ op: 'moderate', input: 'x'.repeat(PROXY_LIMITS.maxInputChars + 1) })
  assert.equal(tooBig.ok, false)
  if (!tooBig.ok) assert.equal(tooBig.status, 413)
})

test('validateProxyRequest rejects unknown ops and non-object bodies', () => {
  assert.equal(validateProxyRequest({ op: 'noop' }).ok, false)
  assert.equal(validateProxyRequest(null).ok, false)
  assert.equal(validateProxyRequest('nope').ok, false)
  assert.deepEqual(defaultAllowedStoryModels(), [OPENAI_STORY_MODELS.primary, OPENAI_STORY_MODELS.fallback])
})
