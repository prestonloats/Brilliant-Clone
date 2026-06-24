import assert from 'node:assert/strict'

import type { Lesson, LessonStep } from '../../src/domain'

export const findStep = <Type extends LessonStep['type']>(
  lesson: Lesson,
  id: string,
  type: Type,
): Extract<LessonStep, { type: Type }> => {
  const step = lesson.steps.find((candidate) => candidate.id === id)
  assert.ok(step, `expected step ${id} in lesson ${lesson.id}`)
  assert.equal(step.type, type)
  return step as Extract<LessonStep, { type: Type }>
}

export const findHintText = (
  step: { feedback: { hints?: ReadonlyArray<{ when: string; text: string }> } },
  when: string,
): string | undefined => step.feedback.hints?.find((hint) => hint.when === when)?.text
