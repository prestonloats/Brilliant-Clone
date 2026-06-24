import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split third-party code into purpose-built chunks so the default (local-mode)
        // first load stays light and returning visitors can reuse stable code from cache:
        //   - `firebase`: the Auth/Firestore SDK is reachable only through the dynamic
        //     import() in App.tsx, so isolating it keeps it OUT of the eager first load.
        //     Local-mode users never download it; it is fetched only in firebase mode.
        //   - `katex`: the equation typesetter is large and rarely changes, so a dedicated
        //     chunk lets it cache independently of the app and React runtime.
        //   - `vendor`: the remaining rarely-changing runtime (React, etc.), kept in one
        //     stable chunk so returning visitors reuse it across app deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (/[\\/]node_modules[\\/](?:@firebase|firebase)[\\/]/.test(id)) {
            return 'firebase'
          }
          if (/[\\/]node_modules[\\/]katex[\\/]/.test(id)) {
            return 'katex'
          }
          return 'vendor'
        },
      },
    },
  },
})
