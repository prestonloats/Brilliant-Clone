// Pure, dependency-free chunking policy shared by `vite.config.ts` and its test.
//
// Background: the app loads the Firebase SDK only through a dynamic `import()` in
// firebase mode (see `initializeBackend` in `src/App.tsx`). A previous blanket
// "every node_modules id -> vendor" rule swept the Firebase Auth/Firestore SDK
// into the same `vendor` chunk as React. Because React is a static dependency of
// the entry, that chunk is module-preloaded eagerly — so the unused Firebase SDK
// shipped on every first load, including the default local (passwordless) mode.
//
// This policy keeps the eager runtime small and cacheable while leaving the
// Firebase SDK out of the initial download:
//   - React + the small shared runtime -> a stable, cacheable `vendor` chunk.
//   - KaTeX (used to typeset every equation, so legitimately eager) -> its own
//     `katex` chunk, so equation typesetting code caches independently and the
//     `vendor` chunk stays under the chunk-size warning threshold.
//   - Everything else (notably the Firebase SDK and its transitive deps, which
//     are reachable only via dynamic import) -> `undefined`, letting Vite/Rolldown
//     place dynamic-only dependencies in lazily-loaded chunks instead of the
//     eager initial bundle.

const sep = '[\\\\/]'

const matchesPackage = (id: string, packages: readonly string[]): boolean => {
  const names = packages.map((name) => name.replace('/', sep)).join('|')
  return new RegExp(`${sep}node_modules${sep}(${names})${sep}`).test(id)
}

// React runtime packages that are statically imported by the entry. Grouping
// them keeps a single rarely-changing chunk that returning visitors reuse from
// cache across app deploys.
const REACT_RUNTIME = ['react', 'react-dom', 'scheduler'] as const

// KaTeX is statically imported by `MathText`, so it is part of the eager path,
// but it is large enough to deserve its own cacheable chunk.
const KATEX = ['katex'] as const

// Firebase SDK packages. These are reachable only through the dynamic import in
// `initializeBackend`, so isolating them in a dedicated chunk (rather than the
// React `vendor` chunk) keeps them out of the eager first load: a chunk is only
// preloaded when one of its modules is statically reachable from the entry, and
// none of these are.
const FIREBASE = ['firebase', '@firebase', '@grpc'] as const

export function chunkForModuleId(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (matchesPackage(id, FIREBASE)) return 'firebase'
  if (matchesPackage(id, KATEX)) return 'katex'
  if (matchesPackage(id, REACT_RUNTIME)) return 'vendor'

  // Leave the rest to automatic code-splitting. Anything else reachable only
  // through a dynamic import stays out of the eager initial chunk.
  return undefined
}
