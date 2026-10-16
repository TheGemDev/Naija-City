// Snap, made to feel like Snapchat. The app opens on its camera (photo mode over the scene, ui/PhotoMode.tsx); on the
// phone it has Chat (snaps friends sent me, streaks), Stories (friends' snaps as rings, played full screen), Spotlight
// (the whole city's snaps, most liked first) and Me (my own snaps and who saw them). Everything is gone after a day.

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  SNAP_COMMENT_MAX, commentSnap, deleteSnap, deleteSnapComment, likeSnap, loadSnapChats, loadSnapComments, loadSnaps, snapViewers, useSnaps, viewSnap,
  type ReceivedSnap, type Snap, type SnapTab,
} from '../net/snaps';
import { useSession } from '../net/session';
import { loadFriends, useCommunity } from '../net/community';
import { openPlayerProfile, sendText, usePlayerLabel, useSocial } from '../net/social';
import { shareLink, snapLink } from '../net/deeplink';
import { useGame } from '../game/store';
import { Face } from './Face';
import { Emoji } from './Icons';
import { openSnapCamera } from './PhotoMode';
import { Streak } from './SnapSend';
import './snap.css';

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.floor((now - at) / 60_000));
  return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};
const left = (until: number, now: number) => {
  const m = Math.max(1, Math.ceil((until - now) / 60_000));
  return m < 60 ? `${m}m left` : `${Math.floor(m / 60)}h left`;
};
const count = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));
/** How long one story snap shows before the next. */
const STORY_MS = 5000;
const REACTIONS = ['❤️', '😂', '🔥', '😮', '👏🏾', '🙌🏾'];

/** A snap a friend sent me, shaped like any other so the same player can show it. */
const asSnap = (r: ReceivedSnap): Snap => ({ id: r.id, uid: r.uid, username: r.username, url: r.url ?? '', caption: r.caption, at: r.at, until: r.at + 86_400_000, likes: 0, liked: false, comments: 0, views: 0, seen: !!r.opened, audience: 2 });

const svg = (d: ReactNode, size = 22, sw = 2.2) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const ICON = {
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  stories: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.6M18 14.5a5 5 0 0 1 2.5 4.5" /></>,
  spotlight: <path d="M8 4l12 8-12 8z" />,
  me: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  share: <><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v12M7 8l5-5 5 5" /></>,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  play: <path d="M8 5v14l11-7z" />,
};

/** Who is open in the full-screen player: groups of snaps (one per friend's story, or one each in Spotlight). */
interface Playing {
  groups: Snap[][];
  g: number;
  i: number;
  mode: 'story' | 'spotlight' | 'direct';
}

