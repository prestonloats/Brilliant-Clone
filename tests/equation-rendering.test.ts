import assert from 'node:assert/strict'
import { test } from 'node:test'
import katex from 'katex'

import { lessons } from '../src/content/lessons'
import { equationToLatex } from '../src/equationLatex'

// equation-latex.test.ts pins the *string* output of the converter. These tests go one
// step further and prove that output is actually VALID, parseable KaTeX for every equation
// authored in the lessons. A pure string assertion can't catch a transform that produces
// syntactically broken LaTeX (e.g. an unbalanced \frac{...}{...} or a stray brace); KaTeX
// with throwOnError:true does. katex.renderToString is headless (no DOM), so this runs
// under the existing node:test harness without a browser, and `katex` is already a
// dependency (no new package needed).

// Recursively collect every authored `equation` string in the lesson catalog. These are
// exactly the values App.tsx feeds to <MathText>, so this stays in sync with real content.
const collectEquations = (value: unknown, found: string[]): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) collectEquations(item, found)
    return found
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'equation' && typeof child === 'string' && child.trim()) {
        found.push(child)
      } else {
        collectEquations(child, found)
      }
    }
  }

  return found
}

const authoredEquations = collectEquations(lessons, [])
const uniqueEquations = [...new Set(authoredEquations)]

const renders = (equation: string, displayMode: boolean) =>
  katex.renderToString(equationToLatex(equation), {
    throwOnError: true,
    displayMode,
    output: 'html',
  })

test('the lessons author a meaningful number of equations to validate', () => {
  // Guards against the harvester silently matching nothing (e.g. a content refactor that
  // renames the `equation` field), which would make the suite below vacuously pass.
  assert.ok(
    uniqueEquations.length >= 15,
    `expected to harvest >= 15 authored equations, found ${uniqueEquations.length}`,
  )
})

test('every authored lesson equation converts to KaTeX that parses without error', () => {
  for (const equation of uniqueEquations) {
    assert.doesNotThrow(
      () => renders(equation, true),
      `equationToLatex output failed to parse as KaTeX for: ${JSON.stringify(equation)}`,
    )
  }
})

test('authored equations render in both inline and display mode', () => {
  for (const equation of uniqueEquations) {
    assert.doesNotThrow(() => renders(equation, false), `inline render failed for: ${JSON.stringify(equation)}`)
  }

  // displayMode is the variant App.tsx uses for the main step equation; confirm it emits
  // the KaTeX display wrapper rather than throwing or producing empty output.
  const sample = renders('x / 6 = 2', true)
  assert.match(sample, /katex-display/)
})

test('converted fractions produce real KaTeX fraction markup', () => {
  // Proves the SIMPLE_FRACTION transform yields KaTeX's fraction structure, not just text
  // that happens to contain a slash.
  const html = renders('x / 6 = 2', false)
  assert.match(html, /mfrac|frac-line/)
})

test('the converter is fail-soft: rendering never throws even on odd input', () => {
  // MathText renders with throwOnError:false in the app, so the converter only needs to
  // degrade gracefully. Confirm a few awkward inputs still produce a string instead of
  // throwing when KaTeX is run in the app's forgiving mode.
  const oddInputs = ['', '   ', '???', '} { unbalanced', '\\frac{1}', 'x ^ ', '/ 6']
  for (const input of oddInputs) {
    assert.doesNotThrow(() => {
      const out = katex.renderToString(equationToLatex(input), { throwOnError: false, output: 'html' })
      assert.equal(typeof out, 'string')
    }, `fail-soft render threw for: ${JSON.stringify(input)}`)
  }
})
