// Locks the PURE Story Mode beat/request helpers extracted from useStorySession.ts into
// src/story/storyBeats.ts. The controller hook is a React seam with no DOM/node test harness, so
// these helpers were pulled out precisely so their behavior can be pinned here under `node --test`:
// recap-chapter math, the distinct/theme-aware beat-text fallback, the re-theme request builder
// (which must NEVER leak the answer key), the output-moderation text join, the provider-config
// entry gate, the previous-scene de-dupe, the injected scene matcher, and the compaction narrative.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LessonStep, SceneId, StorySession, StoryTheme } from '../src/domain'
import type { SceneMatchRequest, StoryAI } from '../src/story/storyAi'
import type { StoryAiEnv } from '../src/story/selectStoryProvider'
import { appendSegment, createInitialSession, KEEP_VERBATIM_SEGMENTS } from '../src/story/storySessionReducer'
import {
  buildCompactionNarrative,
  buildRethemeRequest,
  choiceRejectionMessage,
  isProviderConfigured,
  matcherFor,
  messageFrom,
  newestRecapChapter,
  previousSceneId,
  resolveBeatText,
  sceneForBeat,
  themedStepText,
} from '../src/story/storyBeats'

// --- Fixtures -------------------------------------------------------------------------------

const ISO = '2026-06-25T00:00:00.000Z'

const theme = (over: Partial<StoryTheme> = {}): StoryTheme => ({
  interestIds: ['sports'],
  premise: 'A scrappy team chases the championship.',
  protagonist: 'the Captain',
  ...over,
})

const baseSession = (over: Partial<StorySession> = {}): StorySession => ({
  ...createInitialSession(theme(), 'u1', ISO, 'sid'),
  ...over,
})

const sessionWithSegments = (summary: string, segs: { text: string; sceneId?: SceneId }[]): StorySession => {
  let session: StorySession = { ...baseSession(), narrativeSummary: summary }
  for (const seg of segs) {
    session = appendSegment(session, { text: seg.text, now: ISO, ...(seg.sceneId ? { sceneId: seg.sceneId } : {}) })
  }
  return session
}

// Minimal-but-valid LessonStep instances for each rethemable type.
const mcqStep: LessonStep = {
  id: 'q-mcq',
  type: 'mcq',
  prompt: 'Predict the tilt of the scale.',
  options: [
    { id: 'tips-left', label: 'Left drops', feedback: 'fa' },
    { id: 'stays-level', label: 'Stays level', feedback: 'fb' },
  ],
  correctId: 'tips-left',
}

const opChoiceStep: LessonStep = {
  id: 'q-op',
  type: 'operation-choice',
  prompt: 'Choose the inverse operation.',
  equation: 'x + 3 = 7',
  choices: [
    { id: 'sub', label: 'Subtract 3', feedback: 'fa' },
    { id: 'add', label: 'Add 3', feedback: 'fb' },
  ],
  correctId: 'sub',
  feedback: { correct: 'c', incorrect: 'i' },
}

const sequenceStep: LessonStep = {
  id: 'q-seq',
  type: 'sequence',
  prompt: 'Order the steps.',
  equation: '2x = 10',
  tiles: [
    { id: 't1', label: 'Divide by 2' },
    { id: 't2', label: 'x = 5' },
  ],
  correctOrder: ['t1', 't2'],
  feedback: { correct: 'c', incorrect: 'i', incomplete: 'n' },
}

const inputStep: LessonStep = {
  id: 'q-input',
  type: 'input',
  prompt: 'Solve for x.',
  equation: 'x / 4 = 2',
  accept: ['8'],
  feedback: { correct: 'c', incorrect: 'i' },
}

const inputNoEquationStep: LessonStep = {
  id: 'q-input-2',
  type: 'input',
  prompt: 'What is x?',
  accept: ['3'],
  feedback: { correct: 'c', incorrect: 'i' },
}

// --- newestRecapChapter ----------------------------------------------------------------------

test('newestRecapChapter returns 0 when nothing reviewable yet (first checkpoint, no beats)', () => {
  assert.equal(newestRecapChapter(baseSession({ questionsSolvedTotal: 0 })), 0)
})

