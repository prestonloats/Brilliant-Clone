import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StorySession, StoryTheme, ThemedQuestion } from '../src/domain'
import {
  CHECKPOINT_INTERVAL,
  canReviewBackChapter,
  canReviewForwardChapter,
  chapterForIndex,
  createInitialSession,
  displayedChapter,
  displayedQuestion,
  isAtLiveEdge,
  jumpToLiveEdge,
  latestChapter,
  setCurrentQuestion,
  withHistoryIndex,
} from '../src/story/storySessionReducer'

// The question history is a pure layer over `history`/`historyIndex`. These tests pin the view
// helpers the screens rely on: appending live questions, what is on display while reviewing (the
// pointer is moved with `withHistoryIndex`), snapping back to the live edge, and the chapter-level
// view (current chapter + whether an earlier/later chapter exists to page to). Reviewing must never
// move the live question or the timestamp.

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

test('setCurrentQuestion appends to history and sits at the live edge', () => {
  const session = manyQuestionSession(3)

  assert.deepEqual(
    session.history.map((entry) => entry.sourceStepId),
    ['q0', 'q1', 'q2'],
  )
  assert.equal(session.historyIndex, 2)
  assert.equal(session.currentQuestion?.sourceStepId, 'q2')
  assert.equal(isAtLiveEdge(session), true)
  assert.equal(displayedQuestion(session)?.sourceStepId, 'q2')
})

test('displayedQuestion follows the review pointer without moving the live question', () => {
  const live = manyQuestionSession(3)

  const reviewing = withHistoryIndex(live, 1)
  assert.equal(reviewing.historyIndex, 1)
  assert.equal(isAtLiveEdge(reviewing), false)
  assert.equal(displayedQuestion(reviewing)?.sourceStepId, 'q1')
  // The live question is untouched while reviewing — only the view pointer moved.
  assert.equal(reviewing.currentQuestion?.sourceStepId, 'q2')

  const atStart = withHistoryIndex(live, 0)
  assert.equal(displayedQuestion(atStart)?.sourceStepId, 'q0')
  assert.equal(isAtLiveEdge(atStart), false)
})

test('an empty session reports the live edge and no displayed question', () => {
  const empty = createInitialSession(theme(), 'user-1', ISO, 'story-1')
  assert.equal(isAtLiveEdge(empty), true)
  assert.equal(displayedQuestion(empty), null)
})

test('jumpToLiveEdge snaps a mid-review pointer back to the newest question', () => {
  const reviewing = withHistoryIndex(manyQuestionSession(3), 0)
  assert.equal(reviewing.historyIndex, 0)

  const snapped = jumpToLiveEdge(reviewing)
  assert.equal(snapped.historyIndex, 2)
  assert.equal(isAtLiveEdge(snapped), true)

  // No-op (same reference) when already at the live edge.
  assert.equal(jumpToLiveEdge(snapped), snapped)
})

test('reviewing never changes updatedAt (it is not "playing")', () => {
  const live = { ...manyQuestionSession(3), updatedAt: ISO }
  assert.equal(withHistoryIndex(live, 0).updatedAt, ISO)
  assert.equal(jumpToLiveEdge(withHistoryIndex(live, 0)).updatedAt, ISO)
})

test('answering at the live edge advances past a reviewed question (no duplicate history)', () => {
  // Peek back, return to the live edge, then serve a new question (the controller's flow). The new
  // question appends once; the reviewed entry is not duplicated.
  let session = manyQuestionSession(3)
  session = withHistoryIndex(session, 0) // pretend the learner peeked back...
  session = jumpToLiveEdge(session) // ...then returned to the live edge to keep playing
  session = setCurrentQuestion(session, question('q3'), ISO)

  assert.deepEqual(
    session.history.map((entry) => entry.sourceStepId),
    ['q0', 'q1', 'q2', 'q3'],
  )
  assert.equal(session.historyIndex, 3)
  assert.equal(session.currentQuestion?.sourceStepId, 'q3')
})

// --- Chapter-level view ---------------------------------------------------------------------
//
// Chapters are surfaced over the SAME question history: every CHECKPOINT_INTERVAL questions form
// one chapter, so the learner can see which chapter they are paging through and whether an
// earlier/later chapter exists to jump to.

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
  assert.equal(displayedChapter(withHistoryIndex(session, 4)), 1)
  assert.equal(displayedChapter(withHistoryIndex(session, 5)), 2)
})

test('canReviewBackChapter / canReviewForwardChapter gate paging across chapter boundaries', () => {
  const live = manyQuestionSession(12) // index 11, chapter 3 (the latest)
  assert.equal(canReviewForwardChapter(live), false) // nothing newer than the latest chapter
  assert.equal(canReviewBackChapter(live), true)

  const atCh2 = withHistoryIndex(live, 5) // start of chapter 2
  assert.equal(displayedChapter(atCh2), 2)
  assert.equal(canReviewBackChapter(atCh2), true)
  assert.equal(canReviewForwardChapter(atCh2), true)

  const atCh1 = withHistoryIndex(live, 0) // start of chapter 1
  assert.equal(displayedChapter(atCh1), 1)
  assert.equal(canReviewBackChapter(atCh1), false) // nothing before the first chapter
  assert.equal(canReviewForwardChapter(atCh1), true)
})

test('a single-chapter session exposes no chapter navigation', () => {
  const oneChapter = manyQuestionSession(3) // q0..q2, all chapter 1
  assert.equal(latestChapter(oneChapter), 1)
  assert.equal(canReviewBackChapter(oneChapter), false)
  assert.equal(canReviewForwardChapter(oneChapter), false)
})
