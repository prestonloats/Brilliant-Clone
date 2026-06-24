import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep heavy third-party code in its own chunks so the default (local-mode)
        // first load stays light and returning visitors can reuse them from cache:
        //   - `firebase`: the Auth/Firestore SDK is only reached through the dynamic
        //     import in App.tsx (firebase mode), so isolating it here keeps it OUT of
        //     the eagerly module-preloaded graph. Lumping it into `vendor` made it
        //     load on every visit even though local mode never touches it.
        //   - `katex`: needed early but rarely changes, so a dedicated chunk caches well.
        //   - `vendor`: the remaining runtime (React, etc.) that the entry depends on.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](?:@firebase|firebase)[\\/]/.test(id)) return 'firebase'
          if (/[\\/]katex[\\/]/.test(id)) return 'katex'
          return 'vendor'
        },
      },
    },
  },
})
