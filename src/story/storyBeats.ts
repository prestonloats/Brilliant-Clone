// PURE Story Mode beat/request helpers (extracted from useStorySession.ts).
//
// This module is intentionally React-free and side-effect-free: every export is a pure function
// (the lone async one, `sceneForBeat`, only awaits the already-pure `selectSceneForBeat` through an
// INJECTED matcher). None of these close over component state, so they live here next to the
// reducer's pure transitions and are unit-testable under `node --test` (the repo has no DOM/React
// test harness). `useStorySession` imports them back and remains the thin React seam.

import type { LessonStep, SceneId, StorySession, StoryTheme } from '../domain'
import type { RethemeRequest, SceneMatchRequest, StoryAI } from './storyAi'
import type { StoryAiEnv } from './selectStoryProvider'
import { isOutputSafe } from './safety'
import { storyFallbackBeat, type StoryBeatKind } from './storyPrompts'
import { selectSceneForBeat } from './selectSceneForBeat'
import { CHECKPOINT_INTERVAL, KEEP_VERBATIM_SEGMENTS, chapterBeatFor } from './storySessionReducer'

// The newest chapter whose RECAP can be looked back on from the checkpoint/outcome screens. On the
// OUTCOME screen the current chapter's recap already holds its outcome (and the setup that prompted
// it), so it is reviewable; on the CHECKPOINT screen it does not yet, so the newest reviewable recap
// is the previous chapter. Returns 0 when nothing is reviewable (e.g. the very first checkpoint).
export const newestRecapChapter = (session: StorySession): number => {
  const currentChapter = Math.floor(session.questionsSolvedTotal / CHECKPOINT_INTERVAL) + 1
  const currentHasOutcome = Boolean(chapterBeatFor(session, currentChapter)?.outcomeText)
  const newest = currentHasOutcome ? currentChapter : currentChapter - 1
  return newest >= 1 && chapterBeatFor(session, newest) ? newest : 0
}

// Resolve the text to COMMIT for a narrated beat, given what the AI returned (or null on failure).
// Guarantees two things the old single-canned-string path did not:
//   1. DISTINCTNESS — the committed text never equals the immediately previous beat's text, so a
//      learner's choice can never "reprint the same paragraph" (a failed continuation rotates through
//      theme-aware fallback variants until it differs).
//   2. THEME-AWARE FALLBACK — a failed/blocked/empty generation falls back to a per-beat, on-theme
//      beat (storyFallbackBeat) instead of one generic canned bridge shared by every beat type.
// Returns whether the committed text is a fallback so the caller can supply a default scene image.
export const resolveBeatText = (
  session: StorySession,
  generated: string | null,
  kind: StoryBeatKind,
): { text: string; isFallback: boolean } => {
  const previous = session.segments[session.segments.length - 1]?.text.trim() ?? ''
  const clean = (generated ?? '').trim()
  if (clean && isOutputSafe(clean) && clean !== previous) return { text: clean, isFallback: false }
  // Fallback: rotate variants so a duplicate (or a run of fallbacks) never repeats the prior beat.
  const base = session.segments.length
  for (let offset = 0; offset < 4; offset += 1) {
    const candidate = storyFallbackBeat(kind, session.theme, base + offset).trim()
    if (candidate && candidate !== previous) return { text: candidate, isFallback: true }
  }
  return { text: storyFallbackBeat(kind, session.theme, base), isFallback: true }
}

export const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

export const choiceRejectionMessage = (reason?: string): string => {
  if (reason === 'empty') return 'Type what you want to do next to continue the adventure.'
  if (reason === 'profanity' || reason === 'unsafe') {
    return "Let's keep the story friendly for everyone — try describing a different action."
  }
  return 'Try describing your next move a little differently.'
}

// A provider is "configured" purely from env, WITHOUT loading any SDK (the dynamic import only
// happens lazily in `ensureAi`, so opening CourseMap never pulls in @google/genai).
export const isProviderConfigured = (env: StoryAiEnv): boolean => {
  // The proxy provider keeps the key server-side; it's configured once the proxy URL is set
  // (createProxyProvider requires VITE_STORY_AI_PROXY_URL).
  if (env.VITE_STORY_AI_PROVIDER === 'proxy') return Boolean(env.VITE_STORY_AI_PROXY_URL)
  if (env.VITE_STORY_AI_PROVIDER === 'firebase') return true
  // Direct OpenAI developer key (the user's OPENAI_API_KEY, or a VITE_OPENAI_API_KEY fallback) —
  // mirrors the selection in createStoryAI so the entry gate matches the live provider.
  if ((env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY ?? '').trim()) return true
  return Boolean(env.VITE_GEMINI_API_KEY)
}

