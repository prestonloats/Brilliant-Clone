import { createBackend, type Backend } from '../backend'
import { getBackendProvider, getMissingFirebaseEnvKeys } from '../firebaseConfig'

export type BackendStartup =
  | { status: 'loading' }
  | { status: 'ready'; backend: Backend }
  | { status: 'error'; title: string; message: string; details: string[] }

export async function initializeBackend(): Promise<BackendStartup> {
  try {
    const provider = getBackendProvider()

    if (provider === 'firebase') {
      const missingKeys = getMissingFirebaseEnvKeys()
      if (missingKeys.length > 0) {
        return {
          status: 'error',
          title: 'Firebase configuration is incomplete.',
          message:
            'VITE_BACKEND_PROVIDER=firebase is set, but required Firebase web config values are missing. The app did not fall back to local demo mode.',
          details: missingKeys,
        }
      }

      // Firebase SDK code is loaded only when Firebase mode is selected, so the default
      // local browser-only path never imports or initializes Firebase at startup.
      const [{ getFirebaseServices }, { FirebaseBackend }] = await Promise.all([
        import('../firebaseServices'),
        import('../firebaseBackend'),
      ])

      const services = getFirebaseServices()
      if (!services) {
        return {
          status: 'error',
          title: 'Firebase adapter could not start.',
          message:
            'VITE_BACKEND_PROVIDER=firebase is set, but Firebase services could not be initialized. The app did not fall back to local demo mode.',
          details: [],
        }
      }

      return {
        status: 'ready',
        backend: createBackend(provider, { firebaseBackend: new FirebaseBackend(services) }),
      }
    }

    return { status: 'ready', backend: createBackend(provider) }
  } catch (error) {
    return {
      status: 'error',
      title: 'Backend configuration error.',
      message: error instanceof Error ? error.message : 'The selected backend could not be started.',
      details: [],
    }
  }
}
