import type { CSSProperties } from 'react'
import type { StorySession } from '../domain'
import { performanceCopy } from './performanceCopy'
import { capitalizeFirst } from './storyLibrary'
import { StorySceneImage } from './StorySceneImage'
import { StoryScreenNav } from './StoryScreenNav'
import { CHECKPOINT_INTERVAL } from './storySessionReducer'

type StoryOutcomeScreenProps = {
  session: StorySession
  busy: boolean
  error: string
  // Whether there is earlier story to look back at, and the handler that opens the read-only review.
  canReview: boolean
  onLookBack: () => void
  onContinue: () => void
  onOpenLibrary: () => void
  onNewStory: () => void
  onBackToPath: () => void
}

// The OUTCOME page: shown right after the learner submits their checkpoint action, it displays
// the continuation the LLM generated (the result of that action) as its own story page — no
// question and no "what do you do next?" box — so the learner reads the consequence of their
// choice before practice resumes. The single primary action ("Continue the adventure") stages
// the next question via the controller's `continueFromOutcome`. It mirrors the checkpoint
// screen's shell/typography for a cohesive Story Mode look.
export function StoryOutcomeScreen({
  session,
  busy,
  error,
  canReview,
  onLookBack,
  onContinue,
  onOpenLibrary,
  onNewStory,
  onBackToPath,
}: StoryOutcomeScreenProps) {
  const latestSegment = session.segments[session.segments.length - 1]
  const paragraphs = (latestSegment?.text ?? '').split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0)
  // The action the learner took is recorded on the beat that PRECEDES this outcome (the outcome
  // beat itself never carries a choice). Echo it above its consequence so what they chose stays
  // visible here — including while the next question loads (this view stays mounted, busy).
  const priorSegment = session.segments[session.segments.length - 2]
  const chosenAction = priorSegment?.userChoice?.trim() ?? ''
  // Same monotonic chapter number as the checkpoint that prompted this action — the outcome is
  // part of the same chapter, so the heading stays consistent across the two pages.
  const chapterNumber = Math.floor(session.questionsSolvedTotal / CHECKPOINT_INTERVAL) + 1
  // The same chapter performance shown on the checkpoint, repeated here so the outcome of the choice
  // is clearly tied to how the learner did (the outcome beat is generated from this same band).
  const performance = session.lastChapterPerformance ? performanceCopy(session.lastChapterPerformance) : null

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
          <p className="eyebrow">{capitalizeFirst(session.theme.protagonist)}</p>
          <h1 className="story-chapter-title">Chapter {chapterNumber}</h1>
          <p className="story-outcome-kicker">What happens next…</p>
        </header>

        {performance && (
          <div className={`story-performance story-performance-${performance.band}`} role="status">
            <span className="story-performance-tally">{performance.tally}</span>
            <span className="story-performance-headline">{performance.headline}</span>
            <span className="story-performance-note">{performance.note}</span>
          </div>
        )}

        {chosenAction && (
          <div className="story-choice-made">
            <span className="story-choice-label">You chose</span>
            <p className="story-choice-echo">{chosenAction}</p>
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
            <p>The story moves on.</p>
          )}
        </div>

        {error && (
          <p className="feedback bad" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        {busy && (
          <p className="story-inline-status" aria-live="polite">
            <span className="story-spinner" aria-hidden="true" /> Weaving the next part of your story…
          </p>
        )}

        <button className="primary-action" type="button" disabled={busy} onClick={onContinue}>
          {busy ? 'Continuing…' : 'Continue the adventure'}
        </button>
      </article>
    </section>
  )
}
