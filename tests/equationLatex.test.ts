import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

test('equationToLatex returns an empty string for blank, whitespace, or nullish input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex(undefined as unknown as string), '')
  assert.equal(equationToLatex(null as unknown as string), '')
})

test('equationToLatex trims surrounding whitespace', () => {
  assert.equal(equationToLatex('  3x - 5 = 19  '), '3x - 5 = 19')
})

test('equationToLatex leaves already-valid KaTeX-friendly notation unchanged', () => {
  // Numbers, single-letter variables, implicit multiplication, +/-/= and parentheses
  // already typeset correctly, so the conservative converter should not touch them.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
})

test('equationToLatex converts the step arrow "->" into \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
  // Arrow conversion is whitespace tolerant on both sides.
  assert.equal(equationToLatex('a->b'), 'a \\rightarrow b')
})

test('equationToLatex converts a simple operand/operand division into \\frac', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('2x / 3'), '\\frac{2x}{3}')
})

test('equationToLatex preserves the leading delimiter when building a fraction', () => {
  // The slash is only treated as a fraction between two atomic operands, and the
  // captured leading delimiter (here the space after "+") must be kept.
  assert.equal(equationToLatex('2 + x/3'), '2 + \\frac{x}{3}')
  assert.equal(equationToLatex('y = x / 2'), 'y = \\frac{x}{2}')
})

test('equationToLatex converts explicit multiplication "*" into \\cdot', () => {
  assert.equal(equationToLatex('3*4'), '3 \\cdot 4')
  assert.equal(equationToLatex('2*x'), '2 \\cdot x')
})

test('equationToLatex wraps multi-letter prose words in \\text so they stay upright', () => {
  // Every run of two or more letters becomes upright text.
  assert.equal(equationToLatex('rise over run'), '\\text{rise} \\text{over} \\text{run}')
  // Single-letter variables stay as math italics and must not be wrapped.
  assert.equal(equationToLatex('x and y'), 'x \\text{and} y')
})

test('equationToLatex never wraps generated LaTeX command names in \\text', () => {
  // Prose wrapping runs before any LaTeX command is introduced, so command names
  // like "frac", "rightarrow", "cdot", and "text" can never be re-wrapped. This
  // protects the rendered output from malformed, double-escaped markup.
  const fromArrowAndFraction = equationToLatex('a / b -> c')
  assert.equal(fromArrowAndFraction, '\\frac{a}{b} \\rightarrow c')
  assert.doesNotMatch(fromArrowAndFraction, /\\text\{frac\}/)
  assert.doesNotMatch(fromArrowAndFraction, /\\text\{rightarrow\}/)

  const fromTimes = equationToLatex('2 * 3 -> 6')
  assert.doesNotMatch(fromTimes, /\\text\{cdot\}/)
  assert.doesNotMatch(fromTimes, /\\text\{text\}/)
})

test('equationToLatex applies several transforms together for a multi-step solution', () => {
  assert.equal(
    equationToLatex('2x / 4 = 3 -> x = 6'),
    '\\frac{2x}{4} = 3 \\rightarrow x = 6',
  )
})

test('equationToAriaLabel spells out the step arrow for screen readers', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
})

test('equationToAriaLabel handles multiple arrows and trims input', () => {
  assert.equal(equationToAriaLabel('  a -> b -> c  '), 'a, then b, then c')
})

test('equationToAriaLabel leaves equations without an arrow unchanged (trimmed)', () => {
  assert.equal(equationToAriaLabel('  3x - 5 = 19  '), '3x - 5 = 19')
})

test('equationToAriaLabel returns an empty string for nullish input', () => {
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
  assert.equal(equationToAriaLabel(null as unknown as string), '')
})
