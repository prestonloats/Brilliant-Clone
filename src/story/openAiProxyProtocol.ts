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

// --- OpenAI Chat Completions mapping (pure + testable) -----------------------

// OpenAI reasoning-effort levels. The Story Mode models (gpt-5.4-mini / -nano) accept
// 'none' | 'low' | 'medium' | 'high' | 'xhigh' — NOTE: NOT 'minimal' (it 400s on these models).
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'

// GPT-5 / o-series are REASONING models: their `max_completion_tokens` budget ALSO pays for hidden
// reasoning tokens. At the default effort a single story beat can spend the WHOLE budget thinking and
// return an EMPTY completion (HTTP 200, blank content) — the intermittent "no text" that makes the
// app fall back to its offline default beat. We detect those models so we can pin a LOW reasoning
// effort below (leaving the budget for the actual answer), and so a non-reasoning override
// (e.g. gpt-4o-mini) is never sent the `reasoning_effort` field it would reject.
export const isReasoningModel = (model: string): boolean => /^(gpt-5|o\d)/i.test(model)

// Minimal Chat Completions body. Note: `max_completion_tokens` (not the deprecated `max_tokens`) is
// used so the request works on GPT-5.x as well as 4.x models. Temperature is intentionally omitted:
// some reasoning-class models reject a non-default temperature, so we leave it at the model default
// for maximum cross-model compatibility. `reasoning_effort` is pinned to 'minimal' for reasoning
// models (see isReasoningModel) so reasoning tokens can't starve the visible answer.
export type ChatCompletionsBody = {
  model: string
  messages: { role: 'system' | 'user'; content: string }[]
  response_format?: { type: 'json_object' }
  max_completion_tokens?: number
  reasoning_effort?: ReasoningEffort
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
  if (typeof req.maxOutputTokens === 'number') body.max_completion_tokens = req.maxOutputTokens
  // Keep reasoning LOW so hidden reasoning tokens can't eat the whole budget and starve the visible
  // answer (the random empty completions that drop Story Mode to its offline default text). 'low' is
  // supported by the gpt-5.4 models (unlike 'minimal', which 400s); gated so non-reasoning models
  // aren't sent the field at all.
  if (isReasoningModel(req.model)) body.reasoning_effort = 'low'
  return body
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

// --- Server-side request validation (shared abuse guard) ---------------------
//
// SECURITY: the proxy forwards a billable OpenAI key, so EVERY public proxy (the Cloudflare Worker,
// the Firebase Function, and the local dev plugin) must reject requests that could run up cost:
//   - an unexpected (e.g. far more expensive) model,
//   - an oversized prompt/input, or
//   - an unbounded output-token budget.
// These limits live here so the one set of rules is unit-tested once and mirrored by the standalone
// JS proxies (worker.js / functions/index.js keep inline copies because they can't import this TS).

export const PROXY_LIMITS = {
  // Largest legit Story Mode budget is 2000 (start/prose); 8000 leaves generous headroom for a
  // reasoning model (hidden reasoning tokens + the visible answer) while still capping
  // denial-of-wallet abuse. The per-IP rate limit + origin allow-list bound total spend.
  maxOutputTokens: 8000,
  maxSystemChars: 8_000,
  maxPromptChars: 40_000,
  maxInputChars: 8_000,
  maxBodyBytes: 1_000_000,
} as const

// The only models a proxy will forward by default: the pinned mini primary + nano fallback.
export const defaultAllowedStoryModels = (): string[] => [
  OPENAI_STORY_MODELS.primary,
  OPENAI_STORY_MODELS.fallback,
]

// Clamp a requested output-token budget into [1, maxOutputTokens]; a missing/invalid value falls
// back to the cap so an omitted field can't request the model's (much larger) default.
export const clampMaxOutputTokens = (value: unknown): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : PROXY_LIMITS.maxOutputTokens
  return Math.min(Math.max(n, 1), PROXY_LIMITS.maxOutputTokens)
}

export type ProxyValidationResult =
  | { ok: true; request: ProxyRequest }
  | { ok: false; status: number; error: string }

// Validate + normalize an untrusted proxy body. Returns a sanitized request (model allow-listed,
// output tokens clamped) or a typed error with the HTTP status the proxy should return.
export const validateProxyRequest = (
  body: unknown,
  allowedModels: readonly string[] = defaultAllowedStoryModels(),
): ProxyValidationResult => {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid request body' }
  }

  const op = (body as { op?: unknown }).op

  if (op === 'generate') {
    const { model, system, prompt, json, maxOutputTokens } = body as Record<string, unknown>
    if (typeof model !== 'string' || !allowedModels.includes(model)) {
      return { ok: false, status: 400, error: 'model not allowed' }
    }
    if (typeof system !== 'string' || typeof prompt !== 'string') {
      return { ok: false, status: 400, error: 'system and prompt must be strings' }
    }
    if (system.length > PROXY_LIMITS.maxSystemChars || prompt.length > PROXY_LIMITS.maxPromptChars) {
      return { ok: false, status: 413, error: 'system or prompt is too large' }
    }
    const request: ProxyGenerateRequest = {
      op: 'generate',
      model,
      system,
      prompt,
      ...(json === true ? { json: true } : {}),
      maxOutputTokens: clampMaxOutputTokens(maxOutputTokens),
    }
    return { ok: true, request }
  }

  if (op === 'moderate') {
    const input = (body as { input?: unknown }).input
    if (typeof input !== 'string') {
      return { ok: false, status: 400, error: 'input must be a string' }
    }
    if (input.length > PROXY_LIMITS.maxInputChars) {
      return { ok: false, status: 413, error: 'input is too large' }
    }
    return { ok: true, request: { op: 'moderate', input } }
  }

  return { ok: false, status: 400, error: 'unknown op' }
}
