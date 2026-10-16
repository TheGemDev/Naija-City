// The phone's Twitter app: the national feed, laid out like X. Tabs For you (news, VDM, friends and snaps together),
// Following (friends and their reposts), one state's news, and VDM. Tap a post for its thread, a name for a profile,
// a #tag for the search; the + button writes a post. Data: src/net/live.ts (feeds) and src/net/twitter.ts (profiles,
// reposts, views). Live events and the cup-final bet slip sit on the Explore page.

import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './twitter.css';
import { naira, useGame } from '../game/store';
import { BET_WINDOW_MS, FINAL_ODDS, FINAL_TEAMS, MAX_STAKE, liveEvent, roadEvent, type FinalPick } from '../game/live';
import { PLACE_BY_ID } from '../game/city';
import { regionPlace, getRegion } from '../game/regions';
import { blogOf, BLOGS } from '../game/news';
import { CITY_NAME, CIVIC_CITIES, OFFICE_SHORT, OFFICES, type CivicCity, type CivicNews } from '../game/civic';
import { originOf } from '../game/origins';
import { jobById } from '../game/jobs';
import {
  FEED_WINDOW, deletePost, loadFeed, loadFriendsFeed, loadLive, loadReplies, loadVdmFeed, placeBet, postGist, setFeedCity, useLive,
  type FeedPost,
} from '../net/live';
import { loadProfile, openThread, toggleLike, useTw } from '../net/twitter';
import { commentSnap, deleteSnapComment, likeSnap, loadSnapComments, loadSnaps, useSnaps, type Snap } from '../net/snaps';
import { useCivic } from '../net/civic';
import { useSession } from '../net/session';
import { useSocial } from '../net/social';
import { openedApp } from '../net/badges';
import { shareLink, snapLink, tweetLink } from '../net/deeplink';
import { Face } from './Face';
import { Mugshot, MugshotShare } from './Mugshot';
import { Emoji } from './Icons';

/* ---------- Small helpers ---------- */

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

