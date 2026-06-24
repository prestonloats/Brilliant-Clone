import { FeedbackPanel } from '../../components/FeedbackPanel'
import { RetryPrompt } from '../../components/RetryPrompt'

// The shared footer for checkable steps: the result banner, the retry prompt (with an optional
// recovery action), and the Continue button once the step is solved. Mirrors the trailer that
// each step view previously inlined verbatim.
export function StepFeedback({
  feedback,
  correct,
  attempts,
  reveal,
  retryGuidance,
  defaultRetryMessage,
  retryActionLabel,
  onRetryAction,
  onContinue,
}: {
  feedback: string
  correct: boolean
  attempts: number
  reveal: string
  retryGuidance: string
  defaultRetryMessage: string
  retryActionLabel?: string
  onRetryAction?: () => void
  onContinue: () => void
}) {
  return (
    <>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt message={retryGuidance || defaultRetryMessage} actionLabel={retryActionLabel} onAction={onRetryAction} />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={onContinue}>
          Continue
        </button>
      )}
    </>
  )
}
