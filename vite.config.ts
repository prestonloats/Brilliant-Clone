import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          // The Firebase Auth/Firestore SDK is only ever pulled in through the gated
          // dynamic import() that runs in firebase mode (see loadBackend in App.tsx).
          // Give it a dedicated chunk so it stays an async chunk: the default
          // local-demo first load never downloads the SDK, which is the heaviest
          // dependency in the tree. (Previously a single catch-all "vendor" chunk
          // swept the SDK in alongside React, so it shipped eagerly to every visitor.)
          if (/[\\/]node_modules[\\/](?:firebase|@firebase)[\\/]/.test(id)) {
            return 'firebase-vendor'
          }

          // KaTeX (equation typesetting) renders on the first lesson screens, so it is
          // loaded eagerly, but split it out so its sizeable code caches independently
          // of the React runtime and the app bundle across deploys.
          if (/[\\/]node_modules[\\/]katex[\\/]/.test(id)) {
            return 'katex-vendor'
          }

          // Everything else (the React runtime, etc.) changes rarely; keep it in one
          // long-lived chunk so returning visitors can reuse it from cache across app
          // deploys instead of re-downloading it on every release.
          return 'vendor'
        },
      },
    },
  },
})
