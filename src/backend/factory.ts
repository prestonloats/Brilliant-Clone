// Backend provider factory (`createBackend`, which refuses to fall back to local) and attempt-event builder.

import type { AttemptEvent, LessonId } from '../domain'
import type { Backend, BackendProvider, CreateBackendOptions } from './types'
import { createId, LocalBackend } from './LocalBackend'

export const createBackend = (provider: BackendProvider, options: CreateBackendOptions = {}): Backend => {
  if (provider === 'firebase') {
    if (options.firebaseBackend?.provider === 'firebase') return options.firebaseBackend

    throw new Error(
      'Firebase backend mode was requested, but the Firebase adapter could not be initialized. The app refused to fall back to local mode.',
    )
  }

  return new LocalBackend()
}

export const createAttemptEvent = (
  userId: string,
  lessonId: LessonId,
  stepId: string,
  correct: boolean,
  attemptCount: number,
  msToAnswer: number,
): AttemptEvent => ({
  id: createId('attempt'),
  userId,
  lessonId,
  stepId,
  correct,
  attemptCount,
  msToAnswer,
  at: new Date().toISOString(),
})
