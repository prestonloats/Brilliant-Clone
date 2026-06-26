type StoryScreenNavProps = {
  busy: boolean
  onBackToPath: () => void
  onOpenLibrary: () => void
  onNewStory: () => void
}

// Compact in-story navigation shared by the question and checkpoint screens: leave Story Mode,
// jump to the saved-stories library (to switch adventures), or start a brand-new one. Kept as a
// single small component so both screens stay consistent and the actions live in one place.
export function StoryScreenNav({ busy, onBackToPath, onOpenLibrary, onNewStory }: StoryScreenNavProps) {
  return (
    <div className="story-screen-nav">
      <button className="back-button" type="button" onClick={onBackToPath}>
        Back to path
      </button>
      <div className="story-screen-nav-actions">
        <button className="story-nav-link" type="button" disabled={busy} onClick={onOpenLibrary}>
          Saved stories
        </button>
        <button className="story-nav-link" type="button" disabled={busy} onClick={onNewStory}>
          New story
        </button>
      </div>
    </div>
  )
}
