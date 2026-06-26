import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// `equationToLatex` is a pure string -> string transform that the lesson content and the
// `MathText` component depend on for every rendered equation. These tests pin the documented
// contract (arrow, fraction, explicit-times, and prose-word handling) plus the conservative
// "leave anything else alone" guarantee, so future notation can be authored against it safely.

test('equationToLatex returns empty string for empty or whitespace-only input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex('\t\n '), '')
})

test('equationToLatex trims surrounding whitespace before converting', () => {
  assert.equal(equationToLatex('  3x - 5 = 19  '), '3x - 5 = 19')
})

test('equationToLatex leaves plain linear equations untouched', () => {
  // Numbers, single-letter variables, implicit multiplication, +, -, = all render in LaTeX as-is.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
})

test('equationToLatex leaves coordinates and negatives untouched', () => {
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
  assert.equal(equationToLatex('(-1, 4)'), '(-1, 4)')
})

test('equationToLatex converts the step arrow to \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
  // Arrow without surrounding spaces is still normalized to a spaced \rightarrow.
  assert.equal(equationToLatex('a->b'), 'a \\rightarrow b')
})

test('equationToLatex converts a simple operand / operand into \\frac', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('2x / 3'), '\\frac{2x}{3}')
  assert.equal(equationToLatex('6 / 2'), '\\frac{6}{2}')
})

test('equationToLatex detects a fraction mid-expression after a delimiter', () => {
  assert.equal(equationToLatex('y = x / 2'), 'y = \\frac{x}{2}')
})

test('equationToLatex leaves a stray slash without two operands as-is', () => {
  // A lone slash is not a fraction; the transform is conservative and degrades gracefully.
  assert.equal(equationToLatex('/ 2'), '/ 2')
  assert.equal(equationToLatex('x /'), 'x /')
})

test('equationToLatex converts an explicit asterisk into \\cdot', () => {
  assert.equal(equationToLatex('3*x'), '3 \\cdot x')
})

test('equationToLatex wraps multi-letter prose words in \\text', () => {
  assert.equal(equationToLatex('slope through (0, 1)'), '\\text{slope} \\text{through} (0, 1)')
})

test('equationToLatex wraps prose before introducing commands so command names are never re-wrapped', () => {
  // PROSE_WORD runs first, so the generated \rightarrow / \frac / \text command names must not be
  // re-wrapped in \text{...} on a later pass. This is the key ordering invariant of the converter.
  const result = equationToLatex('go -> stop')
  assert.equal(result, '\\text{go} \\rightarrow \\text{stop}')
  assert.doesNotMatch(result, /\\text\{rightarrow\}/)
})

test('equationToLatex does not crash and returns a string for surprising input', () => {
  for (const input of ['', '->', '/', '***', '====', '\\frac', '(((', '🙂 + x']) {
    assert.equal(typeof equationToLatex(input), 'string')
  }
})

test('equationToAriaLabel spells out the step arrow as ", then"', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(equationToAriaLabel('a -> b -> c'), 'a, then b, then c')
})

test('equationToAriaLabel trims and otherwise preserves the plain equation', () => {
  assert.equal(equationToAriaLabel('  3x = 12  '), '3x = 12')
  assert.equal(equationToAriaLabel('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToAriaLabel(''), '')
})
