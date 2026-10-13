import './boot-screen.css';

/** The full-screen loader: the same picture as the first-paint screen in index.html, with what it is waiting for at the bottom. */
export function BootScreen({ status, sub, warn, gate }: { status: string; sub?: string; warn?: boolean; gate?: boolean }) {
  return (
    <div className={`boot-screen${warn ? ' warn' : ''}${gate ? ' gate' : ''}`}>
      <img src="/icons/kaduna-life.svg" alt="" width={84} height={84} />
      <div className="boot-name">
        Naija<span>City</span>
      </div>
      <p className="boot-tag">Naija life. Real people. Zero chill.</p>
      <div className="boot-spinner" aria-hidden />
      <div className="boot-status" role="status" aria-live="polite">
        {status}
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}
