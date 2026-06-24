import type { ManipulativeStep } from '../../domain'

export function describeManipulativeGoal(step: ManipulativeStep) {
  if (step.goal.type === 'equal-groups') {
    return `Goal: make ${step.goal.groups} equal groups of ${step.goal.perGroup}, using all ${step.total}.`
  }
  if (step.goal.type === 'build-product') {
    // Deliberately omits the target numbers and the total: the learner maps the equation onto
    // the two controls and discovers the total (x) from the live readout rather than being told it.
    return 'Goal: set the number of groups and how many go in each to match the equation, then read the total they build.'
  }
  return `Goal: place exactly ${step.goal.count} into the group.`
}
