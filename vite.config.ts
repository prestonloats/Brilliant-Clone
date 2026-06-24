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

          // Keep the Firebase SDK (and its transitive deps) in a chunk of its own.
          // Firebase is only ever pulled in through the dynamic import() in App.tsx
          // when VITE_BACKEND_PROVIDER=firebase, so isolating it here keeps the SDK
          // out of the eagerly-loaded entry graph: default local-mode visitors never
          // download it. Folding it into `vendor` (which React makes eager) is what
          // previously shipped the unused ~hundreds-of-kB SDK on every first load.
          if (
            /[\\/](firebase|@firebase|@grpc|grpc|protobufjs|@protobufjs|idb)[\\/]/.test(id)
          ) {
            return 'firebase-vendor'
          }

          // KaTeX is needed early (lessons typeset equations on first render), but it
          // is large and changes rarely, so give it its own long-cacheable chunk
          // instead of bloating the shared `vendor` chunk.
          if (/[\\/]katex[\\/]/.test(id)) {
            return 'katex-vendor'
          }

          // Everything else third-party (React runtime, etc.) shares one rarely-
          // changing chunk so returning visitors reuse it from cache across deploys
          // instead of re-downloading the whole bundle on every release.
          return 'vendor'
        },
      },
    },
  },
})
