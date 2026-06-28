// Direct (client-side) OpenAI StoryAI adapter — the DEVELOPER / local-dev path (the OpenAI
// counterpart of geminiDeveloperStoryAi.ts).
//
// It calls the OpenAI API DIRECTLY from the browser with the official `openai` SDK and a
// client-exposed key (Vite's envPrefix makes the user's OPENAI_API_KEY readable as
// import.meta.env.OPENAI_API_KEY — see vite.config.ts + createStoryAI.ts). The SDK is
// dynamic-imported so it only loads when Story Mode is actually entered (keeps the first-load bundle
// unaffected, and keeps the node:test transpile from needing the dependency). Like the Gemini
// adapter this stays THIN: every prompt, JSON validation, timeout, retry/backoff, and fallback
// decision lives in the shared, unit-tested helpers (storyPrompts.ts + the `buildStoryAI` factory)
// and safety.ts; here we only wire the SDK transport and the output moderation pass.
//
// SECURITY: a client-embedded key is acceptable for LOCAL DEV ONLY — it is inlined into the public
// client build and visible to anyone who loads the app, and an OpenAI key is billable. Do NOT ship
// this path to a public bundle: use the same-origin proxy provider (openAiStoryAi.ts + devProxy/) or
// Firebase AI Logic (firebaseStoryAi.ts) at deploy so the key stays server-side. Because OpenAI text
// generation has no inline safety filter (unlike Gemini's safetySettings), the untrusted user choice
// also gets a free OpenAI Moderations pass (handed to the factory as `moderateRawChoice`).

import { buildStoryAI, type StoryTransportPurpose } from './buildStoryAI'
import { OPENAI_MODERATION_MODEL, extractCompletionText, extractModerationFlag, isReasoningModel } from './openAiProxyProtocol'
import type { StoryAI } from './storyAi'
import {
  STORY_RETRY,
  STORY_TIMEOUTS,
  SYSTEM_PREAMBLE,
  callWithBackoff,
  isTransientError,
  withTimeout,
} from './storyPrompts'

// Single default generation model, overridable via OPENAI_MODEL / VITE_OPENAI_MODEL (wired in
// createStoryAI). Kept as ONE constant so the default is trivial to change.
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'

export type OpenAiDeveloperStoryAiOptions = {
  model?: string
}

// A response whose visible content is empty (a reasoning model that spent its whole
// max_completion_tokens budget on hidden reasoning, or a blank/filtered output). Its own error type
// so the retry policy can treat it as transient without matching on real response content.
class EmptyCompletionError extends Error {
  constructor() {
    super('openai returned an empty completion')
    this.name = 'EmptyCompletionError'
  }
}

// Bounded retries on TRANSIENT failures (429/5xx/timeout/network) PLUS an empty completion, mirroring
// the proxy adapter (same name + shape, derived from the shared STORY_RETRY budget) so a reasoning
// model that returns no visible text is retried instead of dropping straight to bare fallbacks.
// Non-transient errors (bad request / auth / safety) still fail fast.
const EMPTY_AWARE_RETRY = {
  retries: STORY_RETRY.retries,
  isRetryable: (error: unknown) => error instanceof EmptyCompletionError || isTransientError(error),
} as const

// Output-token budgets: generous enough that a reasoning model (whose `max_completion_tokens` budget
// also covers hidden reasoning tokens) still has plenty of room for the visible ~2-paragraph beat.
// `max_completion_tokens` (not the deprecated `max_tokens`) is used for cross-model compatibility.
// The model is billed only for tokens it actually uses, so a short beat stays cheap; this is just the
// ceiling.
const MAX_TOKENS = {
  start: 4000,
  prose: 4000,
  retheme: 2000,
  scene: 1000,
  summarize: 1500,
  // The hidden story-bible (plan) is a longer, structured generation; reasoning models also spend
  // part of this budget on hidden reasoning, so keep it generous so the outline is not starved.
  bible: 4000,
} as const