// The image shown on the immediately-previous beat (if any), so a new beat can avoid repeating the
// same background back-to-back — the visual analogue of resolveBeatText's previous-text de-dupe.
export const previousSceneId = (session: StorySession): SceneId | undefined =>
  session.segments[session.segments.length - 1]?.sceneId

// Build the interest->scene matcher (rules 5 & 6) from the adapter, or undefined when there is no
// adapter / the adapter has no matcher. It is INJECTED into `selectSceneForBeat`, the only impure
// part of the otherwise-pure dispatcher; the non-null assertion is guarded by the preceding check.
export const matcherFor = (
  ai: StoryAI | null,
): ((req: SceneMatchRequest) => Promise<SceneId | null>) | undefined =>
  ai?.matchSceneToInterests ? (req) => ai.matchSceneToInterests!(req) : undefined

// Resolve a scene image for a beat through the scene-selection DISPATCHER (`selectSceneForBeat`),
// which routes the theme's interest-selection mode to the matching categorized rule (1-6) and folds
// in the scene anti-repeat via `avoidSceneId`. A FALLBACK beat skips the (usually degraded) AI
// matcher entirely — as before — so it resolves instantly to an offline, on-theme scene; a real beat
// may consult the matcher for the custom modes (5 & 6). The dispatcher's `settingTieIn` flag matters
// only at START (it seeds the premise), so a per-beat call reads just the chosen id and maps a null
// pick (the degenerate empty-pool case) to "no image".
export const sceneForBeat = async (
  ai: StoryAI | null,
  theme: StoryTheme,
  isFallback: boolean,
  avoidSceneId: SceneId | undefined,
): Promise<SceneId | undefined> => {
  const matcher = isFallback ? undefined : matcherFor(ai)
  const selection = await selectSceneForBeat(theme, { matcher, avoidSceneId })
  return selection.sceneId ?? undefined
}

// Build the re-theme request from a bundled step: display text + option/tile labels only, never
// the answer key (accept/correctId/correctOrder stay in the original object).
export const buildRethemeRequest = (theme: StoryTheme, narrative: string, step: LessonStep): RethemeRequest => {
  if (step.type === 'mcq') {
    return {
      theme,
      recentNarrative: narrative,
      stepType: 'mcq',
      prompt: step.prompt,
      options: step.options.map((option) => ({ id: option.id, label: option.label })),
    }
  }
  if (step.type === 'operation-choice') {
    return {
      theme,
      recentNarrative: narrative,
      stepType: 'operation-choice',
      prompt: step.prompt,
      ...(step.equation ? { equation: step.equation } : {}),
      options: step.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    }
  }
  if (step.type === 'sequence') {
    return {
      theme,
      recentNarrative: narrative,
      stepType: 'sequence',
      prompt: step.prompt,
      ...(step.equation ? { equation: step.equation } : {}),
      tiles: step.tiles.map((tile) => ({ id: tile.id, label: tile.label })),
    }
  }
  // input (the only remaining rethemable type)
  const equation = step.type === 'input' ? step.equation : undefined
  const prompt = 'prompt' in step ? step.prompt : ''
  return {
    theme,
    recentNarrative: narrative,
    stepType: 'input',
    prompt,
    ...(equation ? { equation } : {}),
  }
}

// All display text of a (themed) step, for the output-moderation pass before we show it.
export const themedStepText = (step: LessonStep): string => {
  const parts: string[] = []
  if ('prompt' in step && step.prompt) parts.push(step.prompt)
  if (step.type === 'mcq') parts.push(...step.options.map((option) => option.label))
  else if (step.type === 'operation-choice') parts.push(...step.choices.map((choice) => choice.label))
  else if (step.type === 'sequence') parts.push(...step.tiles.map((tile) => tile.label))
  return parts.join(' ')
}

// The narrative fed to `ai.summarize` when the segment buffer grows past the compaction threshold:
// the rolling summary followed by every beat OLDER than the KEEP_VERBATIM_SEGMENTS most-recent ones
// (those stay verbatim), joined into one block. Pure so the controller's `maybeCompact` only owns
// the threshold check + the AI call.
export const buildCompactionNarrative = (session: StorySession): string => {
  const older = session.segments.slice(0, session.segments.length - KEEP_VERBATIM_SEGMENTS)
  return [session.narrativeSummary, ...older.map((segment) => segment.text)]
    .filter(Boolean)
    .join('\n\n')
}
