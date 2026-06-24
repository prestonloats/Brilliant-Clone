import { useState } from 'react'
import { MathText } from '../../MathText'
import { checkOperationChoiceStep } from '../../engine'
import type { OperationChoiceStep, StepResult } from '../../domain'
import type { CompleteOptions } from '../types'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'

export function OperationChoiceStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: OperationChoiceStep
  priorResult?: StepResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const { feedback, correct, attempts, reveal, retryGuidance, submit } = useCheckableStep({ priorResult, onComplete })
  const [selectedId, setSelectedId] = useState('')

  const choose = (choiceId: string) => {
    setSelectedId(choiceId)
    submit(checkOperationChoiceStep(step, choiceId, attempts + 1))
  }

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Choose a move</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <div className="puzzle-equation">
          <MathText display>{step.equation}</MathText>
        </div>
      )}
      <div className="operation-grid puzzle-grid">
        {step.choices.map((choice) => {
          const selected = selectedId === choice.id || (!selectedId && priorResult?.correct && choice.id === step.correctId)
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'selected-option' : ''}
              disabled={correct}
              key={choice.id}
              type="button"
              onClick={() => choose(choice.id)}
            >
              <span>
                <strong>{choice.label}</strong>
                {choice.detail && <small>{choice.detail}</small>}
              </span>
              {selected && <span className="option-state">Selected</span>}
            </button>
          )
        })}
      </div>
      <StepFeedback
        feedback={feedback}
        correct={correct}
        attempts={attempts}
        reveal={reveal}
        retryGuidance={retryGuidance}
        defaultRetryMessage="Choose another operation tile to try again."
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
