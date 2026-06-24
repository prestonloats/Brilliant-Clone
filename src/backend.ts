// Public backend barrel.
//
// The backend (shared types, runtime validation/normalization, the local-storage backend, and
// the provider factory) now lives under `src/backend/*`, split so each concern can be edited in
// isolation. This file re-exports the same public API so every existing import from './backend'
// keeps working unchanged.

export type {
  AttemptRepository,
  AuthRepository,
  Backend,
  BackendProvider,
  CreateBackendOptions,
  MasteryRepository,
  MaybePromise,
  ProgressRepository,
  SignUpInput,
} from './backend/types'

export {
  isAttemptEvent,
  isSkillMastery,
  normalizeLessonProgress,
  normalizeUserProfile,
  validateSignUpInput,
} from './backend/validation'

export { LocalBackend, localBackend } from './backend/LocalBackend'

export { createAttemptEvent, createBackend } from './backend/factory'
