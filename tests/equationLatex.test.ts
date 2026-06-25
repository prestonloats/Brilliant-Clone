import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// equationToLatex is the single conversion that turns the app's plain-text equation
// authoring notation into the LaTeX that KaTeX renders for every equation in the course.
// These tests pin the documented contract (see the header of src/equationLatex.ts) and the
// real notations used by the authored lessons (arrow chains, simple fractions, prose words).

test('passes ordinary equations through untouched (no false positives)', () => {
  // Single-letter variables, implicit multiplication, +, -, =, and parentheses are all valid
  // LaTeX as written, so the converter must not rewrite them.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
})

test('converts a simple fraction at the start of the string', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
})

test('converts numeric and coefficient fractions', () => {
  assert.equal(equationToLatex('6 / 2'), '\\frac{6}{2}')
  assert.equal(equationToLatex('2x / 3'), '\\frac{2x}{3}')
})

test('preserves the leading delimiter in front of a mid-string fraction', () => {
  // The delimiter (here the space after "=") is captured and re-emitted so the fraction is
  // only formed between two atomic operands, never by swallowing the operator before it.
  assert.equal(equationToLatex('y = x / 6'), 'y = \\frac{x}{6}')
  assert.equal(equationToLatex('-4 / 2 = -2'), '-\\frac{4}{2} = -2')
})

test('leaves a slash between non-atomic (parenthesized) operands as a literal slash', () => {
  // Conservative behavior: a fraction needs a letter/digit operand on each side, so a slash
  // between parenthesized sub-expressions is kept verbatim instead of being mis-fractioned.
  assert.equal(equationToLatex('(1 - 5) / (2 - 0)'), '(1 - 5) / (2 - 0)')
})

test('leaves an incomplete fraction (missing denominator) untouched', () => {
  assert.equal(equationToLatex('x /'), 'x /')
})

test('converts the step arrow to \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
})

test('converts every arrow in a multi-step chain', () => {
  assert.equal(
    equationToLatex('2x + 4 = 16 -> 2x = 12 -> x = 6'),
    '2x + 4 = 16 \\rightarrow 2x = 12 \\rightarrow x = 6',
  )
})

test('normalizes arrow spacing whether or not the source had spaces', () => {
  assert.equal(equationToLatex('a->b'), 'a \\rightarrow b')
})

test('wraps multi-letter prose words in \\text so they stay upright', () => {
  assert.equal(equationToLatex('y = 2x through (1, 3)'), 'y = 2x \\text{through} (1, 3)')
})

test('does not wrap single-letter variables as prose', () => {
  // x and y must remain italic math variables, not \text.
  assert.equal(equationToLatex('y = x'), 'y = x')
})

test('runs prose-wrapping before LaTeX commands so command names are never re-wrapped', () => {
  // If prose-wrapping ran after \frac was introduced, "frac" would be re-wrapped as \text{frac}.
  const result = equationToLatex('x / 6')
  assert.equal(result, '\\frac{x}{6}')
  assert.ok(!result.includes('\\text{frac}'))
})

test('converts an explicit * to \\cdot', () => {
  assert.equal(equationToLatex('3*4'), '3 \\cdot 4')
})

test('trims surrounding whitespace and returns empty string for blank input', () => {
  assert.equal(equationToLatex('  3x = 9  '), '3x = 9')
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
})

test('aria label spells the step arrow as ", then" for screen readers', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
})

test('aria label rewrites every arrow in a chain', () => {
  assert.equal(equationToAriaLabel('a -> b -> c'), 'a, then b, then c')
})

test('aria label trims and leaves arrow-free equations readable as-is', () => {
  assert.equal(equationToAriaLabel('  3x = 9  '), '3x = 9')
  assert.equal(equationToAriaLabel('x / 6 = 2'), 'x / 6 = 2')
})
