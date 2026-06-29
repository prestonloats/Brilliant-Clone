import { useState } from 'react'
import type { SceneId } from '../domain'
import { getSceneDescription, isSceneId, scenerySrc } from './scenery'

type StorySceneImageProps = {
  // The image the LLM matched to this beat, or undefined when nothing was matched.
  sceneId?: SceneId
}

// The background image matched to a story beat. Renders nothing when there is no scene, the id is
// unknown (defensive — a renamed/removed asset), or the asset fails to load, so a missing image
// never leaves a broken <img> in the story. The setting description doubles as the alt text. The
// image fades + settles in once decoded (the `is-loaded` class drives the CSS transition); a
// ref callback catches images that are already cached/complete before React attaches onLoad so they
// never stay stuck transparent.
export function StorySceneImage({ sceneId }: StorySceneImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (!sceneId || !isSceneId(sceneId) || failed) return null

  return (
    <figure className="story-scene">
      <img
        className={`story-scene-image${loaded ? ' is-loaded' : ''}`}
        src={scenerySrc(sceneId)}
        alt={getSceneDescription(sceneId)}
        loading="lazy"
        decoding="async"
        ref={(node) => {
          if (node?.complete) setLoaded(true)
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </figure>
  )
}
