import { getStoryEntryState, type StoryEntryStatus } from './storyEntryState'

type StoryEntryCardProps = {
  unlocked: boolean
  providerConfigured: boolean
  hasActiveSession: boolean
  savedCount: number
  busy: boolean
  onOpen: () => void
  onOpenLibrary: () => void
}

// The compact path-screen entry into Story Mode. It intentionally carries NO long pitch — that
// lives on the interest-selection screen, where starting an adventure is the focus. Here it stays
// a tidy icon + title + a single state-specific one-liner + one clear call-to-action, so the Path
// view reads cleanly. The locked / no-provider / ready precedence comes from the pure
// `getStoryEntryState` helper, keeping this component a straight render of that state.
const STATUS_ICON: Record<StoryEntryStatus, string> = {
  locked: '🔒',
  'needs-provider': '🔑',
  ready: '📖',
}

export function StoryEntryCard({
  unlocked,
  providerConfigured,
  hasActiveSession,
  savedCount,
  busy,
  onOpen,
  onOpenLibrary,
}: StoryEntryCardProps) {
  const { status, action } = getStoryEntryState({ unlocked, providerConfigured, hasActiveSession })
  // Saved stories are offline-safe to resume, so expose the library whenever the gate is open
  // and the learner already has at least one — independent of the primary CTA's state.
  const showLibrary = unlocked && savedCount > 0

  return (
    <article className={`card story-entry-card story-entry-card--${status}`} aria-labelledby="story-entry-title">
      <span className="story-entry-icon" aria-hidden="true">
        {STATUS_ICON[status]}
      </span>

      <div className="story-entry-copy">
        <p className="eyebrow">Story Mode</p>
        <h2 id="story-entry-title">Endless story practice</h2>

        {status === 'ready' && (
          <p className="story-entry-tagline">Replay your finished lessons as an adventure you steer.</p>
        )}
        {status === 'locked' && (
          <p className="story-note">Finish the first two lessons to unlock Story Mode.</p>
        )}
        {status === 'needs-provider' && (
          <p className="story-note">
            Add an OpenAI key (<code>OPENAI_API_KEY</code>) to enable Story Mode.
          </p>
        )}
      </div>

      <div className="story-entry-cta">
        {action ? (
          <button
            className="primary-action story-entry-action"
            type="button"
            disabled={busy}
            onClick={onOpen}
          >
            {action === 'resume' ? 'Resume your adventure' : 'Start Story Mode'}
          </button>
        ) : (
          <span className="story-entry-pill" aria-hidden="true">
            {status === 'locked' ? 'Locked' : 'Needs a key'}
          </span>
        )}
        {showLibrary && (
          <button className="story-entry-library" type="button" disabled={busy} onClick={onOpenLibrary}>
            Saved stories ({savedCount})
          </button>
        )}
      </div>
    </article>
  )
}