const ago = (at: number) => {
  const s = Math.max(1, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
};

const stamp = (at: number) => {
  const d = new Date(at);
  return `${d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })} · ${d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

/** 1234 → 1.2K, like the counts under a post. */
const short = (n: number | undefined) => {
  const v = n ?? 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
};

/** A place by the name it goes by in that city (Murtala Square is Eagle Square in Abuja). */
const placeName = (city: string, id: string) => (regionPlace(city, id) ?? PLACE_BY_ID[id])?.name;

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/** Posts and replies are cut to this on the server (worker/fun.ts MAX_POST). */
const MAX_POST = 200;
/** The server's waits between posts and between replies (worker/fun.ts), shown in the composer. */
const POST_GAP_MS = 60_000;
const REPLY_GAP_MS = 5_000;
const cooldown = { post: 0, reply: 0 };

/* ---------- Icons (outline, like X's) ---------- */

const svg = (d: ReactNode, size = 18, fill = false) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const I = {
  reply: (s?: number) => svg(<path d="M4 11.5C4 7.4 7.4 4.5 11.6 4.5h1C16.8 4.5 20 7.6 20 11.6c0 4.1-3.4 7-7.6 7H11l-4.6 3v-3.9C5 16.4 4 14.1 4 11.5Z" />, s),
  repost: (s?: number) => svg(<><path d="M7 7h10.5a2 2 0 0 1 2 2v5" /><path d="m4 10 3-3-3-3" transform="translate(0 0)" /><path d="M17 17H6.5a2 2 0 0 1-2-2v-5" /><path d="m20 14-3 3 3 3" /></>, s),
  heart: (s?: number) => svg(<path d="M12 20s-7.5-4.4-7.5-10A4.4 4.4 0 0 1 12 7.3 4.4 4.4 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" />, s),
  heartFill: (s?: number) => svg(<path d="M12 20.6s-8.2-4.7-8.2-10.7A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 8.2 3.3c0 6-8.2 10.7-8.2 10.7Z" />, s, true),
  views: (s?: number) => svg(<><path d="M5 20V11" /><path d="M10 20V5" /><path d="M15 20v-6" /><path d="M20 20V9" /></>, s),
  share: (s?: number) => svg(<><path d="M12 15V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>, s),
  more: (s?: number) => svg(<><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>, s),
  back: (s?: number) => svg(<><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>, s),
  search: (s?: number) => svg(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>, s),
  plus: (s?: number) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, s),
  feather: (s?: number) => svg(<><path d="M20 4c-7 0-12 4.5-13.5 11.5L5 20" /><path d="M20 4c0 7-4.5 11.5-11 12" /><path d="M9.5 12.5H15" /></>, s),
  trash: (s?: number) => svg(<><path d="M4.5 7h15" /><path d="M9.5 7V4.8h5V7" /><path d="M6.5 7l1 12.5h9l1-12.5" /></>, s),
  link: (s?: number) => svg(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>, s),
  job: (s?: number) => svg(<><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V5.5h6v2" /></>, s),
  pin: (s?: number) => svg(<><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>, s),
  cal: (s?: number) => svg(<><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16" /><path d="M8.5 3.5v4" /><path d="M15.5 3.5v4" /></>, s),
  chat: (s?: number) => svg(<><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z" /></>, s),
  globe: (s?: number) => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" /></>, s),
};

/** The verified mark: blue for VDM and the blogs, grey for the government, gold for the police and the city. */
function Badge({ kind, title }: { kind: 'blue' | 'gov' | 'gold'; title: string }) {
  return (
    <span className={`tw-badge ${kind}`} title={title} aria-label={title}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path fill="currentColor" d="M12 1.8l2.4 1.9 3-.4 1.1 2.9 2.8 1.1-.4 3L22.7 12l-1.9 2.4.4 3-2.8 1.1-1.1 2.8-3-.4L12 22.8l-2.4-1.9-3 .4-1.1-2.8-2.8-1.1.4-3L1.3 12l1.9-2.4-.4-3 2.8-1.1 1.1-2.9 3 .4Z" />
        <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="m7.8 12.3 2.8 2.7 5.6-5.8" />
      </svg>
    </span>
  );
}

/* ---------- Who wrote it ---------- */

/** Whose profile a name opens: a player, or one of the city's own accounts. */
type Who =
  | { kind: 'player'; username: string; uid?: string | null }
  | { kind: 'vdm' } | { kind: 'police' } | { kind: 'city' } | { kind: 'alerts' } | { kind: 'gazette' }
  | { kind: 'blog'; name: string };

type Tone = 'player' | 'vdm' | 'crime' | 'alert' | 'gov' | 'gold' | 'legacy' | 'news' | 'gazette';

interface Author {
  name: string;
  handle: string;
  badge: 'blue' | 'gov' | 'gold' | null;
  badgeTitle: string;
  who: Who;
  face?: { uid: string | null; username: string | null };
  emoji?: string;
  /** Avatar colours for the city's own accounts. */
  bg?: string;
  /** "President", "Lagos Governor": an office the player holds. */
  office?: string;
}

const BLOG_COLORS = ['#e11d48', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#0f766e'];
const blogHandle = (name: string) => name.replace(/[^A-Za-z0-9]/g, '');
const SYSTEM: Record<Exclude<Who['kind'], 'player' | 'blog'>, Omit<Author, 'who'>> = {
  vdm: { name: 'VDM', handle: 'VDM', badge: 'blue', badgeTitle: 'Verified whistleblower', emoji: '🎤', bg: 'linear-gradient(135deg, #111827, #b91c1c)' },
  police: { name: 'Nigeria Police', handle: 'NgPoliceHQ', badge: 'gold', badgeTitle: 'Official: Nigeria Police', emoji: '👮🏾', bg: 'linear-gradient(135deg, #1e3a8a, #0f172a)' },
  city: { name: 'Naija City', handle: 'NaijaCity', badge: 'gold', badgeTitle: 'Official: Naija City', emoji: '🇳🇬', bg: 'linear-gradient(135deg, #15803d, #064e3b)' },
  alerts: { name: 'Naija Alerts', handle: 'NaijaAlerts', badge: 'gold', badgeTitle: 'Official: emergency alerts', emoji: '⚠️', bg: 'linear-gradient(135deg, #f97316, #b45309)' },
  gazette: { name: 'Federal Gazette', handle: 'FedGazette', badge: 'gov', badgeTitle: 'Government account', emoji: '📜', bg: 'linear-gradient(135deg, #a16207, #57534e)' },
};
const BIO: Record<Exclude<Who['kind'], 'player'>, string> = {
  vdm: 'Naija’s loudest whistleblower. He exposes thieves and drags the government. Call him from the Police app. 🎤',
  police: 'Arrests, mugshots and bail across the federation. Report crime from the Police app.',
  city: 'Achievements, legacies, the season and the cup final. The whole of Naija City in one place.',
  alerts: 'Floods, fires and storms as they happen. Stay safe.',
  gazette: 'What the people in office did, as the law requires it to be published. Read it all in the Civic app.',
  blog: 'Naija news blog. Politics, roads, elections and gist from every state.',
};

/** Players who hold an office now, by uid. */
function useOfficials() {
  const policies = useCivic((s) => s.data?.policies);
  return useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of OFFICES) {
      const h = policies?.[o];
      if (h?.uid && !m[h.uid]) m[h.uid] = OFFICE_SHORT[o];
    }
    return m;
  }, [policies]);
}

function authorOf(p: FeedPost, officials: Record<string, string>): Author {
  if (p.kind === 'post') {
    const username = p.username ?? 'someone';
    const office = p.uid ? officials[p.uid] : undefined;
    return { name: username, handle: username, badge: office ? 'gov' : null, badgeTitle: office ? `Government: ${office}` : '', who: { kind: 'player', username, uid: p.uid }, face: { uid: p.uid, username: p.username }, office };
  }
  const sys = p.kind === 'vdm' ? 'vdm' : p.kind === 'mugshot' ? 'police' : p.kind === 'disaster' ? 'alerts' : ['achievement', 'legacy', 'season', 'final'].includes(p.kind) ? 'city' : null;
  if (sys) return { ...SYSTEM[sys], emoji: sys === 'city' ? p.icon : SYSTEM[sys].emoji, who: { kind: sys } };
  const name = blogOf(p.id);
  return { name, handle: blogHandle(name), badge: 'blue', badgeTitle: 'Verified news blog', who: { kind: 'blog', name }, bg: BLOG_COLORS[BLOGS.indexOf(name) % BLOG_COLORS.length] };
}

function toneOf(p: FeedPost): Tone {
  switch (p.kind) {
    case 'post': return 'player';
    case 'vdm': return 'vdm';
    case 'mugshot': case 'arrest': case 'crime': case 'underworld': case 'scam': case 'vice': return 'crime';
    case 'disaster': return 'alert';
    case 'politics': case 'election': case 'roads': return 'gov';
    case 'achievement': case 'season': case 'final': return 'gold';
    case 'legacy': return 'legacy';
    default: return 'news';
  }
}

const KIND_LABEL: Record<string, string> = {
  mugshot: 'Arrest', arrest: 'Arrest', crime: 'Crime', underworld: 'Underworld', scam: 'Scam alert', vice: 'Street',
  disaster: 'Disaster alert', politics: 'Politics', election: 'Elections', roads: 'Roads',
  achievement: 'Achievement unlocked', season: 'Season', final: 'Cup final', legacy: 'In memoriam',
  love: 'Love life', family: 'Family', cribs: 'Cribs', hangout: 'Hangout', game: 'Games', business: 'Business',
};

/** The line above a post saying what it is (X's "reposted" / "pinned" line). */
function contextOf(p: FeedPost, tone: Tone): { icon: string; text: string } | null {
  if (tone === 'player') return null;
  if (tone === 'vdm') return { icon: p.icon || '🎤', text: p.icon === '🎤' || p.icon === '🚧' ? 'VDM on the government' : 'VDM exposé' };
  return { icon: p.icon, text: KIND_LABEL[p.kind] ?? 'News' };
}

/* ---------- Navigation inside the app ---------- */

type View =
  | { t: 'thread'; id: number }
  | { t: 'snap'; id: number }
  | { t: 'profile'; who: Who }
  | { t: 'explore'; q?: string };

interface Nav {
  open(v: View): void;
  back(): void;
  compose(reply?: { id: number; to: string; prefill?: string; snap?: boolean }): void;
}
const NavCtx = createContext<Nav>({ open: () => {}, back: () => {}, compose: () => {} });
const useNav = () => useContext(NavCtx);

/* ---------- Text, avatars, actions ---------- */

/** Post text with @names and #tags you can tap, and naira amounts in bold. */
function RichText({ text }: { text: string }) {
  const nav = useNav();
  const parts = text.split(/(@[A-Za-z0-9_]+|#[A-Za-z0-9_]+|₦[\d,]+(?:\.\d+)?)/g);
  return (
    <>
      {parts.map((s, i) => {
        if (i % 2 === 0) return s;
        if (s[0] === '@') return <button key={i} type="button" className="tw-link" onClick={(e) => { stop(e); nav.open({ t: 'profile', who: { kind: 'player', username: s.slice(1).toLowerCase() } }); }}>{s}</button>;
        if (s[0] === '#') return <button key={i} type="button" className="tw-link" onClick={(e) => { stop(e); nav.open({ t: 'explore', q: s }); }}>{s}</button>;
        return <b key={i} className="tw-money">{s}</b>;
      })}
    </>
  );
}

function Avatar({ a, size = 40 }: { a: Pick<Author, 'face' | 'emoji' | 'bg' | 'name'>; size?: number }) {
  return (
    <span className="tw-avatar" style={{ width: size, height: size, background: a.face ? undefined : a.bg }}>
      {a.face ? <Face uid={a.face.uid} username={a.face.username} size="fill" /> : a.emoji ? <Emoji char={a.emoji} size={Math.round(size * 0.5)} /> : <b style={{ fontSize: size * 0.42 }}>{a.name.slice(0, 1)}</b>}
    </span>
  );
}

function AuthorLine({ a, at, children }: { a: Author; at?: number; children?: ReactNode }) {
  const nav = useNav();
  const alias = useGame((s) => (a.face?.uid ? s.aliases[a.face.uid] : undefined));
  return (
    <div className="tw-head">
      <button type="button" className="tw-name" onClick={(e) => { stop(e); nav.open({ t: 'profile', who: a.who }); }}>
        <b>{alias ?? a.name}</b>
        {a.badge && <Badge kind={a.badge} title={a.badgeTitle} />}
        {a.office && <span className="tw-office">{a.office}</span>}
        <span className="tw-handle">@{a.handle}</span>
      </button>
      {at !== undefined && <span className="tw-time">· {ago(at)}</span>}
      {children}
    </div>
  );
}

function Count({ n }: { n?: number }) {
  return <span className="tw-count">{n ? short(n) : ''}</span>;
}

/** Reply, like, views and share under a post. Replies (no reposts or views on the server) get less. */
function Actions({ p, reply, big }: { p: FeedPost; reply?: { parent: FeedPost }; big?: boolean }) {
  const nav = useNav();
  const [pop, setPop] = useState(false);
  const liked = !!p.liked;
  const size = big ? 21 : 17;
  const title = `${authorOf(p, {}).name} on Naija Twitter`;
  return (
    <div className={`tw-actions ${big ? 'big' : ''}`} onClick={stop}>
      <button type="button" className="tw-act reply" aria-label={`Reply${p.replies ? `, ${p.replies} replies` : ''}`}
        onClick={() => (reply ? nav.compose({ id: reply.parent.id, to: reply.parent.username ?? 'someone', prefill: p.username ? `@${p.username} ` : '' }) : nav.compose({ id: p.id, to: authorOf(p, {}).handle }))}>
        {I.reply(size)}{!big && !reply && <Count n={p.replies} />}
      </button>
      <button type="button" className={`tw-act like ${liked ? 'on' : ''} ${pop ? 'pop' : ''}`} aria-pressed={liked} aria-label={`Like${p.likes ? `, ${p.likes}` : ''}`}
        onClick={() => { if (!liked) setPop(true); void toggleLike(p); }} onAnimationEnd={() => setPop(false)}>
        {liked ? I.heartFill(size) : I.heart(size)}{!big && <Count n={p.likes} />}
      </button>
      {!reply && (
        <span className="tw-act views" aria-label={`${p.views ?? 0} views`}>
          {I.views(size)}{!big && <Count n={p.views} />}
        </span>
      )}
      {!reply && (
        <button type="button" className="tw-act share" aria-label="Share" onClick={() => void shareLink(tweetLink(p.id), title)}>
          {I.share(size)}
        </button>
      )}
    </div>
  );
}

/** The ⋯ menu on my own posts. */
function MoreMenu({ onDelete, link }: { onDelete?: () => void; link?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!onDelete && !link) return null;
  return (
    <span className="tw-more-wrap" onClick={stop}>
      <button type="button" className="tw-more" aria-label="More" aria-expanded={open} onClick={() => setOpen(!open)}>{I.more(17)}</button>
      {open && (
        <>
          <span className="tw-menu-scrim" onClick={() => setOpen(false)} />
          <span className="tw-menu" role="menu">
            {link && <button type="button" role="menuitem" onClick={() => { setOpen(false); link(); }}>{I.link(16)} Share link</button>}
            {onDelete && <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}>{I.trash(16)} Delete</button>}
          </span>
        </>
      )}
    </span>
  );
}

/* ---------- A post in a list ---------- */

const Tweet = memo(function Tweet({ p, parent, line, myUid, officials }: { p: FeedPost; parent?: FeedPost; line?: boolean; myUid?: string; officials: Record<string, string> }) {
  const nav = useNav();
  const tone = toneOf(p);
  const a = authorOf(p, officials);
  const ctx = parent ? null : contextOf(p, tone);
  const mine = p.kind === 'post' && !!p.uid && p.uid === myUid;
  const open = () => (parent ? undefined : nav.open({ t: 'thread', id: p.id }));
  return (
    <article className={`tw-post tone-${tone} ${line ? 'has-line' : ''} ${parent ? 'is-reply' : ''}`} onClick={open} tabIndex={parent ? undefined : 0} onKeyDown={(e) => e.key === 'Enter' && open()}>
      {p.reposter && (
        <div className="tw-ctx repost-ctx">{I.repost(13)} <span>{p.reposter === useSession.getState().user?.username ? 'You' : `@${p.reposter}`} reposted</span></div>
      )}
      {ctx && <div className={`tw-ctx ctx-${tone}`}><Emoji char={ctx.icon} size={13} /> <span>{ctx.text}</span></div>}
      <div className="tw-grid">
        <div className="tw-left">
          <button type="button" className="tw-avatar-btn" aria-label={`${a.name}'s profile`} onClick={(e) => { stop(e); nav.open({ t: 'profile', who: a.who }); }}>
            <Avatar a={a} />
          </button>
          {line && <i className="tw-line" aria-hidden />}
        </div>
        <div className="tw-body">
          <AuthorLine a={a} at={p.at}>
            <MoreMenu
              onDelete={mine ? () => { if (window.confirm(parent ? 'Delete this reply?' : 'Delete this post?')) void deletePost(p.id, parent?.id).catch(() => {}); } : undefined}
            />
          </AuthorLine>
          {parent && <div className="tw-replying">Replying to <button type="button" className="tw-link" onClick={(e) => { stop(e); nav.open({ t: 'profile', who: authorOf(parent, officials).who }); }}>@{authorOf(parent, officials).handle}</button></div>}
          <p className="tw-text"><RichText text={p.text} /></p>
          {p.kind === 'mugshot' && p.uid && <div className="tw-media mug"><Mugshot uid={p.uid} username={p.username} seed={p.id} at={p.at} /></div>}
          <Actions p={p} reply={parent ? { parent } : undefined} />
        </div>
      </div>
    </article>
  );
});

