// Characterization tests for the SHARED StoryAI factory (work item B1, src/story/buildStoryAI.ts).
//
// These lock the provider-AGNOSTIC logic the four adapters used to copy-paste — the start
// parse/validate/fallback, the re-theme safety block, the prose/summary/bible/scene post-processing,
// and the parameterized user-choice moderation — by driving `buildStoryAI` with a FAKE transport.
// They assert the SHARED behavior, never a provider wire (no network/SDK), so refactoring the
// adapters onto this factory cannot silently change what the seam does.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StoryTheme } from '../src/domain'
import { buildStoryAI, type StoryTransport, type StoryTransportPurpose } from '../src/story/buildStoryAI'
import type { RethemeRequest } from '../src/story/storyAi'
import { RETHEME_FALLBACK } from '../src/story/storyPrompts'

const theme: StoryTheme = {
  interestIds: ['space'],
  premise: 'A young pilot maps a quiet nebula.',
  protagonist: 'Mira',
}

const rethemeReq: RethemeRequest = {
  theme,
  recentNarrative: '',
  stepType: 'mcq',
  prompt: 'Pick the larger value.',
  options: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
}

type RecordedCall = { prompt: string; purpose: StoryTransportPurpose }

// A network-free transport whose `generate` returns a canned response per purpose (default null),
// recording every (prompt, purpose) so a test can assert the SHARED logic — not any provider wire.
const fakeTransport = (
  responses: Partial<Record<StoryTransportPurpose, string | null>>,
  extra: { moderateRawChoice?: StoryTransport['moderateRawChoice'] } = {},
): { transport: StoryTransport; calls: RecordedCall[] } => {
  const calls: RecordedCall[] = []
  const transport: StoryTransport = {
    async generate(prompt, purpose) {
      calls.push({ prompt, purpose })
      return responses[purpose] ?? null
    },
    ...extra,
  }
  return { transport, calls }
}

// --- startStory: parse + validate + fallback ---------------------------------

test('startStory parses + validates a well-formed JSON start payload (shared parse path)', async () => {
  const payload = JSON.stringify({
    premise: 'A calm nebula awaits.',
    protagonist: 'Mira',
    opening: 'You drift toward the glowing dust and spot a problem. Do you scan it or steer around it?',
  })
  const { transport, calls } = fakeTransport({ start: payload })
  const result = await buildStoryAI(transport).startStory(theme)
  assert.deepEqual(result, {
    premise: 'A calm nebula awaits.',
    protagonist: 'Mira',
    opening: 'You drift toward the glowing dust and spot a problem. Do you scan it or steer around it?',
  })
  // The shared logic asked the transport for a 'start' generation, passing the start prompt.
  assert.equal(calls.length, 1)
  assert.equal(calls[0].purpose, 'start')
  assert.match(calls[0].prompt, /premise/i)
})

test('startStory THROWS when the transport returns null (start generation failed)', async () => {
  const { transport } = fakeTransport({ start: null })
  await assert.rejects(() => buildStoryAI(transport).startStory(theme), /start generation failed/)
})

test('startStory THROWS on malformed JSON (start response invalid or blocked)', async () => {
  const { transport } = fakeTransport({ start: 'not json at all' })
  await assert.rejects(() => buildStoryAI(transport).startStory(theme), /invalid or blocked/)
})

test('startStory THROWS when the parsed start payload is unsafe (output moderation block)', async () => {
  const payload = JSON.stringify({ premise: 'ok', protagonist: 'ok', opening: 'He grabbed a gun and ran.' })
  const { transport } = fakeTransport({ start: payload })
  await assert.rejects(() => buildStoryAI(transport).startStory(theme), /invalid or blocked/)
})

// --- rethemeQuestion: happy-path passthrough + safety block ------------------

test('rethemeQuestion returns the parsed themed result on the happy path (passthrough)', async () => {
  const payload = JSON.stringify({
    themedPrompt: 'Which star burns brighter?',
    themedOptions: [
      { id: 'a', label: 'The red giant' },
      { id: 'b', label: 'The white dwarf' },
    ],
  })
  const { transport, calls } = fakeTransport({ retheme: payload })
  const result = await buildStoryAI(transport).rethemeQuestion(rethemeReq)
  assert.equal(result.themedPrompt, 'Which star burns brighter?')
  assert.deepEqual(result.themedOptions, [
    { id: 'a', label: 'The red giant' },
    { id: 'b', label: 'The white dwarf' },
  ])
  assert.equal(calls[0].purpose, 'retheme')
})

test('rethemeQuestion returns RETHEME_FALLBACK when an OPTION label is unsafe (safety block)', async () => {
  const payload = JSON.stringify({
    themedPrompt: 'Which path is safe?',
    themedOptions: [
      { id: 'a', label: 'Grab the gun' },
      { id: 'b', label: 'Take the rope' },
    ],
  })
  const { transport } = fakeTransport({ retheme: payload })
  const result = await buildStoryAI(transport).rethemeQuestion(rethemeReq)
  assert.deepEqual(result, RETHEME_FALLBACK)
  assert.equal(result.themedPrompt, '')
})

test('rethemeQuestion returns RETHEME_FALLBACK when a TILE label is unsafe', async () => {
  const payload = JSON.stringify({
    themedPrompt: 'Order the steps.',
    themedTiles: [
      { id: 'a', label: 'Build a bomb' },
      { id: 'b', label: 'x = 5' },
    ],
  })
  const { transport } = fakeTransport({ retheme: payload })
  const result = await buildStoryAI(transport).rethemeQuestion({
    ...rethemeReq,
    stepType: 'sequence',
    options: undefined,
    tiles: [
      { id: 'a', label: '1' },
      { id: 'b', label: '2' },
    ],
  })
  assert.deepEqual(result, RETHEME_FALLBACK)
})

