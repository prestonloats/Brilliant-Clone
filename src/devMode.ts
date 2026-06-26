// Dev-tools gate. Vite sets `import.meta.env.DEV` (true under `vite dev`, false in production
// builds), and the optional `VITE_DEV_TOOLS` env var can force the developer-only UI on or off
// regardless of that default. This module is intentionally pure (no imports, no `import.meta`) so
// it stays unit-testable: the .tsx callers read `import.meta.env` and pass the relevant fields in.

export type DevToolsEnv = { DEV?: boolean; VITE_DEV_TOOLS?: string }

const TRUTHY = new Set(['true', '1', 'on', 'yes'])
const FALSY = new Set(['false', '0', 'off', 'no'])

export function isDevToolsEnabled(env: DevToolsEnv): boolean {
  const flag = env.VITE_DEV_TOOLS?.trim().toLowerCase()
  if (flag !== undefined) {
    if (TRUTHY.has(flag)) return true
    if (FALSY.has(flag)) return false
  }
  // Missing, empty, or unrecognized flag -> defer to Vite's DEV default.
  return env.DEV === true
}
