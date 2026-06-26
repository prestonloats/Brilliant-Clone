// Shared read-only Story Mode review pieces.
//
// The review surfaces (a past question, a chapter's setup -> choice -> outcome recap, and the
// Back/Forward + chapter nav) are reused by BOTH the question screen's inline review AND the
// checkpoint/outcome screens' "look back at the story" overlay (`StoryReviewScreen`). Keeping them
// here is the single source of truth, so e.g. the chapter recap renders identically everywhere.

import type { ChapterBeat, LessonStep } from '../domain'
import { MathText } from '../MathText'
import { FeedbackPanel } from '../components/FeedbackPanel'
import { StorySceneImage } from './StorySceneImage'
import { StoryScreenNav } from './StoryScreenNav'

// The slice of the Story controller the "look back at the story" overlay needs. The overlay pages
// CHAPTER RECAPS (setup -> choice -> outcome), so a single object carries the recap to render, the
// chapter position, and the back/forward handlers.
export type StoryReviewControls = {
  // Whether the "look back" overlay is currently open (checkpoint/outcome screens).
  active: boolean
  // Whether there is any earlier chapter recap to look back at (gates the "Look back" entry).
  canReview: boolean
  open: () => void
  close: () => void
  // The chapter recap currently shown (setup + choice + outcome), or null when none.
  beat: ChapterBeat | null
  chapter: number // the recap chapter on display
  chapterCount: number // the newest reviewable chapter (for "Chapter X of Y")
  canBack: boolean
  canForward: boolean
  back: () => void
  forward: () => void
}

// Split a beat's prose into display paragraphs (mirrors the checkpoint/outcome story screens).
function storyParagraphs(text: string): string[] {
  return (text ?? '').split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0)
}

// The authored "correct" feedback message for a step (the same line shown right after a correct
// answer), or a gentle default. Typed defensively since not every step shape carries it.
function correctFeedbackMessage(step: LessonStep): string {
  if ('feedback' in step && step.feedback && 'correct' in step.feedback) {
    const correct = (step.feedback as { correct?: unknown }).correct
    if (typeof correct === 'string' && correct.trim()) return correct
  }
  return 'You solved this to continue the story.'
}

// A read-only render of an already-answered question (back/forward review). Story Mode only advances
// on a CORRECT answer, so the answer the learner gave is this step's correct answer — recomputed
// from the rehydrated step (the key is never stored) and surfaced WITH a "Correct" banner so review
// mirrors the post-answer view. No interactive controls, so reviewing can never grade or advance.
export function ReviewQuestion({ step }: { step: LessonStep }) {
  const equation = 'equation' in step ? step.equation : undefined
  const prompt = 'prompt' in step ? step.prompt : ''

  // Choice steps: keep the option list, highlighting the one the learner picked (the correct id).
  const correctId = step.type === 'mcq' || step.type === 'operation-choice' ? step.correctId : undefined
  const choices =
    step.type === 'mcq'
      ? step.options.map((option) => ({ id: option.id, label: option.label }))
      : step.type === 'operation-choice'
        ? step.choices.map((choice) => ({ id: choice.id, label: choice.label }))
        : undefined
  // Sequence: the learner's answer is the correct ordering, mapped to the (themed) tile labels.
  const orderedAnswer =
    step.type === 'sequence'
      ? step.correctOrder.map((id) => step.tiles.find((tile) => tile.id === id)?.label ?? id)
      : undefined
  // Input: the accepted value(s).
  const inputAnswer = step.type === 'input' ? step.accept.join(' or ') : undefined

  return (
    <article className="lesson-card card story-review-card">
      <p className="eyebrow">Reviewed</p>
      {prompt && <h1>{prompt}</h1>}
      {equation && (
        <div className="puzzle-equation">
          <MathText display>{equation}</MathText>
        </div>
      )}

      {choices && (
        <ul className="story-review-options">
          {choices.map((choice) => {
            const chosen = choice.id === correctId
            return (
              <li key={choice.id} className={chosen ? 'story-review-chosen' : ''}>
                <span>{choice.label}</span>
                {chosen && <span className="story-review-tag">✓ Your answer</span>}
              </li>
            )
          })}
        </ul>
      )}

      {orderedAnswer && (
        <div className="story-review-answer">
          <span className="story-review-answer-label">Your answer</span>
          <ol className="story-review-options story-review-tiles">
            {orderedAnswer.map((label, index) => (
              <li key={index}>{label}</li>
            ))}
          </ol>
        </div>
      )}

      {inputAnswer !== undefined && (
        <p className="story-review-answer">
          <span className="story-review-answer-label">Your answer</span>
          <strong className="story-review-answer-value">{inputAnswer}</strong>
        </p>
      )}

      <FeedbackPanel correct message={correctFeedbackMessage(step)} />
    </article>
  )
}

