import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// `equationToLatex` is a pure, fail-soft string transform that lesson content depends on,
// so these tests pin its behavior (each conservative rule plus the edge cases that should
// be left untouched) before more notation is authored against it.

test('leaves already KaTeX-compatible notation unchanged', () => {
  // Single-letter variables, implicit multiplication (3x), +, -, =, numbers, parentheses,
  // commas, and negatives are all valid LaTeX as-authored, so none should be rewritten.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('x = -3'), 'x = -3')
})

test('preserves coordinate pairs verbatim', () => {
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
  assert.equal(equationToLatex('(0, 0)'), '(0, 0)')
})

test('converts a simple division into a LaTeX fraction', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('x/6 = 2'), '\\frac{x}{6} = 2')
})

test('treats a multi-character numerator as a single fraction operand', () => {
  assert.equal(equationToLatex('2x/3 = 4'), '\\frac{2x}{3} = 4')
})

test('converts multiple independent fractions in one expression', () => {
  assert.equal(equationToLatex('x/6 + y/2'), '\\frac{x}{6} + \\frac{y}{2}')
})

test('does not treat a lone slash (no operands) as a fraction', () => {
  // A bare "/" has no operand on either side, so it must be left as-is rather than
  // producing a malformed \frac.
  assert.equal(equationToLatex('/'), '/')
  assert.equal(equationToLatex('= /'), '= /')
})

test('only the first division of a chained quotient is converted (documented limitation)', () => {
  // "a/b/c" is ambiguous; the conservative converter rewrites the first pair and leaves
  // the trailing "/c" untouched rather than guessing associativity.
  assert.equal(equationToLatex('a/b/c'), '\\frac{a}{b}/c')
})

test('converts the step arrow "->" into \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
})

test('normalizes arrow spacing whether or not spaces were authored', () => {
  assert.equal(equationToLatex('x=9->x=9'), 'x=9 \\rightarrow x=9')
})

test('converts multiple arrows in a solution chain', () => {
  const result = equationToLatex('a -> b -> c')
  assert.equal(result, 'a \\rightarrow b \\rightarrow c')
})

test('converts an explicit asterisk into \\cdot', () => {
  assert.equal(equationToLatex('x*y = 6'), 'x \\cdot y = 6')
})

test('removes every literal asterisk when explicit multiplication is used', () => {
  const result = equationToLatex('2 * 3 = 6')
  assert.ok(result.includes('\\cdot'), 'expected a \\cdot in the output')
  assert.ok(!result.includes('*'), 'expected no literal asterisk to remain')
})

test('wraps prose words of two or more letters in \\text{} but leaves single-letter variables alone', () => {
  assert.equal(equationToLatex('slope through and'), '\\text{slope} \\text{through} \\text{and}')
  // x and y are single letters (variables) and stay as italic math.
  const result = equationToLatex('x and y')
  assert.equal(result, 'x \\text{and} y')
})

test('treats a multi-letter token as prose text (conservative variable handling)', () => {
  // "mx" is two letters, so it is wrapped as upright text rather than guessed as m*x.
  assert.equal(equationToLatex('y = mx + b'), 'y = \\text{mx} + b')
})

test('does not re-wrap the LaTeX command names it introduces', () => {
  // Prose wrapping runs before \frac/\rightarrow/\cdot are introduced, so "frac",
  // "rightarrow", and "cdot" must never appear inside their own \text{...}.
  const fraction = equationToLatex('x / 6')
  assert.ok(!fraction.includes('\\text{frac}'), 'frac command name should not be wrapped')
  assert.equal(fraction, '\\frac{x}{6}')

  const arrow = equationToLatex('a -> b')
  assert.ok(!arrow.includes('\\text{rightarrow}'), 'rightarrow command name should not be wrapped')

  const times = equationToLatex('p*q')
  assert.ok(!times.includes('\\text{cdot}'), 'cdot command name should not be wrapped')
})

test('returns an empty string for empty, whitespace, null, or undefined input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex(null as unknown as string), '')
  assert.equal(equationToLatex(undefined as unknown as string), '')
})

test('trims surrounding whitespace before converting', () => {
  assert.equal(equationToLatex('  x / 6 = 2  '), '\\frac{x}{6} = 2')
})

test('is stable when re-applied to its own non-fraction output (no double-wrapping)', () => {
  // Re-running the converter on output that contains no fresh prose/fraction/arrow/star
  // should be a no-op, which protects content that is converted more than once.
  const once = equationToLatex('3x - 5 = 19')
  assert.equal(equationToLatex(once), once)
})

// --- equationToAriaLabel: a screen-reader-friendly plain-text label ---

test('equationToAriaLabel keeps ordinary operators readable and untouched', () => {
  assert.equal(equationToAriaLabel('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToAriaLabel('x / 6 = 2'), 'x / 6 = 2')
})

test('equationToAriaLabel spells the step arrow as ", then "', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(equationToAriaLabel('(x, y) -> (1, 2)'), '(x, y), then (1, 2)')
})

test('equationToAriaLabel trims and tolerates empty, null, and undefined input', () => {
  assert.equal(equationToAriaLabel('  x = 1  '), 'x = 1')
  assert.equal(equationToAriaLabel(''), '')
  assert.equal(equationToAriaLabel(null as unknown as string), '')
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
})
