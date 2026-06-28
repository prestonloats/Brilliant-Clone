// Deploy-time StoryAI adapter (plan 5.1, 5.2) — code only; App Check provisioning is a
// separate operator task (plan 6.2/6.3).
//
// Uses Firebase AI Logic (`firebase/ai` -> `GoogleAIBackend`, the same FREE Gemini
// Developer API) initialized from the existing `FirebaseServices.app`, so the key stays
// off the client (protected by App Check at deploy). Same safety settings, models, and
// StoryAI surface as the local adapter, so swapping local -> deployed is a factory change,
// not an app-code change. The SDK is dynamic-imported for the same bundle reason, and all
// testable logic lives in the shared `storyPrompts`/`safety`/`applyRetheme` helpers + the
// `buildStoryAI` factory; here we only wire the SDK transport (pre-built models per call kind).

import { buildStoryAI, type StoryTransportPurpose } from './buildStoryAI'
import type { FirebaseServices } from '../firebaseServices'
import type { StoryAI } from './storyAi'
import { STORY_MODELS, STORY_RETRY, STORY_TIMEOUTS, SYSTEM_PREAMBLE, callWithBackoff, withTimeout } from './storyPrompts'

export type FirebaseStoryAiOptions = {
  primaryModel?: string
  fallbackModel?: string
}

export async function createFirebaseStoryAI(
  services: FirebaseServices,
  options: FirebaseStoryAiOptions = {},
): Promise<StoryAI> {
  const { getAI, getGenerativeModel, GoogleAIBackend, Schema, HarmCategory, HarmBlockThreshold } = await import(
    'firebase/ai'
  )
  const ai = getAI(services.app, { backend: new GoogleAIBackend() })

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  ]

  const primary = options.primaryModel || STORY_MODELS.primary
  const fallbackModel = options.fallbackModel || STORY_MODELS.fallback

  const labeledList = () =>
    Schema.array({ items: Schema.object({ properties: { id: Schema.string(), label: Schema.string() } }) })
  const rethemeSchema = Schema.object({
    properties: { themedPrompt: Schema.string(), themedOptions: labeledList(), themedTiles: labeledList() },
    optionalProperties: ['themedOptions', 'themedTiles'],
  })
  const startSchema = Schema.object({
    properties: { premise: Schema.string(), protagonist: Schema.string(), opening: Schema.string() },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeModel = (model: string, generationConfig: Record<string, any>) =>
    getGenerativeModel(ai, { model, safetySettings, systemInstruction: SYSTEM_PREAMBLE, generationConfig })

  const rethemeModels = [
    makeModel(primary, { temperature: 0.7, responseMimeType: 'application/json', responseSchema: rethemeSchema }),
    makeModel(fallbackModel, { temperature: 0.7, responseMimeType: 'application/json', responseSchema: rethemeSchema }),
  ]
  const startModels = [
    makeModel(primary, { temperature: 0.9, responseMimeType: 'application/json', responseSchema: startSchema }),
    makeModel(fallbackModel, { temperature: 0.9, responseMimeType: 'application/json', responseSchema: startSchema }),
  ]
  const proseModels = [
    makeModel(primary, { temperature: 0.9, maxOutputTokens: 600 }),
    makeModel(fallbackModel, { temperature: 0.9, maxOutputTokens: 600 }),
  ]
  // The hidden story-bible (plan) is a longer, structured generation, so it gets a bigger budget
  // than a single beat so the ~250-450-word outline is not truncated.
  const bibleModels = [
    makeModel(primary, { temperature: 0.7, maxOutputTokens: 1200 }),
    makeModel(fallbackModel, { temperature: 0.7, maxOutputTokens: 1200 }),
  ]
  const summarizeModels = [
    makeModel(primary, { temperature: 0.3, maxOutputTokens: 256 }),
    makeModel(fallbackModel, { temperature: 0.3, maxOutputTokens: 256 }),
  ]
  // Scene matching: deterministic, tiny output (a single catalog id or "none").
  const sceneModels = [
    makeModel(primary, { temperature: 0, maxOutputTokens: 32 }),
    makeModel(fallbackModel, { temperature: 0, maxOutputTokens: 32 }),
  ]

  type Model = ReturnType<typeof getGenerativeModel>

  // Try the primary model, then the fallback model; each wrapped in timeout + quota backoff.
  const run = async (models: Model[], prompt: string, timeoutMs: number): Promise<string | null> => {
    const attempt = (model: Model) =>
      callWithBackoff(
        () =>
          withTimeout(
            model.generateContent(prompt).then((result) => result.response.text()),
            timeoutMs,
            'firebase-ai',
          ),
        STORY_RETRY,
      )
    for (const model of models) {
      try {
        return await attempt(model)
      } catch {
        /* try the next model */
      }
    }
    return null
  }

  // Per-purpose model list + deadline. This is the ONLY Firebase-specific knowledge the shared
  // factory needs; the per-call generation config is baked into the pre-built models above, and the
  // model fallback, retry, and timeout live in `run`. (pickScene + matchSceneToInterests share the
  // deterministic sceneModels, exactly as before.)
  const modelsFor: Record<StoryTransportPurpose, { models: Model[]; timeoutMs: number }> = {
    start: { models: startModels, timeoutMs: STORY_TIMEOUTS.start },
    retheme: { models: rethemeModels, timeoutMs: STORY_TIMEOUTS.retheme },
    prose: { models: proseModels, timeoutMs: STORY_TIMEOUTS.prose },
    bible: { models: bibleModels, timeoutMs: STORY_TIMEOUTS.bible },
    scene: { models: sceneModels, timeoutMs: STORY_TIMEOUTS.scene },
    summarize: { models: summarizeModels, timeoutMs: STORY_TIMEOUTS.summarize },
  }

  return buildStoryAI({
    generate: (prompt, purpose) => {
      const { models, timeoutMs } = modelsFor[purpose]
      return run(models, prompt, timeoutMs)
    },
  })
}
