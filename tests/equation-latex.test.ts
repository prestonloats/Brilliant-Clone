import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

test('equationToLatex returns an empty string for empty, blank, or nullish input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex('\t\n'), '')
  // The function guards with (input ?? '') so a nullish value degrades to '' rather than throwing.
  assert.equal(equationToLatex(undefined as unknown as string), '')
  assert.equal(equationToLatex(null as unknown as string), '')
})

test('equationToLatex leaves KaTeX-native notation untouched', () => {
  // Numbers, single-letter variables, implicit multiplication, +, -, =, parens and commas
  // already typeset correctly, so they must pass through unchanged.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
})

test('equationToLatex trims surrounding whitespace before converting', () => {
  assert.equal(equationToLatex('  3x = 9  '), '3x = 9')
})

test('equationToLatex converts the step arrow to \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
  // Tight arrows (no surrounding spaces) are normalized with spacing too.
  assert.equal(equationToLatex('a->b'), 'a \\rightarrow b')
  // Multiple arrows in a solution chain all convert.
  assert.equal(equationToLatex('a -> b -> c'), 'a \\rightarrow b \\rightarrow c')
})

test('equationToLatex turns simple divisions into \\frac', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('x/6'), '\\frac{x}{6}')
  assert.equal(equationToLatex('2x/3'), '\\frac{2x}{3}')
  // Fractions are detected after an operator and at the start of the string.
  assert.equal(equationToLatex('1 + 1/2'), '1 + \\frac{1}{2}')
  // Several independent fractions each convert.
  assert.equal(equationToLatex('x/2 + y/3'), '\\frac{x}{2} + \\frac{y}{3}')
})

test('equationToLatex leaves a stray slash without two operands as-is', () => {
  // The fraction transform requires an operand on each side, so a dangling slash is not
  // rewritten (and KaTeX renders the literal slash fine).
  assert.equal(equationToLatex('x/'), 'x/')
  assert.equal(equationToLatex('/3'), '/3')
})

test('equationToLatex wraps multi-letter prose words in \\text but keeps single variables', () => {
  assert.equal(
    equationToLatex('line through origin'),
    '\\text{line} \\text{through} \\text{origin}',
  )
  // Single-letter variables x and y stay as math italics (not wrapped).
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  // A word mixed with a fraction: the word is wrapped, the fraction is built, and the
  // \frac/\text command names introduced by the conversion are never re-wrapped as prose.
  const mixed = equationToLatex('half is 1/2')
  assert.match(mixed, /\\text\{half\}/)
  assert.match(mixed, /\\text\{is\}/)
  assert.match(mixed, /\\frac\{1\}\{2\}/)
  assert.ok(!/\\text\{frac\}/.test(mixed), 'must not re-wrap the \\frac command name')
  assert.ok(!/\\text\{text\}/.test(mixed), 'must not re-wrap the \\text command name')
})

test('equationToLatex converts explicit * to \\cdot', () => {
  const result = equationToLatex('3 * x')
  assert.match(result, /\\cdot/)
  assert.ok(!result.includes('*'), 'the literal asterisk should be replaced')
})

test('equationToLatex never re-wraps the \\rightarrow command name as prose', () => {
  const result = equationToLatex('x -> y')
  assert.equal(result, 'x \\rightarrow y')
  assert.ok(!/\\text\{rightarrow\}/.test(result), 'rightarrow must stay a command, not prose')
})

test('equationToAriaLabel spells out the step arrow for screen readers', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(equationToAriaLabel('a -> b -> c'), 'a, then b, then c')
})

test('equationToAriaLabel trims and tolerates empty or nullish input', () => {
  assert.equal(equationToAriaLabel('  x = 3  '), 'x = 3')
  assert.equal(equationToAriaLabel('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToAriaLabel(''), '')
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
})
