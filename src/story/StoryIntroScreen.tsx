import type { StorySession } from '../domain'
import { capitalizeFirst, storyInterestsLabel } from './storyLibrary'
import { StorySceneImage } from './StorySceneImage'
import { StoryScreenNav } from './StoryScreenNav'

type StoryIntroScreenProps = {
  session: StorySession
  busy: boolean
  // Continue from the overview into the opening chapter (the chapter-1 checkpoint).
  onBegin: () => void
  onOpenLibrary: () => void
  onNewStory: () => void
  onBackToPath: () => void
}

// The OVERVIEW page shown FIRST when a new adventure starts: the same premise summary the question
// screen banner shows (protagonist + world premise), surfaced on its own page so the reader grasps
// what the story is about before reading the full opening chapter. "Begin the adventure" continues
// to the chapter-1 checkpoint. Mirrors the checkpoint/outcome shell for a cohesive look.
export function StoryIntroScreen({
  session,
  busy,
  onBegin,
  onOpenLibrary,
  onNewStory,
  onBackToPath,
}: StoryIntroScreenProps) {
  const sceneId = session.segments[0]?.sceneId
  const interests = storyInterestsLabel(session)
  const premise = session.theme.premise?.trim()

  return (
    <section className="screen-stack story-checkpoint-shell">
      <article className="card story-segment-card story-intro-card">
        <StoryScreenNav busy={busy} onBackToPath={onBackToPath} onOpenLibrary={onOpenLibrary} onNewStory={onNewStory} />
        <header className="story-chapter-head">
          <p className="eyebrow">Your adventure</p>
          <h1 className="story-chapter-title">{capitalizeFirst(session.theme.protagonist) || 'A new story'}</h1>
          {interests && <p className="story-intro-interests">{interests}</p>}
        </header>

        <StorySceneImage sceneId={sceneId} />

        <div className="story-segment">
          <p className="story-intro-premise">{premise || 'A bright new adventure stretches out ahead, full of puzzles to solve.'}</p>
        </div>

        <button className="primary-action" type="button" disabled={busy} onClick={onBegin}>
          Begin the adventure
        </button>
      </article>
    </section>
  )
}
