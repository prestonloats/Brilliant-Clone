import { useEffect, useState, type CSSProperties } from 'react'
import type { StorySession } from '../domain'
import { MasterySparkles } from '../course/MasterySparkles'
import { MAX_USER_INPUT_LENGTH } from './safety'
import { performanceCopy } from './performanceCopy'
import { capitalizeFirst } from './storyLibrary'
import { StorySceneImage } from './StorySceneImage'
import { StoryScreenNav } from './StoryScreenNav'
import { CHECKPOINT_INTERVAL } from './storySessionReducer'

type StoryCheckpointScreenProps = {
  session: StorySession
  busy: boolean
  error: string
  // Whether there is earlier story to look back at, and the handler that opens the read-only review.
  canReview: boolean
  // When this equals the chapter on screen the learner just CLEARED a chapter and reached a new one
  // (set by the controller only on progression, never on resume): play the one-shot celebration, then
  // call onCelebrated to consume the flag so it fires exactly once.
  celebrateChapter: number | null
  onCelebrated: () => void
  onLookBack: () => void
  onContinue: (choice: string) => void
  onOpenLibrary: () => void
  onNewStory: () => void
  onBackToPath: () => void
}

export function StoryCheckpointScreen({
  session,
  busy,
  error,
  canReview,
  celebrateChapter,
  onCelebrated,
  onLookBack,
  onContinue,
  onOpenLibrary,
  onNewStory,
  onBackToPath,
}: StoryCheckpointScreenProps) {
  const [choice, setChoice] = useState('')
  const latestSegment = session.segments[session.segments.length - 1]
  const paragraphs = (latestSegment?.text ?? '').split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0)
  const hasChoice = choice.trim().length > 0
  // While the next beat generates, the textarea is cleared + disabled, so echo the action the
  // learner just committed (recorded on the latest segment by the controller before it awaits the
  // generation) in its place — what they chose stays visible the whole time they wait.
  const committedChoice = latestSegment?.userChoice?.trim() ?? ''
  const showChoiceEcho = busy && committedChoice.length > 0
  // Monotonic chapter number driven by lifetime solves (the opening is Chapter 1, then one per
  // 5-question checkpoint) rather than raw segment count, which grows two-per-cycle.
  const chapterNumber = Math.floor(session.questionsSolvedTotal / CHECKPOINT_INTERVAL) + 1
  // How the just-completed chapter's math went — shown so the learner sees their solving shaped what
  // happens next in the story (the consequence beat above is generated from this same band).
  const performance = session.lastChapterPerformance ? performanceCopy(session.lastChapterPerformance) : null

  // One-shot "you cleared a chapter" celebration. The controller raises `celebrateChapter` only when
  // this checkpoint was reached by progression (never on resume), so derive the burst directly from
  // it, then consume the flag after the burst (in the timer callback) so it fires exactly once and
  // the sparkle layer unmounts cleanly.
  const celebrating = celebrateChapter !== null && celebrateChapter === chapterNumber
  useEffect(() => {
    if (!celebrating) return
    const timer = setTimeout(onCelebrated, 1800)
    return () => clearTimeout(timer)
  }, [celebrating, onCelebrated])

  const handleContinue = () => {
    if (!hasChoice || busy) return
    onContinue(choice)
    setChoice('')
  }

  return (
    <section className="screen-stack story-checkpoint-shell">
      <article className="card story-segment-card">
        <StoryScreenNav busy={busy} onBackToPath={onBackToPath} onOpenLibrary={onOpenLibrary} onNewStory={onNewStory} />
        {canReview && (
          <button className="story-look-back" type="button" disabled={busy} onClick={onLookBack}>
            <span aria-hidden="true">←</span> Look back at the story
          </button>
        )}
        <header className="story-chapter-head">
          {celebrating && <MasterySparkles seed={chapterNumber} count={16} />}
          <p className="eyebrow">{capitalizeFirst(session.theme.protagonist)}</p>
          <h1 className={`story-chapter-title${celebrating ? ' is-celebrating' : ''}`}>Chapter {chapterNumber}</h1>
        </header>

        {performance && (
          <div className={`story-performance story-performance-${performance.band}`} role="status">
            <span className="story-performance-tally">{performance.tally}</span>
            <span className="story-performance-headline">{performance.headline}</span>
            <span className="story-performance-note">{performance.note}</span>
          </div>
        )}

        <StorySceneImage sceneId={latestSegment?.sceneId} />

        <div className="story-segment">
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, index) => (
              <p key={index} style={{ '--p-index': index } as CSSProperties}>
                {paragraph}
              </p>
            ))
          ) : (
            <p>The story pauses for a breath.</p>
          )}
        </div>

        {showChoiceEcho ? (
          // Loading: the committed action, echoed read-only where the input was, so it persists
          // on screen while "Continuing your story…" runs below.
          <div className="story-choice-made">
            <span className="story-choice-label">You chose</span>
            <p className="story-choice-echo">{committedChoice}</p>
          </div>
        ) : (
          /* The single source of the "What do you do next?" prompt: a real <label> wrapping the
             textarea (implicit association = accessible name), rendered directly above the input by
             the flex-column layout. The story beat itself must NOT repeat this meta-question. */
          <label className="story-choice">
            <span className="story-choice-label">What do you do next?</span>
            <textarea
              rows={3}
              maxLength={MAX_USER_INPUT_LENGTH}
              placeholder="Describe your next move…"
              value={choice}
              disabled={busy}
              onChange={(event) => setChoice(event.target.value)}
            />
          </label>
        )}

        {error && (
          <p className="feedback bad" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        {busy && (
          <>
            <p className="story-inline-status" aria-live="polite">
              <span className="story-spinner" aria-hidden="true" /> Continuing your story…
            </p>
            <div className="story-skeleton" aria-hidden="true">
              <span className="story-skeleton-line" />
              <span className="story-skeleton-line" />
              <span className="story-skeleton-line" />
            </div>
          </>
        )}

        <button className="primary-action" type="button" disabled={!hasChoice || busy} onClick={handleContinue}>
          {busy ? 'Continuing…' : 'Continue'}
        </button>
      </article>
    </section>
  )
}
