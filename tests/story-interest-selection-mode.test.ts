import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StoryInterestId, StoryTheme } from '../src/domain'
import { interestSelectionMode, type InterestSelectionMode } from '../src/story/interestSelectionMode'

type ThemeInput = Pick<StoryTheme, 'interestIds' | 'freeformInterest'>

// Build a minimal theme slice. A missing freeformInterest argument leaves the key OFF entirely
// (the "no custom" case), so the table can also exercise the `freeformInterest === undefined` path.
const theme = (interestIds: StoryInterestId[], freeformInterest?: string): ThemeInput =>
  freeformInterest === undefined ? { interestIds } : { interestIds, freeformInterest }

// Table-driven matrix: every one of the 6 modes, across n = 0..3+ suggested interests, with the
// custom free text absent / present / whitespace-only / padded-but-non-empty.
const cases: Array<{ name: string; input: ThemeInput; expected: InterestSelectionMode }> = [
  // --- No custom free text: n drives single / pair / triple / none ---------------------------
  { name: 'n=0, no custom -> none', input: theme([]), expected: 'none' },
  { name: 'n=1, no custom -> single', input: theme(['space']), expected: 'single' },
  { name: 'n=2, no custom -> pair', input: theme(['space', 'fantasy']), expected: 'pair' },
  { name: 'n=3, no custom -> triple', input: theme(['space', 'fantasy', 'mystery']), expected: 'triple' },
  {
    name: 'n=4 (3+), no custom -> triple (clamped)',
    input: theme(['space', 'fantasy', 'mystery', 'sports']),
    expected: 'triple',
  },
  {
    name: 'n=5 (3+), no custom -> triple (clamped)',
    input: theme(['space', 'fantasy', 'mystery', 'sports', 'animals']),
    expected: 'triple',
  },

  // --- Custom free text present (non-empty): n>=1 blends, n===0 is custom-only ----------------
  { name: 'n=0 + custom -> customOnly', input: theme([], 'dragons'), expected: 'customOnly' },
  { name: 'n=1 + custom -> suggestedPlusCustom', input: theme(['space'], 'dragons'), expected: 'suggestedPlusCustom' },
  {
    name: 'n=2 + custom -> suggestedPlusCustom',
    input: theme(['space', 'cooking'], 'dragons'),
    expected: 'suggestedPlusCustom',
  },
  {
    name: 'n=3 + custom -> suggestedPlusCustom',
    input: theme(['space', 'cooking', 'fashion'], 'dragons'),
    expected: 'suggestedPlusCustom',
  },

  // --- Whitespace-only / empty custom counts as ABSENT (trim has no content) ------------------
  { name: 'n=0 + whitespace custom -> none', input: theme([], '   '), expected: 'none' },
  { name: 'n=1 + whitespace custom -> single', input: theme(['space'], '   \t\n '), expected: 'single' },
  { name: 'n=2 + whitespace custom -> pair', input: theme(['space', 'animals'], '  '), expected: 'pair' },
  { name: 'n=1 + empty-string custom -> single', input: theme(['pirates'], ''), expected: 'single' },

  // --- Padded-but-non-empty custom counts as PRESENT (trim still has content) -----------------
  { name: 'n=0 + padded custom -> customOnly', input: theme([], '  dragons  '), expected: 'customOnly' },
  {
    name: 'n=1 + padded custom -> suggestedPlusCustom',
    input: theme(['space'], '  dragons  '),
    expected: 'suggestedPlusCustom',
  },
]

for (const { name, input, expected } of cases) {
  test(`interestSelectionMode: ${name}`, () => {
    assert.equal(interestSelectionMode(input), expected)
  })
}

// The table must exercise EVERY one of the six modes, so a future rule change that drops a mode
// from the matrix fails loudly here rather than silently going untested.
test('interestSelectionMode: the table covers all six modes', () => {
  const produced = new Set(cases.map((c) => interestSelectionMode(c.input)))
  const allModes: InterestSelectionMode[] = [
    'single',
    'pair',
    'triple',
    'none',
    'suggestedPlusCustom',
    'customOnly',
  ]
  for (const mode of allModes) assert.ok(produced.has(mode), `no table case produces "${mode}"`)
  assert.equal(produced.size, allModes.length)
})

// An omitted freeformInterest (undefined) must behave exactly like "no custom".
test('interestSelectionMode: a missing freeformInterest behaves like no custom', () => {
  assert.equal(interestSelectionMode({ interestIds: [] }), 'none')
  assert.equal(interestSelectionMode({ interestIds: ['space'] }), 'single')
  assert.equal(interestSelectionMode({ interestIds: ['space', 'fantasy'] }), 'pair')
  assert.equal(interestSelectionMode({ interestIds: ['space', 'fantasy', 'mystery'] }), 'triple')
})
