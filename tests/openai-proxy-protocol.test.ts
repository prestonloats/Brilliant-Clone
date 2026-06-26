// Guards the PURE OpenAI proxy protocol (src/story/openAiProxyProtocol.ts): the request mapping and
// response parsing shared by the browser adapter and the dev proxy, tested without a network.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  OPENAI_MODERATION_MODEL,
  OPENAI_STORY_MODELS,
  extractCompletionText,
  extractModerationFlag,
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
