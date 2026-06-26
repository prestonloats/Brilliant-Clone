// Environment-based StoryAI provider selection (plan 5.1).
//
// Pure selection so the controller/UI stays agnostic to which provider is live. The concrete
// adapters are dynamic-imported per branch so neither SDK (nor its pure helpers) loads until a
// provider is actually chosen — preserving the lazy-load intent of the plan.
//
// The controller calls `createStoryAI(import.meta.env)` and `await`s the result (which may be null
// when no provider is configured, so the entry card can show the "add a key" hint instead of
// hard-failing). The actual provider CHOICE is factored into the pure `selectStoryProvider` below so
// it is unit-testable without importing/constructing any SDK.

import type { StoryAI } from './storyAi'
import { openAiKey, selectStoryProvider, type StoryAiEnv } from './selectStoryProvider'

// Re-export the pure selection surface so existing importers keep using `./createStoryAI` unchanged.
export { openAiKey, selectStoryProvider } from './selectStoryProvider'
export type { StoryAiEnv, StoryProviderKind } from './selectStoryProvider'

const modelOptions = (env: StoryAiEnv) =>
  env.VITE_STORY_AI_MODEL ? { primaryModel: env.VITE_STORY_AI_MODEL } : {}

async function createFirebaseProvider(env: StoryAiEnv): Promise<StoryAI | null> {
  const [{ getFirebaseServices }, { createFirebaseStoryAI }] = await Promise.all([
    import('../firebaseServices'),
    import('./firebaseStoryAi'),
  ])
  const services = getFirebaseServices()
  if (!services) return null // Firebase not configured; caller shows the not-configured hint.
  return createFirebaseStoryAI(services, modelOptions(env))
}

async function createGeminiProvider(env: StoryAiEnv, apiKey: string): Promise<StoryAI> {
  const { createGeminiDeveloperStoryAI } = await import('./geminiDeveloperStoryAi')
  return createGeminiDeveloperStoryAI(apiKey, modelOptions(env))
}

// Direct, client-side OpenAI (the user's key in the browser). The model knob is OpenAI-specific
// (OPENAI_MODEL / VITE_OPENAI_MODEL); the adapter falls back to OPENAI_DEFAULT_MODEL when unset.
async function createOpenAiDeveloperProvider(env: StoryAiEnv, apiKey: string): Promise<StoryAI> {
  const { createOpenAiDeveloperStoryAI } = await import('./openAiDeveloperStoryAi')
  const model = (env.OPENAI_MODEL || env.VITE_OPENAI_MODEL || '').trim()
  return createOpenAiDeveloperStoryAI(apiKey, model ? { model } : {})
}

async function createProxyProvider(env: StoryAiEnv): Promise<StoryAI> {
  const url = env.VITE_STORY_AI_PROXY_URL?.trim()
  if (!url) {
    throw new Error(
      'Story Mode "proxy" provider requires VITE_STORY_AI_PROXY_URL (e.g. /api/story). The OpenAI key ' +
        'lives ONLY on that server proxy (local dev: the Vite plugin in devProxy/), never in the client. ' +
        'Set the URL + OPENAI_API_KEY, or use VITE_STORY_AI_PROVIDER=firebase / OPENAI_API_KEY instead.',
    )
  }
  const { createOpenAiStoryAI } = await import('./openAiStoryAi')
  return createOpenAiStoryAI(url, modelOptions(env))
}

// Returns a Promise<StoryAI> for a configured provider, or null when none is configured.
export function createStoryAI(env: StoryAiEnv): Promise<StoryAI | null> | null {
  switch (selectStoryProvider(env)) {
    // 1. Same-origin proxy → OpenAI (key stays server-side behind devProxy/ or a deployed function).
    case 'proxy':
      return createProxyProvider(env)
    // 2. Firebase AI Logic (App Check protects the free-tier quota at deploy).
    case 'firebase':
      return createFirebaseProvider(env)
    // 3. Preferred developer default: direct OpenAI when the user's key is present. SECURITY: this
    //    bundles the key into the client build (browser-exposed) — fine for LOCAL DEV only.
    case 'openai':
      return createOpenAiDeveloperProvider(env, openAiKey(env))
    // 4. Legacy Gemini Developer API dev key (kept working if one is still present).
    case 'gemini':
      return createGeminiProvider(env, (env.VITE_GEMINI_API_KEY ?? '').trim())
    // 5. No provider configured -> Story Mode entry shows the "add a key" hint.
    default:
      return null
  }
}
