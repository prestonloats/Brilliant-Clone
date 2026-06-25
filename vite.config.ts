import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the rarely-changing UI runtime (React, KaTeX) into a stable `vendor`
        // chunk so returning visitors can reuse it from cache across app deploys.
        //
        // Only allow-listed packages go here. The Firebase SDK is intentionally left
        // to Rollup's automatic code-splitting: it is reachable only through the
        // dynamic import() in `src/app/startup.ts` (firebase mode), so keeping it out
        // of the eager `vendor` chunk means the default local-only path never
        // downloads the (large) Firebase SDK. Forcing all of node_modules into one
        // chunk previously defeated that lazy loading.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/katex/')
          ) {
            return 'vendor'
          }
        },
      },
    },
  },
})
