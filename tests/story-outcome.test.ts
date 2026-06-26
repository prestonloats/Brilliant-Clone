import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend'
import type { StorySession, StoryTheme, ThemedQuestion } from '../src/domain'
import {
  CHECKPOINT_INTERVAL,
  appendSegment,
  clearCurrentQuestion,
  compactNarrative,
  createInitialSession,
  isAwaitingOutcomeAck,
  isCheckpointDue,
  recordSolved,
  resetCheckpoint,
  setCurrentQuestion,
  setLatestSegmentChoice,
} from '../src/story/storySessionReducer'

// --- Fixtures -------------------------------------------------------------------------------
//
// These pin down the NEW checkpoint -> OUTCOME -> continue -> questions flow at the only layer
// with a DOM-free harness: the pure reducer + the `isAwaitingOutcomeAck` derivation the
// controller (`useStorySession`) uses to (a) stop on the outcome page after a choice and
// (b) resume back to it after a refresh. The React screen/hook wiring is covered by tsc + QA.

const ISO = '2026-06-25T00:00:00.000Z'
const LATER = '2026-06-25T01:00:00.000Z'

const theme = (): StoryTheme => ({
  interestIds: ['space', 'fashion'],
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

// Drive the pure session through one full checkpoint cycle up to (but not past) the moment the
// learner submits their action, leaving the session on the OUTCOME-waiting state.
const awaitingOutcome = (): StorySession => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  session = appendSegment(session, { text: 'The opening beat sets the scene.', now: ISO }) // checkpoint prompt
  session = setLatestSegmentChoice(session, 'Chart a path through the clouds', LATER) // recorded choice
  session = appendSegment(session, { text: 'You steer in and discover a hidden moon.', now: LATER }) // outcome
  return session
}

// --- isAwaitingOutcomeAck: the resume/stop signal -------------------------------------------

test('isAwaitingOutcomeAck is false before any action is taken (opening + empty)', () => {
  const empty = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  assert.equal(isAwaitingOutcomeAck(empty), false)

  // The opening beat is a checkpoint PROMPT (no choice yet), not an outcome.
  const opening = appendSegment(empty, { text: 'The opening beat.', now: ISO })
  assert.equal(isAwaitingOutcomeAck(opening), false)
})

test('isAwaitingOutcomeAck is true once a choice is recorded and the outcome beat is appended', () => {
  const session = awaitingOutcome()
  assert.equal(isAwaitingOutcomeAck(session), true)
  // The signature: latest beat carries no choice, the beat before it carries the typed choice.
  assert.equal('userChoice' in session.segments[session.segments.length - 1], false)
  assert.equal(session.segments[session.segments.length - 2].userChoice, 'Chart a path through the clouds')
})

test('isAwaitingOutcomeAck is false at a genuine checkpoint (prev beat is a prior outcome)', () => {
  // [opening(choice), outcome, checkpoint-beat] — the beat before the checkpoint is an outcome
  // with no choice, so the two-segment signature must NOT match.
  let session = awaitingOutcome() // [opening(choice), outcome]
  session = appendSegment(session, { text: 'A new chapter begins after five puzzles.', now: ISO })
  assert.equal(isAwaitingOutcomeAck(session), false)
})

test('isAwaitingOutcomeAck is false once the next question is staged (continue tapped)', () => {
  const session = setCurrentQuestion(awaitingOutcome(), themedQuestion('q1'), LATER)
  assert.equal(isAwaitingOutcomeAck(session), false)
})

// --- The full choice -> outcome -> continue transition --------------------------------------

test('submitting a choice records it, appends the outcome, and waits WITHOUT advancing counters', () => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  session = appendSegment(session, { text: 'Opening beat.', now: ISO })

  // (controller: submitCheckpointChoice — moderate happens upstream, reducer records + appends)
  session = setLatestSegmentChoice(session, 'Open the hatch', LATER)
  session = appendSegment(session, { text: 'The hatch hisses open onto a starlit bay.', now: LATER })

  assert.equal(isAwaitingOutcomeAck(session), true)
  assert.equal(session.segments.length, 2)
  // PURE REVIEW + checkpoint counter unaffected by reading the outcome: nothing is solved here.
  assert.equal(session.questionsSolvedTotal, 0)
  assert.equal(session.questionsSinceCheckpoint, 0)
  assert.equal('currentQuestion' in session, false)
  assert.equal(isCheckpointDue(session), false)

  // (controller: continueFromOutcome — stages the next live question, leaving the outcome state)
  const continued = setCurrentQuestion(session, themedQuestion('q1'), LATER)
  assert.equal(isAwaitingOutcomeAck(continued), false)
  assert.equal(continued.currentQuestion?.sourceStepId, 'q1')
  // Still no solves recorded just by continuing — counters only move when a question is solved.
  assert.equal(continued.questionsSolvedTotal, 0)
  assert.equal(continued.questionsSinceCheckpoint, 0)
})

