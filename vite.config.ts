import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the rarely-changing third-party runtime (React, etc.) into its own
        // chunk so returning visitors can reuse it from cache across app deploys
        // instead of re-downloading the whole bundle on every release.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
