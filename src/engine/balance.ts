// Balance-scale state helpers.
//
// Pure operations on the two-pan balance model: totalling a side, checking whether the
// scale is level, and applying an operation (add/remove weight on one or both sides). The
// id/clone/amount helpers stay private to this module; the checker module reuses the
// `sideTotal`/`isLevel` predicates.

import type { BalanceOperation, BalanceSide, BalanceState } from '../domain'

export const sideTotal = (items: BalanceState[BalanceSide]) =>
  items.reduce((total, item) => total + item.value, 0)

export const isLevel = (state: BalanceState) => sideTotal(state.left) === sideTotal(state.right)

export const applyBalanceOperation = (state: BalanceState, operation: BalanceOperation): BalanceState => {
  const next = cloneBalanceState(state)
  const sides: BalanceSide[] = operation.sides === 'both' ? ['left', 'right'] : [operation.sides]

  sides.forEach((side) => {
    next[side] = applyAmount(next[side], operation.amount)
  })

  return next
}

const cloneBalanceState = (state: BalanceState): BalanceState => ({
  ...state,
  left: state.left.map((item) => ({ ...item })),
  right: state.right.map((item) => ({ ...item })),
  bank: state.bank?.map((item) => ({ ...item })),
})

const createWeightId = (amount: number) => {
  const cryptoApi = globalThis.crypto
  const suffix =
    cryptoApi && typeof cryptoApi.randomUUID === 'function'
      ? cryptoApi.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `added-${amount}-${suffix}`
}

const applyAmount = (items: BalanceState[BalanceSide], amount: number) => {
  if (amount === 0) return items

  if (amount > 0) {
    const inverseIndex = items.findIndex((item) => item.kind === 'weight' && item.value === -amount)
    if (inverseIndex >= 0) {
      return items.filter((_, index) => index !== inverseIndex)
    }

    return [
      ...items,
      {
        id: createWeightId(amount),
        label: String(amount),
        value: amount,
        kind: 'weight' as const,
      },
    ]
  }

  const valueToRemove = Math.abs(amount)
  const exactIndex = items.findIndex((item) => item.kind === 'weight' && item.value === valueToRemove)
  if (exactIndex >= 0) {
    return items.filter((_, index) => index !== exactIndex)
  }

  return items.map((item) => {
    if (item.kind === 'weight' && item.value > valueToRemove) {
      const nextValue = item.value - valueToRemove
      return { ...item, id: `${item.id}-minus-${valueToRemove}`, label: String(nextValue), value: nextValue }
    }
    return item
  })
}
