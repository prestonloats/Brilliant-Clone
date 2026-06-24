import { useEffect, useRef, useState } from 'react'
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
  // Which step the learner is looking at. It tracks live progress, but Back/Next let them
  // browse already-completed steps (read-only) without disturbing their saved progress.
  const [viewIndex, setViewIndex] = useState(progress.currentStepIndex)

  // Whenever real progress advances (the learner answers the live step), follow it forward so
  // a review detour always returns them to where they left off.
  useEffect(() => {
    setViewIndex(progress.currentStepIndex)
  }, [progress.currentStepIndex])

  const isReviewing = viewIndex < progress.currentStepIndex
  const viewedStep = isReviewing ? lesson.steps[viewIndex] : step
  const isPhysicalBalanceStep = viewedStep.type === 'balance' && viewedStep.layout === 'physical-drag'
  const viewedProgressPercent = Math.round(((viewIndex + 1) / lesson.steps.length) * 100)

  useEffect(() => {
    stepStartedAt.current = performance.now()
  }, [viewedStep.id])

  const goBack = () => setViewIndex((index) => Math.max(0, index - 1))
  const goForward = () => setViewIndex((index) => Math.min(progress.currentStepIndex, index + 1))

  return (
    <section className={`lesson-shell ${isPhysicalBalanceStep ? 'physical-lesson-shell' : ''}`}>
      <button className="back-button" type="button" onClick={onBack}>
        Back to path
      </button>
      <ProgressBar value={viewedProgressPercent} label={`Step ${viewIndex + 1} of ${lesson.steps.length}`} />
      <div className="lesson-nav">
        <button className="lesson-nav-button" type="button" onClick={goBack} disabled={viewIndex === 0}>
          ← Previous
        </button>
        <button className="lesson-nav-button" type="button" onClick={goForward} disabled={!isReviewing}>
          Next →
        </button>
      </div>
      <StepRenderer
        key={viewedStep.id}
        step={viewedStep}
        priorResult={progress.stepResults[viewedStep.id]}
        onComplete={(correct, feedback, options) => {
          // While reviewing a past step its controls are locked; any "Continue" just walks the
          // learner forward through their history instead of re-recording a result.
          if (isReviewing) {
            goForward()
            return
          }
          onStepComplete(viewedStep, correct, feedback, Math.round(performance.now() - stepStartedAt.current), options)
        }}
        onAdvance={(feedback) => {
          if (isReviewing) {
            goForward()
            return
          }
          onStepComplete(viewedStep, true, feedback, Math.round(performance.now() - stepStartedAt.current), {
            advance: true,
            recordAttempt: false,
          })
        }}
      />
    </section>
  )
}
