import type { ChapterBeat, LessonStep, StorySession } from '../domain'
import { ProgressBar } from '../components/ProgressBar'
import { StepRenderer } from '../lesson/StepRenderer'
import { capitalizeFirst } from './storyLibrary'
import { ChapterTextReview, ReviewQuestion, StoryHistoryNav } from './StoryReviewView'
import { StoryScreenNav } from './StoryScreenNav'
import { CHECKPOINT_INTERVAL } from './storySessionReducer'
import { isDevToolsEnabled, type DevToolsEnv } from '../devMode'
import { isStoryDevSkipDisabled, shouldShowStoryDevSkip } from './devSkip'

type StoryQuestionScreenProps = {
  session: StorySession
  step: LessonStep
  themed: boolean
  reviewing: boolean
  // True while Back has surfaced a chapter's story text; `chapterText` then holds the beat to show.
  showingChapterText: boolean
  chapterText: ChapterBeat | null
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
  // Reports the graded result of EACH submit (correct/incorrect) for learning-science capture; the
  // controller keeps only the first attempt per question (the retrieval signal).
  onAttempt: (correct: boolean) => void
  onBack: () => void
  onForward: () => void
  onChapterBack: () => void
  onChapterForward: () => void
  onOpenLibrary: () => void
  onNewStory: () => void
  onBackToPath: () => void
}

export function StoryQuestionScreen({
  session,
  step,
  themed,
  reviewing,
  showingChapterText,
  chapterText,
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
  onAttempt,
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
  const devEnabled = isDevToolsEnabled(import.meta.env as unknown as DevToolsEnv)

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
        <StoryHistoryNav
          reviewing={reviewing}
          showingChapterText={showingChapterText}
          chapter={chapter}
          chapterCount={chapterCount}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          canChapterBack={canChapterBack}
          canChapterForward={canChapterForward}
          busy={busy}
          onBack={onBack}
          onForward={onForward}
          onChapterBack={onChapterBack}
          onChapterForward={onChapterForward}
        />
      )}

      {reviewing ? (
        showingChapterText && chapterText ? (
          <ChapterTextReview chapter={chapter} beat={chapterText} />
        ) : (
          <ReviewQuestion step={step} />
        )
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
            onComplete={(correct) => {
              // Story Mode never writes LessonProgress or lesson mastery here. It DOES capture the
              // retrieval signal: each graded submit is reported to the controller, which keeps only
              // the FIRST attempt per question (spaced-repetition + mastery practice store).
              onAttempt(correct)
            }}
            onAdvance={() => onResult()}
          />

          {shouldShowStoryDevSkip({ devEnabled, reviewing, showingChapterText }) && (
            <div className="dev-tools-bar">
              <button
                type="button"
                className="dev-skip-button"
                disabled={isStoryDevSkipDisabled({ busy })}
                onClick={() => onResult()}
                title="Developer tool: skip this question and count it correct"
              >
                ⏭ Dev: skip (correct)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
