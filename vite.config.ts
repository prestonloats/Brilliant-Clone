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
    // Expose the user's OPENAI_* vars (e.g. OPENAI_API_KEY, OPENAI_MODEL) to client code as
    // import.meta.env.* IN ADDITION TO the default VITE_ prefix, so the direct client-side OpenAI
    // provider works with the var name the user already set — no rename needed.
    // SECURITY: this means an OPENAI_API_KEY value is inlined into the public client build whenever
    // it is set (the secret-scan guard above only inspects VITE_* names). That is acceptable for
    // LOCAL DEV; for a public deploy keep the key off the client via the proxy provider
    // (devProxy/ + VITE_STORY_AI_PROVIDER=proxy) or Firebase AI Logic instead.
    envPrefix: ['VITE_', 'OPENAI_'],
    // storyAiProxyPlugin only mounts during `vite dev` (apply: 'serve'); it also reads OPENAI_API_KEY
    // server-side for the same-origin proxy path.
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
