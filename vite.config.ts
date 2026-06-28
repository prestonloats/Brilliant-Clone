import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

import { storyAiProxyPlugin } from './devProxy/storyAiProxyPlugin'
import { findClientSecretLeaks, formatSecretLeakError } from './src/secretScan'

export default defineConfig(({ mode }) => {
  // SECURITY GUARD: VITE_* env vars are inlined into the public client bundle. Fail fast — on dev
  // server start AND production build — if an AI-provider secret key (sk-...) was placed in one, so a
  // billable OpenAI/Anthropic key can never be shipped to the browser. (Gemini client keys are not
  // flagged; they are an intentional free, restricted local-dev path.) See src/secretScan.ts.
  const clientEnv = loadEnv(mode, process.cwd(), 'VITE_')
  const leakedKeys = findClientSecretLeaks(clientEnv)
  if (leakedKeys.length > 0) {
    throw new Error(formatSecretLeakError(leakedKeys))
  }

  return {
    // SECURITY: only the VITE_ prefix is exposed to the client bundle, so a billable `sk-...` secret
    // can never be inlined into the public build. Production Story Mode uses Firebase AI Logic
    // (VITE_STORY_AI_PROVIDER=firebase): the Gemini key stays on Firebase's server (the free Gemini
    // Developer API tier, which runs on the no-Blaze Spark plan), so no AI key ever ships to the browser.
    envPrefix: ['VITE_'],
    // storyAiProxyPlugin is an OPTIONAL local-dev OpenAI proxy (apply: 'serve'; reads OPENAI_API_KEY
    // server-side). It is unused unless VITE_STORY_AI_PROVIDER=proxy — the deployed app needs no proxy.
    plugins: [react(), storyAiProxyPlugin()],
    build: {
      rollupOptions: {
        output: {
          // PERF: split third-party code by package instead of lumping every node_modules
          // module into one eager `vendor` chunk. The old single-chunk strategy forced the
          // heavy AI/Firebase SDKs — which are reached ONLY through dynamic import() (firebase
          // via app/startup.ts, openai via story/openAiDeveloperStoryAi.ts, @google/genai via
          // story/geminiDeveloperStoryAi.ts) — to share a chunk with the eagerly-loaded React +
          // KaTeX runtime, so the browser downloaded ~400 kB gzip of SDK code it may never use
          // on first paint. Giving each SDK its own chunk lets the bundler keep those chunks out
          // of the entry's modulepreload graph until their dynamic import actually fires, while
          // React and KaTeX stay eager but in their own cache-stable chunks. Everything else
          // returns undefined so the bundler can co-locate it with whoever imports it (which
          // keeps lazy SDK transitive deps lazy instead of pinning them eager).
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react'
            }
            if (id.includes('/katex/')) return 'katex'
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase'
            if (id.includes('/openai/')) return 'openai'
            if (id.includes('/@google/genai/')) return 'genai'
            return undefined
          },
        },
      },
    },
  }
})
