import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StorySession, StoryTheme, ThemedQuestion } from '../src/domain'
import {
  CHECKPOINT_INTERVAL,
  canReviewBack,
  canReviewBackChapter,
  canReviewForward,
  canReviewForwardChapter,
  chapterForIndex,
  createInitialSession,
  displayedChapter,
  displayedQuestion,
  isAtLiveEdge,
  jumpToLiveEdge,
  latestChapter,
  reviewBack,
  reviewBackChapter,
  reviewForward,
  reviewForwardChapter,
  setCurrentQuestion,
} from '../src/story/storySessionReducer'

// The question back/forward navigation is a pure layer over `historyIndex`, so these tests pin
// every transition: appending live questions, stepping back into read-only review, stepping
// forward toward the live edge, the disabled-at-the-ends behavior, and the invariant that
// reviewing never moves the live question or the timestamp.

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

// Build a session that has served three questions (q0, q1, q2), sitting at the live edge (q2).
const threeQuestionSession = (): StorySession => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  session = setCurrentQuestion(session, question('q0'), ISO)
  session = setCurrentQuestion(session, question('q1'), ISO)
  session = setCurrentQuestion(session, question('q2'), ISO)
  return session
}

test('setCurrentQuestion appends to history and sits at the live edge', () => {
  const session = threeQuestionSession()

  assert.deepEqual(
    session.history.map((entry) => entry.sourceStepId),
    ['q0', 'q1', 'q2'],
  )
  assert.equal(session.historyIndex, 2)
  assert.equal(session.currentQuestion?.sourceStepId, 'q2')
  assert.equal(isAtLiveEdge(session), true)
  assert.equal(canReviewBack(session), true)
  assert.equal(canReviewForward(session), false)
  assert.equal(displayedQuestion(session)?.sourceStepId, 'q2')
})

test('reviewBack steps into read-only review without moving the live question', () => {
  const live = threeQuestionSession()
  const back1 = reviewBack(live)

  assert.equal(back1.historyIndex, 1)
  assert.equal(isAtLiveEdge(back1), false)
  assert.equal(displayedQuestion(back1)?.sourceStepId, 'q1')
  // The live question is untouched while reviewing — only the view pointer moved.
  assert.equal(back1.currentQuestion?.sourceStepId, 'q2')
  assert.equal(canReviewForward(back1), true)

  const back2 = reviewBack(back1)
  assert.equal(back2.historyIndex, 0)
  assert.equal(displayedQuestion(back2)?.sourceStepId, 'q0')
  assert.equal(canReviewBack(back2), false)

  // Back is a no-op at the start (Back disabled) — returns the same object reference.
  assert.equal(reviewBack(back2), back2)
})

test('reviewForward returns toward the live edge and stops there', () => {
  const atStart = reviewBack(reviewBack(threeQuestionSession()))
  assert.equal(atStart.historyIndex, 0)

  const forward1 = reviewForward(atStart)
  assert.equal(forward1.historyIndex, 1)
  assert.equal(displayedQuestion(forward1)?.sourceStepId, 'q1')

  const forward2 = reviewForward(forward1)
  assert.equal(forward2.historyIndex, 2)
  assert.equal(isAtLiveEdge(forward2), true)

  // Forward is a no-op at the live edge (Forward disabled) — same object reference.
  assert.equal(reviewForward(forward2), forward2)
})

test('reviewing never changes updatedAt (it is not "playing")', () => {
  const live = { ...threeQuestionSession(), updatedAt: ISO }
  assert.equal(reviewBack(live).updatedAt, ISO)
  assert.equal(reviewForward(reviewBack(live)).updatedAt, ISO)
  assert.equal(jumpToLiveEdge(reviewBack(live)).updatedAt, ISO)
})

test('jumpToLiveEdge snaps a mid-review pointer back to the newest question', () => {
  const reviewing = reviewBack(reviewBack(threeQuestionSession()))
  assert.equal(reviewing.historyIndex, 0)

  const snapped = jumpToLiveEdge(reviewing)
  assert.equal(snapped.historyIndex, 2)
  assert.equal(isAtLiveEdge(snapped), true)

  // No-op (same reference) when already at the live edge.
  assert.equal(jumpToLiveEdge(snapped), snapped)
})

test('answering at the live edge advances past a reviewed question (no duplicate history)', () => {
  // Review back, then jump to live edge and serve a new question (the controller's flow). The new
  // question appends once; the reviewed entry is not duplicated.
  let session = threeQuestionSession()
  session = reviewBack(session) // pretend the learner peeked back...
  session = jumpToLiveEdge(session) // ...then returned to the live edge to keep playing
  session = setCurrentQuestion(session, question('q3'), ISO)

  assert.deepEqual(
    session.history.map((entry) => entry.sourceStepId),
    ['q0', 'q1', 'q2', 'q3'],
  )
  assert.equal(session.historyIndex, 3)
  assert.equal(session.currentQuestion?.sourceStepId, 'q3')
})

