import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isDevToolsEnabled } from '../src/devMode'

// Pins the pure dev-tools gate: `VITE_DEV_TOOLS` (when recognized) overrides Vite's `DEV` default,
// otherwise the gate falls back to `DEV === true`.

test('DEV alone toggles the gate when no flag is set', () => {
  assert.equal(isDevToolsEnabled({ DEV: true }), true)
  assert.equal(isDevToolsEnabled({ DEV: false }), false)
  assert.equal(isDevToolsEnabled({}), false) // missing DEV is treated as not enabled
})

test('truthy VITE_DEV_TOOLS forces enabled even when DEV is false', () => {
  for (const value of ['true', '1', 'on', 'yes']) {
    assert.equal(isDevToolsEnabled({ DEV: false, VITE_DEV_TOOLS: value }), true, value)
  }
})

test('falsy VITE_DEV_TOOLS forces disabled even when DEV is true', () => {
  for (const value of ['false', '0', 'off', 'no']) {
    assert.equal(isDevToolsEnabled({ DEV: true, VITE_DEV_TOOLS: value }), false, value)
  }
})

test('the flag is case-insensitive and trimmed', () => {
  assert.equal(isDevToolsEnabled({ DEV: false, VITE_DEV_TOOLS: '  TRUE ' }), true)
  assert.equal(isDevToolsEnabled({ DEV: true, VITE_DEV_TOOLS: '  Off  ' }), false)
})

test('an unrecognized flag falls back to DEV', () => {
  assert.equal(isDevToolsEnabled({ DEV: true, VITE_DEV_TOOLS: 'maybe' }), true)
  assert.equal(isDevToolsEnabled({ DEV: false, VITE_DEV_TOOLS: 'maybe' }), false)
})

test('an empty or whitespace-only flag falls back to DEV', () => {
  assert.equal(isDevToolsEnabled({ DEV: true, VITE_DEV_TOOLS: '' }), true)
  assert.equal(isDevToolsEnabled({ DEV: false, VITE_DEV_TOOLS: '   ' }), false)
})
