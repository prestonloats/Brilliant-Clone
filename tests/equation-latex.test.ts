import assert from 'node:assert/strict'
import { test } from 'node:test'

import { equationToAriaLabel, equationToLatex } from '../src/equationLatex'

// These lock in the behavior of the pure plain-text -> LaTeX converter that feeds KaTeX.
// They use the exact equation notations authored in src/content/lessons/*.ts so a future
// change to the regex transforms can't silently break how real lessons render.

test('equationToLatex returns an empty string for empty, blank, or nullish input', () => {
  assert.equal(equationToLatex(''), '')
  assert.equal(equationToLatex('   '), '')
  assert.equal(equationToLatex('\t\n'), '')
  assert.equal(equationToLatex(undefined as unknown as string), '')
  assert.equal(equationToLatex(null as unknown as string), '')
})

test('equationToLatex trims surrounding whitespace', () => {
  assert.equal(equationToLatex('  3x = 6  '), '3x = 6')
})

test('equationToLatex leaves KaTeX-native algebra notation unchanged', () => {
  // Numbers, single-letter variables, implicit multiplication (3x), +, -, =,
  // parentheses, commas, colons, and negatives are already valid LaTeX.
  assert.equal(equationToLatex('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToLatex('4x - 5 = 19'), '4x - 5 = 19')
  assert.equal(equationToLatex('18 = 5x + 3'), '18 = 5x + 3')
  assert.equal(equationToLatex('6x - 4 + 2x = 3x + 16'), '6x - 4 + 2x = 3x + 16')
  assert.equal(equationToLatex('y = 2x + 1'), 'y = 2x + 1')
  assert.equal(equationToLatex('y + 1 = 6'), 'y + 1 = 6')
  assert.equal(equationToLatex('(3, -2)'), '(3, -2)')
})

test('equationToLatex converts a "->" step into a right arrow', () => {
  assert.equal(equationToLatex('x - 5 = 9 -> x = 9'), 'x - 5 = 9 \\rightarrow x = 9')
})

test('equationToLatex converts every "->" in a multi-step solution chain', () => {
  assert.equal(
    equationToLatex('2x + 4 = 16 -> 2x = 12 -> x = 6.'),
    '2x + 4 = 16 \\rightarrow 2x = 12 \\rightarrow x = 6.',
  )
})

test('equationToLatex normalizes arrows regardless of surrounding spacing', () => {
  assert.equal(equationToLatex('a->b'), 'a \\rightarrow b')
  assert.equal(equationToLatex('a ->  b'), 'a \\rightarrow b')
})

test('equationToLatex converts a simple division into a fraction', () => {
  assert.equal(equationToLatex('x / 6 = 2'), '\\frac{x}{6} = 2')
  assert.equal(equationToLatex('x/3 - 4 = 2'), '\\frac{x}{3} - 4 = 2')
})

test('equationToLatex builds fractions from multi-character operands', () => {
  assert.equal(equationToLatex('2x / 3'), '\\frac{2x}{3}')
})

test('equationToLatex builds a fraction that is not at the start of the string', () => {
  assert.equal(equationToLatex('y = x / 2'), 'y = \\frac{x}{2}')
})

test('equationToLatex wraps multi-letter prose words in \\text so they stay upright', () => {
  assert.equal(
    equationToLatex('through (0, 5) and (2, 1)'),
    '\\text{through} (0, 5) \\text{and} (2, 1)',
  )
})

test('equationToLatex does not turn prose separated by a slash into a fraction', () => {
  // A fraction is only built between atomic operands; prose words become \text{...}
  // first, so the slash is left untouched instead of producing nonsense LaTeX.
  assert.equal(equationToLatex('rise / run'), '\\text{rise} / \\text{run}')
})

test('equationToLatex converts an explicit "*" into \\cdot', () => {
  assert.equal(equationToLatex('3*x'), '3 \\cdot x')
})

test('equationToLatex handles arrow and fraction transforms together', () => {
  assert.equal(equationToLatex('x / 6 -> x = 12'), '\\frac{x}{6} \\rightarrow x = 12')
})

test('equationToLatex keeps single-letter axis labels around an arrow', () => {
  assert.equal(
    equationToLatex('x: 0, 1, 2 -> y: 1, 3, 5'),
    'x: 0, 1, 2 \\rightarrow y: 1, 3, 5',
  )
})

test('equationToAriaLabel spells out the "->" step as ", then" for screen readers', () => {
  assert.equal(equationToAriaLabel('x - 5 = 9 -> x = 9'), 'x - 5 = 9, then x = 9')
  assert.equal(
    equationToAriaLabel('2x + 4 = 16 -> 2x = 12 -> x = 6.'),
    '2x + 4 = 16, then 2x = 12, then x = 6.',
  )
})

test('equationToAriaLabel leaves equations without an arrow announced as-is', () => {
  // Fractions, =, +, - read sensibly already, so the aria label keeps the plain text.
  assert.equal(equationToAriaLabel('3x - 5 = 19'), '3x - 5 = 19')
  assert.equal(equationToAriaLabel('x / 6 = 2'), 'x / 6 = 2')
})

test('equationToAriaLabel trims and tolerates empty or nullish input', () => {
  assert.equal(equationToAriaLabel('  3x = 6  '), '3x = 6')
  assert.equal(equationToAriaLabel(''), '')
  assert.equal(equationToAriaLabel(undefined as unknown as string), '')
  assert.equal(equationToAriaLabel(null as unknown as string), '')
})
