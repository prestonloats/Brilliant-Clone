import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

import { getFirebaseConfig } from './firebaseConfig'

export type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | null = null

export const getFirebaseServices = (): FirebaseServices | null => {
  const config = getFirebaseConfig()
  if (!config) return null

  if (!services) {
    const app = getApps().length > 0 ? getApp() : initializeApp(config)
    services = {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
    }
  }

  return services
}
