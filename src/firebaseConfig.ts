import type { FirebaseOptions } from 'firebase/app'

import {
  getBackendProviderFromEnv,
  getFirebaseConfigFromEnv,
  getMissingFirebaseEnvKeysFromEnv,
  type BackendProvider,
  type FirebaseEnv,
  type FirebaseEnvKey,
} from './firebaseConfigCore'

export type { BackendProvider, FirebaseEnvKey }

const firebaseEnv = () => import.meta.env as FirebaseEnv

export const getBackendProvider = (): BackendProvider =>
  getBackendProviderFromEnv(import.meta.env.VITE_BACKEND_PROVIDER)

export const getMissingFirebaseEnvKeys = (): FirebaseEnvKey[] => getMissingFirebaseEnvKeysFromEnv(firebaseEnv())

export const getFirebaseConfig = (): FirebaseOptions | null => getFirebaseConfigFromEnv(firebaseEnv())