/** A snap in the For you feed: a post with a picture. Its comments are its replies. */
const SnapPost = memo(function SnapPost({ s }: { s: Snap }) {
  const nav = useNav();
  const a: Author = { name: s.username ?? 'someone', handle: s.username ?? 'someone', badge: null, badgeTitle: '', who: { kind: 'player', username: s.username ?? '', uid: s.uid }, face: { uid: s.uid, username: s.username } };
  const open = () => nav.open({ t: 'snap', id: s.id });
  return (
    <article className="tw-post tone-snap" onClick={open} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open()}>
      <div className="tw-ctx ctx-snap"><Emoji char="📸" size={13} /> <span>Snap · gone in {mmss(s.until - Date.now())}</span></div>
      <div className="tw-grid">
        <div className="tw-left">
          <button type="button" className="tw-avatar-btn" aria-label={`${a.name}'s profile`} onClick={(e) => { stop(e); nav.open({ t: 'profile', who: a.who }); }}><Avatar a={a} /></button>
        </div>
        <div className="tw-body">
          <AuthorLine a={a} at={s.at} />
          {s.caption && <p className="tw-text"><RichText text={s.caption} /></p>}
          <div className="tw-media"><img src={s.url} alt={s.caption || `Snap by @${s.username ?? 'someone'}`} loading="lazy" draggable={false} /></div>
          <div className="tw-actions" onClick={stop}>
            <button type="button" className="tw-act reply" aria-label="Comments" onClick={open}>{I.reply(17)}<Count n={s.comments} /></button>
            <button type="button" className={`tw-act like ${s.liked ? 'on' : ''}`} aria-pressed={s.liked} aria-label="Like" onClick={() => void likeSnap(s.id)}>{s.liked ? I.heartFill(17) : I.heart(17)}<Count n={s.likes} /></button>
            <button type="button" className="tw-act share" aria-label="Share" onClick={() => void shareLink(snapLink(s.id), `@${s.username ?? 'someone'} on Naija City`)}>{I.share(17)}</button>
          </div>
        </div>
      </div>
    </article>
  );
});

/** A line of the government's gazette, as a post from the gazette's account. */
const GazettePost = memo(function GazettePost({ n }: { n: CivicNews }) {
  const a: Author = { ...SYSTEM.gazette, who: { kind: 'gazette' } };
  const openCivic = () => useCivic.setState({ wantOpen: true, wantNews: true });
  return (
    <article className="tw-post tone-gazette" onClick={openCivic} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCivic()}>
      <div className="tw-ctx ctx-gazette"><Emoji char="📜" size={13} /> <span>Official gazette{n.office ? ` · ${OFFICE_SHORT[n.office]}` : ''}</span></div>
      <div className="tw-grid">
        <div className="tw-left"><Avatar a={a} /></div>
        <div className="tw-body">
          <AuthorLine a={a} at={n.at} />
          <div className="tw-gazette"><Emoji char={n.icon} size={18} /><p>{n.text}</p></div>
          <div className="tw-actions"><span className="tw-act">{I.link(15)}<span className="tw-count">Read in Civic</span></span></div>
        </div>
      </div>
    </article>
  );
});

