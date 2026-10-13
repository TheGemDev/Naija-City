// Snap: take a picture with the game camera and it shows on your friends' timeline and the whole city's for a day.

import { useEffect, useState } from 'react';
import { SNAP_COMMENT_MAX, commentSnap, deleteSnap, deleteSnapComment, likeSnap, loadSnapComments, loadSnaps, useSnaps, type Snap, type SnapScope } from '../net/snaps';
import { useSession } from '../net/session';
import { shareLink, snapLink } from '../net/deeplink';
import { Poster } from './PlayerName';
import { Emoji } from './Icons';
import { openSnapCamera } from './PhotoMode';
import './snap.css';

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.floor((now - at) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
};
const left = (until: number, now: number) => {
  const m = Math.max(1, Math.ceil((until - now) / 60_000));
  return m < 60 ? `${m}m left` : `${Math.floor(m / 60)}h left`;
};

export function SnapApp() {
  const me = useSession((s) => s.user);
  const [tab, setTab] = useState<SnapScope>('friends');
  const snaps = useSnaps((s) => s[tab]);
  const end = useSnaps((s) => s.end[tab]);
  const loading = useSnaps((s) => s.loading);
  const [now, setNow] = useState(Date.now());
  const [openId, setOpenId] = useState<number | null>(null);
  const shared = useSnaps((s) => s.shared);
  // A snap opened from a share link comes with its comments showing.
  useEffect(() => {
    if (shared) setOpenId(shared.id);
  }, [shared?.id]);
  useEffect(() => {
    void loadSnaps(tab);
    const id = setInterval(() => {
      setNow(Date.now());
      void loadSnaps(tab);
    }, 30_000);
    return () => clearInterval(id);
  }, [tab]);
  // A snap whose day ran out while the app was open goes at once, without waiting for the next load.
  const live = snaps.filter((s) => s.until > now && s.id !== shared?.id);
  const card = (s: Snap) => <SnapCard key={s.id} s={s} myUid={me?.uid} now={now} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />;
  return (
    <>
      <button type="button" className="snap-capture" onClick={openSnapCamera}>
        <i aria-hidden />
        <span>
          <b>Capture</b>
          <small>Take a picture. It disappears after 24 hours.</small>
        </span>
      </button>
      {shared && shared.until > now && (
        <>
          <div className="shared-head">
            <b><Emoji char="🔗" size={16} /> Shared with you</b>
            <button className="gist-like" onClick={() => useSnaps.setState({ shared: null })}>✕ Close</button>
          </div>
          {card(shared)}
        </>
      )}
      <div className="tabs">
        <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}><Emoji char="👥" size={16} /> Friends</button>
        <button className={tab === 'global' ? 'on' : ''} onClick={() => setTab('global')}><Emoji char="🌍" size={16} /> Global</button>
      </div>
      {!me && <p className="muted small">Sign in to see and post snaps.</p>}
      {me && !live.length && (
        <p className="muted small">
          {loading ? 'Loading snaps…' : tab === 'friends' ? 'No snaps from your friends today. Add friends in Messages, or be the first to post.' : 'Nobody has posted today. Be the first.'}
        </p>
      )}
      {live.map(card)}
      {!end && live.length > 0 && <button className="ghost-btn" disabled={loading} onClick={() => void loadSnaps(tab, true)}>Older snaps</button>}
    </>
  );
}

function SnapCard({ s, myUid, now, open, onToggle }: { s: Snap; myUid?: string; now: number; open: boolean; onToggle: () => void }) {
  const comments = useSnaps((st) => st.comments[s.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = s.uid === myUid;
  useEffect(() => {
    if (open) void loadSnapComments(s.id);
  }, [open, s.id]);
  return (
    <div className="post snap-card">
      <div className="snap-meta">
        <Poster uid={s.uid} username={s.username} />
        <small>· {ago(s.at, now)}</small>
        <small className="snap-left"><Emoji char="⏳" size={13} /> {left(s.until, now)}</small>
      </div>
      <img className="snap-pic" src={s.url} alt={s.caption || `Snap by @${s.username ?? 'someone'}`} loading="lazy" draggable={false} />
      {s.caption && <p>{s.caption}</p>}
      <div className="gist-actions">
        <button className={`gist-like ${s.liked ? 'on' : ''}`} onClick={() => void likeSnap(s.id)}>
          <Emoji char={s.liked ? '❤️' : '🤍'} size={15} /> {s.likes}
        </button>
        <button className="gist-like" onClick={onToggle}><Emoji char="💬" size={15} /> {comments?.length ?? s.comments}</button>
        <button className="gist-like" onClick={() => void shareLink(snapLink(s.id), `@${s.username ?? 'someone'}'s snap on Naija City`)}><Emoji char="↗️" size={15} /> Share</button>
        {mine && (
          <button className="gist-like" onClick={() => window.confirm('Delete this snap?') && void deleteSnap(s.id).catch(() => {})}><Emoji char="🗑️" size={15} /> Delete</button>
        )}
      </div>
      {open && (
        <div className="gist-replies">
          {(comments ?? []).map((c) => (
            <div key={c.id} className="gist-reply">
              <div className="snap-meta">
                <Poster uid={c.uid} username={c.username} />
                <small>· {ago(c.at, now)}</small>
              </div>
              <p>{c.text}</p>
              {/* Your own comment, or any comment on your snap. */}
              {(mine || c.uid === myUid) && (
                <div className="gist-actions">
                  <button className="gist-like" onClick={() => void deleteSnapComment(s.id, c.id).catch(() => {})}><Emoji char="🗑️" size={15} /></button>
                </div>
              )}
            </div>
          ))}
          {comments && !comments.length && <p className="muted small">No comments yet.</p>}
          <form
            className="gist-compose"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy || !text.trim()) return;
              setBusy(true);
              void commentSnap(s.id, text).then((ok) => ok && setText('')).finally(() => setBusy(false));
            }}
          >
            <textarea value={text} maxLength={SNAP_COMMENT_MAX} rows={1} placeholder={`Comment on @${s.username ?? 'someone'}’s snap…`} onChange={(e) => setText(e.target.value)} />
            <button className="btn sm go" disabled={busy || !text.trim()}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}
