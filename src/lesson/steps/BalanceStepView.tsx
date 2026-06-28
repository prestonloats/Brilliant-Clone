import { useCallback, useEffect, useState } from 'react'
import { MathText } from '../../MathText'
import {
  checkBalanceStep,
  isLevel,
  sideTotal,
  type BalanceCheckMeta,
} from '../../engine'
import type { BalanceItem, BalanceOperation, BalanceSide, BalanceState, BalanceStep, StepResult } from '../../domain'
import { DragPreview } from '../../components/DragPreview'
import type { CompleteOptions } from '../types'
import {
  applyOperationFromStart,
  cloneBalanceState,
  describeBalanceChange,
  describeMove,
  formatSide,
  getBalanceCue,
  getDropTargetAtPoint,
  reconstructSolvedBalanceState,
  type DropTarget,
} from '../balanceHelpers'
import { BOUNCE_RESET_MS } from './constants'
import { Pan, PhysicalScaleStage } from './BalancePans'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'
import { usePointerDrag } from './usePointerDrag'

// The beam tilts up to MAX_TILT_DEG in either direction, gaining TILT_DEG_PER_UNIT degrees for
// each unit of imbalance between the pans until it saturates at the cap.
const MAX_TILT_DEG = 11
const TILT_DEG_PER_UNIT = 3