test('newestRecapChapter returns 0 when only the current chapter has a setup (no outcome yet)', () => {
  // Chapter 1, captured setup but no committed outcome -> newest reviewable would be chapter 0.
  const session = baseSession({ questionsSolvedTotal: 0, chapterBeats: [{ chapter: 1, text: 'opening' }] })
  assert.equal(newestRecapChapter(session), 0)
})

test('newestRecapChapter falls back to the previous chapter on the checkpoint screen', () => {
  // questionsSolvedTotal 5 -> current chapter 2, whose beat has no outcome (checkpoint screen),
  // so the newest reviewable recap is the previous chapter (1), which exists.
  const session = baseSession({
    questionsSolvedTotal: 5,
    chapterBeats: [
      { chapter: 1, text: 'ch1', outcomeText: 'ch1 outcome' },
      { chapter: 2, text: 'ch2' },
    ],
  })
  assert.equal(newestRecapChapter(session), 1)
})

test('newestRecapChapter includes the current chapter once it has an outcome (outcome screen)', () => {
  const session = baseSession({
    questionsSolvedTotal: 5,
    chapterBeats: [
      { chapter: 1, text: 'ch1', outcomeText: 'o1' },
      { chapter: 2, text: 'ch2', outcomeText: 'o2' },
    ],
  })
  assert.equal(newestRecapChapter(session), 2)
})

// --- resolveBeatText -------------------------------------------------------------------------

test('resolveBeatText commits a clean, safe, distinct generation verbatim (not a fallback)', () => {
  const session = sessionWithSegments('', [{ text: 'The Captain jogs to the locker room.' }])
  const generated = 'You sprint onto the field as the whistle blows and the crowd roars to life.'
  const result = resolveBeatText(session, generated, 'bridge')
  assert.equal(result.isFallback, false)
  assert.equal(result.text, generated)
})

test('resolveBeatText falls back (theme-aware) when the generation is null', () => {
  const session = baseSession()
  const result = resolveBeatText(session, null, 'opening')
  assert.equal(result.isFallback, true)
  assert.ok(result.text.length > 0)
  // Theme-aware: the sports protagonist is woven into the offline beat.
  assert.match(result.text, /the Captain/i)
})

test('resolveBeatText falls back when the generation is unsafe', () => {
  const session = baseSession()
  const result = resolveBeatText(session, 'He grabbed a gun and started shooting everyone.', 'bridge')
  assert.equal(result.isFallback, true)
  assert.equal(/gun|shooting/i.test(result.text), false)
})

test('resolveBeatText never reprints the immediately-previous beat (distinctness)', () => {
  const previous = 'The Captain studies the scoreboard, weighing the next play carefully here.'
  const session = sessionWithSegments('', [{ text: previous }])
  // Even if the model returns the SAME text as the prior beat, it must rotate to a distinct fallback.
  const result = resolveBeatText(session, previous, 'outcome')
  assert.equal(result.isFallback, true)
  assert.notEqual(result.text.trim(), previous)
})

// --- messageFrom -----------------------------------------------------------------------------

test('messageFrom returns the Error message when present, else the fallback', () => {
  assert.equal(messageFrom(new Error('boom'), 'fb'), 'boom')
  assert.equal(messageFrom(new Error(''), 'fb'), 'fb') // blank message -> fallback
  assert.equal(messageFrom('a string error', 'fb'), 'fb')
  assert.equal(messageFrom(null, 'fb'), 'fb')
  assert.equal(messageFrom(undefined, 'fb'), 'fb')
})

// --- choiceRejectionMessage ------------------------------------------------------------------

test('choiceRejectionMessage maps each rejection reason to a friendly nudge', () => {
  assert.match(choiceRejectionMessage('empty'), /type what you want to do next/i)
  assert.match(choiceRejectionMessage('profanity'), /friendly for everyone/i)
  assert.match(choiceRejectionMessage('unsafe'), /friendly for everyone/i)
  // Unknown / absent reason -> the generic "try differently" message.
  assert.match(choiceRejectionMessage('other'), /a little differently/i)
  assert.match(choiceRejectionMessage(), /a little differently/i)
})

// --- isProviderConfigured --------------------------------------------------------------------

test('isProviderConfigured treats proxy as configured only with a proxy URL', () => {
  assert.equal(isProviderConfigured({ VITE_STORY_AI_PROVIDER: 'proxy', VITE_STORY_AI_PROXY_URL: '/api/story' }), true)
  assert.equal(isProviderConfigured({ VITE_STORY_AI_PROVIDER: 'proxy' }), false)
})

