// Public backend barrel: re-exports the split `src/backend/*` modules as the stable `./backend` API.

export type { Backend, SignUpInput } from './backend/types'

export {
  isAttemptEvent,
  isSkillMastery,
  legacyStorySessionId,
  normalizeLessonProgress,
  normalizeStoryLibrary,
  normalizeStorySession,
  normalizeUserProfile,
  validateDisplayNameInput,
  validateSignUpInput,
} from './backend/validation'

export { LocalBackend } from './backend/LocalBackend'

export { createAttemptEvent, createBackend } from './backend/factory'
