import type { LessonProgress } from '../../src/domain'

export const lessonProgress = (userId: string, currentStepIndex = 2): LessonProgress => ({
  userId,
  lessonId: 'balancing-equations',
  status: 'inProgress',
  currentStepIndex,
  stepResults: {
    'input-box-value': {
      correct: true,
      attempts: 1,
      feedback: 'Yes.',
    },
  },
  startedAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:01:00.000Z',
})
