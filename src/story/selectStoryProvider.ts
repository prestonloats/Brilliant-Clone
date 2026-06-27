// PURE Story Mode provider selection (no SDK / firebase / import.meta), so the choice is unit-testable
// under the CommonJS test config WITHOUT pulling any adapter or firebase module (those use
// import.meta.env) into the type graph. `createStoryAI` consumes this and only THEN dynamic-imports
// the chosen adapter, preserving the lazy-load intent.

export type StoryAiEnv = {
  VITE_STORY_AI_PROVIDER?: string
  VITE_STORY_AI_PROXY_URL?: string
  VITE_GEMINI_API_KEY?: string
  // Direct OpenAI developer path. SECURITY: vite.config.ts pins envPrefix to VITE_ only, so an
  // UNPREFIXED OPENAI_API_KEY is NOT bundled — at runtime in the browser it is undefined, and is only
  // read server-side by the dev proxy. A VITE_OPENAI_API_KEY *would* be bundled, but the secret-scan
  // build guard (src/secretScan.ts) rejects a real sk-... value, so this direct path is effectively
  // dev-only. For deploys use the proxy/firebase providers; never ship an OpenAI key to the client.
  OPENAI_API_KEY?: string
  VITE_OPENAI_API_KEY?: string
  // Optional OpenAI model override (defaults to OPENAI_DEFAULT_MODEL inside the adapter).
  OPENAI_MODEL?: string
  VITE_OPENAI_MODEL?: string
  // Optional model override for the proxy/firebase paths (local equivalent of Remote Config).
  VITE_STORY_AI_MODEL?: string
  // Vite's build flag (true in `vite build` output). Used to REFUSE the client-side key providers in
  // production, so a billable/abusable AI key is never shipped to every visitor — only the
  // server-side `proxy`/`firebase` providers are allowed there.
  PROD?: boolean
}

// Which concrete adapter a given env selects (or null when nothing is configured).
export type StoryProviderKind = 'proxy' | 'firebase' | 'openai' | 'gemini'

// The user's OpenAI key under either accepted name (the unprefixed OPENAI_API_KEY they already set,
// or a VITE_OPENAI_API_KEY fallback), trimmed so a blank value counts as "absent".
export const openAiKey = (env: StoryAiEnv): string => (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()

// Order rationale: an EXPLICIT `VITE_STORY_AI_PROVIDER` (proxy / firebase) wins FIRST, so a
// deliberate SECURE setup is never silently downgraded to the client-side key path. Otherwise the
// preferred DEVELOPER default is the direct OpenAI key when present, then a legacy Gemini dev key.
//
// SECURITY: the `openai` and `gemini` providers embed an API key in the CLIENT bundle (OpenAI via
// `dangerouslyAllowBrowser`, or a Gemini developer key) — fine for LOCAL DEV, but in a production
// build that would expose an abusable/billable key to every visitor. So in production we refuse them
// and fall through to null; deploys must use the server-side `proxy` or `firebase` provider.
export function selectStoryProvider(env: StoryAiEnv): StoryProviderKind | null {
  if (env.VITE_STORY_AI_PROVIDER === 'proxy') return 'proxy'
  if (env.VITE_STORY_AI_PROVIDER === 'firebase') return 'firebase'
  if (env.PROD) return null
  if (openAiKey(env)) return 'openai'
  if (env.VITE_GEMINI_API_KEY) return 'gemini'
  return null
}
