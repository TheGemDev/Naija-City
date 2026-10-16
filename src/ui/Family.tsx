// Phone app for love: your babe, your side cheeks, dates and marriage. Friends and hangouts
// live in Messages. Rules in src/game/hangout.ts, server in worker/hangout.ts.

import { useEffect, useState, type FormEvent } from 'react';
import { naira, useGame } from '../game/store';
import { useSession } from '../net/session';
import { sendHomeInvite, useSocial } from '../net/social';
import { loadFriends, useCommunity } from '../net/community';
import {
  askOut, hostHangout, joinHangout, loadCheaters, loadHangouts, loadLove, loveAction, searchCheater, spendNight, useHangouts, wipeMyCheats,
  type Cheaters, type LoveInfo,
} from '../net/hangout';
import type { CheatRecord } from '../game/hangout';
import { Face } from './Face';
import { KidsTab } from './FamilyKids';
import { Emoji } from './Icons';
import './family.css';

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};

const left = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

function Tag({ l }: { l: LoveInfo }) {
  const [icon, label] = l.status === 'married' ? ['💍', 'Spouse']
    : l.status === 'asked_date' ? ['💌', 'Pending']
      : l.status === 'asked_marry' ? ['💍', 'Proposal']
        : l.side ? ['🍑', 'Side'] : ['💕', 'Babe'];
  return <span className={`fam-chip${l.status === 'married' ? ' gold' : ''}`}><Emoji char={icon} size={13} /> {label}</span>;
}

function chat(l: LoveInfo) {
  useSocial.setState({ openWith: l.uid });
  useGame.getState().setPanel('phone');
}

function LoverCard({ l, max }: { l: LoveInfo; max: { ring: number; divorce: number; bondToMarry: number; datingMs: number } }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const incoming = !l.mine && (l.status === 'asked_date' || l.status === 'asked_marry');
  const waiting = l.mine && (l.status === 'asked_date' || l.status === 'asked_marry');
  const together = l.status === 'dating' || l.status === 'married';
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (l.nightIn <= 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [l.nightIn]);
  const nightIn = Math.max(0, l.nightIn - tick * 30_000);

  const invite = () => void sendHomeInvite(l.uid)
    .then(() => useGame.getState().toast('Invite sent 🏠'))
    .catch((e) => useGame.getState().toast((e as Error).message));

  return (
    <div className={`fam-card${incoming ? ' incoming' : ''}`}>
      <div className="fam-head">
        <Face uid={l.uid} username={l.username} size="lg" />
        <span className="tile-info">
          <b>@{l.username}</b>
          <small>{waiting ? 'Waiting for their answer…' : incoming ? 'Needs your answer' : l.status === 'married' ? 'Married' : 'Dating'}</small>
        </span>
        <Tag l={l} />
      </div>
      {l.status !== 'asked_date' && (
        <div className="fam-bond">
          <span>Bond</span>
          <div className="bar"><i style={{ width: `${Math.min(100, (l.bond / Math.max(1, max.bondToMarry)) * 100)}%` }} /></div>
          <span>{l.bond}{l.status === 'dating' ? ` / ${max.bondToMarry}` : ''}</span>
        </div>
      )}

      {incoming && (
        <>
          <div className="fam-ask">
            <Emoji char={l.status === 'asked_marry' ? '💍' : '💌'} size={22} />
            {l.status === 'asked_marry' ? 'is proposing to you!' : 'wants to be your babe'}
          </div>
          <div className="fam-row">
            <button className="btn go" disabled={busy} onClick={() => run(() => loveAction('accept', l.uid))}>Say yes</button>
            <button className="btn" disabled={busy} onClick={() => run(() => loveAction('end', l.uid))}>No thanks</button>
          </div>
        </>
      )}

      {together && (
        <>
          <div className="fam-actions">
            <button className="fam-act" onClick={() => chat(l)}><Emoji char="💬" size={18} /> Chat</button>
            <button className="fam-act" onClick={invite}><Emoji char="🏠" size={18} /> Invite over</button>
            <button className="fam-act" disabled={busy} onClick={() => run(() => hostHangout('date', 'friends', l.uid))}><Emoji char="🌹" size={18} /> Date night</button>
            <button className="fam-act" disabled={busy || nightIn > 0} onClick={() => run(() => spendNight(l.uid))}>
              <Emoji char="🌙" size={18} /> {nightIn > 0 ? `In ${left(nightIn)}` : 'Spend the night'}
            </button>
          </div>
          <small className="fam-note">Spending the night needs them inside your house. Invite them over first.</small>
        </>
      )}
      {l.status === 'dating' && (
        <>
          <button className="fam-propose" disabled={busy || !l.canPropose} onClick={() => run(() => loveAction('propose', l.uid))}>
            <Emoji char="💍" size={18} /> Propose · ring {naira(max.ring)}
          </button>
          {!l.canPropose && <small className="fam-note">Needs {Math.round(max.datingMs / 3_600_000)}h together and bond {max.bondToMarry}.</small>}
        </>
      )}
      {(waiting || together) && (
        <button className="fam-end" disabled={busy} onClick={() => run(() => loveAction('end', l.uid))}>
          {together && <Emoji char="💔" size={14} />}
          {l.status === 'married' ? `Divorce · ${naira(max.divorce)}` : l.status === 'dating' ? 'Break up' : 'Cancel request'}
        </button>
      )}
    </div>
  );
}

