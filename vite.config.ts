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
          // Split the rarely-changing third-party runtime (React, etc.) into its own
          // chunk so returning visitors can reuse it from cache across app deploys
          // instead of re-downloading the whole bundle on every release.
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor'
            }
          },
        },
      },
    },
  }
})
