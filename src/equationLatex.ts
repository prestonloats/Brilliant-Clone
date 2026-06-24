// Converts the app's plain-text equation notation into a LaTeX string for KaTeX.
//
// Lesson content stores equations as everyday strings such as "3x - 5 = 19",
// "x / 6 = 2", "x - 5 = 9 -> x = 9", "4x + 3 - x + 2y", "y = 2x + 1", or "(3, -2)".
// KaTeX already typesets numbers, the variables x/y, implicit multiplication (3x),
// +, -, =, parentheses, commas and negatives correctly, so the converter only has to
// translate the few notations that differ from LaTeX:
//   - "->"     -> a right arrow (used for multi-step solution chains)
//   - "a / b"  -> \frac{a}{b}
//   - "*"      -> \cdot (explicit multiplication, if ever authored)
//   - prose words (two or more letters, e.g. "through", "and") are wrapped in \text{}
//     so they stay upright instead of rendering as a run of italic variables.
// The transforms are intentionally conservative: anything not recognized is left as-is,
// and MathText renders KaTeX with throwOnError:false (plus a plain-text fallback), so a
// surprising input degrades gracefully instead of crashing.

// Multi-letter words become upright text. Run this first, before any LaTeX command
// (\frac, \rightarrow, \text) is introduced, so command names are never re-wrapped.
const PROSE_WORD = /[A-Za-z]{2,}/g

const ARROW = /\s*->\s*/g

// A simple "operand / operand" division, where each operand is a run of letters/digits
// (covers x/6, x/3, 2x/3, ...). The leading delimiter is captured so the slash is only
// treated as a fraction when it sits between two atomic operands.
const SIMPLE_FRACTION = /(^|[\s(=+\-*/])([A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+)/g

const EXPLICIT_TIMES = /\*/g

export function equationToLatex(input: string): string {
  const source = input.trim()
  if (!source) return ''
  return source
    .replace(PROSE_WORD, (word) => `\\text{${word}}`)
    .replace(ARROW, ' \\rightarrow ')
    .replace(SIMPLE_FRACTION, (_match, lead: string, numerator: string, denominator: string) => `${lead}\\frac{${numerator}}{${denominator}}`)
    .replace(EXPLICIT_TIMES, ' \\cdot ')
}

// A readable plain-text label for screen readers. Keeps the original equation but spells
// out the "->" step arrow, which a screen reader would otherwise read as "minus greater
// than". Everything else (=, +, -, /) is announced sensibly as-is.
export function equationToAriaLabel(input: string): string {
  return input.trim().replace(ARROW, ', then ')
}
