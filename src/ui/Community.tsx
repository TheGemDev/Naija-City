// Phone apps for the social side of Kaduna: Friends (shown inside Messages) and Goals (daily and weekly
// quests, the two-week season board and its prizes). Server side: worker/community.ts.

import { useEffect, useState } from 'react';
import { naira, useGame } from '../game/store';
import { lastOnline, searchPlayers, useSocial, type PlayerRef } from '../net/social';
import { useSession } from '../net/session';
import { useNet } from '../net/multiplayer';
import {
  claimPrize, claimQuest, loadFriends, loadQuests, unfriend, useCommunity, type Quest,
} from '../net/community';
import { buyPack, loadShop, useShop } from '../net/shop';
import { PlayerName } from './PlayerName';
import { Face } from './Face';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const left = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
};

function SignedOut() {
  return (
    <div className="list-card" style={{ padding: 14 }}>
      <b>Sign in to play with others</b>
      <small className="muted">Friends, quests and the season board need an account.</small>
    </div>
  );
}

const useSignedIn = () => !!useSession((s) => s.user?.username);

/* ---------- Friends ---------- */

function openChat(p: { uid: string; username: string }) {
  useSocial.setState({ openWith: p.uid });
  useGame.getState().setPanel('phone');
}

/** Everyone connected to the game server right now (the room is city-wide, keyed by uid). */
const useOnline = () => useNet((s) => s.players);

function FriendRow({ uid, username, lastSeen }: { uid: string; username: string; lastSeen?: number | null }) {
  const isOnline = !!useOnline()[uid];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    // Gone from the list on success; on failure the row is still here, so put the buttons back.
    if (!(await unfriend(uid))) { setBusy(false); setConfirming(false); }
  };
  return (
    <div className="tile">
      <span className="tile-icon round online-avatar"><Face uid={uid} username={username} size="fill" />{isOnline && <i className="online-dot" />}</span>
      <span className="tile-info">
        <b><PlayerName uid={uid} username={username} /></b>
        {confirming ? <small>Unfriend @{username}?</small> : isOnline ? <small className="online-label">Online</small> : !!lastOnline(lastSeen) && <small className="last-online">{lastOnline(lastSeen)}</small>}
      </span>
      {confirming ? (
        <span className="row-btns">
          <button className="btn sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          <button className="btn sm danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Yes, unfriend'}</button>
        </span>
      ) : (
        <span className="row-btns">
          <button className="btn sm" onClick={() => openChat({ uid, username })}>Chat</button>
          <button className="btn sm danger" onClick={() => setConfirming(true)}>Unfriend</button>
        </span>
      )}
    </div>
  );
}

export function FriendsTab() {
  const f = useCommunity((s) => s.friends);
  const online = useOnline();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PlayerRef[]>([]);
  useEffect(() => { void loadFriends(); }, []);
  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (!term) { setFound([]); return; }
    const id = setTimeout(() => searchPlayers(term).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <>
      <input className="text-input" placeholder="Find a player by @username" value={q} onChange={(e) => setQ(e.target.value)} />
      {found.map((p) => (
        <div className="tile" key={p.uid}>
          <Face uid={p.uid} username={p.username} look={p.look} size="lg" />
          <span className="tile-info"><b>@{p.username}</b></span>
          <button className="btn sm go" onClick={() => { setQ(''); openChat({ uid: p.uid, username: p.username ?? 'someone' }); }}>Message</button>
        </div>
      ))}
      <small className="muted">Message someone. When they reply, you become friends.</small>
      <h4>Friends · {f?.friends.length ?? 0}{f?.friends.length ? ` · ${f.friends.filter((p) => online[p.uid]).length} online` : ''}</h4>
      <div className="list-card">
        {[...(f?.friends ?? [])].sort((a, b) => Number(!!online[b.uid]) - Number(!!online[a.uid])).map((p) => (
          <FriendRow key={p.uid} {...p} />
        ))}
        {f && !f.friends.length && <small className="muted" style={{ padding: 12 }}>No friends yet. Message a @username above.</small>}
      </div>
    </>
  );
}

/* ---------- Goals: quests and season ---------- */

