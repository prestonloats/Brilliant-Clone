// Build-time guard: stop AI-provider SECRET keys from ever being shipped to the browser.
//
// Vite inlines every `VITE_*`-prefixed env var into the public client bundle, so a secret placed in
// one would be world-readable by anyone who loads the app — and an OpenAI/Anthropic key is billable,
// so a leak means anyone can spend your money. This module is the pure, testable core of the guard;
// `vite.config.ts` runs it on every dev start and production build and refuses to proceed on a hit.
//
// Gemini client keys (`AIza...`, `AQ.`) are intentionally NOT flagged: this app supports them
// client-side as a free, restricted local-dev path (see `src/story/createStoryAI.ts`). True secrets
// (`sk-...`) must instead live ONLY behind a server-side proxy under a non-`VITE_` name.

// Matches OpenAI legacy `sk-…`, project `sk-proj-…`, service-account `sk-svcacct-…`, admin
// `sk-admin-…`, and Anthropic `sk-ant-…` keys. Anchored to the whole (trimmed) value so a real key
// pasted as an env value is caught while an incidental "sk-" substring inside a URL/word is not. The
// 20-char floor stays well under real key length (40+) yet avoids matching tokens like "sk-test".
const PROVIDER_SECRET_PATTERN = /^sk-[A-Za-z0-9_-]{20,}$/

/** True when a value looks like an OpenAI/Anthropic-style provider secret key that must stay server-side. */
export const looksLikeProviderSecret = (value: unknown): boolean =>
  typeof value === 'string' && PROVIDER_SECRET_PATTERN.test(value.trim())

/**
 * Names of any CLIENT-EXPOSED (`VITE_*`) env vars whose value looks like a provider secret.
 * Non-`VITE_` vars (e.g. a server-only `OPENAI_API_KEY`) are never bundled, so they are ignored.
 */
export const findClientSecretLeaks = (env: Record<string, unknown>): string[] =>
  Object.entries(env)
    .filter(([key, value]) => key.startsWith('VITE_') && looksLikeProviderSecret(value))
    .map(([key]) => key)
    .sort()

/** Human-readable error explaining the leak and the fix (used to abort the dev server / build). */
export const formatSecretLeakError = (keys: string[]): string =>
  `Refusing to build: ${keys.join(', ')} ${keys.length === 1 ? 'looks' : 'look'} like an AI ` +
  'provider secret key (sk-...). VITE_* env vars are inlined into the public client bundle, so ' +
  'this key would be exposed to anyone who loads the app and could be used to run up charges on ' +
  'your account. Move it to a server-side proxy under a NON-VITE name (e.g. OPENAI_API_KEY) and ' +
  'have the browser call that proxy via VITE_STORY_AI_PROXY_URL — see the "proxy" provider in ' +
  'src/story/createStoryAI.ts.'
