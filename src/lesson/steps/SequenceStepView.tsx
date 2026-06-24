import { useState } from 'react'
import { MathText } from '../../MathText'
import { checkSequenceStep } from '../../engine'
import type { SequenceStep, StepResult } from '../../domain'
import type { CompleteOptions } from '../types'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'

export function SequenceStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: SequenceStep
  priorResult?: StepResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const { feedback, correct, attempts, reveal, retryGuidance, submit, clearStatus } = useCheckableStep({
    priorResult,
    onComplete,
  })
  const [selectedIds, setSelectedIds] = useState<string[]>(priorResult?.correct ? step.correctOrder : [])

  const selectedTiles = selectedIds
    .map((id) => step.tiles.find((tile) => tile.id === id))
    .filter((tile): tile is SequenceStep['tiles'][number] => Boolean(tile))
  const availableTiles = step.tiles.filter((tile) => !selectedIds.includes(tile.id))

  const addTile = (tileId: string) => {
    setSelectedIds((current) => [...current, tileId])
    clearStatus()
  }

  const removeTile = (tileId: string) => {
    setSelectedIds((current) => {
      const index = current.lastIndexOf(tileId)
      return index >= 0 ? current.filter((_, itemIndex) => itemIndex !== index) : current
    })
    clearStatus()
  }

  const resetSelection = () => {
    setSelectedIds([])
    clearStatus()
  }

  const check = () => {
    submit(checkSequenceStep(step, selectedIds, attempts + 1))
  }

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Order the steps</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <div className="puzzle-equation">
          <MathText display>{step.equation}</MathText>
        </div>
      )}

      <div className="sequence-board">
        <div className="sequence-slots" aria-label="Selected solution steps">
          {selectedTiles.length === 0 && <span className="empty-slot">Tap tiles below to build your solution.</span>}
          {selectedTiles.map((tile, index) => (
            <button disabled={correct} key={tile.id} type="button" onClick={() => removeTile(tile.id)}>
              <span className="sequence-number">{index + 1}</span>
              <span>{tile.label}</span>
            </button>
          ))}
        </div>

        <div className="sequence-bank" aria-label="Available solution tiles">
          {availableTiles.map((tile) => (
            <button disabled={correct} key={tile.id} type="button" onClick={() => addTile(tile.id)}>
              <strong>{tile.label}</strong>
            </button>
          ))}
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check order
      </button>
      <StepFeedback
        feedback={feedback}
        correct={correct}
        attempts={attempts}
        reveal={reveal}
        retryGuidance={retryGuidance}
        defaultRetryMessage="Adjust the order, or clear it and rebuild the solution."
        retryActionLabel="Clear order"
        onRetryAction={resetSelection}
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
