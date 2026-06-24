// Public engine barrel.
//
// The lesson engine (step checkers, balance-scale helpers, progress/scoring, branch-aware
// recommendations, and the lesson dependency graph) now lives under `src/engine/*`, split so
// each concern can be edited in isolation. This file re-exports the same public API so every
// existing import from './engine' keeps working unchanged.

export type {
  BalanceCheckMeta,
  CheckResult,
  CourseProgressSummary,
  LessonGraph,
  LessonGraphConnector,
  LessonGraphNode,
  LessonGraphStage,
  NextLessonRecommendation,
  ProgressByLesson,
} from './engine/types'
export { MASTERY_READY_THRESHOLD } from './engine/types'

export {
  checkBalanceStep,
  checkDragTermsStep,
  checkInputStep,
  checkManipulativeStep,
  checkOperationChoiceStep,
  checkPlotStep,
  checkSequenceStep,
  checkSliderStep,
  normalizeExpression,
  quadrantOf,
} from './engine/checkers'

export { applyBalanceOperation, isLevel, sideTotal } from './engine/balance'

export {
  applyStepResult,
  calculateLessonScore,
  createInitialProgress,
  getBestLessonScore,
  getLatestLessonScore,
  getLessonCompletionHistory,
  hasCompletedLesson,
  isAssessedLessonStep,
  restartLessonProgress,
} from './engine/progress'

export { getRecommendedNextLesson, isLessonUnlocked } from './engine/recommendations'

export {
  buildLessonGraph,
  getCourseProgressSummary,
  getRecommendedPathLessonId,
} from './engine/graph'
