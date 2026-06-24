import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

// Top-level error boundary so an unexpected render or lifecycle error anywhere in the
// learning UI degrades to a calm, recoverable screen instead of an unmounted white page.
// React has no hook equivalent for error boundaries, so this stays a class component.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for diagnostics. The user-facing fallback intentionally omits raw error
    // text and stack traces so internal details are never surfaced to the learner.
    console.error('Unexpected application error:', error, info.componentStack)
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="app-shell">
        <section className="auth-screen card">
          <p className="eyebrow">Balance</p>
          <h1>Something went wrong</h1>
          <p className="lead">
            The app hit an unexpected error. Your saved local progress lives in this browser, so it
            should still be here. Reload to pick up where you left off.
          </p>
          <button className="primary-action" type="button" onClick={this.handleReload}>
            Reload the app
          </button>
        </section>
      </main>
    )
  }
}
