// Snap: the city's picture feed. Three tabs: For you (everyone's snaps), Friends, and Top (the day's most liked). Friends'
// stories sit in a row of rings above the feed; every snap is a full-width card you can like (double-tap), comment on and
// share, and tap to open full screen. The yellow camera button opens photo mode over the scene (ui/PhotoMode.tsx).
// Everything is gone a day after it is posted.

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  SNAP_COMMENT_MAX, commentSnap, deleteSnap, deleteSnapComment, likeSnap, loadSnapComments, loadSnaps, snapViewers, useSnaps, viewSnap,
  type Snap, type SnapScope,
} from '../net/snaps';
import { useSession } from '../net/session';
import { openedApp } from '../net/badges';
import { openPlayerProfile, sendText, usePlayerLabel } from '../net/social';
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
/** How long a snap has left before it is gone. */
const left = (until: number, now: number) => {
  const m = Math.max(0, Math.ceil((until - now) / 60_000));
  return m < 60 ? `${m}m left` : `${Math.floor(m / 60)}h left`;
};
const count = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));
/** How long one story snap shows before the next. */
const STORY_MS = 5000;
const REACTIONS = ['❤️', '😂', '🔥', '😮', '👏🏾', '🙌🏾'];
/** Two taps this close together on a picture are a like, not an open. */
const DOUBLE_TAP_MS = 260;

type Tab = 'global' | 'friends' | 'top';
const TABS: { id: Tab; label: string }[] = [
  { id: 'global', label: 'For you' },
  { id: 'friends', label: 'Friends' },
  { id: 'top', label: 'Top' },
];

const TileName = ({ uid, username }: { uid: string; username: string | null }) => <>{usePlayerLabel(uid, username).replace(/^@/, '')}</>;

const svg = (d: ReactNode, size = 22, sw = 2.2) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const ICON = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  heart: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />,
  comment: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />,
  share: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  send: <path d="M3 20.5 21 12 3 3.5v6.6l11 1.9-11 1.9z" />,
};

/** The player's right-hand rail: every icon this size and weight, so they read as one set. */
const RAIL_ICON = 30;

/** Who is open in the full-screen player: groups of snaps (one per friend's story, or one each from the feed). */
interface Playing {
  groups: Snap[][];
  g: number;
  i: number;
  mode: 'story' | 'spotlight' | 'direct';
}

/** A sheet of comments or viewers, opened from a card in the feed. */
type FeedSheet = { kind: 'comments' | 'viewers'; snap: Snap } | null;

/** Finds the store's latest copy of a snap (likes and counts change while it is on screen). */
const useLiveSnap = (base: Snap | undefined) =>
  useSnaps((s) => (base ? s.friends.find((x) => x.id === base.id) ?? s.global.find((x) => x.id === base.id) ?? s.top.find((x) => x.id === base.id) ?? (s.shared?.id === base.id ? s.shared : null) : null)) ?? base;

