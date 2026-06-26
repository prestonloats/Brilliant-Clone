// Story Mode next-question selection.
//
// A pure, fully unit-testable selector (modeled on `recommendations.ts`) that picks the next
// question for the endless Story Mode review loop. It draws ONLY from lessons the learner has
// already completed, keeps just the four text-rethemable assessed step types, avoids recently
// served questions without ever emptying the pool, and weights remaining candidates by
// existing mastery/recency signals. The actual re-theming and grading happen elsewhere; this
// module only chooses which bundled `LessonStep` to surface next.
//
// See STORY_MODE_IMPLEMENTATION_PLAN.md section 4 for the authoritative algorithm.

import type { AttemptEvent, Lesson, LessonId, LessonStep, SkillMastery } from '../../domain'
import { MASTERY_READY_THRESHOLD, type ProgressByLesson } from '../types'
import { hasCompletedLesson, isAssessedLessonStep } from '../progress'

export type StoryCandidate = {
  lessonId: LessonId
  step: LessonStep
}

export type SelectNextInput = {
  progressByLesson: ProgressByLesson
  lessonCatalog: Record<LessonId, Lesson>
  lessonOrder: LessonId[]
  mastery: SkillMastery[]
  attempts: AttemptEvent[]
  // session.servedStepIds, most-recent last, each value `${lessonId}:${stepId}`.
  servedStepIds: string[]
  // A single candidate key (`${lessonId}:${stepId}`) to ALWAYS avoid when possible, on top of the
  // recency window. Used by the prefetch to exclude the question CURRENTLY on screen — which is not
  // yet in `servedStepIds` (that only grows on solve), so without this the prefetch could re-pick
  // the very question being answered. Honored unless it is the only candidate (small pools still
  // never empty the selection).
  excludeKey?: string
  // Injectable for deterministic tests; defaults to Math.random.
  rng?: () => number
}

// The four assessed step types whose surface text can be re-themed safely (their answer is
// data, not geometry). Spatial/visual steps and non-assessed concept steps are excluded in v1.
const RETHEMABLE_STEP_TYPES: ReadonlySet<LessonStep['type']> = new Set<LessonStep['type']>([
  'input',
  'mcq',
  'operation-choice',
  'sequence',
])

// Never avoid more than this many recently served questions (so the pool stays varied without
// the anti-repeat window growing unbounded as the learner solves more and more).
const MAX_RECENT_WINDOW = 20

// Weight multipliers (section 4.2). Base weight is 1; these nudge selection toward weak/missed
// material while keeping consecutive questions varied by topic.
const STRUGGLE_MULTIPLIER = 2
const MASTERED_MULTIPLIER = 0.75
const RECENT_MISS_MULTIPLIER = 1.5
const SAME_LESSON_MULTIPLIER = 0.6

// Anti-repeat memory key. Must match StorySession.servedStepIds (`${lessonId}:${stepId}`).
export const storyCandidateKey = (candidate: StoryCandidate): string =>
  `${candidate.lessonId}:${candidate.step.id}`

// The most recent attempt (by timestamp) recorded for this candidate's source step, if any.
const mostRecentAttempt = (
  attempts: AttemptEvent[],
  candidate: StoryCandidate,
): AttemptEvent | undefined =>
  attempts
    .filter((attempt) => attempt.lessonId === candidate.lessonId && attempt.stepId === candidate.step.id)
    .reduce<AttemptEvent | undefined>((latest, attempt) => {
      if (!latest) return attempt
      return Date.parse(attempt.at) >= Date.parse(latest.at) ? attempt : latest
    }, undefined)

const candidateWeight = (
  candidate: StoryCandidate,
  lesson: Lesson,
  masteryBySkill: Map<SkillMastery['skillId'], SkillMastery>,
  attempts: AttemptEvent[],
  previousLessonId: string | undefined,
): number => {
  let weight = 1

  // Mastery struggle/mastered per lesson skill: weak skills surface more, mastered skills less.
  // Skills with no recorded mastery yet stay neutral.
  for (const skillId of lesson.skillIds) {
    const score = masteryBySkill.get(skillId)?.score
    if (score === undefined) continue
    weight *= score < MASTERY_READY_THRESHOLD ? STRUGGLE_MULTIPLIER : MASTERED_MULTIPLIER
  }

  // Resurface material the learner most recently got wrong.
  const latestAttempt = mostRecentAttempt(attempts, candidate)
  if (latestAttempt && !latestAttempt.correct) weight *= RECENT_MISS_MULTIPLIER

  // Lightly vary topic away from the lesson of the immediately previous served step.
  if (previousLessonId !== undefined && candidate.lessonId === previousLessonId) {
    weight *= SAME_LESSON_MULTIPLIER
  }

  return weight
}

// Deterministic weighted random pick: walk the cumulative weights until `rng()` lands in a band.
const weightedPick = (
  candidates: StoryCandidate[],
  weights: number[],
  rng: () => number,
): StoryCandidate => {
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

// Returns the chosen candidate, or null only when there are zero eligible candidates (the
// caller then shows the "complete more lessons" empty state).
export function selectNextQuestion(input: SelectNextInput): StoryCandidate | null {
  const { progressByLesson, lessonCatalog, lessonOrder, mastery, attempts, servedStepIds, excludeKey } = input
  const rng = input.rng ?? Math.random

  // 1. Eligible pool: assessed, rethemable steps drawn only from completed lessons.
  const completedLessonIds = lessonOrder.filter((id) => hasCompletedLesson(progressByLesson[id]))
  const pool: StoryCandidate[] = completedLessonIds.flatMap((lessonId) => {
    const lesson = lessonCatalog[lessonId]
    if (!lesson) return []
    return lesson.steps
      .filter((step) => isAssessedLessonStep(step) && RETHEMABLE_STEP_TYPES.has(step.type))
      .map((step) => ({ lessonId, step }))
  })

  if (pool.length === 0) return null

  // 2. Anti-repeat window. Cap N at pool.length - 1 so we never filter the pool to empty; when
  //    everything in the window has been seen, fall back to the full pool (endless, oldest-first).
  //    `excludeKey` (the on-screen question, not yet in servedStepIds) is also avoided, but the
  //    "never empty the pool" safety is preserved by relaxing in stages.
  const windowSize = Math.max(0, Math.min(pool.length - 1, MAX_RECENT_WINDOW))
  const recent = new Set(windowSize > 0 ? servedStepIds.slice(-windowSize) : [])
  const isExcluded = (candidate: StoryCandidate): boolean =>
    excludeKey !== undefined && storyCandidateKey(candidate) === excludeKey
  let candidates = pool.filter((candidate) => !recent.has(storyCandidateKey(candidate)) && !isExcluded(candidate))
  // Relax recency first (but still avoid the on-screen question), then drop even that as a last
  // resort, so a tiny pool (e.g. one candidate) always yields something rather than null.
  if (candidates.length === 0) candidates = pool.filter((candidate) => !isExcluded(candidate))
  if (candidates.length === 0) candidates = pool

  // 3. Weight for variety and difficulty using existing mastery/recency signals.
  const masteryBySkill = new Map(mastery.map((entry) => [entry.skillId, entry]))
  const previousKey = servedStepIds[servedStepIds.length - 1]
  const previousLessonId = previousKey ? previousKey.split(':')[0] : undefined
  const weights = candidates.map((candidate) =>
    candidateWeight(candidate, lessonCatalog[candidate.lessonId], masteryBySkill, attempts, previousLessonId),
  )

  // 4. Weighted random pick (deterministic given `rng`).
  return weightedPick(candidates, weights, rng)
}
