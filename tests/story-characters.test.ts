import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend'
import type { StorySession, StoryTheme } from '../src/domain'
import {
  CHARACTER_BACKSTORIES,
  CHARACTER_PERSONALITIES,
  getBackstoryLabel,
  getPersonalityLabel,
  isKnownBackstoryId,
  isKnownPersonalityId,
  MAX_BACKSTORY_LEN,
  MAX_CHARACTER_NAME_LEN,
  MAX_CUSTOM_CHARACTERS,
} from '../src/story/characterPresets'

// `assert.ok` is not a TS narrowing guard, so wrap it to both fail the test and narrow the type.
function assertSession(value: StorySession | null): asserts value is StorySession {
  assert.ok(value, 'expected a normalized story session')
}

// Run a raw theme through the real session normalizer and hand back the repaired theme.
const normalizeTheme = (theme: unknown): StoryTheme => {
  const session = normalizeStorySession({ userId: 'u', theme })
  assertSession(session)
  return session.theme
}

// --- Presets (the shared catalog the UI + prompt agents consume) -----------------------------

test('character presets expose unique ids, label lookups, and known-id guards', () => {
  assert.ok(CHARACTER_PERSONALITIES.length > 0)
  assert.ok(CHARACTER_BACKSTORIES.length > 0)
  assert.equal(new Set(CHARACTER_PERSONALITIES.map((p) => p.id)).size, CHARACTER_PERSONALITIES.length)
  assert.equal(new Set(CHARACTER_BACKSTORIES.map((b) => b.id)).size, CHARACTER_BACKSTORIES.length)

  const personality = CHARACTER_PERSONALITIES[0]
  assert.equal(getPersonalityLabel(personality.id), personality.label)
  assert.equal(isKnownPersonalityId(personality.id), true)
  assert.equal(isKnownPersonalityId('not-a-personality'), false)
  assert.equal(getPersonalityLabel('not-a-personality'), 'not-a-personality') // unknown -> id fallback

  const backstory = CHARACTER_BACKSTORIES[0]
  assert.equal(getBackstoryLabel(backstory.id), backstory.label)
  assert.equal(isKnownBackstoryId(backstory.id), true)
  assert.equal(isKnownBackstoryId('not-a-backstory'), false)
  assert.equal(getBackstoryLabel('not-a-backstory'), 'not-a-backstory')
})

test('character caps are positive shared bounds', () => {
  assert.ok(MAX_CUSTOM_CHARACTERS > 0)
  assert.ok(MAX_CHARACTER_NAME_LEN > 0)
  assert.ok(MAX_BACKSTORY_LEN > 0)
})

// --- Theme normalization: back-compat + defensive repair -------------------------------------

test('theme normalization omits custom-character fields when absent (round-trip identity)', () => {
  const theme = normalizeTheme({ interestIds: ['space'], premise: 'p', protagonist: 'hero' })

  assert.deepEqual(theme, { interestIds: ['space'], premise: 'p', protagonist: 'hero' })
  assert.equal('characters' in theme, false)
  assert.equal('mainCharacterSource' in theme, false)
  assert.equal('mainCharacterName' in theme, false)
})

test('theme normalization sanitizes, type-coerces, and filters custom characters', () => {
  const personalityId = CHARACTER_PERSONALITIES[0].id
  const backstoryId = CHARACTER_BACKSTORIES[0].id
  const overLongName = 'x'.repeat(MAX_CHARACTER_NAME_LEN + 25)

  const theme = normalizeTheme({
    interestIds: [],
    premise: '',
    protagonist: '',
    characters: [
      { id: 'c1', name: 'Ada', personalityId, backstoryId }, // valid, known preset ids kept
      { id: 'c2', name: 'Bo\u0000\tb', personalityId: 'nope', backstoryId: 'nope' }, // unknown ids dropped, control chars stripped
      { id: 7, name: overLongName }, // numeric id coerced, name capped
      'garbage', // non-record dropped
      { id: 'c4', name: '   ' }, // empty-after-sanitize name dropped
      null, // dropped
    ],
  })

  assert.ok(theme.characters)
  const characters = theme.characters
  assert.equal(characters.length, 3)

  assert.deepEqual(characters[0], { id: 'c1', name: 'Ada', personalityId, backstoryId })

  assert.equal(characters[1].id, 'c2')
  assert.equal(characters[1].name, 'Bo b') // control chars collapsed to a single space
  assert.equal('personalityId' in characters[1], false)
  assert.equal('backstoryId' in characters[1], false)

  assert.equal(characters[2].id, '7') // number coerced to string
  assert.equal(characters[2].name.length, MAX_CHARACTER_NAME_LEN) // capped
})

test('theme normalization caps the supporting cast to MAX_CUSTOM_CHARACTERS', () => {
  const characters = Array.from({ length: MAX_CUSTOM_CHARACTERS + 4 }, (_value, index) => ({
    id: `c${index}`,
    name: `Name ${index}`,
  }))

  const theme = normalizeTheme({ interestIds: [], premise: '', protagonist: '', characters })

  assert.equal(theme.characters?.length, MAX_CUSTOM_CHARACTERS)
})

test('theme normalization coerces mainCharacterSource and repairs invalid values to random', () => {
  assert.equal(normalizeTheme({ mainCharacterSource: 'displayName' }).mainCharacterSource, 'displayName')
  assert.equal(normalizeTheme({ mainCharacterSource: 'custom' }).mainCharacterSource, 'custom')
  assert.equal(normalizeTheme({ mainCharacterSource: 'random' }).mainCharacterSource, 'random')
  assert.equal(normalizeTheme({ mainCharacterSource: 'banana' }).mainCharacterSource, 'random') // present-invalid -> default
  assert.equal('mainCharacterSource' in normalizeTheme({}), false) // absent -> omitted
})

test('theme normalization sanitizes and caps mainCharacterName', () => {
  const overLong = 'n'.repeat(MAX_CHARACTER_NAME_LEN + 10)

  assert.equal(normalizeTheme({ mainCharacterName: overLong }).mainCharacterName?.length, MAX_CHARACTER_NAME_LEN)
  assert.equal(normalizeTheme({ mainCharacterName: '  Riley  ' }).mainCharacterName, 'Riley')
  assert.equal('mainCharacterName' in normalizeTheme({ mainCharacterName: 42 }), false) // non-string dropped
  assert.equal('mainCharacterName' in normalizeTheme({}), false) // absent omitted
})

test('theme normalization never throws on hostile custom-character input', () => {
  assert.doesNotThrow(() =>
    normalizeStorySession({
      userId: 'u',
      theme: {
        interestIds: 'nope',
        characters: { not: 'an array' },
        mainCharacterSource: 123,
        mainCharacterName: { nested: true },
      },
    }),
  )
})
