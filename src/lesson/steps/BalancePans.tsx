import type { BalanceItem, BalanceSide, BalanceState } from '../../domain'
import { formatSide, getBalanceCue, getPhysicalBalanceCue, type DropTarget } from '../balanceHelpers'

export function PhysicalScaleStage({
  state,
  leftTotal,
  rightTotal,
  balanceCue,
  tilt,
  hoverTarget,
  lastDropSide,
  lastChange,
  onTilePointerDown,
  draggingId,
  tilesDisabled,
}: {
  state: BalanceState
  leftTotal: number
  rightTotal: number
  balanceCue: ReturnType<typeof getBalanceCue>
  tilt: number
  hoverTarget: DropTarget | null
  lastDropSide: BalanceSide | null
  lastChange: string
  onTilePointerDown: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
  draggingId?: string
  tilesDisabled?: boolean
}) {
  return (
    <div className="scale-stage physical-scale-stage" aria-label="Interactive balance scale">
      <div className={`balance-cue physical-cue ${balanceCue.kind}`} role="status">
        {getPhysicalBalanceCue(balanceCue.kind)}
      </div>

      <div className="physical-scale" aria-label={balanceCue.label}>
        <div className="physical-fulcrum" aria-hidden="true" />
        <div className="physical-beam" style={{ transform: `rotate(${tilt}deg)` }}>
          <span className="physical-beam-line" aria-hidden="true" />
          <PhysicalPan
            title="Left pan"
            side="left"
            items={state.left}
            total={leftTotal}
            active={hoverTarget === 'left'}
            bounced={lastDropSide === 'left'}
            onTilePointerDown={onTilePointerDown}
            draggingId={draggingId}
            tilesDisabled={tilesDisabled}
          />
          <PhysicalPan
            title="Right pan"
            side="right"
            items={state.right}
            total={rightTotal}
            active={hoverTarget === 'right'}
            bounced={lastDropSide === 'right'}
            onTilePointerDown={onTilePointerDown}
            draggingId={draggingId}
            tilesDisabled={tilesDisabled}
          />
        </div>
      </div>

      {lastChange && <p className="change-note physical-change-note" aria-live="polite">{lastChange}</p>}
    </div>
  )
}

function PhysicalPan({
  title,
  side,
  items,
  total,
  active,
  bounced,
  onTilePointerDown,
  draggingId,
  tilesDisabled,
}: {
  title: string
  side: BalanceSide
  items: BalanceItem[]
  total: number
  active: boolean
  bounced: boolean
  onTilePointerDown?: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
  draggingId?: string
  tilesDisabled?: boolean
}) {
  return (
    <div
      className={`physical-pan ${side} ${active ? 'drop-target' : ''} ${bounced ? 'pan-bounce' : ''}`}
      data-drop-zone={side}
      aria-label={`${title}: ${formatSide(items)}, total ${total}`}
    >
      <span className="physical-pan-cables" aria-hidden="true" />
      <div className="physical-pan-surface">
        <span className="physical-pan-label">{title}</span>
        <div className="physical-tile-row">
          {items.map((item) => (
            <BalanceTile
              key={item.id}
              item={item}
              location={title}
              movable={Boolean(onTilePointerDown) && !item.locked && !tilesDisabled}
              dragging={draggingId === item.id}
              onTilePointerDown={onTilePointerDown}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function Pan({
  title,
  side,
  items,
  total,
  active,
  bounced,
  onTilePointerDown,
  draggingId,
  tilesDisabled,
}: {
  title: string
  side: BalanceSide
  items: BalanceItem[]
  total: number
  active: boolean
  bounced: boolean
  onTilePointerDown?: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
  draggingId?: string
  tilesDisabled?: boolean
}) {
  return (
    <div className={`pan ${active ? 'drop-target' : ''} ${bounced ? 'pan-bounce' : ''}`} data-drop-zone={side}>
      <span className="pan-heading">
        <strong>{title}</strong>
        <small>Total {total}</small>
      </span>
      <div className="tile-row">
        {items.map((item) => (
          <BalanceTile
            key={item.id}
            item={item}
            location={title}
            movable={Boolean(onTilePointerDown) && !item.locked && !tilesDisabled}
            dragging={draggingId === item.id}
            onTilePointerDown={onTilePointerDown}
          />
        ))}
      </div>
    </div>
  )
}

// A single weight on a pan. Locked weights (the fixed equation) render as static text;
// unlocked weights render as a draggable button so the learner can pick them back up and
// move them between pans or to the tray.
function BalanceTile({
  item,
  location,
  movable,
  dragging,
  onTilePointerDown,
}: {
  item: BalanceItem
  location: string
  movable: boolean
  dragging: boolean
  onTilePointerDown?: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
}) {
  if (movable && onTilePointerDown) {
    return (
      <button
        type="button"
        className={`tile ${item.kind} movable-tile ${dragging ? 'dragging-source' : ''}`}
        aria-label={`Move the ${item.label} block. Currently on ${location}. Drag it to another pan or back to the tray.`}
        onPointerDown={(event) => onTilePointerDown(event, item)}
      >
        {item.label}
      </button>
    )
  }

  return <span className={`tile ${item.kind}`}>{item.label}</span>
}