function QuestRow({ q }: { q: Quest }) {
  const done = q.progress >= q.target;
  const money = q.target >= 1000;
  return (
    <div className="tile">
      <span className="tile-icon">{q.icon}</span>
      <span className="tile-info">
        <b>{q.label}</b>
        <small>{money ? `${naira(q.progress)} / ${naira(q.target)}` : `${q.progress} / ${q.target}`} · {naira(q.reward)} · +{q.points} pts</small>
        <div className="bar"><i style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} /></div>
      </span>
      <button className={`btn sm ${done && !q.claimed ? 'go' : ''}`} disabled={!done || q.claimed} onClick={() => claimQuest(q.id)}>
        {q.claimed ? '✓' : 'Claim'}
      </button>
    </div>
  );
}

export function GoalsApp() {
  const ok = useSignedIn();
  const quests = useCommunity((s) => s.quests);
  const now = useNow(30_000);
  useEffect(() => {
    if (!ok) return;
    void loadQuests();
    const id = setInterval(loadQuests, 30_000);
    return () => clearInterval(id);
  }, [ok]);
  if (!ok) return <SignedOut />;
  if (!quests) return <small className="muted">Loading…</small>;
  const s = quests.season;
  return (
    <>
      <div className="hero hero-yellow">
        <small>Season ends in {left(s.endsAt - now)}</small>
        <b>{s.points} pts{s.rank ? ` · #${s.rank}` : ''}</b>
        <small>Top 3 win {s.prizes.map((p) => naira(p.prize)).join(' / ')}</small>
      </div>
      {quests.prize && (
        <button className="btn go" onClick={claimPrize}>🏆 Collect {quests.prize.title} prize: {naira(quests.prize.prize)}</button>
      )}
      <h4>Daily · resets in {left(quests.dayEndsAt - now)}</h4>
      <div className="list-card">{quests.daily.map((q) => <QuestRow key={q.id} q={q} />)}</div>
      <h4>Weekly · resets in {left(quests.weekEndsAt - now)}</h4>
      <div className="list-card">{quests.weekly.map((q) => <QuestRow key={q.id} q={q} />)}</div>
      <h4>Season leaderboard</h4>
      <div className="list-card">
        {s.top.map((r) => (
          <div className={`tile ${r.me ? 'forbes-me' : ''}`} key={r.uid}>
            <span className={`rank-badge ${r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : r.rank === 3 ? 'bronze' : ''}`}>#{r.rank}</span>
            <Face uid={r.uid} username={r.username} />
            <span className="tile-info"><b>@{r.username}</b></span>
            <b>{r.points} pts</b>
          </div>
        ))}
        {!s.top.length && <small className="muted" style={{ padding: 12 }}>Nobody has points yet. Finish a quest to lead.</small>}
      </div>
    </>
  );
}

/* ---------- Top-up ---------- */

export function TopUpApp() {
  const ok = useSignedIn();
  const { packs, orders: allOrders, enabled, busy } = useShop();
  const orders = allOrders.filter((o) => o.status === 'paid');
  useEffect(() => { if (ok) void loadShop(); }, [ok]);
  if (!ok) return <SignedOut />;
  return (
    <>
      <div className="hero hero-green">
        <small>Top up your wallet</small>
        <b>Buy naira with real money</b>
        <small>Paid securely by transfer or card. Naira lands in your wallet in seconds.</small>
      </div>
      {!enabled && <small className="muted">The shop is not open yet. Check back soon.</small>}
      {packs.map((p) => (
        <div className="tile" key={p.id}>
          <span className="tile-icon">{p.icon}</span>
          <span className="tile-info">
            <b>{naira(p.naira)}{p.tag ? ` · ${p.tag}` : ''}</b>
            <small>{p.label}</small>
          </span>
          <button className="btn sm go" disabled={!enabled || busy} onClick={() => buyPack(p.id)}>₦{p.price.toLocaleString('en-NG')}</button>
        </div>
      ))}
      {!!orders.length && (
        <>
          <h4>Your orders</h4>
          {orders.map((o) => (
            <div className="tile" key={o.id}>
              <span className="tile-info"><b>{naira(o.naira)}</b><small>₦{o.price.toLocaleString('en-NG')} · {new Date(o.created_at).toLocaleString()}</small></span>
              <b className="good">Paid</b>
            </div>
          ))}
        </>
      )}
      <small className="muted">Need help with a payment? Email <a href="mailto:support@naija.city">support@naija.city</a>.</small>
    </>
  );
}
