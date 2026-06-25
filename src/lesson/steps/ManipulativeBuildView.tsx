import { useState } from 'react'
import { checkManipulativeStep } from '../../engine'
import type { ManipulativeStep, StepResult } from '../../domain'
import type { CompleteOptions } from '../types'
import { MAX_POOL_CHIPS } from './constants'
import { describeManipulativeGoal } from './manipulativeHelpers'
import { StepFeedback } from './StepFeedback'
import { useCheckableStep } from './useCheckableStep'

// The "discover the total" manipulative: instead of a pre-counted tray (which would reveal the
// answer), the learner adjusts a number-of-groups stepper and a per-group stepper drawn from a
// large pool. A live total = groups x perGroup updates as either control changes and is the value
// (x) being discovered. The pure checkManipulativeStep verifies both controls match the targets.
export function ManipulativeBuildView({
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
  const goal = step.goal as Extract<ManipulativeStep['goal'], { type: 'build-product' }>
  const maxGroups = goal.maxGroups ?? Math.max(goal.groups + 2, 6)
  const maxPerGroup = goal.maxPerGroup ?? Math.max(goal.perGroup + 2, 6)

  const { feedback, correct, attempts, reveal, retryGuidance, submit, clearStatus } = useCheckableStep({
    priorResult,
    onComplete,
  })
  const [numGroups, setNumGroups] = useState(priorResult?.correct ? goal.groups : 1)
  const [perGroup, setPerGroup] = useState(priorResult?.correct ? goal.perGroup : 1)

  const liveTotal = numGroups * perGroup
  const remaining = Math.max(0, step.total - liveTotal)
  const chipGlyph = step.object.emoji ?? step.object.label.slice(0, 1).toUpperCase()
  const objectName = step.object.label
  const plural = (count: number) => `${objectName}${count === 1 ? '' : 's'}`
  const poolChips = Math.min(remaining, MAX_POOL_CHIPS)

  const adjustGroups = (delta: number) => {
    setNumGroups((current) => {
      const next = current + delta
      if (next < 1 || next > maxGroups) return current
      // Never let the live total outgrow the pool the learner is drawing from.
      if (delta > 0 && next * perGroup > step.total) return current
      return next
    })
    clearStatus()
  }

  const adjustPerGroup = (delta: number) => {
    setPerGroup((current) => {
      const next = current + delta
      if (next < 0 || next > maxPerGroup) return current
      if (delta > 0 && numGroups * next > step.total) return current
      return next
    })
    clearStatus()
  }

  const reset = () => {
    setNumGroups(1)
    setPerGroup(1)
    clearStatus()
  }

  const check = () => {
    submit(checkManipulativeStep(step, Array.from({ length: numGroups }, () => perGroup), attempts + 1))
  }

  const canAddGroup = !correct && numGroups < maxGroups && (numGroups + 1) * perGroup <= step.total
  const canRemoveGroup = !correct && numGroups > 1
  const canAddPer = !correct && perGroup < maxPerGroup && numGroups * (perGroup + 1) <= step.total
  const canRemovePer = !correct && perGroup > 0
  const totalSentence = `${numGroups} ${numGroups === 1 ? 'group' : 'groups'} of ${perGroup} ${plural(perGroup)} = ${liveTotal} ${plural(liveTotal)} in total`

  return (
    <article className="lesson-card card manipulative-card">
      <p className="eyebrow">Build it</p>
      <h1 className="build-prompt">{step.prompt}</h1>
      <p className="manipulative-goal" role="note">
        {describeManipulativeGoal(step)}
      </p>

      <div className="manipulative-stage build-stage">
        <div className="build-controls">
          <div className="build-stepper" role="group" aria-label="Number of groups">
            <span className="stepper-label">Groups</span>
            <div className="stepper-row">
              <button
                type="button"
                aria-label="Remove one group"
                disabled={!canRemoveGroup}
                onClick={() => adjustGroups(-1)}
              >
                &minus;
              </button>
              <span className="stepper-value">{numGroups}</span>
              <button
                type="button"
                aria-label="Add one group"
                disabled={!canAddGroup}
                onClick={() => adjustGroups(1)}
              >
                +
              </button>
            </div>
          </div>

          <span className="build-operator" aria-hidden="true">
            {'\u00D7'}
          </span>

          <div className="build-stepper" role="group" aria-label={`${objectName} in each group`}>
            <span className="stepper-label">Per group</span>
            <div className="stepper-row">
              <button
                type="button"
                aria-label={`Remove one ${objectName} from each group`}
                disabled={!canRemovePer}
                onClick={() => adjustPerGroup(-1)}
              >
                &minus;
              </button>
              <span className="stepper-value">{perGroup}</span>
              <button
                type="button"
                aria-label={`Add one ${objectName} to each group`}
                disabled={!canAddPer}
                onClick={() => adjustPerGroup(1)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className={`build-total ${correct ? 'is-correct' : ''}`}>
          <div className="build-total-display" aria-hidden="true">
            <span className="build-total-eq">
              {numGroups} {'\u00D7'} {perGroup} =
            </span>
            <span className="build-total-value">{liveTotal}</span>
          </div>
          <p className="build-total-caption" role="status" aria-live="polite">
            {totalSentence}
          </p>
        </div>

        <div className="manipulative-zones build-zones">
          {Array.from({ length: numGroups }, (_, zoneIndex) => (
            <div
              className={`manipulative-zone build-zone ${correct ? 'is-correct' : ''}`}
              key={zoneIndex}
              aria-label={`Group ${zoneIndex + 1}: ${perGroup} ${plural(perGroup)}`}
            >
              <div className="zone-head">
                <span className="zone-label">Group {zoneIndex + 1}</span>
                <span className="zone-count" aria-hidden="true">
                  {perGroup}
                </span>
              </div>
              <div className="object-row" aria-hidden="true">
                {perGroup === 0 && <span className="tray-empty">Empty</span>}
                {Array.from({ length: perGroup }, (_, index) => (
                  <span className="object-chip placed" key={index}>
                    {chipGlyph}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="build-pool" aria-label={`Pool with ${remaining} ${plural(remaining)} left`}>
          <span className="build-pool-text">
            Pulling from a pool of {step.total} {objectName}. {remaining} still in the pool.
          </span>
          <span className="build-pool-chips" aria-hidden="true">
            {Array.from({ length: poolChips }, (_, index) => (
              <span className="object-chip pool-chip" key={index}>
                {chipGlyph}
              </span>
            ))}
            {remaining > poolChips && <span className="build-pool-more">+{remaining - poolChips}</span>}
          </span>
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check
      </button>
      <StepFeedback
        feedback={feedback}
        correct={correct}
        attempts={attempts}
        reveal={reveal}
        retryGuidance={retryGuidance}
        defaultRetryMessage="Adjust the number of groups or how many go in each, then check again."
        retryActionLabel="Reset"
        onRetryAction={reset}
        onContinue={() => onAdvance(feedback)}
      />
    </article>
  )
}
