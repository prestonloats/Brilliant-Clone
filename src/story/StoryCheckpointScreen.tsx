import { useState } from 'react'
import type { StorySession } from '../domain'
import { MAX_USER_INPUT_LENGTH } from './safety'
import { StorySceneImage } from './StorySceneImage'
import { StoryScreenNav } from './StoryScreenNav'
import { CHECKPOINT_INTERVAL } from './storySessionReducer'

type StoryCheckpointScreenProps = {
  session: StorySession
  busy: boolean
  error: string
  onContinue: (choice: string) => void
  onOpenLibrary: () => void
  onNewStory: () => void
  onBackToPath: () => void
}

export function StoryCheckpointScreen({
  session,
  busy,
  error,
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

  const handleContinue = () => {
    if (!hasChoice || busy) return
    onContinue(choice)
    setChoice('')
  }

  return (
    <section className="screen-stack story-checkpoint-shell">
      <article className="card story-segment-card">
        <StoryScreenNav busy={busy} onBackToPath={onBackToPath} onOpenLibrary={onOpenLibrary} onNewStory={onNewStory} />
        <header className="story-chapter-head">
          <p className="eyebrow">{session.theme.protagonist}</p>
          <h1 className="story-chapter-title">Chapter {chapterNumber}</h1>
        </header>

        <StorySceneImage sceneId={latestSegment?.sceneId} />

        <div className="story-segment">
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
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
          <p className="story-inline-status" aria-live="polite">
            <span className="story-spinner" aria-hidden="true" /> Continuing your story…
          </p>
        )}

        <button className="primary-action" type="button" disabled={!hasChoice || busy} onClick={handleContinue}>
          {busy ? 'Continuing…' : 'Continue'}
        </button>
      </article>
    </section>
  )
}
