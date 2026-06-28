// OpenAI StoryAI adapter (deploy/proxy path) — code only.
//
// SECURITY: this adapter NEVER holds the OpenAI key. It only POSTs the normalized
// `openAiProxyProtocol` request to a same-origin server proxy (VITE_STORY_AI_PROXY_URL); the proxy
// (local dev: devProxy/storyAiProxyPlugin.ts) is the only place the `sk-...` key lives. That keeps
// the billable secret entirely off the client — see the build guard in src/secretScan.ts.
//
// Like the Gemini adapters this stays THIN: every prompt, JSON validation, timeout, retry/backoff,
// and fallback decision lives in the shared, unit-tested helpers (storyPrompts.ts + the
// `buildStoryAI` factory) and safety.ts. Here we only wire the proxy transport and the output
// moderation pass. OpenAI text generation has no inline safety filter (unlike Gemini's
// safetySettings), so the untrusted user choice also gets a free OpenAI Moderations pass via the
// proxy (handed to the factory as `moderateRawChoice`).

import { buildStoryAI, type StoryTransportPurpose } from './buildStoryAI'
import {
  OPENAI_STORY_MODELS,
  type ProxyGenerateRequest,
  type ProxyGenerateResponse,
  type ProxyModerateRequest,
  type ProxyModerateResponse,
} from './openAiProxyProtocol'
import type { StoryAI } from './storyAi'
import {
  STORY_RETRY,
  STORY_TIMEOUTS,
  SYSTEM_PREAMBLE,
  callWithBackoff,
  isTransientError,
  withTimeout,
} from './storyPrompts'

export type OpenAiStoryAiOptions = {
  primaryModel?: string
  fallbackModel?: string
}

// A 200 proxy response whose `text` is empty — the dominant intermittent failure: a reasoning model
// that spent its whole `max_completion_tokens` budget on hidden reasoning (or a blank/filtered
// output) returns no visible text. Modeled as its own error so the retry policy can treat it as
// transient WITHOUT matching on real response content.
class EmptyCompletionError extends Error {
  constructor() {
    super('openai-proxy returned an empty completion')
    this.name = 'EmptyCompletionError'
  }
}

// Retry policy for generation: the shared transient set (429/5xx/timeout/network) PLUS an empty
// completion. An empty result therefore RETRIES the same model and, if it still comes back empty,
// `generate` falls through to the fallback (nano) model — instead of instantly returning null and
// dropping the learner onto the offline default beat.
const EMPTY_AWARE_RETRY = {
  retries: STORY_RETRY.retries,
  isRetryable: (error: unknown) => error instanceof EmptyCompletionError || isTransientError(error),
} as const

// Output-token budgets. GPT-5.x are reasoning models whose `max_completion_tokens` budget also covers
// hidden reasoning tokens, so tiny caps could starve the visible answer. These are generous so even a
// turn that does some reasoning still has plenty of room for the actual text; the model is billed for
// tokens it actually uses (a short beat stays cheap), the budget is just the ceiling.
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

export function createOpenAiStoryAI(proxyUrl: string, options: OpenAiStoryAiOptions = {}): StoryAI {
  const primary = options.primaryModel || OPENAI_STORY_MODELS.primary
  const fallbackModel = options.fallbackModel || OPENAI_STORY_MODELS.fallback

  // POST a protocol request to the proxy. Non-2xx becomes an error carrying the HTTP status so the
  // backoff layer can treat 429/5xx/timeouts as transient (and retry) but fail fast on 4xx.
  const postToProxy = async <T>(
    body: ProxyGenerateRequest | ProxyModerateRequest,
    timeoutMs: number,
  ): Promise<T> => {
    const res = await withTimeout(
      fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      timeoutMs,
      'openai-proxy',
    )
    if (!res.ok) {
      const error = new Error(`openai-proxy ${res.status}`) as Error & { status: number }
      error.status = res.status
      throw error
    }
    return (await res.json()) as T
  }

  // Generate text: try the primary model, then the fallback; each wrapped in timeout + transient
  // backoff. Returns null only when BOTH models fail.
  const generate = async (
    prompt: string,
    opts: { json?: boolean; maxOutputTokens: number },
    timeoutMs: number,
  ): Promise<string | null> => {
    const attempt = (model: string) =>
      callWithBackoff(async () => {
        const req: ProxyGenerateRequest = {
          op: 'generate',
          model,
          system: SYSTEM_PREAMBLE,
          prompt,
          json: opts.json,
          maxOutputTokens: opts.maxOutputTokens,
        }
        const res = await postToProxy<ProxyGenerateResponse>(req, timeoutMs)
        const text = typeof res.text === 'string' ? res.text : ''
        // A 200 with EMPTY text is the main intermittent failure (a reasoning model whose hidden
        // reasoning ate the whole token budget). Throw so the backoff retries this model — and, if
        // it stays empty, the catch below falls through to the fallback model — rather than letting
        // a single blank reply collapse straight to the offline default beat.
        if (text.trim() === '') throw new EmptyCompletionError()
        return text
      }, EMPTY_AWARE_RETRY)
    try {
      return await attempt(primary)
    } catch {
      try {
        return await attempt(fallbackModel)
      } catch {
        return null
      }
    }
  }

  // Best-effort OpenAI Moderations check on the raw user choice. Fails OPEN on infra errors (the
  // local safety filter already screened the input) but fails CLOSED on an actual content flag.
  const isModerationFlagged = async (input: string): Promise<boolean> => {
    try {
      const req: ProxyModerateRequest = { op: 'moderate', input }
      const res = await postToProxy<ProxyModerateResponse>(req, STORY_TIMEOUTS.scene)
      return Boolean(res.flagged)
    } catch {
      return false
    }
  }

  // Per-purpose proxy generation config (JSON mode + token budget) + deadline. This is the ONLY
  // proxy-specific knowledge the shared factory needs; the request shape, model fallback, retry,
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
