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
    // SECURITY: only the VITE_ prefix is exposed to the client bundle. OPENAI_API_KEY is deliberately
    // NOT exposed, so a billable `sk-...` secret can never be inlined into the public build. The key
    // lives ONLY server-side: the dev proxy reads it via loadEnv('') (see devProxy/), and the deployed
    // Cloud Function reads it from Secret Manager (see functions/). The browser only ever talks to the
    // same-origin /api/story proxy (VITE_STORY_AI_PROVIDER=proxy), never to api.openai.com.
    envPrefix: ['VITE_'],
    // storyAiProxyPlugin only mounts during `vite dev` (apply: 'serve'); it also reads OPENAI_API_KEY
    // server-side for the same-origin proxy path. In production the same /api/story path is served by
    // the Cloud Function in functions/ (wired via the Hosting rewrite in firebase.json).
    plugins: [react(), storyAiProxyPlugin()],
    build: {
      rollupOptions: {
        output: {
          // Chunking strategy (PERF): keep the first load small. A blanket
          // `node_modules -> 'vendor'` rule swept the heavy, DYNAMICALLY-imported SDKs
          // (Firebase ~566kB, plus the OpenAI and Google GenAI Story-Mode SDKs) into one
          // eager chunk that index.html modulepreloads, so the default offline/local mode
          // downloaded all of them up front even though nothing imports them until a
          // backend/AI provider is actually used. Instead we:
          //   - group the EAGER, rarely-changing runtime (React) into its own stable chunk
          //     so returning visitors reuse it from cache across deploys;
          //   - isolate KaTeX (pulled in eagerly by MathText for lesson rendering) so its
          //     large render/font code is a separately-cacheable chunk, not vendor bloat;
          //   - give each heavy, lazy-only SDK its OWN chunk so it stays a LAZY download —
          //     fetched only when that provider/path runs, never on first load.
          // Everything else returns undefined so the bundler places it by real reachability:
          // eager deps fold into the entry/shared chunks, while deps used ONLY by the lazy
          // SDKs ride along in their lazy chunks. We deliberately avoid a `vendor` catch-all,
          // which would force those lazy-only transitive deps back onto the first load.
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
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
