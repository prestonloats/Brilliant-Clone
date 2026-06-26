import { useState } from 'react'
import type { SceneId } from '../domain'
import { getSceneDescription, isSceneId, scenerySrc } from './scenery'

type StorySceneImageProps = {
  // The image the LLM matched to this beat, or undefined when nothing was matched.
  sceneId?: SceneId
}

// The background image matched to a story beat. Renders nothing when there is no scene, the id is
// unknown (defensive — a renamed/removed asset), or the asset fails to load, so a missing image
// never leaves a broken <img> in the story. The setting description doubles as the alt text.
export function StorySceneImage({ sceneId }: StorySceneImageProps) {
  const [failed, setFailed] = useState(false)

  if (!sceneId || !isSceneId(sceneId) || failed) return null

  return (
    <figure className="story-scene">
      <img
        className="story-scene-image"
        src={scenerySrc(sceneId)}
        alt={getSceneDescription(sceneId)}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </figure>
  )
}
