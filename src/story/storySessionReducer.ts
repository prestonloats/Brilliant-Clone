// Pure Story Mode session state transitions (plan section 6.3).
//
// This module is intentionally React-free and side-effect-free: every function takes a
// `StorySession` and returns a NEW one, never mutating its input. It owns the whole
// endless-loop bookkeeping — counters, the checkpoint cadence, the capped anti-repeat memory,
// segment numbering, and the rolling-summary compaction — so the logic can be unit-tested under
// `node --test` (the repo has no DOM/React test harness). `useStorySession` is the thin React
// wrapper that wires these transitions to the backend, the selector, and the StoryAI adapter.

import type { ChapterBeat, ChapterPerformance, PerformanceBand, SceneId, StorySession, StoryTheme, ThemedQuestion } from '../domain'

// A checkpoint fires after this many solved questions (every 5).
export const CHECKPOINT_INTERVAL = 5

// Anti-repeat memory is bounded so it never grows without limit as the loop runs forever.
export const SERVED_STEP_IDS_CAP = 200

// How many of the most recent narrative beats stay verbatim in the prompt context (older ones fold
// into the rolling summary). Both the prompt context and `maybeCompact` use this, so it lives here
// as the single source of truth for the session's narrative window.
export const KEEP_VERBATIM_SEGMENTS = 2

// Upper bound on the persisted hidden story bible (plan). It is re-fed into every narrative-beat
// prompt, so it must stay bounded for both storage and prompt cost; the plan targets ~250-450 words
// (a few thousand chars), and this leaves generous headroom while capping pathological growth. The
// cap is enforced here (so the in-memory + persisted value is always bounded) AND again on untrusted
// read in `normalizeStorySession`, which imports this same constant as the single source of truth.
export const STORY_BIBLE_MAX_LENGTH = 6000

const nowIso = (): string => new Date().toISOString()

