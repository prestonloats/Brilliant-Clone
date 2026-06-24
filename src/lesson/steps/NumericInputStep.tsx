import { useState } from 'react'
import { MathText } from '../../MathText'
import { checkInputStep } from '../../engine'
import type { InputStep, StepResult } from '../../domain'
import type { CompleteOptions } from '../types'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'

export function NumericInputStep({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: InputStep
  priorResult?: StepResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const { feedback, correct, attempts, reveal, retryGuidance, submit } = useCheckableStep({ priorResult, onComplete })
  const [answer, setAnswer] = useState('')

  const hasAnswer = answer.trim().length > 0

  const check = () => {
    // An empty/whitespace-only submission must not burn an attempt or ding mastery, so we
    // bail before checking. The Check button is also disabled, this guards the Enter key.
    if (!hasAnswer) return
    submit(checkInputStep(step, answer, attempts + 1))
  }

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Try it</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <div className="puzzle-equation">
          <MathText display>{step.equation}</MathText>
        </div>
      )}
      <label className="answer-field">
        Your answer
        <input
          inputMode="decimal"
          placeholder="Type a number"
          value={answer}
          disabled={correct}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') check()
          }}
        />
      </label>
      <button className="primary-action" type="button" disabled={correct || !hasAnswer} onClick={check}>
        Check
      </button>
      <StepFeedback
        feedback={feedback}
        correct={correct}
        attempts={attempts}
        reveal={reveal}
        retryGuidance={retryGuidance}
        defaultRetryMessage="Edit your answer and press Check again."
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
