import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// equationToLatex is a pure string->string transform driven by a few conservative regexes.
// These tests pin its documented behavior (fractions, step arrows, prose words, explicit
// multiplication) plus the fail-soft edges (empty/garbage/idempotency) so lessons can author
// new notation against a known contract and a future refactor cannot silently change output.

test('passes plain equations with single-letter variables through unchanged', () => {
  // x and y are single letters, so the prose-word rule must not wrap them in \text{}.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
})

test('passes coordinate pairs through unchanged (commas, parens, negatives)', () => {
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
})

test('converts a simple division into a LaTeX fraction', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('x/6'), '\\frac{x}{6}')
})

test('converts a fraction that sits after an operator/equals delimiter', () => {
  assert.equal(equationToLatex('y = x/2'), 'y = \\frac{x}{2}')
  assert.equal(equationToLatex('2x/3'), '\\frac{2x}{3}')
})

test('converts the step arrow "->" into \\rightarrow with surrounding spaces', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
  // Works without surrounding spaces too, since the arrow regex consumes optional whitespace.
  assert.equal(equationToLatex('a->b'), 'a \\rightarrow b')
})

test('wraps multi-letter prose words in \\text{} but leaves single letters alone', () => {
  assert.equal(equationToLatex('through'), '\\text{through}')
  assert.equal(equationToLatex('rise over run'), '\\text{rise} \\text{over} \\text{run}')
  // A single x next to prose: only the prose word is wrapped.
  assert.equal(equationToLatex('let x'), '\\text{let} x')
})

test('does not re-wrap LaTeX command names introduced by later transforms', () => {
  // Prose runs first, then the arrow becomes \rightarrow — the command name "rightarrow"
  // must NOT end up wrapped in \text{}.
  const result = equationToLatex('slope -> rise')
  assert.equal(result, '\\text{slope} \\rightarrow \\text{rise}')
  assert.ok(!result.includes('\\text{rightarrow}'))
  assert.ok(!result.includes('\\text{frac}'))
})

test('converts explicit multiplication "*" into \\cdot and removes the asterisk', () => {
  const result = equationToLatex('3 * 4')
  assert.ok(result.includes('\\cdot'))
  assert.ok(!result.includes('*'))
})

test('returns an empty string for empty, whitespace, null, or undefined input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  // The converter guards with (input ?? '') so loose/garbage calls degrade instead of throwing.
  assert.equal(equationToLatex(undefined as unknown as string), '')
  assert.equal(equationToLatex(null as unknown as string), '')
})

test('trims surrounding whitespace before converting', () => {
  assert.equal(equationToLatex('  3x = 9  '), '3x = 9')
})

test('is idempotent on equations that need no conversion', () => {
  const plain = '2x + 1 = 7'
  assert.equal(equationToLatex(equationToLatex(plain)), plain)
})

// equationToAriaLabel keeps the original notation but spells out the step arrow so a screen
// reader does not announce "->" as "minus greater than".

test('equationToAriaLabel spells the step arrow as ", then"', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(equationToAriaLabel('a -> b -> c'), 'a, then b, then c')
})

test('equationToAriaLabel leaves arrow-free equations as readable plain text', () => {
  assert.equal(equationToAriaLabel('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToAriaLabel('  trim me  '), 'trim me')
})

test('equationToAriaLabel handles empty, null, and undefined input', () => {
  assert.equal(equationToAriaLabel(''), '')
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
  assert.equal(equationToAriaLabel(null as unknown as string), '')
})
