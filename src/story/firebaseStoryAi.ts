// Deploy-time StoryAI adapter (plan 5.1, 5.2) — code only; App Check provisioning is a
// separate operator task (plan 6.2/6.3).
//
// Uses Firebase AI Logic (`firebase/ai` -> `GoogleAIBackend`, the same FREE Gemini
// Developer API) initialized from the existing `FirebaseServices.app`, so the key stays
// off the client (protected by App Check at deploy). Same safety settings, models, and
// StoryAI surface as the local adapter, so swapping local -> deployed is a factory change,
// not an app-code change. The SDK is dynamic-imported for the same bundle reason, and all
// testable logic lives in the shared `storyPrompts`/`safety`/`applyRetheme` helpers.

import type { FirebaseServices } from '../firebaseServices'
import { isOutputSafe, moderateUserInput } from './safety'
import type { RethemeRequest, RethemeResult, StoryAI } from './storyAi'
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
  buildSummarizePrompt,
  callWithBackoff,
  isStringRecord,
  parseRethemeResult,
  parseSceneId,
  withTimeout,
} from './storyPrompts'

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

  // Prose beats THROW on failure/timeout/safety-block so the controller picks the right theme-aware,
  // per-beat fallback (never reprinting the opening as an "outcome"). Transient failures were already
  // retried inside `run`.
  const runProse = async (prompt: string, timeoutMs: number): Promise<string> => {
    const text = (await run(proseModels, prompt, timeoutMs))?.trim() ?? ''
    if (!text || !isOutputSafe(text)) {
      throw new Error('story-ai: prose generation failed or was blocked')
    }
    return text
  }

  return {
    async startStory(theme) {
      // Start THROWS on failure so the controller's catch uses its theme-aware opening fallback +
      // interest-aware protagonist (instead of a canned opening + "the Explorer").
      const raw = await run(startModels, buildStartStoryPrompt(theme), STORY_TIMEOUTS.start)
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
      const raw = await run(rethemeModels, buildRethemePrompt(req), STORY_TIMEOUTS.retheme)
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
      return runProse(buildSegmentPrompt(input), STORY_TIMEOUTS.prose)
    },

    async continueStory(input) {
      const moderation = moderateUserInput(input.userChoice)
      const safeChoice = moderation.ok ? moderation.sanitized : ''
      return runProse(buildContinuePrompt({ ...input, userChoice: safeChoice }), STORY_TIMEOUTS.prose)
    },

    async pickScene(input) {
      // One catalog id (or "none"); a failure/timeout or unknown id parses to null -> no image.
      const raw = await run(sceneModels, buildScenePrompt(input), STORY_TIMEOUTS.scene)
      return parseSceneId(raw)
    },

    async summarize(input) {
      const text = (await run(summarizeModels, buildSummarizePrompt(input), STORY_TIMEOUTS.summarize))?.trim() ?? ''
      return text && isOutputSafe(text) ? text : ''
    },
  }
}
