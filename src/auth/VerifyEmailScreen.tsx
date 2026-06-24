import { useState } from 'react'

type VerifyEmailScreenProps = {
  email: string
  onResend: () => Promise<void>
  onContinue: () => Promise<void>
  onSignOut: () => void | Promise<void>
}

export function VerifyEmailScreen({ email, onResend, onContinue, onSignOut }: VerifyEmailScreenProps) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const resend = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onResend()
      setNotice(`We re-sent a verification link to ${email}. Check your inbox and spam folder.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The verification email could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const continueAfterVerification = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onContinue()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not confirm your verification yet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-screen card">
      <p className="eyebrow">Verify your email</p>
      <h1>Confirm {email} to start saving progress.</h1>
      <p className="lead">
        Firebase mode requires a verified email before your learning progress, mastery, and attempts can be saved. We
        sent a verification link to your inbox. Open it, then continue here.
      </p>

      {notice && (
        <p className="feedback good" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="feedback bad" role="status">
          {error}
        </p>
      )}

      <button className="primary-action" type="button" disabled={busy} onClick={continueAfterVerification}>
        I verified my email
      </button>
      <button className="secondary-action" type="button" disabled={busy} onClick={resend}>
        Resend verification email
      </button>
      <button className="secondary-action" type="button" disabled={busy} onClick={() => void onSignOut()}>
        Use a different account
      </button>

      <p className="fine-print">
        Local demo mode never requires email verification. This step only applies to Firebase accounts so that course
        writes are tied to a confirmed email address.
      </p>
    </section>
  )
}
