import { useCallback, useEffect, useState } from 'react'
import { checkManipulativeStep } from '../../engine'
import type { ManipulativeStep } from '../../domain'
import { DragPreview } from '../../components/DragPreview'
import { FeedbackPanel } from '../../components/FeedbackPanel'
import { RetryPrompt } from '../../components/RetryPrompt'
import type { CompleteOptions, StepPriorResult } from '../types'
import { describeManipulativeGoal } from './manipulativeHelpers'

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
  priorResult?: StepPriorResult
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

  const [groups, setGroups] = useState<number[]>(priorResult?.correct ? makeSolvedGroups() : makeEmptyGroups())
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const [dragging, setDragging] = useState<ManipulativeDrag | null>(null)
  const [hoverZone, setHoverZone] = useState<number | null>(null)
  const [lastDropZone, setLastDropZone] = useState<number | null>(null)

  const placed = groups.reduce((total, count) => total + count, 0)
  const remaining = Math.max(0, step.total - placed)
  const chipGlyph = step.object.emoji ?? step.object.label.slice(0, 1).toUpperCase()
  const objectName = step.object.label

  useEffect(() => {
    if (lastDropZone === null) return
    const timeoutId = window.setTimeout(() => setLastDropZone(null), 420)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropZone])

  const clearStatus = useCallback(() => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }, [])

  const addToZone = useCallback(
    (zoneIndex: number) => {
      setGroups((current) => {
        const placedNow = current.reduce((total, count) => total + count, 0)
        if (placedNow >= step.total) return current
        const next = current.slice()
        next[zoneIndex] = (next[zoneIndex] ?? 0) + 1
        return next
      })
      setLastDropZone(null)
      window.requestAnimationFrame(() => setLastDropZone(zoneIndex))
      clearStatus()
    },
    [step.total, clearStatus],
  )

  const removeFromZone = (zoneIndex: number) => {
    setGroups((current) => {
      if ((current[zoneIndex] ?? 0) <= 0) return current
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

  useEffect(() => {
    if (!dragging) return

    const handleMove = (event: PointerEvent) => {
      setDragging((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current))
      setHoverZone(getManipulativeZoneAtPoint(event.clientX, event.clientY))
    }
    const handleUp = (event: PointerEvent) => {
      const zoneIndex = getManipulativeZoneAtPoint(event.clientX, event.clientY)
      if (zoneIndex !== null) addToZone(zoneIndex)
      setDragging(null)
      setHoverZone(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, addToZone])

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
    const nextAttempt = attempts + 1
    const result = checkManipulativeStep(step, groups, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
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
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt
          message={retryGuidance || 'Adjust the groups, or reset and try again.'}
          actionLabel="Reset"
          onAction={reset}
        />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}