export async function createOpenAiDeveloperStoryAI(
  apiKey: string,
  options: OpenAiDeveloperStoryAiOptions = {},
): Promise<StoryAI> {
  // Dynamic import keeps the SDK out of the first-load bundle (and out of the node:test transpile).
  const { default: OpenAI } = await import('openai')
  // `dangerouslyAllowBrowser` is REQUIRED for client-side use. `maxRetries: 0` makes our
  // callWithBackoff the single retry layer, so the SDK's own retries can't blow the per-call
  // withTimeout deadline.
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 })

  const model = options.model?.trim() || OPENAI_DEFAULT_MODEL

  // Run ONE Chat Completions call, wrapped in timeout + transient backoff. Returns the assistant
  // text, or null when the call ultimately fails (so each caller applies its own fallback).
  const generate = async (
    prompt: string,
    opts: { json?: boolean; maxOutputTokens: number },
    timeoutMs: number,
  ): Promise<string | null> => {
    try {
      return await callWithBackoff(async () => {
        const resp = await withTimeout(
          client.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: SYSTEM_PREAMBLE },
              { role: 'user', content: prompt },
            ],
            max_completion_tokens: opts.maxOutputTokens,
            // Keep reasoning LOW on reasoning-class models so hidden reasoning can't eat the whole
            // budget and return empty text; gated so non-reasoning models aren't sent it. ('low', not
            // 'minimal', which the gpt-5.4 models reject.)
            ...(isReasoningModel(model) ? { reasoning_effort: 'low' as const } : {}),
            ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
          }),
          timeoutMs,
          'openai',
        )
        const text = extractCompletionText(resp)
        // Treat an empty completion as retryable (see EmptyCompletionError) instead of returning null.
        if (text === null || text.trim() === '') throw new EmptyCompletionError()
        return text
      }, EMPTY_AWARE_RETRY)
    } catch {
      return null
    }
  }

  // Best-effort OpenAI Moderations check on the RAW user choice (the model-side net OpenAI text
  // generation lacks). Fails OPEN on infra errors (the local filter already screened the input) but
  // fails CLOSED on an actual content flag.
  const isModerationFlagged = async (input: string): Promise<boolean> => {
    try {
      const resp = await withTimeout(
        client.moderations.create({ model: OPENAI_MODERATION_MODEL, input }),
        STORY_TIMEOUTS.scene,
        'openai-moderation',
      )
      return extractModerationFlag(resp)
    } catch {
      return false
    }
  }

  // Per-purpose Chat Completions config (JSON mode + token budget) + deadline. This is the ONLY
  // OpenAI-specific knowledge the shared factory needs; the request shape, reasoning effort, retry,
  // empty handling, and timeout all live in `generate`. (Unchanged from the previous inline calls.)
  const optsFor: Record<StoryTransportPurpose, { json?: boolean; maxOutputTokens: number; timeoutMs: number }> = {
    start: { json: true, maxOutputTokens: MAX_TOKENS.start, timeoutMs: STORY_TIMEOUTS.start },
    retheme: { json: true, maxOutputTokens: MAX_TOKENS.retheme, timeoutMs: STORY_TIMEOUTS.retheme },
    prose: { maxOutputTokens: MAX_TOKENS.prose, timeoutMs: STORY_TIMEOUTS.prose },
    bible: { maxOutputTokens: MAX_TOKENS.bible, timeoutMs: STORY_TIMEOUTS.bible },
    scene: { maxOutputTokens: MAX_TOKENS.scene, timeoutMs: STORY_TIMEOUTS.scene },
    summarize: { maxOutputTokens: MAX_TOKENS.summarize, timeoutMs: STORY_TIMEOUTS.summarize },
  }

  return buildStoryAI({
    generate: (prompt, purpose) => {
      const { json, maxOutputTokens, timeoutMs } = optsFor[purpose]
      return generate(prompt, { json, maxOutputTokens }, timeoutMs)
    },
    moderateRawChoice: isModerationFlagged,
  })
}