test('an empty session reports the live edge and no navigation', () => {
  const empty = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  assert.equal(isAtLiveEdge(empty), true)
  assert.equal(canReviewBack(empty), false)
  assert.equal(canReviewForward(empty), false)
  assert.equal(displayedQuestion(empty), null)
})

test('navigation transitions never mutate the input session', () => {
  const live = threeQuestionSession()
  const snapshot = JSON.parse(JSON.stringify(live))
  reviewBack(live)
  reviewForward(live)
  jumpToLiveEdge(live)
  assert.deepEqual(JSON.parse(JSON.stringify(live)), snapshot)
})

// --- Chapter-level review navigation --------------------------------------------------------
//
// Chapters are surfaced over the SAME question history: every CHECKPOINT_INTERVAL questions form
// one chapter, so the learner can both see which chapter they are paging through and jump a whole
// chapter at a time with the existing forward/back affordances.

// Serve `count` questions (q0..q{count-1}), leaving the session at the live edge.
const manyQuestionSession = (count: number): StorySession => {
  let session = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  for (let i = 0; i < count; i += 1) session = setCurrentQuestion(session, question(`q${i}`), ISO)
  return session
}

test('chapterForIndex groups every CHECKPOINT_INTERVAL questions into one chapter', () => {
  assert.equal(CHECKPOINT_INTERVAL, 5)
  assert.equal(chapterForIndex(0), 1)
  assert.equal(chapterForIndex(4), 1)
  assert.equal(chapterForIndex(5), 2)
  assert.equal(chapterForIndex(9), 2)
  assert.equal(chapterForIndex(10), 3)
})

test('displayedChapter / latestChapter surface the on-screen chapter as you page', () => {
  const session = manyQuestionSession(12) // q0..q11 -> chapters 1, 2, and 3 (3 questions into ch3)
  assert.equal(displayedChapter(session), 3) // live edge is in chapter 3
  assert.equal(latestChapter(session), 3)
  // Paging back into earlier questions surfaces THEIR chapter, not just the latest.
  assert.equal(displayedChapter({ ...session, historyIndex: 4 }), 1)
  assert.equal(displayedChapter({ ...session, historyIndex: 5 }), 2)
})

test('forward/back chapter jumps move the pointer to chapter starts across chapter boundaries', () => {
  const live = manyQuestionSession(12) // index 11, chapter 3 (the latest)
  assert.equal(canReviewForwardChapter(live), false) // nothing newer than the latest chapter
  assert.equal(canReviewBackChapter(live), true)

  const toCh2 = reviewBackChapter(live)
  assert.equal(toCh2.historyIndex, 5) // start of chapter 2
  assert.equal(displayedChapter(toCh2), 2)

  const toCh1 = reviewBackChapter(toCh2)
  assert.equal(toCh1.historyIndex, 0) // start of chapter 1
  assert.equal(canReviewBackChapter(toCh1), false)
  assert.equal(reviewBackChapter(toCh1), toCh1) // no-op at the first chapter (same reference)

  // ...and forward again, chapter by chapter, back toward the live edge.
  const fwdCh2 = reviewForwardChapter(toCh1)
  assert.equal(fwdCh2.historyIndex, 5)
  const fwdCh3 = reviewForwardChapter(fwdCh2)
  assert.equal(fwdCh3.historyIndex, 10) // start of chapter 3
  assert.equal(displayedChapter(fwdCh3), 3)
})

test('forward chapter jump is a no-op once in the latest chapter (reviewing never duplicates)', () => {
  const live = manyQuestionSession(12) // index 11 (chapter 3 = latest)
  assert.equal(reviewForwardChapter(live), live) // same reference, nothing newer
  // The pointer-only jump must not move the live question or the timestamp.
  const reviewing = { ...manyQuestionSession(12), updatedAt: ISO }
  assert.equal(reviewBackChapter(reviewing).updatedAt, ISO)
  assert.equal(reviewBackChapter(reviewing).currentQuestion?.sourceStepId, 'q11')
})

test('a single-chapter session exposes no chapter navigation', () => {
  const oneChapter = manyQuestionSession(3) // q0..q2, all chapter 1
  assert.equal(latestChapter(oneChapter), 1)
  assert.equal(canReviewBackChapter(oneChapter), false)
  assert.equal(canReviewForwardChapter(oneChapter), false)
})

test('chapter navigation never mutates the input session', () => {
  const live = manyQuestionSession(12)
  const snapshot = JSON.parse(JSON.stringify(live))
  reviewBackChapter(live)
  reviewForwardChapter({ ...live, historyIndex: 0 })
  assert.deepEqual(JSON.parse(JSON.stringify(live)), snapshot)
})
