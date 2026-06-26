// The app-owned StoryAI interface (the seam other agents code against).
//
// This module is intentionally a PURE type/interface module: it MUST NOT import
// any LLM SDK (`@google/genai`) or Firebase. Concrete adapters
// (`geminiDeveloperStoryAi.ts`, `firebaseStoryAi.ts`) implement this interface and
// are the only places that touch an SDK, so UI/controller code never imports an
// LLM SDK directly. See plan section 5.2.

import type { SceneId, StoryTheme } from '../content/storyTypes'

export type RethemeRequest = {
  theme: StoryTheme
  recentNarrative: string // narrativeSummary + last segment text
  stepType: 'input' | 'mcq' | 'operation-choice' | 'sequence'
  prompt: string // original display prompt (math text, no answer)
  equation?: string // original equation string if present (kept as-is, may be shown)
  options?: { id: string; label: string }[] // mcq/operation-choice labels only
  tiles?: { id: string; label: string }[] // sequence tile labels only
}

export type RethemeResult = {
  themedPrompt: string
  themedOptions?: { id: string; label: string }[]
  themedTiles?: { id: string; label: string }[]
}

// Closest-match scene request (rules 5 & 6). Given a CANDIDATE shortlist of catalog scenes, pick the
// ONE whose setting most closely RESEMBLES the theme's interests — EMPHASIZING the learner's custom
// (freeform) topics over the suggested presets when `emphasizeCustom` is set — or signal "none is
// close enough" (the adapters map that to null). `candidates` is the set the model may choose among
// (e.g. the on-interest pool from `scenesForInterests`), kept small so this is a cheap, single-token
// classification like `pickScene`.
export type SceneMatchRequest = {
  theme: StoryTheme
  candidates: readonly SceneId[]
  emphasizeCustom: boolean
}

export type StoryAI = {
  startStory(theme: StoryTheme): Promise<{ premise: string; protagonist: string; opening: string }>
  rethemeQuestion(req: RethemeRequest): Promise<RethemeResult>
  writeSegment(input: {
    theme: StoryTheme
    recentNarrative: string
    questionsSolved: number
  }): Promise<string>
  continueStory(input: {
    theme: StoryTheme
    recentNarrative: string
    userChoice: string
  }): Promise<string>
  // Pick the pre-generated background image whose SETTING best fits a story beat, from the fixed
  // scenery catalog. Returns the chosen `SceneId`, or null when nothing fits / matching is
  // unavailable (so the caller simply shows no image). Pure classification — never authors text.
  //
  // `interestScenes` (the on-interest shortlist from `scenesForInterests`) and `previousSceneId`
  // (the immediately-previous beat's image) are OPTIONAL hints the controller threads through so the
  // picker spreads across on-interest scenes and avoids repeating the last image. They are forwarded
  // verbatim to `buildScenePrompt`, so the concrete adapters need no change to support them.
  pickScene(input: {
    theme: StoryTheme
    sceneText: string
    interestScenes?: readonly SceneId[]
    previousSceneId?: SceneId
  }): Promise<SceneId | null>
  // OPTIONAL closest-match scene picker (rules 5 & 6): choose the ONE candidate scene that most
  // closely resembles the theme's interests (emphasizing the custom/freeform topics when asked), or
  // resolve to null when NONE is close enough — the "not close enough" threshold — so the caller
  // shows no image. `null` is the single not-matched signal (it covers the NO_SCENE sentinel, an
  // unknown id, and any failure/timeout). Like `pickScene` this is pure CLASSIFICATION — it never
  // authors text. Kept OPTIONAL + additive so existing/mock implementers need not provide it; the
  // four SDK adapters do.
  matchSceneToInterests?(req: SceneMatchRequest): Promise<SceneId | null>
  // Context-window compaction (plan section 8).
  summarize(input: { narrative: string }): Promise<string>
}
