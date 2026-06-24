import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split third-party code so the default local-mode first load stays light and
        // returning visitors reuse rarely-changing chunks from cache across app deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Keep the Firebase SDK in its own chunk. It is only reached through the
          // dynamic import() in App.tsx (firebase mode), so isolating it here keeps it
          // OUT of the eagerly-preloaded vendor chunk: default local-mode visitors never
          // download it, and it is fetched only when VITE_BACKEND_PROVIDER=firebase.
          if (id.includes('/firebase/') || id.includes('/@firebase/')) {
            return 'firebase'
          }

          // KaTeX is needed early (equation rendering) so it stays eager, but giving it
          // its own chunk lets the large, rarely-changing math runtime cache independently
          // of the React vendor chunk and the frequently-changing app code.
          if (id.includes('/katex/')) {
            return 'katex'
          }

          // The remaining rarely-changing runtime (React, etc.) shares one cacheable chunk.
          return 'vendor'
        },
      },
    },
  },
})
