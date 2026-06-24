import { useState } from 'react'
import type { McqStep } from '../../domain'
import { FeedbackPanel } from '../../components/FeedbackPanel'
import { RetryPrompt } from '../../components/RetryPrompt'
import type { CompleteOptions, StepPriorResult } from '../types'

export function MultipleChoiceStep({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: McqStep
  priorResult?: StepPriorResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [selectedFeedback, setSelectedFeedback] = useState(priorResult?.feedback ?? '')
  const [selectedId, setSelectedId] = useState('')
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const wasCorrect = selectedId === step.correctId || Boolean(priorResult?.correct)

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Predict</p>
      <h1>{step.prompt}</h1>
      {step.visual === 'predict-add-left' && <PredictionScaleVisual />}
      <div className="option-grid">
        {step.options.map((option) => {
          const selected = selectedId === option.id || (!selectedId && priorResult?.correct && option.id === step.correctId)
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'selected-option' : ''}
              type="button"
              key={option.id}
              disabled={wasCorrect}
              onClick={() => {
                const nextAttempt = attempts + 1
                const correct = option.id === step.correctId
                // A newly selected wrong option always shows ITS OWN authored misconception.
                // The generic explanation layers into the reveal slot at attempt 2, and the
                // exact reveal takes over at attempt 3 (mirrors the engine's choice-step
                // escalation in buildWrongResult so mcq and operation-choice behave alike).
                const feedback = correct ? step.feedback?.correct ?? option.feedback : option.feedback
                const explanation = step.feedback?.incorrect
                const revealText = step.feedback?.reveal
                const layeredReveal = correct
                  ? ''
                  : nextAttempt >= 3 && revealText
                    ? revealText
                    : nextAttempt >= 2 && explanation && explanation !== option.feedback
                      ? explanation
                      : ''

                setSelectedId(option.id)
                setAttempts(nextAttempt)
                setSelectedFeedback(feedback)
                setReveal(layeredReveal)
                setRetryGuidance(
                  !correct && nextAttempt >= 3 && revealText
                    ? 'Use the reveal, then choose the prediction that matches the totals.'
                    : 'Compare the two totals, then choose another option.',
                )
                onComplete(correct, feedback, { advance: false })
              }}
            >
              {option.label}
              {selected && <span className="option-state">Selected</span>}
            </button>
          )
        })}
      </div>
      {selectedFeedback && <FeedbackPanel key={attempts} correct={wasCorrect} message={selectedFeedback} reveal={!wasCorrect ? reveal : undefined} />}
      {selectedFeedback && !wasCorrect && <RetryPrompt message={retryGuidance || 'Choose another option to try again.'} />}
      {wasCorrect && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(selectedFeedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

function PredictionScaleVisual() {
  return (
    <div className="prediction-visual" aria-label="Compare a level scale with a prediction card where one pan has 3 plus 2 and the other has 3">
      <PredictScaleCard title="Start" left="3" right="3" cue="Both pans match" />
      <div className="prediction-operation">One pan changes</div>
      <PredictScaleCard title="Predict" left="3 + 2" right="3" cue="Which pan is heavier?" />
    </div>
  )
}

function PredictScaleCard({
  title,
  left,
  right,
  cue,
  tilt = 'level',
}: {
  title: string
  left: string
  right: string
  cue: string
  tilt?: 'level' | 'left-heavy'
}) {
  return (
    <div className={`predict-scale-card ${tilt}`}>
      <span className="predict-title">{title}</span>
      <div className="predict-mini-scale" aria-hidden="true">
        <div className="predict-beam">
          <span>{left}</span>
          <span>{right}</span>
        </div>
        <i />
      </div>
      <strong>{cue}</strong>
    </div>
  )
}
