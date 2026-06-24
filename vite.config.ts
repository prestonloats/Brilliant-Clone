import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { assignManualChunk } from './build/chunks'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // See build/chunks.ts: pins React to a cacheable `vendor` chunk while
        // leaving the dynamically-imported Firebase SDK in its own lazy chunk so it
        // never ships with the default local-mode entry bundle.
        manualChunks: assignManualChunk,
      },
    },
  },
})
