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
  pickScene(input: { theme: StoryTheme; sceneText: string }): Promise<SceneId | null>
  // Context-window compaction (plan section 8).
  summarize(input: { narrative: string }): Promise<string>
}
