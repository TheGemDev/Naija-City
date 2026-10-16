// TEMP harness (delete after): the real Scene, HUD and Phone with the Adopt app, signed in as a test player whose
// /api/kids calls go to a local server running worker/kids.ts over SQLite (port 5342).
import '../src/game/theme';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { createRoot } from 'react-dom/client';
import { _roots } from '@react-three/fiber';
import { auth } from '../src/net/firebase';
import { useSession } from '../src/net/session';
import { useGame } from '../src/game/store';
import { encodeLook } from '../src/game/wardrobe';
import { Scene } from '../src/three/Scene';
import { Hud } from '../src/ui/Hud';
import { ActionSheet } from '../src/ui/Sheets';
import { Phone } from '../src/ui/Phone';
import { ProfileSheet } from '../src/ui/ProfileSheet';
import { loadKids, startCare, useKids } from '../src/net/kids';
import { avatar } from '../src/game/avatar';
import { homeTransform } from '../src/game/origins';
import { pinWeather } from '../src/game/weather';
pinWeather('clear');

Object.defineProperty(auth, 'currentUser', { configurable: true, get: () => ({ uid: 'u1', getIdToken: async () => 'test' }) });
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
  if (/^\/api\/(kids|wallet)/.test(url.pathname)) return realFetch(`http://localhost:5342${url.pathname}${url.search}`, init);
  if (url.pathname.startsWith('/api/')) return Promise.resolve(new Response('{"error":"harness"}', { status: 404, headers: { 'content-type': 'application/json' } }));
  return realFetch(input, init);
}) as typeof fetch;

useSession.setState({ status: 'ready', user: { uid: 'u1', email: 'mama@example.com', name: 'Mama Amina', username: 'mama' } });
const look = encodeLook({ body: 'f', skin: 3, hair: 'braids', hairColor: 0, outfit: { top: 'ankara_dress', shoes: 'slippers_palm', head: 'gele_gold' } });
let n = 0;
const it = (type: string, x: number, z: number, rot = 0) => ({ id: `h${n++}`, type, x, z, rot });
const items = [
  it('play_mat', 2, 1), it('toy_box', 5, 0), it('sofa', 0, 4, 2), it('tv', 2, 0), it('high_chair', 8, 2), it('dining', 10, 1),
  it('baby_cot', 6, 7), it('bed_single', 1, 7), it('bed_single', 9, 7), it('baby_bath', 13, 7, 3), it('plant', 6, 4),
];
useGame.setState({
  started: true, name: 'Mama Amina', look, view: 'home', money: 2_000_000, minutes: 10 * 60 + 30,
  properties: [{ id: 'h1', region: 'barnawa', plot: 'full', design: 'bungalow', stage: 4, building: null, constructionPlan: null, stock: {}, boughtAt: 0, spent: 1, rented: false, rentFrom: 0, slot: 1, items } as never],
  homePropertyId: 'h1', activeHouseId: 'h1', items,
});
avatar.x = 4.5; avatar.z = 3.5;

/** Camera: position and look-at, from the console / CDP. */
/** House coordinates (cells) to world: the house group is moved and scaled (game/origins.ts). */
function cam(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
  const t = homeTransform(useGame.getState().origin, 'bungalow');
  const w = (x: number, y: number, z: number) => [t.x + x * t.scale, y * t.scale, t.z + z * t.scale] as const;
  [px, py, pz] = w(px, py, pz);
  [tx, ty, tz] = w(tx, ty, tz);
  const canvas = document.querySelector('canvas');
  const root = canvas && _roots.get(canvas);
  const st = root?.store.getState();
  if (!st) return false;
  st.camera.position.set(px, py, pz);
  const c = st.controls as unknown as { target: { set(x: number, y: number, z: number): void }; update(): void } | null;
  if (c) { c.target.set(tx, ty, tz); c.update(); } else st.camera.lookAt(tx, ty, tz);
  return true;
}
Object.assign(window, { __h: { useGame, useKids, loadKids, startCare, cam, avatar, useSession } });

createRoot(document.getElementById('root')!).render(
  <div className="app-root">
    <div className="scene-wrap"><Scene /></div>
    <div className="ui">
      <Hud />
      <ActionSheet />
      <Phone />
      <ProfileSheet />
    </div>
  </div>,
);
