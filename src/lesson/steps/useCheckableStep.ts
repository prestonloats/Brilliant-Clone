import { useCallback, useState } from 'react'
import type { StepResult } from '../../domain'
import type { CompleteOptions } from '../types'

// The shape a checker returns that the feedback states care about. Engine check results are
// structurally compatible (they carry extra fields), and views that compute a result inline
// (e.g. the multiple-choice step) can pass a matching object literal.
export type StepCheckResult = {
  correct: boolean
  feedback: string
  reveal?: string
  retryGuidance?: string
}

// Owns the feedback scaffolding shared by every checkable step view: the five states seeded
// from a prior result, a submit() that records an attempt and syncs those states from a check
// result (forwarding to onComplete), and a clearStatus() for when the learner edits their work.
export function useCheckableStep({
  priorResult,
  onComplete,
}: {
  priorResult?: StepResult
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const clearStatus = useCallback(() => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }, [])

  const submit = useCallback(
    (result: StepCheckResult) => {
      setAttempts((current) => current + 1)
      setFeedback(result.feedback)
      setCorrect(result.correct)
      setReveal(result.reveal ?? '')
      setRetryGuidance(result.retryGuidance ?? '')
      onComplete(result.correct, result.feedback, { advance: false })
    },
    [onComplete],
  )

  return { feedback, correct, attempts, reveal, retryGuidance, submit, clearStatus }
}
