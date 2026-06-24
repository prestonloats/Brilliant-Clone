import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { chunkForModuleId } from './buildChunks'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the rarely-changing React runtime and KaTeX in their own cacheable
        // chunks while leaving the dynamic-only Firebase SDK out of the eager
        // first load. See `buildChunks.ts` for the full rationale.
        manualChunks: chunkForModuleId,
      },
    },
  },
})
