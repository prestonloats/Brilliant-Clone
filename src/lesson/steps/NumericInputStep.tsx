import { useState } from 'react'
import { MathText } from '../../MathText'
import { checkInputStep } from '../../engine'
import type { LessonStep } from '../../domain'
import { FeedbackPanel } from '../../components/FeedbackPanel'
import { RetryPrompt } from '../../components/RetryPrompt'
import type { CompleteOptions, StepPriorResult } from '../types'

export function NumericInputStep({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: Extract<LessonStep, { type: 'input' }>
  priorResult?: StepPriorResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const hasAnswer = answer.trim().length > 0

  const submit = () => {
    // An empty/whitespace-only submission must not burn an attempt or ding mastery, so we
    // bail before checking. The Check button is also disabled, this guards the Enter key.
    if (!hasAnswer) return

    const nextAttempt = attempts + 1
    const result = checkInputStep(step, answer, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
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
            if (event.key === 'Enter') submit()
          }}
        />
      </label>
      <button className="primary-action" type="button" disabled={correct || !hasAnswer} onClick={submit}>
        Check
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && <RetryPrompt message={retryGuidance || 'Edit your answer and press Check again.'} />}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}
