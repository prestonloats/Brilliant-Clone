export function FeedbackPanel({ correct, message, reveal }: { correct: boolean; message: string; reveal?: string }) {
  return (
    <div className={`feedback ${correct ? 'good' : 'bad'}`} role="status">
      <strong>{correct ? 'Correct: Nice.' : 'Incorrect: Try again.'}</strong>
      <span>{message}</span>
      {reveal && <small>{reveal}</small>}
    </div>
  )
}
