// TEMP harness (delete after): the HUD and the real phone against a mocked API, to see the unread badges.
// ?dms=&groups=&snap=&twitter=&phone=1
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
import { useAppUsage } from '../src/game/appUsage';
import { startBadges, useBadges } from '../src/net/badges';
import { startSocial, useSocial } from '../src/net/social';
import { useGroups } from '../src/net/groups';
import { Phone } from '../src/ui/Phone';
import { Hud } from '../src/ui/Hud';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => Number(q.get(k) ?? d);
const counts = { dms: num('dms', 2), groups: num('groups', 1), snap: num('snap', 4), twitter: num('twitter', 12) };
const now = Date.now();
const seen: string[] = [];
const msg = (id: number, from: string) => ({ id, from, to: 'me', kind: 'text', text: 'How far?', amount: null, status: null, ref: null, at: now - id * 1000, read: false });

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const p = u.pathname;
  if (!p.startsWith('/api/')) return realFetch(input, init);
  const method = init?.method ?? 'GET';
  if (p === '/api/badges' && method === 'GET') return json(counts);
  if (p === '/api/badges/seen') {
    const app = JSON.parse(String(init?.body ?? '{}')).app as 'snap' | 'twitter';
    seen.push(app);
    counts[app] = 0;
    return json({ ok: true });
  }
  if (p === '/api/inbox') return json({ conversations: counts.dms ? [{ uid: 'u-amaka', username: 'amaka', name: 'Amaka', unread: counts.dms, last: msg(1, 'u-amaka') }] : [] });
  if (p === '/api/groups') return json({ groups: counts.groups ? [{ id: 1, name: 'Owambe crew', members: 4, unread: counts.groups, last: null }] : [] });
  if (p === '/api/live') return json({ bets: [], results: [] });
  if (p === '/api/looks') return json({ looks: {} });
  if (p === '/api/claim') return json({ payments: [], senders: {}, balance: 0 });
  // Everything else the HUD asks for: empty lists.
  return json({ disasters: [], hits: [], kids: [], friends: [], requests: [], posts: [], snaps: [], loans: [], list: [], items: [] });
};

Object.defineProperty(auth, 'currentUser', { configurable: true, get: () => ({ getIdToken: async () => 'test-token' }) });
useAppUsage.setState({ usage: { flex: { score: 9, at: now }, gist: { score: 8, at: now }, bank: { score: 7, at: now }, jobs: { score: 6, at: now } } } as never);
useSession.setState({ status: 'ready', user: { uid: 'me', email: null, name: 'Gabriel', username: 'gabriel' } } as never);
useNet.setState({ connected: false } as never);
useGame.setState({ started: true, view: 'city', mode: 'live', panel: q.get('phone') ? 'phone' : null, minutes: 16 * 60 + 32 } as never);
startSocial();
if (q.get('nohand')) document.head.insertAdjacentHTML('beforeend', '<style>.hand{display:none!important}</style>');
startBadges();
Object.assign(window, { __game: useGame, __badges: useBadges, __social: useSocial, __groups: useGroups, __seen: seen, __counts: counts });

createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <div className="ui" style={{ position: 'absolute', inset: 0 }}>
      <Hud />
      <Phone />
    </div>
  </div>,
);
