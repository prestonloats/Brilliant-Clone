import {
  applyBalanceOperation,
  checkBalanceStep,
  sideTotal,
} from '../engine'
import type { BalanceItem, BalanceOperation, BalanceSide, BalanceState, BalanceStep } from '../domain'

export type DropTarget = BalanceSide | 'bank'

export function cloneBalanceState(state: BalanceState): BalanceState {
  return {
    ...state,
    left: state.left.map((item) => ({ ...item })),
    right: state.right.map((item) => ({ ...item })),
    bank: state.bank?.map((item) => ({ ...item })),
  }
}

// Applies an operation to the step's ORIGINAL equation (a fresh clone of step.state) rather
// than any accumulated state, so the operation buttons can never stack: tapping the same
// operation N times always yields the same scale as tapping it once, and switching between
// the two operation choices leaves no residue. Every operation-based balance step is solvable
// in exactly one move, so deriving from the base is the correct interaction.
export function applyOperationFromStart(step: BalanceStep, operation: BalanceOperation): BalanceState {
  return applyBalanceOperation(cloneBalanceState(step.state), operation)
}

// Rebuilds a balance state that genuinely satisfies the step's goal, used when resuming a
// step the learner already solved. Each candidate is verified with the real checker, so we
// only return a state that is actually correct (or null when none can be derived). It tries
// the start state, then each single operation, then placing each tray block on a pan, which
// covers the authored "level" and "isolate" steps without hard-coding lesson data.
export function reconstructSolvedBalanceState(step: BalanceStep): BalanceState | null {
  const base = cloneBalanceState(step.state)
  if (checkBalanceStep(step, base, {}).correct) return base

  for (const operation of step.operations ?? []) {
    const candidate = applyBalanceOperation(base, operation)
    if (checkBalanceStep(step, candidate, {}).correct) return candidate
  }

  // Level goals: no single bank placement solves multi-block "build the scale" steps, so
  // rebuild the solved state from the side-agnostic required placements below.
  if (step.goal.type === 'level') {
    // Side-agnostic placements: every listed block must end up on a pan, but either pan is
    // valid, so search all left/right assignments of those blocks for one the checker accepts
    // as a genuinely level scale. Other (non-required) items keep their current placement.
    const placedIds = step.goal.requirePlacedItems ?? []
    if (placedIds.length > 0) {
      const allItems = [...base.left, ...base.right, ...(base.bank ?? [])]
      const isPlaced = (item: BalanceItem) => placedIds.includes(item.id)
      const movable = placedIds
        .map((id) => allItems.find((item) => item.id === id))
        .filter((item): item is BalanceItem => Boolean(item))
      const fixedLeft = base.left.filter((item) => !isPlaced(item))
      const fixedRight = base.right.filter((item) => !isPlaced(item))
      const fixedBank = (base.bank ?? []).filter((item) => !isPlaced(item))

      for (let assignment = 0; assignment < 1 << movable.length; assignment += 1) {
        const candidate: BalanceState = { ...base, left: [...fixedLeft], right: [...fixedRight], bank: fixedBank }
        movable.forEach((item, index) => {
          const side: BalanceSide = assignment & (1 << index) ? 'right' : 'left'
          candidate[side] = [...candidate[side], item]
        })
        if (checkBalanceStep(step, candidate, {}).correct) return candidate
      }
    }
  }

  const bank = base.bank ?? []
  for (const item of bank) {
    for (const side of ['left', 'right'] as BalanceSide[]) {
      const candidate: BalanceState = {
        ...base,
        left: side === 'left' ? [...base.left, item] : [...base.left],
        right: side === 'right' ? [...base.right, item] : [...base.right],
        bank: bank.filter((candidateItem) => candidateItem.id !== item.id),
      }
      if (checkBalanceStep(step, candidate, {}).correct) return candidate
    }
  }

  return null
}

export function formatSide(items: BalanceItem[]) {
  if (items.length === 0) return '0'

  return items
    .map((item, index) => {
      const isNegative = item.value < 0
      const label = isNegative ? item.label.replace(/^-/, '') : item.label
      if (index === 0) return isNegative ? `-${label}` : label
      return `${isNegative ? '-' : '+'} ${label}`
    })
    .join(' ')
}

export function getBalanceCue(leftTotal: number, rightTotal: number) {
  if (leftTotal === rightTotal) {
    return {
      kind: 'level' as const,
      symbol: '=',
      label: `Level: both sides total ${leftTotal}.`,
    }
  }

  if (leftTotal > rightTotal) {
    return {
      kind: 'left-heavy' as const,
      symbol: '>',
      label: `Left heavier: ${leftTotal} is more than ${rightTotal}.`,
    }
  }

  return {
    kind: 'right-heavy' as const,
    symbol: '<',
    label: `Right heavier: ${rightTotal} is more than ${leftTotal}.`,
  }
}

export function getPhysicalBalanceCue(kind: ReturnType<typeof getBalanceCue>['kind']) {
  if (kind === 'level') return 'Scale is level.'
  if (kind === 'left-heavy') return 'Left pan is heavier.'
  return 'Right pan is heavier.'
}

function describePhysicalBalanceChange(item: BalanceItem, side: BalanceSide, state: BalanceState) {
  return `${item.label} landed on the ${side} pan. ${getPhysicalBalanceCue(getBalanceCue(sideTotal(state.left), sideTotal(state.right)).kind)}`
}

export function describeMove(
  item: BalanceItem,
  target: DropTarget,
  before: BalanceState,
  after: BalanceState,
  isPhysicalDrag: boolean,
) {
  if (target === 'bank') {
    const cue = getBalanceCue(sideTotal(after.left), sideTotal(after.right))
    return `${item.label} returned to the tray. ${isPhysicalDrag ? getPhysicalBalanceCue(cue.kind) : cue.label}`
  }

  return isPhysicalDrag
    ? describePhysicalBalanceChange(item, target, after)
    : describeBalanceChange(before, after, `Moved ${item.label} to the ${target} pan.`)
}

export function describeBalanceChange(before: BalanceState, after: BalanceState, action: string) {
  const beforeLeft = sideTotal(before.left)
  const beforeRight = sideTotal(before.right)
  const afterLeft = sideTotal(after.left)
  const afterRight = sideTotal(after.right)

  return `${action} Totals changed from left ${beforeLeft}, right ${beforeRight} to left ${afterLeft}, right ${afterRight}. ${getBalanceCue(afterLeft, afterRight).label}`
}

export function getDropTargetAtPoint(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y)
  const zone = element?.closest<HTMLElement>('[data-drop-zone]')?.dataset.dropZone
  return zone === 'left' || zone === 'right' || zone === 'bank' ? zone : null
}
