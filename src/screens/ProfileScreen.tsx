import { useState } from 'react'
import { skills, type UserProfile } from '../domain'
import type { Backend } from '../backend'
import { DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from '../authValidation'

export function ProfileScreen({
  user,
  mastery,
  attempts,
  backendProvider,
  onSaveDisplayName,
}: {
  user: UserProfile
  mastery: { skillId: string; score: number; attempts: number; correct: number }[]
  attempts: { id: string }[]
  backendProvider: Backend['provider']
  // Persists the new display name through the Backend contract and updates app-wide user state.
  onSaveDisplayName: (name: string) => Promise<void>
}) {
  const providerLabel = backendProvider === 'firebase' ? 'Firebase user ID' : 'Local demo profile ID'

  const [name, setName] = useState(user.displayName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const validationError = validateDisplayName(name)
  const isUnchanged = name.trim() === user.displayName
  const canSave = !saving && !validationError && !isUnchanged

  const handleChange = (value: string) => {
    setName(value)
    setSaved(false)
    if (error) setError('')
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextError = validateDisplayName(name)
    if (nextError) {
      setError(nextError)
      setSaved(false)
      return
    }

    const trimmed = name.trim()
    if (trimmed === user.displayName) return

    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await onSaveDisplayName(trimmed)
      setName(trimmed)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your display name could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="screen-stack">
      <div className="profile-card card">
        <p className="eyebrow">Profile</p>
        <h1>{user.displayName}</h1>
        <p>{user.email}</p>
        <p className="fine-print">
          {providerLabel}: {user.id}
        </p>
        <p className="fine-print">
          {backendProvider === 'firebase'
            ? 'Firebase mode syncs progress through Firestore for this authenticated account. Sign out before sharing this browser.'
            : 'Sign out before sharing this browser. This demo keeps progress on this device until browser storage is cleared.'}
        </p>

        <form className="form-stack profile-name-form" noValidate onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              id="profile-display-name"
              autoComplete="name"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              value={name}
              aria-invalid={error ? true : undefined}
              aria-describedby={
                error
                  ? 'profile-display-name-error'
                  : saved
                    ? 'profile-display-name-status'
                    : undefined
              }
              onChange={(event) => handleChange(event.target.value)}
            />
          </label>

          {error && (
            <p className="feedback bad" id="profile-display-name-error" role="alert">
              {error}
            </p>
          )}
          {saved && !error && (
            <p
              className="feedback good"
              id="profile-display-name-status"
              role="status"
              aria-live="polite"
            >
              Display name updated.
            </p>
          )}

          <button className="primary-action" type="submit" disabled={!canSave}>
            {saving ? 'Saving...' : 'Save display name'}
          </button>
        </form>
      </div>

      <div className="mastery-grid">
        {skills.map((skill) => {
          const item = mastery.find((entry) => entry.skillId === skill.id)
          const score = item ? Math.round(item.score * 100) : 0
          return (
            <article className="mastery-card card" key={skill.id}>
              <span className="status-pill">{score}%</span>
              <h2>{skill.title}</h2>
              <p>{skill.description}</p>
              <small>
                {item ? `${item.correct}/${item.attempts} correct attempts` : 'No attempts yet'}
              </small>
            </article>
          )
        })}
      </div>

      <p className="fine-print">Recorded {backendProvider} attempt events: {attempts.length}</p>
    </section>
  )
}
