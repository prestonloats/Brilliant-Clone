import assert from 'node:assert/strict'
import { test } from 'node:test'

import katex from 'katex'

import { equationToLatex } from '../src/equationLatex'
import { lessons } from '../src/content/lessons'

// MathText renders equations by feeding equationToLatex(...) into KaTeX. The
// pure converter tests (equation-latex.test.ts) pin the *string* transforms;
// these tests close the other half of the gap by proving the converter's output
// is actually *valid, parseable KaTeX*. A string can be transformed "correctly"
// yet still be LaTeX that KaTeX rejects, so we render here with throwOnError:true
// (the strict opposite of MathText's fail-soft runtime config) to catch that.
//
// renderToString is headless (no DOM, no React) and mirrors what MathText asks
// KaTeX to produce (output: 'html').

function renderStrict(equation: string): string {
  return katex.renderToString(equationToLatex(equation), {
    throwOnError: true,
    output: 'html',
  })
}

// Recursively collect every authored `equation` string from the lesson catalog,
// regardless of which step type carries it, so new lessons are covered automatically.
function collectEquations(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEquations(item, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'equation' && typeof child === 'string' && child.trim()) {
        out.push(child)
      } else {
        collectEquations(child, out)
      }
    }
  }
}

test('every authored lesson equation converts to valid, parseable KaTeX', () => {
  const equations: string[] = []
  collectEquations(lessons, equations)

  // Guard against the harvest silently finding nothing (which would make the
  // loop below vacuously pass and hide a regression in how equations are stored).
  assert.ok(
    equations.length >= 15,
    `expected to harvest the authored equations, only found ${equations.length}`,
  )

  for (const equation of equations) {
    const latex = equationToLatex(equation)
    assert.doesNotThrow(
      () => katex.renderToString(latex, { throwOnError: true, output: 'html' }),
      `KaTeX could not parse authored equation ${JSON.stringify(equation)} -> ${JSON.stringify(latex)}`,
    )
  }
})

test('each converter branch renders to valid KaTeX', () => {
  // One representative equation per transform branch, all asserted to parse.
  for (const equation of [
    '3x - 5 = 19', // plain
    '(3, -2)', // coordinate / negatives
    'x / 6 = 2', // fraction
    'x - 5 = 9 -> x = 9', // step arrow
    '2*3', // explicit times
    'rise over run', // prose words
  ]) {
    const html = renderStrict(equation)
    assert.ok(html.includes('katex'), `expected KaTeX output for ${JSON.stringify(equation)}`)
  }
})

test('a fraction notation renders as a real KaTeX fraction (mfrac)', () => {
  assert.ok(renderStrict('x / 6 = 2').includes('mfrac'))
  assert.ok(renderStrict('2x/3').includes('mfrac'))
})

test('display mode and inline mode both produce valid output', () => {
  const inline = katex.renderToString(equationToLatex('y = 2x + 1'), {
    throwOnError: true,
    displayMode: false,
    output: 'html',
  })
  const display = katex.renderToString(equationToLatex('y = 2x + 1'), {
    throwOnError: true,
    displayMode: true,
    output: 'html',
  })
  assert.ok(inline.includes('katex'))
  assert.ok(display.includes('katex-display'))
})

test('the fail-soft render path (throwOnError:false) never throws, even on odd input', () => {
  // Mirrors MathText's runtime config: a surprising equation must degrade
  // gracefully (KaTeX renders an error node) instead of throwing and crashing.
  for (const odd of ['}{', '\\frac', 'x ^', '====', '\\unknownCmd{x}']) {
    assert.doesNotThrow(() =>
      katex.renderToString(equationToLatex(odd), { throwOnError: false, output: 'html' }),
    )
  }
})