function Skeleton({ n = 4 }: { n?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="tw-post tw-skel">
          <div className="tw-grid">
            <div className="tw-left"><span className="sk sk-av" /></div>
            <div className="tw-body">
              <span className="sk sk-line" style={{ width: '45%' }} />
              <span className="sk sk-line" style={{ width: '92%' }} />
              <span className="sk sk-line" style={{ width: i % 2 ? '70%' : '80%' }} />
              <span className="sk sk-line short" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Feed items, trends ---------- */

type Item =
  | { k: 'post'; key: string; at: number; p: FeedPost }
  | { k: 'snap'; key: string; at: number; s: Snap }
  | { k: 'gazette'; key: string; at: number; n: CivicNews };

const postItems = (posts: FeedPost[]): Item[] => posts.map((p) => ({ k: 'post', key: `p${p.id}`, at: p.at, p }));

interface Trend { label: string; q: string; cat: string; n: number }

const CITY_WORDS = Object.values(CITY_NAME);

/** What's happening: #tags, @names and states that come up most in the posts we have, newest first on a tie. */
function trendsOf(items: Item[]): Trend[] {
  const tally = new Map<string, Trend & { score: number }>();
  const add = (key: string, label: string, q: string, cat: string, w: number) => {
    const t = tally.get(key);
    if (t) { t.n++; t.score += w; } else tally.set(key, { label, q, cat, n: 1, score: w });
  };
  let crime = 0, alerts = 0;
  for (const it of items) {
    const text = it.k === 'post' ? it.p.text : it.k === 'snap' ? it.s.caption : it.n.text;
    const tone = it.k === 'post' ? toneOf(it.p) : it.k === 'gazette' ? 'gov' : 'player';
    const cat = tone === 'gov' || tone === 'gazette' ? 'Politics · Trending' : tone === 'vdm' ? 'VDM · Trending' : tone === 'crime' ? 'Crime · Trending' : 'Trending in Naija';
    for (const m of text.match(/#[A-Za-z0-9_]+/g) ?? []) add(m.toLowerCase(), m, m, cat, 3);
    for (const m of text.match(/@[A-Za-z0-9_]+/g) ?? []) add(m.toLowerCase(), m, m, 'People · Trending', 1);
    for (const c of CITY_WORDS) if (text.includes(c)) add(`city:${c}`, c, c, `Trending in ${c}`, 1);
    if (tone === 'crime') crime++;
    if (tone === 'alert') alerts++;
  }
  const list = [...tally.values()].filter((t) => t.n > 1 || t.label.startsWith('#'));
  if (alerts) list.push({ label: 'Disaster alerts', q: 'tone:alert', cat: 'Breaking', n: alerts, score: 100 });
  if (crime > 1) list.push({ label: 'Arrests & crime', q: 'tone:crime', cat: 'Police · Trending', n: crime, score: crime });
  return list.sort((a, b) => b.score - a.score).slice(0, 10);
}

function matches(it: Item, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith('tone:')) return it.k === 'post' && toneOf(it.p) === s.slice(5);
  const text = (it.k === 'post' ? `${it.p.text} @${it.p.username ?? ''}` : it.k === 'snap' ? `${it.s.caption} @${it.s.username ?? ''}` : it.n.text).toLowerCase();
  return text.includes(s);
}

function TrendRow({ t, i }: { t: Trend; i: number }) {
  const nav = useNav();
  return (
    <button type="button" className="tw-trend" onClick={() => nav.open({ t: 'explore', q: t.q })}>
      <small>{i + 1} · {t.cat}</small>
      <b>{t.label}</b>
      <small>{t.n} {t.n === 1 ? 'post' : 'posts'}</small>
    </button>
  );
}

/* ---------- Live events and the cup final (Explore) ---------- */

function LiveRow({ icon, title, blurb, active, kicker, ends }: { icon: string; title: string; blurb: string; active: boolean; kicker: string; ends?: string }) {
  return (
    <div className={`tw-live ${active ? 'on' : ''}`}>
      <span className="tw-live-icon"><Emoji char={icon} size={26} /></span>
      <span className="tw-live-info">
        <small>{active && <i className="tw-live-dot" />}{kicker}</small>
        <b>{title}</b>
        <small>{blurb}</small>
        {ends && <small className="tw-live-ends">{ends}</small>}
      </span>
    </div>
  );
}

function LiveEvents() {
  const now = useNow();
  const city = useGame((s) => s.destinationId);
  const e = liveEvent(now, city);
  const road = roadEvent(now);
  return (
    <>
      <LiveRow icon={e.def.icon} title={e.def.title} blurb={e.def.blurb} active={e.active}
        kicker={e.active ? 'LIVE NOW · whole city' : `Next live event in ${mmss(e.startsAt - now)}`}
        ends={e.active ? `Ends in ${mmss(e.endsAt - now)}${e.def.place ? ` · 📍 ${placeName(city, e.def.place)}` : ''}` : undefined} />
      <LiveRow icon={road.def.icon} title={road.def.title} blurb={road.def.blurb} active={road.active}
        kicker={road.active ? 'ON THE ROADS NOW · drivers' : `Next road event in ${mmss(road.startsAt - now)}`}
        ends={road.active ? `Ends in ${mmss(road.endsAt - now)}` : undefined} />
    </>
  );
}

/** A thin strip on For you while something is live, opening Explore. */
function LiveStrip() {
  const now = useNow(5000);
  const city = useGame((s) => s.destinationId);
  const nav = useNav();
  const e = liveEvent(now, city);
  const road = roadEvent(now);
  const on = e.active ? e.def : road.active ? road.def : null;
  if (!on) return null;
  return (
    <button type="button" className="tw-livestrip" onClick={() => nav.open({ t: 'explore' })}>
      <i className="tw-live-dot" /> <b>LIVE</b> <Emoji char={on.icon} size={14} /> <span>{on.title}</span>
    </button>
  );
}

function BetSlip() {
  const now = useNow();
  const e = liveEvent(now);
  const bets = useLive((s) => s.bets);
  const results = useLive((s) => s.results);
  const busy = useLive((s) => s.busy);
  const money = useGame((s) => s.money);
  const [pick, setPick] = useState<FinalPick>('home');
  const [stake, setStake] = useState(5_000);
  useEffect(() => void loadLive(), []);
  const open = e.active && e.def.id === 'final' && now < e.startsAt + BET_WINDOW_MS;
  const mine = bets.find((b) => b.slot === e.slot);
  if (!open && !bets.length && !results.length) return null;
  return (
    <div className="list-card bet-card tw-bet">
      <b><Emoji char="🏆" size={16} /> {FINAL_TEAMS.home} vs {FINAL_TEAMS.away}</b>
      {open && !mine && (
        <>
          <small className="muted">Bets close in {mmss(e.startsAt + BET_WINDOW_MS - now)}. Result at full time.</small>
          <div className="bet-picks">
            {(Object.keys(FINAL_ODDS) as FinalPick[]).map((p) => (
              <button key={p} className={pick === p ? 'on' : ''} onClick={() => setPick(p)}>
                <b>{p === 'draw' ? 'Draw' : FINAL_TEAMS[p]}</b>
                <small>×{FINAL_ODDS[p]}</small>
              </button>
            ))}
          </div>
          <div className="bet-stakes">
            {[1_000, 5_000, 20_000, MAX_STAKE].map((a) => (
              <button key={a} className={stake === a ? 'on' : ''} disabled={money < a} onClick={() => setStake(a)}>{naira(a)}</button>
            ))}
          </div>
          <button className="btn go wide" disabled={busy || money < stake} onClick={() => placeBet(pick, stake)}>
            Stake {naira(stake)} · win {naira(Math.floor(stake * FINAL_ODDS[pick]))}
          </button>
        </>
      )}
      {mine && (
        <small>
          Your bet: {naira(mine.stake)} on {mine.pick === 'draw' ? 'a draw' : FINAL_TEAMS[mine.pick]}{' '}
          {mine.payout === null ? <>· waiting for full time <Emoji char="⏳" size={13} /></> : mine.payout > 0 ? <>· WON {naira(mine.payout)} <Emoji char="🤑" size={13} /></> : <>· lost <Emoji char="😩" size={13} /></>}
        </small>
      )}
      {results.slice(0, 2).map((r) => (
        <small key={r.slot} className="muted">Result: {FINAL_TEAMS.home} {r.score} {FINAL_TEAMS.away}</small>
      ))}
    </div>
  );
}

/* ---------- Lists ---------- */

const PAGE = 25;

/** Renders a feed a page at a time as you scroll, asking the server for older posts once all of it is shown. */
function FeedList({ items, loading, more, empty, scroller, inject }: {
  items: Item[]; loading: boolean; more?: () => void; empty: ReactNode; scroller: () => HTMLElement | null;
  /** Something to slot in after the 4th item (What's happening). */
  inject?: ReactNode;
}) {
  const myUid = useSession((s) => s.user?.uid);
  const officials = useOfficials();
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const shown = items.length > limit ? items.slice(0, limit) : items;
  const state = useRef({ more, loading, total: items.length, limit });
  state.current = { more, loading, total: items.length, limit };
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (!es[0]?.isIntersecting) return;
      const s = state.current;
      if (s.limit < s.total) setLimit(s.limit + PAGE);
      else if (s.more && !s.loading) s.more();
    }, { root: scroller(), rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [scroller, items.length > 0]);
  if (!items.length) return loading ? <Skeleton /> : <div className="tw-empty">{empty}</div>;
  return (
    <div className="tw-list">
      {shown.map((it, i) => (
        <div key={it.key} className="tw-item">
          {it.k === 'post' ? <Tweet p={it.p} myUid={myUid} officials={officials} /> : it.k === 'snap' ? <SnapPost s={it.s} /> : <GazettePost n={it.n} />}
          {i === 3 && inject}
        </div>
      ))}
      <div ref={sentinel} className="tw-sentinel" />
      {(limit < items.length || more) && <div className="tw-more-row">{loading ? <span className="tw-spinner" aria-label="Loading" /> : <button type="button" className="tw-show-more" onClick={() => (limit < items.length ? setLimit(limit + PAGE) : more?.())}>Show more</button>}</div>}
    </div>
  );
}

/* ---------- Home: the tabs ---------- */

type Tab = 'foryou' | 'following' | 'city' | 'vdm';

function useAllItems() {
  const feed = useLive((s) => s.feed);
  const friends = useLive((s) => s.friendsFeed);
  const vdm = useLive((s) => s.vdmFeed);
  const snaps = useSnaps((s) => s.global);
  const gazette = useCivic((s) => s.data?.news);
  return useMemo(() => {
    const seen = new Set<number>();
    const out: Item[] = [];
    for (const p of [...feed, ...friends, ...vdm]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ k: 'post', key: `p${p.id}`, at: p.at, p });
    }
    for (const s of snaps) if (s.until > Date.now()) out.push({ k: 'snap', key: `s${s.id}`, at: s.at, s });
    for (const n of (gazette ?? []).slice(0, 6)) out.push({ k: 'gazette', key: `g${n.id}`, at: n.at, n });
    return out.sort((a, b) => b.at - a.at);
  }, [feed, friends, vdm, snaps, gazette]);
}

