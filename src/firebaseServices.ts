import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

import { getFirebaseConfig } from './firebaseConfig'

export type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | null = null

// SECURITY: the Firebase web config (apiKey, projectId, ...) is public by design, so it ships in the
// client bundle. App Check is what actually stops anyone holding that key from calling Auth/Firestore/
// AI Logic from outside the app — it attaches an attestation token (reCAPTCHA v3) to every request,
// which you then ENFORCE in the Firebase console. It is opt-in via VITE_FIREBASE_APPCHECK_SITE_KEY so
// local mode and unconfigured projects keep working; once the site key is set (and enforcement is on),
// the project's backends reject un-attested traffic. Failures are swallowed so a misconfigured key
// degrades to "no App Check" instead of breaking the whole app.
const setupAppCheck = (app: FirebaseApp): void => {
  const env = import.meta.env as Record<string, string | undefined>
  const siteKey = env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim()
  if (!siteKey) return

  // A debug token lets App Check work on localhost / CI without a real reCAPTCHA assessment. Set
  // VITE_FIREBASE_APPCHECK_DEBUG_TOKEN to a token registered in the Firebase console (NEVER in prod).
  const debugToken = env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN?.trim()
  if (debugToken) {
    ;(globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
  }

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (error) {
    console.warn('[firebase] App Check initialization failed; continuing without it.', error)
  }
}

export const getFirebaseServices = (): FirebaseServices | null => {
  const config = getFirebaseConfig()
  if (!config) return null

  if (!services) {
    const isNewApp = getApps().length === 0
    const app = isNewApp ? initializeApp(config) : getApp()
    // App Check must be initialized once, right after the app is created and before other services
    // issue requests, so its token attaches to them.
    if (isNewApp) setupAppCheck(app)
    services = {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
    }
  }

  return services
}
