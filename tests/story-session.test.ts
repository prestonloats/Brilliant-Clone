import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StoryTheme, ThemedQuestion } from '../src/domain'
import {
  CHECKPOINT_INTERVAL,
  KEEP_VERBATIM_SEGMENTS,
  SERVED_STEP_IDS_CAP,
  appendSegment,
  clearCurrentQuestion,
  compactNarrative,
  createInitialSession,
  endSession,
  isCheckpointDue,
  recentNarrative,
  recordSolved,
  resetCheckpoint,
  rethemeNarrative,
  setCurrentQuestion,
  setLatestSegmentChoice,
  setNarrativeSummary,
} from '../src/story/storySessionReducer'

// --- Fixtures -------------------------------------------------------------------------------
//
// The reducer is the only Story Mode layer with a DOM-free unit-test harness (node --test), so
// these tests pin down every session transition: counters, the checkpoint cadence, the capped
// anti-repeat memory, segment bookkeeping, and the endless loop never getting stuck. The hook
// and screens that consume the reducer are verified by `npx tsc -b` + manual QA (no DOM here).

const ISO = '2026-06-25T00:00:00.000Z'
const LATER = '2026-06-25T01:00:00.000Z'

const theme = (): StoryTheme => ({
  interestIds: ['space', 'fashion'],
  freeformInterest: 'asteroid mining',
  premise: 'A lone navigator charts a living nebula.',
  protagonist: 'Captain Vega',
})

const themedQuestion = (stepId = 'input-box-value'): ThemedQuestion => ({
  sourceLessonId: 'balancing-equations',
  sourceStepId: stepId,
  stepType: 'input',
  themedPrompt: 'How many fuel cells balance the reactor core?',
  themed: true,
  generatedAt: ISO,
})

// --- createInitialSession -------------------------------------------------------------------

test('createInitialSession seeds an empty active session at schema v2', () => {
  const session = createInitialSession(theme(), 'user-1', ISO, 'story-1')

  assert.equal(session.id, 'story-1')
  assert.equal(session.userId, 'user-1')
  assert.equal(session.status, 'active')
  assert.equal(session.questionsSolvedTotal, 0)
  assert.equal(session.questionsSinceCheckpoint, 0)
  assert.deepEqual(session.servedStepIds, [])
  assert.deepEqual(session.history, [])
  assert.equal(session.historyIndex, 0)
  assert.deepEqual(session.segments, [])
  assert.equal(session.narrativeSummary, '')
  assert.equal(session.schemaVersion, 2)
  assert.equal(session.createdAt, ISO)
  assert.equal(session.updatedAt, ISO)
  assert.deepEqual(session.theme, theme())
  // A brand-new session must never carry a stale current question.
  assert.equal('currentQuestion' in session, false)
})

test('createInitialSession mints a unique id when none is supplied', () => {
  const first = createInitialSession(theme(), 'user-1', ISO)
  const second = createInitialSession(theme(), 'user-1', ISO)
  assert.equal(typeof first.id, 'string')
  assert.ok(first.id.length > 0)
  assert.notEqual(first.id, second.id)
})

// --- recordSolved: counters, anti-repeat memory, immutability -------------------------------

test('recordSolved increments both counters and appends the served key', () => {
  const start = createInitialSession(theme(), 'user-1', ISO)
  const after = recordSolved(start, 'balancing-equations:input-box-value', LATER)

  assert.equal(after.questionsSolvedTotal, 1)
  assert.equal(after.questionsSinceCheckpoint, 1)
  assert.deepEqual(after.servedStepIds, ['balancing-equations:input-box-value'])
  assert.equal(after.updatedAt, LATER)

  // Pure: the input session is never mutated.
  assert.equal(start.questionsSolvedTotal, 0)
  assert.deepEqual(start.servedStepIds, [])
})

test('recordSolved caps servedStepIds at SERVED_STEP_IDS_CAP, dropping the oldest', () => {
  assert.equal(SERVED_STEP_IDS_CAP, 200)

  let session = createInitialSession(theme(), 'user-1', ISO)
  const overflow = SERVED_STEP_IDS_CAP + 5
  for (let i = 0; i < overflow; i += 1) {
    session = recordSolved(session, `balancing-equations:q${i}`, ISO)
  }

  assert.equal(session.servedStepIds.length, SERVED_STEP_IDS_CAP)
  // The five oldest keys (q0..q4) were dropped from the front; q5..q204 remain.
  assert.equal(session.servedStepIds[0], 'balancing-equations:q5')
  assert.equal(session.servedStepIds[SERVED_STEP_IDS_CAP - 1], `balancing-equations:q${overflow - 1}`)
  // Lifetime total still counts every solve, even those dropped from the anti-repeat window.
  assert.equal(session.questionsSolvedTotal, overflow)
})

// --- Checkpoint cadence ---------------------------------------------------------------------