function CheatRow({ r, showCheater = true }: { r: CheatRecord; showCheater?: boolean }) {
  return (
    <div className="tile cheat-row">
      <span className="tile-icon"><Emoji char={r.caught ? '🔥' : '🤫'} size={24} /></span>
      <span className="tile-info">
        <b>{showCheater ? `@${r.cheater} ` : ''}cheated on @{r.partner}</b>
        <small>with @{r.with} · {ago(r.at)}{r.caught ? ' · got caught' : ''}</small>
      </span>
    </div>
  );
}

/** Is your man a cheater? Search anyone, see the latest scandals, or pay to clear your own name. */
function CheatersTab() {
  const money = useGame((s) => s.money);
  const [info, setInfo] = useState<Cheaters | null>(null);
  const [q, setQ] = useState('');
  const [result, setResult] = useState<{ username: string; records: CheatRecord[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => void loadCheaters().then((r) => r && setInfo(r));
  useEffect(refresh, []);
  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    try { setResult(await searchCheater(q)); } finally { setBusy(false); }
  };
  const wipe = async () => {
    if (!info || busy) return;
    if (!window.confirm(`Pay ${naira(info.wipeCost)} to clear your name off the cheaters list? Get caught again and it shows again.`)) return;
    setBusy(true);
    try {
      if (await wipeMyCheats()) refresh();
    } finally { setBusy(false); }
  };
  return (
    <>
      <div className="hero hero-rose fam-hero">
        <span className="fam-hero-icon"><Emoji char="🕵🏾" size={34} /></span>
        <div>
          <small>Shine your eye</small>
          <b>Is your man a cheater?</b>
          <small>Every side cheek leaves a trail. Search anyone.</small>
        </div>
      </div>
      <form className="fam-search" onSubmit={search}>
        <input className="text-input" placeholder="@username" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn go" disabled={busy || !q.trim()}><Emoji char="🔍" size={15} /> Check</button>
      </form>
      {result && (
        <div className="list-card fam-list">
          {result.records.length ? (
            <>
              <div className="fam-verdict bad">
                <Emoji char="🚩" size={22} />
                <b><Face username={result.username} size="xs" />@{result.username} is a cheater · {result.records.length} time{result.records.length > 1 ? 's' : ''}</b>
              </div>
              {result.records.map((r) => <CheatRow key={r.id} r={r} showCheater={false} />)}
            </>
          ) : (
            <div className="fam-verdict ok">
              <Emoji char="✅" size={22} />
              <b><Face username={result.username} size="xs" />@{result.username} has a clean record</b>
            </div>
          )}
        </div>
      )}

      {info && info.mine > 0 && (
        <div className="fam-card">
          <div className="fam-head">
            <span className="tile-icon"><Emoji char="😬" size={24} /></span>
            <span className="tile-info">
              <b>Your name is on the list ({info.mine})</b>
              <small>Anyone who searches you will see it. Clearing it gets pricier every time.</small>
            </span>
          </div>
          <button className="btn danger fam-btn" disabled={busy || money < info.wipeCost} onClick={() => void wipe()}>
            <Emoji char="🧽" size={16} /> Clear my name · {naira(info.wipeCost)}
          </button>
        </div>
      )}

      <h4>Latest scandals</h4>
      {info && !info.recent.length ? (
        <div className="fam-empty">
          <Emoji char="🤫" size={34} />
          <b>Everybody is faithful</b>
          <small>For now.</small>
        </div>
      ) : (
        <div className="list-card fam-list">
          {info?.recent.map((r) => <CheatRow key={r.id} r={r} />)}
        </div>
      )}
    </>
  );
}

export function FamilyApp() {
  const [tab, setTab] = useState<'love' | 'kids' | 'cheaters'>('love');
  const ok = !!useSession((s) => s.user?.username);
  const tabs = (
    <div className="tabs">
      <button className={tab === 'love' ? 'on' : ''} onClick={() => setTab('love')}><Emoji char="💞" size={16} /> Love</button>
      <button className={tab === 'kids' ? 'on' : ''} onClick={() => setTab('kids')}><Emoji char="👶🏾" size={16} /> Children</button>
      <button className={tab === 'cheaters' ? 'on' : ''} onClick={() => setTab('cheaters')}><Emoji char="🕵🏾" size={16} /> Cheaters</button>
    </div>
  );
  if (ok && tab === 'cheaters') return <>{tabs}<CheatersTab /></>;
  if (ok && tab === 'kids') return <>{tabs}<KidsTab /></>;
  return <>{ok && tabs}<LoveTab /></>;
}

function LoveTab() {
  const ok = !!useSession((s) => s.user?.username);
  const myUid = useSession((s) => s.user?.uid);
  const { lovers, rules, hangouts } = useHangouts();
  const friends = useCommunity((s) => s.friends);
  const [name, setName] = useState('');
  useEffect(() => {
    if (!ok) return;
    void loadLove();
    void loadFriends();
    void loadHangouts();
    const id = setInterval(() => { void loadLove(); void loadHangouts(); }, 20_000);
    return () => clearInterval(id);
  }, [ok]);
  if (!ok) {
    return (
      <div className="fam-empty">
        <Emoji char="💞" size={38} />
        <b>Sign in to find love</b>
        <small>Babes, dates and marriage need an account.</small>
      </div>
    );
  }
  const taken = new Set(lovers.map((l) => l.uid));
  const available = (friends?.friends ?? []).filter((f) => !taken.has(f.uid));
  const full = !!rules && lovers.length >= rules.max;
  const dates = hangouts.filter((h) => h.kind === 'date');
  const together = lovers.filter((l) => l.status === 'married' || l.status === 'dating');
  const married = lovers.some((l) => l.status === 'married');
  const asks = lovers.filter((l) => !l.mine && (l.status === 'asked_date' || l.status === 'asked_marry')).length;
  // Requests waiting on me first, then the people I'm with.
  const ordered = [...lovers].sort((a, b) => Number(!b.mine && b.status.startsWith('asked')) - Number(!a.mine && a.status.startsWith('asked')));

  return (
    <>
      <div className="hero hero-rose fam-hero">
        <span className="fam-hero-icon"><Emoji char={married ? '💍' : together.length ? '💞' : '💔'} size={34} /></span>
        <div>
          <small>{married ? 'Married life' : together.length ? 'Taken' : 'Single'}</small>
          <b>{together.length} in your life</b>
          <div className="fam-stats">
            {rules && <span><Emoji char="💕" size={12} /> {lovers.length}/{rules.max} slots</span>}
            {asks > 0 && <span><Emoji char="💌" size={12} /> {asks} waiting on you</span>}
            {together.length > 1 && <span><Emoji char="👀" size={12} /> Keep them apart</span>}
          </div>
        </div>
      </div>

      {dates.length > 0 && (
        <>
          <h4>Date nights</h4>
          <div className="list-card">
            {dates.map((h) => (
              <div className="tile" key={h.id}>
                <span className="tile-icon"><Emoji char="🌹" size={24} /></span>
                <span className="tile-info"><b>{h.title}</b><small>{h.guests.length}/{h.max} here</small></span>
                {h.host.uid !== myUid && !h.joined && <button className="btn sm go" onClick={() => joinHangout(h.id)}>Join</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {ordered.map((l) => rules && <LoverCard key={l.uid} l={l} max={rules} />)}
      {!lovers.length && (
        <div className="fam-empty">
          <Emoji char="💌" size={34} />
          <b>Nobody yet</b>
          <small>Ask a friend out below.</small>
        </div>
      )}

      <h4>Ask someone out</h4>
      {full ? (
        <small className="muted">You have your hands full. Let someone go first.</small>
      ) : (
        <>
          {available.length > 0 && (
            <div className="list-card fam-list">
              {available.slice(0, 6).map((f) => (
                <div className="tile" key={f.uid}>
                  <Face uid={f.uid} username={f.username} />
                  <span className="tile-info"><b>@{f.username}</b><small>Friend</small></span>
                  <button className="btn sm go fam-btn" onClick={() => askOut(f.username)}><Emoji char="💌" size={14} /> Be my babe</button>
                </div>
              ))}
            </div>
          )}
          <form className="fam-search" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void askOut(name).then((r) => r && setName('')); }}>
            <input className="text-input" placeholder="@username" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn go" disabled={!name.trim()}><Emoji char="💌" size={15} /> Ask out</button>
          </form>
          <small className="fam-note">Not friends yet? Message them first. Once they reply, you're friends.</small>
        </>
      )}
    </>
  );
}