// A unique, URL/Firestore-safe session id. Mirrors backend `createId` but lives here so the
// pure reducer (and tests) can mint ids without importing the backend layer. Injectable via
// `createInitialSession`'s `id` param for deterministic tests.
export function createStorySessionId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `story-${cryptoApi.randomUUID()}`
  }
  return `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Keep only the most recent `cap` keys, dropping the oldest from the front.
const capServed = (servedStepIds: string[], cap: number = SERVED_STEP_IDS_CAP): string[] =>
  servedStepIds.length > cap ? servedStepIds.slice(servedStepIds.length - cap) : servedStepIds

// A fresh, empty, active session for a brand-new adventure. `id` defaults to a freshly minted
// one; tests/controllers may pass an explicit id for determinism / pre-allocation.
export function createInitialSession(
  theme: StoryTheme,
  userId: string,
  now: string = nowIso(),
  id: string = createStorySessionId(),
): StorySession {
  return {
    id,
    userId,
    theme,
    status: 'active',
    questionsSolvedTotal: 0,
    questionsSinceCheckpoint: 0,
    history: [],
    historyIndex: 0,
    servedStepIds: [],
    segments: [],
    narrativeSummary: '',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 2,
  }
}

// One correctly-answered question: bump both counters and remember the served step key
// (capped). The caller passes the `${lessonId}:${stepId}` key (storyCandidateKey).
export function recordSolved(session: StorySession, servedKey: string, now: string = nowIso()): StorySession {
  return {
    ...session,
    questionsSolvedTotal: session.questionsSolvedTotal + 1,
    questionsSinceCheckpoint: session.questionsSinceCheckpoint + 1,
    servedStepIds: capServed([...session.servedStepIds, servedKey]),
    updatedAt: now,
  }
}

// A checkpoint is due once the learner has solved a full interval since the last one.
export function isCheckpointDue(session: StorySession): boolean {
  return session.questionsSinceCheckpoint >= CHECKPOINT_INTERVAL
}

// Start the next chapter's countdown (the lifetime total is intentionally untouched). Also clears
// the per-chapter first-try tally — capture it with `captureChapterPerformance` BEFORE calling this.
export function resetCheckpoint(session: StorySession, now: string = nowIso()): StorySession {
  const next = { ...session, questionsSinceCheckpoint: 0, updatedAt: now }
  delete next.chapterScore
  return next
}

// Record one FIRST-TRY result into the current chapter's running tally. The caller
// (recordPracticeAttempt) dedupes per question and only records at the live edge, so each chapter
// question counts exactly once. Pure.
export function recordChapterAttempt(session: StorySession, firstTryCorrect: boolean, now: string = nowIso()): StorySession {
  const prev = session.chapterScore ?? { firstTryCorrect: 0, answered: 0 }
  return {
    ...session,
    chapterScore: {
      firstTryCorrect: prev.firstTryCorrect + (firstTryCorrect ? 1 : 0),
      answered: prev.answered + 1,
    },
    updatedAt: now,
  }
}

// Classify a chapter's first-try tally into a narrative band. Ratio-based (not a fixed count) so it
// degrades gracefully when a chapter ends with fewer than CHECKPOINT_INTERVAL answered. With the
// default 5-question chapter this yields: 5 -> flawless, 4 -> strong, 2-3 -> mixed, 0-1 -> struggled.
export function chapterPerformanceBand(firstTryCorrect: number, answered: number): PerformanceBand {
  if (answered <= 0) return 'mixed'
  if (firstTryCorrect >= answered) return 'flawless'
  const ratio = firstTryCorrect / answered
  if (ratio >= 0.8) return 'strong'
  if (ratio >= 0.4) return 'mixed'
  return 'struggled'
}

// Snapshot the just-completed chapter's performance into `lastChapterPerformance`, derived from the
// running tally. Call at the checkpoint BEFORE `resetCheckpoint` clears the tally. With no recorded
// attempts (legacy/empty) it yields a neutral 'mixed' band.
export function captureChapterPerformance(session: StorySession, now: string = nowIso()): StorySession {
  const score = session.chapterScore ?? { firstTryCorrect: 0, answered: 0 }
  const performance: ChapterPerformance = {
    band: chapterPerformanceBand(score.firstTryCorrect, score.answered),
    firstTryCorrect: score.firstTryCorrect,
    answered: score.answered,
  }
  return { ...session, lastChapterPerformance: performance, updatedAt: now }
}

// Append a narrative beat, numbering it after the existing segments. An optional `sceneId` (a
// matched background image) is included ONLY when present, so a beat with no image serializes
// exactly as before (no `undefined` field, which Firestore rejects).
export function appendSegment(
  session: StorySession,
  params: { text: string; userChoice?: string; sceneId?: SceneId; now?: string },
): StorySession {
  const now = params.now ?? nowIso()
  const segment = {
    index: session.segments.length,
    text: params.text,
    ...(params.userChoice ? { userChoice: params.userChoice } : {}),
    ...(params.sceneId ? { sceneId: params.sceneId } : {}),
    createdAt: now,
  }
  return { ...session, segments: [...session.segments, segment], updatedAt: now }
}

// Record what the learner typed at the checkpoint that followed the latest beat. A no-op (safe)
// when there are no segments yet, so the loop never throws.
export function setLatestSegmentChoice(session: StorySession, userChoice: string, now: string = nowIso()): StorySession {
  if (session.segments.length === 0) return session
  const lastIndex = session.segments.length - 1
  const segments = session.segments.map((segment, index) =>
    index === lastIndex ? { ...segment, userChoice } : segment,
  )
  return { ...session, segments, updatedAt: now }
}

// True when the learner has submitted their checkpoint action and the OUTCOME beat (the
// continuation describing the result of that action) has been appended, but they have not yet
// acknowledged it to resume questions. Derived purely from the segment shape so a refresh can
// land back on the outcome page without a dedicated persisted flag:
//   - no live question is staged yet (the next question is only set once they continue), AND
//   - the LATEST beat is the just-generated OUTCOME, which never carries a userChoice of its
//     own, while the beat right BEFORE it carries the userChoice the learner just typed.
// At a genuine checkpoint the latest beat instead has no choice AND the beat before it is the
// previous cycle's outcome (also no choice), so this returns false there; the opening (a single
// segment) is likewise false. The choice is always recorded on the beat that PRECEDES the
// action, so this two-segment signature is unique to the "outcome awaiting acknowledgement" state.
export function isAwaitingOutcomeAck(session: StorySession): boolean {
  if (session.currentQuestion) return false
  const count = session.segments.length
  if (count < 2) return false
  const last = session.segments[count - 1]
  const previous = session.segments[count - 2]
  return !last.userChoice && Boolean(previous.userChoice)
}

// Fold older beats into the rolling summary and keep only the last `keepLastSegments` verbatim,
// re-indexing the survivors so future appends keep numbering contiguously (plan section 8).
export function compactNarrative(
  session: StorySession,
  params: { summary: string; keepLastSegments?: number; now?: string },
): StorySession {
  const now = params.now ?? nowIso()
  const keep = Math.max(0, params.keepLastSegments ?? 2)
  const kept = session.segments.slice(session.segments.length - keep)
  const segments = kept.map((segment, index) => ({ ...segment, index }))
  return { ...session, narrativeSummary: params.summary, segments, updatedAt: now }
}

// --- Narrative context for the AI prompts (pure, derived from the session) -------------------
//
// The single source of "STORY SO FAR" so every beat/question is themed against the SAME up-to-date
// state. Kept here (pure) rather than in the controller so the exact continuity each prompt
// receives is unit-testable.

// The running narrative for the prose/segment/continue prompts: the rolling summary, then the last
// KEEP_VERBATIM_SEGMENTS beats, each followed by the EXACT choice the reader typed after it so the
// learner's own words (not just a paraphrase) carry forward into later beats.
export function recentNarrative(session: StorySession): string {
  const tail = session.segments.slice(-KEEP_VERBATIM_SEGMENTS)
  const parts: string[] = [session.narrativeSummary]
  for (const segment of tail) {
    if (segment.text) parts.push(segment.text)
    if (segment.userChoice) parts.push(`The reader chose to: "${segment.userChoice}"`)
  }
  return parts.filter(Boolean).join('\n\n')
}

// The continuity context for a QUESTION re-theme: the running narrative PLUS the scene of the
// PREVIOUS themed question, so consecutive questions chain into ONE storyline instead of each
// re-improvising its own scene (the root cause of "different options in different questions").
// Within a chapter `currentQuestion` is the question just shown, so the next one continues from it;
// at a checkpoint boundary `currentQuestion` is cleared, so the first question of the new chapter
// chains from the committed choice + outcome already present in `recentNarrative`.
export function rethemeNarrative(session: StorySession): string {
  const base = recentNarrative(session)
  const previous = session.currentQuestion?.themed ? session.currentQuestion.themedPrompt.trim() : ''
  if (!previous) return base
  const previousLine = `THE PREVIOUS CHALLENGE in this same storyline (pick up the SAME scene and move one step forward — do NOT restart, jump to an unrelated place, or reuse its puzzle or numbers): ${previous}`
  return [base, previousLine].filter(Boolean).join('\n\n')
}

// Put a NEW live question on screen: it becomes `currentQuestion`, is appended to the question
// history, and the view pointer jumps to that fresh live edge. This is the single entry point
// for new questions, so `history` is exactly the ordered list of questions served.
export function setCurrentQuestion(session: StorySession, currentQuestion: ThemedQuestion, now: string = nowIso()): StorySession {
  const history = [...session.history, currentQuestion]
  return {
    ...session,
    currentQuestion,
    history,
    historyIndex: history.length - 1,
    updatedAt: now,
  }
}

// --- Back / forward review navigation -------------------------------------------------------
//
// The learner can step BACK through already-answered questions (read-only review) and FORWARD
// toward the live edge. These transitions ONLY move the view pointer (`historyIndex`); they
// never touch counters, segments, or `currentQuestion`, so reviewing can never double-count a
// solve or re-fire a checkpoint. `updatedAt` is intentionally left unchanged — reviewing is not
// "playing", so it must not reorder the most-recently-played library.

// At the live edge when the pointer is at (or past) the last served question, or there is no
// history yet. Answering is only allowed here.
export function isAtLiveEdge(session: StorySession): boolean {
  return session.history.length === 0 || session.historyIndex >= session.history.length - 1
}

// Snap the view pointer back to the live edge (used on resume so the learner continues playing
// rather than resuming mid-review).
export function jumpToLiveEdge(session: StorySession): StorySession {
  const liveIndex = Math.max(0, session.history.length - 1)
  if (session.historyIndex === liveIndex) return session
  return { ...session, historyIndex: liveIndex }
}

// The question currently on display: the reviewed history entry, or the live question. Falls
// back to `currentQuestion` for (legacy) sessions that have no history yet.
export function displayedQuestion(session: StorySession): ThemedQuestion | null {
  if (session.history.length === 0) return session.currentQuestion ?? null
  const index = Math.min(Math.max(session.historyIndex, 0), session.history.length - 1)
  return session.history[index] ?? null
}

// --- Chapter-level review navigation --------------------------------------------------------
//
// A "chapter" is the run of CHECKPOINT_INTERVAL questions between checkpoints: a chapter's worth of
// questions is served, then a checkpoint beat fires and the next chapter begins. So the Nth served
// question (history index i) belongs to chapter `floor(i / CHECKPOINT_INTERVAL) + 1`, which is the
// SAME number the screens already show (`floor(questionsSolvedTotal / CHECKPOINT_INTERVAL) + 1`).
// Everything here is a PURE view over the existing `history`/`historyIndex` — no new persisted
// state — so the same back/forward review pointer can also surface the current chapter and step a
// whole chapter at a time, letting the learner page through chapters, not just single questions.

// The 1-based chapter a given history index falls in.
export function chapterForIndex(index: number): number {
  return Math.floor(Math.max(0, index) / CHECKPOINT_INTERVAL) + 1
}

// The first history index of a 1-based chapter (chapter 1 starts at index 0).
const firstIndexOfChapter = (chapter: number): number => Math.max(0, (chapter - 1) * CHECKPOINT_INTERVAL)

// The chapter of the question currently on display (1 for an empty / at-start session).
export function displayedChapter(session: StorySession): number {
  return chapterForIndex(session.historyIndex)
}

// The highest chapter reached so far (the live edge's chapter); 1 before any question is served.
export function latestChapter(session: StorySession): number {
  return chapterForIndex(Math.max(0, session.history.length - 1))
}

// An earlier chapter exists to jump back to.
export function canReviewBackChapter(session: StorySession): boolean {
  return displayedChapter(session) > 1
}

// A later chapter exists to jump forward to (we are reviewing a chapter before the latest).
export function canReviewForwardChapter(session: StorySession): boolean {
  return displayedChapter(session) < latestChapter(session)
}

// --- Persisted chapter text + interleaved chapter/question review ----------------------------
//
// Each chapter's OPENING narrative beat is snapshotted into `chapterBeats` when the chapter begins,
// so the prose that opened a chapter survives `segments` compaction and stays reviewable. On top of
// that snapshot a pure INTERLEAVED review model lets Back reach "[chapter text] then that chapter's
// questions": a review position (`StoryReviewPos`) is EITHER a chapter's text OR a question at a
// history index, and stepping Back/Forward walks the merged sequence. Like the pointer-only review
// above, nothing here mutates the session and nothing touches `updatedAt`.

// The 1-based chapter the CURRENT capture moment opens. Derived from questionsSolvedTotal (NOT
// segment count): a beat is captured at session start (0 -> chapter 1) and right after each
// checkpoint bridge (a multiple of CHECKPOINT_INTERVAL, e.g. 5 -> chapter 2), which is exactly
// chapterForIndex(firstIndexOfChapter(chapter)).
const captureChapter = (session: StorySession): number => chapterForIndex(session.questionsSolvedTotal)

// Capture/replace the current chapter's opening narrative. Idempotent UPSERT keyed by chapter:
// replaces any existing entry for that chapter and keeps `chapterBeats` sorted ascending by
// `chapter`. `sceneId` is included ONLY when provided. Does NOT change `updatedAt` (it is captured
// alongside an `appendSegment` that already set it).
export function recordChapterBeat(session: StorySession, params: { text: string; sceneId?: SceneId }): StorySession {
  const chapter = captureChapter(session)
  const beat: ChapterBeat = {
    chapter,
    text: params.text,
    ...(params.sceneId ? { sceneId: params.sceneId } : {}),
  }
  const others = (session.chapterBeats ?? []).filter((existing) => existing.chapter !== chapter)
  const chapterBeats = [...others, beat].sort((a, b) => a.chapter - b.chapter)
  return { ...session, chapterBeats }
}

// Fold the learner's checkpoint CHOICE and its OUTCOME ("what happened next") into the CURRENT
// chapter's beat, KEEPING the setup text/scene already captured by `recordChapterBeat`, so the recap
// can show the full setup -> choice -> outcome. The chapter is derived from questionsSolvedTotal —
// the choice/outcome are committed before any of the new chapter's questions are solved, so it
// matches the setup's chapter. Each field is written only when provided (others preserved). If no
// setup beat exists yet (defensive — never happens in the live flow) one is created with empty text.
// Idempotent UPSERT, kept ascending by chapter; does NOT change updatedAt (mirrors recordChapterBeat).
export function recordChapterOutcome(
  session: StorySession,
  params: { userChoice?: string; outcomeText?: string; outcomeSceneId?: SceneId },
): StorySession {
  const chapter = captureChapter(session)
  const existing = session.chapterBeats?.find((beat) => beat.chapter === chapter)
  const merged: ChapterBeat = {
    ...(existing ?? { chapter, text: '' }),
    ...(params.userChoice ? { userChoice: params.userChoice } : {}),
    ...(params.outcomeText ? { outcomeText: params.outcomeText } : {}),
    ...(params.outcomeSceneId ? { outcomeSceneId: params.outcomeSceneId } : {}),
  }
  const others = (session.chapterBeats ?? []).filter((beat) => beat.chapter !== chapter)
  const chapterBeats = [...others, merged].sort((a, b) => a.chapter - b.chapter)
  return { ...session, chapterBeats }
}

// The persisted opening beat for a 1-based chapter, or null when none was captured.
export function chapterBeatFor(session: StorySession, chapter: number): ChapterBeat | null {
  return session.chapterBeats?.find((beat) => beat.chapter === chapter) ?? null
}

// Whether a chapter has reviewable opening text captured.
export function hasChapterText(session: StorySession, chapter: number): boolean {
  return chapterBeatFor(session, chapter) !== null
}

// A review position is EITHER a chapter's text OR a question at a history index. For chapter-text,
// `index` is firstIndexOfChapter(chapter) so chapterForIndex(index) recovers the chapter.
export type StoryReviewPos = { index: number; chapterText: boolean }

// True only AT the live question (the newest question, not any chapter text).
export function isLiveReviewPos(session: StorySession, pos: StoryReviewPos): boolean {
  const liveIndex = Math.max(0, session.history.length - 1)
  return !pos.chapterText && pos.index >= liveIndex
}

// Step one position BACK through the interleaved [chapter text, that chapter's questions] sequence.
export function reviewStepBack(session: StorySession, pos: StoryReviewPos): StoryReviewPos {
  if (pos.chapterText) {
    // From a chapter's text, Back lands on the PREVIOUS chapter's last question. Chapter-1 text is
    // the very first position, so there it is a no-op.
    if (pos.index === 0) return pos
    return { index: pos.index - 1, chapterText: false }
  }
  const chapter = chapterForIndex(pos.index)
  const first = firstIndexOfChapter(chapter)
  if (pos.index === first) {
    // At a chapter's first question, Back surfaces THAT chapter's text when captured; otherwise it
    // falls straight through to the previous question (or no-ops at the very start).
    if (hasChapterText(session, chapter)) return { index: first, chapterText: true }
    if (pos.index === 0) return pos
    return { index: pos.index - 1, chapterText: false }
  }
  return { index: pos.index - 1, chapterText: false }
}

// Step one position FORWARD through the interleaved sequence toward the live edge.
export function reviewStepForward(session: StorySession, pos: StoryReviewPos): StoryReviewPos {
  const liveIndex = Math.max(0, session.history.length - 1)
  // From a chapter's text, Forward lands on that chapter's first question.
  if (pos.chapterText) return { index: pos.index, chapterText: false }
  if (pos.index >= liveIndex) return pos
  const next = pos.index + 1
  const nextChapter = chapterForIndex(next)
  // Crossing into a new chapter surfaces its text first (when captured) before its questions.
  if (next === firstIndexOfChapter(nextChapter) && hasChapterText(session, nextChapter)) {
    return { index: next, chapterText: true }
  }
  return { index: next, chapterText: false }
}

// Whether Back/Forward would actually move (the step returns a DIFFERENT position).
export function canReviewStepBack(session: StorySession, pos: StoryReviewPos): boolean {
  const next = reviewStepBack(session, pos)
  return next.index !== pos.index || next.chapterText !== pos.chapterText
}

export function canReviewStepForward(session: StorySession, pos: StoryReviewPos): boolean {
  const next = reviewStepForward(session, pos)
  return next.index !== pos.index || next.chapterText !== pos.chapterText
}

// Apply an explicit question index (clamped to [0, max(0, history.length - 1)]); pointer-only with
// NO `updatedAt` change (mirrors jumpToLiveEdge). The UI uses this to apply a resolved review
// position / chapter jump back onto the session's `historyIndex`.
export function withHistoryIndex(session: StorySession, index: number): StorySession {
  const liveIndex = Math.max(0, session.history.length - 1)
  const clamped = Math.min(Math.max(index, 0), liveIndex)
  return { ...session, historyIndex: clamped }
}

// The jump target for a chapter: its TEXT when captured, otherwise its first question, clamped to
// the live edge so a not-yet-reached chapter never points past the newest question.
export function reviewChapterStart(session: StorySession, chapter: number): StoryReviewPos {
  if (hasChapterText(session, chapter)) {
    return { index: firstIndexOfChapter(chapter), chapterText: true }
  }
  const liveIndex = Math.max(0, session.history.length - 1)
  return { index: Math.min(firstIndexOfChapter(chapter), liveIndex), chapterText: false }
}

// Remove the on-screen question (e.g. when entering a checkpoint), dropping the key entirely so
// it serializes/normalizes like a session that never had one.
export function clearCurrentQuestion(session: StorySession, now: string = nowIso()): StorySession {
  const next = { ...session, updatedAt: now }
  delete next.currentQuestion
  return next
}

// Set (or clear) the HIDDEN story bible (plan). The controller calls this with the freshly written
// plan at session start and the revised plan after each checkpoint choice. The value is trimmed and
// capped to STORY_BIBLE_MAX_LENGTH so the persisted + in-memory plan is always bounded. An empty
// (or whitespace-only) plan CLEARS the field by deleting the key entirely — never assigning
// `undefined` — so a session with no usable plan serializes exactly like a legacy one (Firestore
// rejects undefined), mirroring `clearCurrentQuestion`.
export function setStoryBible(session: StorySession, storyBible: string, now: string = nowIso()): StorySession {
  const trimmed = (storyBible ?? '').trim().slice(0, STORY_BIBLE_MAX_LENGTH).trim()
  if (!trimmed) {
    if (session.storyBible === undefined) return session
    const next = { ...session, updatedAt: now }
    delete next.storyBible
    return next
  }
  return { ...session, storyBible: trimmed, updatedAt: now }
}

// End the adventure: mark it ended and drop any on-screen question.
export function endSession(session: StorySession, now: string = nowIso()): StorySession {
  const next = { ...session, status: 'ended' as const, updatedAt: now }
  delete next.currentQuestion
  return next
}
