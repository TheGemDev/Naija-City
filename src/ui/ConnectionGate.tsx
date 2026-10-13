import { useNet } from '../net/multiplayer';
import { useSession } from '../net/session';
import { useGame } from '../game/store';
import { BootScreen } from './BootScreen';

/** Naija City is online-only: covers (and the game loop pauses) a signed-in game while it isn't connected. */
export function ConnectionGate() {
  const signedIn = useSession((s) => !!s.user && s.status === 'ready');
  const started = useGame((s) => s.started);
  const connected = useNet((s) => s.connected);
  const replaced = useNet((s) => s.replaced);
  const moving = useNet((s) => s.moving);
  const playHere = useNet((s) => s.playHere);
  if (!signedIn || !started || (connected && !moving)) return null;
  if (!replaced) return <BootScreen gate status={moving ? 'Moving your game here…' : 'Connecting to Naija City…'} />;
  return (
    <div className="welcome connection-gate replaced">
      <div className="welcome-card center">
        <div className="logo">
          Naija<span>City</span>
        </div>
        <p className="muted">Naija City is running somewhere else (another tab or device).</p>
        <button className="btn big" onClick={playHere}>
          Play here
        </button>
      </div>
    </div>
  );
}