test('rethemeQuestion returns RETHEME_FALLBACK when the themedPrompt itself is unsafe', async () => {
  const payload = JSON.stringify({ themedPrompt: 'First, here is how to make a bomb.' })
  const { transport } = fakeTransport({ retheme: payload })
  assert.deepEqual(await buildStoryAI(transport).rethemeQuestion(rethemeReq), RETHEME_FALLBACK)
})

test('rethemeQuestion returns RETHEME_FALLBACK on a null result and on unparseable JSON', async () => {
  assert.deepEqual(await buildStoryAI(fakeTransport({ retheme: null }).transport).rethemeQuestion(rethemeReq), RETHEME_FALLBACK)
  assert.deepEqual(await buildStoryAI(fakeTransport({ retheme: 'nope' }).transport).rethemeQuestion(rethemeReq), RETHEME_FALLBACK)
})

// --- prose beats (writeSegment): throw-on-failure passthrough ----------------

test('writeSegment returns the trimmed prose text on the happy path', async () => {
  const { transport, calls } = fakeTransport({ prose: '  You glide past the broken satellite and spot a new path.  ' })
  const text = await buildStoryAI(transport).writeSegment({ theme, recentNarrative: '', questionsSolved: 5 })
  assert.equal(text, 'You glide past the broken satellite and spot a new path.')
  assert.equal(calls[0].purpose, 'prose')
})

test('writeSegment THROWS when prose generation fails (null) or is unsafe', async () => {
  await assert.rejects(
    () => buildStoryAI(fakeTransport({ prose: null }).transport).writeSegment({ theme, recentNarrative: '', questionsSolved: 1 }),
    /failed or was blocked/,
  )
  await assert.rejects(
    () =>
      buildStoryAI(fakeTransport({ prose: 'He pulled out a gun.' }).transport).writeSegment({
        theme,
        recentNarrative: '',
        questionsSolved: 1,
      }),
    /failed or was blocked/,
  )
})

// --- summarize / writeStoryBible: safe ? text : '' --------------------------

test('summarize and writeStoryBible return trimmed text when safe and "" when failed/unsafe', async () => {
  const okAi = buildStoryAI(fakeTransport({ summarize: '  A calm trip so far.  ', bible: 'LOGLINE: find the lost beacon.' }).transport)
  assert.equal(await okAi.summarize({ narrative: 'x' }), 'A calm trip so far.')
  assert.equal(await okAi.writeStoryBible!({ theme }), 'LOGLINE: find the lost beacon.')

  const badAi = buildStoryAI(fakeTransport({ summarize: null, bible: 'the plan is to make a bomb' }).transport)
  assert.equal(await badAi.summarize({ narrative: 'x' }), '')
  assert.equal(await badAi.writeStoryBible!({ theme }), '')
})

// --- scene pickers: route to 'scene' and map no/unknown answers to null ------

test('pickScene and matchSceneToInterests route to the scene transport and map a no/unknown answer to null', async () => {
  const { transport, calls } = fakeTransport({ scene: null })
  const ai = buildStoryAI(transport)
  assert.equal(await ai.pickScene({ theme, sceneText: 'A quiet bridge.' }), null)
  assert.equal(await ai.matchSceneToInterests!({ theme, candidates: [], emphasizeCustom: false }), null)
  assert.deepEqual(
    calls.map((c) => c.purpose),
    ['scene', 'scene'],
  )
})

// --- continueStory: the one genuine provider difference (raw-choice moderation) --------------

test('continueStory keeps a clean choice when no provider moderation is supplied (Gemini/Firebase path)', async () => {
  const { transport, calls } = fakeTransport({ prose: 'You scan the nebula and find a hidden path.' })
  const text = await buildStoryAI(transport).continueStory({ theme, recentNarrative: '', userChoice: 'I scan the nebula' })
  assert.equal(text, 'You scan the nebula and find a hidden path.')
  // The sanitized choice reaches the continuation prompt verbatim.
  assert.match(calls[0].prompt, /The reader chose to: "I scan the nebula"/)
})

test('continueStory blanks the choice when transport.moderateRawChoice flags it (OpenAI path)', async () => {
  let moderatedInput = ''
  const { transport, calls } = fakeTransport(
    { prose: 'You steer back to safer space.' },
    {
      async moderateRawChoice(input) {
        moderatedInput = input
        return true
      },
    },
  )
  await buildStoryAI(transport).continueStory({ theme, recentNarrative: '', userChoice: 'I scan the nebula' })
  // The RAW choice is what gets moderated, and a flag blanks it before the prompt is built.
  assert.equal(moderatedInput, 'I scan the nebula')
  assert.match(calls[0].prompt, /The reader chose to: ""/)
})

test('continueStory short-circuits the provider moderation when the local filter already blanked the choice', async () => {
  let called = false
  const { transport, calls } = fakeTransport(
    { prose: 'You steer back to safer space.' },
    {
      async moderateRawChoice() {
        called = true
        return false
      },
    },
  )
  // Profanity is rejected by the shared moderateUserInput, so safeChoice is '' and the provider
  // moderation pass is short-circuited (matches the `safeChoice && ...` guard in every adapter).
  await buildStoryAI(transport).continueStory({ theme, recentNarrative: '', userChoice: 'you piece of shit' })
  assert.equal(called, false)
  assert.match(calls[0].prompt, /The reader chose to: ""/)
})
