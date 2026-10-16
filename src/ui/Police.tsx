// Police app (report thefts against you, the most-wanted board for officers, who's in custody, your own
// record), the panel you see while locked in the prison, and the WANTED banner while police hunt you.

import { Icon } from './Icons';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ITEMS } from '../game/catalog';
import { cityMap } from '../game/city';
import { regionHere, regionOf } from '../game/regions';
import { ACCUSE, bailFor, BOUNTY, CATCHERS, VDM, CRIME, POLICE, type CrimeReport, type WantedPerson, unsolved } from '../game/crime';
import { avatar } from '../game/avatar';
import { naira, useGame } from '../game/store';
import { accuseSuspects, arrestPlayer, callVdm, fileReport, loadPolice, myManhunt, payBail, postBounty, usePolice } from '../net/crime';
import { useNet } from '../net/multiplayer';
import { requestMoney, searchPlayers, useSocial, type PlayerRef } from '../net/social';
import { useSession } from '../net/session';
import './chat-money.css';
import { useLive } from '../net/live';
import { PHONE_SEARCH } from '../game/phoneSearch';
import { GUNS } from '../game/guns';
import { Face } from './Face';

/** Ticks once a second so countdowns move. */
function useNow(on = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

const clock = (ms: number) => {
  const left = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
};

/** The area key my game reports to the multiplayer room (same shape as src/net/multiplayer.ts). */
function myArea() {
  const g = useGame.getState();
  if (g.view === 'place' && g.insideId) return `place:${g.destinationId}:${g.insideId}`;
  if (g.view === 'city') return `city:${g.destinationId}`;
  if (g.view === 'estate' && g.estateId) return `estate:${g.estateId}:${g.estateNo}`;
  return 'home';
}

function seenLabel(w: WantedPerson) {
  if (!w.seen) return 'Offline';
  if (w.seen === 'home') return 'Hiding at home';
  // The board lists suspects in every city: say which one, and name the place as that city knows it.
  const [kind, city, id] = w.seen.split(':');
  if (kind === 'place') return `At ${cityMap(city).placeById[id]?.name ?? 'a building'}, ${regionOf(city).name}`;
  if (kind === 'city') return `On the streets of ${regionOf(city).name}`;
  if (kind === 'estate') return 'In an estate';
  return 'Somewhere in town';
}

/** How far away a suspect is, if they're in the same area as me. */
function distanceTo(w: WantedPerson) {
  if (!w.seen || w.seen !== myArea() || w.x === undefined || w.z === undefined) return null;
  return Math.hypot(w.x - avatar.x, w.z - avatar.z);
}

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};

function what(c: CrimeReport) {
  if (c.armed) {
    const label = c.armed === 'shoot' ? 'Shooting' : 'Armed robbery';
    return c.success ? `${label}${c.amount ? ` · took ${naira(c.amount)}` : ''}` : `${label} · attempted`;
  }
  if (!c.success) return c.kind === 'burglary' ? 'Tried to break into the house' : 'Tried to pick a pocket';
  const item = c.item ? ITEMS[c.item]?.name ?? c.item : null;
  const loot = [c.amount ? naira(c.amount) : '', item ? `a ${item}` : ''].filter(Boolean).join(' incl. ') || 'nothing';
  return `${c.kind === 'burglary' ? 'Burglary' : 'Pickpocket'} · took ${loot}`;
}

