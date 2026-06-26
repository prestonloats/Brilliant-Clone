import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StorySession, StoryTheme, ThemedQuestion } from '../src/domain'
import type { StoryReviewPos } from '../src/story/storySessionReducer'
import {
  CHECKPOINT_INTERVAL,
  canReviewStepBack,
  canReviewStepForward,
  chapterBeatFor,
  chapterForIndex,
  createInitialSession,
  hasChapterText,
  isLiveReviewPos,
  liveReviewPos,
  recordChapterBeat,
  recordChapterOutcome,
  reviewChapterStart,
  reviewStepBack,
  reviewStepForward,
  setCurrentQuestion,
  withHistoryIndex,
} from '../src/story/storySessionReducer'

// These tests pin the PURE chapter-review core: persisting each chapter's opening narrative
// (`recordChapterBeat`) so it survives `segments` compaction, and the interleaved review model
// that lets Back reach "[chapter text] then that chapter's questions". Everything here is a pure
// view/transition over the existing `history` plus the new `chapterBeats`, so it is unit-testable
// without a DOM. Mirrors `story-history.test.ts` fixtures/conventions.

const ISO = '2026-06-25T00:00:00.000Z'

const theme = (): StoryTheme => ({
  interestIds: ['space'],
  premise: 'A lone navigator charts a living nebula.',
  protagonist: 'Captain Vega',
})

const question = (stepId: string): ThemedQuestion => ({
  sourceLessonId: 'balancing-equations',
  sourceStepId: stepId,
  stepType: 'input',
  themedPrompt: `Puzzle ${stepId}`,
  themed: true,
  generatedAt: ISO,
})

// Serve `count` questions (q0..q{count-1}), leaving the session at the live edge.
const manyQuestionSession = (count: number): StorySession => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  for (let i = 0; i < count; i += 1) session = setCurrentQuestion(session, question(`q${i}`), ISO)
  return session
}

// --- recordChapterBeat / chapterBeatFor / hasChapterText ------------------------------------

test('recordChapterBeat captures chapter 1 at session start (questionsSolvedTotal 0)', () => {
  const session = recordChapterBeat(createInitialSession(theme(), 'user-1', ISO, 'story-1'), {
    text: 'Our hero sets out.',
  })
  assert.deepEqual(session.chapterBeats, [{ chapter: 1, text: 'Our hero sets out.' }])
  // No sceneId provided -> the key is OMITTED (Firestore rejects undefined), like segments.
  assert.equal('sceneId' in (session.chapterBeats?.[0] ?? {}), false)
})

test('recordChapterBeat derives the chapter from questionsSolvedTotal (5 -> chapter 2)', () => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  session = recordChapterBeat(session, { text: 'Ch1 opening' }) // qst 0 -> chapter 1
  session = recordChapterBeat(
    { ...session, questionsSolvedTotal: CHECKPOINT_INTERVAL }, // qst 5 -> chapter 2
    { text: 'Ch2 bridge', sceneId: 'outer-space' },
  )
  assert.deepEqual(session.chapterBeats, [
    { chapter: 1, text: 'Ch1 opening' },
    { chapter: 2, text: 'Ch2 bridge', sceneId: 'outer-space' },
  ])
})

test('recordChapterBeat is an idempotent upsert that stays ascending by chapter', () => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  // Record chapter 2 first, then chapter 1 -> the result is still sorted ascending by chapter.
  session = recordChapterBeat({ ...session, questionsSolvedTotal: CHECKPOINT_INTERVAL }, { text: 'Ch2 v1' })
  session = recordChapterBeat({ ...session, questionsSolvedTotal: 0 }, { text: 'Ch1 v1' })
  assert.deepEqual(session.chapterBeats?.map((beat) => beat.chapter), [1, 2])

  // Re-recording chapter 1 REPLACES the existing entry in place (no duplicate).
  session = recordChapterBeat({ ...session, questionsSolvedTotal: 0 }, { text: 'Ch1 v2' })
  assert.equal(session.chapterBeats?.length, 2)
  assert.deepEqual(chapterBeatFor(session, 1), { chapter: 1, text: 'Ch1 v2' })
  assert.deepEqual(session.chapterBeats?.map((beat) => beat.chapter), [1, 2])
})

test('recordChapterBeat does not change updatedAt and does not mutate the input session', () => {
  const session = recordChapterBeat(manyQuestionSession(6), { text: 'Ch1' })
  assert.equal(recordChapterBeat(session, { text: 'again' }).updatedAt, session.updatedAt)

  const snapshot = JSON.parse(JSON.stringify(session))
  recordChapterBeat(session, { text: 'replacement', sceneId: 'outer-space' })
  assert.deepEqual(JSON.parse(JSON.stringify(session)), snapshot)
})

