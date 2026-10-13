import { Component, type ErrorInfo, type ReactNode } from 'react';
import { freshPage, isMissingFile } from '../net/freshPage';
import { reportError } from '../net/sentry';

const text = (error: unknown) => String((error as Error | null)?.message ?? error);

/** Without this, one error anywhere takes every screen away and leaves the bare page colour, with nothing to tap.
    Styled inline: the stylesheets may be among what failed to load. */
export class CrashScreen extends Component<{ children: ReactNode }, { error: unknown; reloading: boolean }> {
  state = { error: null as unknown, reloading: false };
  /** Which screen it broke in, as React names it. */
  where = '';

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.where = info.componentStack ?? '';
    reportError(error, this.where);
    // A game file from before the last update: a new page fixes it, so don't make the player ask.
    if (isMissingFile(error) && freshPage()) this.setState({ reloading: true });
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    if (reloading) return null;
    return (
      <main style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 24, background: '#bfe3f5', color: '#0f172a', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", textAlign: 'center' }}>
        <div style={{ width: 'min(380px, 100%)', padding: '28px 24px', borderRadius: 28, background: '#fff', boxShadow: '0 20px 50px rgba(15, 23, 42, 0.14)' }}>
          <img src="/icons/kaduna-life.svg" alt="" width={64} height={64} />
          <h1 style={{ margin: '10px 0 6px', fontSize: 22 }}>Naija City needs a refresh</h1>
          <p style={{ margin: '0 0 16px', fontSize: 14, opacity: 0.75 }}>Something went wrong on this screen. Refresh to carry on.</p>
          <button onClick={() => freshPage(true)} style={{ width: '100%', padding: '14px 16px', border: 0, borderRadius: 16, background: '#0f6b3a', color: '#fff', font: 'inherit', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
            Refresh
          </button>
          <p style={{ margin: '14px 0 0', fontSize: 11, opacity: 0.55, wordBreak: 'break-word', userSelect: 'text' }}>{text(error).slice(0, 200)}</p>
        </div>
      </main>
    );
  }
}
