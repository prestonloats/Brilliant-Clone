import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assignManualChunk } from '../build/chunks'

test('react runtime is pinned to the cacheable vendor chunk', () => {
  assert.equal(assignManualChunk('/repo/node_modules/react/index.js'), 'vendor')
  assert.equal(assignManualChunk('/repo/node_modules/react-dom/client.js'), 'vendor')
  assert.equal(assignManualChunk('/repo/node_modules/scheduler/cjs/scheduler.js'), 'vendor')
  // Windows-style separators resolve to the same chunk.
  assert.equal(assignManualChunk('C:\\repo\\node_modules\\react\\index.js'), 'vendor')
})

test('firebase is never hoisted into the eager vendor chunk', () => {
  // The Firebase SDK is reached only through a dynamic import, so it must stay
  // unassigned to remain in its own lazy chunk instead of shipping to every
  // visitor in the default local mode.
  for (const id of [
    '/repo/node_modules/firebase/app/dist/index.mjs',
    '/repo/node_modules/@firebase/app/dist/index.js',
    '/repo/node_modules/@firebase/auth/dist/index.js',
    '/repo/node_modules/@firebase/firestore/dist/index.js',
    '/repo/node_modules/@grpc/grpc-js/build/src/index.js',
    '/repo/node_modules/idb/build/index.js',
  ]) {
    assert.equal(assignManualChunk(id), undefined, `${id} must not be vendored`)
  }
})

test('application source is left to default chunking', () => {
  assert.equal(assignManualChunk('/repo/src/App.tsx'), undefined)
  assert.equal(assignManualChunk('/repo/src/firebaseBackend.ts'), undefined)
  assert.equal(assignManualChunk('/repo/src/main.tsx'), undefined)
})

test('packages whose names merely contain "react" are not vendored', () => {
  // Guards the node_modules package boundary so only the real React runtime
  // packages match and look-alikes are left to default chunking.
  assert.equal(assignManualChunk('/repo/node_modules/react-icons/lib/index.js'), undefined)
  assert.equal(assignManualChunk('/repo/node_modules/@scope/react-helpers/index.js'), undefined)
  assert.equal(assignManualChunk('/repo/src/react-wrapper.ts'), undefined)
})
