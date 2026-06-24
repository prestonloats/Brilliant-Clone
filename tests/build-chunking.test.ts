import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FIREBASE_CHUNK_DEPS, getManualChunk } from '../build/chunking'

test('firebase SDK and its runtime deps route to the lazy firebase chunk', () => {
  assert.equal(getManualChunk('/repo/node_modules/firebase/app/dist/index.mjs'), 'firebase')
  assert.equal(getManualChunk('/repo/node_modules/@firebase/auth/dist/index.js'), 'firebase')
  assert.equal(getManualChunk('/repo/node_modules/@firebase/firestore/dist/index.js'), 'firebase')
  assert.equal(getManualChunk('/repo/node_modules/@grpc/grpc-js/build/src/index.js'), 'firebase')
  assert.equal(getManualChunk('/repo/node_modules/protobufjs/index.js'), 'firebase')
  assert.equal(getManualChunk('/repo/node_modules/idb/build/index.js'), 'firebase')
  assert.equal(getManualChunk('/repo/node_modules/long/umd/index.js'), 'firebase')
})

test('react and other vendor deps stay in the eagerly preloaded vendor chunk', () => {
  assert.equal(getManualChunk('/repo/node_modules/react/index.js'), 'vendor')
  assert.equal(getManualChunk('/repo/node_modules/react-dom/client.js'), 'vendor')
  assert.equal(getManualChunk('/repo/node_modules/scheduler/index.js'), 'vendor')
})

test('every firebase dependency marker resolves to the lazy chunk', () => {
  // Regression guard for the bundle-size optimization: any Firebase-owned module must
  // resolve to the lazy chunk so the default local build never eagerly ships the SDK.
  for (const dependency of FIREBASE_CHUNK_DEPS) {
    assert.equal(getManualChunk(`/repo/node_modules${dependency}package/index.js`), 'firebase')
  }
})

test('application source is left to the default chunking', () => {
  assert.equal(getManualChunk('/repo/src/App.tsx'), undefined)
  assert.equal(getManualChunk('/repo/src/firebaseBackend.ts'), undefined)
})

test('a package merely named like a marker is not misrouted to firebase', () => {
  // The slash delimiters keep, e.g., a hypothetical "firebaseish" package out of the
  // Firebase chunk so only real Firebase packages are split off.
  assert.equal(getManualChunk('/repo/node_modules/firebaseish/index.js'), 'vendor')
  assert.equal(getManualChunk('/repo/node_modules/not-idb-helper/index.js'), 'vendor')
})

test('windows-style path separators are normalized before matching', () => {
  assert.equal(getManualChunk('C:\\repo\\node_modules\\@firebase\\auth\\index.js'), 'firebase')
  assert.equal(getManualChunk('C:\\repo\\node_modules\\react\\index.js'), 'vendor')
})
