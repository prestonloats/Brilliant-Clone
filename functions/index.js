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
//
// Because the proxy spends a billable key, it also: only answers known origins (CORS allow-list),
// allow-lists the model, clamps the output-token budget, caps prompt/input size, and fails CLOSED on
// moderation errors. maxInstances caps fan-out; set a hard OpenAI spend limit as the final backstop.

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

const OPENAI_BASE = 'https://api.openai.com/v1'
// Mirrors OPENAI_MODERATION_MODEL in src/story/openAiProxyProtocol.ts.
const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

// Origins allowed to call this proxy (same-origin Hosting domains + local dev). Localhost is matched
// on ANY port (isAllowedOrigin) so a moved Vite dev port (5173 -> 5174 ...) isn't 403'd. Origin is
// not a real trust boundary anyway; the cost controls are the model allow-list + caps + spend cap.
const ALLOWED_ORIGINS = new Set([
  'https://starting-project-e6700.web.app',
  'https://starting-project-e6700.firebaseapp.com',
])

const isAllowedOrigin = (origin) =>
  ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

// Mirrors PROXY_LIMITS + defaultAllowedStoryModels in src/story/openAiProxyProtocol.ts.
const DEFAULT_ALLOWED_MODELS = ['gpt-5.4-mini', 'gpt-5.4-nano']
const MAX_OUTPUT_TOKENS = 8000
const MAX_SYSTEM_CHARS = 8000
const MAX_PROMPT_CHARS = 40000
const MAX_INPUT_CHARS = 8000

const clampMaxOutputTokens = (value) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : MAX_OUTPUT_TOKENS
  return Math.min(Math.max(n, 1), MAX_OUTPUT_TOKENS)
}

// Mirrors isReasoningModel in src/story/openAiProxyProtocol.ts. GPT-5/o-series reasoning models bill
// hidden reasoning tokens against max_completion_tokens, so at the default effort a beat can spend
// the whole budget thinking and return EMPTY text — the intermittent "default text" bug. We pin a
// MINIMAL reasoning effort for them (and gate it so a non-reasoning override isn't sent the field).
const isReasoningModel = (model) => /^(gpt-5|o\d)/i.test(model)

// Validate + normalize an untrusted body. Returns { request } or { status, error }.
const validateRequest = (body) => {
  if (!body || typeof body !== 'object') return { status: 400, error: 'invalid request body' }

  if (body.op === 'generate') {
    if (typeof body.model !== 'string' || !DEFAULT_ALLOWED_MODELS.includes(body.model)) {
      return { status: 400, error: 'model not allowed' }
    }
    if (typeof body.system !== 'string' || typeof body.prompt !== 'string') {
      return { status: 400, error: 'system and prompt must be strings' }
    }
    if (body.system.length > MAX_SYSTEM_CHARS || body.prompt.length > MAX_PROMPT_CHARS) {
      return { status: 413, error: 'system or prompt is too large' }
    }
    return {
      request: {
        op: 'generate',
        model: body.model,
        system: body.system,
        prompt: body.prompt,
        json: body.json === true,
        maxOutputTokens: clampMaxOutputTokens(body.maxOutputTokens),
      },
    }
  }

  if (body.op === 'moderate') {
    if (typeof body.input !== 'string') return { status: 400, error: 'input must be a string' }
    if (body.input.length > MAX_INPUT_CHARS) return { status: 413, error: 'input is too large' }
    return { request: { op: 'moderate', input: body.input } }
  }

  return { status: 400, error: 'unknown op' }
}

// --- protocol mapping (mirrors the pure helpers in src/story/openAiProxyProtocol.ts) ---------

const toChatCompletionsBody = (req) => {
  const body = {
    model: req.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
  }
  if (req.json) body.response_format = { type: 'json_object' }
  if (typeof req.maxOutputTokens === 'number') body.max_completion_tokens = req.maxOutputTokens
  // 'low' (NOT 'minimal', which 400s on gpt-5.4 models). See isReasoningModel comment above.
  if (isReasoningModel(req.model)) body.reasoning_effort = 'low'
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

const applyCors = (res, origin) => {
  res.set('Access-Control-Allow-Origin', origin)
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Access-Control-Max-Age', '86400')
  res.set('Vary', 'Origin')
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
    const origin = req.headers.origin || ''
    const allowed = isAllowedOrigin(origin)

    if (req.method === 'OPTIONS') {
      if (allowed) {
        applyCors(res, origin)
        res.status(204).send('')
      } else {
        res.status(403).send('')
      }
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' })
      return
    }

    // Origin guard: deter cross-site abuse of the billable key. Not bulletproof (Origin is spoofable
    // by non-browser clients), so the model allow-list + token/size caps below are the real controls.
    if (!allowed) {
      res.status(403).json({ error: 'forbidden origin' })
      return
    }
    applyCors(res, origin)

    const apiKey = OPENAI_API_KEY.value()
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY secret is not configured on the function' })
      return
    }

    // onRequest auto-parses a JSON body (Content-Type: application/json), which the client always sends.
    const rawBody = req.body && typeof req.body === 'object' ? req.body : {}

    // Validate + normalize before spending the key: allow-list the model, clamp output tokens, cap sizes.
    const validated = validateRequest(rawBody)
    if (validated.error) {
      res.status(validated.status).json({ error: validated.error })
      return
    }
    const body = validated.request

    try {
      if (body.op === 'generate') {
        const requestBody = toChatCompletionsBody(body)
        let upstream = await callOpenAi('/chat/completions', apiKey, requestBody)
        if (!upstream.ok) {
          // Surface OpenAI's own error so a misconfigured/over-quota key is diagnosable in the logs and
          // the status flows back to the client's backoff layer (retry 429/5xx, fail fast on 4xx).
          let detail = (await upstream.text()).slice(0, 500)
          // Resilience: if the model rejected `reasoning_effort` (e.g. a non-reasoning model is later
          // added to ALLOWED_MODELS), retry ONCE without it so a model swap can't hard-break generation.
          if (upstream.status === 400 && requestBody.reasoning_effort && /reasoning/i.test(detail)) {
            const retryBody = { ...requestBody }
            delete retryBody.reasoning_effort
            upstream = await callOpenAi('/chat/completions', apiKey, retryBody)
            if (!upstream.ok) detail = (await upstream.text()).slice(0, 500)
          }
          if (!upstream.ok) {
            console.error(`[story-proxy] OpenAI /chat/completions ${upstream.status}: ${detail}`)
            res.status(upstream.status).json({ text: null, error: detail })
            return
          }
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
          // Fail CLOSED: report the input as flagged so the adapter drops the untrusted choice.
          console.error(`[story-proxy] OpenAI /moderations ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`)
          res.status(200).json({ flagged: true })
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
