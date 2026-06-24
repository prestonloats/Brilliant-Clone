import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split third-party code into purpose-built chunks so the default (local-mode)
        // first load stays light and rarely-changing runtimes cache independently of
        // app code across deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // The Firebase SDK (plus its @firebase/idb internals) is reached ONLY through
          // the dynamic import() in App.tsx that runs in firebase mode. Grouping it into
          // its own chunk keeps it out of the eagerly-preloaded vendor chunk, so default
          // local-mode visitors no longer download the unused Auth/Firestore SDK on first
          // load; it is fetched on demand only when firebase mode is configured.
          if (/[\\/](firebase|@firebase|idb)[\\/]/.test(id)) {
            return 'firebase'
          }

          // KaTeX is large and changes rarely; isolate it so equation typesetting caches
          // independently of both the React runtime and the app bundle.
          if (id.includes('katex')) {
            return 'katex'
          }

          // Keep the stable React runtime in its own long-lived cache chunk so returning
          // visitors reuse it across app deploys. Any remaining dependency (e.g. a
          // firebase-only transitive such as tslib) is left to default code-splitting,
          // which keeps it off the eager path when only the dynamic import reaches it.
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor'
          }

          return undefined
        },
      },
    },
  },
})