type DraggingTile = {
  item: BalanceItem
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export function BalanceStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: BalanceStep
  priorResult?: StepResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [resume] = useState(() => {
    // If this step was already solved on a previous visit (correct, but the learner never
    // pressed Continue), rebuild a genuinely solved scale so it matches the "Correct"
    // banner instead of showing the original unsolved setup. If it cannot be
    // reconstructed, fall back to the start state with no banner so nothing is misleading.
    const solvedState = priorResult?.correct ? reconstructSolvedBalanceState(step) : null
    return solvedState
      ? { state: solvedState, correct: true, feedback: priorResult?.feedback ?? '' }
      : { state: cloneBalanceState(step.state), correct: false, feedback: '' }
  })
  const [state, setState] = useState<BalanceState>(resume.state)
  // Seed the shared feedback states from `resume` (a previously-solved scale resumes as
  // "Correct", everything else starts blank) rather than directly from priorResult, preserving
  // this view's reconstruct-or-reset behavior.
  const { feedback, correct, attempts, reveal, retryGuidance, submit, clearStatus } = useCheckableStep({
    priorResult: { correct: resume.correct, feedback: resume.feedback, attempts: priorResult?.attempts ?? 0 },
    onComplete,
  })
  const [lastDropSide, setLastDropSide] = useState<BalanceSide | null>(null)
  const [meta, setMeta] = useState<BalanceCheckMeta>({})
  const [lastChange, setLastChange] = useState('')

  const leftTotal = sideTotal(state.left)
  const rightTotal = sideTotal(state.right)
  const balanceCue = getBalanceCue(leftTotal, rightTotal)
  const tilt = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, (rightTotal - leftTotal) * TILT_DEG_PER_UNIT))
  const isPhysicalDrag = step.layout === 'physical-drag'
  // A tray-backed step lets the learner drag weights on/off the pans, so re-dragging
  // (between pans, or back to the tray) is the recovery path. Operation-based steps
  // transform the scale instead, so they still need an explicit reset.
  const hasTray = step.state.bank !== undefined
  const usesOperations = Boolean(step.operations && step.operations.length > 0)
  const bankItems = state.bank ?? []

  useEffect(() => {
    if (!lastDropSide) return

    const timeoutId = window.setTimeout(() => setLastDropSide(null), BOUNCE_RESET_MS)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropSide])

  // Moves a weight to any drop target: a pan or back to the tray. The item is first
  // removed from wherever it currently sits, so a block dropped on the wrong side can
  // simply be dragged again to the correct side (or to the tray) with no reset needed.
  const moveItem = useCallback(
    (item: BalanceItem, target: DropTarget) => {
      const without = (items: BalanceItem[] | undefined) =>
        (items ?? []).filter((candidate) => candidate.id !== item.id)

      const nextState: BalanceState = {
        ...state,
        left: without(state.left),
        right: without(state.right),
        bank: without(state.bank),
      }

      if (target === 'bank') {
        nextState.bank = [...(nextState.bank ?? []), item]
      } else {
        nextState[target] = [...nextState[target], item]
      }

      setState(nextState)
      setMeta({})
      setLastDropSide(null)
      if (target !== 'bank') {
        window.requestAnimationFrame(() => setLastDropSide(target))
      }
      setLastChange(describeMove(item, target, state, nextState, isPhysicalDrag))
      clearStatus()
    },
    [isPhysicalDrag, state, clearStatus],
  )

  const { dragging, setDragging, hover: hoverTarget, setHover: setHoverTarget } = usePointerDrag<DraggingTile, DropTarget>({
    getZoneAtPoint: getDropTargetAtPoint,
    onDrop: ({ zone, dragging: tile }) => {
      if (zone) moveItem(tile.item, zone)
    },
  })

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({
      item,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  const quickDrop = (item: BalanceItem, side: BalanceSide) => {
    moveItem(item, side)
  }

  const resetAttempt = () => {
    setState(cloneBalanceState(step.state))
    setDragging(null)
    setHoverTarget(null)
    setLastDropSide(null)
    setLastChange('Scale reset to the starting equation.')
    setMeta({})
    clearStatus()
  }

  const applyOperation = (operation: BalanceOperation) => {
    // Always derive from the step's original equation, never the accumulated state, so tapping
    // the same operation repeatedly cannot stack and switching choices leaves no residue.
    const baseState = cloneBalanceState(step.state)
    const nextState = applyOperationFromStart(step, operation)
    setState(nextState)
    setMeta({ movedOneSideOnly: operation.sides !== 'both' })
    setLastChange(describeBalanceChange(baseState, nextState, `Applied ${operation.label}.`))
    clearStatus()
  }

  const check = () => {
    submit(checkBalanceStep(step, state, meta, attempts + 1))
  }

  return (
    <article className={`lesson-card card ${isPhysicalDrag ? 'physical-balance-card' : ''}`}>
      <p className="eyebrow">Balance scale</p>
      <h1 className="build-prompt">{step.prompt}</h1>

      {isPhysicalDrag ? (
        <PhysicalScaleStage
          state={state}
          leftTotal={leftTotal}
          rightTotal={rightTotal}
          balanceCue={balanceCue}
          tilt={tilt}
          hoverTarget={hoverTarget}
          lastDropSide={lastDropSide}
          lastChange={lastChange}
          onTilePointerDown={startDrag}
          draggingId={dragging?.item.id}
          tilesDisabled={correct}
        />
      ) : (
        <div className="scale-stage" aria-label="Interactive balance scale">
          <div className="equation-row" aria-live="polite">
            <span className="equation-side">
              <small>Left</small>
              <strong><MathText>{formatSide(state.left)}</MathText></strong>
              <em>Total {leftTotal}</em>
            </span>
            <span className={`balance-symbol ${balanceCue.kind}`}>{balanceCue.symbol}</span>
            <span className="equation-side">
              <small>Right</small>
              <strong><MathText>{formatSide(state.right)}</MathText></strong>
              <em>Total {rightTotal}</em>
            </span>
          </div>
          <div className={`balance-cue ${balanceCue.kind}`} role="status">
            {balanceCue.label}
          </div>
          <div className="scale-svg-wrap">
            <svg
              className={isLevel(state) ? 'level-scale' : 'tilted-scale'}
              viewBox="0 0 420 260"
              role="img"
              aria-label={balanceCue.label}
            >
              <line x1="210" y1="95" x2="210" y2="210" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
              <polygon points="180,220 240,220 210,180" fill="currentColor" opacity="0.18" />
              <g style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '210px 95px' }}>
                <line x1="75" y1="95" x2="345" y2="95" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                <line x1="105" y1="95" x2="75" y2="155" stroke="currentColor" strokeWidth="3" />
                <line x1="105" y1="95" x2="135" y2="155" stroke="currentColor" strokeWidth="3" />
                <line x1="315" y1="95" x2="285" y2="155" stroke="currentColor" strokeWidth="3" />
                <line x1="315" y1="95" x2="345" y2="155" stroke="currentColor" strokeWidth="3" />
                <rect x="48" y="154" width="114" height="22" rx="10" fill="currentColor" opacity="0.16" />
                <rect x="258" y="154" width="114" height="22" rx="10" fill="currentColor" opacity="0.16" />
              </g>
            </svg>
          </div>

          <div className="pan-grid">
            <Pan
              title="Left pan"
              side="left"
              items={state.left}
              total={leftTotal}
              active={hoverTarget === 'left'}
              bounced={lastDropSide === 'left'}
              onTilePointerDown={hasTray ? startDrag : undefined}
              draggingId={dragging?.item.id}
              tilesDisabled={correct}
            />
            <Pan
              title="Right pan"
              side="right"
              items={state.right}
              total={rightTotal}
              active={hoverTarget === 'right'}
              bounced={lastDropSide === 'right'}
              onTilePointerDown={hasTray ? startDrag : undefined}
              draggingId={dragging?.item.id}
              tilesDisabled={correct}
            />
          </div>
          {lastChange && <p className="change-note" aria-live="polite">{lastChange}</p>}
        </div>
      )}

      {hasTray && (
        <div
          className={`item-bank ${isPhysicalDrag ? 'physical-bank' : ''} ${hoverTarget === 'bank' ? 'drop-target' : ''}`}
          data-drop-zone="bank"
        >
          {bankItems.length > 0 ? (
            bankItems.map((item) => (
              <div className="bank-item" key={item.id}>
                <button
                  className={`tile bank-tile movable-tile ${dragging?.item.id === item.id ? 'dragging-source' : ''}`}
                  type="button"
                  aria-label={`Drag ${item.label} block to a pan`}
                  disabled={correct}
                  onPointerDown={(event) => startDrag(event, item)}
                >
                  {item.label}
                </button>
                {!isPhysicalDrag && (
                  <>
                    <button type="button" disabled={correct} onClick={() => quickDrop(item, 'left')}>
                      Place {item.label} on left pan
                    </button>
                    <button type="button" disabled={correct} onClick={() => quickDrop(item, 'right')}>
                      Place {item.label} on right pan
                    </button>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="tray-empty" aria-live="polite">
              Tray is empty. Drag a block back here to take it off a pan.
            </p>
          )}
        </div>
      )}

      {dragging && (
        <DragPreview
          className="drag-preview tile"
          x={dragging.x}
          y={dragging.y}
          offsetX={dragging.offsetX}
          offsetY={dragging.offsetY}
          width={dragging.width}
          height={dragging.height}
        >
          {dragging.item.label}
        </DragPreview>
      )}

      {step.operations && (
        <div className="operation-grid">
          {step.operations.map((operation) => (
            <button type="button" key={operation.id} disabled={correct} onClick={() => applyOperation(operation)}>
              {operation.label}
            </button>
          ))}
        </div>
      )}

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check scale
      </button>
      <StepFeedback
        feedback={feedback}
        correct={correct}
        attempts={attempts}
        reveal={reveal}
        retryGuidance={retryGuidance}
        defaultRetryMessage={
          usesOperations
            ? 'Reset the scale if your move used up a tile, then try again.'
            : 'Drag the block to the other pan, or back to the tray, then check the scale again.'
        }
        retryActionLabel={usesOperations ? 'Reset scale' : undefined}
        onRetryAction={usesOperations ? resetAttempt : undefined}
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
