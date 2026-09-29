import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence.
 *
 * Without this, any error thrown while rendering a page unmounts the whole
 * React tree and the user gets a blank white screen with no way back. That
 * turns a recoverable problem in one component into a dead application.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console so the failure is diagnosable from the browser's
    // dev tools; there is no error reporting service wired up.
    console.error('[Taskflow] Unhandled render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6">
        <div className="card w-full max-w-lg p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-red-500/15 p-2 text-red-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100">Something broke on this screen</h1>
              <p className="text-sm text-slate-400">Your data is safe. Reloading usually fixes it.</p>
            </div>
          </div>

          <pre className="mb-4 max-h-40 overflow-auto rounded-lg border border-white/10 bg-surface-1 p-3 text-xs text-slate-300">
            {error.message}
          </pre>

          <button type="button" onClick={() => window.location.reload()} className="btn-primary w-full">
            <RefreshCw className="h-4 w-4" />
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
