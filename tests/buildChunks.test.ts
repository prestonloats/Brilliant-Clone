import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chunkForModuleId } from '../buildChunks'

// Realistic Rollup/Rolldown module ids are absolute paths into node_modules.
const nm = (relative: string) => `/workspace/node_modules/${relative}`

const FIREBASE_IDS = [
  nm('firebase/app/dist/index.mjs'),
  nm('firebase/auth/dist/index.mjs'),
  nm('firebase/firestore/dist/index.mjs'),
  nm('@firebase/app/dist/esm/index.esm.js'),
  nm('@firebase/auth/dist/esm/index.js'),
  nm('@firebase/firestore/dist/index.esm.js'),
  nm('@grpc/grpc-js/build/src/index.js'),
]

const REACT_IDS = [
  nm('react/index.js'),
  nm('react-dom/client.js'),
  nm('react/jsx-runtime.js'),
  nm('scheduler/index.js'),
]

const KATEX_IDS = [nm('katex/dist/katex.mjs'), nm('katex/dist/contrib/mhchem.mjs')]

test('Firebase SDK is isolated in its own chunk so it stays out of the eager first load', () => {
  for (const id of FIREBASE_IDS) {
    assert.equal(chunkForModuleId(id), 'firebase', `expected ${id} to map to the firebase chunk`)
  }
})

test('regression guard: Firebase never shares the eagerly-preloaded React vendor chunk', () => {
  // The fixed bug lumped every node_modules id into the React `vendor` chunk,
  // which is module-preloaded because React is a static entry dependency. That
  // dragged the dynamic-only Firebase SDK into every first load. Firebase must
  // therefore never resolve to the same chunk as React.
  const reactChunk = chunkForModuleId(nm('react-dom/client.js'))
  for (const id of FIREBASE_IDS) {
    const chunk = chunkForModuleId(id)
    assert.notEqual(chunk, 'vendor', `${id} must not ride the eager vendor chunk`)
    assert.notEqual(chunk, reactChunk, `${id} must not share React's chunk`)
  }
})

test('React runtime is grouped into a single cacheable vendor chunk', () => {
  for (const id of REACT_IDS) {
    assert.equal(chunkForModuleId(id), 'vendor', `expected ${id} to map to the vendor chunk`)
  }
})

test('KaTeX gets its own cacheable chunk', () => {
  for (const id of KATEX_IDS) {
    assert.equal(chunkForModuleId(id), 'katex', `expected ${id} to map to the katex chunk`)
  }
})

test('application source is left to default chunking (no manual chunk)', () => {
  assert.equal(chunkForModuleId('/workspace/src/App.tsx'), undefined)
  assert.equal(chunkForModuleId('/workspace/src/engine.ts'), undefined)
  assert.equal(chunkForModuleId('/workspace/src/firebaseBackend.ts'), undefined)
})

test('unrelated dependencies are left to automatic code-splitting', () => {
  // Anything not explicitly grouped returns undefined so Vite/Rolldown can keep
  // dynamic-only dependencies in lazily-loaded chunks instead of the eager bundle.
  assert.equal(chunkForModuleId(nm('idb/build/index.js')), undefined)
  assert.equal(chunkForModuleId(nm('tslib/tslib.es6.js')), undefined)
})

test('chunk policy is independent of path separator (POSIX and Windows)', () => {
  assert.equal(chunkForModuleId('C:\\repo\\node_modules\\firebase\\auth\\index.js'), 'firebase')
  assert.equal(chunkForModuleId('C:\\repo\\node_modules\\react\\index.js'), 'vendor')
})
