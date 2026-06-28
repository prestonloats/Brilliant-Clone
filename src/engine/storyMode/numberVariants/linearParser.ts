// Story Mode linear-equation parser.
//
// A tiny, PURE linear model: it finds a "<run of math terms> = <run>" equation embedded in free
// text, parses each side into ordered term slots plus a net coefficient/constant, and recomputes the
// solution. This is the shared foundation used by BOTH the live themed-coherence text scanners
// (`textScanners.ts`) and the legacy number-variant generators (`variantGenerators.ts`).
//
// Extracted verbatim from the former monolithic `numberVariants.ts`; behavior is unchanged.

// --- linear equation parsing ----------------------------------------------------------------

export type Slot =
  | { kind: 'x'; sign: 1 | -1; mag: number; explicit: boolean }
  | { kind: 'const'; sign: 1 | -1; mag: number }
  | { kind: 'xdiv'; sign: 1 | -1; divisor: number }

type ParsedSide = {
  slots: Slot[]
  xCoef: number
  constant: number
  divisor: number | null
  hasX: boolean
}

const TERM = /[+-]?(?:[a-zA-Z]\/\d+|\d*[a-zA-Z]|\d+)/g

// Parse one side of an equation (e.g. "8x + 5 - 3x") into ordered term slots plus the net
// coefficient on `variable` and net constant. Returns null on anything it doesn't fully cover.
export const parseSide = (raw: string, variable: string): ParsedSide | null => {
  const text = raw.replace(/\s+/g, '')
  if (!text) return null
  const terms = text.match(TERM)
  if (!terms || terms.join('') !== text) return null

  const slots: Slot[] = []
  let xCoef = 0
  let constant = 0
  let divisor: number | null = null
  let hasX = false

  for (const term of terms) {
    let sign: 1 | -1 = 1
    let body = term
    if (body[0] === '+') body = body.slice(1)
    else if (body[0] === '-') {
      sign = -1
      body = body.slice(1)
    }
    if (!body) return null

    let match: RegExpMatchArray | null
    if ((match = body.match(/^([a-zA-Z])\/(\d+)$/))) {
      if (match[1] !== variable) return null
      const div = Number(match[2])
      if (div === 0) return null
      slots.push({ kind: 'xdiv', sign, divisor: div })
      divisor = div
      hasX = true
      xCoef += (sign * 1) / div
    } else if ((match = body.match(/^(\d*)([a-zA-Z])$/))) {
      if (match[2] !== variable) return null
      const explicit = match[1] !== ''
      const mag = explicit ? Number(match[1]) : 1
      slots.push({ kind: 'x', sign, mag, explicit })
      hasX = true
      xCoef += sign * mag
    } else if ((match = body.match(/^(\d+)$/))) {
      const mag = Number(match[1])
      slots.push({ kind: 'const', sign, mag })
      constant += sign * mag
    } else {
      return null
    }
  }

  return { slots, xCoef, constant, divisor, hasX }
}

// A run of math terms joined by + / - (operators REQUIRED between terms, so a word like "shows"
// can never be mistaken for a chain of single-letter terms).
export const RUN_SOURCE = '(?:[a-zA-Z]\\/\\d+|\\d*[a-zA-Z]|\\d+)(?:\\s*[+-]\\s*(?:[a-zA-Z]\\/\\d+|\\d*[a-zA-Z]|\\d+))*'

type FoundEquation = { lhs: string; rhs: string }

// Extract the first "LHS = RHS" linear equation embedded in free text (a prompt or an equation
// field). Only the run of math terms adjacent to the first '=' is captured, so surrounding prose
// is ignored. Anything after a "->" is dropped first (operation-choice equations chain steps).
const findEquationInText = (text: string): FoundEquation | null => {
  const head = text.split('->')[0]
  const eqIndex = head.indexOf('=')
  if (eqIndex < 0) return null

  const before = head.slice(0, eqIndex)
  const after = head.slice(eqIndex + 1)

  const lhsMatch = before.match(new RegExp(`(${RUN_SOURCE})\\s*$`))
  const rhsMatch = after.match(new RegExp(`^\\s*(${RUN_SOURCE})`))
  if (!lhsMatch || !rhsMatch) return null

  return { lhs: lhsMatch[1], rhs: rhsMatch[1] }
}

export const detectVariable = (text: string): string | null => {
  const match = text.match(/[a-zA-Z]/)
  return match ? match[0] : null
}

export type LinearModel = {
  variable: string
  left: ParsedSide
  right: ParsedSide
  leftX: number
  leftK: number
  rightX: number
  rightK: number
  solution: number | null
}

export const solveModel = (leftX: number, leftK: number, rightX: number, rightK: number): number | null => {
  const denom = rightX - leftX
  if (denom === 0) return null
  return (leftK - rightK) / denom
}

export const parseLinear = (text: string): LinearModel | null => {
  const found = findEquationInText(text)
  if (!found) return null
  const variable = detectVariable(`${found.lhs}=${found.rhs}`)
  if (!variable) return null
  const left = parseSide(found.lhs, variable)
  const right = parseSide(found.rhs, variable)
  if (!left || !right) return null
  const solution = solveModel(left.xCoef, left.constant, right.xCoef, right.constant)
  return {
    variable,
    left,
    right,
    leftX: left.xCoef,
    leftK: left.constant,
    rightX: right.xCoef,
    rightK: right.constant,
    solution,
  }
}
