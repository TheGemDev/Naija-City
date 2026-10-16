// TEMP harness (delete after): the real phone on the Snap app, the Snap camera and the photo editor, against a mocked
// API with sample snaps. ?view=app|camera|editor &theme=light|dark
import { createRoot } from 'react-dom/client';
import '../src/game/theme';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { useGame } from '../src/game/store';
import { useSession } from '../src/net/session';
import { auth } from '../src/net/firebase';
import { useNet } from '../src/net/multiplayer';
import { usePhoto } from '../src/game/photo';
import { useSnaps } from '../src/net/snaps';
import { Phone } from '../src/ui/Phone';
import { PhotoMode } from '../src/ui/PhotoMode';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'app';
const H = 3_600_000;
const now = Date.now();

/** A made-up street scene: sky, sun, buildings, palms and a person, in one of a few moods. */
function scene(w: number, h: number, seed: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  const skies = [['#38bdf8', '#fde68a'], ['#f97316', '#fbbf24'], ['#1e1b4b', '#7c3aed'], ['#0ea5e9', '#e0f2fe'], ['#be185d', '#fcd34d'], ['#064e3b', '#a7f3d0']];
  const [a, b] = skies[seed % skies.length];
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, a);
  g.addColorStop(0.7, b);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.beginPath();
  x.arc(w * (0.25 + (seed % 3) * 0.2), h * 0.22, w * 0.09, 0, 7);
  x.fill();
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 9; i++) {
    const bw = w * (0.1 + rnd() * 0.12);
    const bh = h * (0.18 + rnd() * 0.32);
    const bx = (i / 9) * w - bw * 0.2;
    x.fillStyle = ['#334155', '#475569', '#1f2937', '#78350f', '#065f46'][i % 5];
    x.fillRect(bx, h * 0.72 - bh, bw, bh);
    x.fillStyle = 'rgba(253,224,71,0.8)';
    for (let wy = h * 0.72 - bh + 12; wy < h * 0.7; wy += h * 0.04) for (let wx = bx + 8; wx < bx + bw - 12; wx += w * 0.035) if (rnd() > 0.45) x.fillRect(wx, wy, w * 0.015, h * 0.015);
  }
  x.fillStyle = '#57534e';
  x.fillRect(0, h * 0.72, w, h * 0.28);
  x.fillStyle = '#fbbf24';
  for (let i = 0; i < 8; i++) x.fillRect(i * w * 0.14, h * 0.85, w * 0.07, h * 0.012);
  x.font = `${w * 0.42}px 'Apple Color Emoji', sans-serif`;
  x.textAlign = 'center';
  x.fillText(['🕺🏾', '💃🏾', '🧍🏾‍♂️', '🙋🏾‍♀️', '🧑🏾‍🍳', '🤳🏾'][seed % 6], w * 0.5, h * 0.9);
  return c;
}
const picUrl = (seed: number) => scene(540, 960, seed).toDataURL('image/jpeg', 0.8);

