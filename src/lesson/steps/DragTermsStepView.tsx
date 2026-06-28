import { useCallback, useEffect, useRef, useState } from 'react'
import { MathText } from '../../MathText'
import { checkDragTermsStep } from '../../engine'
import type { DragTermsStep, StepResult } from '../../domain'
import { DragPreview } from '../../components/DragPreview'
import type { CompleteOptions } from '../types'
import { BOUNCE_RESET_MS } from './constants'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'
import { usePointerDrag } from './usePointerDrag'

// A reserved zone id for the tile tray, so the same drop detection that places a tile in a bin
// can also send it back to the tray (bins use their authored, non-underscored ids).
const TERM_TRAY_ZONE = '__tray__'

// Detects which sorting zone (a bin id or the tray) sits under a pointer during a drag,
// mirroring the manipulative puzzle's drop detection so touch and mouse share one code path.
function getTermZoneAtPoint(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y)
  const zone = element?.closest<HTMLElement>('[data-term-zone]')
  return zone?.dataset.termZone ?? null
}

type TermDrag = {
  tileId: string
  label: string
  startX: number
  startY: number
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  // Whether the pointer has travelled far enough to count as a drag (vs. a tap).
  moved: boolean
}

export function DragTermsStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: DragTermsStep
  priorResult?: StepResult
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const makeSolvedPlacements = () =>
    step.tiles.reduce<Record<string, string>>((placements, tile) => {
      placements[tile.id] = tile.bin
      return placements
    }, {})

  const [placements, setPlacements] = useState<Record<string, string>>(
    priorResult?.correct ? makeSolvedPlacements() : {},
  )
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const { feedback, correct, attempts, reveal, retryGuidance, submit, clearStatus } = useCheckableStep({
    priorResult,
    onComplete,
  })
  const [lastDropZone, setLastDropZone] = useState<string | null>(null)
  // The browser fires a click after a pointer interaction; this lets the keyboard-only onClick
  // path ignore that synthetic click so a pointer tap is not handled twice.
  const pointerActiveRef = useRef(false)

  const trayTiles = step.tiles.filter((tile) => !placements[tile.id])
  const selectedTile = step.tiles.find((tile) => tile.id === selectedTileId)

  useEffect(() => {
    if (lastDropZone === null) return
    const timeoutId = window.setTimeout(() => setLastDropZone(null), BOUNCE_RESET_MS)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropZone])

  const assignTile = useCallback(
    (tileId: string, zone: string) => {
      setPlacements((current) => {
        const next = { ...current }
        if (zone === TERM_TRAY_ZONE) {
          delete next[tileId]
        } else {
          next[tileId] = zone
        }
        return next
      })
      if (zone !== TERM_TRAY_ZONE) {
        setLastDropZone(null)
        window.requestAnimationFrame(() => setLastDropZone(zone))
      }
      setSelectedTileId(null)
      clearStatus()
    },
    [clearStatus],
  )

  const handleTileTap = useCallback(
    (tileId: string) => {
      if (correct) return
      // A placed tile pops back to the tray when tapped; a tray tile toggles selection so the
      // learner can then choose a bin (the no-drag, fully keyboard-accessible path).
      if (placements[tileId]) {
        assignTile(tileId, TERM_TRAY_ZONE)
        return
      }
      setSelectedTileId((current) => (current === tileId ? null : tileId))
      clearStatus()
    },
    [correct, placements, assignTile, clearStatus],
  )

  const { dragging, setDragging, hover: hoverZone, setHover: setHoverZone } = usePointerDrag<TermDrag, string>({
    getZoneAtPoint: getTermZoneAtPoint,
    updateOnMove: (event, current) => {
      const moved =
        current.moved ||
        Math.abs(event.clientX - current.startX) > 6 ||
        Math.abs(event.clientY - current.startY) > 6
      return { ...current, x: event.clientX, y: event.clientY, moved }
    },
    onDrop: ({ zone, dragging }) => {
      if (dragging.moved) {
        if (zone) assignTile(dragging.tileId, zone)
      } else {
        // No real movement: treat the press as a tap (select, or return a placed tile).
        handleTileTap(dragging.tileId)
      }
      window.setTimeout(() => {
        pointerActiveRef.current = false
      }, 0)
    },
    dropOnCancel: true,
  })

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, tile: DragTermsStep['tiles'][number]) => {
    if (correct) return
    pointerActiveRef.current = true
    const rect = event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    setDragging({
      tileId: tile.id,
      label: tile.label,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    })
  }

  const handleTileClick = (tileId: string) => {
    // Pointer taps are resolved in the global pointerup handler; only keyboard activations
    // (no preceding pointer interaction) should fall through to the tap handler here.
    if (pointerActiveRef.current) return
    handleTileTap(tileId)
  }

  const handleBinActivate = (binId: string) => {
    if (correct || !selectedTileId) return
    assignTile(selectedTileId, binId)
  }

  const reset = () => {
    setPlacements({})
    setSelectedTileId(null)
    setDragging(null)
    setHoverZone(null)
    setLastDropZone(null)
    clearStatus()
  }

  const check = () => {
    submit(checkDragTermsStep(step, placements, attempts + 1))
  }

  return (
    <article className="lesson-card card drag-terms-card">
      <p className="eyebrow">Sort it</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <p className="drag-terms-equation">
          <MathText>{step.equation}</MathText>
        </p>
      )}
      <p className="drag-terms-goal" role="note">
        Goal: drop every term tile into the bin that matches its variable part.
      </p>

      <div className="drag-terms-stage">
        <div className="term-tray" data-term-zone={TERM_TRAY_ZONE} aria-label={`Term tile tray, ${trayTiles.length} unsorted`}>
          <div className="term-tray-head">
            <span className="tray-title">Term tiles</span>
          </div>
          <div className="term-tile-row">
            {trayTiles.length === 0 && <span className="tray-empty">All tiles sorted</span>}
            {trayTiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                className={`term-tile ${selectedTileId === tile.id ? 'is-selected' : ''}`}
                aria-pressed={selectedTileId === tile.id}
                aria-label={`Term ${tile.label}${selectedTileId === tile.id ? ', selected' : ''}`}
                disabled={correct}
                onPointerDown={(event) => startDrag(event, tile)}
                onClick={() => handleTileClick(tile.id)}
              >
                {tile.label}
              </button>
            ))}
          </div>
          <p className="tray-hint">Drag a tile into a bin.</p>
        </div>

        <div className="term-bins">
          {step.bins.map((bin) => {
            const tilesInBin = step.tiles.filter((tile) => placements[tile.id] === bin.id)
            return (
              <div
                key={bin.id}
                className={`term-bin ${hoverZone === bin.id ? 'drop-target' : ''} ${lastDropZone === bin.id ? 'bin-bounce' : ''} ${correct ? 'is-correct' : ''}`}
                data-term-zone={bin.id}
                role="group"
                aria-label={`${bin.label}: ${tilesInBin.length ? tilesInBin.map((tile) => tile.label).join(', ') : 'empty'}`}
              >
                <div className="term-bin-head">
                  <span className="bin-label">{bin.label}</span>
                  {bin.detail && <span className="bin-detail">{bin.detail}</span>}
                  <span className="bin-count" aria-hidden="true">
                    {tilesInBin.length}
                  </span>
                </div>
                <div className="term-bin-tiles">
                  {tilesInBin.map((tile) => (
                    <button
                      key={tile.id}
                      type="button"
                      className="term-tile placed"
                      aria-label={`Term ${tile.label}, in ${bin.label}. Activate to return it to the tray.`}
                      disabled={correct}
                      onPointerDown={(event) => startDrag(event, tile)}
                      onClick={() => handleTileClick(tile.id)}
                    >
                      {tile.label}
                    </button>
                  ))}
                </div>
                {selectedTileId && (
                  <button
                    type="button"
                    className="term-bin-place"
                    disabled={correct}
                    onClick={() => handleBinActivate(bin.id)}
                  >
                    {selectedTile ? `Place ${selectedTile.label} here` : 'Place here'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {dragging?.moved && (
        <DragPreview
          className="drag-preview term-tile"
          x={dragging.x}
          y={dragging.y}
          offsetX={dragging.offsetX}
          offsetY={dragging.offsetY}
          width={dragging.width}
          height={dragging.height}
        >
          {dragging.label}
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
        defaultRetryMessage="Move the tiles into the right bins, or reset and try again."
        retryActionLabel="Reset"
        onRetryAction={reset}
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
