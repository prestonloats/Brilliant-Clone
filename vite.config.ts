import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split third-party code into cache-friendly chunks instead of one giant `vendor`
        // bundle. The key win is keeping the Firebase SDK out of the eagerly-loaded path:
        // it is only reached through the dynamic import() in src/app/startup.ts, so giving
        // it its own chunk means default local-mode visitors never download the ~1 MB SDK.
        // KaTeX gets its own chunk too so its sizeable payload caches independently of the
        // rarely-changing React runtime (which stays in `vendor`).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase'
          if (id.includes('/katex/')) return 'katex'
          return 'vendor'
        },
      },
    },
  },
})