test('isCheckpointDue fires exactly at the 5th solve, not before', () => {
  assert.equal(CHECKPOINT_INTERVAL, 5)

  let session = createInitialSession(theme(), 'user-1', ISO)
  for (let i = 1; i <= CHECKPOINT_INTERVAL; i += 1) {
    session = recordSolved(session, `balancing-equations:q${i}`, ISO)
    if (i < CHECKPOINT_INTERVAL) {
      assert.equal(isCheckpointDue(session), false, `not due after ${i} solves`)
    }
  }
  assert.equal(isCheckpointDue(session), true)
  assert.equal(session.questionsSinceCheckpoint, CHECKPOINT_INTERVAL)
})

test('resetCheckpoint zeroes questionsSinceCheckpoint but preserves the lifetime total', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  for (let i = 0; i < CHECKPOINT_INTERVAL; i += 1) {
    session = recordSolved(session, `balancing-equations:q${i}`, ISO)
  }
  const reset = resetCheckpoint(session, LATER)

  assert.equal(reset.questionsSinceCheckpoint, 0)
  assert.equal(reset.questionsSolvedTotal, CHECKPOINT_INTERVAL)
  assert.equal(isCheckpointDue(reset), false)
  assert.equal(reset.updatedAt, LATER)
})

// --- Segments -------------------------------------------------------------------------------

test('appendSegment assigns sequential indices and carries optional userChoice', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  session = appendSegment(session, { text: 'Opening beat.', now: ISO })
  session = appendSegment(session, { text: 'Second beat.', userChoice: 'Climb the ridge', now: LATER })

  assert.equal(session.segments.length, 2)
  assert.deepEqual(session.segments[0], { index: 0, text: 'Opening beat.', createdAt: ISO })
  assert.deepEqual(session.segments[1], {
    index: 1,
    text: 'Second beat.',
    userChoice: 'Climb the ridge',
    createdAt: LATER,
  })
  assert.equal(session.updatedAt, LATER)
  // The first segment must not have gained a userChoice key.
  assert.equal('userChoice' in session.segments[0], false)
})

test('setLatestSegmentChoice records the choice on the most recent segment only', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  session = appendSegment(session, { text: 'First.', now: ISO })
  session = appendSegment(session, { text: 'Second.', now: ISO })
  session = setLatestSegmentChoice(session, 'Open the hatch', LATER)

  assert.equal('userChoice' in session.segments[0], false)
  assert.equal(session.segments[1].userChoice, 'Open the hatch')
  assert.equal(session.updatedAt, LATER)

  // No segments yet -> safe no-op (the endless loop must never throw here).
  const empty = createInitialSession(theme(), 'user-1', ISO)
  assert.deepEqual(setLatestSegmentChoice(empty, 'anything', LATER).segments, [])
})

test('compactNarrative folds older segments into the summary and re-indexes the tail', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  for (let i = 0; i < 6; i += 1) {
    session = appendSegment(session, { text: `beat ${i}`, now: ISO })
  }
  const compacted = compactNarrative(session, {
    summary: 'Everything that happened before.',
    keepLastSegments: 2,
    now: LATER,
  })

  assert.equal(compacted.narrativeSummary, 'Everything that happened before.')
  assert.equal(compacted.segments.length, 2)
  assert.deepEqual(
    compacted.segments.map((segment) => segment.text),
    ['beat 4', 'beat 5'],
  )
  // Indices stay contiguous from 0 after trimming so appendSegment keeps numbering correctly.
  assert.deepEqual(
    compacted.segments.map((segment) => segment.index),
    [0, 1],
  )
  assert.equal(compacted.updatedAt, LATER)
})

// --- Current question -----------------------------------------------------------------------

test('setCurrentQuestion / clearCurrentQuestion set and remove the on-screen question', () => {
  const start = createInitialSession(theme(), 'user-1', ISO)
  const withQuestion = setCurrentQuestion(start, themedQuestion(), LATER)
  assert.deepEqual(withQuestion.currentQuestion, themedQuestion())
  assert.equal(withQuestion.updatedAt, LATER)

  const cleared = clearCurrentQuestion(withQuestion, ISO)
  assert.equal('currentQuestion' in cleared, false)
  assert.equal(cleared.updatedAt, ISO)
})

test('setNarrativeSummary replaces the rolling summary', () => {
  const start = createInitialSession(theme(), 'user-1', ISO)
  const updated = setNarrativeSummary(start, 'The story so far.', LATER)
  assert.equal(updated.narrativeSummary, 'The story so far.')
  assert.equal(updated.updatedAt, LATER)
})

test('endSession marks the session ended and drops the current question', () => {
  const start = setCurrentQuestion(createInitialSession(theme(), 'user-1', ISO), themedQuestion(), ISO)
  const ended = endSession(start, LATER)
  assert.equal(ended.status, 'ended')
  assert.equal('currentQuestion' in ended, false)
  assert.equal(ended.updatedAt, LATER)
})

// --- Narrative context for the prompts (recentNarrative / rethemeNarrative) ------------------
//
// These pin down the EXACT continuity each generated beat/question receives, since the
// "questions ignore my answer / do different options each time" bug was about stale/thin context.

