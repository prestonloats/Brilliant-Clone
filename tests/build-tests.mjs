// Fast test build: esbuild strips types and transpiles every src/tests .ts file to
// CommonJS in dist-tests/, mirroring the source layout so Node's CJS resolver finds the
// extensionless imports (e.g. `require("../src/domain")` -> `../src/domain.js`). This does
// NOT type-check — run `npm run typecheck` (tsc) for that. The whole transpile takes ~100ms
// versus ~20s for a full `tsc` build, and `node --test` runs the result in well under 1s.
import { build } from 'esbuild'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_ROOTS = ['src', 'tests']
// Output dir defaults to `dist-tests` (used by `npm test`). An optional first CLI arg overrides it
// (e.g. `node tests/build-tests.mjs dist-tests-foo`) so parallel runs can build/test in isolation
// without clobbering each other's shared output.
const OUT_DIR = process.argv[2] ?? 'dist-tests'
// Optional explicit entry files (CLI args after the out dir) transpile ONLY those .ts files instead
// of the whole tree. This lets parallel, isolated runs avoid recompiling (and breaking on) each
// other's in-progress files. Every cross-file import in such an entry must be a type-only
// `import type` (erased at transpile) so no runtime require dangles outside the listed entries.
const EXPLICIT_ENTRIES = process.argv.slice(3)

let entryPoints = []
if (EXPLICIT_ENTRIES.length > 0) {
  entryPoints = EXPLICIT_ENTRIES
} else {
  for (const root of SOURCE_ROOTS) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const path = join(root, entry.toString())
      // Type-only declaration files have nothing to emit; .tsx components are never imported
      // by the (DOM-free) node:test suites, so transpiling pure .ts is enough.
      if (path.endsWith('.ts') && !path.endsWith('.d.ts')) entryPoints.push(path)
    }
  }
}

rmSync(OUT_DIR, { recursive: true, force: true })

await build({
  entryPoints,
  outdir: OUT_DIR,
  outbase: '.',
  bundle: false,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'warning',
})

// node:test treats .js as ESM under this repo's "type": "module"; this nested manifest marks
// the emitted CommonJS output as CommonJS so the compiled requires load correctly.
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'package.json'), JSON.stringify({ type: 'commonjs' }))
