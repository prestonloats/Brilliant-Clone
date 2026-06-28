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

export {
  createVariantSeed,
  mulberry32,
  randomizeQuestionNumbers,
} from './engine/storyMode/randomizeQuestionNumbers'
export type { Rng } from './engine/storyMode/randomizeQuestionNumbers'

export { isThemedStepCoherent } from './engine/storyMode/themedCoherence'

// Story Mode question-architecture bank (WAVE 3): the code-authoritative catalog, the lesson-gated
// selector, and the pure rebuild/key helpers the story layer drives from.
export { ARCHITECTURE_CATALOG, skillForArchitecture } from './engine/storyMode/questionBank/catalog'
export { selectNextArchitecture } from './engine/storyMode/questionBank/selectArchitecture'
export type { SelectArchitectureInput } from './engine/storyMode/questionBank/selectArchitecture'
export { architectureKey, generateForArchitecture, skillForStepId } from './engine/storyMode/questionBank/rebuild'
export type {
  ArchitectureStepType,
  GeneratedQuestion,
  ParamSlot,
  QuestionArchitecture,
} from './engine/storyMode/questionBank/architectureTypes'

// Story Mode learning-science practice engine (Phase 3): the per-skill mastery estimate, the
// spaced-repetition scheduler, and the single outcome-application entry point the backends + the
// story controller drive from. Pure + deterministic given an injected `now` / `at`.
export {
  PROFICIENCY_ALPHA,
  PRACTICE_MASTERY_THRESHOLD,
  PRACTICE_MASTERY_STREAK,
  PRACTICE_PRACTICED_THRESHOLD,
  INITIAL_EASE,
  createInitialPracticeState,
  isSkillMastered,
  masteryLevel,
  masteryProgress,
  nextProficiency,
} from './engine/practice/mastery'
export type { MasteryLevel } from './engine/practice/mastery'
export {
  MIN_EASE,
  MAX_EASE,
  FIRST_INTERVAL_DAYS,
  SECOND_INTERVAL_DAYS,
  LAPSE_INTERVAL_DAYS,
  isDue,
  nextSchedule,
  overdueScore,
} from './engine/practice/scheduler'
export type { ScheduleUpdate } from './engine/practice/scheduler'
export { applyPracticeOutcome } from './engine/practice/applyOutcome'
export { summarizePractice, computeRetention } from './engine/practice/insights'
export type {
  PracticeSummary,
  SkillProgressView,
  RetentionReport,
  SkillRetention,
  SkillForStepId,
} from './engine/practice/insights'
