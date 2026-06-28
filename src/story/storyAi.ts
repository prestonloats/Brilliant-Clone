// The app-owned StoryAI interface (the seam other agents code against).
//
// This module is intentionally a PURE type/interface module: it MUST NOT import
// any LLM SDK (`@google/genai`) or Firebase. Concrete adapters
// (`geminiDeveloperStoryAi.ts`, `firebaseStoryAi.ts`) implement this interface and
// are the only places that touch an SDK, so UI/controller code never imports an
// LLM SDK directly. See plan section 5.2.

import type { ChapterPerformance, SceneId, StoryTheme } from '../content/storyTypes'

export type RethemeRequest = {
  theme: StoryTheme
  recentNarrative: string // narrativeSummary + last segment text
  stepType: 'input' | 'mcq' | 'operation-choice' | 'sequence'
  prompt: string // original display prompt (math text, no answer)
  equation?: string // original equation string if present (kept as-is, may be shown)
  options?: { id: string; label: string }[] // mcq/operation-choice labels only
  tiles?: { id: string; label: string }[] // sequence tile labels only
}

// The hidden story-bible / plan request (see StoryAI.writeStoryBible). The SAME shape covers BOTH
// the initial CREATE (no `currentBible`, `recentNarrative` = the opening beat) and every later
// UPDATE (the prior `currentBible` plus the recent events + the reader's latest `userChoice`); the
// prompt builder picks create-vs-revise from whether `currentBible` is non-empty.
export type StoryBibleRequest = {
  theme: StoryTheme
  // The plan to revise; empty/absent means "create a fresh plan from scratch".
  currentBible?: string
  // The story so far the plan must stay consistent with (the opening at create time; the
  // rolling summary + recent beats + the committed choice at update time).
  recentNarrative?: string
  // The reader's just-committed checkpoint action (update time only), so the plan can BRANCH to it.
  userChoice?: string
  // Lifetime questions solved, a coarse "how far in" signal for pacing the planned beats.
  questionsSolved?: number
  // OPTIONAL: how the learner did on the chapter just completed, so the plan can branch its tone
  // (plan a triumph after strong play, a rescue/setback to overcome after a struggle).
  performance?: ChapterPerformance
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
    // OPTIONAL/back-compatible: the hidden story bible (plan). When present it is threaded into the
    // beat prompt as PRIVATE author's notes so the bridge beat follows the long-term plan; absent
    // (no provider / generation failed / legacy) keeps today's behavior exactly.
    storyBible?: string
    // OPTIONAL: how the learner did on the chapter just completed, so this chapter-opening "bridge"
    // beat reflects it (reward strong play, raise the stakes after a struggle). Absent = neutral.
    performance?: ChapterPerformance
  }): Promise<string>
  continueStory(input: {
    theme: StoryTheme
    recentNarrative: string
    userChoice: string
    // OPTIONAL/back-compatible: the hidden story bible (plan), threaded into the outcome prompt as
    // private author's notes so the consequence of the choice advances the planned story.
    storyBible?: string
    // OPTIONAL: how the learner did on the chapter just completed, so the outcome of their choice
    // reflects it (a cleaner success after strong play, more complications after a struggle).
    performance?: ChapterPerformance
  }): Promise<string>
  // Writes/revises the HIDDEN story bible (plan): the
  // private, author-only planning document that gives the endless adventure long-term direction so
  // it reads like a real novel (central question, themes, world rules + secrets, character arcs, a
  // plot outline of planned beats with emotional tone, foreshadowing/open threads, and the next big
  // decision). The SAME call covers create (no `currentBible`) and revise (with one). Returns the
  // plan text, or '' when generation fails/blocks (the caller then keeps the existing plan) — like
  // `summarize`, it never throws into the play loop. Kept OPTIONAL + additive so existing/mock
  // implementers need not provide it; the four SDK adapters do. The plan is NEVER shown to the
  // reader; it only steers the prompts.
  writeStoryBible?(req: StoryBibleRequest): Promise<string>
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
