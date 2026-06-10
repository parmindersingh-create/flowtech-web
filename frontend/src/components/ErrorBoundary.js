import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to console so devs can copy/paste it
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      const stack = this.state.info?.componentStack || '';
      return (
        <div className="border border-red-300 bg-red-50 text-red-900 rounded-md p-4 m-4" data-testid="error-boundary">
          <div className="font-semibold mb-1">Something went wrong in this section.</div>
          <pre className="text-xs whitespace-pre-wrap break-all bg-white border border-red-200 rounded p-2 max-h-[200px] overflow-auto">{msg}</pre>
          {stack && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer">Show details</summary>
              <pre className="text-[11px] whitespace-pre-wrap break-all bg-white border border-red-200 rounded p-2 max-h-[160px] overflow-auto mt-1">{stack}</pre>
            </details>
          )}
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
