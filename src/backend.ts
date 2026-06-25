// Public backend barrel: re-exports the split `src/backend/*` modules as the stable `./backend` API.

export type { Backend, SignUpInput } from './backend/types'

export {
  isAttemptEvent,
  isSkillMastery,
  normalizeLessonProgress,
  normalizeUserProfile,
  validateSignUpInput,
} from './backend/validation'

export { LocalBackend } from './backend/LocalBackend'

export { createAttemptEvent, createBackend } from './backend/factory'
