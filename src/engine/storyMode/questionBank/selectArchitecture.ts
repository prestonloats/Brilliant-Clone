// Story Mode architecture selection (WAVE 3a).
//
// A pure, fully unit-testable selector — the question-bank analogue of `selectNextQuestion` — that
// picks the next architecture for the endless Story Mode review loop. It draws ONLY from
// architectures whose `requiredLessonId` the learner has completed, avoids recently served
// architectures without ever emptying the pool, honors an `excludeKey` (the on-screen question),
// and weights the remaining candidates by existing mastery / recent-miss / topic-variety signals.
// It does NOT generate the question — `rebuild.ts` rebuilds it from the chosen id + a seed.
//
// SELF-CONTAINED by design: it re-implements the gating / anti-repeat / weighting locally rather
// than calling `selectNextQuestion`, because it selects CODE architectures (keyed `arch:<id>`),
// not bundled lesson steps (keyed `${lessonId}:${stepId}`). The algorithm mirrors
// `selectNextQuestion` step-for-step so the two selectors behave consistently.

import type { AttemptEvent, SkillMastery } from '../../../domain'
import { MASTERY_READY_THRESHOLD, type ProgressByLesson } from '../../types'
import { hasCompletedLesson } from '../../progress'
import type { Rng } from '../randomizeQuestionNumbers'
import type { QuestionArchitecture } from './architectureTypes'
import { ARCHITECTURE_CATALOG } from './catalog'
import { architectureKey } from './rebuild'

export type SelectArchitectureInput = {
  // Completion gate: an architecture is eligible only when `progressByLesson[requiredLessonId]` is
  // a completed lesson (mirrors `selectNextQuestion`'s completed-lesson pool).
  progressByLesson: ProgressByLesson
  // Served architecture keys, most-recent last; each is `arch:<id>` (see `architectureKey`).
  // Foreign keys are tolerated — they simply never match a candidate. Defaults to [].
  servedKeys?: string[]
  // A single architecture key (`arch:<id>`) to ALWAYS avoid when possible, on top of the recency
  // window — the question CURRENTLY on screen, which is not yet in `servedKeys` (that only grows on
  // solve). Honored unless it is the only candidate (a tiny pool still never empties).
  excludeKey?: string
  // Mastery signals: weight an architecture's skill up when weak, down when mastered. Defaults to [].
  mastery?: SkillMastery[]
  // Attempt history: boost an architecture whose most recent attempt was wrong. Matched on the
  // architecture key (`arch:<id>`) recorded in `AttemptEvent.stepId`. Defaults to [].
  attempts?: AttemptEvent[]
  // Candidate pool; defaults to the full ARCHITECTURE_CATALOG. Injectable for tests.
  pool?: QuestionArchitecture[]
  // Injectable for deterministic tests; defaults to Math.random.
  rng?: Rng
}

// Never avoid more than this many recently served architectures (kept identical to
// `selectNextQuestion` so anti-repeat behaves the same; the architecture pool is far smaller, so
// the per-call `eligible.length - 1` cap dominates in practice).
const MAX_RECENT_WINDOW = 20

// Weight multipliers (identical to `selectNextQuestion`): nudge selection toward weak/missed
// material while keeping consecutive questions varied by skill.
const STRUGGLE_MULTIPLIER = 2
const MASTERED_MULTIPLIER = 0.75
const RECENT_MISS_MULTIPLIER = 1.5
const SAME_SKILL_MULTIPLIER = 0.6

// The most recent attempt (by timestamp) recorded against this architecture's key, if any.
const mostRecentAttempt = (
  attempts: AttemptEvent[],
  architecture: QuestionArchitecture,
): AttemptEvent | undefined => {
  const key = architectureKey(architecture.id)
  return attempts
    .filter((attempt) => attempt.stepId === key)
    .reduce<AttemptEvent | undefined>((latest, attempt) => {
      if (!latest) return attempt
      return Date.parse(attempt.at) >= Date.parse(latest.at) ? attempt : latest
    }, undefined)
}