function Home({ tab, setTab, city, setCity, scroller, hidden }: { tab: Tab; setTab: (t: Tab) => void; city: CivicCity; setCity: (c: CivicCity) => void; scroller: () => HTMLElement | null; hidden: boolean }) {
  const nav = useNav();
  const feed = useLive((s) => s.feed);
  const friendsFeed = useLive((s) => s.friendsFeed);
  const vdmFeed = useLive((s) => s.vdmFeed);
  const loading = useLive((s) => s.feedLoading);
  const feedEnd = useLive((s) => s.feedEnd);
  const friendsEnd = useLive((s) => s.friendsEnd);
  const feedCity = useLive((s) => s.feedCity);
  const all = useAllItems();
  const trends = useMemo(() => trendsOf(all), [all]);
  const [headHidden, setHeadHidden] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touch = useRef<number | null>(null);

  // X hides the top row as you scroll down the feed, and brings it back when you scroll up.
  useEffect(() => {
    const el = scroller();
    if (!el || hidden) return;
    let last = el.scrollTop;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = el.scrollTop;
        if (y > last + 8 && y > 80) setHeadHidden(true);
        else if (y < last - 8 || y < 40) setHeadHidden(false);
        last = y;
      });
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => { el.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, [scroller, hidden]);

  const refresh = async () => {
    setRefreshing(true);
    const loads = tab === 'following' ? [loadFriendsFeed()] : tab === 'vdm' ? [loadVdmFeed()] : tab === 'city' ? [loadFeed()] : [loadFeed(), loadFriendsFeed(), loadVdmFeed(), loadSnaps('global')];
    await Promise.all(loads).catch(() => {});
    setRefreshing(false);
  };

  const items = useMemo<Item[]>(() => {
    if (tab === 'foryou') return all;
    if (tab === 'following') return postItems(friendsFeed);
    if (tab === 'vdm') return postItems(vdmFeed);
    return postItems(feed);
  }, [tab, all, friendsFeed, vdmFeed, feed]);

  const happening = trends.length > 0 && (
    <section className="tw-happening">
      <h3>What’s happening</h3>
      {trends.slice(0, 3).map((t, i) => <TrendRow key={t.q} t={t} i={i} />)}
      <button type="button" className="tw-show-more" onClick={() => nav.open({ t: 'explore' })}>Show more</button>
    </section>
  );

  const cityReady = tab !== 'city' || feedCity === city;
  return (
    <div className={`tw-home ${hidden ? 'tw-hidden' : ''}`}
      onTouchStart={(e) => { touch.current = (scroller()?.scrollTop ?? 1) <= 0 ? e.touches[0].clientY : null; }}
      onTouchMove={(e) => { if (touch.current !== null) setPull(Math.max(0, Math.min(90, (e.touches[0].clientY - touch.current) * 0.5))); }}
      onTouchEnd={() => { if (pull > 55 && !refreshing) void refresh(); touch.current = null; setPull(0); }}>
      <header className={`tw-top ${headHidden ? 'up' : ''}`}>
        <nav className="tw-tabs" role="tablist">
          {([['following', 'Friends'], ['global', 'Global'], ['vdm', 'VDM']] as [string, string][]).map(([id, label]) => {
            const on = id === 'global' ? tab === 'foryou' || tab === 'city' : tab === id;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} className={on ? 'on' : ''} onClick={() => (on ? scroller()?.scrollTo({ top: 0, behavior: 'smooth' }) : setTab(id === 'global' ? 'foryou' : (id as Tab)))}>
                <span>{id === 'vdm' && <Emoji char="🎤" size={13} />} {label}</span>
              </button>
            );
          })}
        </nav>
        {(tab === 'foryou' || tab === 'city') && (
          <nav className="tw-chips tw-subtabs" role="tablist" aria-label="Global">
            <button type="button" role="tab" aria-selected={tab === 'foryou'} className={tab === 'foryou' ? 'on' : ''} onClick={() => setTab('foryou')}>For you</button>
            {CIVIC_CITIES.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={tab === 'city' && city === c} className={tab === 'city' && city === c ? 'on' : ''} onClick={() => { setCity(c); setTab('city'); }}>{CITY_NAME[c]}</button>
            ))}
          </nav>
        )}
      </header>
      <div className="tw-pull" style={{ height: refreshing ? 44 : pull }} aria-hidden={!refreshing}>
        <span className={`tw-spinner ${refreshing || pull > 55 ? 'spin' : ''}`} style={{ transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }} />
      </div>

      {tab === 'foryou' && (
        <>
          <LiveStrip />
          <BetSlip />
          <FeedList items={items} loading={loading} scroller={scroller} more={feedEnd ? undefined : () => void loadFeed(true)} inject={happening}
            empty={<><b>Welcome to Naija Twitter</b><span>Nothing has happened yet today. The blogs are watching the government, and your friends’ posts land here too.</span></>} />
        </>
      )}
      {tab === 'following' && (
        <FeedList items={items} loading={loading} scroller={scroller} more={friendsEnd ? undefined : () => void loadFriendsFeed(true)}
          empty={<><b>Nothing from your friends yet</b><span>Chat with people in Messages: once they reply you’re friends, and their posts and reposts show here.</span></>} />
      )}
      {tab === 'city' && (
        <>
          <FeedList items={cityReady ? items : []} loading={loading || !cityReady} scroller={scroller} more={feedEnd ? undefined : () => void loadFeed(true)}
            empty={<><b>Quiet in {CITY_NAME[city]}</b><span>No news from {CITY_NAME[city]} yet today. The blogs are watching the government.</span></>} />
          {feedEnd && feed.length >= FEED_WINDOW && <p className="tw-end">That’s the latest {FEED_WINDOW} stories from {CITY_NAME[city]}.</p>}
        </>
      )}
      {tab === 'vdm' && (
        <>
          <button type="button" className="tw-vdm-hero" onClick={() => nav.open({ t: 'profile', who: { kind: 'vdm' } })}>
            <span className="tw-avatar" style={{ width: 48, height: 48, background: SYSTEM.vdm.bg }}><Emoji char="🎤" size={24} /></span>
            <span>
              <b>VDM <Badge kind="blue" title="Verified whistleblower" /></b>
              <small>{BIO.vdm}</small>
            </span>
          </button>
          <FeedList items={items} loading={loading} scroller={scroller}
            empty={<><b>VDM is quiet today</b><span>Nobody has called him, and the government has behaved.</span></>} />
        </>
      )}
    </div>
  );
}

