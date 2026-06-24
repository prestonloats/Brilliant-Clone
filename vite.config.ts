import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Keep the Firebase Auth/Firestore SDK in its own chunk. It is only ever
          // reached through the dynamic import() in firebase mode (see
          // src/App.tsx initializeBackend), so isolating it keeps the heavy SDK out
          // of the eagerly-loaded vendor chunk. The default local-only path then
          // never downloads Firebase on first load.
          if (/[\\/](@firebase|firebase)[\\/]/.test(id)) {
            return 'firebase'
          }

          // KaTeX (equation typesetting) is used on the first lesson screens, so it
          // still loads eagerly, but giving it its own chunk lets it cache
          // independently of the React runtime across app deploys.
          if (/[\\/]katex[\\/]/.test(id)) {
            return 'katex'
          }

          // The rarely-changing React runtime (and other shared deps) stays in a
          // single vendor chunk so returning visitors reuse it from cache across
          // app deploys instead of re-downloading it on every release.
          return 'vendor'
        },
      },
    },
  },
})
