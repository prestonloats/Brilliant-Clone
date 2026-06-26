// Story Mode question-architecture proofs (WAVE 2).
//
// Each architecture is a PURE, seeded generator that emits a fully-formed, CODE-GRADED lesson
// step plus its canonical answer key. These tests prove, for every architecture across many
// seeds, that:
//   - the emitted step.type equals the architecture's declared stepType (and the step id is stable);
//   - the REAL grader (checkInputStep / checkSequenceStep) ACCEPTS the key and REJECTS a near
//     miss (so a wrong answer can never count);
//   - the key is INDEPENDENTLY re-derivable from the DISPLAYED prompt/equation text (parsed by
//     oracles written here that share no logic with the architectures), catching any drift
//     between the shown numbers and the stored key;
//   - generation is DETERMINISTIC per seed (resume safety) and VARIES across seeds;
//   - every randomized number lands inside the architecture's declared slot ranges; and
//   - each requiredLessonId/skillId is a real lesson/skill in the course catalog.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { algebraCourse, lessons, skills } from '../src/domain'
import type { LessonStep } from '../src/domain'
import { checkInputStep, checkSequenceStep, mulberry32 } from '../src/engine'
import type { QuestionArchitecture } from '../src/engine/storyMode/questionBank/architectureTypes'
import { oneStepLinearArchitecture } from '../src/engine/storyMode/questionBank/architectures/oneStepLinear'
import { oneStepSequenceArchitecture } from '../src/engine/storyMode/questionBank/architectures/oneStepSequence'
import { twoStepLinearArchitecture } from '../src/engine/storyMode/questionBank/architectures/twoStepLinear'
import { variablesBothSidesArchitecture } from '../src/engine/storyMode/questionBank/architectures/variablesBothSides'
import { coordinateWalkArchitecture } from '../src/engine/storyMode/questionBank/architectures/coordinateWalk'
import { lineValueArchitecture } from '../src/engine/storyMode/questionBank/architectures/lineValue'

// Loop seeds 0..80 (the acceptance window) for every per-architecture proof.
const SEEDS = 81

const allArchitectures: QuestionArchitecture[] = [
  oneStepLinearArchitecture,
  oneStepSequenceArchitecture,
  twoStepLinearArchitecture,
  variablesBothSidesArchitecture,
  coordinateWalkArchitecture,
  lineValueArchitecture,
]

// --- shared narrowing/bounds helpers --------------------------------------------------------

const asInput = (step: LessonStep): Extract<LessonStep, { type: 'input' }> => {
  assert.equal(step.type, 'input')
  return step as Extract<LessonStep, { type: 'input' }>
}

const asSequence = (step: LessonStep): Extract<LessonStep, { type: 'sequence' }> => {
  assert.equal(step.type, 'sequence')
  return step as Extract<LessonStep, { type: 'sequence' }>
}

const asString = (answer: string | string[]): string => {
  assert.equal(typeof answer, 'string')
  return answer as string
}

const asArray = (answer: string | string[]): string[] => {
  assert.ok(Array.isArray(answer), 'expected a sequence answer (string[])')
  return answer
}

const inSlot = (arch: QuestionArchitecture, name: string, value: number) => {
  const found = arch.slots.find((s) => s.name === name)
  assert.ok(found, `architecture ${arch.id} is missing a declared slot named "${name}"`)
  assert.ok(
    value >= found.min && value <= found.max,
    `${arch.id}.${name} = ${value} fell outside the declared [${found.min}, ${found.max}]`,
  )
}

// --- independent equation/prompt oracles (NO architecture internals reused) ------------------

