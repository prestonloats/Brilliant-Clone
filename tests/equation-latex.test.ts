import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// These lock in the conservative, fail-soft transforms that turn the app's plain
// authoring notation into LaTeX for KaTeX. The converter is a pure string->string
// function with several regex branches, so pin the documented notations plus the edge
// cases (fractions, arrows, prose words, negatives, coordinates, empty/garbage input)
// before more lesson content is authored against it.

test('equationToLatex returns an empty string for empty or whitespace-only input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
})

test('equationToLatex tolerates null/undefined without throwing', () => {
  assert.equal(equationToLatex(null as unknown as string), '')
  assert.equal(equationToLatex(undefined as unknown as string), '')
})

test('equationToLatex trims surrounding whitespace', () => {
  assert.equal(equationToLatex('  3x - 5 = 19  '), '3x - 5 = 19')
})

test('equationToLatex leaves a plain linear equation untouched', () => {
  // Numbers, single-letter variables, implicit multiplication (3x), +, -, = all
  // already typeset correctly in KaTeX, so nothing should change.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
})

test('equationToLatex leaves coordinate pairs (incl. negatives) untouched', () => {
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
  assert.equal(equationToLatex('(-3, 4)'), '(-3, 4)')
})

test('equationToLatex converts a leading simple fraction', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
})

test('equationToLatex converts fractions with multi-character operands', () => {
  assert.equal(equationToLatex('2x / 3'), '\\frac{2x}{3}')
  assert.equal(equationToLatex('12 / 4 = 3'), '\\frac{12}{4} = 3')
})

test('equationToLatex converts the step arrow to \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
})

test('equationToLatex handles a fraction and an arrow together', () => {
  assert.equal(equationToLatex('x / 4 = 2 -> x = 8'), '\\frac{x}{4} = 2 \\rightarrow x = 8')
})

test('equationToLatex wraps multi-letter prose words in \\text{}', () => {
  assert.equal(equationToLatex('line through (0, 1)'), '\\text{line} \\text{through} (0, 1)')
})

test('equationToLatex does not re-wrap LaTeX command names introduced by later transforms', () => {
  // PROSE_WORD runs first, so the "rightarrow" of an arrow substitution is never
  // wrapped as \text{rightarrow}, and \text{...} braces are not re-scanned.
  const result = equationToLatex('add then -> x')
  assert.equal(result, '\\text{add} \\text{then} \\rightarrow x')
  assert.ok(!result.includes('\\text{rightarrow}'))
  assert.ok(!result.includes('\\text{text}'))
})

test('equationToLatex converts explicit multiplication to \\cdot', () => {
  const result = equationToLatex('3 * 4')
  assert.match(result, /\\cdot/)
  assert.ok(!result.includes('*'))
})

test('equationToLatex leaves a stray slash with no left operand as-is', () => {
  // The fraction transform only fires between two atomic operands, so a stray "/"
  // degrades gracefully instead of producing a malformed \frac.
  assert.equal(equationToLatex('/ 6'), '/ 6')
})

test('equationToAriaLabel spells out the step arrow for screen readers', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
})

test('equationToAriaLabel spells out every arrow in a multi-step chain', () => {
  assert.equal(equationToAriaLabel('a -> b -> c'), 'a, then b, then c')
})

test('equationToAriaLabel trims and tolerates empty/null input', () => {
  assert.equal(equationToAriaLabel('  3x = 9  '), '3x = 9')
  assert.equal(equationToAriaLabel(''), '')
  assert.equal(equationToAriaLabel(null as unknown as string), '')
})