test('a second checkpoint cycle re-enters the outcome-waiting state after the next 5 solves', () => {
  // Continue from the first outcome into questions, solve a full interval, hit the next
  // checkpoint, then submit another action — the outcome signature must reappear.
  let session = setCurrentQuestion(awaitingOutcome(), themedQuestion('q1'), ISO)
  for (let i = 0; i < CHECKPOINT_INTERVAL; i += 1) {
    session = setCurrentQuestion(session, themedQuestion(`q${i}`), ISO)
    session = recordSolved(session, `balancing-equations:q${i}`, ISO)
    assert.equal(isAwaitingOutcomeAck(session), false) // never mid-questions
  }
  assert.equal(isCheckpointDue(session), true)

  // (controller: checkpoint branch of submitQuestionResult)
  session = resetCheckpoint(clearCurrentQuestion(session))
  session = appendSegment(session, { text: 'Chapter two opens on a derelict station.', now: ISO })
  assert.equal(isAwaitingOutcomeAck(session), false) // a fresh checkpoint, not an outcome

  // (controller: submitCheckpointChoice again)
  session = setLatestSegmentChoice(session, 'Board the station', LATER)
  session = appendSegment(session, { text: 'Airlocks cycle as you step aboard.', now: LATER })
  assert.equal(isAwaitingOutcomeAck(session), true)
  assert.equal(session.questionsSolvedTotal, CHECKPOINT_INTERVAL)
})

// --- Resume: a refresh on the outcome page returns to it ------------------------------------

test('the outcome-waiting state survives a persistence round-trip and still resumes to the outcome', () => {
  const session = awaitingOutcome()
  const reloaded = normalizeStorySession(session)
  assert.ok(reloaded, 'expected a normalized session')
  // The derived signal still fires after reload, so routeToActive sends the learner back to the
  // outcome page rather than re-prompting at the checkpoint or skipping to a question.
  assert.equal(isAwaitingOutcomeAck(reloaded), true)
  assert.equal('currentQuestion' in reloaded, false)
  assert.equal(reloaded.segments[reloaded.segments.length - 1].text, 'You steer in and discover a hidden moon.')
})

test('narrative compaction preserves the outcome-waiting signature', () => {
  // Grow the narrative past the verbatim window, then compact to the last two beats: the kept
  // pair is exactly [checkpoint-beat(choice), outcome], so the signal must still hold.
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  for (let i = 0; i < 5; i += 1) {
    session = appendSegment(session, { text: `Filler beat ${i}.`, now: ISO })
  }
  session = setLatestSegmentChoice(session, 'Descend into the canyon', LATER)
  session = appendSegment(session, { text: 'The canyon swallows the light as you descend.', now: LATER })
  assert.equal(isAwaitingOutcomeAck(session), true)

  const compacted = compactNarrative(session, {
    summary: 'Everything that happened before.',
    keepLastSegments: 2,
    now: LATER,
  })
  assert.equal(compacted.segments.length, 2)
  assert.equal(isAwaitingOutcomeAck(compacted), true)
  assert.equal(compacted.segments[0].userChoice, 'Descend into the canyon')
  assert.equal('userChoice' in compacted.segments[1], false)
})

// --- The loading-view echo contract --------------------------------------------------------
//
// The fix for "my action disappears while the next beat loads": the controller records the typed
// action and commits THAT state to React BEFORE awaiting the generation, so the screens can echo
// the move back instead of going blank. These pin, at the pure layer, that the action is readable
// exactly where each screen looks for it — the checkpoint loading view on the LATEST segment, the
// outcome page on the segment that PRECEDES the outcome — for both the first and later checkpoints.

test('the typed action is on the latest segment while the outcome is still loading (first checkpoint)', () => {
  // First checkpoint of the story: a single opening beat awaiting the first action.
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  session = appendSegment(session, { text: 'The opening beat sets the scene.', now: ISO })

  // (controller: submitCheckpointChoice records the choice, then commits THIS pending state and
  //  awaits ai.continueStory — the outcome beat is NOT appended yet.)
  const pending = setLatestSegmentChoice(session, 'I take a look at my surroundings', LATER)

  // The checkpoint loading view echoes the latest segment's userChoice; it must already hold it.
  assert.equal(pending.segments[pending.segments.length - 1].userChoice, 'I take a look at my surroundings')
  assert.equal(pending.segments.length, 1) // still only the checkpoint beat — no outcome yet
  assert.equal('currentQuestion' in pending, false)
})

test('a later checkpoint exposes the freshly typed action on its OWN beat while loading', () => {
  // A subsequent checkpoint: [opening(choice), outcome, checkpoint-beat]. The new action must land
  // on the NEW (latest) checkpoint beat, so the loading echo shows the current move, not a stale one.
  let session = awaitingOutcome() // [opening(choice), outcome]
  session = appendSegment(session, { text: 'Chapter two opens on a derelict station.', now: ISO })
  const pending = setLatestSegmentChoice(session, 'Board the station', LATER)

  assert.equal(pending.segments[pending.segments.length - 1].userChoice, 'Board the station')
  // The earlier opening beat keeps ITS own original choice (the new one did not overwrite it).
  assert.equal(pending.segments[0].userChoice, 'Chart a path through the clouds')
})

test('the outcome page can read the action from the beat preceding the outcome', () => {
  // `awaitingOutcome()` is exactly what StoryOutcomeScreen renders: [checkpoint-beat(choice), outcome].
  // The screen echoes segments[length - 2].userChoice, which must equal the typed action; the
  // outcome beat itself carries no choice. This holds while continueFromOutcome loads the next
  // question, too (the same outcome state stays mounted).
  const session = awaitingOutcome()
  const outcomeIndex = session.segments.length - 1
  assert.equal('userChoice' in session.segments[outcomeIndex], false)
  assert.equal(session.segments[outcomeIndex - 1].userChoice, 'Chart a path through the clouds')
})
