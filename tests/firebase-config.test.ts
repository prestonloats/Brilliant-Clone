import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getBackendProviderFromEnv,
  getFirebaseConfigFromEnv,
  getMissingFirebaseEnvKeysFromEnv,
  requiredFirebaseEnvKeys,
  type FirebaseEnv,
} from '../src/firebaseConfigCore'

const fullEnv: FirebaseEnv = {
  VITE_FIREBASE_API_KEY: 'api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'project-id',
  VITE_FIREBASE_STORAGE_BUCKET: 'project-id.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'sender',
  VITE_FIREBASE_APP_ID: 'app-id',
}

test('getBackendProviderFromEnv normalizes case and whitespace and defaults to local', () => {
  assert.equal(getBackendProviderFromEnv(''), 'local')
  assert.equal(getBackendProviderFromEnv('   '), 'local')
  assert.equal(getBackendProviderFromEnv('LOCAL'), 'local')
  assert.equal(getBackendProviderFromEnv(' Firebase '), 'firebase')
  assert.equal(getBackendProviderFromEnv('FIREBASE'), 'firebase')
})

test('getBackendProviderFromEnv rejects unsupported providers with a clear message', () => {
  assert.throws(() => getBackendProviderFromEnv('postgres'), /must be either "local" or "firebase"/i)
  assert.throws(() => getBackendProviderFromEnv('supabase'), /must be either "local" or "firebase"/i)
})

test('requiredFirebaseEnvKeys lists the six keys the app validates', () => {
  assert.deepEqual(requiredFirebaseEnvKeys, [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ])
})

test('getMissingFirebaseEnvKeysFromEnv treats blank values as missing', () => {
  assert.deepEqual(getMissingFirebaseEnvKeysFromEnv(fullEnv), [])
  assert.deepEqual(getMissingFirebaseEnvKeysFromEnv({ ...fullEnv, VITE_FIREBASE_API_KEY: '   ' }), [
    'VITE_FIREBASE_API_KEY',
  ])
  assert.deepEqual(
    getMissingFirebaseEnvKeysFromEnv({
      VITE_FIREBASE_API_KEY: 'api-key',
      VITE_FIREBASE_PROJECT_ID: 'project-id',
    }),
    [
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
      'VITE_FIREBASE_APP_ID',
    ],
  )
})

test('getFirebaseConfigFromEnv trims values and keeps an optional measurement id', () => {
  const config = getFirebaseConfigFromEnv({
    ...fullEnv,
    VITE_FIREBASE_API_KEY: '  api-key  ',
    VITE_FIREBASE_MEASUREMENT_ID: '  measure-id  ',
  })

  assert.ok(config)
  assert.equal(config.apiKey, 'api-key')
  assert.equal(config.authDomain, 'example.firebaseapp.com')
  assert.equal(config.measurementId, 'measure-id')
})

test('getFirebaseConfigFromEnv omits the measurement id when it is absent or blank', () => {
  const withoutMeasurement = getFirebaseConfigFromEnv(fullEnv)
  assert.ok(withoutMeasurement)
  assert.equal('measurementId' in withoutMeasurement, false)

  const blankMeasurement = getFirebaseConfigFromEnv({ ...fullEnv, VITE_FIREBASE_MEASUREMENT_ID: '   ' })
  assert.ok(blankMeasurement)
  assert.equal('measurementId' in blankMeasurement, false)
})

test('getFirebaseConfigFromEnv returns null when any required value is missing or blank', () => {
  assert.equal(getFirebaseConfigFromEnv({}), null)
  assert.equal(getFirebaseConfigFromEnv({ ...fullEnv, VITE_FIREBASE_APP_ID: '   ' }), null)
})
