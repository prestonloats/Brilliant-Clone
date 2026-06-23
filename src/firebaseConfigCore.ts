export type BackendProvider = 'local' | 'firebase'

export type FirebaseEnvKey =
  | 'VITE_FIREBASE_API_KEY'
  | 'VITE_FIREBASE_AUTH_DOMAIN'
  | 'VITE_FIREBASE_PROJECT_ID'
  | 'VITE_FIREBASE_STORAGE_BUCKET'
  | 'VITE_FIREBASE_MESSAGING_SENDER_ID'
  | 'VITE_FIREBASE_APP_ID'

export type FirebaseEnv = Partial<Record<FirebaseEnvKey | 'VITE_FIREBASE_MEASUREMENT_ID', string>>

export type FirebaseWebConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

export const requiredFirebaseEnvKeys: FirebaseEnvKey[] = [
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
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim() ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '',
    appId: env.VITE_FIREBASE_APP_ID?.trim() ?? '',
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
  }

  if (
    !config.apiKey ||
    !config.authDomain ||
    !config.projectId ||
    !config.storageBucket ||
    !config.messagingSenderId ||
    !config.appId
  ) {
    return null
  }

  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    ...(config.measurementId ? { measurementId: config.measurementId } : {}),
  }
}