/* ---------- Thread ---------- */

/** One post wherever it is loaded (feeds, a share link, a profile). */
function usePost(id: number) {
  const live = useLive((s) => (s.sharedPost?.id === id ? s.sharedPost : undefined) ?? s.feed.find((p) => p.id === id) ?? s.friendsFeed.find((p) => p.id === id) ?? s.vdmFeed.find((p) => p.id === id));
  const prof = useTw((s) => {
    for (const v of Object.values(s.profiles)) {
      const p = v.posts.find((q) => q.id === id);
      if (p) return p;
    }
    return undefined;
  });
  return live ?? prof;
}

function SubHead({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  const nav = useNav();
  return (
    <header className="tw-sub">
      <button type="button" className="tw-icon-btn" aria-label="Back" onClick={nav.back}>{I.back(20)}</button>
      <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
    </header>
  );
}

/** "Post your reply" under the main post, opening the composer. */
function ReplyBar({ onReply, to }: { onReply: () => void; to: string }) {
  const me = useSession((s) => s.user);
  if (!me) return null;
  return (
    <button type="button" className="tw-replybar" onClick={onReply}>
      <span className="tw-avatar" style={{ width: 32, height: 32 }}><Face uid={me.uid} username={me.username} size="fill" /></span>
      <span>Reply to @{to}</span>
      <i>Reply</i>
    </button>
  );
}

function Thread({ id }: { id: number }) {
  const nav = useNav();
  const p = usePost(id);
  const replies = useLive((s) => s.replies[id]);
  const myUid = useSession((s) => s.user?.uid);
  const officials = useOfficials();
  useEffect(() => {
    void openThread(id);
    const t = setInterval(() => void loadReplies(id), 20_000);
    return () => clearInterval(t);
  }, [id]);
  const a = p && authorOf(p, officials);
  if (!p || !a) return (<><SubHead title="Post" /><Skeleton n={2} /></>);
  const tone = toneOf(p);
  const ctx = contextOf(p, tone);
  const mine = p.kind === 'post' && p.uid === myUid;
  return (
    <div className="tw-thread">
      <SubHead title="Post" />
      <article className={`tw-main tone-${tone}`}>
        {ctx && <div className={`tw-ctx ctx-${tone}`}><Emoji char={ctx.icon} size={13} /> <span>{ctx.text}</span></div>}
        <div className="tw-main-head">
          <button type="button" className="tw-avatar-btn" aria-label={`${a.name}'s profile`} onClick={() => nav.open({ t: 'profile', who: a.who })}><Avatar a={a} size={44} /></button>
          <AuthorLine a={a}>
            <MoreMenu
              link={() => void shareLink(tweetLink(p.id), `${a.name} on Naija Twitter`)}
              onDelete={mine ? () => { if (window.confirm('Delete this post?')) void deletePost(p.id).then(() => nav.back()).catch(() => {}); } : undefined}
            />
          </AuthorLine>
        </div>
        <p className="tw-text big"><RichText text={p.text} /></p>
        {p.kind === 'mugshot' && p.uid && (
          <div className="tw-media mug"><Mugshot uid={p.uid} username={p.username} seed={p.id} at={p.at} /></div>
        )}
        <div className="tw-meta">{stamp(p.at)} · <b>{short(p.views)}</b> {p.views === 1 ? 'View' : 'Views'}</div>
        {(!!p.reposts || !!p.likes) && (
          <div className="tw-stats">
            {!!p.reposts && <span><b>{short(p.reposts)}</b> {p.reposts === 1 ? 'Repost' : 'Reposts'}</span>}
            {!!p.likes && <span><b>{short(p.likes)}</b> {p.likes === 1 ? 'Like' : 'Likes'}</span>}
          </div>
        )}
        <Actions p={p} big />
        {p.kind === 'mugshot' && p.uid && <div className="tw-mugshare"><MugshotShare uid={p.uid} username={p.username} seed={p.id} at={p.at} /></div>}
      </article>
      <ReplyBar to={a.handle} onReply={() => nav.compose({ id, to: a.handle })} />
      {replies === undefined ? <Skeleton n={2} /> : !replies.length ? (
        <div className="tw-empty small"><span>No replies yet. Be the first.</span></div>
      ) : (
        <div className="tw-list">
          {replies.map((r, i) => <Tweet key={r.id} p={r} parent={p} line={i < replies.length - 1} myUid={myUid} officials={officials} />)}
        </div>
      )}
    </div>
  );
}

function SnapThread({ id }: { id: number }) {
  const nav = useNav();
  const s = useSnaps((st) => st.global.find((x) => x.id === id) ?? st.friends.find((x) => x.id === id) ?? (st.shared?.id === id ? st.shared : undefined));
  const comments = useSnaps((st) => st.comments[id]);
  const myUid = useSession((st) => st.user?.uid);
  useEffect(() => void loadSnapComments(id), [id]);
  if (!s) return (<><SubHead title="Snap" /><div className="tw-empty"><b>This snap is gone</b><span>Snaps only last a day.</span></div></>);
  const a: Author = { name: s.username ?? 'someone', handle: s.username ?? 'someone', badge: null, badgeTitle: '', who: { kind: 'player', username: s.username ?? '', uid: s.uid }, face: { uid: s.uid, username: s.username } };
  return (
    <div className="tw-thread">
      <SubHead title="Snap" />
      <article className="tw-main tone-snap">
        <div className="tw-main-head">
          <button type="button" className="tw-avatar-btn" aria-label={`${a.name}'s profile`} onClick={() => nav.open({ t: 'profile', who: a.who })}><Avatar a={a} size={44} /></button>
          <AuthorLine a={a} />
        </div>
        {s.caption && <p className="tw-text big"><RichText text={s.caption} /></p>}
        <div className="tw-media"><img src={s.url} alt={s.caption || 'Snap'} draggable={false} /></div>
        <div className="tw-meta">{stamp(s.at)} · gone in {mmss(s.until - Date.now())}</div>
        {!!s.likes && <div className="tw-stats"><span><b>{short(s.likes)}</b> {s.likes === 1 ? 'Like' : 'Likes'}</span></div>}
        <div className="tw-actions big">
          <button type="button" className="tw-act reply" aria-label="Comment" onClick={() => nav.compose({ id, to: a.handle, snap: true })}>{I.reply(21)}</button>
          <button type="button" className={`tw-act like ${s.liked ? 'on' : ''}`} aria-pressed={s.liked} aria-label="Like" onClick={() => void likeSnap(s.id)}>{s.liked ? I.heartFill(21) : I.heart(21)}</button>
          <button type="button" className="tw-act share" aria-label="Share" onClick={() => void shareLink(snapLink(s.id), `@${a.handle} on Naija City`)}>{I.share(21)}</button>
        </div>
      </article>
      <ReplyBar to={a.handle} onReply={() => nav.compose({ id, to: a.handle, snap: true })} />
      {comments === undefined ? <Skeleton n={2} /> : (
        <div className="tw-list">
          {comments.map((c, i) => {
            const ca: Author = { name: c.username ?? 'someone', handle: c.username ?? 'someone', badge: null, badgeTitle: '', who: { kind: 'player', username: c.username ?? '', uid: c.uid }, face: { uid: c.uid, username: c.username } };
            return (
              <article key={c.id} className={`tw-post is-reply ${i < comments.length - 1 ? 'has-line' : ''}`}>
                <div className="tw-grid">
                  <div className="tw-left">
                    <button type="button" className="tw-avatar-btn" aria-label={`${ca.name}'s profile`} onClick={() => nav.open({ t: 'profile', who: ca.who })}><Avatar a={ca} /></button>
                    {i < comments.length - 1 && <i className="tw-line" aria-hidden />}
                  </div>
                  <div className="tw-body">
                    <AuthorLine a={ca} at={c.at}>
                      <MoreMenu onDelete={c.uid === myUid || s.uid === myUid ? () => void deleteSnapComment(id, c.id).catch(() => {}) : undefined} />
                    </AuthorLine>
                    <div className="tw-replying">Replying to <span className="tw-link">@{a.handle}</span></div>
                    <p className="tw-text"><RichText text={c.text} /></p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Profile ---------- */

const bannerOf = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = h % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${(a + 50) % 360} 75% 32%))`;
};

function Profile({ who }: { who: Who }) {
  const me = useSession((s) => s.user);
  const all = useAllItems();
  const officials = useOfficials();
  const username = who.kind === 'player' ? who.username.toLowerCase() : '';
  const prof = useTw((s) => (username ? s.profiles[username] : undefined));
  const alias = useGame((s) => (prof?.player ? s.aliases[prof.player.uid] : undefined));
  const vdmFeed = useLive((s) => s.vdmFeed);
  useEffect(() => {
    if (username) void loadProfile(username);
    if (who.kind === 'vdm') void loadVdmFeed();
  }, [username, who.kind]);

  // The city's own accounts: their posts are the ones of theirs we have loaded.
  const sysItems = useMemo<Item[]>(() => {
    if (who.kind === 'player') return [];
    if (who.kind === 'vdm') return postItems(vdmFeed);
    if (who.kind === 'gazette') return all.filter((it) => it.k === 'gazette');
    return all.filter((it) => it.k === 'post' && JSON.stringify(authorOf(it.p, {}).who) === JSON.stringify(who));
  }, [who, all, vdmFeed]);

  if (who.kind !== 'player') {
    const a: Author = who.kind === 'blog'
      ? { name: who.name, handle: blogHandle(who.name), badge: 'blue', badgeTitle: 'Verified news blog', who, bg: BLOG_COLORS[BLOGS.indexOf(who.name) % BLOG_COLORS.length] }
      : { ...SYSTEM[who.kind], who };
    return (
      <div className="tw-profile">
        <SubHead title={<>{a.name} {a.badge && <Badge kind={a.badge} title={a.badgeTitle} />}</>} sub={`${sysItems.length} ${sysItems.length === 1 ? 'post' : 'posts'} today`} />
        <div className={`tw-banner ${who.kind === 'vdm' ? 'vdm' : ''}`} style={{ background: who.kind === 'vdm' ? undefined : a.bg ?? bannerOf(a.handle) }} />
        <div className="tw-pro-head">
          <span className="tw-pro-avatar"><Avatar a={a} size={72} /></span>
        </div>
        <div className="tw-pro-id">
          <b>{a.name} {a.badge && <Badge kind={a.badge} title={a.badgeTitle} />}</b>
          <span className="tw-handle">@{a.handle}</span>
          <p>{BIO[who.kind]}</p>
        </div>
        <div className="tw-pro-tabs"><span className="on">Posts</span></div>
        <FeedList items={sysItems} loading={false} scroller={() => null} empty={<><b>Nothing yet today</b><span>Their posts show here as they come in.</span></>} />
      </div>
    );
  }

  const p = prof?.player;
  const isMe = !!me && (me.username === username || (!!p && p.uid === me.uid));
  const office = p ? officials[p.uid] : undefined;
  const job = jobById(p?.jobId);
  const origin = p?.origin ? originOf(p.origin) : null;
  const where = p?.city ? (CITY_NAME[p.city as CivicCity] ?? getRegion(p.city)?.name) : null;
  const items = postItems(prof?.posts ?? []);
  const message = () => p && useSocial.setState({ openWith: p.uid });
  const more = () => {
    if (!p) return;
    // The player sheet sits under the phone: put the phone away to show it.
    useGame.getState().setPanel(null);
    useSocial.setState({ interactionWith: { uid: p.uid, username: p.username, look: p.look } });
  };
  return (
    <div className="tw-profile">
      <SubHead title={<>{alias ?? (p?.username ?? username)} {office && <Badge kind="gov" title={`Government: ${office}`} />}</>} sub={prof && !prof.loading ? `${items.length} ${items.length === 1 ? 'post' : 'posts'} today` : undefined} />
      <div className="tw-banner" style={{ background: bannerOf(username) }} />
      <div className="tw-pro-head">
        <span className="tw-pro-avatar"><Avatar a={{ name: username, face: { uid: p?.uid ?? (who.uid ?? null), username } }} size={72} /></span>
        {p && !isMe && (
          <span className="tw-pro-btns">
            <button type="button" className="tw-round" aria-label="More: send money, invite, and more" onClick={more}>{I.more(18)}</button>
            <button type="button" className="tw-round" aria-label={`Message @${p.username}`} onClick={message}>{I.chat(18)}</button>
            <button type="button" className={`tw-pill ${p.friend ? 'ghost' : ''}`} onClick={message}>{p.friend ? 'Friends' : 'Message'}</button>
          </span>
        )}
        {isMe && <span className="tw-pro-btns"><span className="tw-pill ghost">You</span></span>}
      </div>
      {prof?.missing ? (
        <div className="tw-pro-id"><b>@{username}</b><p className="muted">This account doesn’t exist. Try searching for another.</p></div>
      ) : (
        <>
          <div className="tw-pro-id">
            <b>{alias ?? p?.name ?? username} {office && <Badge kind="gov" title={`Government: ${office}`} />}</b>
            <span className="tw-handle">@{username}{p && !isMe && !!p.friend && <i className="tw-follows">Friends with you</i>}</span>
            {office && <p className="tw-office-line"><Emoji char="🏛️" size={14} /> {office} of Naija</p>}
            {p ? (
              <div className="tw-pro-meta">
                {job && <span>{I.job(15)} {job.title}</span>}
                {where && <span>{I.pin(15)} {where}</span>}
                {origin && <span><Emoji char={origin.emoji} size={13} /> {origin.label}</span>}
                <span>{I.cal(15)} Joined {new Date(p.joined).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}</span>
              </div>
            ) : <span className="sk sk-line" style={{ width: '70%', marginTop: 8 }} />}
            {p && (
              <div className="tw-pro-counts">
                <span><b>{short(p.friends)}</b> {p.friends === 1 ? 'Friend' : 'Friends'}</span>
                <span><b>{short(p.plots)}</b> {p.plots === 1 ? 'Plot' : 'Plots'}</span>
              </div>
            )}
          </div>
          <div className="tw-pro-tabs"><span className="on">Posts</span></div>
          {p && !p.friend && !isMe && (
            <div className="tw-note"><Emoji char="🔒" size={14} /> Only @{username}’s friends see their posts. Message them: once they reply, you’re friends.</div>
          )}
          <FeedList items={items} loading={!!prof?.loading && !items.length} scroller={() => null}
            empty={<><b>{isMe ? 'You haven’t posted today' : `@${username} hasn’t posted today`}</b><span>{isMe ? 'Tap + to say something. Posts last a day.' : 'Posts only last a day.'}</span></>} />
        </>
      )}
    </div>
  );
}

/* ---------- Explore ---------- */

function Explore({ q: initial }: { q?: string }) {
  const nav = useNav();
  const [q, setQ] = useState(initial ?? '');
  const all = useAllItems();
  const trends = useMemo(() => trendsOf(all), [all]);
  const gazette = useCivic((s) => s.data?.news);
  const results = useMemo(() => (q.trim() ? all.filter((it) => matches(it, q)) : []), [all, q]);
  useEffect(() => {
    void loadFeed();
    void loadSnaps('global');
  }, []);
  const title = q.startsWith('tone:') ? trends.find((t) => t.q === q)?.label ?? 'Results' : q;
  return (
    <div className="tw-explore">
      <header className="tw-sub">
        <button type="button" className="tw-icon-btn" aria-label="Back" onClick={nav.back}>{I.back(20)}</button>
        <label className="tw-search">
          {I.search(17)}
          <input value={q.startsWith('tone:') ? title : q} placeholder="Search Naija Twitter" onChange={(e) => setQ(e.target.value)} enterKeyHint="search" aria-label="Search" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')}>✕</button>}
        </label>
      </header>
      {q.trim() ? (
        <FeedList items={results} loading={false} scroller={() => null}
          empty={<><b>No results for “{title}”</b><span>Search covers today’s posts. Try a #tag, an @name or a state.</span></>} />
      ) : (
        <>
          <section className="tw-section">
            <h3>Live</h3>
            <LiveEvents />
            <BetSlip />
          </section>
          <section className="tw-section">
            <h3>What’s happening</h3>
            {trends.length ? trends.map((t, i) => <TrendRow key={t.q} t={t} i={i} />) : <p className="tw-end">Nothing trending yet. Start something with a #tag.</p>}
          </section>
          {!!gazette?.length && (
            <section className="tw-section">
              <h3>From the gazette</h3>
              {gazette.slice(0, 3).map((n) => <GazettePost key={n.id} n={n} />)}
              <button type="button" className="tw-show-more" onClick={() => useCivic.setState({ wantOpen: true, wantNews: true })}>Read the full gazette</button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Composer ---------- */

interface ComposeFor { id: number; to: string; prefill?: string; snap?: boolean }

function Composer({ reply, onClose }: { reply: ComposeFor | null; onClose: (sent: boolean) => void }) {
  const me = useSession((s) => s.user);
  const busy = useLive((s) => s.busy);
  const [text, setText] = useState(reply?.prefill ?? '');
  const [sending, setSending] = useState(false);
  const now = useNow(500);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const max = reply?.snap ? 200 : MAX_POST;
  const left = max - text.length;
  const wait = Math.max(0, (reply ? cooldown.reply : cooldown.post) - now);
  const ok = !!text.trim() && left >= 0 && !wait && !busy && !sending;
  const send = async () => {
    if (!ok) return;
    setSending(true);
    let sent = false;
    if (reply?.snap) sent = await commentSnap(reply.id, text);
    else sent = (await postGist(text.trim(), reply?.id)) !== null;
    setSending(false);
    if (!sent) return;
    if (reply) cooldown.reply = Date.now() + REPLY_GAP_MS;
    else cooldown.post = Date.now() + POST_GAP_MS;
    onClose(true);
  };
  const pct = Math.min(1, text.length / max);
  const C = 2 * Math.PI * 9;
  return (
    <div className="tw-compose-scrim" onClick={() => onClose(false)}>
      <div className="tw-compose" role="dialog" aria-modal="true" aria-label={reply ? `Reply to @${reply.to}` : 'New post'} onClick={stop}>
        <div className="tw-compose-top">
          <button type="button" className="tw-cancel" onClick={() => onClose(false)}>Cancel</button>
          <button type="button" className="tw-pill" disabled={!ok} onClick={() => void send()}>{sending ? 'Posting…' : reply ? 'Reply' : 'Post'}</button>
        </div>
        {reply && <div className="tw-replying in-compose">Replying to <span className="tw-link">@{reply.to}</span></div>}
        <div className="tw-compose-body">
          <span className="tw-avatar" style={{ width: 40, height: 40 }}><Face uid={me?.uid} username={me?.username} size="fill" /></span>
          <textarea ref={ref} value={text} maxLength={max} rows={5} placeholder={reply ? 'Post your reply' : 'What’s happening in Naija?'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }} />
        </div>
        <div className="tw-compose-foot">
          <span className="tw-audience">{reply ? I.chat(15) : I.globe(15)} {reply?.snap ? 'Comment on the snap' : reply ? 'Everyone who opens the post sees replies' : 'Your friends see your posts on Following'}</span>
          {wait > 0 && <span className="tw-wait">Wait {Math.ceil(wait / 1000)}s</span>}
          <span className={`tw-ring ${left <= 20 ? 'warn' : ''} ${left <= 0 ? 'full' : ''}`} aria-label={`${left} characters left`}>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
              <circle cx="12" cy="12" r="9" className="track" />
              <circle cx="12" cy="12" r="9" className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
            </svg>
            {left <= 20 && <b>{left}</b>}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- The app ---------- */

export function GistApp() {
  const here = useGame((s) => s.destinationId);
  const feedAuto = useLive((s) => s.feedAuto);
  const sharedPost = useLive((s) => s.sharedPost);
  const signedIn = useSession((s) => !!s.user);
  const hereState = CIVIC_CITIES.find((c) => c === here) ?? null;
  const [tab, setTab] = useState<Tab>('foryou');
  const [city, setCityPick] = useState<CivicCity>(() => useLive.getState().feedCity ?? hereState ?? 'kaduna');
  const [stack, setStack] = useState<View[]>([]);
  const [composer, setComposer] = useState<{ reply: ComposeFor | null } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const homeScroll = useRef(0);
  const scroller = useMemo(() => () => root.current?.closest<HTMLElement>('.app-body') ?? null, []);
  // Open: the Twitter badge is cleared (net/badges.ts). For you shows the Following posts too, so any tab counts.
  useEffect(() => openedApp('twitter'), []);
  const view = stack[stack.length - 1];

  // The state tab follows the state I am in, until I pick one myself.
  useEffect(() => {
    if (feedAuto && hereState) setCityPick(hereState);
  }, [hereState, feedAuto]);
  const setCity = (c: CivicCity) => {
    useLive.setState({ feedAuto: c === hereState });
    setCityPick(c);
  };

  // For you is the whole country's news (plus VDM, friends and snaps); the state tab is one state's.
  useEffect(() => {
    if (tab === 'foryou') setFeedCity(null);
    if (tab === 'city') setFeedCity(city);
  }, [tab, city]);

  useEffect(() => {
    let n = 0;
    const load = () => {
      if (tab === 'following') return void loadFriendsFeed();
      if (tab === 'vdm') return void loadVdmFeed();
      void loadFeed();
      if (tab === 'foryou' && n % 3 === 0) {
        void loadFriendsFeed();
        void loadVdmFeed();
        void loadSnaps('global');
      }
      n++;
    };
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [tab]);

  // A post opened from a share link comes up as its thread.
  useEffect(() => {
    if (sharedPost) setStack((s) => (s.some((v) => v.t === 'thread' && v.id === sharedPost.id) ? s : [...s, { t: 'thread', id: sharedPost.id }]));
  }, [sharedPost?.id]);

  const nav = useMemo<Nav>(() => ({
    open: (v) => {
      setStack((s) => {
        if (!s.length) homeScroll.current = scroller()?.scrollTop ?? 0;
        const top = s[s.length - 1];
        if (top && JSON.stringify(top) === JSON.stringify(v)) return s;
        // Explore replaces Explore (a new search), so Back goes to where you were before it.
        return top?.t === 'explore' && v.t === 'explore' ? [...s.slice(0, -1), v] : [...s, v].slice(-12);
      });
      scroller()?.scrollTo({ top: 0 });
    },
    back: () => {
      setStack((s) => {
        const top = s[s.length - 1];
        if (top?.t === 'thread' && top.id === useLive.getState().sharedPost?.id) useLive.setState({ sharedPost: null });
        return s.slice(0, -1);
      });
    },
    compose: (reply) => setComposer({ reply: reply ?? null }),
  }), [scroller]);

  // Back on the feed where you left it.
  useLayoutEffect(() => {
    if (!view) scroller()?.scrollTo({ top: homeScroll.current });
  }, [view, scroller]);

  const showFab = signedIn && (!view || view.t === 'explore' || (view.t === 'profile' && view.who.kind === 'player'));
  return (
    <NavCtx.Provider value={nav}>
      <div className="tw" ref={root}>
        <Home tab={tab} setTab={setTab} city={city} setCity={setCity} scroller={scroller} hidden={!!view} />
        {view?.t === 'thread' && <Thread key={`t${view.id}`} id={view.id} />}
        {view?.t === 'snap' && <SnapThread key={`s${view.id}`} id={view.id} />}
        {view?.t === 'profile' && <Profile key={JSON.stringify(view.who)} who={view.who} />}
        {view?.t === 'explore' && <Explore key={view.q ?? ''} q={view.q} />}
        {showFab && (
          <div className="tw-fab-dock">
            <button type="button" className="tw-fab" aria-label="New post" onClick={() => setComposer({ reply: null })}>
              {I.plus(26)}
            </button>
          </div>
        )}
        {composer && (
          <Composer reply={composer.reply} onClose={(sent) => {
            setComposer(null);
            if (sent && !composer.reply) {
              useGame.getState().toast('Your post was sent');
              if (!view) scroller()?.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }} />
        )}
      </div>
    </NavCtx.Provider>
  );
}
