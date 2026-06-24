import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// --- equationToLatex: pass-through cases ------------------------------------------
// KaTeX already typesets numbers, single-letter variables, implicit multiplication,
// +, -, =, parentheses, commas, and negatives, so these must survive untouched.

test('equationToLatex leaves a plain equation unchanged', () => {
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
})

test('equationToLatex keeps coordinates and negatives intact', () => {
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
  assert.equal(equationToLatex('(0, 5)'), '(0, 5)')
})

test('equationToLatex does not wrap single-letter variables in \\text', () => {
  // x and y must stay as italic math variables, never upright \text.
  const result = equationToLatex('x = 3')
  assert.equal(result, 'x = 3')
  assert.ok(!result.includes('\\text'))
  assert.equal(equationToLatex('y - x = 0'), 'y - x = 0')
})

// --- equationToLatex: empty / whitespace -----------------------------------------

test('equationToLatex returns an empty string for empty or blank input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex('\t \n'), '')
})

test('equationToLatex trims surrounding whitespace before converting', () => {
  assert.equal(equationToLatex('  x = 3  '), 'x = 3')
})

// --- equationToLatex: fractions --------------------------------------------------

test('equationToLatex converts a simple division into a LaTeX fraction', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('x/6'), '\\frac{x}{6}')
})

test('equationToLatex treats a multi-character numerator as one fraction operand', () => {
  assert.equal(equationToLatex('2x/3 = 4'), '\\frac{2x}{3} = 4')
})

test('equationToLatex preserves the delimiter that precedes a mid-expression fraction', () => {
  // The leading operator/space is captured and re-emitted so spacing survives.
  assert.equal(equationToLatex('1 + x/2'), '1 + \\frac{x}{2}')
})

test('equationToLatex ignores a stray slash that is not between two operands', () => {
  // A lone trailing slash is not a fraction and must be left as-is.
  assert.equal(equationToLatex('x /'), 'x /')
  assert.equal(equationToLatex('/ 6'), '/ 6')
})

// --- equationToLatex: arrows -----------------------------------------------------

test('equationToLatex converts a solution-chain arrow into \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
})

test('equationToLatex converts every arrow in a multi-step chain', () => {
  assert.equal(
    equationToLatex('3x + 6 = 21 -> 3x = 15 -> x = 5'),
    '3x + 6 = 21 \\rightarrow 3x = 15 \\rightarrow x = 5',
  )
})

// --- equationToLatex: prose words ------------------------------------------------

test('equationToLatex wraps multi-letter prose words in \\text so they stay upright', () => {
  assert.equal(
    equationToLatex('through (0, 5) and (2, 1)'),
    '\\text{through} (0, 5) \\text{and} (2, 1)',
  )
})

test('equationToLatex wraps a multi-letter variable token in \\text', () => {
  assert.equal(equationToLatex('xy = 1'), '\\text{xy} = 1')
})

test('equationToLatex does not re-wrap the LaTeX command names it introduces', () => {
  // Prose-wrapping runs first, so \frac/\rightarrow/\text are never themselves wrapped
  // even when text, a fraction, and an arrow all appear in one string.
  const result = equationToLatex('half is x / 2 -> done')
  assert.equal(result, '\\text{half} \\text{is} \\frac{x}{2} \\rightarrow \\text{done}')
  assert.ok(!result.includes('\\text{frac}'))
  assert.ok(!result.includes('\\text{rightarrow}'))
  assert.ok(!result.includes('\\text{text}'))
})

// --- equationToLatex: explicit multiplication ------------------------------------

test('equationToLatex converts an explicit asterisk into \\cdot', () => {
  const result = equationToLatex('2 * 3')
  assert.ok(result.includes('\\cdot'))
  assert.ok(!result.includes('*'))
})

// --- equationToAriaLabel ---------------------------------------------------------
// The screen-reader label keeps the original notation but spells out the step arrow,
// which a screen reader would otherwise read as "minus greater than".

test('equationToAriaLabel spells the step arrow out as ", then"', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
})

test('equationToAriaLabel spells out every arrow in a chain', () => {
  assert.equal(equationToAriaLabel('a -> b -> c'), 'a, then b, then c')
})

test('equationToAriaLabel leaves an arrowless equation unchanged except trimming', () => {
  assert.equal(equationToAriaLabel('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToAriaLabel('  x = 3  '), 'x = 3')
})

test('equationToAriaLabel returns an empty string for blank input', () => {
  assert.equal(equationToAriaLabel(''), '')
  assert.equal(equationToAriaLabel('   '), '')
})
