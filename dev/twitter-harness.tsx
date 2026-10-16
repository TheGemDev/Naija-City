// TEMP harness (delete after): the phone open on Twitter, signed in as a fake player, with a mocked /api. ?theme=dark
import { createRoot } from 'react-dom/client';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { auth } from '../src/net/firebase';
import { useSession } from '../src/net/session';
import { useGame } from '../src/game/store';
import { useCivic } from '../src/net/civic';
import { Phone } from '../src/ui/Phone';
import { PlayerInteractions } from '../src/ui/PlayerInteractions';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.theme = q.get('theme') === 'dark' ? 'dark' : 'light';

const ME = { uid: 'u-me', username: 'odogwu_k' };
const LOOKS: Record<string, string> = {
  'u-me': 'p1|m|3|low|0|tee_white,jeans_blue,slippers_black',
  'u-ada': 'p1|f|2|braids|1|blouse_yellow,skirt_navy,slippers_black',
  'u-musa': 'p1|m|4|low|0|tee_white,jeans_blue,slippers_black',
  'u-pres': 'p1|m|5|low|2|tee_white,jeans_blue,slippers_black',
  'u-tunde': 'p1|m|1|low|1|tee_white,jeans_blue,slippers_black',
};
const NAMES: Record<string, string> = { 'u-me': 'odogwu_k', 'u-ada': 'ada_lagos', 'u-musa': 'musa_kd', 'u-pres': 'baba_go_slow', 'u-tunde': 'tunde_ednut' };

