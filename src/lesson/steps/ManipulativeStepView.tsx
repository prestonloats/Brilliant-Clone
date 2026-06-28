import { useCallback, useEffect, useState } from 'react'
import { checkManipulativeStep } from '../../engine'
import type { ManipulativeStep, StepResult } from '../../domain'
import { DragPreview } from '../../components/DragPreview'
import type { CompleteOptions } from '../types'
import { BOUNCE_RESET_MS } from './constants'
import { describeManipulativeGoal } from './manipulativeHelpers'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'
import { usePointerDrag } from './usePointerDrag'

type ManipulativeDrag = {
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

function getManipulativeZoneAtPoint(x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y)
  const zone = element?.closest<HTMLElement>('[data-zone-index]')
  if (!zone) return null
  const index = Number(zone.dataset.zoneIndex)
  return Number.isInteger(index) ? index : null
}

export function ManipulativeStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: ManipulativeStep
  priorResult?: StepResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  // The drag/zone machinery here only handles the equal-groups/collect distribution puzzles;
  // the discover-the-total (build-product) mode is dispatched to ManipulativeBuildView upstream.
  const goal = step.goal as Extract<ManipulativeStep['goal'], { type: 'equal-groups' | 'collect' }>
  const zoneCount = goal.type === 'equal-groups' ? goal.groups : 1
  const makeEmptyGroups = () => Array.from({ length: zoneCount }, () => 0)
  const makeSolvedGroups = () =>
    goal.type === 'equal-groups'
      ? Array.from({ length: goal.groups }, () => goal.perGroup)
      : [goal.count]

  const { feedback, correct, attempts, reveal, retryGuidance, submit, clearStatus } = useCheckableStep({
    priorResult,
    onComplete,
  })
  const [groups, setGroups] = useState<number[]>(priorResult?.correct ? makeSolvedGroups() : makeEmptyGroups())
  const [lastDropZone, setLastDropZone] = useState<number | null>(null)

  const placed = groups.reduce((total, count) => total + count, 0)
  const remaining = Math.max(0, step.total - placed)
  const chipGlyph = step.object.emoji ?? step.object.label.slice(0, 1).toUpperCase()
  const objectName = step.object.label

  useEffect(() => {
    if (lastDropZone === null) return
    const timeoutId = window.setTimeout(() => setLastDropZone(null), BOUNCE_RESET_MS)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropZone])

  const addToZone = useCallback(
    (zoneIndex: number) => {
      setGroups((current) => {
        const placedNow = current.reduce((total, count) => total + count, 0)
        if (placedNow >= step.total) return current
        const next = current.slice()
        next[zoneIndex] = next[zoneIndex] + 1
        return next
      })
      setLastDropZone(null)
      window.requestAnimationFrame(() => setLastDropZone(zoneIndex))
      clearStatus()
    },
    [step.total, clearStatus],
  )

  const { dragging, setDragging, hover: hoverZone, setHover: setHoverZone } = usePointerDrag<ManipulativeDrag, number>({
    getZoneAtPoint: getManipulativeZoneAtPoint,
    onDrop: ({ zone }) => {
      if (zone !== null) addToZone(zone)
    },
    dropOnCancel: true,
  })

  const removeFromZone = (zoneIndex: number) => {
    setGroups((current) => {
      if (current[zoneIndex] <= 0) return current
      const next = current.slice()
      next[zoneIndex] = next[zoneIndex] - 1
      return next
    })
    clearStatus()
  }

  const reset = () => {
    setGroups(makeEmptyGroups())
    setDragging(null)
    setHoverZone(null)
    setLastDropZone(null)
    clearStatus()
  }

  const startDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (correct || remaining <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    setDragging({
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  const check = () => {
    submit(checkManipulativeStep(step, groups, attempts + 1))
  }

  return (
    <article className="lesson-card card manipulative-card">
      <p className="eyebrow">Build it</p>
      <h1 className="build-prompt">{step.prompt}</h1>
      <p className="manipulative-goal" role="note">
        {describeManipulativeGoal(step)}
      </p>

      <div className="manipulative-stage">
        <div className="manipulative-tray" aria-label={`Tray with ${remaining} ${objectName}`}>
          <div className="manipulative-tray-head">
            <span className="tray-title">Tray</span>
            <span className="tray-count">{remaining} left</span>
          </div>
          <div className="object-row" aria-hidden="true">
            {remaining === 0 && <span className="tray-empty">Tray empty</span>}
            {Array.from({ length: remaining }, (_, index) => (
              <span className="object-chip" key={index} onPointerDown={startDrag}>
                {chipGlyph}
              </span>
            ))}
          </div>
          <p className="tray-hint">
            Drag {step.object.emoji ? 'an item' : `a ${objectName}`} onto a group, or use the + buttons.
          </p>
        </div>

        <div className="manipulative-zones">
          {groups.map((count, zoneIndex) => (
            <div
              className={`manipulative-zone ${hoverZone === zoneIndex ? 'drop-target' : ''} ${lastDropZone === zoneIndex ? 'zone-bounce' : ''} ${correct ? 'is-correct' : ''}`}
              data-zone-index={zoneIndex}
              key={zoneIndex}
              aria-label={`Group ${zoneIndex + 1}: ${count} ${objectName}`}
            >
              <div className="zone-head">
                <span className="zone-label">{zoneCount > 1 ? `Group ${zoneIndex + 1}` : 'Group'}</span>
                <span className="zone-count" aria-hidden="true">
                  {count}
                </span>
              </div>
              <div className="object-row" aria-hidden="true">
                {Array.from({ length: count }, (_, index) => (
                  <span className="object-chip placed" key={index}>
                    {chipGlyph}
                  </span>
                ))}
              </div>
              <div className="zone-controls">
                <button
                  type="button"
                  aria-label={`Remove one ${objectName} from group ${zoneIndex + 1}`}
                  disabled={correct || count <= 0}
                  onClick={() => removeFromZone(zoneIndex)}
                >
                  &minus;
                </button>
                <button
                  type="button"
                  aria-label={`Add one ${objectName} to group ${zoneIndex + 1}`}
                  disabled={correct || remaining <= 0}
                  onClick={() => addToZone(zoneIndex)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {dragging && (
        <DragPreview
          className="drag-preview object-chip"
          x={dragging.x}
          y={dragging.y}
          offsetX={dragging.offsetX}
          offsetY={dragging.offsetY}
          width={dragging.width}
          height={dragging.height}
        >
          {chipGlyph}
        </DragPreview>
      )}

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check
      </button>
      <StepFeedback
        feedback={feedback}
        correct={correct}
        attempts={attempts}
        reveal={reveal}
        retryGuidance={retryGuidance}
        defaultRetryMessage="Adjust the groups, or reset and try again."
        retryActionLabel="Reset"
        onRetryAction={reset}
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