test('recentNarrative carries the rolling summary, recent beats, and the exact choice typed', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  session = setNarrativeSummary(session, 'Earlier: the crew left port.')
  session = appendSegment(session, { text: 'You reach a split in the canyon.', now: ISO })
  session = setLatestSegmentChoice(session, 'take the left tunnel', LATER)
  session = appendSegment(session, { text: 'The left tunnel opens into a glowing cavern.', now: LATER })

  const narrative = recentNarrative(session)
  assert.match(narrative, /Earlier: the crew left port\./) // rolling summary
  assert.match(narrative, /split in the canyon/) // recent beat
  assert.match(narrative, /The reader chose to: "take the left tunnel"/) // committed choice, verbatim
  assert.match(narrative, /glowing cavern/) // outcome beat
})

test('recentNarrative keeps only the last KEEP_VERBATIM_SEGMENTS beats verbatim', () => {
  assert.equal(KEEP_VERBATIM_SEGMENTS, 2)
  let session = createInitialSession(theme(), 'user-1', ISO)
  session = appendSegment(session, { text: 'beat-zero', now: ISO })
  session = appendSegment(session, { text: 'beat-one', now: ISO })
  session = appendSegment(session, { text: 'beat-two', now: ISO })
  const narrative = recentNarrative(session)
  assert.equal(narrative.includes('beat-zero'), false) // older than the verbatim window
  assert.match(narrative, /beat-one/)
  assert.match(narrative, /beat-two/)
})

test('rethemeNarrative chains the next question from the PREVIOUS question within a chapter', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  session = appendSegment(session, { text: 'The vault door looms ahead.', now: ISO })
  session = setCurrentQuestion(
    session,
    { ...themedQuestion('q1'), themed: true, themedPrompt: 'You face the rune-locked vault.' },
    ISO,
  )

  const narrative = rethemeNarrative(session)
  // The running narrative is still there...
  assert.match(narrative, /vault door looms/)
  // ...PLUS the previous question's scene, so the next question continues from it (one thread).
  assert.match(narrative, /THE PREVIOUS CHALLENGE/)
  assert.match(narrative, /rune-locked vault/)
})

test('rethemeNarrative chains the FIRST question of a new chapter from the committed outcome, not a stale question', () => {
  // Exactly the state submitCheckpointChoice prefetches against: beat -> choice -> outcome, with the
  // live question cleared at the checkpoint.
  let session = createInitialSession(theme(), 'user-1', ISO)
  session = appendSegment(session, { text: 'A storm splits the road.', now: ISO })
  session = setLatestSegmentChoice(session, 'shelter in the cave', LATER)
  session = appendSegment(session, { text: 'Inside the cave you find an old map.', now: LATER })
  session = clearCurrentQuestion(session)

  const narrative = rethemeNarrative(session)
  // It reflects the committed choice + outcome (so the first question follows them)...
  assert.match(narrative, /The reader chose to: "shelter in the cave"/)
  assert.match(narrative, /old map/)
  // ...and adds NO previous-question line (there is no live question to chain from at a boundary).
  assert.equal(narrative.includes('THE PREVIOUS CHALLENGE'), false)
})

test('rethemeNarrative ignores an un-themed (fallback) current question', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  session = appendSegment(session, { text: 'The bridge sways.', now: ISO })
  session = setCurrentQuestion(session, { ...themedQuestion('q1'), themed: false, themedPrompt: 'Solve 2x = 8.' }, ISO)
  const narrative = rethemeNarrative(session)
  // A fallback (un-themed) question is raw math with no story wrapper, so it must not be chained.
  assert.equal(narrative.includes('THE PREVIOUS CHALLENGE'), false)
  assert.equal(narrative.includes('Solve 2x = 8.'), false)
})

// --- Endless loop ---------------------------------------------------------------------------

test('the solve -> checkpoint -> reset loop runs endlessly without getting stuck', () => {
  let session = createInitialSession(theme(), 'user-1', ISO)
  let checkpoints = 0
  const totalSolves = 100

  for (let i = 0; i < totalSolves; i += 1) {
    // A tiny pool (4 keys) intentionally repeats, mirroring the small post-unlock catalog.
    session = setCurrentQuestion(session, themedQuestion(`q${i % 4}`), ISO)
    session = recordSolved(session, `balancing-equations:q${i % 4}`, ISO)
    if (isCheckpointDue(session)) {
      checkpoints += 1
      session = clearCurrentQuestion(session)
      session = appendSegment(session, { text: `Chapter ${checkpoints}.`, now: ISO })
      session = resetCheckpoint(session, ISO)
    }
  }

  assert.equal(session.questionsSolvedTotal, totalSolves)
  assert.equal(checkpoints, totalSolves / CHECKPOINT_INTERVAL) // exactly 20 checkpoints in 100 solves
  assert.equal(session.questionsSinceCheckpoint, 0) // 100 is a clean multiple, so it just reset
  assert.equal(session.segments.length, checkpoints)
  assert.ok(session.servedStepIds.length <= SERVED_STEP_IDS_CAP)
  assert.equal(session.status, 'active') // the loop never ends on its own
})
