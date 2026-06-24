import type { Lesson, LessonId } from '../types'
import { balancingEquationsLesson } from './balancing-equations'
import { oneStepEquationsLesson } from './one-step-equations'
import { twoStepEquationsLesson } from './two-step-equations'
import { likeTermsVariablesBothSidesLesson } from './like-terms'
import { coordinatePlaneLesson } from './coordinate-plane'
import { graphingLinesLesson } from './graphing-lines'

// Re-export individual lessons so they can be imported directly (e.g., in tests)
// without pulling in the whole catalog.
export {
  balancingEquationsLesson,
  oneStepEquationsLesson,
  twoStepEquationsLesson,
  likeTermsVariablesBothSidesLesson,
  coordinatePlaneLesson,
  graphingLinesLesson,
}

// The lesson catalog keyed by id. Each lesson lives in its own file so parallel
// agents can edit one lesson without touching this barrel or other lessons.
export const lessons: Record<LessonId, Lesson> = {
  'balancing-equations': balancingEquationsLesson,
  'one-step-equations': oneStepEquationsLesson,
  'two-step-equations': twoStepEquationsLesson,
  'like-terms-variables-both-sides': likeTermsVariablesBothSidesLesson,
  'coordinate-plane': coordinatePlaneLesson,
  'graphing-lines': graphingLinesLesson,
}
