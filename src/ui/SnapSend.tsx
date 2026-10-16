// Snap's "Send To" screen: where a snap goes once it is dressed up. My story (friends see it), Spotlight (the whole
// city sees it) and any friends it is sent straight to, each with our streak.

import { useEffect, useState } from 'react';
import { usePhoto } from '../game/photo';
import { loadFriends, useCommunity } from '../net/community';
import { loadSnapChats, useSnaps, type SnapSend } from '../net/snaps';
import { usePlayerLabel } from '../net/social';
import { Face } from './Face';
import { Emoji } from './Icons';
import './snap.css';

/** A friend's 🔥 streak with me, and ⏳ when it runs out at midnight unless we both send one today. */
export function Streak({ uid }: { uid: string }) {
  const s = useSnaps((st) => st.chats?.streaks.find((x) => x.uid === uid));
  if (!s?.count) return null;
  return (
    <span className="snap-streak" title={s.ending ? 'Send a snap today or the streak ends at midnight' : `${s.count}-day streak`}>
      {s.count}
      <Emoji char="🔥" size={13} />
      {s.ending && <Emoji char="⏳" size={13} />}
    </span>
  );
}

function FriendRow({ uid, username, on, toggle }: { uid: string; username: string; on: boolean; toggle: () => void }) {
  const label = usePlayerLabel(uid, username);
  return (
    <button type="button" className={`snap-pick ${on ? 'on' : ''}`} aria-pressed={on} onClick={toggle}>
      <Face uid={uid} username={username} />
      <span className="snap-pick-name">
        <b>{label}</b>
        <Streak uid={uid} />
      </span>
      <i className="snap-tick" aria-hidden />
    </button>
  );
}

export function SnapSendSheet({ busy, onBack, onSend }: { busy: boolean; onBack: () => void; onSend: (send: SnapSend) => void }) {
  const friends = useCommunity((s) => s.friends?.friends);
  const streaks = useSnaps((s) => s.chats?.streaks);
  const [story, setStory] = useState(true);
  const [spotlight, setSpotlight] = useState(() => !usePhoto.getState().sendTo.length);
  const [to, setTo] = useState<string[]>(() => usePhoto.getState().sendTo);
  const [q, setQ] = useState('');
  useEffect(() => {
    void loadFriends();
    void loadSnapChats();
  }, []);
  // Friends with a streak first (the longest on top), then everyone else as the server listed them.
  const streakOf = (uid: string) => streaks?.find((s) => s.uid === uid)?.count ?? 0;
  const list = (friends ?? [])
    .filter((f) => !q.trim() || f.username.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => streakOf(b.uid) - streakOf(a.uid));
  const names = (friends ?? []).filter((f) => to.includes(f.uid)).map((f) => f.username);
  const chosen = [...(story ? ['My Story'] : []), ...(spotlight ? ['Spotlight'] : []), ...names];
  const flip = (uid: string) => setTo((t) => (t.includes(uid) ? t.filter((x) => x !== uid) : [...t, uid]));
  return (
    <div className="snap-send" role="dialog" aria-label="Send to">
      <div className="snap-send-head">
        <button type="button" className="snap-icon-btn" aria-label="Back to the picture" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <b>Send To</b>
      </div>
      <input className="snap-search" value={q} placeholder="Search friends" aria-label="Search friends" onChange={(e) => setQ(e.target.value)} />
      <div className="snap-send-list">
        <h4>Stories</h4>
        <button type="button" className={`snap-pick ${story ? 'on' : ''}`} aria-pressed={story} onClick={() => setStory(!story)}>
          <span className="snap-pick-icon my-story"><Emoji char="👻" size={20} /></span>
          <span className="snap-pick-name"><b>My Story</b><small>Friends see it for 24 hours</small></span>
          <i className="snap-tick" aria-hidden />
        </button>
        <button type="button" className={`snap-pick ${spotlight ? 'on' : ''}`} aria-pressed={spotlight} onClick={() => setSpotlight(!spotlight)}>
          <span className="snap-pick-icon to-spot"><Emoji char="⭐" size={20} /></span>
          <span className="snap-pick-name"><b>Spotlight</b><small>The whole city sees it, and can like it</small></span>
          <i className="snap-tick" aria-hidden />
        </button>
        <h4>Friends</h4>
        {friends === undefined && <p className="snap-empty">Loading friends…</p>}
        {friends && !friends.length && <p className="snap-empty">No friends yet. Text someone in Messages and when they reply you are friends.</p>}
        {list.map((f) => <FriendRow key={f.uid} uid={f.uid} username={f.username} on={to.includes(f.uid)} toggle={() => flip(f.uid)} />)}
      </div>
      <div className={`snap-send-bar ${chosen.length ? 'on' : ''}`}>
        <span>{chosen.length ? chosen.join(', ') : 'Pick where it goes'}</span>
        <button type="button" aria-label="Send" disabled={busy || !chosen.length} onClick={() => onSend({ story, spotlight, to })}>
          {busy ? <span className="snap-spin" /> : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden><path d="M3 20.5 21 12 3 3.5v6.6l11 1.9-11 1.9z" /></svg>}
        </button>
      </div>
    </div>
  );
}
