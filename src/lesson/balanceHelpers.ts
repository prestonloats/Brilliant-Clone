import {
  applyBalanceOperation,
  checkBalanceStep,
  sideTotal,
} from '../engine'
import type { BalanceItem, BalanceSide, BalanceState, BalanceStep } from '../domain'

export type DropTarget = BalanceSide | 'bank'

export function cloneBalanceState(state: BalanceState): BalanceState {
  return {
    ...state,
    left: state.left.map((item) => ({ ...item })),
    right: state.right.map((item) => ({ ...item })),
    bank: state.bank?.map((item) => ({ ...item })),
  }
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

  // Level goals with required placements: move every required block onto its target pan
  // (pulled from the tray or whichever pan it currently sits on), then verify the result is
  // genuinely solved. This rebuilds multi-block "build the scale" steps where no single
  // bank placement alone solves the goal.
  if (step.goal.type === 'level') {
    const required = [
      ...(step.goal.requireItemOnSide ? [step.goal.requireItemOnSide] : []),
      ...(step.goal.requireItemsOnSide ?? []),
    ]
    if (required.length > 0) {
      const allItems = [...base.left, ...base.right, ...(base.bank ?? [])]
      const isRequired = (item: BalanceItem) => required.some((placement) => placement.itemId === item.id)
      const candidate: BalanceState = {
        ...base,
        left: base.left.filter((item) => !isRequired(item)),
        right: base.right.filter((item) => !isRequired(item)),
        bank: (base.bank ?? []).filter((item) => !isRequired(item)),
      }
      required.forEach((placement) => {
        const item = allItems.find((candidateItem) => candidateItem.id === placement.itemId)
        if (item) candidate[placement.side] = [...candidate[placement.side], item]
      })
      if (checkBalanceStep(step, candidate, {}).correct) return candidate
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

export function describePhysicalBalanceChange(item: BalanceItem, side: BalanceSide, state: BalanceState) {
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
