import { useState } from 'react'
import type { Backend } from '../backend'
import type { UserProfile } from '../domain'
import { validateAuthForm, type AuthMode } from '../authValidation'

type AuthScreenProps = {
  backend: Backend
  onSignedIn: (user: UserProfile) => void | Promise<void>
}

export function AuthScreen({ backend, onSignedIn }: AuthScreenProps) {
  // Both providers require a password: Firebase via Firebase Authentication, and local mode via an
  // on-device salted-hash credential (no plaintext password is ever stored).
  const [mode, setMode] = useState<AuthMode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'
  const panelId = 'auth-form-panel'
  const activeTabId = isSignup ? 'signup-tab' : 'login-tab'

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode) return
    setMode(nextMode)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const validationError = validateAuthForm(
      { displayName, email, password, confirmPassword },
      { mode, requiresPassword: true },
    )
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setBusy(true)
    try {
      const signedIn = isSignup
        ? await backend.auth.signUp({ displayName, email, password })
        : await backend.auth.signIn(email, password)
      await onSignedIn(signedIn)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-screen card">
      <p className="eyebrow">Algebra Foundations</p>
      <h1>{isSignup ? 'Create your account to start learning.' : 'Welcome back. Log in to keep learning.'}</h1>
      <p className="lead">
        A Brilliant-style algebra path where every answer gives immediate, specific feedback.
      </p>

      <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
        <button
          aria-controls={panelId}
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'active' : ''}
          id="login-tab"
          role="tab"
          type="button"
          onClick={() => switchMode('login')}
        >
          Log in
          {mode === 'login' && <span className="tab-state">Current</span>}
        </button>
        <button
          aria-controls={panelId}
          aria-selected={mode === 'signup'}
          className={mode === 'signup' ? 'active' : ''}
          id="signup-tab"
          role="tab"
          type="button"
          onClick={() => switchMode('signup')}
        >
          Create account
          {mode === 'signup' && <span className="tab-state">Current</span>}
        </button>
      </div>

      <form
        aria-labelledby={activeTabId}
        className="form-stack"
        id={panelId}
        role="tabpanel"
        noValidate
        onSubmit={submit}
      >
        {isSignup && (
          <label>
            Display name
            <input
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            autoComplete="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {isSignup && (
          <label>
            Confirm password
            <input
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        )}

        {error && (
          <p className="feedback bad" role="alert">
            {error}
          </p>
        )}

        <button className="primary-action" type="submit" disabled={busy}>
          {busy ? 'Working...' : isSignup ? 'Create account' : 'Log in'}
        </button>
      </form>

      <p className="auth-switch">
        {isSignup ? 'Already have an account?' : 'New here?'}{' '}
        <button
          className="link-button"
          type="button"
          onClick={() => switchMode(isSignup ? 'login' : 'signup')}
        >
          {isSignup ? 'Log in instead' : 'Create an account'}
        </button>
      </p>

      {backend.provider === 'firebase' ? (
        <p className="fine-print">
          Firebase mode uses Firebase Authentication email/password credentials and stores your
          progress in Firestore under your account. New accounts must verify their email before
          learning progress can be saved.
        </p>
      ) : (
        <p className="fine-print">
          Local mode keeps your account on this device only, now protected by a password stored
          only as a salted hash (never in plaintext). Accounts created before passwords were added
          use the default password <code>123456</code> for now. Set{' '}
          <code>VITE_BACKEND_PROVIDER=firebase</code> with a configured Firebase project to enable
          password-protected accounts that sync across devices. Sign out before sharing this
          browser.
        </p>
      )}
    </section>
  )
}