export function SnapApp() {
  const me = useSession((s) => s.user);
  const shared = useSnaps((s) => s.shared);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [sheet, setSheet] = useState<FeedSheet>(null);
  const [tab, setTab] = useState<Tab>('global');
  const [host, setHost] = useState<Element | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  // Open: the Snap badge is cleared (net/badges.ts).
  useEffect(() => openedApp('snap'), []);

  // A snap opened from a share link plays at once.
  useEffect(() => {
    if (shared && shared.until > Date.now()) setPlaying({ groups: [[shared]], g: 0, i: 0, mode: 'spotlight' });
  }, [shared?.id]);

  const close = () => {
    setPlaying(null);
    if (useSnaps.getState().shared) useSnaps.setState({ shared: null });
  };
  // Tapping the tab you are on goes back to the top and fetches it fresh.
  const pick = (id: Tab) => {
    if (id !== tab) return setTab(id);
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
    void loadSnaps(id);
    if (id !== 'friends') void loadSnaps('friends');
  };
  const portal = (node: ReactNode) => (host ? createPortal(node, host) : node);

  return (
    <div className="snap-app" ref={(el) => setHost(el?.closest('.screen') ?? null)}>
      {me && (
        <nav className="snap-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id)}>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="snap-scroll" ref={scroller}>
        {!me ? (
          <div className="snap-empty big"><Emoji char="👻" size={44} /><b>Sign in to use Snap</b><span>Snaps from your friends and the whole city show here.</span></div>
        ) : (
          <>
            {tab !== 'top' && <Stories myUid={me.uid} load={tab !== 'friends'} play={setPlaying} />}
            <Feed key={tab} scope={tab} root={scroller} myUid={me.uid} play={setPlaying} openSheet={setSheet} />
          </>
        )}
      </div>
      {me && (
        <button type="button" className="snap-fab" aria-label="Take a snap" onClick={() => openSnapCamera()}><CameraGlyph /></button>
      )}
      {sheet && portal(
        sheet.kind === 'comments'
          ? <CommentsSheet snap={sheet.snap} mine={sheet.snap.uid === me?.uid} myUid={me?.uid} onClose={() => setSheet(null)} top />
          : <ViewersSheet id={sheet.snap.id} onClose={() => setSheet(null)} top />,
      )}
      {playing && portal(<Player start={playing} myUid={me?.uid} onClose={close} />)}
    </div>
  );
}

/* ---------- Stories: a ring for me and for each friend who posted today ---------- */

/** `load`: fetch friends' snaps here (on the Friends tab the feed under it already does). */
function Stories({ myUid, load, play }: { myUid: string; load: boolean; play: (p: Playing) => void }) {
  const friends = useSnaps((s) => s.friends);
  useEffect(() => {
    if (load) void loadSnaps('friends');
  }, [load]);
  const now = Date.now();
  const live = friends.filter((s) => s.until > now);
  // Oldest first inside each story, like Snapchat; the friends with something new go first, newest first.
  const byUid = new Map<string, Snap[]>();
  for (const s of [...live].sort((a, b) => a.at - b.at)) byUid.set(s.uid, [...(byUid.get(s.uid) ?? []), s]);
  const mine = byUid.get(myUid) ?? [];
  byUid.delete(myUid);
  const groups = [...byUid.values()].sort((a, b) => {
    const ua = a.some((s) => !s.seen);
    const ub = b.some((s) => !s.seen);
    return ua !== ub ? (ua ? -1 : 1) : b[b.length - 1].at - a[a.length - 1].at;
  });
  const open = (k: number) => {
    const g = groups[k];
    play({ groups, g: k, i: Math.max(0, g.findIndex((s) => !s.seen)), mode: 'story' });
  };

  return (
    <div className="snap-stories" aria-label="Stories">
      <div className="snap-story">
        <button
          type="button"
          className={`snap-story-ring${mine.length ? ' mine' : ' add'}`}
          aria-label={mine.length ? 'Your story' : 'Add to your story'}
          onClick={() => (mine.length ? play({ groups: [mine], g: 0, i: 0, mode: 'story' }) : openSnapCamera())}
        >
          <Face uid={myUid} size="fill" />
          {!mine.length && <em aria-hidden>+</em>}
        </button>
        <small>{mine.length ? 'Your story' : 'Add snap'}</small>
      </div>
      {groups.map((g, k) => {
        const s = g[g.length - 1];
        const unseen = g.some((x) => !x.seen);
        return (
          <div key={s.uid} className="snap-story">
            <button type="button" className={`snap-story-ring${unseen ? ' unseen' : ''}`} aria-label={`@${s.username ?? 'friend'}'s story`} onClick={() => open(k)}>
              <Face uid={s.uid} username={s.username} size="fill" />
            </button>
            <small className={unseen ? 'new' : ''}><TileName uid={s.uid} username={s.username} /></small>
          </div>
        );
      })}
      {!groups.length && <p className="snap-stories-hint">Your friends’ stories show up here. Text someone in Messages to become friends.</p>}
    </div>
  );
}

/* ---------- The feed: one card per snap ---------- */

function Feed({ scope, root, myUid, play, openSheet }: { scope: SnapScope; root: RefObject<HTMLDivElement | null>; myUid: string; play: (p: Playing) => void; openSheet: (s: FeedSheet) => void }) {
  const snaps = useSnaps((s) => s[scope]);
  const end = useSnaps((s) => s.end[scope]);
  const loading = useSnaps((s) => s.loading);
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    void loadSnaps(scope);
  }, [scope]);
  // Endless scroll: the next page loads as the bottom comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || end) return;
    const io = new IntersectionObserver((es) => {
      if (es[0]?.isIntersecting && !useSnaps.getState().loading && useSnaps.getState()[scope].length) void loadSnaps(scope, true);
    }, { root: root.current, rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [scope, end]);

  const now = Date.now();
  const live = snaps.filter((s) => s.until > now && (scope !== 'friends' || s.uid !== myUid));
  const openAt = (k: number) => play({ groups: live.map((x) => [x]), g: k, i: 0, mode: 'spotlight' });

  if (!live.length) {
    if (loading) return <div className="snap-cards">{[0, 1].map((k) => <div key={k} className="snap-card skeleton" aria-hidden><i /><b /></div>)}</div>;
    return (
      <div className="snap-empty big">
        <StarGlyph />
        <b>{scope === 'friends' ? 'Nothing from your friends today' : 'Nothing posted today'}</b>
        <span>{scope === 'friends' ? 'Text someone in Messages: once they reply you are friends, and their snaps show here.' : 'Be the first. Snap something and the whole city sees it.'}</span>
        <button type="button" className="snap-empty-cta" onClick={() => openSnapCamera()}>Take a snap</button>
      </div>
    );
  }
  return (
    <div className="snap-cards">
      {live.map((s, k) => (
        <SnapCard key={s.id} snap={s} rank={scope === 'top' && k < 3 ? k + 1 : 0} mine={s.uid === myUid} now={now} open={() => openAt(k)} openSheet={openSheet} />
      ))}
      <div ref={sentinel} className="snap-sentinel" />
      {end && <p className="snap-end"><Emoji char="👻" size={18} /> {scope === 'top' ? 'That’s today’s top snaps' : 'You’re all caught up'}</p>}
    </div>
  );
}

function SnapCard({ snap, rank, mine, now, open, openSheet }: { snap: Snap; rank: number; mine: boolean; now: number; open: () => void; openSheet: (s: FeedSheet) => void }) {
  const [pop, setPop] = useState(0);
  const tap = useRef<number | null>(null);
  const like = () => void likeSnap(snap.id);
  // One tap opens it full screen; two quick taps like it (never unlike), with a heart over the picture.
  const onPic = () => {
    if (tap.current) {
      clearTimeout(tap.current);
      tap.current = null;
      if (!snap.liked) like();
      setPop(Date.now());
      return;
    }
    tap.current = window.setTimeout(() => {
      tap.current = null;
      open();
    }, DOUBLE_TAP_MS);
  };
  useEffect(() => () => void (tap.current && clearTimeout(tap.current)), []);
  const who = () => !mine && openPlayerProfile({ uid: snap.uid, username: snap.username });

  return (
    <article className="snap-card">
      <header className="snap-card-head">
        <button type="button" className="snap-card-who" onClick={who}>
          <Face uid={snap.uid} username={snap.username} size="sm" />
          <span>
            <b><TileName uid={snap.uid} username={snap.username} /></b>
            <small>{ago(snap.at, now)} ago</small>
          </span>
        </button>
        <span className="snap-left" title="Snaps disappear a day after they are posted">{svg(ICON.clock, 13, 2.4)} {left(snap.until, now)}</span>
        {mine && (
          <button type="button" className="snap-icon-btn ghost" aria-label="Delete this snap" onClick={() => window.confirm('Delete this snap?') && void deleteSnap(snap.id).catch(() => {})}>{svg(ICON.trash, 18)}</button>
        )}
      </header>
      <button type="button" className="snap-card-pic" aria-label={`Open @${snap.username ?? 'someone'}'s snap`} onClick={onPic}>
        <img src={snap.url} alt={snap.caption || ''} loading="lazy" draggable={false} />
        {snap.caption && <span className="snap-card-cap">{snap.caption}</span>}
        {rank > 0 && <span className={`snap-rank r${rank}`}>#{rank}</span>}
        {pop > 0 && <span key={pop} className="snap-card-heart" aria-hidden>{svg(ICON.heart, 92, 0)}</span>}
      </button>
      <footer className="snap-card-acts">
        <button type="button" className={snap.liked ? 'liked' : ''} aria-label={snap.liked ? 'Unlike' : 'Like'} aria-pressed={snap.liked} onClick={like}>
          {svg(ICON.heart, 24, 2.1)}<span>{count(snap.likes)}</span>
        </button>
        <button type="button" aria-label="Comments" onClick={() => openSheet({ kind: 'comments', snap })}>{svg(ICON.comment, 23, 2.1)}<span>{count(snap.comments)}</span></button>
        <button type="button" aria-label="Share" onClick={() => void shareLink(snapLink(snap.id), `@${snap.username ?? 'someone'}'s snap on Naija City`)}>{svg(ICON.share, 22, 2.1)}</button>
        {mine ? (
          <button type="button" className="snap-card-views tap" onClick={() => openSheet({ kind: 'viewers', snap })}>{svg(ICON.eye, 18, 2.1)}<span>Seen by {count(snap.views)}</span></button>
        ) : (
          <span className="snap-card-views">{svg(ICON.eye, 18, 2.1)}<span>{count(snap.views)}</span></span>
        )}
      </footer>
      {snap.comments > 0 && (
        <button type="button" className="snap-card-more" onClick={() => openSheet({ kind: 'comments', snap })}>
          View {snap.comments === 1 ? '1 comment' : `all ${count(snap.comments)} comments`}
        </button>
      )}
    </article>
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
  const snap = useLiveSnap(group[at.i]);
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

  // Tap the left third to go back, anywhere else to go on; hold to pause; swipe down to close; swipe up for the next.
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
    } else void send(emoji);
    burst(emoji);
  };
  const like = () => {
    if (!snap.liked) burst('❤️');
    void likeSnap(snap.id);
  };

  return (
    <div className={`snap-player mode-${mode}`} role="dialog" aria-label={`Snap by @${snap.username ?? 'someone'}`} style={{ transform: dy > 0 ? `translateY(${dy}px) scale(${1 - Math.min(dy, 300) / 1500})` : undefined }}>
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
      {!mine && (
        // Like, comments and share down the right, like Spotlight; a story's reply goes to the chat instead (along the bottom).
        <div className="snap-player-rail">
          <button type="button" className={snap.liked ? 'liked' : ''} aria-label={snap.liked ? 'Unlike' : 'Like'} onClick={like}>{svg(ICON.heart, RAIL_ICON, 2)}<small>{count(snap.likes)}</small></button>
          <button type="button" aria-label="Comments" onClick={() => setSheet('comments')}>{svg(ICON.comment, RAIL_ICON - 2, 2)}<small>{count(snap.comments)}</small></button>
          <button type="button" aria-label="Share" onClick={() => void shareLink(snapLink(snap.id), `@${snap.username ?? 'someone'}'s snap on Naija City`)}>{svg(ICON.share, RAIL_ICON - 2, 2)}<small>Share</small></button>
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
            {mode !== 'spotlight' && !typing && (
              <div className="snap-reacts">
                {REACTIONS.map((e) => <button key={e} type="button" aria-label={`React ${e}`} onClick={() => react(e)}><Emoji char={e} size={24} /></button>)}
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
              {reply.trim() && <button type="submit" aria-label="Send">{svg(ICON.send, 20, 0)}</button>}
            </form>
          </>
        )}
      </div>
      {sheet === 'comments' && <CommentsSheet snap={snap} mine={mine} myUid={myUid} onClose={() => setSheet(null)} />}
      {sheet === 'viewers' && <ViewersSheet id={snap.id} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** A sheet that slides up. `top`: opened from the feed, so it sits over the whole phone screen rather than in the player. */
function Sheet({ title, onClose, top, children }: { title: string; onClose: () => void; top?: boolean; children: ReactNode }) {
  return (
    <div className={`snap-sheet-wrap${top ? ' on-screen' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="snap-sheet" role="dialog" aria-label={title}>
        <div className="snap-sheet-head"><b>{title}</b><button type="button" className="snap-icon-btn" aria-label="Close" onClick={onClose}>{svg(ICON.close, 20, 2.6)}</button></div>
        {children}
      </div>
    </div>
  );
}

function CommentsSheet({ snap: base, mine, myUid, onClose, top }: { snap: Snap; mine: boolean; myUid?: string; onClose: () => void; top?: boolean }) {
  const snap = useLiveSnap(base) ?? base;
  const comments = useSnaps((s) => s.comments[snap.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  useEffect(() => {
    void loadSnapComments(snap.id);
  }, [snap.id]);
  const n = comments?.length ?? snap.comments;
  return (
    <Sheet title={n === 1 ? '1 comment' : `${n} comments`} onClose={onClose} top={top}>
      <ul className="snap-comments">
        {!comments && <li className="snap-empty">Loading…</li>}
        {comments && !comments.length && <li className="snap-empty">No comments yet. Say something nice.</li>}
        {comments?.map((c) => (
          <li key={c.id}>
            <Face uid={c.uid} username={c.username} size="sm" />
            <span className="snap-c-body">
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
        <button type="submit" disabled={busy || !text.trim()} aria-label="Post comment">{svg(ICON.send, 20, 0)}</button>
      </form>
    </Sheet>
  );
}

function ViewersSheet({ id, onClose, top }: { id: number; onClose: () => void; top?: boolean }) {
  const [list, setList] = useState<{ uid: string; username: string | null; at: number }[] | null>(null);
  useEffect(() => {
    void snapViewers(id).then(setList);
  }, [id]);
  const now = Date.now();
  return (
    <Sheet title="Seen by" onClose={onClose} top={top}>
      <ul className="snap-comments">
        {!list && <li className="snap-empty">Loading…</li>}
        {list && !list.length && <li className="snap-empty">Nobody has seen it yet.</li>}
        {list?.map((v) => (
          <li key={v.uid}>
            <Face uid={v.uid} username={v.username} size="sm" />
            <span className="snap-c-body"><b><TileName uid={v.uid} username={v.username} /></b></span>
            <small className="snap-muted">{ago(v.at, now)}</small>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** A solid camera for the camera button: body, the bump the shutter sits on, and a big lens. */
function CameraGlyph() {
  return (
    <svg className="snap-take-cam" viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <path d="M8.2 4.5h7.6l1.5 2.2H20a2 2 0 0 1 2 2v9.8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.7a2 2 0 0 1 2-2h2.7z" fill="currentColor" />
      <circle cx="12" cy="13.2" r="4.6" fill="#fffc00" />
      <circle cx="12" cy="13.2" r="3" fill="currentColor" />
      <circle cx="13.1" cy="12.1" r="0.9" fill="#fffc00" />
      <rect x="17.6" y="8.6" width="2" height="1.4" rx="0.5" fill="#fffc00" />
    </svg>
  );
}

/** The empty feed's star: drawn, in Snap yellow with a soft dark edge, so it sits right on light and dark alike. */
function StarGlyph() {
  return (
    <svg className="snap-empty-star" viewBox="0 0 24 24" width="44" height="44" aria-hidden>
      <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="#fffc00" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
