// TEMP harness (delete after): the real HUD and the real avatar mover, on a trip. ?mode=keke&to=airport&flight=1
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { useGame, type TravelMode } from '../src/game/store';
import { resetAvatar } from '../src/game/avatar';
import { regionPlace } from '../src/game/regions';
import { Avatar } from '../src/three/Avatar';
import { Hud } from '../src/ui/Hud';
import { useTrip } from '../src/game/trip';

const q = new URLSearchParams(location.search);
const mode = (q.get('mode') ?? 'keke') as TravelMode;
const to = q.get('to') ?? 'airport';
const from = q.get('from') ?? 'motorpark';
useGame.setState({ started: true, view: 'city', destinationId: 'kaduna', mode: 'live', money: 5_000_000, minutes: 12 * 60 + 5, panel: null } as never);
resetAvatar(regionPlace('kaduna', from)!.door);

Object.assign(window, { __game: useGame, __trip: useTrip });

createRoot(document.getElementById('root')!).render(
  <div className="app-root">
    <div className="scene-wrap" style={{ position: 'absolute', inset: 0 }}>
      <Canvas camera={{ position: [0, 40, 30] }}><Avatar /></Canvas>
    </div>
    <div className="ui"><Hud /></div>
  </div>,
);

setTimeout(() => {
  if (q.get('flight') === '1') {
    // In the air: the task the airport's gate sets, ticked by hand (the game loop waits on a signed-in session).
    const s = useGame.getState();
    useGame.setState({ view: 'place', insideId: 'airport', task: { itemId: null, placeId: 'airport', actionId: 'fly_lagos', label: 'Fly to Lagos', icon: '🛫', phase: 'doing', remaining: 30, total: 30, flight: 'ticket' } } as never);
    useTrip.setState({ going: { city: 'lagos', place: regionPlace('lagos', 'airport')!, mode: 'keke', via: 'air', at: Date.now() } });
    void s;
    setInterval(() => useGame.getState().tick(0.1), 100);
  } else {
    useGame.getState().startPlace(to, mode, mode === 'car' ? q.get('car') ?? undefined : undefined);
  }
}, 500);
