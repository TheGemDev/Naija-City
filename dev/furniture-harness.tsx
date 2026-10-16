// TEMP harness (delete after): the real home scene + Buy mode UI with a furnished living room, for screenshots.
import '../src/game/theme';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Scene } from '../src/three/Scene';
import { BuyPanel, OwnedSheet, PlaceBar } from '../src/ui/Sheets';
import { DecorBar } from '../src/ui/DecorTools';
import { useGame } from '../src/game/store';
import * as decor from '../src/game/decor';
import * as mount from '../src/game/mount';
import { resetAvatar } from '../src/game/avatar';

const items = [
  { id: 'gate', type: 'gate', x: 11, z: 13, rot: 0 },
  { id: 'rug', type: 'velvet_rug', x: 2, z: 1, rot: 0 },
  { id: 'sofa', type: 'sofa', x: 2, z: 3, rot: 2 },
  { id: 'cab', type: 'tv_cabinet', x: 3, z: 0, rot: 0 },
  { id: 'ctable', type: 'coffee_table', x: 2, z: 2, rot: 0 },
  { id: 'side', type: 'side_table', x: 5, z: 3, rot: 0 },
  { id: 'arm', type: 'armchair', x: 0, z: 2, rot: 1 },
  { id: 'plant', type: 'plant', x: 0, z: 4, rot: 0 },
  { id: 'dining', type: 'dining', x: 9, z: 2, rot: 0 },
];
const q = new URLSearchParams(location.search);
useGame.setState({
  started: true, origin: 'nepo' as never, view: 'home', mode: q.get('mode') === 'live' ? 'live' : 'buy', money: 80_000_000, minutes: 13 * 60,
  items: q.get('empty') ? [items[0]] : items, furnitureInventory: [], properties: [], homePropertyId: null, activeHouseId: null,
});
resetAvatar({ x: 6, z: 7 });
Object.assign(window, { __decor: decor, __mount: mount, __g: useGame });

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((n) => n + 1), 500); return () => clearInterval(id); }, []);
  return <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 50, pointerEvents: 'none' }}>
    {toasts.slice(-2).map((t) => <div key={t.id} style={{ background: 'rgba(15,23,42,.85)', color: '#fff', padding: '6px 10px', borderRadius: 10, font: '600 12px system-ui' }}>{t.text}</div>)}
  </div>;
}

createRoot(document.getElementById('root')!).render(
  <div className="app-root">
    <div className="scene-wrap"><Scene /></div>
    <div className="ui">
      <Toasts />
      <BuyPanel />
      <OwnedSheet />
      <PlaceBar />
      <DecorBar />
    </div>
  </div>,
);
