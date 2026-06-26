import type { LessonStep, StorySession } from '../domain'
import { MathText } from '../MathText'
import { ProgressBar } from '../components/ProgressBar'
import { StepRenderer } from '../lesson/StepRenderer'
import { capitalizeFirst } from './storyLibrary'
import { StoryScreenNav } from './StoryScreenNav'
import { CHECKPOINT_INTERVAL } from './storySessionReducer'

type StoryQuestionScreenProps = {
  session: StorySession
  step: LessonStep
  themed: boolean
  reviewing: boolean
  canGoBack: boolean
  canGoForward: boolean
  chapter: number
  chapterCount: number
  canChapterBack: boolean
  canChapterForward: boolean
  questionNumber: number
  busy: boolean
  error: string
  onResult: () => void
  onBack: () => void
  onForward: () => void
  onChapterBack: () => void
  onChapterForward: () => void
  onOpenLibrary: () => void
  onNewStory: () => void
  onBackToPath: () => void
}

// A read-only render of an already-answered question (back/forward review). It shows the themed
// prompt, equation, and any option/tile labels WITHOUT the interactive controls, so reviewing can
// never grade, advance, or touch counters. Module-local so this file only exports the screen.
function ReviewQuestion({ step }: { step: LessonStep }) {
  const equation = 'equation' in step ? step.equation : undefined
  const options =
    step.type === 'mcq'
      ? step.options.map((option) => ({ id: option.id, label: option.label }))
      : step.type === 'operation-choice'
        ? step.choices.map((choice) => ({ id: choice.id, label: choice.label }))
        : undefined
  const tiles = step.type === 'sequence' ? step.tiles.map((tile) => ({ id: tile.id, label: tile.label })) : undefined
  const prompt = 'prompt' in step ? step.prompt : ''

  return (
    <article className="lesson-card card story-review-card">
      <p className="eyebrow">Reviewed</p>
      {prompt && <h1>{prompt}</h1>}
      {equation && (
        <div className="puzzle-equation">
          <MathText display>{equation}</MathText>
        </div>
      )}
      {options && (
        <ul className="story-review-options">
          {options.map((option) => (
            <li key={option.id}>{option.label}</li>
          ))}
        </ul>
      )}
      {tiles && (
        <ul className="story-review-options story-review-tiles">
          {tiles.map((tile) => (
            <li key={tile.id}>{tile.label}</li>
          ))}
        </ul>
      )}
      <p className="story-note">You already answered this question — it is shown here for review only.</p>
    </article>
  )
}

export function StoryQuestionScreen({
  session,
  step,
  themed,
  reviewing,
  canGoBack,
  canGoForward,
  chapter,
  chapterCount,
  canChapterBack,
  canChapterForward,
  questionNumber,
  busy,
  error,
  onResult,
  onBack,
  onForward,
  onChapterBack,
  onChapterForward,
  onOpenLibrary,
  onNewStory,
  onBackToPath,
}: StoryQuestionScreenProps) {
  const displayNumber = Math.min(questionNumber, CHECKPOINT_INTERVAL)
  const progressPercent = Math.round(((displayNumber - 1) / CHECKPOINT_INTERVAL) * 100)

  return (
    <section className="lesson-shell story-question-shell">
      <StoryScreenNav busy={busy} onBackToPath={onBackToPath} onOpenLibrary={onOpenLibrary} onNewStory={onNewStory} />

      <div className="story-banner card">
        <span className="story-banner-icon" aria-hidden="true">
          📖
        </span>
        <div className="story-banner-copy">
          <p className="eyebrow">{capitalizeFirst(session.theme.protagonist)}</p>
          <p className="story-banner-premise">{session.theme.premise}</p>
        </div>
      </div>

      {(canGoBack || canGoForward) && (
        <div className="story-history-nav" role="group" aria-label="Review your story by question or chapter">
          <div className="story-history-row">
            <button className="story-history-button" type="button" disabled={!canGoBack || busy} onClick={onBack}>
              <span aria-hidden="true">←</span> Back
            </button>
            <span className="story-history-status">
              <strong className="story-history-chapter">
                Chapter {chapter}
                {chapterCount > 1 ? ` of ${chapterCount}` : ''}
              </strong>
              <span className="story-history-state">
                {reviewing ? 'Reviewing a past question' : 'Latest question'}
              </span>
            </span>
            <button className="story-history-button" type="button" disabled={!canGoForward || busy} onClick={onForward}>
              Forward <span aria-hidden="true">→</span>
            </button>
          </div>
          {chapterCount > 1 && (
            <div className="story-chapter-row" role="group" aria-label="Jump between chapters">
              <button
                className="story-history-button"
                type="button"
                disabled={!canChapterBack || busy}
                onClick={onChapterBack}
              >
                <span aria-hidden="true">«</span> Previous chapter
              </button>
              <button
                className="story-history-button"
                type="button"
                disabled={!canChapterForward || busy}
                onClick={onChapterForward}
              >
                Next chapter <span aria-hidden="true">»</span>
              </button>
            </div>
          )}
        </div>
      )}

      {reviewing ? (
        <ReviewQuestion step={step} />
      ) : (
        <>
          <ProgressBar
            value={progressPercent}
            label={`Question ${displayNumber} of ${CHECKPOINT_INTERVAL} to the next chapter`}
          />

          {!themed && (
            <p className="story-original-note" role="note">
              <span aria-hidden="true">📝</span> Showing the original question
            </p>
          )}
          {busy && (
            <p className="story-inline-status" aria-live="polite">
              <span className="story-spinner" aria-hidden="true" /> Weaving the next part of your story…
            </p>
          )}
          {error && (
            <p className="feedback bad" role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          <StepRenderer
            // Remount per served question so the reused step view resets its own input/feedback state.
            key={`${step.id}:${session.questionsSolvedTotal}`}
            step={step}
            onComplete={() => {
              // PURE REVIEW: Story Mode never writes LessonProgress, mastery, streaks, or attempts.
              // The reused step view's per-submit callback is intentionally a no-op here — only the
              // learner's "Continue" (onAdvance, fired after a correct answer) advances the story.
            }}
            onAdvance={() => onResult()}
          />
        </>
      )}
    </section>
  )
}
