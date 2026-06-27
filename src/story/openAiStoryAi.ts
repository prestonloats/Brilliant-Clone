// OpenAI StoryAI adapter (deploy/proxy path) — code only.
//
// SECURITY: this adapter NEVER holds the OpenAI key. It only POSTs the normalized
// `openAiProxyProtocol` request to a same-origin server proxy (VITE_STORY_AI_PROXY_URL); the proxy
// (local dev: devProxy/storyAiProxyPlugin.ts) is the only place the `sk-...` key lives. That keeps
// the billable secret entirely off the client — see the build guard in src/secretScan.ts.
//
// Like the Gemini adapters this stays THIN: every prompt, JSON validation, timeout, retry/backoff,
// and fallback decision lives in the shared, unit-tested helpers (storyPrompts.ts) and safety.ts.
// Here we only wire the proxy transport and apply output moderation. OpenAI text generation has no
// inline safety filter (unlike Gemini's safetySettings), so the untrusted user choice also gets a
// free OpenAI Moderations pass via the proxy.

import {
  OPENAI_STORY_MODELS,
  type ProxyGenerateRequest,
  type ProxyGenerateResponse,
  type ProxyModerateRequest,
  type ProxyModerateResponse,
} from './openAiProxyProtocol'
import { isOutputSafe, moderateUserInput } from './safety'
import { buildSceneMatchPrompt } from './sceneMatchPrompt'
import type { RethemeRequest, RethemeResult, SceneMatchRequest, StoryAI } from './storyAi'
import {
  RETHEME_FALLBACK,
  STORY_RETRY,
  STORY_TIMEOUTS,
  SYSTEM_PREAMBLE,
  buildContinuePrompt,
  buildRethemePrompt,
  buildScenePrompt,
  buildSegmentPrompt,
  buildStartStoryPrompt,
  buildSummarizePrompt,
  callWithBackoff,
  isStringRecord,
  isTransientError,
  parseRethemeResult,
  parseSceneId,
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

  // Prose beats THROW on failure/timeout/safety-block so the controller picks the right theme-aware,
  // per-beat fallback (never reprinting the opening as an "outcome"). Transient failures were already
  // retried inside `generate`.
  const generateProse = async (prompt: string, timeoutMs: number): Promise<string> => {
    const text = (await generate(prompt, { maxOutputTokens: MAX_TOKENS.prose }, timeoutMs))?.trim() ?? ''
    if (!text || !isOutputSafe(text)) {
      throw new Error('story-ai: prose generation failed or was blocked')
    }
    return text
  }

  return {
    async startStory(theme) {
      const raw = await generate(
        buildStartStoryPrompt(theme),
        { json: true, maxOutputTokens: MAX_TOKENS.start },
        STORY_TIMEOUTS.start,
      )
      if (!raw) throw new Error('story-ai: start generation failed')
      try {
        const data: unknown = JSON.parse(raw)
        if (
          isStringRecord(data) &&
          typeof data.premise === 'string' &&
          typeof data.protagonist === 'string' &&
          typeof data.opening === 'string' &&
          isOutputSafe(`${data.premise} ${data.protagonist} ${data.opening}`)
        ) {
          return { premise: data.premise, protagonist: data.protagonist, opening: data.opening }
        }
      } catch {
        /* fall through to throw */
      }
      throw new Error('story-ai: start response invalid or blocked')
    },

    async rethemeQuestion(req: RethemeRequest): Promise<RethemeResult> {
      const raw = await generate(
        buildRethemePrompt(req),
        { json: true, maxOutputTokens: MAX_TOKENS.retheme },
        STORY_TIMEOUTS.retheme,
      )
      if (!raw) return RETHEME_FALLBACK
      const parsed = parseRethemeResult(raw)
      if (!parsed) return RETHEME_FALLBACK
      const texts = [
        parsed.themedPrompt,
        ...(parsed.themedOptions ?? []).map((o) => o.label),
        ...(parsed.themedTiles ?? []).map((t) => t.label),
      ]
      if (!texts.every((t) => isOutputSafe(t))) return RETHEME_FALLBACK
      return parsed
    },

    async writeSegment(input) {
      return generateProse(buildSegmentPrompt(input), STORY_TIMEOUTS.prose)
    },

    async continueStory(input) {
      // Input sanitization + local moderation BEFORE the model, then a free OpenAI Moderations pass
      // on the raw choice as the model-side safety net. Any block blanks the choice so the prompt's
      // "steer back safely" instruction applies instead.
      const moderation = moderateUserInput(input.userChoice)
      let safeChoice = moderation.ok ? moderation.sanitized : ''
      if (safeChoice && (await isModerationFlagged(input.userChoice))) safeChoice = ''
      return generateProse(buildContinuePrompt({ ...input, userChoice: safeChoice }), STORY_TIMEOUTS.prose)
    },

    async pickScene(input) {
      // One catalog id (or "none"); a failure/timeout or unknown id parses to null -> no image.
      const raw = await generate(buildScenePrompt(input), { maxOutputTokens: MAX_TOKENS.scene }, STORY_TIMEOUTS.scene)
      return parseSceneId(raw)
    },

    async matchSceneToInterests(req: SceneMatchRequest) {
      // Closest-match picker (rules 5 & 6): same tiny single-id classification as pickScene, matched
      // against the candidate shortlist + interests. A failure/timeout, the NO_SCENE sentinel, or an
      // unknown id all parse to null -> no image when nothing is close enough.
      const raw = await generate(buildSceneMatchPrompt(req), { maxOutputTokens: MAX_TOKENS.scene }, STORY_TIMEOUTS.scene)
      return parseSceneId(raw)
    },

    async summarize(input) {
      const text =
        (await generate(buildSummarizePrompt(input), { maxOutputTokens: MAX_TOKENS.summarize }, STORY_TIMEOUTS.summarize))?.trim() ??
        ''
      return text && isOutputSafe(text) ? text : ''
    },
  }
}
