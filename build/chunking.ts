// Pure manual-chunk routing shared by the Vite build and its unit test.
//
// Keeping this logic in a dependency-free module (no `vite` import) lets a unit test
// assert the bundle-splitting contract directly, guarding the optimization that keeps
// the Firebase SDK out of the eagerly preloaded `vendor` chunk.

// Package path markers (slash-delimited so they only match a whole package directory)
// for Firebase and the transitive runtime deps it pulls in. These modules are only
// reached through the dynamic Firebase-mode import, so they belong in a lazily loaded
// chunk instead of the vendor chunk that the entry HTML preloads on every visit.
export const FIREBASE_CHUNK_DEPS = [
  '/firebase/',
  '/@firebase/',
  '/@grpc/',
  '/protobufjs/',
  '/idb/',
  '/long/',
] as const

export type ManualChunkName = 'firebase' | 'vendor'

// Decide which manual chunk a module id belongs to, or `undefined` to leave the module
// to the bundler's default chunking. Splitting Firebase out of `vendor` keeps the
// default local browser-only build from eagerly downloading the multi-hundred-kB SDK.
export const getManualChunk = (id: string): ManualChunkName | undefined => {
  if (!id.includes('node_modules')) return undefined

  const normalized = id.replace(/\\/g, '/')
  if (FIREBASE_CHUNK_DEPS.some((dependency) => normalized.includes(dependency))) {
    return 'firebase'
  }

  return 'vendor'
}
