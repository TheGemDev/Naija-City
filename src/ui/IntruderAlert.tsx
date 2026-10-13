import { useEffect } from 'react';
import { CATCH } from '../game/crime';
import { catchIntruder, useIntruder } from '../net/crime';
import './intruder.css';

/** Shown to a homeowner while a burglar is in the house they are standing in. */
export function IntruderAlert() {
  const intruder = useIntruder((s) => s.intruder);
  const busy = useIntruder((s) => s.busy);

  // The prompt expires; the server checks the thief is still inside when you answer.
  useEffect(() => {
    if (!intruder) return;
    const left = intruder.until - Date.now();
    const id = setTimeout(() => useIntruder.setState({ intruder: null }), Math.max(0, left));
    return () => clearTimeout(id);
  }, [intruder]);

  if (!intruder) return null;
  return (
    <div className="intruder-alert" role="alert">
      <b>🚨 @{intruder.username} is in your house!</b>
      <small>Beat them out: they lose the loot and some cash and are injured for {Math.round(CATCH.injuredMs / 60_000)} minutes. Or hand them to the police for a cell.</small>
      <div className="intruder-actions">
        <button disabled={busy} onClick={() => void catchIntruder('beat')}>👊🏾 Beat &amp; chase out</button>
        <button disabled={busy} onClick={() => void catchIntruder('police')}>🚔 Hand to police</button>
      </div>
    </div>
  );
}
