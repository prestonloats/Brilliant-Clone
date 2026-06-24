import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// These tests pin the conservative, fail-soft transforms in equationToLatex so
// lesson authors can rely on its behavior. The function deliberately leaves
// anything it does not recognize untouched (and MathText renders KaTeX with
// throwOnError:false), so the assertions below intentionally cover both the
// transforms AND the "left as-is" cases.

test('equationToLatex passes ordinary equations through unchanged', () => {
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  // Single-letter variables must stay italic math, never wrapped in \text{}.
  assert.equal(equationToLatex('x = 4'), 'x = 4')
})

test('equationToLatex leaves coordinates and negatives intact', () => {
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
  assert.equal(equationToLatex('(-1, -4)'), '(-1, -4)')
})

test('equationToLatex trims surrounding whitespace before converting', () => {
  assert.equal(equationToLatex('   3x = 9   '), '3x = 9')
})

test('equationToLatex returns an empty string for empty/whitespace input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('     '), '')
})

test('equationToLatex wraps multi-letter prose words in \\text{} but not single letters', () => {
  assert.equal(equationToLatex('rise over run'), '\\text{rise} \\text{over} \\text{run}')
  // Mixed: prose word wrapped, single-letter variable left as math.
  assert.equal(equationToLatex('slope is m'), '\\text{slope} \\text{is} m')
})

test('equationToLatex converts -> into a right arrow with single spacing', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
  // Chained arrows each convert.
  assert.equal(equationToLatex('2x = 8 -> x = 4 -> done').includes('\\rightarrow x = 4 \\rightarrow'), true)
})

test('equationToLatex converts a simple operand/operand division into \\frac', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('2x/3'), '\\frac{2x}{3}')
  // The leading delimiter is preserved so the fraction only forms between two operands.
  assert.equal(equationToLatex('1 + x/2'), '1 + \\frac{x}{2}')
})

test('equationToLatex does NOT treat a stray slash as a fraction', () => {
  // No operand on one side -> left exactly as authored.
  assert.equal(equationToLatex('x /'), 'x /')
  assert.equal(equationToLatex('/ 6'), '/ 6')
})

test('equationToLatex converts an explicit * into \\cdot', () => {
  assert.equal(equationToLatex('2*3'), '2 \\cdot 3')
  assert.equal(equationToLatex('a * b').includes('\\cdot'), true)
})

test('equationToLatex never re-wraps the LaTeX command names it just produced', () => {
  // Prose-wrapping runs first, so "frac"/"rightarrow"/"text" are never created
  // before prose substitution and therefore can never be wrapped in \text{}.
  const out = equationToLatex('half is x / 2 -> done')
  assert.equal(out, '\\text{half} \\text{is} \\frac{x}{2} \\rightarrow \\text{done}')
  assert.equal(out.includes('\\text{frac}'), false)
  assert.equal(out.includes('\\text{rightarrow}'), false)
})

test('equationToAriaLabel spells out the step arrow for screen readers', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(equationToAriaLabel('2x = 8 -> x = 4 -> done'), '2x = 8, then x = 4, then done')
})

test('equationToAriaLabel passes arrow-free equations through (trimmed)', () => {
  assert.equal(equationToAriaLabel('3x = 9'), '3x = 9')
  assert.equal(equationToAriaLabel('   y = 2x + 1   '), 'y = 2x + 1')
  assert.equal(equationToAriaLabel(''), '')
})
