import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the Firebase SDK in its own chunk. The app only reaches Firebase
          // through a dynamic import() (firebase mode), so isolating it means the
          // chunk is NOT statically reachable from the entry and therefore stays
          // lazy: default local-mode visitors never download the ~560 kB SDK on
          // first load. Lumping it into `vendor` (below) made it ride the eagerly
          // modulepreloaded React chunk, defeating the dynamic import.
          if (/[\\/]node_modules[\\/]@?firebase[\\/]/.test(id)) {
            return 'firebase'
          }
          // Split the rarely-changing third-party runtime (React, KaTeX, etc.) into
          // its own chunk so returning visitors can reuse it from cache across app
          // deploys instead of re-downloading the whole bundle on every release.
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
