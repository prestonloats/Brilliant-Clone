export function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="app-shell">
      <section className="auth-screen card">
        <p className="eyebrow">Balance</p>
        <h1>{message}</h1>
        <p className="lead">Preparing the selected backend for the lesson path.</p>
      </section>
    </main>
  )
}
