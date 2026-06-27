// Deploy-time Story Mode OpenAI proxy (the production equivalent of devProxy/storyAiProxyPlugin.ts).
//
// Firebase Hosting is static, so the dev-only Vite proxy at /api/story does not exist in production.
// This Cloud Function serves that same /api/story path (wired via the Hosting rewrite in
// firebase.json) and speaks the exact same browser<->proxy protocol as src/story/openAiProxyProtocol.ts.
//
// SECURITY: the OpenAI key NEVER ships to the browser. It is stored in Secret Manager and bound to
// this function via defineSecret('OPENAI_API_KEY'); set it once with:
//   firebase functions:secrets:set OPENAI_API_KEY
// The client posts the normalized protocol (no key) same-origin to /api/story.

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

const OPENAI_BASE = 'https://api.openai.com/v1'
// Mirrors OPENAI_MODERATION_MODEL in src/story/openAiProxyProtocol.ts.
const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

// --- protocol mapping (mirrors the pure helpers in src/story/openAiProxyProtocol.ts) ---------

// SECURITY: this proxy is PUBLIC and unauthenticated, forwarding to OpenAI with the owner's billable
// key, so the body is untrusted. These ceilings (mirroring PROXY_LIMITS in openAiProxyProtocol.ts)
// bound per-request cost — maxInstances above bounds concurrency. Legit Story Mode calls sit well
// under them, so real play is unaffected; a hostile client cannot demand huge output/inputs.
const PROXY_LIMITS = {
  maxOutputTokens: 4096,
  maxModelChars: 64,
  maxSystemChars: 8_000,
  maxPromptChars: 24_000,
  maxModerationInputChars: 8_000,
}

const clampOutputTokens = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const tokens = Math.floor(value)
  if (tokens < 1) return undefined
  return Math.min(tokens, PROXY_LIMITS.maxOutputTokens)
}

const isBoundedString = (value, max) =>
  typeof value === 'string' && value.length > 0 && value.length <= max

// Validate + clamp an untrusted body; returns { ok, request } or { ok:false, status, error }.
const normalizeProxyRequest = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 400, error: 'request body must be a JSON object' }
  }
  if (raw.op === 'generate') {
    if (!isBoundedString(raw.model, PROXY_LIMITS.maxModelChars)) {
      return { ok: false, status: 400, error: 'generate requires a non-empty model within the size limit' }
    }
    if (!isBoundedString(raw.system, PROXY_LIMITS.maxSystemChars)) {
      return { ok: false, status: 400, error: 'generate requires a system prompt within the size limit' }
    }
    if (!isBoundedString(raw.prompt, PROXY_LIMITS.maxPromptChars)) {
      return { ok: false, status: 400, error: 'generate requires a prompt within the size limit' }
    }
    if (raw.json !== undefined && typeof raw.json !== 'boolean') {
      return { ok: false, status: 400, error: 'generate json flag must be a boolean' }
    }
    if (raw.maxOutputTokens !== undefined && typeof raw.maxOutputTokens !== 'number') {
      return { ok: false, status: 400, error: 'generate maxOutputTokens must be a number' }
    }
    const request = { op: 'generate', model: raw.model, system: raw.system, prompt: raw.prompt }
    if (raw.json === true) request.json = true
    const maxTokens = clampOutputTokens(raw.maxOutputTokens)
    if (maxTokens !== undefined) request.maxOutputTokens = maxTokens
    return { ok: true, request }
  }
  if (raw.op === 'moderate') {
    if (!isBoundedString(raw.input, PROXY_LIMITS.maxModerationInputChars)) {
      return { ok: false, status: 400, error: 'moderate requires an input within the size limit' }
    }
    return { ok: true, request: { op: 'moderate', input: raw.input } }
  }
  return { ok: false, status: 400, error: 'unknown op' }
}

const toChatCompletionsBody = (req) => {
  const body = {
    model: req.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
  }
  if (req.json) body.response_format = { type: 'json_object' }
  const maxTokens = clampOutputTokens(req.maxOutputTokens)
  if (maxTokens !== undefined) body.max_completion_tokens = maxTokens
  return body
}

const extractCompletionText = (data) => {
  const choices = data?.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const content = choices[0]?.message?.content
  return typeof content === 'string' && content.length > 0 ? content : null
}

const extractModerationFlag = (data) => {
  const results = data?.results
  if (!Array.isArray(results) || results.length === 0) return false
  return Boolean(results[0]?.flagged)
}

const callOpenAi = (path, apiKey, body) =>
  fetch(`${OPENAI_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

export const storyProxy = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    // A small ceiling keeps a runaway/abuse loop from fanning out into a big OpenAI bill.
    maxInstances: 10,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' })
      return
    }

    const apiKey = OPENAI_API_KEY.value()
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY secret is not configured on the function' })
      return
    }

    // onRequest auto-parses a JSON body (Content-Type: application/json), which the client always sends.
    // Validate + clamp the untrusted body BEFORE spending the key (token ceiling, size caps, types).
    const parsed = normalizeProxyRequest(req.body)
    if (!parsed.ok) {
      res.status(parsed.status).json({ error: parsed.error })
      return
    }
    const body = parsed.request

    try {
      if (body.op === 'generate') {
        const upstream = await callOpenAi('/chat/completions', apiKey, toChatCompletionsBody(body))
        if (!upstream.ok) {
          // Surface OpenAI's own error so a misconfigured/over-quota key is diagnosable in the logs and
          // the status flows back to the client's backoff layer (retry 429/5xx, fail fast on 4xx).
          const detail = (await upstream.text()).slice(0, 500)
          console.error(`[story-proxy] OpenAI /chat/completions ${upstream.status}: ${detail}`)
          res.status(upstream.status).json({ text: null, error: detail })
          return
        }
        res.status(200).json({ text: extractCompletionText(await upstream.json()) })
        return
      }

      if (body.op === 'moderate') {
        const upstream = await callOpenAi('/moderations', apiKey, {
          model: OPENAI_MODERATION_MODEL,
          input: body.input,
        })
        if (!upstream.ok) {
          console.error(`[story-proxy] OpenAI /moderations ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`)
          res.status(200).json({ flagged: false }) // fail-open on moderation infra errors
          return
        }
        res.status(200).json({ flagged: extractModerationFlag(await upstream.json()) })
        return
      }

      res.status(400).json({ error: 'unknown op' })
    } catch (error) {
      console.error('[story-proxy] error', error)
      res.status(502).json({ error: error instanceof Error ? error.message : 'proxy error' })
    }
  },
)
