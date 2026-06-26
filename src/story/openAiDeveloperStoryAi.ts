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

import { OPENAI_MODERATION_MODEL, extractCompletionText, extractModerationFlag } from './openAiProxyProtocol'
import { isOutputSafe, moderateUserInput } from './safety'
import type { RethemeRequest, RethemeResult, StoryAI } from './storyAi'
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

// Bounded retries on TRANSIENT failures (429/5xx/timeout/network), mirroring the Gemini adapter so
// the session-start burst recovers instead of dropping straight to bare fallbacks. Non-transient
// errors (bad request / auth / safety) still fail fast.
const STORY_RETRY = { retries: 2, isRetryable: isTransientError } as const

// Output-token budgets: generous enough for ~2-paragraph beats while staying cheap for a dev
// workload. `max_completion_tokens` (not the deprecated `max_tokens`) is used so the request also
// works on reasoning-class models whose budget also covers hidden reasoning tokens.
const MAX_TOKENS = {
  start: 1200,
  prose: 1200,
  retheme: 800,
  scene: 256,
  summarize: 512,
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
            ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
          }),
          timeoutMs,
          'openai',
        )
        return extractCompletionText(resp)
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
