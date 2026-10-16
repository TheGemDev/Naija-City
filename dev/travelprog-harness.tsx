// TEMP harness (delete after): the real HUD and the real avatar mover, on a trip. ?mode=keke&to=airport&flight=1
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { taskDurationSeconds, useGame, type TravelMode } from '../src/game/store';
import { Emoji } from '../src/ui/Icons';
import { avatar, resetAvatar } from '../src/game/avatar';
import { regionPlace, regionPlaces } from '../src/game/regions';
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

// The card as it was before the fix (src/ui/Hud.tsx TaskChip at a4ad3df), for the before shots.
function OldTaskChip() {
  const task = useGame((s) => s.task);
  const cancel = useGame((s) => s.cancelTask);
  if (!task || task.actionId === 'walk' || (task.actionId === 'work' && task.phase === 'doing')) return null;
  const pct = task.phase === 'doing' && task.total > 0 ? 100 - (task.remaining / task.total) * 100 : 0;
  return (
    <div className="task-chip">
      <span className="task-icon"><Emoji char={task.icon} size={26} /></span>
      <div className="task-body">
        <b>{task.label}</b>
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <small>{task.phase === 'walking' ? 'On the way…' : `${taskDurationSeconds(task.remaining, task.total, task.fast)} sec left`}</small>
      </div>
      <button className="x" onClick={cancel} aria-label="Cancel">
        ✕
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <div className="app-root">
    <div className="scene-wrap" style={{ position: 'absolute', inset: 0 }}>
      <Canvas camera={{ position: [0, 40, 30] }}><Avatar /></Canvas>
    </div>
    <div className="ui">{q.get('old') === '1' ? <div className="left-stack"><OldTaskChip /></div> : <Hud />}</div>
  </div>,
);

setTimeout(() => {
  if (q.get('flight') === '1') {
    // In the air: the task the airport's gate sets, ticked by hand (the game loop waits on a signed-in session).
    const s = useGame.getState();
    useGame.setState({ view: 'place', insideId: 'airport', task: { itemId: null, placeId: 'airport', actionId: 'fly_lagos', label: 'Fly to Lagos', icon: '🛫', phase: 'doing', remaining: 30, total: 30, flight: 'ticket' } } as never);
    useTrip.setState({ going: { city: 'lagos', place: regionPlaces('lagos').find((p) => p.id === 'mall') ?? regionPlaces('lagos')[3], mode: 'keke', via: 'air', at: Date.now() } });
    void s;
    if (q.get('gap') === '1') return useGame.setState({ task: null, boarding: true } as never);
    setInterval(() => useGame.getState().tick(0.1), 100);
  } else if (q.get('estate')) {
    // A house of your own in an estate: the ride to its road, in at the gate, and the walk to the door.
    const region = q.get('estate')!;
    useGame.setState({ properties: [{ id: 'h1', region, plot: 'full', design: 'bungalow', stage: 4, building: null, constructionPlan: null, stock: {}, boughtAt: 0, spent: 1, rented: false, rentFrom: 0, slot: 3, items: [] }], homePropertyId: 'h1' } as never);
    useGame.getState().goHome(mode, undefined, 'h1');
  } else {
    useGame.getState().startPlace(to, mode, mode === 'car' ? q.get('car') ?? undefined : undefined);
  }
  // No street stories in the way, unless asked for: they stop the ride (the card says so) until dealt with.
  if (q.get('stories') !== '1') setInterval(() => { avatar.storyAt = null; }, 50);
}, Number(q.get('delay') ?? 500));