// The read-only render of a chapter's STORY reached by stepping Back. It replays the chapter the way
// it was first played: the opening/bridge setup, then the learner's own checkpoint choice, then the
// "what happened next" outcome — mirroring the checkpoint + outcome screens.
export function ChapterTextReview({ chapter, beat }: { chapter: number; beat: ChapterBeat }) {
  const setupParagraphs = storyParagraphs(beat.text)
  const outcomeParagraphs = storyParagraphs(beat.outcomeText ?? '')
  const choice = beat.userChoice?.trim() ?? ''
  return (
    <article className="card story-segment-card story-chapter-review">
      <p className="eyebrow">Chapter {chapter} · Story recap</p>
      <StorySceneImage sceneId={beat.sceneId} />
      <div className="story-segment">
        {setupParagraphs.length > 0 ? (
          setupParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p>The story pauses for a breath.</p>
        )}
      </div>

      {choice && (
        <div className="story-choice-made">
          <span className="story-choice-label">You chose</span>
          <p className="story-choice-echo">{choice}</p>
        </div>
      )}

      {outcomeParagraphs.length > 0 && (
        <>
          <p className="story-outcome-kicker">What happened next…</p>
          <StorySceneImage sceneId={beat.outcomeSceneId} />
          <div className="story-segment">
            {outcomeParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </>
      )}

      <p className="story-note">Reviewing the story so far — read-only.</p>
    </article>
  )
}

type StoryHistoryNavProps = {
  reviewing: boolean
  showingChapterText: boolean
  chapter: number
  chapterCount: number
  canGoBack: boolean
  canGoForward: boolean
  canChapterBack: boolean
  canChapterForward: boolean
  busy: boolean
  onBack: () => void
  onForward: () => void
  onChapterBack: () => void
  onChapterForward: () => void
}

// The Back/Forward (by question) + Previous/Next (by chapter) review controls, plus a status line.
// Shared by the question screen and the review overlay so both navigate the story identically.
//
// Layout groups the controls by DIRECTION rather than by granularity: every "step backward" control
// (Back a question, then Previous chapter) stacks on the left, the chapter + review state is
// centered, and the "step forward" controls mirror them on the right — so the four buttons read as
// one connected navigator instead of two disconnected rows.
export function StoryHistoryNav({
  reviewing,
  showingChapterText,
  chapter,
  chapterCount,
  canGoBack,
  canGoForward,
  canChapterBack,
  canChapterForward,
  busy,
  onBack,
  onForward,
  onChapterBack,
  onChapterForward,
}: StoryHistoryNavProps) {
  const hasChapters = chapterCount > 1
  return (
    <div className="story-history-nav" role="group" aria-label="Review your story by question or chapter">
      <div className="story-history-group">
        <button className="story-history-button" type="button" disabled={!canGoBack || busy} onClick={onBack}>
          <span aria-hidden="true">←</span> Back
        </button>
        {hasChapters && (
          <button
            className="story-history-button story-history-button--chapter"
            type="button"
            disabled={!canChapterBack || busy}
            onClick={onChapterBack}
          >
            <span aria-hidden="true">«</span> Previous chapter
          </button>
        )}
      </div>

      <span className="story-history-status">
        <strong className="story-history-chapter">
          Chapter {chapter}
          {hasChapters ? ` of ${chapterCount}` : ''}
        </strong>
        <span className="story-history-state">
          {showingChapterText ? 'Reviewing the story' : reviewing ? 'Reviewing a past question' : 'Latest question'}
        </span>
      </span>

      <div className="story-history-group story-history-group--forward">
        <button className="story-history-button" type="button" disabled={!canGoForward || busy} onClick={onForward}>
          Forward <span aria-hidden="true">→</span>
        </button>
        {hasChapters && (
          <button
            className="story-history-button story-history-button--chapter"
            type="button"
            disabled={!canChapterForward || busy}
            onClick={onChapterForward}
          >
            Next chapter <span aria-hidden="true">»</span>
          </button>
        )}
      </div>
    </div>
  )
}

// The full read-only "look back at the story" overlay shown by the checkpoint/outcome screens when
// review is active. It pages chapter-by-chapter through the story recaps (each = setup -> choice ->
// outcome) with integrated Back/Forward, then returns to the live screen.
export function StoryReviewScreen({
  review,
  busy,
  onBackToPath,
  onOpenLibrary,
  onNewStory,
}: {
  review: StoryReviewControls
  busy: boolean
  onBackToPath: () => void
  onOpenLibrary: () => void
  onNewStory: () => void
}) {
  return (
    <section className="lesson-shell story-question-shell">
      <StoryScreenNav busy={busy} onBackToPath={onBackToPath} onOpenLibrary={onOpenLibrary} onNewStory={onNewStory} />

      <div className="story-history-nav" role="group" aria-label="Look back through earlier chapters">
        <div className="story-history-group">
          <button className="story-history-button" type="button" disabled={!review.canBack || busy} onClick={review.back}>
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
        <span className="story-history-status">
          <strong className="story-history-chapter">
            Chapter {review.chapter}
            {review.chapterCount > 1 ? ` of ${review.chapterCount}` : ''}
          </strong>
          <span className="story-history-state">Story recap</span>
        </span>
        <div className="story-history-group story-history-group--forward">
          <button
            className="story-history-button"
            type="button"
            disabled={!review.canForward || busy}
            onClick={review.forward}
          >
            Forward <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {review.beat ? (
        <ChapterTextReview chapter={review.chapter} beat={review.beat} />
      ) : (
        <p className="story-note">Nothing to look back on yet.</p>
      )}

      <button className="primary-action" type="button" disabled={busy} onClick={review.close}>
        Return to the story
      </button>
    </section>
  )
}
