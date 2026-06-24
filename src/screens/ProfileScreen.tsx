import { skills, type UserProfile } from '../domain'
import type { Backend } from '../backend'

export function ProfileScreen({
  user,
  mastery,
  attempts,
  backendProvider,
}: {
  user: UserProfile
  mastery: { skillId: string; score: number; attempts: number; correct: number }[]
  attempts: { id: string }[]
  backendProvider: Backend['provider']
}) {
  const providerLabel = backendProvider === 'firebase' ? 'Firebase user ID' : 'Local demo profile ID'

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