export function PoliceApp() {
  const user = useSession((s) => s.user);
  const { against, by, laws, loading, busy, error, wanted, custody } = usePolice();
  const money = useGame((s) => s.money);
  const officer = useGame((s) => s.jobId === POLICE.job);
  const now = useNow();
  const [tab, setTab] = useState<'reports' | 'wanted' | 'vdm'>('reports');
  useEffect(() => {
    void loadPolice();
  }, []);
  if (!user) return <div className="police-empty"><span>🚔</span><b>Police</b><small>Sign in to access reports</small></div>;
  const deadline = laws.reportHours * 3_600_000;
  const catchChance = Math.round((1 - CRIME.successChance(laws)) * 100);
  return (
    <div className="police-app">
      <div className="police-header">
        <span>🚔</span>
        <b>Police</b>
        <button className={`police-refresh ${loading ? 'loading' : ''}`} aria-label="Refresh police reports" title="Refresh" disabled={loading} onClick={() => void loadPolice()}>
          ↻
        </button>
      </div>
      <div className="police-stats">
        <div><b>{catchChance}%</b><small>Arrest rate</small></div>
        <div><b>{laws.jailMinutes}m</b><small>Jail term</small></div>
        <div><b>{Math.round(POLICE.rewardPct * 100)}%</b><small>Officer reward</small></div>
        <div><b>{laws.finePct}%</b><small>Fine</small></div>
      </div>
      {error && <div className="civic-notice civic-error" role="alert">{error}</div>}

      <div className="tabs">
        <button className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>📋 Reports{against.length ? ` (${against.length})` : ''}</button>
        <button className={tab === 'wanted' ? 'on' : ''} onClick={() => setTab('wanted')}>🚨 Wanted{wanted.length ? ` (${wanted.length})` : ''}</button>
        <button className={tab === 'vdm' ? 'on' : ''} onClick={() => setTab('vdm')}>📢 Call VDM</button>
      </div>

      {tab === 'vdm' && (
        <>
          <div className="vdm-hero">
            <span>📢</span>
            <span>
              <b>Call VDM</b>
              <small>Police too slow? Tell VDM what they did to you. It’s free, but he gets plenty calls and only carries the matters he likes. If he posts it, the whole of Naija will see it on Twitter.</small>
            </span>
          </div>
          {!against.length && <div className="police-empty"><span>🤷🏾</span><b>Nothing to expose</b><small>Nobody has robbed you. Yet.</small></div>}
          {against.map((c) => {
            const mystery = unsolved(c) && c.status !== 'arrested';
            const waiting = !c.vdm && !!c.vdmAsked && now < c.vdmAsked + VDM.retryMs;
            return (
              <div className="tile police-case" key={c.id}>
                <span className="tile-icon">{c.vdm ? '✅' : c.armed ? '🔫' : c.kind === 'burglary' ? '🏚️' : '💸'}</span>
                <span className="tile-info">
                  <b>{mystery ? 'Unknown burglar' : `@${c.thief}`}</b>
                  <small>{what(c)} · {ago(c.at)}</small>
                  {c.vdm && <small>📢 VDM has exposed this on Twitter</small>}
                  {waiting && <small>📢 VDM heard you but hasn’t posted it. Try him again later.</small>}
                </span>
                {!c.vdm && (
                  <button className="btn sm danger" disabled={busy || waiting} onClick={() => void callVdm(c.id)}>
                    {waiting ? 'Told him' : c.vdmAsked ? 'Tell him again' : 'Tell VDM'}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === 'wanted' && (
      <>
      <h4>{officer ? '👮🏾 Most wanted · you’re on duty' : 'Most wanted'}</h4>
      {!wanted.length && <div className="police-empty"><span>🕊️</span><b>Nobody wanted</b><small>{officer ? 'When a victim reports a theft, the suspect shows up here.' : 'Join the force in Jobs to hunt thieves for a reward.'}</small></div>}
      {wanted.map((w) => {
        const hunter = officer || w.bounty > 0;
        const d = hunter ? distanceTo(w) : null;
        const reward = Math.max(POLICE.rewardMin, Math.round(w.amount * POLICE.rewardPct));
        return (
          <div className="tile police-case police-wanted" key={w.uid}>
            <span className="tile-icon">🚨</span>
            <span className="tile-info">
              <b><Face uid={w.uid} username={w.username} size="xs" />@{w.username}</b>
              <small>{w.cases} case{w.cases > 1 ? 's' : ''} · stole {naira(w.amount)}{officer ? ` · reward ~${naira(reward)}` : ''}</small>
              {w.bounty > 0 && <small>💰 {naira(w.bounty)} bounty · anyone can bring them in</small>}
              {hunter && <small>📍 {seenLabel(w)}{d !== null ? ` · ${d.toFixed(1)} tiles away` : ''}</small>}
              <small>NPC police take over in {clock(w.autoAt - now)}</small>
            </span>
            {hunter && (
              <button className="btn sm danger" disabled={busy || d === null || d > POLICE.arrestReach} title={d !== null && d <= POLICE.arrestReach ? 'Arrest' : 'Walk up to them first'} onClick={() => void arrestPlayer(w.uid, w.username)}>
                Arrest
              </button>
            )}
          </div>
        );
      })}

      {custody.length > 0 && (
        <>
          <h4>In custody</h4>
          {custody.map((p) => (
            <div className="tile police-case" key={p.uid}>
              <span className="tile-icon">⛓️</span>
              <span className="tile-info">
                <b><Face uid={p.uid} username={p.username} size="xs" />@{p.username}</b>
                <small>{clock(p.until - now)} left · bail {naira(bailFor(p.until, now))}</small>
              </span>
              {p.uid !== user.uid && (
                <button className="btn sm" disabled={busy} onClick={() => void payBail(p.uid, p.username)}>
                  Pay bail
                </button>
              )}
            </div>
          ))}
        </>
      )}
      </>
      )}

      {tab === 'reports' && (
      <>
      <h4>Reports · {laws.reportHours}h</h4>
      {loading && !against.length && <p className="muted small">Loading…</p>}
      {!loading && !against.length && <div className="police-empty"><span>🛡️</span><b>All clear</b><small>No reports against you</small></div>}
      {against.map((c) => {
        const open = c.status === 'open' && Date.now() - c.at < deadline;
        const mystery = unsolved(c);
        const canAccuse = open && mystery && !c.accused;
        const bountyOk = c.status === 'wanted' && money >= BOUNTY.min;
        return (
          <div className="tile police-case" key={c.id}>
            <span className="tile-icon">{c.armed ? '🔫' : c.kind === 'burglary' ? '🏚️' : '💸'}</span>
            <span className="tile-info">
              <b>{mystery && c.status !== 'arrested' ? 'Unknown burglar' : `@${c.thief}`}</b>
              <small>{what(c)} · {ago(c.at)}</small>
              {canAccuse && <small>🕵🏾 Nobody saw who did it. Name up to {ACCUSE.max} suspects: get it right and they’re arrested and you get it back.</small>}
              {mystery && c.accused && c.status === 'open' && <small>🤷🏾 You accused {c.accused.map((u) => `@${u}`).join(', ')}. None of them did it. Case gone cold.</small>}
              {c.recovered && c.item && <small>📦 Your {ITEMS[c.item]?.name ?? c.item} has been returned to you</small>}
              {c.guard === 'camera'
                ? <small>📹 CCTV identified @{c.thief} · file a report to send police after them</small>
                : c.guard && <small>{CATCHERS[c.guard].icon} Caught in the act by your {CATCHERS[c.guard].label.toLowerCase()}</small>}
              {c.status === 'wanted' && <small>🚨 Wanted · police are looking for them{c.bounty ? ` · ${naira(c.bounty)} bounty` : ''}</small>}
              {c.status === 'arrested' && <small>Arrested{c.officer ? ` by @${c.officer}` : ''} ✅{c.returned ? ` · ${naira(c.returned)} returned` : ''}</small>}
              {c.status === 'open' && !open && !c.accused && <small>Too late to report</small>}
            </span>
            {canAccuse && <AccuseButton id={c.id} disabled={busy} />}
            {open && !mystery && (
              <button className="btn sm danger" disabled={busy} onClick={() => void fileReport(c.id)}>
                File report
              </button>
            )}
            {c.status === 'wanted' && <BountyButton id={c.id} disabled={busy || !bountyOk} max={money} />}
          </div>
        );
      })}

      {by.length > 0 && (
        <>
          <h4>Your activity</h4>
          {by.map((c) => (
            <div className="tile police-case" key={c.id}>
              <span className="tile-icon">{c.status === 'arrested' ? '⛓️' : c.success ? '🥷' : '😬'}</span>
              <span className="tile-info">
                <b>Against @{c.victim}</b>
                <small>{what(c)} · {ago(c.at)}</small>
                <small>
                  {c.status === 'arrested'
                    ? `Arrested${c.officer ? ` by @${c.officer}` : ''}`
                    : c.status === 'wanted'
                      ? `🚨 ${c.guard ? 'Caught in the act' : 'Reported'} · you are wanted${c.bounty ? ` · ${naira(c.bounty)} on your head` : ''}`
                      : c.guard === 'camera' ? '📹 Identified on CCTV · the owner can file a report' : 'Unreported'}
                </small>
              </span>
            </div>
          ))}
        </>
      )}
      </>
      )}
    </div>
  );
}

/** Name up to ACCUSE.max players for a burglary nobody saw. One shot per case. */
function AccuseButton({ id, disabled }: { id: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[]>(['']);
  const [searches, setSearches] = useState<string[]>(['']);
  const [results, setResults] = useState<PlayerRef[][]>([[]]);
  const [searching, setSearching] = useState(false);
  // Per suspect box: the pending debounce timer and the latest text, so a slow reply for old text is dropped.
  const timers = useRef<Record<number, number>>({});
  const latest = useRef<Record<number, string>>({});
  const picked = [...new Set(names.map((n) => n.trim().replace(/^@/, '')).filter(Boolean))];
  if (!open) return <button className="btn sm danger" disabled={disabled} onClick={() => setOpen(true)}>🕵🏾 Accuse</button>;
  const addSuspect = () => {
    setNames([...names, '']);
    setSearches([...searches, '']);
    setResults([...results, []]);
  };
  const search = async (index: number, text: string) => {
    const query = text.trim().replace(/^@/, '');
    if (!query) return setResults((current) => current.map((list, i) => i === index ? [] : list));
    setSearching(true);
    try {
      const players = await searchPlayers(query);
      if (latest.current[index] !== text) return;
      setResults((current) => current.map((list, i) => i === index ? players : list));
    } catch (error) {
      useGame.getState().toast(error instanceof Error ? error.message : 'Could not search for that username');
    } finally {
      setSearching(false);
    }
  };
  const choose = (index: number, player: PlayerRef) => {
    setNames(names.map((name, i) => i === index ? player.username ?? '' : name));
    setSearches(searches.map((query, i) => i === index ? '' : query));
    setResults(results.map((list, i) => i === index ? [] : list));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!picked.length) return;
    if (!confirm(`Accuse ${picked.map((n) => `@${n}`).join(', ')}? You only get one try for this case.`)) return;
    void accuseSuspects(id, picked);
    setOpen(false);
  };
  return (
    <form className="police-accuse" onSubmit={submit}>
      {names.map((n, i) => (
        <div className="police-suspect" key={i}>
          <input
            value={searches[i] || n}
            maxLength={32}
            placeholder={`Search suspect ${i + 1} username`}
            aria-label={`Search suspect ${i + 1} username`}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => {
              const value = e.target.value;
              setSearches(searches.map((query, j) => j === i ? value : query));
              if (n) setNames(names.map((name, j) => j === i ? '' : name));
              setResults(results.map((list, j) => j === i ? [] : list));
              // Search as you type, like finding friends: no Find button.
              latest.current[i] = value;
              window.clearTimeout(timers.current[i]);
              timers.current[i] = window.setTimeout(() => void search(i, value), 250);
            }}
          />
          {searching && <small className="muted">Searching…</small>}
          {results[i]?.length > 0 && (
            <div className="police-suspect-results">
              {results[i].map((player) => (
                <button type="button" key={player.uid} onClick={() => choose(i, player)}>
                  <Face uid={player.uid} username={player.username} look={player.look} size="xs" />@{player.username ?? 'player'}{player.name ? ` · ${player.name}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="police-accuse-actions">
        {names.length < ACCUSE.max && <button type="button" className="btn sm ghost" onClick={addSuspect}>+ Suspect</button>}
        <button className="btn sm danger" disabled={disabled || !picked.length}>Accuse {picked.length || ''}</button>
        <button type="button" className="x" aria-label="Cancel" onClick={() => setOpen(false)}>×</button>
      </div>
    </form>
  );
}

/** Put (more) money on a wanted thief's head. */
function BountyButton({ id, disabled, max }: { id: number; disabled: boolean; max: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(BOUNTY.min * 2));
  const value = Math.floor(Number(amount) || 0);
  if (!open) return <button className="btn sm" disabled={disabled} onClick={() => setOpen(true)}>💰 Bounty</button>;
  return (
    <form className="police-bounty" onSubmit={(e) => { e.preventDefault(); void postBounty(id, value); setOpen(false); }}>
      <input type="number" inputMode="numeric" min={BOUNTY.min} max={Math.min(BOUNTY.max, max)} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Bounty amount" />
      <button className="btn sm danger" disabled={value < BOUNTY.min || value > Math.min(BOUNTY.max, max)}>Post</button>
      <button type="button" className="x" aria-label="Cancel" onClick={() => setOpen(false)}>×</button>
    </form>
  );
}

/** Panel over the prison while you're locked in: time left, bail, and asking someone to bail you out. */
export function Jail() {
  const until = useGame((s) => s.jailedUntil);
  const money = useGame((s) => s.money);
  const paying = usePolice((s) => s.busy);
  const now = useNow(!!until);
  const [asking, setAsking] = useState(false);
  const [details, setDetails] = useState(false);
  const hubOpen = useGame((s) => s.placeHubOpen);
  // A cell object (the toilet…) is selected: its action sheet opens in the same spot as this panel.
  const objectOpen = useGame((s) => s.mode === 'live' && !!s.selectedId);
  const search = useLive((s) => s.phoneSearch);
  const charge = usePolice((s) => s.jailCharge);
  const loading = usePolice((s) => s.loading);

  // However I ended up here (and whenever the stay gets longer), pull the charge sheet the police hold.
  useEffect(() => {
    if (until) void loadPolice();
  }, [until]);
  useEffect(() => {
    if (until && now >= until) {
      usePolice.setState({ jailedUntil: null, jailCharge: [] });
      useGame.getState().release();
      useGame.getState().toast('🔓 Time served. You have been released — behave yourself!');
    }
  }, [until, now]);
  if (!until || now >= until) return null;
  const bail = bailFor(until, now);
  if ((hubOpen || objectOpen) && !asking) {
    // The cell's activities are open: shrink to a strip at the top so nothing sits on top of them.
    return (
      <div className="jail-strip" role="status" aria-label="In prison">
        <span aria-hidden="true">⛓️</span>
        <b className="jail-timer" aria-label="Time left">{clock(until - now)}</b>
        <button className="btn sm" disabled={money < bail || paying} onClick={() => void payBail()}>{paying ? 'Paying…' : `🔓 Bail ${naira(bail)}`}</button>
        <button className="btn sm ghost" onClick={() => { useGame.getState().setPlaceHubOpen(false); useGame.getState().select(null); setAsking(true); }}>📨 Ask</button>
      </div>
    );
  }
  return (
    <div className="jail-panel" role="status" aria-label="In prison">
      <div className="jail-panel-head">
        <span className="jail-icon"><Icon name="break-in" size={20} /></span>
        <div>
          <b>{regionHere().prison}</b>
          <small>Locked in until your time is up or someone pays bail</small>
        </div>
        <div className="jail-timer" aria-label="Time left">{clock(until - now)}</div>
      </div>
      <button type="button" className="jail-more" aria-expanded={details} onClick={() => setDetails(!details)}>
        {details ? 'Hide charges ▴' : 'See charges ▾'}
      </button>
      {details && <ChargeCard lines={charge} loading={loading} />}
      {details && (search?.searched || search?.gun) && search.until && Math.abs(search.until - until) < 60_000 && <PhoneSearchCard search={search} />}
      {asking ? (
        <AskBail amount={bail} onClose={() => setAsking(false)} />
      ) : (
        <div className="jail-actions">
          <button className="btn" disabled={money < bail || paying} onClick={() => void payBail()}>
            {paying ? 'Paying bail…' : `🔓 Pay bail ${naira(bail)}`}
          </button>
          <button className="btn ghost" onClick={() => setAsking(true)}>
            📨 Ask for bail
          </button>
        </div>
      )}
      {!asking && money < bail && <small className="jail-note">You can’t afford bail. Ask a friend, or sit it out.</small>}
    </div>
  );
}

/** The offence(s) behind this arrest, laid out like the phone-search charge sheet. */
function ChargeCard({ lines, loading }: { lines: string[]; loading: boolean }) {
  return (
    <div className="charge-sheet bad">
      <div className="charge-head">
        <span>Charged with</span>
        <b>{lines.length > 1 ? `${lines.length} offences` : 'Arrested'}</b>
      </div>
      {(lines.length ? lines : [loading ? 'Fetching your charge sheet…' : 'Held in custody (the police didn’t record the charge)']).map((l) => (
        <div key={l} className="charge-row"><span>{l}</span></div>
      ))}
    </div>
  );
}

/** What the police or EFCC found on your phone, laid out like a charge sheet: one row per app, then the total. */
function PhoneSearchCard({ search }: { search: NonNullable<ReturnType<typeof useLive.getState>['phoneSearch']> }) {
  const found = search.found.length > 0 || !!search.gun;
  const who = search.agency === 'efcc' ? 'EFCC' : 'Police';
  const name = (id: string) => (PHONE_SEARCH.labels[id] ?? id).replace(/^the /, '');
  return (
    <div className={`charge-sheet ${found ? 'bad' : 'clean'}`} title={search.lines.join(' ')}>
      <div className="charge-head">
        <span>Phone search · {who}</span>
        <b>{found ? 'Evidence found' : 'Clean'}</b>
      </div>
      {found ? (
        <>
          {search.gun && (
            <div className="charge-row">
              <span>{GUNS[search.gun.gun]?.name ?? 'Gun'} · seized</span>
              <i />
              <b>+{naira(search.gun.fine)}</b>
            </div>
          )}
          {search.found.map((id) => (
            <div key={id} className="charge-row">
              <span>{name(id)}</span>
              <i />
              <b>+{naira(PHONE_SEARCH.evidence[id]?.[search.agency]?.fine ?? 0)}</b>
            </div>
          ))}
          <div className="charge-total">
            <span>Total</span>
            <b>+{naira(search.fine + (search.gun?.fine ?? 0))}{search.extraMinutes ? ` · +${search.extraMinutes} min` : ''}</b>
          </div>
        </>
      ) : (
        <div className="charge-row"><span>Nothing incriminating</span></div>
      )}
    </div>
  );
}

/** Send a money request (bail by default) to a contact or a player you look up. */
export function AskBail({ amount, onClose, message = `🚔 I’m in ${regionHere().prison}. Abeg help me with bail!`, note, what = 'bail' }: { amount: number; onClose: () => void; message?: string; note?: string; what?: string }) {
  const conversations = useSocial((s) => s.conversations);
  const online = useNet((s) => s.players);
  const me = useSession((s) => s.user?.uid);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PlayerRef[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Four people at most: a username search shows its matches, otherwise the friends you talk to most.
  const people = new Map<string, PlayerRef>();
  for (const p of found ?? []) people.set(p.uid, p);
  if (!found) {
    for (const c of conversations) people.set(c.uid, c);
    for (const p of Object.values(online)) people.set(p.id, { uid: p.id, username: p.username, name: p.name });
  }
  if (me) people.delete(me);

  // Search as you type, like finding friends: no Find button.
  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (!term) return setFound(null);
    let stale = false;
    const id = setTimeout(() => {
      searchPlayers(term).then((r) => { if (!stale) { setFound(r); setError(null); } }).catch(() => { if (!stale) setFound([]); });
    }, 250);
    return () => { stale = true; clearTimeout(id); };
  }, [q]);
  const ask = async (p: PlayerRef) => {
    setError(null);
    setSending(p.uid);
    try {
      await requestMoney(p.uid, amount, message);
      setSent((s) => new Set(s).add(p.uid));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="ask-sheet">
      <div className="ask-head">
        <div className="ask-head-text">
          <small>Ask a friend for {what}</small>
          <b>{naira(amount)}</b>
        </div>
        {sent.size > 0 && <span className="pay-chip wait">Asked {sent.size} · waiting</span>}
        <button className="ask-x" type="button" onClick={onClose} aria-label="Back">✕</button>
      </div>
      <form className="ask-search" onSubmit={(e: FormEvent) => e.preventDefault()}>
        <span aria-hidden>@</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username" aria-label="Search by username" autoCapitalize="none" autoCorrect="off" />
      </form>
      {error && <small className="jail-note jail-error">{error}</small>}
      <div className="ask-people">
        {[...people.values()].slice(0, 4).map((p) => {
          const done = sent.has(p.uid);
          return (
            <button key={p.uid} className={`ask-person ${done ? 'done' : ''}`} disabled={done || sending !== null} onClick={() => void ask(p)}>
              <span className={`ask-avatar ${online[p.uid] ? 'on' : ''}`}><Face uid={p.uid} username={p.username} look={p.look} size="fill" /></span>
              <span className="ask-name">
                <b>@{p.username ?? 'player'}</b>
                <small>{online[p.uid] ? 'Online' : 'Offline'}</small>
              </span>
              <i aria-label={done ? 'Asked' : undefined}>{done ? '✓' : sending === p.uid ? '…' : 'Ask'}</i>
            </button>
          );
        })}
        {!people.size && <small className="jail-note">{found ? 'No player with that username.' : 'No contacts yet. Search by username.'}</small>}
      </div>
      <small className="jail-note">{note ?? `They get a request for ${naira(amount)}. Once it lands, tap “Pay bail”. Anyone can also bail you from their Police app.`}</small>
    </div>
  );
}

/** A banner while there's a warrant out for you. On phones it shrinks to a chip after a few seconds; tap to read it again. */
export function WantedBanner() {
  const by = usePolice((s) => s.by);
  const jailed = useGame((s) => s.jailedUntil);
  const hunt = myManhunt(by);
  const now = useNow(!!hunt);
  const cases = hunt?.cases ?? 0;
  const [open, setOpen] = useState(true);
  // A fresh warrant (or another report on top) opens it back up.
  useEffect(() => {
    if (cases) setOpen(true);
  }, [cases]);
  useEffect(() => {
    if (!open || !cases) return;
    const id = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(id);
  }, [open, cases]);
  if (!hunt || jailed) return null;
  const left = clock(hunt.autoAt - now);
  return (
    <div className={`wanted-banner ${open ? '' : 'min'}`} role="alert" onClick={() => setOpen((o) => !o)}>
      <b>🚨 WANTED</b>
      <i>{left}</i>
      <span>
        {hunt.cases} report{hunt.cases > 1 ? 's' : ''} against you. Officers can arrest you on sight. NPC police come for you in {left}.
      </span>
    </div>
  );
}
