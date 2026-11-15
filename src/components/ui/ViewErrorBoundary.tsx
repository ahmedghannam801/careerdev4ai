import React from 'react';

/**
 * The view error boundary.
 *
 * A page that throws while rendering used to leave the candidate with a blank
 * screen and no clue what happened. This boundary catches the fault, records
 * it in the browser console (so it can be diagnosed from the log the user
 * already sends) and shows a recoverable message instead.
 *
 * The reset is deliberately a remount: it drops the broken subtree and lets
 * the parent render the view again from the current data.
 */

interface ViewErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown when the boundary catches a fault. */
  fallback?: React.ReactNode;
  /** Called with the fault, so a host can report it. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /** Changing this value clears a caught fault (e.g. when the route changes). */
  resetKey?: string | number | null;
}

interface ViewErrorBoundaryState {
  error: Error | null;
}

export class ViewErrorBoundary extends React.Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  state: ViewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // The console entry is the diagnosis trail: the user can be asked to
    // share it, and it names the component stack that failed.
    console.error('A view failed to render:', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        className="m-4 rounded-2xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-5 text-sm text-[var(--text-primary)]"
      >
        <h2 className="text-base font-semibold">This page could not be displayed</h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Your career data was not changed. Reload the page to try again.
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-4 rounded-lg border border-[var(--color-warning)]/30 px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-warning)]/10"
        >
          Try again
        </button>
      </div>
    );
  }
}

export default ViewErrorBoundary;
