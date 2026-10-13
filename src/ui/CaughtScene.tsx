import { useEffect } from 'react';
import { useCaught } from '../game/caughtScenes';
import { endCaughtScene } from '../net/crime';

/** Caught breaking in: the neighbours shout, someone asks what you're doing, you pick a (useless) answer. */
export function CaughtScene() {
  const c = useCaught();

  // Shout cards pop in one by one, then the question appears.
  useEffect(() => {
    if (!c.active || c.step !== 'shouts') return;
    const t = setTimeout(() => useCaught.setState({ step: 'ask' }), 400 + c.shouts.length * 700);
    return () => clearTimeout(t);
  }, [c.active, c.step, c.shouts.length]);

  if (!c.active || !c.scene) return null;
  const tail = c.arrest || c.cause === 'guard' ? 'Off to the station…' : 'Now run!';
  return (
    <div className="caught-scene" role="alertdialog" aria-label="Caught">
      <div className="caught-shouts" aria-live="polite">
        {c.shouts.map((s, i) => (
          <div key={s} className={`caught-shout ${i % 2 ? 'r' : 'l'}`} style={{ animationDelay: `${i * 0.7}s` }}>{s}</div>
        ))}
      </div>
      {c.step !== 'shouts' && (
        <div className="caught-card">
          <div className="caught-who"><span aria-hidden="true">{c.scene.icon}</span> <b>{c.scene.who}</b></div>
          <p className="caught-line">{c.scene.line}</p>
          {c.step === 'ask' ? (
            <div className="caught-options">
              {c.options.map((o) => (
                <button key={o.label} className="btn ghost" onClick={() => useCaught.setState({ step: 'result', result: o.result })}>{o.label}</button>
              ))}
            </div>
          ) : (
            <>
              <p className="caught-result">{c.result}</p>
              <button className="btn" onClick={endCaughtScene}>{tail}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
