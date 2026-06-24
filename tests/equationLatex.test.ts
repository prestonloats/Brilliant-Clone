import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// equationToLatex converts the app's plain authoring notation into a LaTeX string for
// KaTeX. These tests pin its conservative, fail-soft transforms so lessons can author more
// notation against it without silently changing how an equation renders.

test('equationToLatex returns an empty string for blank or nullish input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  // The `input ?? ''` guard tolerates a nullish value without throwing.
  assert.equal(equationToLatex(undefined as unknown as string), '')
})

test('equationToLatex trims surrounding whitespace', () => {
  assert.equal(equationToLatex('  3x = 6  '), '3x = 6')
})

test('equationToLatex leaves a plain equation (numbers, single-letter vars) untouched', () => {
  // KaTeX already typesets digits, implicit multiplication (3x), +, -, = correctly, so a
  // plain equation must pass through with no LaTeX commands introduced.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
})

test('equationToLatex rewrites a simple division into a \\frac', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
})

test('equationToLatex preserves the delimiter that precedes a fraction', () => {
  // The leading delimiter is captured so the slash is only treated as a fraction when it
  // sits between two operands, and the surrounding spacing/operator survives the rewrite.
  assert.equal(equationToLatex('y = x / 6'), 'y = \\frac{x}{6}')
})

test('equationToLatex leaves a slash without two operands alone', () => {
  // No denominator -> not a fraction; the conservative transform leaves it as-is.
  assert.equal(equationToLatex('x = a/'), 'x = a/')
})

test('equationToLatex turns the step arrow into \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
})

test('equationToLatex wraps multi-letter prose words in \\text so they stay upright', () => {
  // Every 2+ letter run (including "over") becomes upright text instead of a run of
  // italic variables.
  assert.equal(equationToLatex('rise over run'), '\\text{rise} \\text{over} \\text{run}')
})

test('equationToLatex does not re-wrap the LaTeX command names it introduces', () => {
  // Prose-wrapping runs first, before \frac / \rightarrow are introduced, so "frac" and
  // "rightarrow" never get wrapped in \text.
  assert.equal(equationToLatex('a / b -> c'), '\\frac{a}{b} \\rightarrow c')
})

test('equationToLatex converts an explicit asterisk into \\cdot', () => {
  assert.equal(equationToLatex('3*4'), '3 \\cdot 4')
})

test('equationToLatex applies every transform together in one pass', () => {
  assert.equal(
    equationToLatex('2x / 3 = y -> done'),
    '\\frac{2x}{3} = y \\rightarrow \\text{done}',
  )
})

// equationToAriaLabel keeps the original equation but spells out the "->" step arrow so a
// screen reader announces it sensibly instead of reading "minus greater than".

test('equationToAriaLabel spells out the step arrow', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
})

test('equationToAriaLabel leaves an arrow-free equation as plain text', () => {
  assert.equal(equationToAriaLabel('3x - 5 = 19'), '3x - 5 = 19')
})

test('equationToAriaLabel trims and tolerates nullish input', () => {
  assert.equal(equationToAriaLabel('  (3, -2)  '), '(3, -2)')
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
})
