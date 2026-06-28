// Story Mode question-architecture type contract + pure rng helpers (WAVE 1 foundation).
//
// Story Mode is moving OFF reusing bundled lesson questions and onto a separate,
// code-authoritative "question-architecture" bank: each architecture is a tiny PURE generator
// that, given a seeded `Rng`, fills its randomized slots and emits ONE ready-to-render AND
// gradable question together with the canonical answer key it computed IN CODE. This file owns
// only the shared type contract every architecture implements plus the two deterministic rng
// helpers authors draw from; the architectures themselves, the catalog/selector, and the
// controller integration are built in later waves on top of these types.
//
// CORRECTNESS / DETERMINISM INVARIANT (the whole point): `generate(rng)` must be a PURE function
// of its rng draws so a persisted `paramSeed` (see `ThemedQuestion`) rebuilds the EXACT same
// filled instance AND answer key on resume — exactly as `variantSeed` rebuilds a number variant
// via `randomizeQuestionNumbers`. The key is always computed in code here, never stored.

import type { LessonId, LessonStep, SkillId } from '../../../domain'
import type { Rng } from '../randomizeQuestionNumbers'

// The 4 rethemable/assessable step types Story Mode serves. Equals the `ThemedQuestion.stepType`
// union; every architecture's generated step is exactly one of these.
export type ArchitectureStepType = 'input' | 'mcq' | 'operation-choice' | 'sequence'

// Declarative description of one randomized slot in an architecture: documentation for authors
// and a place tests can read the intended bounds. The actual draw happens inside `generate` via
// `randInt`/`pick`. `step` snaps the value to a grid (e.g. multiples of 5); `note` is a hint.
export type ParamSlot = {
  name: string
  min: number
  max: number
  step?: number
  note?: string
}

// One filled, ready-to-render-AND-grade question instance produced by `generate`.
export type GeneratedQuestion = {
  // A canonical renderable + gradable lesson step (one of the 4 rethemable types) carrying its
  // own CODE-computed answer key, so the real graders accept `answer` below with no stored key.
  step: Extract<LessonStep, { type: ArchitectureStepType }>
  // The canonical correct answer, in the EXACT form the matching grader accepts:
  //   input                  -> a string the learner could type ("6", "(-2, -5)")
  //   mcq / operation-choice -> the correct option id
  //   sequence               -> the correct order (string[])
  // Lets tests PROVE the in-code key by grading `answer` with the REAL checker for `step.type`.
  answer: string | string[]
}

// The contract every question architecture implements. An architecture is a stable, pure
// generator for ONE skill/step-type: served only once the learner has completed
// `requiredLessonId`, identified by a stable `id` (its persisted identity + anti-repeat key).
export type QuestionArchitecture = {
  id: string
  requiredLessonId: LessonId
  skillId: SkillId
  // MUST equal `generate(rng).step.type` for every rng (the catalog/tests assert this holds).
  stepType: ArchitectureStepType
  slots: ParamSlot[]
  // Skills that must be PRACTICE-MASTERED before this architecture is served in Story Mode (Phase 3d
  // mastery learning), ON TOP of `requiredLessonId` completion. Absent = entry-tier (no mastery
  // prerequisite), so a harder skill stays locked until its prerequisite is genuinely mastered.
  masteryPrereqs?: SkillId[]
  // PURE + deterministic per `rng`, and NEVER throws: fills the slots and computes the answer key
  // in code. Two calls driven by equally-seeded rngs return deep-equal results (resume safety).
  generate(rng: Rng): GeneratedQuestion
}

// --- Pure rng helpers for architecture authors ----------------------------------------------
//
// `Rng` is a 0..1 source (see `mulberry32`); these helpers draw EXACTLY ONCE, so an author can
// reason precisely about seed consumption. `randInt` mirrors the private one in
// `randomizeQuestionNumbers.ts`, extended with an optional `step` grid.

// Inclusive integer in [min, max]. With a positive `step`, returns a value on the grid
// min, min+step, min+2*step, ... that does not exceed max (a range whose width is not a whole
// multiple of `step` is truncated at the last grid point <= max, so the result never overshoots
// `max`). With no/zero/negative `step`, every integer in [min, max] is equally likely.
export function randInt(rng: Rng, min: number, max: number, step?: number): number {
  if (step !== undefined && step > 0) {
    const buckets = Math.floor((max - min) / step)
    const index = Math.floor(rng() * (buckets + 1))
    return min + index * step
  }
  return min + Math.floor(rng() * (max - min + 1))
}

// Uniformly pick one element of `items`, drawing once. Callers pass a non-empty list.
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}

// Inclusive integer in [min, max] EXCLUDING 0 (assumes min < 0 < max), drawing the rng once so
// seed consumption stays predictable for resume. Shared by the linear / line-value architectures.
export function nonzeroInt(rng: Rng, min: number, max: number): number {
  const negatives = -min
  const index = randInt(rng, 0, negatives + max - 1)
  return index < negatives ? min + index : index - negatives + 1
}

// Typed forms a learner might enter for a numeric answer: the bare number (the guaranteed match)
// plus the `<var> =` styles the bundled lessons author. `checkInputStep` only strips a leading
// `<var>=` prefix, so the bare value is the canonical key.
export function numericAccept(value: number, variable = 'x'): string[] {
  return Array.from(new Set([String(value), `${variable}=${value}`, `${variable} = ${value}`]))
}
