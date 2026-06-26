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
  if (typeof req.maxOutputTokens === 'number') body.max_completion_tokens = req.maxOutputTokens
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
