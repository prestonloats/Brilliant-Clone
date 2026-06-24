import { useEffect, useRef } from 'react'
import type { Lesson, LessonProgress, LessonStep } from '../domain'
import { ProgressBar } from '../components/ProgressBar'
import { StepRenderer } from './StepRenderer'
import type { CompleteOptions } from './types'

type LessonPlayerProps = {
  lesson: Lesson
  step: LessonStep
  progress: LessonProgress
  onBack: () => void
  onStepComplete: (
    step: LessonStep,
    correct: boolean,
    feedback: string,
    msToAnswer: number,
    options?: CompleteOptions,
  ) => void
}

export function LessonPlayer({ lesson, step, progress, onBack, onStepComplete }: LessonPlayerProps) {
  const stepStartedAt = useRef(0)
  const progressPercent = Math.round(((progress.currentStepIndex + 1) / lesson.steps.length) * 100)
  const isPhysicalBalanceStep = step.type === 'balance' && step.layout === 'physical-drag'

  useEffect(() => {
    stepStartedAt.current = performance.now()
  }, [step.id])

  return (
    <section className={`lesson-shell ${isPhysicalBalanceStep ? 'physical-lesson-shell' : ''}`}>
      <button className="back-button" type="button" onClick={onBack}>
        Back to path
      </button>
      <ProgressBar value={progressPercent} label={`Step ${progress.currentStepIndex + 1} of ${lesson.steps.length}`} />
      <StepRenderer
        key={step.id}
        step={step}
        priorResult={progress.stepResults[step.id]}
        onComplete={(correct, feedback, options) =>
          onStepComplete(step, correct, feedback, Math.round(performance.now() - stepStartedAt.current), options)
        }
        onAdvance={(feedback) =>
          onStepComplete(step, true, feedback, Math.round(performance.now() - stepStartedAt.current), {
            advance: true,
            recordAttempt: false,
          })
        }
      />
    </section>
  )
}