const people = [
  ['u-amaka', 'amaka'], ['u-tunde', 'tunde_vibes'], ['u-zainab', 'zainab'], ['u-chidi', 'chidi.o'], ['u-bisi', 'bisi_b'], ['u-musa', 'musa_kano'], ['u-ngozi', 'ngozi'],
] as const;
const captions = ['Owambe for Surulere 🎉', 'Traffic no go kill me today', '', 'New crib, who dey come?', 'Jollof wars: we won', 'Kano sunset hits different', 'Mama put on point', 'Lagos to the world', ''];
let id = 100;
const mk = (uid: string, username: string, hoursAgo: number, seed: number, extra: Partial<Record<string, unknown>> = {}) => {
  const at = now - hoursAgo * H;
  return { id: id++, uid, username, url: picUrl(seed), caption: captions[seed % captions.length], at, until: at + 24 * H, likes: (seed * 37) % 120, liked: seed % 4 === 0, comments: seed % 5, views: (seed * 53) % 900, seen: seed % 3 === 0, audience: 0, ...extra };
};
const friendsSnaps = [
  mk('me', 'gabriel', 1, 11, { seen: true, views: 14 }),
  mk('u-amaka', 'amaka', 0.3, 1), mk('u-amaka', 'amaka', 2, 2), mk('u-tunde', 'tunde_vibes', 1.2, 3), mk('u-zainab', 'zainab', 5, 4, { seen: true }),
  mk('u-chidi', 'chidi.o', 3, 5), mk('u-bisi', 'bisi_b', 9, 6, { seen: true }), mk('u-tunde', 'tunde_vibes', 4, 7),
];
const globalSnaps = [friendsSnaps[1], mk('u-x1', 'lekki_boy', 2, 8), mk('u-x2', 'abuja_babe', 3, 9), friendsSnaps[3], mk('u-x3', 'kano_king', 6, 10), mk('u-x4', 'eko_oni_baje', 7, 12), mk('u-x5', 'danfo_driver', 8, 13), mk('u-x6', 'suya_spot', 11, 14)];
const comments = [
  { id: 1, uid: 'u-tunde', username: 'tunde_vibes', text: 'This one sweet o 🔥', at: now - 0.5 * H },
  { id: 2, uid: 'u-zainab', username: 'zainab', text: 'Where is this place?', at: now - 0.2 * H },
];
const chats = {
  received: [
    { id: 900, uid: 'u-amaka', username: 'amaka', caption: 'Look who dey my house 😂', at: now - 0.2 * H, opened: null, url: picUrl(15) },
    { id: 901, uid: 'u-musa', username: 'musa_kano', caption: '', at: now - 3 * H, opened: now - 2 * H, url: null },
  ],
  sent: [
    { uid: 'u-tunde', at: now - 0.1 * H, opened: null },
    { uid: 'u-zainab', at: now - 4 * H, opened: now - 3 * H },
  ],
  streaks: [{ uid: 'u-amaka', count: 42, ending: false }, { uid: 'u-tunde', count: 7, ending: true }, { uid: 'u-zainab', count: 3, ending: false }],
};

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const p = u.pathname;
  if (!p.startsWith('/api/')) return realFetch(input, init);
  const method = init?.method ?? 'GET';
  if (p === '/api/snaps' && method === 'GET') {
    const scope = u.searchParams.get('scope');
    const sort = u.searchParams.get('sort');
    const list = scope === 'friends' ? friendsSnaps : sort === 'top' ? [...globalSnaps].sort((a, b) => b.likes - a.likes) : globalSnaps;
    return json({ snaps: list, page: 30 });
  }
  if (p === '/api/snaps' && method === 'POST') return json({ ok: true, id: 999 });
  if (p === '/api/snaps/chats') return json(chats);
  if (p === '/api/friends') return json({ friends: people.map(([uid, username]) => ({ uid, username, at: now })) });
  if (/\/api\/snaps\/\d+\/comments$/.test(p)) return json({ comments });
  if (/\/api\/snaps\/\d+\/like$/.test(p)) return json({ liked: true, likes: 13 });
  if (/\/api\/snaps\/\d+\/view$/.test(p)) return json({ ok: true, views: 15 });
  if (/\/api\/snaps\/\d+\/views$/.test(p)) return json({ viewers: people.slice(0, 5).map(([uid, username], i) => ({ uid, username, at: now - i * H })) });
  if (p === '/api/looks') return json({ looks: {} });
  return json({});
};

Object.defineProperty(auth, 'currentUser', { configurable: true, get: () => ({ getIdToken: async () => 'test-token' }) });
useSession.setState({ status: 'ready', user: { uid: 'me', email: null, name: 'Gabriel', username: 'gabriel' } });
useNet.setState({ connected: true } as never);
useGame.setState({ started: true, view: 'city', mode: 'live', panel: null, minutes: 16 * 60 + 32 } as never);

const fakeScene = scene(390 * 2, 844 * 2, Number(q.get('seed') ?? 1));
Object.assign(window, { __game: useGame, __photo: usePhoto, __snaps: useSnaps });

function SceneBg() {
  return (
    <div className="scene-wrap" style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={(el) => {
          if (!el) return;
          el.width = fakeScene.width;
          el.height = fakeScene.height;
          el.getContext('2d')!.drawImage(fakeScene, 0, 0);
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    {view !== 'app' && <SceneBg />}
    <div className="ui" style={{ position: 'absolute', inset: 0 }}>
      {view !== 'app' && <PhotoMode />}
    </div>
    <Phone />
  </div>,
);

if (view === 'app') {
  const tab = q.get('tab');
  if (tab) useSnaps.setState({ tab } as never);
  useGame.setState({ panel: 'phone', openApp: 'flex' } as never);
}
if (view === 'camera' || view === 'editor') {
  usePhoto.getState().open(true);
  if (view === 'editor') {
    const shot = scene(1080, 1350, Number(q.get('seed') ?? 1));
    usePhoto.setState({ result: { shot, place: 'Surulere', day: 12 } });
  }
}
