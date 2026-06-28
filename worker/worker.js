// Cloudflare Worker: free, no-Blaze OpenAI proxy for Story Mode.
//
// This is the production equivalent of devProxy/storyAiProxyPlugin.ts. It holds OPENAI_API_KEY as a
// Cloudflare secret (never in the browser) and forwards the same browser<->proxy protocol that
// src/story/openAiProxyProtocol.ts defines: { op:'generate', ... } -> { text } and
// { op:'moderate', input } -> { flagged }.
//
// The browser (on Firebase Hosting) calls this cross-origin, so we handle the CORS preflight and only
// answer requests from known origins. Set the key with:  wrangler secret put OPENAI_API_KEY
//
// SECURITY: because the proxy spends a billable key, the Origin header alone is NOT a trust boundary
// (a non-browser client can forge it). Defense in depth here:
//   1. Per-IP rate limiting via the STORY_RATE_LIMITER binding (see wrangler.toml).
//   2. A request body-size cap (rejects oversized payloads before reading them).
//   3. A model ALLOW-LIST + output-token cap + prompt/input size caps (validateRequest), so an
//      attacker who reaches the endpoint still can't pick an expensive model or unbounded output.
// These mirror the shared, unit-tested rules in src/story/openAiProxyProtocol.ts. Also set a hard
// monthly spend limit on the OpenAI account as the final backstop.

// Origins allowed to use this proxy. Add your custom domain here if you set one up later.
const ALLOWED_ORIGINS = new Set([
  'https://starting-project-e6700.web.app',
  'https://starting-project-e6700.firebaseapp.com',
])

// Allow the deploy domains above PLUS any localhost / 127.0.0.1 origin (ANY port) for local dev:
// Vite picks a new port when one is busy (5173 -> 5174 -> ...), and pinning a single port made the
// proxy 403 the dev server whenever it moved. Origin is NOT a real trust boundary anyway (a
// non-browser client can spoof it), so the actual cost controls are the per-IP rate limit + model
// allow-list + output/size caps + the OpenAI spend cap — none of which this loosens.
const isAllowedOrigin = (origin) =>
  ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

const OPENAI_BASE = 'https://api.openai.com/v1'
// Mirrors OPENAI_MODERATION_MODEL in src/story/openAiProxyProtocol.ts.
const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

// Mirrors PROXY_LIMITS + defaultAllowedStoryModels in src/story/openAiProxyProtocol.ts. Kept inline
// because this standalone Worker bundle can't import the app's TypeScript. Override the model list
// per-deploy with the ALLOWED_MODELS env var (comma-separated) if you change VITE_STORY_AI_MODEL.
const DEFAULT_ALLOWED_MODELS = ['gpt-5.4-mini', 'gpt-5.4-nano']
const MAX_OUTPUT_TOKENS = 8000
const MAX_SYSTEM_CHARS = 8000
const MAX_PROMPT_CHARS = 40000
const MAX_INPUT_CHARS = 8000
const MAX_BODY_BYTES = 1_000_000

const allowedModels = (env) => {
  const configured = (env.ALLOWED_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_MODELS
}

// Mirrors isReasoningModel in src/story/openAiProxyProtocol.ts. GPT-5/o-series reasoning models bill
// hidden reasoning tokens against max_completion_tokens, so at the default effort a beat can spend
// the whole budget thinking and return EMPTY text — the intermittent "default text" bug. We pin a
// MINIMAL reasoning effort for them (and gate it so a non-reasoning override isn't sent the field).
const isReasoningModel = (model) => /^(gpt-5|o\d)/i.test(model)

const clampMaxOutputTokens = (value) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : MAX_OUTPUT_TOKENS
  return Math.min(Math.max(n, 1), MAX_OUTPUT_TOKENS)
}

// Validate + normalize an untrusted body. Returns { request } or { status, error }.
const validateRequest = (body, models) => {
  if (!body || typeof body !== 'object') return { status: 400, error: 'invalid request body' }

  if (body.op === 'generate') {
    if (typeof body.model !== 'string' || !models.includes(body.model)) {
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

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
})

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...(origin ? corsHeaders(origin) : {}) },
  })