test('chapterBeatFor and hasChapterText find recorded chapters and report missing ones', () => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  session = recordChapterBeat(session, { text: 'Ch1' }) // chapter 1

  assert.deepEqual(chapterBeatFor(session, 1), { chapter: 1, text: 'Ch1' })
  assert.equal(hasChapterText(session, 1), true)
  assert.equal(chapterBeatFor(session, 2), null)
  assert.equal(hasChapterText(session, 2), false)

  // A session that never recorded any beats reports nothing for chapter 1.
  const fresh = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  assert.equal(chapterBeatFor(fresh, 1), null)
  assert.equal(hasChapterText(fresh, 1), false)
})

// --- recordChapterOutcome (folds the choice + "what happened next" into the chapter beat) ----

test('recordChapterOutcome folds the choice + outcome into the current chapter beat, keeping setup', () => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  // The live flow records the setup first, then the choice + outcome at the same checkpoint.
  session = recordChapterBeat(session, { text: 'Ch1 opening', sceneId: 'outer-space' })
  session = recordChapterOutcome(session, {
    userChoice: 'Sneak past the guard',
    outcomeText: 'You slip by unseen.',
    outcomeSceneId: 'pirate-cove',
  })
  assert.deepEqual(chapterBeatFor(session, 1), {
    chapter: 1,
    text: 'Ch1 opening', // setup text preserved
    sceneId: 'outer-space', // setup scene preserved
    userChoice: 'Sneak past the guard',
    outcomeText: 'You slip by unseen.',
    outcomeSceneId: 'pirate-cove',
  })
})

test('recordChapterOutcome targets the chapter from questionsSolvedTotal and omits absent fields', () => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  session = recordChapterBeat({ ...session, questionsSolvedTotal: CHECKPOINT_INTERVAL }, { text: 'Ch2 bridge' }) // chapter 2
  session = recordChapterOutcome(
    { ...session, questionsSolvedTotal: CHECKPOINT_INTERVAL },
    { userChoice: 'Open the hatch', outcomeText: 'It creaks open.' }, // no outcome scene
  )
  assert.deepEqual(chapterBeatFor(session, 2), {
    chapter: 2,
    text: 'Ch2 bridge',
    userChoice: 'Open the hatch',
    outcomeText: 'It creaks open.',
  })
  assert.equal('outcomeSceneId' in (chapterBeatFor(session, 2) ?? {}), false)
})

test('recordChapterOutcome does not change updatedAt and does not mutate the input session', () => {
  const session = recordChapterBeat(manyQuestionSession(6), { text: 'Ch1' })
  assert.equal(recordChapterOutcome(session, { userChoice: 'a', outcomeText: 'b' }).updatedAt, session.updatedAt)

  const snapshot = JSON.parse(JSON.stringify(session))
  recordChapterOutcome(session, { userChoice: 'x', outcomeText: 'y', outcomeSceneId: 'outer-space' })
  assert.deepEqual(JSON.parse(JSON.stringify(session)), snapshot)
})

// --- Interleaved review navigation ----------------------------------------------------------

// A 12-question session (q0..q11 -> chapters 1, 2, 3) with chapter beats recorded for chapters 1
// and 2 (NOT chapter 3), so Back reaches "[chapter text] then that chapter's questions".
const interleavedSession = (): StorySession => {
  let session = manyQuestionSession(12)
  session = recordChapterBeat(session, { text: 'Chapter 1 opens' }) // qst 0 -> chapter 1
  session = recordChapterBeat(
    { ...session, questionsSolvedTotal: CHECKPOINT_INTERVAL }, // qst 5 -> chapter 2
    { text: 'Chapter 2 bridge' },
  )
  return session
}

// A short label for a review position: the chapter-text marker or the served question's step id.
const posLabel = (session: StorySession, pos: StoryReviewPos): string =>
  pos.chapterText
    ? `ch${chapterForIndex(pos.index)}-text`
    : session.history[pos.index]?.sourceStepId ?? `?@${pos.index}`

// Walk Back from the live edge until Back is a no-op, collecting every visited position.
const walkBack = (session: StorySession): StoryReviewPos[] => {
  const positions = [liveReviewPos(session)]
  while (canReviewStepBack(session, positions[positions.length - 1])) {
    positions.push(reviewStepBack(session, positions[positions.length - 1]))
  }
  return positions
}

// Walk Forward from `start` until Forward is a no-op, collecting every visited position.
const walkForward = (session: StorySession, start: StoryReviewPos): StoryReviewPos[] => {
  const positions = [start]
  while (canReviewStepForward(session, positions[positions.length - 1])) {
    positions.push(reviewStepForward(session, positions[positions.length - 1]))
  }
  return positions
}

test('liveReviewPos points at the live question (last history index, never chapter text)', () => {
  assert.deepEqual(liveReviewPos(manyQuestionSession(12)), { index: 11, chapterText: false })
  // Empty session clamps the index to 0.
  assert.deepEqual(liveReviewPos(createInitialSession(theme(), 'user-1', ISO, 'story-1')), {
    index: 0,
    chapterText: false,
  })
})

