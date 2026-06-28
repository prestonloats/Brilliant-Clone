// Local-first v1 StoryAI adapter (plan 5.1, 5.2).
//
// Calls the FREE Gemini Developer API directly from the client with `@google/genai` and a
// gitignored `VITE_GEMINI_API_KEY`. The SDK is dynamic-imported so it is only fetched when
// Story Mode is entered (keeps the first-load bundle unaffected). This adapter stays THIN:
// every prompt, JSON validation, timeout, retry/backoff, and fallback decision lives in the
// shared, unit-tested helpers (`storyPrompts.ts` + the `buildStoryAI` factory) and
// `applyRetheme`/`safety`; here we only wire the SDK transport (request shape, schemas, model
// selection, generation config) and hand it to the factory.
//
// SECURITY: a client-embedded key is acceptable for LOCAL DEV ONLY. Do not ship this path
// to a public bundle — use `firebaseStoryAi.ts` (App Check) or a proxy at deploy.

import { buildStoryAI, type StoryTransportPurpose } from './buildStoryAI'
import type { StoryAI } from './storyAi'
import {
  STORY_MODELS,
  STORY_RETRY,
  STORY_TIMEOUTS,
  SYSTEM_PREAMBLE,
  callWithBackoff,
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

  // Per-purpose Gemini generation config (temperature, JSON schema, token budget) + deadline. This
  // is the ONLY Gemini-specific knowledge the shared factory needs; the request shape, model
  // fallback, retry, and timeout all live in `generate` above. (Unchanged from the previous inline
  // calls: start caps at 600 tokens, re-theme/start emit structured JSON, scene is deterministic.)
  const configFor: Record<StoryTransportPurpose, { config: Record<string, unknown>; timeoutMs: number }> = {
    start: {
      config: { temperature: 0.9, responseMimeType: 'application/json', responseSchema: startSchema, maxOutputTokens: 600 },
      timeoutMs: STORY_TIMEOUTS.start,
    },
    retheme: {
      config: { temperature: 0.7, responseMimeType: 'application/json', responseSchema: rethemeSchema },
      timeoutMs: STORY_TIMEOUTS.retheme,
    },
    prose: { config: { temperature: 0.9, maxOutputTokens: 600 }, timeoutMs: STORY_TIMEOUTS.prose },
    bible: { config: { temperature: 0.7, maxOutputTokens: 1200 }, timeoutMs: STORY_TIMEOUTS.bible },
    scene: { config: { temperature: 0, maxOutputTokens: 32 }, timeoutMs: STORY_TIMEOUTS.scene },
    summarize: { config: { temperature: 0.3, maxOutputTokens: 256 }, timeoutMs: STORY_TIMEOUTS.summarize },
  }

  return buildStoryAI({
    generate: (prompt, purpose) => {
      const { config, timeoutMs } = configFor[purpose]
      return generate(prompt, config, timeoutMs)
    },
  })
}
