// Local-first v1 StoryAI adapter (plan 5.1, 5.2).
//
// Calls the FREE Gemini Developer API directly from the client with `@google/genai` and a
// gitignored `VITE_GEMINI_API_KEY`. The SDK is dynamic-imported so it is only fetched when
// Story Mode is entered (keeps the first-load bundle unaffected). This adapter stays THIN:
// every prompt, JSON validation, timeout, retry/backoff, and fallback decision lives in the
// shared, unit-tested helpers (`storyPrompts.ts`) and `applyRetheme`/`safety`; here we only
// wire the SDK and apply output moderation.
//
// SECURITY: a client-embedded key is acceptable for LOCAL DEV ONLY. Do not ship this path
// to a public bundle — use `firebaseStoryAi.ts` (App Check) or a proxy at deploy.

import { isOutputSafe, moderateUserInput } from './safety'
import { buildSceneMatchPrompt } from './sceneMatchPrompt'
import type { RethemeRequest, RethemeResult, SceneMatchRequest, StoryAI } from './storyAi'
import {
  RETHEME_FALLBACK,
  STORY_MODELS,
  STORY_RETRY,
  STORY_TIMEOUTS,
  SYSTEM_PREAMBLE,
  buildContinuePrompt,
  buildRethemePrompt,
  buildScenePrompt,
  buildSegmentPrompt,
  buildStartStoryPrompt,
  buildStoryBiblePrompt,
  buildSummarizePrompt,
  callWithBackoff,
  isStringRecord,
  parseRethemeResult,
  parseSceneId,
  withTimeout,
} from './storyPrompts'

export type GeminiStoryAiOptions = {
  primaryModel?: string
  fallbackModel?: string
}

export async function createGeminiDeveloperStoryAI(
  apiKey: string,
  options: GeminiStoryAiOptions = {},
): Promise<StoryAI> {
  const { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  // Block harmful categories for the teen audience (plan 5.6) — never rely on defaults.
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  ]

  const primary = options.primaryModel || STORY_MODELS.primary
  const fallbackModel = options.fallbackModel || STORY_MODELS.fallback

  const labeledItemSchema = {
    type: Type.OBJECT,
    properties: { id: { type: Type.STRING }, label: { type: Type.STRING } },
    required: ['id', 'label'],
  }
  const rethemeSchema = {
    type: Type.OBJECT,
    properties: {
      themedPrompt: { type: Type.STRING },
      themedOptions: { type: Type.ARRAY, items: labeledItemSchema },
      themedTiles: { type: Type.ARRAY, items: labeledItemSchema },
    },
    required: ['themedPrompt'],
  }
  const startSchema = {
    type: Type.OBJECT,
    properties: {
      premise: { type: Type.STRING },
      protagonist: { type: Type.STRING },
      opening: { type: Type.STRING },
    },
    required: ['premise', 'protagonist', 'opening'],
  }

  // Run one generateContent call against a model, wrapped in timeout + quota backoff.
  // Returns the response text, or null if both the primary and fallback model fail.
  const generate = async (
    contents: string,
    config: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<string | null> => {
    const attempt = (model: string) =>
      callWithBackoff(
        () =>
          withTimeout(
            ai.models.generateContent({
              model,
              contents,
              config: { systemInstruction: SYSTEM_PREAMBLE, safetySettings, ...config },
            }),
            timeoutMs,
            model,
          ),
        STORY_RETRY,
      )
    try {
      const res = await attempt(primary)
      return res.text ?? null
    } catch {
      try {
        const res = await attempt(fallbackModel)
        return res.text ?? null
      } catch {
        return null
      }
    }
  }

  // Prose beats THROW on failure/timeout/safety-block instead of returning a canned string, so the
  // controller can pick the right theme-aware, per-beat fallback (and can never reprint the opening
  // verbatim as an "outcome"). Transient failures were already retried inside `generate`.
  const generateProse = async (contents: string, timeoutMs: number): Promise<string> => {
    const raw = await generate(contents, { temperature: 0.9, maxOutputTokens: 600 }, timeoutMs)
    const text = (raw ?? '').trim()
    // Output filtering (plan 5.6 layer 4): empty or unsafe output is a failure the caller handles.
    if (!text || !isOutputSafe(text)) {
      throw new Error('story-ai: prose generation failed or was blocked')
    }
    return text
  }

  return {
    async startStory(theme) {
      // Start THROWS on failure (instead of returning a canned opening + "the Explorer"), so the
      // controller's catch uses its theme-aware opening fallback + interest-aware protagonist.
      const raw = await generate(
        buildStartStoryPrompt(theme),
        { temperature: 0.9, responseMimeType: 'application/json', responseSchema: startSchema, maxOutputTokens: 600 },
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
        { temperature: 0.7, responseMimeType: 'application/json', responseSchema: rethemeSchema },
        STORY_TIMEOUTS.retheme,
      )
      if (!raw) return RETHEME_FALLBACK
      const parsed = parseRethemeResult(raw)
      if (!parsed) return RETHEME_FALLBACK
      // Output moderation on every themed string; a hit forces the original question.
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

    async writeStoryBible(req) {
      // The hidden plan: a longer, structured generation. A bigger token budget than a single beat
      // so the ~250-450-word outline is not truncated. On any failure/empty/unsafe output we return
      // '' so the controller keeps the existing plan (never throws into the play loop), like summarize.
      const raw = await generate(
        buildStoryBiblePrompt(req),
        { temperature: 0.7, maxOutputTokens: 1200 },
        STORY_TIMEOUTS.bible,
      )
      const text = (raw ?? '').trim()
      return text && isOutputSafe(text) ? text : ''
    },

    async continueStory(input) {
      // Input sanitization + moderation BEFORE the model (plan 5.6 layer 3). An unsafe or
      // empty choice becomes blank so the prompt's "steer back safely" instruction applies.
      const moderation = moderateUserInput(input.userChoice)
      const safeChoice = moderation.ok ? moderation.sanitized : ''
      return generateProse(buildContinuePrompt({ ...input, userChoice: safeChoice }), STORY_TIMEOUTS.prose)
    },

    async pickScene(input) {
      // Deterministic, tiny output: ask for one catalog id (or "none"). Any failure/timeout or
      // an unknown id parses to null, so the caller just shows no image.
      const raw = await generate(
        buildScenePrompt(input),
        { temperature: 0, maxOutputTokens: 32 },
        STORY_TIMEOUTS.scene,
      )
      return parseSceneId(raw)
    },

    async matchSceneToInterests(req: SceneMatchRequest) {
      // Closest-match picker (rules 5 & 6): same tiny single-id classification as pickScene, but
      // matched against the candidate shortlist + interests. A failure/timeout, the NO_SCENE
      // sentinel, or an unknown id all parse to null -> the caller shows no image when nothing is
      // close enough.
      const raw = await generate(
        buildSceneMatchPrompt(req),
        { temperature: 0, maxOutputTokens: 32 },
        STORY_TIMEOUTS.scene,
      )
      return parseSceneId(raw)
    },

    async summarize(input) {
      const raw = await generate(buildSummarizePrompt(input), { temperature: 0.3, maxOutputTokens: 256 }, STORY_TIMEOUTS.summarize)
      const text = (raw ?? '').trim()
      // If summarization fails/blocks, keep the existing narrative untouched (empty signal).
      return text && isOutputSafe(text) ? text : ''
    },
  }
}
