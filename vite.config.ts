import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { getManualChunk } from './build/chunking'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Route third-party modules into cache-friendly chunks. Firebase (only reached
        // through the dynamic Firebase-mode import) is split into its own lazy chunk so
        // the default local build never eagerly ships the SDK. See `build/chunking.ts`.
        manualChunks: (id) => getManualChunk(id),
      },
    },
  },
})
