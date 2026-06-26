import type { StorySession } from '../domain'
import { summarizeStorySession } from './storyLibrary'

type StoryLibraryScreenProps = {
  sessions: StorySession[]
  activeSessionId: string | null
  busy: boolean
  error: string
  onResume: (sessionId: string) => void
  onNewStory: () => void
  onDelete: (sessionId: string) => void
  onBackToPath: () => void
}

// A friendly "last played" label. Module-local (non-exported) so this .tsx file only exports the
// screen component, keeping React Fast Refresh happy.
function formatLastPlayed(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// The saved-stories library: every adventure the learner has started, most-recently-played
// first, with one-tap resume/switch, a clear way to begin a brand-new story, and per-story
// delete. Resuming a story is offline-safe (already-generated content rehydrates locally), so
// this screen never requires an AI provider.
export function StoryLibraryScreen({
  sessions,
  activeSessionId,
  busy,
  error,
  onResume,
  onNewStory,
  onDelete,
  onBackToPath,
}: StoryLibraryScreenProps) {
  return (
    <section className="screen-stack story-library-shell">
      <article className="card story-library-card">
        <button className="back-button" type="button" onClick={onBackToPath}>
          Back to path
        </button>
        <header className="story-screen-head">
          <p className="eyebrow">Story Mode</p>
          <h1>Your saved stories</h1>
          <p className="lead">
            Pick up any adventure where you left off, or start a brand-new one with different interests. Your other
            stories are always kept here.
          </p>
        </header>

        {error && (
          <p className="feedback bad" role="alert" aria-live="assertive">
            {error}
          </p>
        )}

        <button className="primary-action story-library-new" type="button" disabled={busy} onClick={onNewStory}>
          + New story
        </button>

        {sessions.length === 0 ? (
          <p className="story-note">No saved stories yet — start your first adventure above.</p>
        ) : (
          <ul className="story-library-list">
            {sessions.map((session) => {
              const summary = summarizeStorySession(session)
              const isActive = session.id === activeSessionId
              const lastPlayed = formatLastPlayed(summary.updatedAt)
              return (
                <li key={summary.id}>
                  <article className={`story-library-item ${isActive ? 'is-active' : ''}`}>
                    <span className="story-library-emoji" aria-hidden="true">
                      {summary.emoji}
                    </span>
                    <div className="story-library-copy">
                      <div className="story-library-titlerow">
                        <h2 className="story-library-title">{summary.title}</h2>
                        {isActive && <span className="story-library-badge">Active</span>}
                      </div>
                      {summary.premise && <p className="story-library-premise">{summary.premise}</p>}
                      <p className="story-library-meta">
                        Chapter {summary.chapterCount} · {summary.questionsSolved}{' '}
                        {summary.questionsSolved === 1 ? 'question' : 'questions'} solved
                        {lastPlayed ? ` · ${lastPlayed}` : ''}
                      </p>
                    </div>
                    <div className="story-library-actions">
                      <button
                        className="primary-action story-library-resume"
                        type="button"
                        disabled={busy}
                        onClick={() => onResume(summary.id)}
                      >
                        {isActive ? 'Continue' : 'Resume'}
                      </button>
                      <button
                        className="story-library-delete"
                        type="button"
                        disabled={busy}
                        aria-label={`Delete ${summary.title}`}
                        onClick={() => onDelete(summary.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </article>
    </section>
  )
}
