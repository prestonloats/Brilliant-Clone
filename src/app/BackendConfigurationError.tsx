import type { BackendStartup } from './startup'

export function BackendConfigurationError({ startup }: { startup: Extract<BackendStartup, { status: 'error' }> }) {
  return (
    <main className="app-shell">
      <section className="auth-screen card">
        <p className="eyebrow">Backend setup required</p>
        <h1>{startup.title}</h1>
        <p className="lead">{startup.message}</p>
        {startup.details.length > 0 && (
          <ul className="fine-print">
            {startup.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        <p className="fine-print">
          Use `VITE_BACKEND_PROVIDER=local` for the browser-only demo, or finish `.env.local` and Firebase project setup
          before enabling Firebase mode.
        </p>
      </section>
    </main>
  )
}