export function SnapApp() {
  const me = useSession((s) => s.user);
  const tab = useSnaps((s) => s.tab);
  const shared = useSnaps((s) => s.shared);
  const [now, setNow] = useState(Date.now());
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const newSnaps = useSnaps((s) => s.chats?.received.filter((r) => !r.opened).length ?? 0);
  const unseenStories = useSnaps((s) => s.friends.some((x) => !x.seen && x.uid !== me?.uid && x.until > Date.now()));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // The chats and friends' stories feed the nav's badges, so they load whichever screen is open.
  useEffect(() => {
    void loadSnapChats();
    void loadSnaps('friends');
    void loadFriends();
    const id = setInterval(() => {
      void loadSnapChats();
      void loadSnaps('friends');
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  // A snap opened from a share link plays at once.
  useEffect(() => {
    if (shared && shared.until > Date.now()) setPlaying({ groups: [[shared]], g: 0, i: 0, mode: 'spotlight' });
  }, [shared?.id]);

  const setTab = (t: SnapTab) => useSnaps.setState({ tab: t });
  const close = () => {
    setPlaying(null);
    if (useSnaps.getState().shared) useSnaps.setState({ shared: null });
  };
  const title: Record<SnapTab, string> = { chat: 'Chat', stories: 'Stories', spotlight: 'Spotlight', me: 'My Snaps' };
  const back = () => root.current?.closest('.app')?.querySelector<HTMLButtonElement>('.app-back')?.click();

  return (
    <div
      className="snap-app"
      ref={(el) => {
        root.current = el;
        setHost(el?.closest('.screen') ?? null);
      }}
    >
      <header className="snap-top">
        <button type="button" className="snap-icon-btn" aria-label="Back" onClick={back}>{svg(ICON.back, 22, 2.6)}</button>
        <button type="button" className="snap-me" aria-label="My snaps" onClick={() => setTab('me')}>
          <Face uid={me?.uid} username={me?.username} size="fill" />
        </button>
        <h2>{title[tab]}</h2>
        <button type="button" className="snap-icon-btn" aria-label="Camera" onClick={() => openSnapCamera()}>{svg(ICON.camera)}</button>
      </header>
      <div className="snap-scroll" key={tab}>
        {!me ? (
          <div className="snap-empty big"><Emoji char="👻" size={44} /><b>Sign in to use Snap</b><span>Snaps from friends and the whole city show here.</span></div>
        ) : tab === 'chat' ? (
          <ChatTab now={now} play={setPlaying} />
        ) : tab === 'stories' ? (
          <StoriesTab now={now} myUid={me.uid} play={setPlaying} />
        ) : tab === 'spotlight' ? (
          <SpotlightTab play={setPlaying} />
        ) : (
          <MeTab now={now} myUid={me.uid} play={setPlaying} />
        )}
      </div>
      <nav className="snap-nav" aria-label="Snap">
        <NavBtn on={tab === 'chat'} label="Chat" badge={newSnaps} onClick={() => setTab('chat')}>{svg(ICON.chat)}</NavBtn>
        <NavBtn on={tab === 'stories'} label="Stories" dot={unseenStories} onClick={() => setTab('stories')}>{svg(ICON.stories)}</NavBtn>
        <button type="button" className="snap-nav-cam" aria-label="Camera" onClick={() => openSnapCamera()}><i /></button>
        <NavBtn on={tab === 'spotlight'} label="Spotlight" onClick={() => setTab('spotlight')}>{svg(ICON.spotlight)}</NavBtn>
        <NavBtn on={tab === 'me'} label="Me" onClick={() => setTab('me')}>{svg(ICON.me)}</NavBtn>
      </nav>
      {playing && (host ? createPortal(<Player start={playing} myUid={me?.uid} onClose={close} />, host) : <Player start={playing} myUid={me?.uid} onClose={close} />)}
    </div>
  );
}

function NavBtn({ on, label, badge, dot, onClick, children }: { on: boolean; label: string; badge?: number; dot?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`snap-nav-btn ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={onClick}>
      {children}
      <small>{label}</small>
      {!!badge && <em>{badge}</em>}
      {!badge && dot && <em className="dot" />}
    </button>
  );
}

/* ---------- Chat ---------- */

type ChatState = { kind: 'new' | 'received' | 'delivered' | 'opened' | 'none'; at: number; unread: ReceivedSnap[] };

function ChatTab({ now, play }: { now: number; play: (p: Playing) => void }) {
  const friends = useCommunity((s) => s.friends?.friends);
  const chats = useSnaps((s) => s.chats);
  const rows = useMemo(() => {
    const state = (uid: string): ChatState => {
      const got = chats?.received.filter((r) => r.uid === uid) ?? [];
      const unread = got.filter((r) => !r.opened && r.url).reverse();
      const sent = chats?.sent.find((s) => s.uid === uid);
      if (unread.length) return { kind: 'new', at: unread[unread.length - 1].at, unread };
      const last = got[0];
      if (sent && (!last || sent.at > last.at)) return { kind: sent.opened ? 'opened' : 'delivered', at: sent.at, unread };
      if (last) return { kind: 'received', at: last.at, unread };
      return { kind: 'none', at: 0, unread };
    };
    return (friends ?? []).map((f) => ({ ...f, st: state(f.uid) })).sort((a, b) => Number(b.st.kind === 'new') - Number(a.st.kind === 'new') || b.st.at - a.st.at);
  }, [friends, chats]);
  if (friends === undefined || !chats) return <p className="snap-empty">Loading chats…</p>;
  if (!friends.length) {
    return (
      <div className="snap-empty big">
        <Emoji char="🤝🏾" size={40} />
        <b>No friends yet</b>
        <span>Text someone in Messages. When they reply, you are friends and can send each other snaps.</span>
      </div>
    );
  }
  return (
    <ul className="snap-chats">
      {rows.map((f) => (
        <ChatRow key={f.uid} uid={f.uid} username={f.username} st={f.st} now={now} onOpen={() => {
          if (f.st.kind === 'new') play({ groups: [f.st.unread.map(asSnap)], g: 0, i: 0, mode: 'direct' });
          else useSocial.setState({ openWith: f.uid });
        }} />
      ))}
    </ul>
  );
}

const CHAT_STATUS: Record<ChatState['kind'], string> = { new: 'New Snap', received: 'Received', delivered: 'Delivered', opened: 'Opened', none: 'Tap to chat' };

function ChatRow({ uid, username, st, now, onOpen }: { uid: string; username: string; st: ChatState; now: number; onOpen: () => void }) {
  const label = usePlayerLabel(uid, username);
  return (
    <li className={`snap-chat ${st.kind}`}>
      <button type="button" className="snap-chat-main" onClick={onOpen}>
        <Face uid={uid} username={username} />
        <span className="snap-chat-text">
          <b>{label}</b>
          <small>
            <i className={`snap-status ${st.kind}`} aria-hidden />
            {CHAT_STATUS[st.kind]}
            {st.kind === 'new' && st.unread.length > 1 && ` (${st.unread.length})`}
            {st.at > 0 && ` · ${ago(st.at, now)}`}
          </small>
        </span>
        <Streak uid={uid} />
      </button>
      <button type="button" className="snap-icon-btn" aria-label={`Send ${label} a snap`} onClick={() => openSnapCamera([uid])}>{svg(ICON.camera, 20)}</button>
    </li>
  );
}

/* ---------- Stories ---------- */

/** Friends' snaps grouped into one story each (oldest first, as they play), unseen ones first, then the newest. */
function useStories(myUid: string, now: number) {
  const snaps = useSnaps((s) => s.friends);
  return useMemo(() => {
    const by = new Map<string, Snap[]>();
    for (const s of snaps) if (s.until > now) by.set(s.uid, [...(by.get(s.uid) ?? []), s]);
    const groups = [...by.values()].map((g) => g.sort((a, b) => a.at - b.at));
    const mine = groups.find((g) => g[0].uid === myUid) ?? [];
    const theirs = groups
      .filter((g) => g[0].uid !== myUid)
      .sort((a, b) => Number(b.some((s) => !s.seen)) - Number(a.some((s) => !s.seen)) || b[b.length - 1].at - a[a.length - 1].at);
    return { mine, theirs };
  }, [snaps, myUid, now]);
}

function StoriesTab({ now, myUid, play }: { now: number; myUid: string; play: (p: Playing) => void }) {
  const loading = useSnaps((s) => s.loading);
  const me = useSession((s) => s.user);
  const { mine, theirs } = useStories(myUid, now);
  // A story opens on its first snap I have not seen yet.
  const open = (g: number) => play({ groups: theirs, g, i: Math.max(0, theirs[g].findIndex((s) => !s.seen)), mode: 'story' });
  return (
    <>
      <div className="snap-rings" role="list">
        <div className="snap-ring-item" role="listitem">
          <button type="button" className={`snap-ring ${mine.length ? 'mine' : 'add'}`} aria-label={mine.length ? 'Watch my story' : 'Add to my story'} onClick={() => (mine.length ? play({ groups: [mine], g: 0, i: 0, mode: 'story' }) : openSnapCamera())}>
            <Face uid={myUid} username={me?.username} size="fill" />
            <em aria-hidden>+</em>
          </button>
          <small>My Story</small>
        </div>
        {theirs.map((g, k) => <Ring key={g[0].uid} snaps={g} onOpen={() => open(k)} />)}
      </div>
      <h3 className="snap-h">Friends</h3>
      {!theirs.length && (
        <div className="snap-empty big">
          <Emoji char="👀" size={40} />
          <b>{loading ? 'Loading stories…' : 'No stories from friends today'}</b>
          <span>Be the first: snap something and add it to your story.</span>
        </div>
      )}
      <div className="snap-tiles">
        {theirs.map((g, k) => {
          const last = g[g.length - 1];
          const unseen = g.some((s) => !s.seen);
          return (
            <button key={last.uid} type="button" className={`snap-tile story ${unseen ? 'unseen' : ''}`} onClick={() => open(k)}>
              <img src={last.url} alt="" loading="lazy" draggable={false} />
              <span className="snap-tile-who">
                <Face uid={last.uid} username={last.username} size="sm" />
                <b><TileName uid={last.uid} username={last.username} /></b>
                <small>{ago(last.at, now)}</small>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

const TileName = ({ uid, username }: { uid: string; username: string | null }) => <>{usePlayerLabel(uid, username).replace(/^@/, '')}</>;

function Ring({ snaps, onOpen }: { snaps: Snap[]; onOpen: () => void }) {
  const s = snaps[snaps.length - 1];
  const unseen = snaps.some((x) => !x.seen);
  return (
    <div className="snap-ring-item" role="listitem">
      <button type="button" className={`snap-ring ${unseen ? 'unseen' : 'seen'}`} aria-label={`Watch ${s.username ?? 'their'} story`} onClick={onOpen}>
        <Face uid={s.uid} username={s.username} size="fill" />
      </button>
      <small><TileName uid={s.uid} username={s.username} /></small>
    </div>
  );
}

/* ---------- Spotlight ---------- */

function SpotlightTab({ play }: { play: (p: Playing) => void }) {
  const [sort, setSort] = useState<'top' | 'global'>('top');
  const snaps = useSnaps((s) => s[sort]);
  const end = useSnaps((s) => s.end[sort]);
  const loading = useSnaps((s) => s.loading);
  useEffect(() => {
    void loadSnaps(sort);
  }, [sort]);
  const live = snaps.filter((s) => s.until > Date.now());
  return (
    <>
      <div className="snap-seg" role="tablist">
        <button type="button" role="tab" aria-selected={sort === 'top'} className={sort === 'top' ? 'on' : ''} onClick={() => setSort('top')}>🔥 Top</button>
        <button type="button" role="tab" aria-selected={sort === 'global'} className={sort === 'global' ? 'on' : ''} onClick={() => setSort('global')}>✨ New</button>
      </div>
      {!live.length && (
        <div className="snap-empty big">
          <Emoji char="⭐" size={40} />
          <b>{loading ? 'Loading Spotlight…' : 'Nothing in Spotlight today'}</b>
          <span>Send a snap to Spotlight and the whole city sees it.</span>
        </div>
      )}
      <div className="snap-tiles">
        {live.map((s, k) => (
          <button key={s.id} type="button" className="snap-tile spot" onClick={() => play({ groups: live.map((x) => [x]), g: k, i: 0, mode: 'spotlight' })}>
            <img src={s.url} alt={s.caption || ''} loading="lazy" draggable={false} />
            {s.caption && <span className="snap-tile-cap">{s.caption}</span>}
            <span className="snap-tile-stats">
              <span>{svg(ICON.play, 13, 0)} {count(s.views)}</span>
              <span className={s.liked ? 'liked' : ''}>{svg(ICON.heart, 13, 2.4)} {count(s.likes)}</span>
            </span>
          </button>
        ))}
      </div>
      {sort === 'global' && !end && live.length > 0 && <button type="button" className="snap-more" disabled={loading} onClick={() => void loadSnaps('global', true)}>More snaps</button>}
    </>
  );
}

/* ---------- Me ---------- */

function MeTab({ now, myUid, play }: { now: number; myUid: string; play: (p: Playing) => void }) {
  const me = useSession((s) => s.user);
  const { mine } = useStories(myUid, now);
  const views = mine.reduce((a, s) => a + s.views, 0);
  const likes = mine.reduce((a, s) => a + s.likes, 0);
  return (
    <>
      <div className="snap-profile">
        <span className="snap-profile-face"><Face uid={myUid} username={me?.username} size="fill" /></span>
        <b>@{me?.username ?? 'you'}</b>
        <div className="snap-profile-stats">
          <span><b>{mine.length}</b><small>Snaps up</small></span>
          <span><b>{count(views)}</b><small>Views</small></span>
          <span><b>{count(likes)}</b><small>Likes</small></span>
        </div>
      </div>
      <h3 className="snap-h">My Story</h3>
      {!mine.length && (
        <button type="button" className="snap-add-story" onClick={() => openSnapCamera()}>
          <i aria-hidden>+</i>
          <span><b>Add to My Story</b><small>Snaps disappear after 24 hours</small></span>
        </button>
      )}
      <ul className="snap-mine">
        {[...mine].reverse().map((s) => (
          <li key={s.id}>
            <button type="button" className="snap-mine-pic" aria-label="Watch" onClick={() => play({ groups: [mine], g: 0, i: mine.indexOf(s), mode: 'story' })}>
              <img src={s.url} alt="" loading="lazy" draggable={false} />
            </button>
            <span className="snap-mine-text">
              <b>{s.caption || (s.audience === 0 ? 'Story + Spotlight' : s.audience === 1 ? 'Story' : 'Sent to friends')}</b>
              <small>{svg(ICON.eye, 13)} {s.views} · {svg(ICON.heart, 13)} {s.likes} · {left(s.until, now)}</small>
            </span>
            <button type="button" className="snap-icon-btn" aria-label="Delete this snap" onClick={() => window.confirm('Delete this snap?') && void deleteSnap(s.id).catch(() => {})}>{svg(ICON.trash, 20)}</button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------- The full-screen player ---------- */

function Player({ start, myUid, onClose }: { start: Playing; myUid?: string; onClose: () => void }) {
  const [at, setAt] = useState({ g: start.g, i: start.i });
  const [paused, setPaused] = useState(false);
  const [sheet, setSheet] = useState<'comments' | 'viewers' | null>(null);
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState(false);
  const drag = useRef<{ x: number; y: number; t: number } | null>(null);
  const [dy, setDy] = useState(0);
  const [bursts, setBursts] = useState<{ k: number; e: string }[]>([]);
  const burst = (e: string) => {
    const k = Date.now() + Math.random();
    setBursts((b) => [...b, { k, e }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.k !== k)), 1100);
  };
  // Likes and counts change while it is open: always show the store's copy of the snap.
  const group = start.groups[at.g] ?? [];
  const base = group[at.i];
  const live = useSnaps((s) => (base ? s.friends.find((x) => x.id === base.id) ?? s.global.find((x) => x.id === base.id) ?? s.top.find((x) => x.id === base.id) ?? (s.shared?.id === base.id ? s.shared : null) : null));
  const snap = live ?? base;
  const { mode } = start;
  const mine = snap?.uid === myUid;
  const timed = mode !== 'spotlight';
  const hold = paused || !!sheet || typing;

  useEffect(() => {
    if (snap && !mine && !snap.seen) void viewSnap(snap.id);
  }, [snap?.id]);
  useEffect(() => {
    if (!snap) onClose();
  }, [snap]);

  const next = () => {
    if (at.i + 1 < group.length) return setAt({ g: at.g, i: at.i + 1 });
    if (at.g + 1 < start.groups.length) {
      const g = start.groups[at.g + 1];
      return setAt({ g: at.g + 1, i: mode === 'story' ? Math.max(0, g.findIndex((s) => !s.seen)) : 0 });
    }
    onClose();
  };
  const prev = () => {
    if (at.i > 0) return setAt({ g: at.g, i: at.i - 1 });
    if (at.g > 0) return setAt({ g: at.g - 1, i: 0 });
  };
  // Keys for a desktop: arrows step, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!snap) return null;

  // Tap the left third to go back, anywhere else to go on; hold to pause; swipe down to close; in Spotlight swipe up for the next.
  const onDown = (e: RPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setPaused(true);
  };
  const onMove = (e: RPointerEvent) => {
    if (drag.current) setDy(e.clientY - drag.current.y);
  };
  const onUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setPaused(false);
    setDy(0);
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (my > 80 && Math.abs(my) > Math.abs(mx)) return onClose();
    if (my < -60 && Math.abs(my) > Math.abs(mx)) return next();
    if (Math.abs(mx) > 60) return mx < 0 ? next() : prev();
    if (Date.now() - d.t > 350) return; // a hold, not a tap
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) prev();
    else next();
  };
  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (mode === 'spotlight') {
      if (await commentSnap(snap.id, t)) setReply('');
      return;
    }
    // A reply to a story or a snap goes to the chat with them, like on Snapchat.
    try {
      await sendText(snap.uid, `↩️ Replied to your snap: ${t}`);
      setReply('');
      useGame.getState().toast(`💬 Sent to @${snap.username ?? 'them'} in Messages`);
    } catch (err) {
      useGame.getState().toast(err instanceof Error ? err.message : 'Could not send that');
    }
  };
  const react = (emoji: string) => {
    if (emoji === '❤️') {
      if (!snap.liked) void likeSnap(snap.id);
    } else if (mode === 'spotlight') void commentSnap(snap.id, emoji);
    else void send(emoji);
    burst(emoji);
  };

  return (
    <div className={`snap-player ${mode}`} role="dialog" aria-label={`Snap by @${snap.username ?? 'someone'}`} style={{ transform: dy > 0 ? `translateY(${dy}px) scale(${1 - Math.min(dy, 300) / 1500})` : undefined }}>
      <div className="snap-player-bg" style={{ backgroundImage: `url("${snap.url}")` }} aria-hidden />
      <div className="snap-player-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setPaused(false); setDy(0); }}>
        <img key={snap.id} src={snap.url} alt={snap.caption || `Snap by @${snap.username ?? 'someone'}`} draggable={false} />
      </div>
      {timed && (
        <div className="snap-bars" aria-hidden>
          {group.map((s, k) => (
            <span key={s.id}>
              <i
                key={`${at.g}-${at.i}`}
                className={k < at.i ? 'done' : k === at.i ? 'run' : ''}
                style={k === at.i ? { animationDuration: `${STORY_MS}ms`, animationPlayState: hold ? 'paused' : 'running' } : undefined}
                onAnimationEnd={k === at.i ? next : undefined}
              />
            </span>
          ))}
        </div>
      )}
      <div className="snap-player-head">
        <button type="button" className="snap-player-who" onClick={() => !mine && openPlayerProfile({ uid: snap.uid, username: snap.username })}>
          <Face uid={snap.uid} username={snap.username} size="sm" />
          <b><TileName uid={snap.uid} username={snap.username} /></b>
          <small>{ago(snap.at, Date.now())}</small>
        </button>
        {mode === 'direct' && <Streak uid={snap.uid} />}
        <button type="button" className="snap-icon-btn" aria-label="Close" onClick={onClose}>{svg(ICON.close, 24, 2.6)}</button>
      </div>
      {snap.caption && <p className="snap-player-cap">{snap.caption}</p>}
      {bursts.map((b) => <span key={b.k} className="snap-burst" aria-hidden>{b.e}</span>)}
      {mode === 'spotlight' && (
        <div className="snap-player-rail">
          <button type="button" className={snap.liked ? 'liked' : ''} aria-label={snap.liked ? 'Unlike' : 'Like'} onClick={() => { void likeSnap(snap.id); if (!snap.liked) burst('❤️'); }}>
            {svg(ICON.heart, 30, 2.2)}<small>{count(snap.likes)}</small>
          </button>
          <button type="button" aria-label="Comments" onClick={() => setSheet('comments')}>{svg(ICON.comment, 28)}<small>{count(snap.comments)}</small></button>
          <button type="button" aria-label="Share" onClick={() => void shareLink(snapLink(snap.id), `@${snap.username ?? 'someone'}'s snap on Naija City`)}>{svg(ICON.share, 28)}<small>Share</small></button>
          <span className="snap-player-views">{svg(ICON.play, 14, 0)} {count(snap.views)}</span>
        </div>
      )}
      <div className="snap-player-foot">
        {mine ? (
          <div className="snap-own">
            <button type="button" onClick={() => setSheet('viewers')}>{svg(ICON.eye, 20)} {snap.views} {snap.views === 1 ? 'view' : 'views'}</button>
            <button type="button" onClick={() => setSheet('comments')}>{svg(ICON.comment, 20)} {snap.comments}</button>
            <button type="button" onClick={() => void likeSnap(snap.id)} className={snap.liked ? 'liked' : ''}>{svg(ICON.heart, 20)} {snap.likes}</button>
            <button type="button" aria-label="Delete this snap" onClick={() => window.confirm('Delete this snap?') && void deleteSnap(snap.id).then(next).catch(() => {})}>{svg(ICON.trash, 20)}</button>
          </div>
        ) : (
          <>
            {!typing && (
              <div className="snap-reacts">
                {REACTIONS.map((e) => <button key={e} type="button" aria-label={`React ${e}`} onClick={() => react(e)}><Emoji char={e} size={24} /></button>)}
                {mode === 'story' && <button type="button" className="snap-react-more" aria-label="Comments" onClick={() => setSheet('comments')}>{svg(ICON.comment, 20)}<small>{snap.comments}</small></button>}
              </div>
            )}
            <form className="snap-reply" onSubmit={(e) => { e.preventDefault(); void send(reply); }}>
              <input
                value={reply}
                maxLength={SNAP_COMMENT_MAX}
                placeholder={mode === 'spotlight' ? 'Add a comment…' : 'Send a chat'}
                aria-label={mode === 'spotlight' ? 'Comment' : `Reply to @${snap.username ?? 'them'}`}
                enterKeyHint="send"
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                onChange={(e) => setReply(e.target.value)}
              />
              {reply.trim() && <button type="submit" aria-label="Send">{svg(<path d="M3 20.5 21 12 3 3.5v6.6l11 1.9-11 1.9z" />, 20, 0)}</button>}
            </form>
          </>
        )}
      </div>
      {sheet === 'comments' && <CommentsSheet snap={snap} mine={mine} myUid={myUid} onClose={() => setSheet(null)} />}
      {sheet === 'viewers' && <ViewersSheet id={snap.id} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="snap-sheet-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="snap-sheet" role="dialog" aria-label={title}>
        <div className="snap-sheet-head"><b>{title}</b><button type="button" className="snap-icon-btn" aria-label="Close" onClick={onClose}>{svg(ICON.close, 20, 2.6)}</button></div>
        {children}
      </div>
    </div>
  );
}

function CommentsSheet({ snap, mine, myUid, onClose }: { snap: Snap; mine: boolean; myUid?: string; onClose: () => void }) {
  const comments = useSnaps((s) => s.comments[snap.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  useEffect(() => {
    void loadSnapComments(snap.id);
  }, [snap.id]);
  return (
    <Sheet title={`${comments?.length ?? snap.comments} comments`} onClose={onClose}>
      <ul className="snap-comments">
        {!comments && <li className="snap-empty">Loading…</li>}
        {comments && !comments.length && <li className="snap-empty">No comments yet. Say something nice.</li>}
        {comments?.map((c) => (
          <li key={c.id}>
            <Face uid={c.uid} username={c.username} size="sm" />
            <span>
              <b><TileName uid={c.uid} username={c.username} /> <small>{ago(c.at, now)}</small></b>
              <p>{c.text}</p>
            </span>
            {/* Your own comment, or any comment on your snap. */}
            {(mine || c.uid === myUid) && (
              <button type="button" className="snap-icon-btn" aria-label="Delete comment" onClick={() => void deleteSnapComment(snap.id, c.id).catch(() => {})}>{svg(ICON.trash, 16)}</button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="snap-reply in-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !text.trim()) return;
          setBusy(true);
          void commentSnap(snap.id, text).then((ok) => ok && setText('')).finally(() => setBusy(false));
        }}
      >
        <input value={text} maxLength={SNAP_COMMENT_MAX} placeholder={`Comment on @${snap.username ?? 'someone'}’s snap…`} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Post comment">{svg(<path d="M3 20.5 21 12 3 3.5v6.6l11 1.9-11 1.9z" />, 20, 0)}</button>
      </form>
    </Sheet>
  );
}

function ViewersSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const [list, setList] = useState<{ uid: string; username: string | null; at: number }[] | null>(null);
  useEffect(() => {
    void snapViewers(id).then(setList);
  }, [id]);
  const now = Date.now();
  return (
    <Sheet title="Seen by" onClose={onClose}>
      <ul className="snap-comments">
        {!list && <li className="snap-empty">Loading…</li>}
        {list && !list.length && <li className="snap-empty">Nobody has seen it yet.</li>}
        {list?.map((v) => (
          <li key={v.uid}>
            <Face uid={v.uid} username={v.username} size="sm" />
            <span><b><TileName uid={v.uid} username={v.username} /></b></span>
            <small className="snap-muted">{ago(v.at, now)}</small>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
