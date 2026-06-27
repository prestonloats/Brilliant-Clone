// Story Mode architecture rebuild + key helpers (WAVE 3a).
//
// PURE engine-layer helpers that rebuild the EXACT filled question instance (and its code-computed
// answer key) for a persisted architecture id + seed, mirroring how `randomizeQuestionNumbers`
// rebuilds a number variant from a `variantSeed`. This is the resume/grade path: given the
// `architectureId` and `paramSeed` stored on a `ThemedQuestion`, it reproduces the canonical step
// deterministically (same seed -> deep-equal result), so the answer key is always recomputed by
// code and never trusted from storage.
//
// IMPORTANT: this file must NOT import from `src/story/*` — the story layer imports the engine
// barrel, so importing back would create a cycle. Themed-text overlay (`applyRetheme`) happens in
// the story layer (WAVE 3b) on top of the canonical step this module returns, never here.

import type { SkillId } from '../../../domain'
import type { GeneratedQuestion } from './architectureTypes'
import { ARCHITECTURE_BY_ID } from './catalog'
import { mulberry32 } from '../randomizeQuestionNumbers'

// The anti-repeat / persisted-identity key for an architecture. `StorySession.servedStepIds` and
// `ThemedQuestion.sourceStepId` both store architecture questions in this form.
export const architectureKey = (id: string): string => `arch:${id}`

// The `arch:` prefix every architecture question's key/stepId carries.
const ARCHITECTURE_KEY_PREFIX = 'arch:'

// Map a persisted attempt/served KEY (`arch:<id>`, as stored in `AttemptEvent.stepId` /
// `servedStepIds`) back to the skill it trained, or undefined for a non-architecture key. Unlike
// `skillForArchitecture` (which takes a bare id), this accepts the prefixed key the story/attempt
// layers actually persist — used by retention insights to group story attempts by skill.
export const skillForStepId = (stepId: string): SkillId | undefined =>
  stepId.startsWith(ARCHITECTURE_KEY_PREFIX)
    ? ARCHITECTURE_BY_ID.get(stepId.slice(ARCHITECTURE_KEY_PREFIX.length))?.skillId
    : undefined

// Rebuild the canonical filled question for `id` using `paramSeed`. Deterministic: the same seed
// always yields a deep-equal result (resume safety). Returns null for an unknown id so callers can
// fall back gracefully instead of throwing.
export function generateForArchitecture(id: string, paramSeed: number): GeneratedQuestion | null {
  const architecture = ARCHITECTURE_BY_ID.get(id)
  if (!architecture) return null
  return architecture.generate(mulberry32(paramSeed))
}
