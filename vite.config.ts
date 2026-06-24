import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // Keep the Firebase SDK in its own chunk. The adapter is only reached through a
          // dynamic import() in firebase mode, so isolating Firebase here lets it stay a
          // lazy chunk instead of being swept into the eagerly-loaded `vendor` chunk with
          // React. This restores the light default first load for local-mode visitors, who
          // never need the Auth/Firestore SDK.
          if (id.includes('/firebase/') || id.includes('/@firebase/')) {
            return 'firebase'
          }

          // The rest of the rarely-changing third-party runtime (React, KaTeX, etc.) goes
          // into a single `vendor` chunk so returning visitors can reuse it from cache
          // across app deploys instead of re-downloading it on every release.
          return 'vendor'
        },
      },
    },
  },
})
