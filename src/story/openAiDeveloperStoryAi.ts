// Direct (client-side) OpenAI StoryAI adapter — the DEVELOPER / local-dev path (the OpenAI
// counterpart of geminiDeveloperStoryAi.ts).
//
// It calls the OpenAI API DIRECTLY from the browser with the official `openai` SDK and a
// client-exposed key (Vite's envPrefix makes the user's OPENAI_API_KEY readable as
// import.meta.env.OPENAI_API_KEY — see vite.config.ts + createStoryAI.ts). The SDK is
// dynamic-imported so it only loads when Story Mode is actually entered (keeps the first-load bundle
// unaffected, and keeps the node:test transpile from needing the dependency). Like the Gemini
// adapter this stays THIN: every prompt, JSON validation, timeout, retry/backoff, and fallback
// decision lives in the shared, unit-tested helpers (storyPrompts.ts) and safety.ts; here we only
// wire the SDK transport and apply output moderation.
//
// SECURITY: a client-embedded key is acceptable for LOCAL DEV ONLY — it is inlined into the public
// client build and visible to anyone who loads the app, and an OpenAI key is billable. Do NOT ship
// this path to a public bundle: use the same-origin proxy provider (openAiStoryAi.ts + devProxy/) or
// Firebase AI Logic (firebaseStoryAi.ts) at deploy so the key stays server-side. Because OpenAI text
// generation has no inline safety filter (unlike Gemini's safetySettings), the untrusted user choice
// also gets a free OpenAI Moderations pass in addition to the local safety helpers.

import { OPENAI_MODERATION_MODEL, extractCompletionText, extractModerationFlag, isReasoningModel } from './openAiProxyProtocol'
import { isOutputSafe, moderateUserInput } from './safety'
import { buildSceneMatchPrompt } from './sceneMatchPrompt'
import type { RethemeRequest, RethemeResult, SceneMatchRequest, StoryAI } from './storyAi'
import {
  RETHEME_FALLBACK,
  STORY_TIMEOUTS,
  SYSTEM_PREAMBLE,
  buildContinuePrompt,
  buildRethemePrompt,
  buildScenePrompt,
  buildSegmentPrompt,
  buildStartStoryPrompt,
  buildSummarizePrompt,
  callWithBackoff,
  isTransientError,
  parseRethemeResult,
  parseSceneId,
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
// the proxy adapter so a reasoning model that returns no visible text is retried instead of dropping
// straight to bare fallbacks. Non-transient errors (bad request / auth / safety) still fail fast.
const STORY_RETRY = {
  retries: 2,
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
} as const

const isStringRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

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
      }, STORY_RETRY)
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
      // Start THROWS on failure so the controller's catch uses its theme-aware DEFAULT_OPENING +
      // interest-aware protagonist (instead of a canned opening + "the Explorer").
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
      // Output moderation on every themed string; a hit forces the original (un-themed) question.
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
      const raw = await generate(
        buildSummarizePrompt(input),
        { maxOutputTokens: MAX_TOKENS.summarize },
        STORY_TIMEOUTS.summarize,
      )
      const text = (raw ?? '').trim()
      // If summarization fails/blocks, keep the existing narrative untouched (empty signal).
      return text && isOutputSafe(text) ? text : ''
    },
  }
}
