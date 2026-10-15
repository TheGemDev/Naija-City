import { Component, type ReactNode } from 'react';
import { freshPage } from '../net/freshPage';
import { reportError } from '../net/sentry';

/** Three.js could not get a 3D context: the phone has WebGL off (iOS Lockdown Mode), is out of graphics memory, or has too many 3D views open. */
export const isNoWebGL = (error: unknown) => /WebGL/i.test(String((error as Error | null)?.message ?? error));

/** Catches only a failed 3D context under it and shows `fallback` instead; every other error goes on up to the crash screen. */
export class GlBoundary extends Component<{ children: ReactNode; fallback: ReactNode; where: string }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (isNoWebGL(error)) reportError(error, `GlBoundary: ${this.props.where}`);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!isNoWebGL(error)) throw error;
    return this.props.fallback;
  }
}

/** In place of the game world when there is no 3D: what to try, instead of a generic "something went wrong". Styled inline like the crash screen. */
export function NoWebGLScreen() {
  return (
    <main style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'grid', placeItems: 'center', padding: 24, background: '#bfe3f5', color: '#0f172a', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", textAlign: 'center' }}>
      <div style={{ width: 'min(380px, 100%)', padding: '28px 24px', borderRadius: 28, background: '#fff', boxShadow: '0 20px 50px rgba(15, 23, 42, 0.14)' }}>
        <img src="/icons/kaduna-life.svg" alt="" width={64} height={64} />
        <h1 style={{ margin: '10px 0 6px', fontSize: 22 }}>Your browser couldn’t start 3D</h1>
        <p style={{ margin: '0 0 12px', fontSize: 14, opacity: 0.75 }}>Naija City is a 3D game and needs WebGL. Try these, then refresh:</p>
        <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', fontSize: 13, lineHeight: 1.6, textAlign: 'left' }}>
          <li>📱 Close other tabs and apps to free up memory</li>
          <li>🔒 On iPhone, turn off Lockdown Mode for naija.city</li>
          <li>🌐 Use an up-to-date Safari or Chrome</li>
        </ul>
        <button onClick={() => freshPage(true)} style={{ width: '100%', padding: '14px 16px', border: 0, borderRadius: 16, background: '#0f6b3a', color: '#fff', font: 'inherit', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>
    </main>
  );
}