const now = Date.now();
const m = 60_000;
type P = { id: number; uid: string | null; username: string | null; kind: string; icon: string; text: string; at: number; likes: number; liked: number; replies: number; views: number; reposts: number; reposted: number; reposter?: string | null; city?: string | null; parent?: number };
const mk = (id: number, uid: string | null, kind: string, icon: string, text: string, ago: number, likes = 0, extra: Partial<P> = {}): P => ({
  id, uid, username: uid ? NAMES[uid] : null, kind, icon, text, at: now - ago * m, likes, liked: 0, replies: 0, views: likes * 7 + 12, reposts: Math.floor(likes / 3), reposted: 0, ...extra,
});
const posts: P[] = [
  mk(140, 'u-ada', 'post', '💬', 'Who else is stuck in Kaduna traffic? The governor said #NoMorePotholes last week and the road is still the same. @musa_kd you dey here?', 4, 23, { replies: 3 }),
  mk(139, null, 'vdm', '🎤', 'VDM: Governor @baba_go_slow has ₦48,000,000 sitting in the Kaduna treasury and not one palliative shared today. Una dey wait make e rust? 🎤 #Palliatives', 9, 112, { replies: 1, city: 'kaduna' }),
  mk(138, 'u-pres', 'post', '💬', 'Fellow Nigerians, the fuel subsidy is back. Drive safe and buy Naija. #RenewedHope', 15, 61),
  mk(137, null, 'politics', '🚧', 'Kaduna Governor @baba_go_slow has started digging up Ahmadu Bello Way for "road repairs". Third time this week.', 22, 14, { city: 'kaduna' }),
  mk(136, 'u-musa', 'mugshot', '🚔', '@musa_kd has been arrested by the Nigeria Police for armed robbery at Kaduna Central Market. Bail: ₦250,000.', 31, 40, { replies: 2 }),
  mk(135, null, 'disaster', '⚠️', 'FLOOD WARNING: Heavy rain in Lagos. Third Mainland Bridge is closed until further notice. Stay indoors.', 44, 88, { city: 'lagos' }),
  mk(134, 'u-tunde', 'achievement', '🏆', '@tunde_ednut just unlocked “Odogwu”: Own 3 houses at the same time', 58, 9),
  mk(133, null, 'election', '🧧', 'Polls close in 2 hours for Lagos Governor. @ada_lagos leads with 54% of the vote. #LagosDecides', 70, 31, { city: 'lagos' }),
  mk(132, null, 'vdm', '🕵🏾', 'VDM: I don catch @tunde_ednut red-handed! Yahoo boy dey use 3 phones to scam mugus. EFCC una dey see am? 🕵🏾', 86, 77),
  mk(131, 'u-me', 'post', '💬', 'Just bought my first plot in Gwarinpa estate 🏠 God did! #LandlordSzn', 95, 18, { replies: 1 }),
  mk(130, null, 'crime', '🏪', 'Shop robbed at Kano Kurmi Market: thieves made away with ₦1,200,000. Police are investigating.', 120, 6, { city: 'kano' }),
  mk(129, 'u-ada', 'legacy', '🕊️', 'Ada Obi (@ada_lagos) has passed on after 63 days in Naija City. Legacy: “Lagos Big Madam” (48,200 pts). 🕊️', 200, 55),
  mk(128, null, 'season', '🏆', 'Season 12 is over! Top of the rich list: @tunde_ednut with ₦920,000,000.', 400, 12),
];
const replies: P[] = [
  mk(201, 'u-musa', 'post', '💬', '@ada_lagos I dey here o. Two hours for one kilometre 😭', 3, 4, { parent: 140 }),
  mk(202, 'u-tunde', 'post', '💬', 'Na so e be. The governor himself dey fly helicopter 🚁', 2, 9, { parent: 140 }),
  mk(203, 'u-me', 'post', '💬', 'Make we vote am out next election. #NoMorePotholes', 1, 2, { parent: 140 }),
  mk(204, 'u-ada', 'post', '💬', 'VDM no dey sleep 😂', 6, 3, { parent: 139 }),
  mk(205, 'u-tunde', 'post', '💬', 'Free @musa_kd!!', 20, 8, { parent: 136 }),
  mk(206, 'u-ada', 'post', '💬', 'Congrats landlord! 🎉', 80, 2, { parent: 131 }),
];
const FRIENDS = new Set(['u-me', 'u-ada', 'u-musa']);
const NEWS = new Set(['politics', 'election', 'roads', 'season', 'final', 'disaster']);
const snaps = [
  { id: 9, uid: 'u-ada', username: 'ada_lagos', url: '/og.jpg', caption: 'Sunset at the Lekki toll gate 🌅 #Lagos', at: now - 12 * m, until: now + 20 * 3600_000, likes: 34, liked: false, comments: 2 },
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
let nextId = 300;
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
  const method = init?.method ?? 'GET';
  const path = url.pathname;
  const sp = url.searchParams;
  await new Promise((r) => setTimeout(r, Number(q.get('delay') ?? 120)));
  const top = posts.filter((p) => !p.parent).sort((a, b) => b.id - a.id);
  if (path === '/api/looks') {
    const uids = (sp.get('u') ?? '').split(',').filter(Boolean);
    const names = (sp.get('n') ?? '').split(',').filter(Boolean);
    const all = Object.keys(NAMES).filter((u) => uids.includes(u) || names.includes(NAMES[u]));
    return json({ players: all.map((u) => ({ uid: u, username: NAMES[u], look: LOOKS[u] })) });
  }
  if (path === '/api/feed' && method === 'GET') {
    const scope = sp.get('scope');
    if (scope === 'friends') return json({ posts: top.filter((p) => (p.uid && FRIENDS.has(p.uid)) || p.reposted) });
    if (scope === 'user') {
      const name = sp.get('username');
      const uid = Object.keys(NAMES).find((u) => NAMES[u] === name);
      if (!uid) return json({ error: 'No such player' }, 404);
      return json({
        player: { uid, username: name, name: null, joined: now - 40 * 86_400_000, look: LOOKS[uid], origin: 'starter', jobId: 'teacher', city: 'kaduna', friends: 12, plots: 2, friend: FRIENDS.has(uid) ? 1 : 0 },
        posts: top.filter((p) => p.uid === uid),
      });
    }
    const city = sp.get('city');
    return json({ posts: top.filter((p) => NEWS.has(p.kind) || (p.kind === 'vdm' && p.icon === '🎤')).filter((p) => !city || !p.city || p.city === city), window: 200 });
  }
  if (path === '/api/feed/vdm') return json({ posts: top.filter((p) => p.kind === 'vdm') });
  if (path === '/api/feed' && method === 'POST') {
    const b = JSON.parse(String(init?.body ?? '{}')) as { text: string; parent?: number };
    posts.push(mk(nextId++, 'u-me', 'post', '💬', b.text, 0, 0, b.parent ? { parent: b.parent } : {}));
    if (b.parent) replies.push(posts[posts.length - 1]);
    return json({ ok: true });
  }
  let r = path.match(/^\/api\/feed\/(\d+)\/replies$/);
  if (r) {
    const id = Number(r[1]);
    const p = posts.find((x) => x.id === id);
    if (p) p.views++;
    return json({ replies: [...replies.filter((x) => x.parent === id), ...posts.filter((x) => x.parent === id && !replies.includes(x))] });
  }
  r = path.match(/^\/api\/feed\/(\d+)\/(like|repost)$/);
  if (r) {
    const p = [...posts, ...replies].find((x) => x.id === Number(r![1]));
    if (!p) return json({ error: 'gone' }, 404);
    if (r[2] === 'like') { p.liked = p.liked ? 0 : 1; p.likes += p.liked ? 1 : -1; return json({ liked: !!p.liked, likes: p.likes }); }
    p.reposted = p.reposted ? 0 : 1; p.reposts += p.reposted ? 1 : -1;
    return json({ reposted: !!p.reposted, reposts: p.reposts });
  }
  if (path === '/api/snaps') return json({ snaps: sp.get('scope') === 'global' ? snaps : [], page: 20 });
  if (path === '/api/live') return json({ bets: [], results: [] });
  return json({ error: 'mock: not here' }, 404);
}) as typeof fetch;

// Signed in, as far as the app can tell.
(auth as unknown as { currentUser: unknown }).currentUser = { uid: ME.uid, getIdToken: async () => 'dev' };
useSession.setState({ status: 'ready', user: { uid: ME.uid, email: null, name: 'Odogwu', username: ME.username } } as never);
useGame.setState({ started: true, look: LOOKS['u-me'], name: 'Odogwu', destinationId: 'kaduna', panel: 'phone', openApp: 'gist', jobId: 'teacher' } as never);
useCivic.setState({
  data: {
    policies: { president: { uid: 'u-pres', username: 'baba_go_slow', name: null, termEnds: null }, governor: { uid: 'u-pres', username: 'baba_go_slow', name: null, termEnds: null } },
    news: [
      { id: 1, office: 'president', kind: 'law', icon: '📜', text: 'The President raised the federal tax to 12%.', at: now - 30 * m },
      { id: 2, office: 'governor', kind: 'project', icon: '🚧', text: 'Kaduna: road project on Ahmadu Bello Way, ₦12,000,000.', at: now - 90 * m },
    ],
  },
} as never);

createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'fixed', inset: 0, background: '#9cc9e4' }}>
    <Phone />
    <PlayerInteractions />
  </div>,
);
