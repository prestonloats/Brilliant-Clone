import { useState } from 'react'
import { MathText } from '../../MathText'
import { checkOperationChoiceStep } from '../../engine'
import type { OperationChoiceStep } from '../../domain'
import { FeedbackPanel } from '../../components/FeedbackPanel'
import { RetryPrompt } from '../../components/RetryPrompt'
import type { CompleteOptions, StepPriorResult } from '../types'

export function OperationChoiceStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: OperationChoiceStep
  priorResult?: StepPriorResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [selectedId, setSelectedId] = useState('')
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const choose = (choiceId: string) => {
    const nextAttempt = attempts + 1
    const result = checkOperationChoiceStep(step, choiceId, nextAttempt)
    setSelectedId(choiceId)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
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
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && <RetryPrompt message={retryGuidance || 'Choose another operation tile to try again.'} />}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}