test('isProviderConfigured treats firebase as always configured', () => {
  assert.equal(isProviderConfigured({ VITE_STORY_AI_PROVIDER: 'firebase' }), true)
})

test('isProviderConfigured accepts either OpenAI key name and a Gemini key', () => {
  assert.equal(isProviderConfigured({ OPENAI_API_KEY: 'sk-live' }), true)
  assert.equal(isProviderConfigured({ VITE_OPENAI_API_KEY: 'sk-live' }), true)
  assert.equal(isProviderConfigured({ VITE_GEMINI_API_KEY: 'AIza-key' }), true)
})

test('isProviderConfigured treats a blank/absent key as not configured', () => {
  assert.equal(isProviderConfigured({ OPENAI_API_KEY: '   ' }), false)
  assert.equal(isProviderConfigured({}), false)
})

test('isProviderConfigured (entry gate) ignores PROD, unlike selectStoryProvider', () => {
  // The entry gate only asks "is a provider configured at all"; the PROD client-key refusal lives
  // in selectStoryProvider. So a present key still reads as "configured" here even under PROD.
  const env: StoryAiEnv = { OPENAI_API_KEY: 'sk-live', PROD: true }
  assert.equal(isProviderConfigured(env), true)
})

// --- previousSceneId -------------------------------------------------------------------------

test('previousSceneId returns the last segment scene, or undefined', () => {
  assert.equal(previousSceneId(baseSession()), undefined) // no segments
  assert.equal(previousSceneId(sessionWithSegments('', [{ text: 'a' }])), undefined) // last has no scene
  const withScene = sessionWithSegments('', [
    { text: 'a', sceneId: 'soccer-field' },
    { text: 'b', sceneId: 'ski-slope' },
  ])
  assert.equal(previousSceneId(withScene), 'ski-slope')
})

// --- matcherFor ------------------------------------------------------------------------------

const aiWithMatcher = (matcher: (req: SceneMatchRequest) => Promise<SceneId | null>): StoryAI =>
  ({ matchSceneToInterests: matcher } as unknown as StoryAI)
const aiNoMatcher = (): StoryAI => ({}) as unknown as StoryAI

test('matcherFor returns undefined without an adapter or matcher', () => {
  assert.equal(matcherFor(null), undefined)
  assert.equal(matcherFor(aiNoMatcher()), undefined)
})

test('matcherFor wraps and forwards to the adapter matcher', async () => {
  const calls: SceneMatchRequest[] = []
  const matcher = matcherFor(
    aiWithMatcher(async (req) => {
      calls.push(req)
      return 'pirate-cove'
    }),
  )
  assert.ok(matcher)
  const req: SceneMatchRequest = { theme: theme(), candidates: ['pirate-cove', 'ski-slope'], emphasizeCustom: false }
  assert.equal(await matcher!(req), 'pirate-cove')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], req)
})

// --- sceneForBeat ----------------------------------------------------------------------------

const customOnlyTheme = (): StoryTheme => ({
  interestIds: [],
  freeformInterest: 'volcanoes and lava',
  premise: '',
  protagonist: '',
})

test('sceneForBeat consults the matcher for a real (non-fallback) beat and returns its pick', async () => {
  let calls = 0
  const ai = aiWithMatcher(async () => {
    calls += 1
    return 'pirate-cove'
  })
  const result = await sceneForBeat(ai, customOnlyTheme(), false, undefined)
  assert.equal(result, 'pirate-cove')
  assert.equal(calls, 1)
})

test('sceneForBeat SKIPS the matcher for a fallback beat (offline scene)', async () => {
  let calls = 0
  const ai = aiWithMatcher(async () => {
    calls += 1
    return 'pirate-cove'
  })
  const result = await sceneForBeat(ai, customOnlyTheme(), true, undefined)
  assert.equal(calls, 0, 'a fallback beat must never call the (degraded) AI matcher')
  assert.equal(typeof result, 'string') // still resolves to an offline, on-theme scene
})

test('sceneForBeat resolves a single-interest beat to a catalog scene without any adapter', async () => {
  const result = await sceneForBeat(null, theme(), false, undefined)
  assert.equal(typeof result, 'string')
  assert.ok((result ?? '').length > 0)
})

