// Pure persisted-question (de)serialization for Story Mode (WAVE 3b).
//
// The seam between a live, renderable `LessonStep` and the `ThemedQuestion` stored in a session.
// Kept React-free (no hooks, no `import.meta`) so the controller stays thin AND so the round-trip
// (build -> persist -> rehydrate) is unit-testable under `node --test`, which the hook itself is
// not. Two question lineages share these helpers:
//   - ARCHITECTURE questions (the WAVE 3 question bank): rebuilt deterministically by
//     `architectureId` + `paramSeed` straight from code, so the answer key is ALWAYS recomputed in
//     code and never trusted from storage (mirrors how `variantSeed` rebuilds a number variant).
//   - LEGACY lesson-reuse questions (already-saved sessions, no `architectureId`): rebuilt from the
//     bundled lesson step + `variantSeed` exactly as before, for back-compat.
//
// The LLM only ever supplied DISPLAY TEXT; `applyRetheme` overlays that text onto a freshly-rebuilt
// canonical/variant base and is the single guarantee a re-theme can never change grading.

import { lessons } from '../domain'
import type { LessonStep, ThemedQuestion } from '../domain'
import {
  architectureKey,
  generateForArchitecture,
  isThemedStepCoherent,
  mulberry32,
  randomizeQuestionNumbers,
} from '../engine'
import type { QuestionArchitecture } from '../engine'
import { applyRetheme } from './applyRetheme'
import type { RethemeResult } from './storyAi'

const nowIso = (): string => new Date().toISOString()

// The anti-repeat / persisted-identity key for a question, matching what the selector compares
// against and what `servedStepIds` records. Architecture questions use the bank's `arch:<id>` key
// (so `selectNextArchitecture`'s `servedKeys`/`excludeKey` line up); legacy lesson-reuse questions
// keep the `${lessonId}:${stepId}` form (`storyCandidateKey`).
export const questionKey = (question: ThemedQuestion): string =>
  question.architectureId
    ? architectureKey(question.architectureId)
    : `${question.sourceLessonId}:${question.sourceStepId}`

// Persist a freshly-served ARCHITECTURE question: its source identity + the rethemed display text +
// the `paramSeed` that rebuilds the EXACT filled instance (and its code-computed key) on resume.
// Never stores an answer key — the key is recomputed from `architectureId` + `paramSeed` by code.
// `sourceLessonId`/`sourceStepId`/`stepType` stay populated (sourceStepId = `arch:<id>`) so the
// existing persistence guards and source-identity fields keep working; `variantSeed` is left unset.
export const toThemedQuestion = (
  architecture: QuestionArchitecture,
  themedStep: LessonStep,
  themed: boolean,
  paramSeed: number,
  now: string = nowIso(),
): ThemedQuestion => {
  const question: ThemedQuestion = {
    architectureId: architecture.id,
    paramSeed,
    sourceLessonId: architecture.requiredLessonId,
    sourceStepId: architectureKey(architecture.id),
    stepType: themedStep.type,
    themedPrompt: 'prompt' in themedStep ? themedStep.prompt : '',
    themed,
    generatedAt: now,
  }
  if (themedStep.type === 'mcq') {
    question.themedOptions = themedStep.options.map((option) => ({ id: option.id, label: option.label }))
  } else if (themedStep.type === 'operation-choice') {
    question.themedOptions = themedStep.choices.map((choice) => ({ id: choice.id, label: choice.label }))
  } else if (themedStep.type === 'sequence') {
    question.themedTiles = themedStep.tiles.map((tile) => ({ id: tile.id, label: tile.label }))
  }
  return question
}

// Rebuild the overlay request from the persisted themed display text (no answer key — applyRetheme
// only ever copies the key from `base`).
const rethemeFromQuestion = (question: ThemedQuestion): RethemeResult => ({
  themedPrompt: question.themedPrompt,
  ...(question.themedOptions ? { themedOptions: question.themedOptions } : {}),
  ...(question.themedTiles ? { themedTiles: question.themedTiles } : {}),
})

// Overlay the persisted themed text onto a freshly-rebuilt base via the SAME pure reconstructor the
// live path uses. For an un-themed (fallback) question we show the coherent base verbatim. For a
// themed one, `applyRetheme` validates the id-sets and already falls back to `base` (themed:false)
// on any mismatch; a second coherence check (defense-in-depth on resume) drops a numerically
// incoherent saved theme so the question/equation/answer can never disagree.
const overlayThemed = (base: LessonStep, question: ThemedQuestion): { step: LessonStep; themed: boolean } => {
  if (!question.themed) return { step: base, themed: false }
  const applied = applyRetheme(base, rethemeFromQuestion(question))
  if (applied.themed && !isThemedStepCoherent(base, applied.step)) {
    return { step: base, themed: false }
  }
  return applied
}

// Re-hydrate a persisted question back into a renderable `LessonStep` (+ whether it is themed), or
// null when its source can no longer be rebuilt (an unknown architecture id, or a bundled lesson
// step that no longer exists) so the caller can treat it like a stale question.
export const rehydrateQuestion = (question: ThemedQuestion): { step: LessonStep; themed: boolean } | null => {
  // NEW: architecture question — rebuild the canonical step + code-computed key from id + seed.
  if (question.architectureId) {
    const base = generateForArchitecture(question.architectureId, question.paramSeed ?? 0)?.step
    if (!base) return null
    return overlayThemed(base, question)
  }
  // LEGACY: lesson-reuse question — rebuild the exact number variant from the bundled step + seed
  // (legacy questions with no seed rebuild to the original numbers unchanged), unchanged for
  // back-compat with already-saved sessions.
  const original = lessons[question.sourceLessonId]?.steps.find((step) => step.id === question.sourceStepId)
  if (!original) return null
  const variantStep =
    question.variantSeed !== undefined
      ? randomizeQuestionNumbers(original, mulberry32(question.variantSeed))
      : original
  return overlayThemed(variantStep, question)
}