const parseOneStepLinear = (equation: string): { a: number; s: number; solution: number } => {
  let m: RegExpMatchArray | null
  if ((m = equation.match(/^x\s*\+\s*(\d+)\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const b = Number(m[2])
    return { a, s: b - a, solution: b - a }
  }
  if ((m = equation.match(/^x\s*-\s*(\d+)\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const b = Number(m[2])
    return { a, s: b + a, solution: b + a }
  }
  if ((m = equation.match(/^(\d+)\s*x\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const b = Number(m[2])
    return { a, s: b / a, solution: b / a }
  }
  if ((m = equation.match(/^x\s*\/\s*(\d+)\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const q = Number(m[2])
    return { a, s: q, solution: a * q }
  }
  throw new Error(`unparseable one-step-linear equation: ${equation}`)
}

const parseOneStepSeq = (equation: string): { op: 'add' | 'sub'; a: number; b: number; s: number } => {
  let m: RegExpMatchArray | null
  if ((m = equation.match(/^x\s*\+\s*(\d+)\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const b = Number(m[2])
    return { op: 'add', a, b, s: b - a }
  }
  if ((m = equation.match(/^x\s*-\s*(\d+)\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const b = Number(m[2])
    return { op: 'sub', a, b, s: b + a }
  }
  throw new Error(`unparseable one-step-sequence equation: ${equation}`)
}

const parseTwoStep = (equation: string): { a: number; k: number; s: number } => {
  let m: RegExpMatchArray | null
  if ((m = equation.match(/^(\d+)\s*x\s*\+\s*(\d+)\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const k = Number(m[2])
    const c = Number(m[3])
    return { a, k, s: (c - k) / a }
  }
  if ((m = equation.match(/^(\d+)\s*x\s*-\s*(\d+)\s*=\s*(-?\d+)$/))) {
    const a = Number(m[1])
    const k = Number(m[2])
    const c = Number(m[3])
    return { a, k, s: (c + k) / a }
  }
  throw new Error(`unparseable two-step-linear equation: ${equation}`)
}

const parseBothSides = (equation: string): { lx: number; lk: number; rx: number; rk: number; s: number } => {
  const m = equation.match(/^(\d+)\s*x\s*\+\s*(\d+)\s*=\s*(\d+)\s*x\s*\+\s*(\d+)$/)
  assert.ok(m, `unparseable variables-both-sides equation: ${equation}`)
  const lx = Number(m[1])
  const lk = Number(m[2])
  const rx = Number(m[3])
  const rk = Number(m[4])
  return { lx, lk, rx, rk, s: (rk - lk) / (lx - rx) }
}

const walkFromPrompt = (prompt: string): { x: number; y: number; magnitudes: number[] } => {
  let x = 0
  let y = 0
  const magnitudes: number[] = []
  for (const match of prompt.matchAll(/(\d+)\s*(left|right|up|down)/gi)) {
    const magnitude = Number(match[1])
    const direction = match[2].toLowerCase()
    magnitudes.push(magnitude)
    if (direction === 'right') x += magnitude
    else if (direction === 'left') x -= magnitude
    else if (direction === 'up') y += magnitude
    else y -= magnitude
  }
  return { x, y, magnitudes }
}

const parseLine = (equation: string): { m: number; b: number } => {
  const rhs = equation.replace(/^y\s*=\s*/, '')
  const sm = rhs.match(/(-?\d*)\s*x/)
  assert.ok(sm, `no slope term in line equation: ${equation}`)
  const slopeText = sm[1]
  const m = slopeText === '' || slopeText === undefined ? 1 : slopeText === '-' ? -1 : Number(slopeText)
  const bm = rhs.match(/([+-])\s*(\d+)\s*$/)
  const b = bm ? (bm[1] === '-' ? -Number(bm[2]) : Number(bm[2])) : 0
  return { m, b }
}

// --- 1. one-step-linear ---------------------------------------------------------------------

test('architecture one-step-linear: graded key, re-derivable, deterministic, varied, in-bounds', () => {
  const arch = oneStepLinearArchitecture
  assert.equal(arch.stepType, 'input')
  const seen = new Set<string>()

  for (let seed = 0; seed < SEEDS; seed += 1) {
    const gen = arch.generate(mulberry32(seed))
    assert.deepEqual(arch.generate(mulberry32(seed)), gen, `seed ${seed} must rebuild identically`)

    assert.equal(gen.step.type, 'input')
    const step = asInput(gen.step)
    const answer = asString(gen.answer)

    assert.ok(step.equation, 'one-step-linear must display an equation')
    const parsed = parseOneStepLinear(step.equation)

    // independent re-derivation matches the stored key
    assert.equal(Number(answer), parsed.solution, `displayed ${step.equation} disagrees with key ${answer}`)
    assert.equal(answer, String(parsed.solution))

    // real grader: correct accepted, near miss + junk rejected
    assert.equal(checkInputStep(step, answer).correct, true)
    assert.equal(checkInputStep(step, String(parsed.solution + 1)).correct, false)
    assert.equal(checkInputStep(step, String(parsed.solution - 1)).correct, false)
    assert.equal(checkInputStep(step, 'banana').correct, false)

    // bounds
    inSlot(arch, 'a', parsed.a)
    inSlot(arch, 's', parsed.s)
    assert.notEqual(parsed.s, 0, 'solution/quotient slot must be nonzero')

    seen.add(JSON.stringify(gen))
  }

  assert.ok(seen.size > 1, 'expected more than one distinct one-step-linear instance across seeds')
})

// --- 2. one-step-sequence -------------------------------------------------------------------

test('architecture one-step-sequence: graded order, re-derivable, deterministic, varied, in-bounds', () => {
  const arch = oneStepSequenceArchitecture
  assert.equal(arch.stepType, 'sequence')
  const seen = new Set<string>()

  for (let seed = 0; seed < SEEDS; seed += 1) {
    const gen = arch.generate(mulberry32(seed))
    assert.deepEqual(arch.generate(mulberry32(seed)), gen, `seed ${seed} must rebuild identically`)

    assert.equal(gen.step.type, 'sequence')
    const step = asSequence(gen.step)
    const answer = asArray(gen.answer)

    assert.ok(step.equation, 'one-step-sequence must display an equation')
    const parsed = parseOneStepSeq(step.equation)

    // every tile label must be distinct (the x = solution tile cannot collide with x = rhs)
    const labels = step.tiles.map((t) => t.label)
    assert.equal(new Set(labels).size, labels.length, `duplicate tile label in [${labels.join(' | ')}]`)

    // re-derive the expected ordered tile ids straight from the displayed equation, by LABEL
    const undoLabel = parsed.op === 'add' ? `Subtract ${parsed.a} from both sides` : `Add ${parsed.a} to both sides`
    const undoTile = step.tiles.find((t) => t.label === undoLabel)
    const solutionTile = step.tiles.find((t) => t.label === `x = ${parsed.s}`)
    const rhsTile = step.tiles.find((t) => t.label === `x = ${parsed.b}`)
    assert.ok(undoTile, `expected an undo tile labeled "${undoLabel}"`)
    assert.ok(solutionTile, `expected a solution tile labeled "x = ${parsed.s}"`)
    assert.ok(rhsTile, `expected a distractor tile labeled "x = ${parsed.b}"`)

    const expectedOrder = [undoTile.id, solutionTile.id]
    assert.deepEqual(answer, expectedOrder, 'answer must be the re-derived ordered tile ids')
    assert.deepEqual(step.correctOrder, expectedOrder, 'correctOrder must match the re-derived order')

    // real grader: correct order accepted, reversed + wrong-final rejected
    assert.equal(checkSequenceStep(step, answer).correct, true)
    assert.equal(checkSequenceStep(step, [...answer].reverse()).correct, false)
    assert.equal(checkSequenceStep(step, [undoTile.id, rhsTile.id]).correct, false)

    // bounds
    inSlot(arch, 'a', parsed.a)
    inSlot(arch, 's', parsed.s)
    assert.notEqual(parsed.s, 0, 'solution slot must be nonzero')

    seen.add(JSON.stringify(gen))
  }

  assert.ok(seen.size > 1, 'expected more than one distinct one-step-sequence instance across seeds')
})

// --- 3. two-step-linear ---------------------------------------------------------------------

test('architecture two-step-linear: graded key, re-derivable, deterministic, varied, in-bounds', () => {
  const arch = twoStepLinearArchitecture
  assert.equal(arch.stepType, 'input')
  const seen = new Set<string>()

  for (let seed = 0; seed < SEEDS; seed += 1) {
    const gen = arch.generate(mulberry32(seed))
    assert.deepEqual(arch.generate(mulberry32(seed)), gen, `seed ${seed} must rebuild identically`)

    assert.equal(gen.step.type, 'input')
    const step = asInput(gen.step)
    const answer = asString(gen.answer)

    assert.ok(step.equation, 'two-step-linear must display an equation')
    const parsed = parseTwoStep(step.equation)
    assert.ok(Number.isInteger(parsed.s), `two-step solution must be an integer: ${step.equation}`)

    assert.equal(Number(answer), parsed.s, `displayed ${step.equation} disagrees with key ${answer}`)
    assert.equal(answer, String(parsed.s))

    assert.equal(checkInputStep(step, answer).correct, true)
    assert.equal(checkInputStep(step, String(parsed.s + 1)).correct, false)
    assert.equal(checkInputStep(step, String(parsed.s - 1)).correct, false)
    assert.equal(checkInputStep(step, 'banana').correct, false)

    inSlot(arch, 'a', parsed.a)
    inSlot(arch, 'k', parsed.k)
    inSlot(arch, 's', parsed.s)

    seen.add(JSON.stringify(gen))
  }

  assert.ok(seen.size > 1, 'expected more than one distinct two-step-linear instance across seeds')
})

// --- 4. variables-both-sides ----------------------------------------------------------------

test('architecture variables-both-sides: graded key, re-derivable, deterministic, varied, in-bounds', () => {
  const arch = variablesBothSidesArchitecture
  assert.equal(arch.stepType, 'input')
  const seen = new Set<string>()

  for (let seed = 0; seed < SEEDS; seed += 1) {
    const gen = arch.generate(mulberry32(seed))
    assert.deepEqual(arch.generate(mulberry32(seed)), gen, `seed ${seed} must rebuild identically`)

    assert.equal(gen.step.type, 'input')
    const step = asInput(gen.step)
    const answer = asString(gen.answer)

    assert.ok(step.equation, 'variables-both-sides must display an equation')
    const parsed = parseBothSides(step.equation)
    assert.ok(parsed.lx > parsed.rx, 'left coefficient must exceed the right coefficient')
    assert.ok(Number.isInteger(parsed.s), `solution must be an integer: ${step.equation}`)

    assert.equal(Number(answer), parsed.s, `displayed ${step.equation} disagrees with key ${answer}`)
    assert.equal(answer, String(parsed.s))

    assert.equal(checkInputStep(step, answer).correct, true)
    assert.equal(checkInputStep(step, String(parsed.s + 1)).correct, false)
    assert.equal(checkInputStep(step, String(parsed.s - 1)).correct, false)
    assert.equal(checkInputStep(step, 'banana').correct, false)

    inSlot(arch, 'lx', parsed.lx)
    inSlot(arch, 'rx', parsed.rx)
    assert.ok(parsed.rx <= parsed.lx - 2, 'rx must be at most lx - 2')
    inSlot(arch, 'lk', parsed.lk)
    inSlot(arch, 's', parsed.s)

    seen.add(JSON.stringify(gen))
  }

  assert.ok(seen.size > 1, 'expected more than one distinct variables-both-sides instance across seeds')
})

// --- 5. coordinate-walk ---------------------------------------------------------------------

test('architecture coordinate-walk: graded key, re-derivable, deterministic, varied, in-bounds', () => {
  const arch = coordinateWalkArchitecture
  assert.equal(arch.stepType, 'input')
  const seen = new Set<string>()

  for (let seed = 0; seed < SEEDS; seed += 1) {
    const gen = arch.generate(mulberry32(seed))
    assert.deepEqual(arch.generate(mulberry32(seed)), gen, `seed ${seed} must rebuild identically`)

    assert.equal(gen.step.type, 'input')
    const step = asInput(gen.step)
    const answer = asString(gen.answer)

    // independent re-derivation of the destination from the displayed walk
    const { x, y, magnitudes } = walkFromPrompt(step.prompt)
    assert.equal(answer, `(${x}, ${y})`, `displayed walk disagrees with key ${answer}`)

    // real grader: correct accepted; near miss + swapped pair + junk rejected
    assert.equal(checkInputStep(step, `(${x}, ${y})`).correct, true)
    assert.equal(checkInputStep(step, `(${x + 1}, ${y})`).correct, false)
    if (x !== y) {
      assert.equal(checkInputStep(step, `(${y}, ${x})`).correct, false, 'swapped pair must be rejected')
    }
    assert.equal(checkInputStep(step, 'banana').correct, false)

    // bounds
    inSlot(arch, 'moves', magnitudes.length)
    for (const magnitude of magnitudes) inSlot(arch, 'magnitude', magnitude)

    seen.add(JSON.stringify(gen))
  }

  assert.ok(seen.size > 1, 'expected more than one distinct coordinate-walk instance across seeds')
})

// --- 6. line-value --------------------------------------------------------------------------

test('architecture line-value: graded key, re-derivable, deterministic, varied, in-bounds', () => {
  const arch = lineValueArchitecture
  assert.equal(arch.stepType, 'input')
  const seen = new Set<string>()

  for (let seed = 0; seed < SEEDS; seed += 1) {
    const gen = arch.generate(mulberry32(seed))
    assert.deepEqual(arch.generate(mulberry32(seed)), gen, `seed ${seed} must rebuild identically`)

    assert.equal(gen.step.type, 'input')
    const step = asInput(gen.step)
    const answer = asString(gen.answer)

    assert.ok(step.equation, 'line-value must display the line equation')
    const { m, b } = parseLine(step.equation)
    const x0Match = step.prompt.match(/when x\s*=\s*(-?\d+)/)
    assert.ok(x0Match, `prompt must state the x value: ${step.prompt}`)
    const x0 = Number(x0Match[1])
    const y = m * x0 + b

    assert.equal(Number(answer), y, `displayed line/x disagrees with key ${answer}`)
    assert.equal(answer, String(y))

    assert.equal(checkInputStep(step, answer).correct, true)
    assert.equal(checkInputStep(step, String(y + 1)).correct, false)
    assert.equal(checkInputStep(step, String(y - 1)).correct, false)
    assert.equal(checkInputStep(step, 'banana').correct, false)

    inSlot(arch, 'm', m)
    assert.notEqual(m, 0, 'slope slot must be nonzero')
    inSlot(arch, 'b', b)
    inSlot(arch, 'x0', x0)

    seen.add(JSON.stringify(gen))
  }

  assert.ok(seen.size > 1, 'expected more than one distinct line-value instance across seeds')
})

// --- cross-architecture invariants ----------------------------------------------------------

test('every architecture references a real lesson and skill', () => {
  for (const arch of allArchitectures) {
    assert.ok(arch.requiredLessonId in lessons, `${arch.id}: requiredLessonId "${arch.requiredLessonId}" is not a lesson`)
    assert.ok(
      algebraCourse.lessonOrder.includes(arch.requiredLessonId),
      `${arch.id}: requiredLessonId "${arch.requiredLessonId}" is not in the course order`,
    )
    assert.ok(
      skills.some((skill) => skill.id === arch.skillId),
      `${arch.id}: skillId "${arch.skillId}" is not a real skill`,
    )
  }
})

test('every architecture emits its declared stepType with a stable step id', () => {
  for (const arch of allArchitectures) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const gen = arch.generate(mulberry32(seed))
      assert.equal(gen.step.type, arch.stepType, `${arch.id}: stepType mismatch at seed ${seed}`)
      assert.equal(gen.step.id, arch.id, `${arch.id}: step id should equal the architecture id`)
    }
  }
})

test('every architecture is deterministic per seed (resume safety)', () => {
  for (const arch of allArchitectures) {
    for (const seed of [0, 1, 7, 42, 4242, 0xbeef, 0xabcdef]) {
      const first = arch.generate(mulberry32(seed))
      const again = arch.generate(mulberry32(seed))
      assert.deepEqual(again, first, `${arch.id} @ seed ${seed} must rebuild identically`)
    }
  }
})
