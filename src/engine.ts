// Public engine barrel.
//
// The lesson engine (step checkers, balance-scale helpers, progress/scoring, branch-aware
// recommendations, and the lesson dependency graph) now lives under `src/engine/*`, split so
// each concern can be edited in isolation. This file re-exports the same public API so every
// existing import from './engine' keeps working unchanged.

export type {
  BalanceCheckMeta,
  LessonGraphConnector,
  LessonGraphNode,
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

export { selectNextQuestion, storyCandidateKey } from './engine/storyMode/selectNextQuestion'
export type { SelectNextInput, StoryCandidate } from './engine/storyMode/selectNextQuestion'

export {
  createVariantSeed,
  mulberry32,
  randomizeQuestionNumbers,
} from './engine/storyMode/randomizeQuestionNumbers'
export type { Rng } from './engine/storyMode/randomizeQuestionNumbers'

export { isThemedStepCoherent } from './engine/storyMode/themedCoherence'

// Story Mode question-architecture bank (WAVE 3): the code-authoritative catalog, the lesson-gated
// selector, and the pure rebuild/key helpers the story layer drives from.
export { ARCHITECTURE_CATALOG } from './engine/storyMode/questionBank/catalog'
export { selectNextArchitecture } from './engine/storyMode/questionBank/selectArchitecture'
export type { SelectArchitectureInput } from './engine/storyMode/questionBank/selectArchitecture'
export { architectureKey, generateForArchitecture } from './engine/storyMode/questionBank/rebuild'
export type {
  ArchitectureStepType,
  GeneratedQuestion,
  ParamSlot,
  QuestionArchitecture,
} from './engine/storyMode/questionBank/architectureTypes'