const callOpenAi = (path, apiKey, body) =>
  fetch(`${OPENAI_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const allowed = isAllowedOrigin(origin)

    // CORS preflight.
    if (request.method === 'OPTIONS') {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 })
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, allowed ? origin : undefined)

    // Origin guard: a basic abuse deterrent so the endpoint isn't trivially usable from other sites.
    // (Not bulletproof — a non-browser client can spoof Origin — which is why the rate limit + model
    // allow-list + token/size caps below are the real cost controls.)
    if (!allowed) return json({ error: 'forbidden origin' }, 403)

    // Per-IP rate limit (distributed, backed by the same infra as WAF rate-limiting rules). The
    // binding is optional so the worker still runs if it hasn't been provisioned yet.
    if (env.STORY_RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const { success } = await env.STORY_RATE_LIMITER.limit({ key: ip })
      if (!success) return json({ error: 'rate limited' }, 429, origin)
    }

    const apiKey = env.OPENAI_API_KEY
    if (!apiKey) return json({ error: 'OPENAI_API_KEY secret is not configured on the worker' }, 500, origin)

    // Reject oversized payloads up front (a content-length cap before reading the stream).
    const declaredLength = Number(request.headers.get('Content-Length') || '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return json({ error: 'request body too large' }, 413, origin)
    }

    let rawBody
    try {
      const text = await request.text()
      if (text.length > MAX_BODY_BYTES) return json({ error: 'request body too large' }, 413, origin)
      rawBody = JSON.parse(text)
    } catch {
      return json({ error: 'invalid JSON body' }, 400, origin)
    }

    // Validate + normalize before spending the key: allow-list the model, clamp output tokens, cap sizes.
    const validated = validateRequest(rawBody, allowedModels(env))
    if (validated.error) return json({ error: validated.error }, validated.status, origin)
    const body = validated.request

    try {
      if (body.op === 'generate') {
        const requestBody = toChatCompletionsBody(body)
        let upstream = await callOpenAi('/chat/completions', apiKey, requestBody)
        if (!upstream.ok) {
          let detail = (await upstream.text()).slice(0, 500)
          // Resilience: if the model rejected `reasoning_effort` (e.g. a non-reasoning model is later
          // added to ALLOWED_MODELS), retry ONCE without it so a model swap can't hard-break generation.
          if (upstream.status === 400 && requestBody.reasoning_effort && /reasoning/i.test(detail)) {
            console.warn(`[story-proxy] model=${body.model} rejected reasoning_effort; retrying without it: ${detail}`)
            const retryBody = { ...requestBody }
            delete retryBody.reasoning_effort
            upstream = await callOpenAi('/chat/completions', apiKey, retryBody)
            if (!upstream.ok) detail = (await upstream.text()).slice(0, 500)
          }
          // Pass the status through so the client's backoff retries 429/5xx but fails fast on 4xx.
          if (!upstream.ok) {
            console.error(`[story-proxy] OpenAI /chat/completions ${upstream.status} model=${body.model}: ${detail}`)
            return json({ text: null, error: detail }, upstream.status, origin)
          }
        }
        const data = await upstream.json()
        const text = extractCompletionText(data)
        if (text === null) {
          // 200 OK but NO visible text — the intermittent "default text" cause. Log finish_reason +
          // usage so we can tell whether reasoning tokens ate the whole budget (finish_reason
          // "length" with completion_tokens near the cap), a content filter fired, or the shape was
          // unexpected.
          const choice = data?.choices?.[0]
          console.warn(
            `[story-proxy] EMPTY completion model=${body.model} json=${Boolean(body.json)} ` +
              `maxOutputTokens=${requestBody.max_completion_tokens} finish_reason=${choice?.finish_reason} ` +
              `refusal=${choice?.message?.refusal ?? 'none'} usage=${JSON.stringify(data?.usage)}`,
          )
        }
        return json({ text }, 200, origin)
      }

      if (body.op === 'moderate') {
        const upstream = await callOpenAi('/moderations', apiKey, { model: OPENAI_MODERATION_MODEL, input: body.input })
        // Fail CLOSED: if moderation itself errors we can't vouch for the input, so report it flagged
        // and let the adapter drop the untrusted choice (the story steers back safely).
        if (!upstream.ok) return json({ flagged: true }, 200, origin)
        return json({ flagged: extractModerationFlag(await upstream.json()) }, 200, origin)
      }

      return json({ error: 'unknown op' }, 400, origin)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'proxy error' }, 502, origin)
    }
  },
}
