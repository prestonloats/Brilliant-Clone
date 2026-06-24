import type { BackendProvider } from './backend/types'

export type { BackendProvider }

export type FirebaseEnvKey =
  | 'VITE_FIREBASE_API_KEY'
  | 'VITE_FIREBASE_AUTH_DOMAIN'
  | 'VITE_FIREBASE_PROJECT_ID'
  | 'VITE_FIREBASE_STORAGE_BUCKET'
  | 'VITE_FIREBASE_MESSAGING_SENDER_ID'
  | 'VITE_FIREBASE_APP_ID'

export type FirebaseEnv = Partial<Record<FirebaseEnvKey | 'VITE_FIREBASE_MEASUREMENT_ID', string>>

type FirebaseWebConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

const requiredFirebaseEnvKeys: FirebaseEnvKey[] = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

export const getBackendProviderFromEnv = (value?: string): BackendProvider => {
  const provider = value?.trim().toLowerCase() || 'local'

  if (provider === 'local' || provider === 'firebase') {
    return provider
  }

  throw new Error('VITE_BACKEND_PROVIDER must be either "local" or "firebase".')
}

export const getMissingFirebaseEnvKeysFromEnv = (env: FirebaseEnv): FirebaseEnvKey[] =>
  requiredFirebaseEnvKeys.filter((key) => !env[key]?.trim())

export const getFirebaseConfigFromEnv = (env: FirebaseEnv): FirebaseWebConfig | null => {
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim() ?? ''
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? ''
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim() ?? ''
  const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ?? ''
  const messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? ''
  const appId = env.VITE_FIREBASE_APP_ID?.trim() ?? ''
  const measurementId = env.VITE_FIREBASE_MEASUREMENT_ID?.trim()

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    ...(measurementId ? { measurementId } : {}),
  }
}
