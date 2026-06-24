import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

test('plain equations without special notation pass through unchanged', () => {
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  // Coordinate pairs use only digits, commas, signs and parentheses, which KaTeX
  // already typesets, so the converter must leave them alone.
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
})

test('simple operand division becomes a LaTeX fraction', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('2x/3'), '\\frac{2x}{3}')
  // The leading delimiter is preserved so the fraction stays in context.
  assert.equal(equationToLatex('y = x/2'), 'y = \\frac{x}{2}')
})

test('the step arrow becomes a right arrow command', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
})

test('explicit multiplication asterisks become \\cdot', () => {
  assert.match(equationToLatex('2 * 3'), /\\cdot/)
  assert.doesNotMatch(equationToLatex('2 * 3'), /\*/)
})

test('multi-letter prose words are wrapped as upright text, single variables are not', () => {
  assert.equal(equationToLatex('slope'), '\\text{slope}')
  // Single-letter variables (x, y) must remain italic math, never wrapped in \text.
  assert.equal(equationToLatex('x = y'), 'x = y')
  // Prose is wrapped before any LaTeX command is introduced, so command names
  // (\frac, \rightarrow, \text) are never themselves re-wrapped as text.
  assert.doesNotMatch(equationToLatex('rise -> run'), /text\{rightarrow\}|text\{frac\}/)
})

test('empty, whitespace, and nullish input degrade to an empty string', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex(undefined as unknown as string), '')
  assert.equal(equationToLatex(null as unknown as string), '')
})

test('aria label spells out the step arrow and trims surrounding whitespace', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(equationToAriaLabel('  3x - 5 = 19  '), '3x - 5 = 19')
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
})
