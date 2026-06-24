import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

// Top-level error boundary so a render-time exception anywhere in the tree shows a
// recoverable fallback instead of a blank white screen.
//
// The app already surfaces async/runtime failures through an in-app banner
// (`runtimeError` in App.tsx), but that only covers errors caught inside effects and
// event handlers. A throw during render — including the third-party KaTeX render in
// MathText — cannot be caught that way and would otherwise unmount the whole app. This
// boundary contains those, keeps stored progress untouched, and offers a reload.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the failure visible for diagnostics without leaking internals into the UI.
    // A hosted deploy would forward this to an error-monitoring service.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="auth-screen card" role="alert">
            <p className="eyebrow">Something went wrong</p>
            <h1>The app hit an unexpected error.</h1>
            <p className="lead">
              Your saved progress is stored separately and is safe. Reloading the page usually clears this.
            </p>
            <button className="primary-action" type="button" onClick={this.handleReload}>
              Reload the app
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