test('Back interleaves each chapter text with that chapter\'s questions; Forward returns to live', () => {
  const session = interleavedSession()

  const back = walkBack(session)
  assert.deepEqual(back.map((pos) => posLabel(session, pos)), [
    'q11', 'q10', 'q9', 'q8', 'q7', 'q6', 'q5', // chapter 3 (no text) + chapter 2 questions
    'ch2-text',
    'q4', 'q3', 'q2', 'q1', 'q0', // chapter 1 questions
    'ch1-text',
  ])

  // Forward from the back-most position walks the EXACT reverse, ending at the live question.
  const backMost = back[back.length - 1]
  const forward = walkForward(session, backMost)
  assert.deepEqual(
    forward.map((pos) => posLabel(session, pos)),
    [...back].reverse().map((pos) => posLabel(session, pos)),
  )

  // No-op (same object reference) at both ends.
  const livePos = liveReviewPos(session)
  assert.equal(reviewStepForward(session, livePos), livePos)
  assert.equal(reviewStepBack(session, backMost), backMost)
  assert.equal(canReviewStepForward(session, livePos), false)
  assert.equal(canReviewStepBack(session, backMost), false)

  // isLiveReviewPos is true ONLY at the live question.
  assert.equal(isLiveReviewPos(session, livePos), true)
  assert.equal(isLiveReviewPos(session, { index: 5, chapterText: true }), false)
  assert.equal(isLiveReviewPos(session, { index: 5, chapterText: false }), false)
  // The latest chapter's first question (index 10) is NOT live (the live edge is index 11).
  assert.equal(isLiveReviewPos(session, { index: 10, chapterText: false }), false)
})

test('with no chapter beats the Back sequence is question-only (today\'s behavior)', () => {
  const session = manyQuestionSession(12) // no chapter beats recorded
  const back = walkBack(session)
  assert.deepEqual(
    back.map((pos) => posLabel(session, pos)),
    ['q11', 'q10', 'q9', 'q8', 'q7', 'q6', 'q5', 'q4', 'q3', 'q2', 'q1', 'q0'],
  )
  // Chapter-text positions are skipped entirely without recorded beats.
  assert.equal(back.every((pos) => !pos.chapterText), true)
  // Forward from the start walks straight back to the live question.
  const forward = walkForward(session, back[back.length - 1])
  assert.deepEqual(forward.map((pos) => posLabel(session, pos)), [...back].reverse().map((pos) => posLabel(session, pos)))
})

test('reviewChapterStart targets the chapter text when present, else its first question (clamped)', () => {
  const session = interleavedSession() // beats for chapters 1 and 2, live edge index 11
  assert.deepEqual(reviewChapterStart(session, 2), { index: 5, chapterText: true })
  assert.deepEqual(reviewChapterStart(session, 1), { index: 0, chapterText: true })
  // Chapter 3 has NO recorded text -> its first question, clamped to the live edge.
  assert.deepEqual(reviewChapterStart(session, 3), { index: 10, chapterText: false })

  const noBeats = manyQuestionSession(12)
  assert.deepEqual(reviewChapterStart(noBeats, 2), { index: 5, chapterText: false })
  // A chapter beyond the live edge clamps its question index to the live edge.
  assert.deepEqual(reviewChapterStart(noBeats, 99), { index: 11, chapterText: false })
})

test('withHistoryIndex clamps into range and leaves updatedAt unchanged', () => {
  const session = { ...manyQuestionSession(6), updatedAt: ISO } // q0..q5, live edge index 5
  assert.equal(withHistoryIndex(session, 3).historyIndex, 3)
  assert.equal(withHistoryIndex(session, -5).historyIndex, 0) // clamp below 0
  assert.equal(withHistoryIndex(session, 99).historyIndex, 5) // clamp to the live edge
  // Reviewing is not "playing" -> the timestamp is untouched.
  assert.equal(withHistoryIndex(session, 3).updatedAt, ISO)
})

test('navigation functions never mutate their inputs', () => {
  const session = interleavedSession()
  const sessionSnapshot = JSON.parse(JSON.stringify(session))
  const pos: StoryReviewPos = { index: 5, chapterText: false }
  const posSnapshot = { ...pos }

  liveReviewPos(session)
  isLiveReviewPos(session, pos)
  reviewStepBack(session, pos)
  reviewStepForward(session, pos)
  canReviewStepBack(session, pos)
  canReviewStepForward(session, pos)
  withHistoryIndex(session, 3)
  reviewChapterStart(session, 2)

  assert.deepEqual(JSON.parse(JSON.stringify(session)), sessionSnapshot)
  assert.deepEqual(pos, posSnapshot)
})
