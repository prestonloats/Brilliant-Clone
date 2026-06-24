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
            // Keep Firebase in its own async chunk. The app defaults to the local
            // browser-only backend and only dynamically imports Firebase when
            // VITE_BACKEND_PROVIDER=firebase, so folding it into `vendor` would force
            // every visitor to eagerly download the (large) Firebase SDK they never use.
            if (/[\\/]node_modules[\\/]@?firebase[\\/]/.test(id)) {
              return 'firebase'
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