// --- buildRethemeRequest (must never leak the answer key) ------------------------------------

test('buildRethemeRequest maps an mcq step to prompt + option labels only', () => {
  const req = buildRethemeRequest(theme(), 'STORY SO FAR', mcqStep)
  assert.equal(req.stepType, 'mcq')
  assert.equal(req.prompt, 'Predict the tilt of the scale.')
  assert.equal(req.recentNarrative, 'STORY SO FAR')
  assert.deepEqual(req.options, [
    { id: 'tips-left', label: 'Left drops' },
    { id: 'stays-level', label: 'Stays level' },
  ])
  // The answer key (and per-option feedback) must NOT travel to the LLM.
  assert.equal('correctId' in req, false)
  assert.equal('feedback' in (req.options?.[0] ?? {}), false)
})

test('buildRethemeRequest maps operation-choice (with equation) to choices', () => {
  const req = buildRethemeRequest(theme(), '', opChoiceStep)
  assert.equal(req.stepType, 'operation-choice')
  assert.equal(req.equation, 'x + 3 = 7')
  assert.deepEqual(req.options, [
    { id: 'sub', label: 'Subtract 3' },
    { id: 'add', label: 'Add 3' },
  ])
  assert.equal('correctId' in req, false)
})

test('buildRethemeRequest maps a sequence step to tiles (with equation)', () => {
  const req = buildRethemeRequest(theme(), '', sequenceStep)
  assert.equal(req.stepType, 'sequence')
  assert.equal(req.equation, '2x = 10')
  assert.deepEqual(req.tiles, [
    { id: 't1', label: 'Divide by 2' },
    { id: 't2', label: 'x = 5' },
  ])
  assert.equal('correctOrder' in req, false)
})

test('buildRethemeRequest carries the equation for input steps, omitting it when absent', () => {
  const withEq = buildRethemeRequest(theme(), '', inputStep)
  assert.equal(withEq.stepType, 'input')
  assert.equal(withEq.prompt, 'Solve for x.')
  assert.equal(withEq.equation, 'x / 4 = 2')
  assert.equal('accept' in withEq, false)

  const noEq = buildRethemeRequest(theme(), '', inputNoEquationStep)
  assert.equal(noEq.prompt, 'What is x?')
  assert.equal('equation' in noEq, false)
})

// --- themedStepText --------------------------------------------------------------------------

test('themedStepText joins the prompt with every shown label', () => {
  assert.equal(themedStepText(mcqStep), 'Predict the tilt of the scale. Left drops Stays level')
  assert.equal(themedStepText(opChoiceStep), 'Choose the inverse operation. Subtract 3 Add 3')
  assert.equal(themedStepText(sequenceStep), 'Order the steps. Divide by 2 x = 5')
  assert.equal(themedStepText(inputStep), 'Solve for x.') // input has only a prompt
})

// --- buildCompactionNarrative ----------------------------------------------------------------

test('buildCompactionNarrative joins the summary with beats older than the verbatim window', () => {
  // KEEP_VERBATIM_SEGMENTS most-recent beats stay verbatim; everything older folds in here.
  assert.equal(KEEP_VERBATIM_SEGMENTS, 2)
  const session = sessionWithSegments('SUMMARY', [
    { text: 's0' },
    { text: 's1' },
    { text: 's2' },
    { text: 's3' },
  ])
  assert.equal(buildCompactionNarrative(session), 'SUMMARY\n\ns0\n\ns1')
})

test('buildCompactionNarrative drops an empty summary and handles the short-buffer case', () => {
  const noSummary = sessionWithSegments('', [{ text: 's0' }, { text: 's1' }, { text: 's2' }])
  assert.equal(buildCompactionNarrative(noSummary), 's0')

  // At or below the verbatim window there is nothing older to fold, so only the summary remains.
  const summaryOnly = sessionWithSegments('SUMMARY', [{ text: 's0' }, { text: 's1' }])
  assert.equal(buildCompactionNarrative(summaryOnly), 'SUMMARY')

  const empty = sessionWithSegments('', [{ text: 's0' }, { text: 's1' }])
  assert.equal(buildCompactionNarrative(empty), '')
})
