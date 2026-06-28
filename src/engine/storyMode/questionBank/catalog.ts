// Story Mode question-architecture catalog (WAVE 3a).
//
// Aggregates the six pure question architectures (WAVE 2) into ONE stable, ordered list — the
// "question bank" the lesson-gated selector draws from — plus an id -> architecture map for O(1)
// rebuild lookups. The order is fixed and meaningful: the selector preserves catalog order when it
// filters, and `rebuild.ts` resolves a persisted `architectureId` against the map. New
// architectures append to the END so persisted keys / deterministic ordering stay stable.

import type { SkillId } from '../../../domain'
import type { QuestionArchitecture } from './architectureTypes'
import { oneStepLinearArchitecture } from './architectures/oneStepLinear'
import { oneStepSequenceArchitecture } from './architectures/oneStepSequence'
import { twoStepLinearArchitecture } from './architectures/twoStepLinear'
import { variablesBothSidesArchitecture } from './architectures/variablesBothSides'
import { coordinateWalkArchitecture } from './architectures/coordinateWalk'
import { lineValueArchitecture } from './architectures/lineValue'
import { combineLikeTermsArchitecture } from './architectures/combineLikeTerms'
import { balanceEqualityArchitecture } from './architectures/balanceEquality'
import { inverseOperationArchitecture } from './architectures/inverseOperation'

// The bank, in a stable order. Every id is unique and every `generate(rng).step.type` equals the
// declared `stepType` (asserted by tests). At least one architecture is unlocked by completing
// `one-step-equations`, so a just-past-the-gate learner always has questions to practice.
export const ARCHITECTURE_CATALOG: QuestionArchitecture[] = [
  oneStepLinearArchitecture,
  oneStepSequenceArchitecture,
  twoStepLinearArchitecture,
  variablesBothSidesArchitecture,
  coordinateWalkArchitecture,
  lineValueArchitecture,
  // Phase 3 coverage: the remaining skills taught by the lessons (balancing-equations' equality +
  // inverse-operations, and the like-terms half of the Like Terms lesson), appended at the END so
  // existing persisted architecture keys / deterministic ordering stay stable.
  combineLikeTermsArchitecture,
  balanceEqualityArchitecture,
  inverseOperationArchitecture,
]

// id -> architecture, derived from the catalog so it can never drift from it. Used by `rebuild.ts`
// to resolve a persisted `architectureId` (and by the selector indirectly through the key helpers).
export const ARCHITECTURE_BY_ID: Map<string, QuestionArchitecture> = new Map(
  ARCHITECTURE_CATALOG.map((architecture) => [architecture.id, architecture]),
)

// The skill an architecture trains, by id, or undefined for an unknown id. Lets the story layer map
// a served architecture question back to the skill whose practice state its outcome should update.
export const skillForArchitecture = (id: string): SkillId | undefined => ARCHITECTURE_BY_ID.get(id)?.skillId
