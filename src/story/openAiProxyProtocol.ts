// PURE shared contract between the browser StoryAI adapter (src/story/openAiStoryAi.ts) and the
// local dev proxy (devProxy/storyAiProxyPlugin.ts).
//
// It imports NO SDK / DOM / Node APIs, so it type-checks in every project (app, node, tests) and the
// OpenAI request/response mapping below is unit-tested without a network. The browser only ever
// speaks this normalized protocol to the same-origin proxy — it never sees the OpenAI key or talks to
// api.openai.com directly.

// Story Mode generation models: a capable "mini" primary + a cheap "nano" fallback, mirroring the
// Gemini flash / flash-lite split. The primary is overridable at runtime via VITE_STORY_AI_MODEL.
export const OPENAI_STORY_MODELS = {
  primary: 'gpt-5.4-mini',
  fallback: 'gpt-5.4-nano',
} as const

// Free content classifier for the teen-safety pass (replaces Gemini's inline safetySettings, which
// OpenAI text generation has no equivalent for).
export const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

// --- Browser <-> proxy protocol ----------------------------------------------

export type ProxyGenerateRequest = {
  op: 'generate'
  model: string
  system: string
  prompt: string
  json?: boolean // request a JSON object response (start / re-theme calls)
  maxOutputTokens?: number
}

export type ProxyModerateRequest = {
  op: 'moderate'
  input: string
}

export type ProxyRequest = ProxyGenerateRequest | ProxyModerateRequest

export type ProxyGenerateResponse = { text: string | null }
export type ProxyModerateResponse = { flagged: boolean }

// --- Server-side abuse limits (the proxy is PUBLIC and unauthenticated) ------

// The deployed /api/story proxy forwards to OpenAI with the owner's BILLABLE key, and any origin can
// POST to it, so its body is fully untrusted: a hostile client could otherwise demand a huge
// `maxOutputTokens` or a megabyte-long prompt purely to run up the bill. These ceilings bound the
// per-request cost (maxInstances in functions/ bounds concurrency). Legitimate Story Mode calls
// (<=1200 output tokens; prompts a few KB long) sit far below them, so real play is unaffected.
export const PROXY_LIMITS = {
  maxOutputTokens: 4096,
  maxModelChars: 64,
  maxSystemChars: 8_000,
  maxPromptChars: 24_000,
  maxModerationInputChars: 8_000,
} as const

// Clamp a client-supplied output-token budget to a finite integer within [1, ceiling]. Returns
// undefined for anything non-numeric or < 1 so the request body omits the field entirely (OpenAI's
// model default then applies) — a hostile or garbage value can never pass through unbounded.
export const clampOutputTokens = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const tokens = Math.floor(value)
  if (tokens < 1) return undefined
  return Math.min(tokens, PROXY_LIMITS.maxOutputTokens)
}

// --- OpenAI Chat Completions mapping (pure + testable) -----------------------

// Minimal Chat Completions body. Note: `max_completion_tokens` (not the deprecated `max_tokens`) is
// used so the request works on GPT-5.x as well as 4.x models. Temperature is intentionally omitted:
// some reasoning-class models reject a non-default temperature, so we leave it at the model default
// for maximum cross-model compatibility.
export type ChatCompletionsBody = {
  model: string
  messages: { role: 'system' | 'user'; content: string }[]
  response_format?: { type: 'json_object' }
  max_completion_tokens?: number
}

export const toChatCompletionsBody = (req: ProxyGenerateRequest): ChatCompletionsBody => {
  const body: ChatCompletionsBody = {
    model: req.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
  }
  if (req.json) body.response_format = { type: 'json_object' }
  // Always clamp here too (defense in depth) so the ceiling holds even if a caller skips
  // normalizeProxyRequest; an in-range value is passed through unchanged, an unset one omitted.
  const maxTokens = clampOutputTokens(req.maxOutputTokens)
  if (maxTokens !== undefined) body.max_completion_tokens = maxTokens
  return body
}

// --- Untrusted request validation (shared by both proxies) -------------------

export type ProxyValidationResult =
  | { ok: true; request: ProxyRequest }
  | { ok: false; status: number; error: string }

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

// Validate + normalize an untrusted proxy request body, returning either the typed request or a
// { status, error } the caller can send verbatim. Centralizing the policy here keeps the dev proxy
// (devProxy/) and the deployed Cloud Function (functions/, which mirrors these constants) enforcing
// IDENTICAL bounds, so neither becomes an unbounded relay to the billable OpenAI API.
export const normalizeProxyRequest = (raw: unknown): ProxyValidationResult => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 400, error: 'request body must be a JSON object' }
  }
  const body = raw as Record<string, unknown>

  if (body.op === 'generate') {
    if (!isBoundedString(body.model, PROXY_LIMITS.maxModelChars)) {
      return { ok: false, status: 400, error: 'generate requires a non-empty model within the size limit' }
    }
    if (!isBoundedString(body.system, PROXY_LIMITS.maxSystemChars)) {
      return { ok: false, status: 400, error: 'generate requires a system prompt within the size limit' }
    }
    if (!isBoundedString(body.prompt, PROXY_LIMITS.maxPromptChars)) {
      return { ok: false, status: 400, error: 'generate requires a prompt within the size limit' }
    }
    if (body.json !== undefined && typeof body.json !== 'boolean') {
      return { ok: false, status: 400, error: 'generate json flag must be a boolean' }
    }
    if (body.maxOutputTokens !== undefined && typeof body.maxOutputTokens !== 'number') {
      return { ok: false, status: 400, error: 'generate maxOutputTokens must be a number' }
    }
    const request: ProxyGenerateRequest = { op: 'generate', model: body.model, system: body.system, prompt: body.prompt }
    if (body.json === true) request.json = true
    const maxTokens = clampOutputTokens(body.maxOutputTokens)
    if (maxTokens !== undefined) request.maxOutputTokens = maxTokens
    return { ok: true, request }
  }

  if (body.op === 'moderate') {
    if (!isBoundedString(body.input, PROXY_LIMITS.maxModerationInputChars)) {
      return { ok: false, status: 400, error: 'moderate requires an input within the size limit' }
    }
    return { ok: true, request: { op: 'moderate', input: body.input } }
  }

  return { ok: false, status: 400, error: 'unknown op' }
}

// Pull the assistant text out of an OpenAI Chat Completions response, tolerating the unknown wire
// shape; returns null when no usable text is present.
export const extractCompletionText = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as { message?: unknown }).message
  if (!message || typeof message !== 'object') return null
  const content = (message as { content?: unknown }).content
  return typeof content === 'string' && content.length > 0 ? content : null
}

// Pull the overall `flagged` boolean out of an OpenAI Moderations response (defaults to false on any
// unexpected shape, so a malformed moderation reply never hard-blocks the story).
export const extractModerationFlag = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') return false
  const results = (data as { results?: unknown }).results
  if (!Array.isArray(results) || results.length === 0) return false
  return Boolean((results[0] as { flagged?: unknown }).flagged)
}