const architectureWeight = (
  architecture: QuestionArchitecture,
  masteryBySkill: Map<SkillMastery['skillId'], SkillMastery>,
  attempts: AttemptEvent[],
  previousSkillId: string | undefined,
): number => {
  let weight = 1

  // Mastery struggle/mastered for this architecture's skill: weak skills surface more, mastered
  // skills less. A skill with no recorded mastery yet stays neutral.
  const score = masteryBySkill.get(architecture.skillId)?.score
  if (score !== undefined) {
    weight *= score < MASTERY_READY_THRESHOLD ? STRUGGLE_MULTIPLIER : MASTERED_MULTIPLIER
  }

  // Resurface an architecture whose most recent attempt was wrong.
  const latestAttempt = mostRecentAttempt(attempts, architecture)
  if (latestAttempt && !latestAttempt.correct) weight *= RECENT_MISS_MULTIPLIER

  // Lightly vary the skill away from the immediately previous served architecture.
  if (previousSkillId !== undefined && architecture.skillId === previousSkillId) {
    weight *= SAME_SKILL_MULTIPLIER
  }

  return weight
}

// Deterministic weighted random pick: walk the cumulative weights until `rng()` lands in a band.
const weightedPick = (
  candidates: QuestionArchitecture[],
  weights: number[],
  rng: Rng,
): QuestionArchitecture => {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  // Degenerate guard (weights all zero/invalid): fall back to the first candidate.
  if (!(totalWeight > 0)) return candidates[0]

  let threshold = rng() * totalWeight
  for (let index = 0; index < candidates.length; index += 1) {
    threshold -= weights[index]
    if (threshold < 0) return candidates[index]
  }
  // Floating-point safety net if rounding leaves us at the very end.
  return candidates[candidates.length - 1]
}

// The architecture whose id is encoded in a served `arch:<id>` key, found within `pool`.
const architectureForKey = (
  pool: QuestionArchitecture[],
  key: string | undefined,
): QuestionArchitecture | undefined => {
  if (key === undefined) return undefined
  return pool.find((architecture) => architectureKey(architecture.id) === key)
}

// Returns the chosen architecture, or null only when NO architecture's required lesson is completed
// (the caller then shows the "complete more lessons" empty state).
export function selectNextArchitecture(input: SelectArchitectureInput): QuestionArchitecture | null {
  const { progressByLesson, excludeKey } = input
  const pool = input.pool ?? ARCHITECTURE_CATALOG
  const servedKeys = input.servedKeys ?? []
  const mastery = input.mastery ?? []
  const attempts = input.attempts ?? []
  const rng = input.rng ?? Math.random

  // 1. Eligible pool: architectures whose required lesson is completed (catalog order preserved).
  const eligible = pool.filter((architecture) =>
    hasCompletedLesson(progressByLesson[architecture.requiredLessonId]),
  )
  if (eligible.length === 0) return null

  // 2. Anti-repeat window. Cap N at eligible.length - 1 so we never filter to empty; the on-screen
  //    `excludeKey` is also avoided, with "never empty the pool" preserved by relaxing in stages.
  const windowSize = Math.max(0, Math.min(eligible.length - 1, MAX_RECENT_WINDOW))
  const recent = new Set(windowSize > 0 ? servedKeys.slice(-windowSize) : [])
  const isExcluded = (architecture: QuestionArchitecture): boolean =>
    excludeKey !== undefined && architectureKey(architecture.id) === excludeKey
  let candidates = eligible.filter(
    (architecture) => !recent.has(architectureKey(architecture.id)) && !isExcluded(architecture),
  )
  // Relax recency first (still avoiding the on-screen question), then drop even that as a last
  // resort, so a tiny pool (e.g. one architecture) always yields something rather than null.
  if (candidates.length === 0) candidates = eligible.filter((architecture) => !isExcluded(architecture))
  if (candidates.length === 0) candidates = eligible

  // 3. Weight for difficulty/recency/variety using existing mastery + attempt signals.
  const masteryBySkill = new Map(mastery.map((entry) => [entry.skillId, entry]))
  const previousKey = servedKeys[servedKeys.length - 1]
  const previousSkillId = architectureForKey(pool, previousKey)?.skillId
  const weights = candidates.map((architecture) =>
    architectureWeight(architecture, masteryBySkill, attempts, previousSkillId),
  )

  // 4. Weighted random pick (deterministic given `rng`).
  return weightedPick(candidates, weights, rng)
}
