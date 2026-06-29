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
          // PERF: split vendor code per-package instead of one catch-all `vendor` chunk.
          // index.html `modulepreload`s every static (eager) chunk, so a single `vendor`
          // chunk forces the browser to download ALL of node_modules on first paint —
          // including the heavy AI/Firebase SDKs that are only ever reached through a
          // dynamic `import()` (firebase via src/app/startup.ts + createStoryAI.ts, openai
          // via openAiDeveloperStoryAi.ts, @google/genai via geminiDeveloperStoryAi.ts).
          // Giving each SDK its own chunk keeps it lazy (loaded only when Story Mode runs),
          // while react/react-dom/scheduler + katex stay as their own cacheable eager chunks
          // (they ARE imported statically). Everything else falls back to Rollup's default
          // splitting. Returning `undefined` defers to that default.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
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
