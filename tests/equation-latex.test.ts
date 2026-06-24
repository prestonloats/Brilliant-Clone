import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// --- equationToLatex: already-valid notation passes through untouched ---

test('equationToLatex leaves equations with single-letter variables unchanged', () => {
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('4x + 3 - x + 2y'), '4x + 3 - x + 2y')
})

test('equationToLatex leaves coordinates and negatives intact', () => {
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
  assert.equal(equationToLatex('-7 = -7'), '-7 = -7')
})

// --- equationToLatex: the few notations that differ from LaTeX ---

test('equationToLatex converts the solution-step arrow to \\rightarrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
  // Tight spacing around the arrow is normalized to single spaces.
  assert.equal(equationToLatex('a->b'), 'a \\rightarrow b')
})

test('equationToLatex turns a simple "operand / operand" into \\frac', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('2x/3'), '\\frac{2x}{3}')
  assert.equal(equationToLatex('y = x/2'), 'y = \\frac{x}{2}')
})

test('equationToLatex leaves a stray slash with no second operand untouched', () => {
  assert.equal(equationToLatex('x /'), 'x /')
  assert.equal(equationToLatex('/ 5'), '/ 5')
})

test('equationToLatex wraps multi-letter prose words in \\text so they stay upright', () => {
  assert.equal(equationToLatex('slope'), '\\text{slope}')
  assert.equal(equationToLatex('through and'), '\\text{through} \\text{and}')
})

test('equationToLatex converts an explicit * to \\cdot', () => {
  assert.equal(equationToLatex('3*4'), '3 \\cdot 4')
})

test('equationToLatex returns an empty string for empty, whitespace, or nullish input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex(null as unknown as string), '')
  assert.equal(equationToLatex(undefined as unknown as string), '')
})

// --- security: command-like words are wrapped in \text{}, so KaTeX (rendered with
// trust:false in MathText) can never honor active commands such as \href / \url that
// could otherwise emit a javascript: link. This is defense-in-depth even though only
// authored, structured notation currently reaches the converter. ---

test('equationToLatex neutralizes a \\href command by wrapping its name in \\text', () => {
  const out = equationToLatex('\\href{javascript:alert(1)}{x}')
  assert.ok(!out.includes('\\href'), 'the active \\href command must not survive conversion')
  assert.ok(out.includes('\\text{href}'), 'the command name is rendered as upright text')
  assert.ok(out.includes('\\text{javascript}'), 'the javascript scheme word is rendered as text')
})

test('equationToLatex neutralizes a \\url command as well', () => {
  const out = equationToLatex('\\url{javascript:alert(1)}')
  assert.ok(!out.includes('\\url'), 'the active \\url command must not survive conversion')
  assert.ok(out.includes('\\text{url}'))
})

// --- equationToAriaLabel: a readable plain-text label for screen readers ---

test('equationToAriaLabel spells out the step arrow as ", then"', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(equationToAriaLabel('a -> b -> c'), 'a, then b, then c')
})

test('equationToAriaLabel keeps arrow-free equations readable and trims them', () => {
  assert.equal(equationToAriaLabel('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToAriaLabel('  y = 2x + 1  '), 'y = 2x + 1')
})

test('equationToAriaLabel returns an empty string for nullish input', () => {
  assert.equal(equationToAriaLabel(''), '')
  assert.equal(equationToAriaLabel(null as unknown as string), '')
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
})
