import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep third-party code in dedicated chunks so returning visitors reuse them
        // from cache across app deploys instead of re-downloading on every release.
        // Crucially, the Firebase SDK gets its OWN chunk: it is only ever reached
        // through the dynamic import() in App.tsx, so isolating it keeps the ~hundreds
        // of kB of Auth/Firestore code OUT of the eagerly-loaded entry graph. Default
        // local-mode visitors never download it; only firebase mode fetches it on demand.
        // KaTeX is also split out — it is needed early, but as its own cacheable chunk it
        // no longer bloats the React `vendor` chunk that changes on every dependency bump.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](?:@firebase|firebase)[\\/]/.test(id)) {
            return 'firebase'
          }
          if (/[\\/]node_modules[\\/]katex[\\/]/.test(id)) {
            return 'katex'
          }
          return 'vendor'
        },
      },
    },
  },
})
