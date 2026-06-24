import { useState } from 'react'
import { MathText } from '../../MathText'
import { LineGraph } from '../../components/LineGraph'
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
      {step.graph && (
        <LineGraph
          range={step.graph.range}
          slope={step.graph.slope}
          intercept={step.graph.intercept}
          points={step.graph.points}
          label={`Graph of a line${
            step.graph.points?.length
              ? ` through ${step.graph.points.map((point) => `(${point.x}, ${point.y})`).join(' and ')}`
              : ''
          }`}
        />
      )}
      <div className="operation-grid puzzle-grid">
        {step.choices.map((choice) => {
          const selected = selectedId === choice.id || (!selectedId && priorResult?.correct && choice.id === step.correctId)
          return (
            <button
              aria-pressed={selected}
              className={[selected ? 'selected-option' : '', choice.table ? 'has-table' : ''].filter(Boolean).join(' ')}
              disabled={correct}
              key={choice.id}
              type="button"
              onClick={() => choose(choice.id)}
            >
              <span>
                {choice.table ? (
                  <>
                    <span className="sr-only">{choice.label}</span>
                    <ChoiceTable table={choice.table} />
                  </>
                ) : (
                  <strong>{choice.label}</strong>
                )}
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

// Renders an input-output table for a choice (x-values across the top row, the matching
// y-values below). aria-hidden because the choice button already carries the plain-text
// label as its accessible name.
function ChoiceTable({ table }: { table: { x: number[]; y: number[] } }) {
  return (
    <table className="choice-table" aria-hidden="true">
      <tbody>
        <tr>
          <th scope="row">x</th>
          {table.x.map((value, index) => (
            <td key={index}>{value}</td>
          ))}
        </tr>
        <tr>
          <th scope="row">y</th>
          {table.y.map((value, index) => (
            <td key={index}>{value}</td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
