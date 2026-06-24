// Build-time chunking policy for the Vite/Rollup production build.
//
// Extracted as a pure, dependency-free function so the policy can be unit tested
// without running a full production build (see tests/buildChunks.test.ts).
//
// Only the React runtime is pinned to a stable, eagerly-loaded `vendor` chunk so
// returning visitors reuse it from cache across deploys. Every other dependency is
// deliberately left unassigned (returns undefined) so Rollup's automatic
// code-splitting can keep dynamically-imported packages in their own lazy chunks.
//
// This matters most for the Firebase SDK (~550 kB): it is reached only through the
// dynamic import in `src/App.tsx`, so leaving it unassigned keeps it out of the
// entry bundle that every visitor downloads. Returning 'vendor' for all of
// node_modules (as an earlier revision did) hoisted Firebase into the eager entry
// graph and shipped it to every visitor, including the default local mode.

// Matches the React runtime packages inside a node_modules path, tolerating both
// POSIX (`/`) and Windows (`\`) separators. The trailing separator anchors the
// match to the package directory so look-alike names (e.g. `react-icons`) are not
// vendored by mistake.
const REACT_RUNTIME_PACKAGES = /[\\/]node_modules[\\/](?:react-dom|react|scheduler)[\\/]/

export const assignManualChunk = (id: string): 'vendor' | undefined =>
  REACT_RUNTIME_PACKAGES.test(id) ? 'vendor' : undefined
