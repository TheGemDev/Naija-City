// Phone apps for the dark side of Kaduna: Plug (drugs), Fixer (protection rackets, hit and kidnap
// contracts, ransoms, jail hustles) and Dirty Work (forgery, fake naira, bunkering, pirate radio, betting
// shop). Plus the kidnap screen and the police stop when you drive high. Rules: src/game/vice.ts.

import { useEffect, useState, type ReactNode } from 'react';
import { naira, useGame } from '../game/store';
import { CRIME_TIERS, crimeTier, nextCrimeTier } from '../game/underworld';
import { CELL, CONTRACT, DUI, GOODS, GOOD_BY_ID, OPS, PLUG, RACKET, SWEEP, type GoodId } from '../game/vice';
import { useSession } from '../net/session';
import { searchPlayers, type PlayerRef } from '../net/social';
import {
  answerDui, answerOffer, answerRacket, assistBreakout, bribeGuard, buyGood, buyListing, cancelBreakout, cancelContract, cancelListing,
  collectOp, demandRacket, dropContract, endRacket, listGood, loadPlug, loadStreets, loadViceMe, makeOffer, pledgeRansom, postBreakout,
  postContract, reportRacket, rescue, sellGood, sellInside, startOp, strikeContract, struggle, takeContract, consumeGood, useVice,
} from '../net/vice';
import { AskBail } from './Police';
import { Emoji, Icon } from './Icons';
import './vice.css';
import { Face } from './Face';

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
  const m = Math.floor((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
};

function useSignedIn() {
  return !!useSession((s) => s.user?.username);
}

/** Poll one loader while the app is open. */
function usePoll(load: () => unknown, ms: number) {
  const on = useSignedIn();
  useEffect(() => {
    if (!on) return;
    void load();
    const id = setInterval(() => void load(), ms);
    return () => clearInterval(id);
  }, [on, load, ms]);
}

const Err = () => {
  const error = useVice((s) => s.error);
  return error ? <div className="civic-notice civic-error" role="alert">{error}</div> : null;
};

const NotSignedIn = () => <p className="muted">Sign in with a username to use this app.</p>;

/* ===================================================== Plug ===================================================== */

export function PlugApp() {
  const signedIn = useSignedIn();
  const plug = useVice((s) => s.plug);
  const busy = useVice((s) => s.busy);
  const money = useGame((s) => s.money);
  const view = useGame((s) => s.view);
  const jailed = !!useGame((s) => s.jailedUntil);
  const [tab, setTab] = useState<'shop' | 'stash' | 'market'>('shop');
  const now = useNow();
  usePoll(loadPlug, 15_000);
  if (!signedIn) return <NotSignedIn />;
  const high = plug?.highUntil && plug.highUntil > now ? plug.highUntil : null;
  const carrying = plug ? GOODS.reduce((a, g) => a + (plug.stash[g.id] ?? 0), 0) : 0;
  return (
    <>
      <div className="hero hero-dark">
        <small>{high ? `😵‍💫 High for ${mmss(high - now)}. Do NOT drive.` : 'Delivery only. Discreet.'}</small>
        <b>🌿 Plug</b>
        <small>Carrying {carrying}/{PLUG.stashTotalCap} · police sweep phones every few minutes</small>
      </div>
      <div className="civic-notice">
        Having this app is a risk by itself: police check phones about every {Math.round(SWEEP.everyMs / 60_000)} minutes, and more often if you’re carrying or high. Get caught and the stash is gone, plus a fine and a cell. Drive high and you’ll be pulled over.
      </div>
      <Err />
      <div className="tabs">
        <button className={tab === 'shop' ? 'on' : ''} onClick={() => setTab('shop')}>🛒 Shop</button>
        <button className={tab === 'stash' ? 'on' : ''} onClick={() => setTab('stash')}>🎒 Stash</button>
        <button className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}>🤝 Market</button>
      </div>
      {!plug && <p className="muted">Calling the plug…</p>}
      {plug && tab === 'shop' && (
        <>
          <h4>Today’s prices</h4>
          {GOODS.map((g) => {
            const p = plug.prices[g.id];
            const trend = p.mult > 1.12 ? '📈 pricey' : p.mult < 0.88 ? '📉 cheap today' : 'normal';
            return (
              <div key={g.id} className="tile">
                <span className="tile-icon">{g.icon}</span>
                <span className="tile-info">
                  <b>{g.name} · {naira(p.plug)}</b>
                  <small>{g.blurb} High lasts ~{g.highMin} min · {trend}</small>
                </span>
                <span className="row-btns">
                  {[1, 3, 5].map((n) => (
                    <button key={n} className="btn sm" disabled={busy || money < p.plug * n} onClick={() => void buyGood(g.id, n)}>×{n}</button>
                  ))}
                </span>
              </div>
            );
          })}
          <small className="muted">The plug can short you (about {Math.round(PLUG.rippedChance * 100)}% of the time). Prices move every {PLUG.slotMs / 60_000} minutes for the whole city.</small>
        </>
      )}
      {plug && tab === 'stash' && (
        <>
          {carrying === 0 && <p className="muted">Your pockets are clean. Suspiciously clean.</p>}
          {GOODS.filter((g) => plug.stash[g.id] > 0).map((g) => (
            <StashCard key={g.id} good={g.id} qty={plug.stash[g.id]} street={plug.prices[g.id].street} busy={busy} inCell={jailed} />
          ))}
        </>
      )}
      {plug && tab === 'market' && (
        <>
          <h4>Open ads</h4>
          {plug.listings.filter((l) => !l.mine).length === 0 && <p className="muted">Nobody is selling right now.</p>}
          {plug.listings.filter((l) => !l.mine).map((l) => (
            <div key={l.id} className="tile">
              <span className="tile-icon">{GOOD_BY_ID[l.good].icon}</span>
              <span className="tile-info">
                <b>{l.qty} × {GOOD_BY_ID[l.good].name}</b>
                <small>@{l.seller} · {naira(l.price)} each · {ago(l.at)}</small>
              </span>
              <button className="btn sm" disabled={busy || money < l.price * l.qty} onClick={() => void buyListing(l.id)}>{naira(l.price * l.qty)}</button>
            </div>
          ))}
          {plug.mine.length > 0 && <h4>My ads</h4>}
          {plug.mine.map((l) => (
            <div key={l.id} className="tile">
              <span className="tile-icon">{GOOD_BY_ID[l.good].icon}</span>
              <span className="tile-info"><b>{l.qty} × {GOOD_BY_ID[l.good].name}</b><small>{naira(l.price)} each</small></span>
              <button className="btn sm danger" disabled={busy} onClick={() => void cancelListing(l.id)}>Take down</button>
            </div>
          ))}
          {plug.offersIn.length > 0 && <h4>Offers to you</h4>}
          {plug.offersIn.map((o) => (
            <div key={o.id} className="tile">
              <span className="tile-icon">{GOOD_BY_ID[o.good].icon}</span>
              <span className="tile-info"><b>@{o.other}: {o.qty} × {GOOD_BY_ID[o.good].name}</b><small>for {naira(o.price)}</small></span>
              <span className="row-btns">
                <button className="btn sm" disabled={busy || money < o.price} onClick={() => void answerOffer(o.id, true)}>Take</button>
                <button className="btn sm danger" disabled={busy} onClick={() => void answerOffer(o.id, false)}>No</button>
              </span>
            </div>
          ))}
          {plug.offersOut.length > 0 && <h4>Your offers</h4>}
          {plug.offersOut.map((o) => (
            <div key={o.id} className="tile">
              <span className="tile-icon">{GOOD_BY_ID[o.good].icon}</span>
              <span className="tile-info"><b>To @{o.other}: {o.qty} × {GOOD_BY_ID[o.good].name}</b><small>{naira(o.price)}</small></span>
              <button className="btn sm danger" disabled={busy} onClick={() => void answerOffer(o.id, 'cancel')}>Cancel</button>
            </div>
          ))}
          <OfferForm busy={busy} stash={plug.stash} />
          {view === 'place' && jailed && <small className="muted">In a cell, a direct offer to a cellmate is the quietest way to trade.</small>}
        </>
      )}
    </>
  );
}

function StashCard({ good, qty, street, busy, inCell }: { good: GoodId; qty: number; street: number; busy: boolean; inCell: boolean }) {
  const g = GOOD_BY_ID[good];
  const [price, setPrice] = useState(String(street));
  const [open, setOpen] = useState(false);
  return (
    <div className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
      <b>{g.icon} {g.name} × {qty}</b>
      <small className="muted">Street price {naira(street)} each{inCell ? ` · inside, inmates pay ${naira(Math.round(street * CELL.insideMarkup))}` : ''}</small>
      <div className="row-btns">
        <button className="btn sm go" disabled={busy} onClick={() => void consumeGood(good)}>😮‍💨 Use (~{g.highMin} min)</button>
        <button className="btn sm" disabled={busy || inCell} onClick={() => void sellGood(good, 1)}>Sell 1</button>
        <button className="btn sm" disabled={busy || inCell} onClick={() => void sellGood(good, qty)}>Sell all</button>
        {inCell && <button className="btn sm danger" disabled={busy} onClick={() => void sellInside(good, qty)}>Sell inside (all)</button>}
        <button className="ghost-btn" onClick={() => setOpen(!open)}>📢 Ad</button>
      </div>
      {open && (
        <div className="row-btns">
          <input className="text-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} aria-label="Price each" />
          <button className="btn sm" disabled={busy || !Number(price)} onClick={() => void listGood(good, qty, Number(price))}>List all {qty} · fee {naira(PLUG.adFee)}</button>
        </div>
      )}
      <small className="muted">Street sales risk an undercover officer. Selling to a named player or an ad is safer.</small>
    </div>
  );
}

function OfferForm({ busy, stash }: { busy: boolean; stash: Record<GoodId, number> }) {
  const [to, setTo] = useState('');
  const owned = GOODS.filter((g) => stash[g.id] > 0);
  const [good, setGood] = useState<GoodId>(owned[0]?.id ?? 'cana');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('5000');
  if (!owned.length) return null;
  return (
    <div className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
      <b>🤫 Private offer</b>
      <input className="text-input" placeholder="@username" value={to} onChange={(e) => setTo(e.target.value)} />
      <div className="row-btns">
        <select className="text-input" value={good} onChange={(e) => setGood(e.target.value as GoodId)}>
          {owned.map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name} ({stash[g.id]})</option>)}
        </select>
        <input className="text-input" inputMode="numeric" style={{ width: 56 }} value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} aria-label="Quantity" />
        <input className="text-input" inputMode="numeric" style={{ width: 90 }} value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} aria-label="Price" />
      </div>
      <button className="btn sm" disabled={busy || !to.trim() || !Number(qty)} onClick={() => void makeOffer(to, good, Number(qty), Number(price))}>Send offer</button>
    </div>
  );
}

/** @username box that searches as you type (like New chat in Messages): tap a result to pick it, no Find button. */
function UserPick({ value, onChange, placeholder = 'Search username' }: { value: string; onChange: (username: string) => void; placeholder?: string }) {
  const [results, setResults] = useState<PlayerRef[]>([]);
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    const term = value.trim().replace(/^@/, '');
    if (!term || picked) return setResults([]);
    let live = true;
    const id = setTimeout(() => searchPlayers(term).then((r) => live && setResults(r)).catch(() => live && setResults([])), 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [value, picked]);
  const term = value.trim().replace(/^@/, '');
  return (
    <div className="user-pick">
      <div className="at-input msg-search">
        <span>@</span>
        <input
          value={value.replace(/^@/, '')}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(e) => {
            setPicked(false);
            onChange(e.target.value.replace(/^@/, '').toLowerCase());
          }}
        />
      </div>
      {results.length > 0 && (
        <div className="list-card">
          {results.map((p) => (
            <button
              key={p.uid}
              className="convo"
              onClick={() => {
                setPicked(true);
                setResults([]);
                onChange(p.username ?? '');
              }}
            >
              <Face uid={p.uid} username={p.username} look={p.look} />
              <span className="convo-body">
                <b>@{p.username}</b>
                {p.name && <small>{p.name}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
      {term && !picked && results.length === 0 && <small className="muted">Searching… no match yet</small>}
    </div>
  );
}

/* ==================================================== Fixer ==================================================== */

type FixerTab = 'protection' | 'contracts' | 'ransoms' | 'cell';

/** A Fixer card: an icon tile, a title with an optional pill, a line under it, and whatever the card does below. */
function FxCard({ icon, title, pill, tone, sub, children }: {
  icon: string;
  title: ReactNode;
  pill?: ReactNode;
  /** alert: something wants your answer. good: it went your way. mine: your own job. */
  tone?: 'alert' | 'good' | 'mine';
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`fx-card ${tone ?? ''}`}>
      <span className="fx-card-icon"><Emoji char={icon} size={22} /></span>
      <div className="fx-card-body">
        <div className="fx-card-head"><b>{title}</b>{pill !== undefined && <em className="fx-pill">{pill}</em>}</div>
        {sub && <small>{sub}</small>}
        {children}
      </div>
    </div>
  );
}

/** The rules of a tab, folded away so they don't push everything else down. */
function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <details className="fx-how">
      <summary>How it works</summary>
      <p>{children}</p>
    </details>
  );
}

function Section({ title, count, extra }: { title: string; count?: number; extra?: ReactNode }) {
  return <h4 className="fx-h">{title}{!!count && <i>{count}</i>}{extra && <small>{extra}</small>}</h4>;
}

/** One choice out of a few, as a row of segments. */
function Seg<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange(v: T): void; label: string }) {
  return (
    <div className="fx-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={value === o.value ? 'on' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** How far a ransom has got. */
function Progress({ part, whole }: { part: number; whole: number }) {
  return <div className="fx-bar" aria-hidden><i style={{ width: `${Math.min(100, (part / Math.max(1, whole)) * 100)}%` }} /></div>;
}

const short = (n: number) => (n >= 1_000_000 ? `₦${+(n / 1_000_000).toFixed(1)}m` : n >= 1_000 ? `₦${Math.round(n / 1_000)}k` : naira(n));

export function FixerApp() {
  const signedIn = useSignedIn();
  const streets = useVice((s) => s.streets);
  const me = useVice((s) => s.me);
  const busy = useVice((s) => s.busy);
  const [tab, setTab] = useState<FixerTab>('protection');
  usePoll(loadStreets, 10_000);
  if (!signedIn) return <NotSignedIn />;
  const s = streets;
  // What wants your attention on each tab: a number on its chip, red when it is about you.
  const tabs: { id: FixerTab; label: string; count: number; alert: boolean }[] = [
    { id: 'protection', label: 'Racket', count: s?.rackets.asPayer.filter((r) => r.status === 'demanded').length ?? 0, alert: true },
    { id: 'contracts', label: 'Jobs', count: s?.contracts.taking.length ?? 0, alert: false },
    { id: 'ransoms', label: 'Ransom', count: (s?.contracts.ransoms.length ?? 0) + (me.ransom ? 1 : 0), alert: !!me.ransom || !!s?.contracts.ransoms.some((r) => r.friend) },
    { id: 'cell', label: 'Cell', count: s?.cell.jailed ? 1 : s?.cell.breakouts.length ?? 0, alert: !!s?.cell.jailed },
  ];
  return (
    <>
      <FixerHero />
      <Err />
      <div className="fx-tabs" role="tablist" aria-label="Fixer">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
            {t.count > 0 && <i className={t.alert ? 'alert' : ''}>{t.count}</i>}
          </button>
        ))}
      </div>
      {!s && <p className="muted">Loading…</p>}
      {s && tab === 'protection' && <Protection busy={busy} />}
      {s && tab === 'contracts' && <Contracts busy={busy} />}
      {s && tab === 'ransoms' && <Ransoms busy={busy} />}
      {s && tab === 'cell' && <Cell busy={busy} />}
    </>
  );
}

/** Who you are on the street: your tier, how far to the next, and what your business is bringing in. */
function FixerHero() {
  const s = useVice((st) => st.streets);
  if (!s) return <div className="hero hero-dark fx-hero"><b>🕴🏾 Fixer</b><small>Loading…</small></div>;
  const tier = crimeTier(s.score);
  const next = nextCrimeTier(s.score);
  const progress = next ? ((s.score - tier.min) / (next.min - tier.min)) * 100 : 100;
  const running = s.rackets.asBoss.filter((r) => r.status === 'active');
  const collected = s.rackets.asBoss.reduce((n, r) => n + r.paidTotal, 0);
  return (
    <div className="hero hero-dark fx-hero">
      <div className="fx-hero-top">
        <span className="fx-hero-badge"><Emoji char={tier.icon} size={28} /></span>
        <span className="fx-hero-who">
          <small>Fixer · your street name</small>
          <b>{tier.title}</b>
        </span>
        <em>{+s.score.toFixed(1)}<small>crime score</small></em>
      </div>
      <div className="fx-hero-bar" aria-hidden><i style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} /></div>
      <small className="fx-hero-next">{next ? `${+(next.min - s.score).toFixed(1)} more to ${next.icon} ${next.title}` : 'Top of the food chain. Nobody above you.'}</small>
      <div className="fx-hero-stats">
        <span><b>{running.length}/{RACKET.maxVictims}</b><small>paying you</small></span>
        <span><b>{short(collected)}</b><small>collected</small></span>
        <span><b>{s.contracts.taking.length}</b><small>jobs on you</small></span>
      </div>
    </div>
  );
}

function Protection({ busy }: { busy: boolean }) {
  const s = useVice((st) => st.streets)!;
  const money = useGame((st) => st.money);
  const [target, setTarget] = useState('');
  const [fee, setFee] = useState<number>(RACKET.fees[1]);
  const [rival, setRival] = useState('');
  // The racket whose payer is choosing a rival gang to hire.
  const [hiring, setHiring] = useState<number | null>(null);
  const now = useNow(5000);
  const week = Math.round(RACKET.periodMs / 60_000);
  const need = CRIME_TIERS.find((t) => t.id === RACKET.tier)!;
  const allowed = s.score >= need.min;
  const full = s.rackets.asBoss.length >= RACKET.maxVictims;
  return (
    <>
      <HowItWorks>
        “Protection” is a weekly fee: one game week is about {Math.floor(week / 60)}h {week % 60}m of real time. {need.title}s and above can demand it from anyone.
        Whoever is asked can pay, refuse (and get leaned on for {Math.round(RACKET.leanPct * 100)}% of the fee), hire a rival gang, or call the police.
        Miss {RACKET.maxStrikes} payments in a row and the boys visit. Every collection risks a police raid.
      </HowItWorks>

      {s.rackets.asPayer.length > 0 && <Section title="Leaning on you" count={s.rackets.asPayer.length} />}
      {s.rackets.asPayer.map((r) => (
        <FxCard
          key={r.id}
          icon={r.status === 'protected' ? '🛡️' : '🕴🏾'}
          tone={r.status === 'demanded' ? 'alert' : r.status === 'protected' ? 'good' : undefined}
          title={`@${r.other}`}
          pill={`${short(r.fee)}/week`}
          sub={
            r.status === 'demanded' ? 'Wants paying to “keep your shop safe”.'
            : r.status === 'protected' ? `@${r.protector} has your back this week.`
            : `Paid ${naira(r.paidTotal)} so far · next in ${r.nextDue ? mmss(r.nextDue - now) : '?'}${r.strikes ? ` · ${r.strikes} missed` : ''}`
          }
        >
          {r.status === 'demanded' && (
            <>
              <div className="fx-actions">
                <button className="btn sm go" disabled={busy || money < r.fee} onClick={() => void answerRacket(r.id, 'pay')}>Pay {short(r.fee)}</button>
                <button className="btn sm danger" disabled={busy} onClick={() => void answerRacket(r.id, 'refuse')}>Refuse</button>
                <button className="btn sm" disabled={busy} onClick={() => void reportRacket(r.id)}><Emoji char="🚔" size={14} /> Report</button>
              </div>
              {hiring === r.id ? (
                <div className="fx-form">
                  <UserPick placeholder="Rival gang boss" value={rival} onChange={setRival} />
                  <div className="fx-actions">
                    <button className="btn sm" disabled={busy || !rival.trim() || money < r.fee} onClick={() => void answerRacket(r.id, 'hire', rival)}><Emoji char="⚔️" size={14} /> Hire for {short(r.fee)}</button>
                    <button className="ghost-btn" onClick={() => setHiring(null)}>Cancel</button>
                  </div>
                  <small className="fx-note">The gang with the higher crime score wins.</small>
                </div>
              ) : (
                <button className="fx-link" onClick={() => setHiring(r.id)}><Emoji char="⚔️" size={13} /> Hire a rival gang instead</button>
              )}
            </>
          )}
          {r.status === 'active' && (
            <div className="fx-actions">
              <button className="btn sm danger" disabled={busy} onClick={() => void endRacket(r.id)}>Stop paying · {short(Math.round(r.fee * 1.5))} exit</button>
              <button className="btn sm" disabled={busy} onClick={() => void reportRacket(r.id)}><Emoji char="🚔" size={14} /> Report</button>
            </div>
          )}
        </FxCard>
      ))}

      <Section title="Your racket" extra={`${s.rackets.asBoss.length} of ${RACKET.maxVictims}`} />
      {allowed ? (
        <div className="fx-form fx-panel">
          <UserPick placeholder="Who needs “protecting”?" value={target} onChange={setTarget} />
          <Seg<number> label="Weekly fee" value={fee} onChange={setFee} options={RACKET.fees.map((f) => ({ value: f, label: short(f) }))} />
          <button className="btn danger" disabled={busy || full || !target.trim()} onClick={() => void demandRacket(target, fee)}>
            {full ? `Your books are full (${RACKET.maxVictims})` : `Send the boys · ${short(fee)} a week`}
          </button>
        </div>
      ) : (
        <FxCard icon="🔒" title={`Reach ${need.icon} ${need.title} first`} sub={`You need a crime score of ${need.min} to run a racket. You have ${+s.score.toFixed(1)}.`} />
      )}
      {s.rackets.asBoss.map((r) => (
        <FxCard
          key={r.id}
          icon="💰"
          tone="mine"
          title={`@${r.other}`}
          pill={`${short(r.fee)}/week`}
          sub={r.status === 'demanded' ? 'Waiting for an answer…' : `Collected ${naira(r.paidTotal)} · next ${r.nextDue ? mmss(r.nextDue - now) : '?'}${r.strikes ? ` · ${r.strikes} missed` : ''}`}
        >
          {r.status === 'active' && <div className="fx-actions"><button className="btn sm" disabled={busy} onClick={() => void endRacket(r.id)}>Let them go</button></div>}
        </FxCard>
      ))}
    </>
  );
}

const KIND = { hit: { icon: '🥊', label: 'Hit' }, kidnap: { icon: '🪢', label: 'Kidnap' } } as const;
const STATUS: Record<string, string> = { open: 'On the board', taken: 'Someone took it', ransom: 'Hostage held' };

function Contracts({ busy }: { busy: boolean }) {
  const s = useVice((st) => st.streets)!;
  const money = useGame((st) => st.money);
  const [kind, setKind] = useState<'hit' | 'kidnap'>('hit');
  const [target, setTarget] = useState('');
  const [reward, setReward] = useState('50000');
  const [ransom, setRansom] = useState<number>(CONTRACT.ransoms[1]);
  const c = s.contracts;
  const myUser = useSession((st) => st.user?.username);
  const cut = (n: number) => Math.round(n * (1 - CONTRACT.cutPct));
  const amount = Number(reward) || 0;
  const min = CONTRACT.minReward[kind];
  const quick = [min, 50_000, 100_000, 250_000, CONTRACT.maxReward].filter((n, i, a) => n >= min && a.indexOf(n) === i);
  const why = !target.trim() ? 'Pick a target' : amount < min ? `At least ${short(min)}` : amount > CONTRACT.maxReward ? `At most ${short(CONTRACT.maxReward)}` : money < amount ? 'Not enough cash' : null;
  return (
    <>
      <HowItWorks>
        Post a job and the reward is held until someone does it. The taker has to find the target in person and strike from close by.
        A hit puts them in hospital. A kidnap holds them for {CONTRACT.holdMs / 60_000} minutes while their friends raise the ransom. Police can raid a kidnapper’s den.
        The server keeps {Math.round(CONTRACT.cutPct * 100)}%. Untaken jobs lapse after {CONTRACT.expiresMs / 3_600_000} hours and you are refunded.
      </HowItWorks>

      {c.taking.length > 0 && <Section title="Your jobs" count={c.taking.length} />}
      {c.taking.map((j) => (
        <FxCard
          key={j.id}
          icon={KIND[j.kind].icon}
          tone="mine"
          title={`${KIND[j.kind].label} @${j.target}`}
          pill={short(cut(j.reward))}
          sub={j.status === 'ransom' ? `Hostage held · ransom ${naira(j.pledged)} of ${naira(j.ransom)}` : 'Find them in the game, stand right next to them, then strike.'}
        >
          {j.status === 'ransom' && <Progress part={j.pledged} whole={j.ransom} />}
          {j.status === 'taken' && (
            <div className="fx-actions">
              <button className="btn sm danger" disabled={busy} onClick={() => void strikeContract(j.id)}>Strike</button>
              <button className="btn sm" disabled={busy} onClick={() => void dropContract(j.id)}>Drop the job</button>
            </div>
          )}
        </FxCard>
      ))}

      <Section title="Job board" count={c.open.length} />
      {c.open.length === 0 && <p className="fx-empty">No jobs right now. Check back later.</p>}
      {c.open.map((j) => (
        <FxCard
          key={j.id}
          icon={KIND[j.kind].icon}
          title={`${KIND[j.kind].label} @${j.target}`}
          pill={short(cut(j.reward))}
          sub={`${j.kind === 'kidnap' ? `Plus a ${short(j.ransom)} ransom · ` : ''}posted ${ago(j.at)}`}
        >
          <div className="fx-actions">
            <button className="btn sm" disabled={busy || j.target === myUser} onClick={() => void takeContract(j.id)}>{j.target === myUser ? 'That’s you' : 'Take the job'}</button>
          </div>
        </FxCard>
      ))}

      <Section title="Post a contract" />
      <div className="fx-form fx-panel">
        <Seg<"hit" | "kidnap"> label="Kind of job" value={kind} onChange={setKind} options={(['hit', 'kidnap'] as const).map((k) => ({ value: k, label: <><Emoji char={KIND[k].icon} size={14} /> {KIND[k].label}</> }))} />
        <UserPick placeholder="Target" value={target} onChange={setTarget} />
        <label className="fx-field">
          <span>Reward</span>
          <input className="text-input" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value.replace(/\D/g, ''))} aria-label="Reward" />
        </label>
        <div className="fx-chips">
          {quick.map((n) => <button key={n} type="button" className={amount === n ? 'on' : ''} onClick={() => setReward(String(n))}>{short(n)}</button>)}
        </div>
        {kind === 'kidnap' && (
          <label className="fx-field">
            <span>Ransom</span>
            <Seg<number> label="Ransom" value={ransom} onChange={setRansom} options={CONTRACT.ransoms.map((r) => ({ value: r, label: short(r) }))} />
          </label>
        )}
        <small className="fx-note">You pay {naira(amount)} now. Whoever does it gets {naira(cut(amount))}{kind === 'kidnap' ? ' plus the ransom' : ''}.</small>
        <button className="btn danger" disabled={busy || !!why} onClick={() => void postContract(kind, target, amount, kind === 'kidnap' ? ransom : undefined)}>
          {why ?? `Post the ${KIND[kind].label.toLowerCase()} · ${short(amount)}`}
        </button>
      </div>

      {c.mine.length > 0 && <Section title="Contracts you posted" count={c.mine.length} />}
      {c.mine.map((j) => (
        <FxCard key={j.id} icon={KIND[j.kind].icon} title={`${KIND[j.kind].label} @${j.target}`} pill={STATUS[j.status] ?? j.status} sub={`${naira(j.reward)} held · ${ago(j.at)}`}>
          {j.status === 'open' && <div className="fx-actions"><button className="btn sm" disabled={busy} onClick={() => void cancelContract(j.id)}>Cancel and refund</button></div>}
        </FxCard>
      ))}
    </>
  );
}

function Ransoms({ busy }: { busy: boolean }) {
  const s = useVice((st) => st.streets)!;
  const me = useVice((st) => st.me);
  const money = useGame((st) => st.money);
  const officer = useGame((st) => st.jobId === 'police');
  const now = useNow();
  const [amount, setAmount] = useState(10_000);
  const list = s.contracts.ransoms;
  return (
    <>
      <HowItWorks>
        When somebody is kidnapped, their ransom is crowdfunded. Chip in whatever you can. If it isn’t met in time, everyone is refunded and the victim is dumped by the road.
      </HowItWorks>
      {me.ransom && (
        <FxCard icon="🆘" tone="alert" title="You are being held" pill={mmss(me.ransom.endsAt - now)} sub={`Ransom ${naira(me.ransom.pledged)} of ${naira(me.ransom.amount)}`}>
          <Progress part={me.ransom.pledged} whole={me.ransom.amount} />
        </FxCard>
      )}
      <Section title="Held right now" count={list.length} />
      {list.length === 0 && <p className="fx-empty">Nobody is being held. The streets are calm. For now.</p>}
      {list.length > 0 && (
        <div className="fx-chips" role="group" aria-label="How much to chip in">
          <small>Chip in:</small>
          {[5_000, 10_000, 50_000, 100_000].map((n) => <button key={n} type="button" className={amount === n ? 'on' : ''} onClick={() => setAmount(n)}>{short(n)}</button>)}
        </div>
      )}
      {list.map((j) => (
        <FxCard key={j.id} icon="🆘" tone={j.friend ? 'alert' : undefined} title={`@${j.target}${j.friend ? ' · your friend' : ''}`} pill={j.holdEnds ? mmss(j.holdEnds - now) : undefined} sub={`${naira(j.pledged)} of ${naira(j.ransom)} raised`}>
          <Progress part={j.pledged} whole={j.ransom} />
          <div className="fx-actions">
            <button className="btn sm go" disabled={busy || money < amount} onClick={() => void pledgeRansom(j.id, amount)}><Emoji char="🙏🏾" size={14} /> Chip in {short(amount)}</button>
            {officer && <button className="btn sm danger" disabled={busy} onClick={() => void rescue(j.id)}><Emoji char="🚔" size={14} /> Raid the den</button>}
          </div>
        </FxCard>
      ))}
    </>
  );
}

function Cell({ busy }: { busy: boolean }) {
  const s = useVice((st) => st.streets)!;
  const money = useGame((st) => st.money);
  const plug = useVice((st) => st.plug);
  const [price, setPrice] = useState('50000');
  const now = useNow();
  const cell = s.cell;
  const stashed = plug ? GOODS.filter((g) => plug.stash[g.id] > 0) : [];
  return (
    <>
      {cell.jailed ? (
        <>
          <div className="fx-jail">
            <Emoji char="⛓️" size={26} />
            <span><small>You’re inside for</small><b>{mmss((cell.jailedUntil ?? now) - now)}</b></span>
          </div>
          <FxCard icon="🔑" title="Bribe a guard" pill={short(cell.bribeCost ?? 0)} sub={`Cuts ${Math.round(CELL.cutPct * 100)}% off what’s left. ${Math.round(CELL.snitchChance * 100)}% of guards snitch: more time and a fine.`}>
            <div className="fx-actions"><button className="btn sm danger" disabled={busy || money < (cell.bribeCost ?? 0)} onClick={() => void bribeGuard()}>Slide the envelope</button></div>
          </FxCard>
          <FxCard icon="📞" title="Plan a jailbreak" sub="Name a price. Any free player can take the job, and you only pay if it works.">
            <div className="fx-chips">
              {[CELL.breakoutMin, 50_000, 100_000, 250_000].map((n) => <button key={n} type="button" className={Number(price) === n ? 'on' : ''} onClick={() => setPrice(String(n))}>{short(n)}</button>)}
            </div>
            <div className="fx-actions">
              <input className="text-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} aria-label="Price" />
              <button className="btn sm" disabled={busy || Number(price) < CELL.breakoutMin} onClick={() => void postBreakout(Number(price))}>Put the word out</button>
            </div>
          </FxCard>
          {stashed.length > 0 && <small className="fx-note">Got stash on you? Open Plug → Stash and sell inside to cellmates at {CELL.insideMarkup}× (guards catch {Math.round(CELL.guardCatch * 100)}%).</small>}
        </>
      ) : (
        <HowItWorks>
          You’re free. Below are players locked up and looking for a way out. A breakout costs {naira(CELL.helperCost)} in tools, and if it fails you join them inside.
        </HowItWorks>
      )}
      <Section title="Jailbreak board" count={cell.breakouts.length} />
      {cell.breakouts.length === 0 && <p className="fx-empty">Nobody is planning anything. The guards are bored.</p>}
      {cell.breakouts.map((b) => (
        <FxCard key={b.id} icon="🔓" tone={b.mine ? 'mine' : undefined} title={`@${b.inmate}${b.mine ? ' (you)' : ''}`} pill={short(b.price)} sub={`Pays on success · ${ago(b.at)}`}>
          <div className="fx-actions">
            {b.mine
              ? <button className="btn sm" disabled={busy} onClick={() => void cancelBreakout(b.id)}>Call it off</button>
              : <button className="btn sm danger" disabled={busy || cell.jailed || money < CELL.helperCost} onClick={() => void assistBreakout(b.id)}>Break them out · {short(CELL.helperCost)} tools</button>}
          </div>
        </FxCard>
      ))}
    </>
  );
}

/* ================================================== Dirty Work ================================================== */

export function GrindApp() {
  const signedIn = useSignedIn();
  const streets = useVice((s) => s.streets);
  const busy = useVice((s) => s.busy);
  const money = useGame((s) => s.money);
  const now = useNow();
  usePoll(loadStreets, 10_000);
  if (!signedIn) return <NotSignedIn />;
  const running = new Map((streets?.ops ?? []).map((o) => [o.kind, o]));
  return (
    <>
      <div className="hero hero-dark">
        <small>Cash, no questions</small>
        <b>🛠️ Dirty Work</b>
        <small>Every payout is dirty money the EFCC can read in your ledger.</small>
      </div>
      <Err />
      {OPS.map((def) => {
        const op = running.get(def.id);
        const left = op ? op.readyAt - now : 0;
        const scarcityOnly = def.event === 'fuel' && !streets?.fuelEvent && !op;
        return (
          <div key={def.id} className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <b>{def.icon} {def.name}</b>
            <small className="muted">{def.blurb}</small>
            <small className="muted">
              {def.persistent ? `Set-up ${naira(def.cost)} · ${naira(def.payout)} every ${def.mins} min` : `Costs ${naira(def.cost)} · ${naira(def.payout)} in ${def.mins} min`} · {def.agency === 'efcc' ? '🕵🏾 EFCC' : '🚔 police'} bust risk ~{Math.round(def.bust * 100)}%
            </small>
            {!op && <button className="btn sm danger" disabled={busy || scarcityOnly || money < def.cost} onClick={() => void startOp(def.id)}>{scarcityOnly ? 'Only during a fuel scarcity' : def.persistent ? 'Set it up' : 'Start'}</button>}
            {op && left > 0 && <small>⏳ Ready in {mmss(left)}</small>}
            {op && left <= 0 && <button className="btn sm go" disabled={busy} onClick={() => void collectOp(def.id)}>💰 Collect</button>}
          </div>
        );
      })}
    </>
  );
}

/* ================================================== Overlays ================================================== */

/** Over the bush camp while you're held: time left, the ransom, and every way out. */
function KidnapPanel({ until, now }: { until: number; now: number }) {
  const me = useVice((s) => s.me);
  const busy = useVice((s) => s.busy);
  const money = useGame((s) => s.money);
  const [asking, setAsking] = useState(false);
  const ransom = me.ransom;
  const left = ransom ? Math.max(0, ransom.amount - ransom.pledged) : 0;
  const pct = ransom ? Math.min(100, (ransom.pledged / Math.max(1, ransom.amount)) * 100) : 0;
  const openBank = () => {
    useGame.setState({ openApp: 'bank' });
    useGame.getState().setPanel('phone');
  };
  return (
    <div className="jail-panel kidnap-panel" role="status" aria-label="Held by kidnappers">
      <div className="jail-panel-head">
        <span className="jail-icon"><Icon name="break-in" size={20} /></span>
        <div>
          <b>Yowaaaa, Pipty million, call ya Pamily</b>
          <small>Ofay or Moniefoint</small>
        </div>
        <div className="jail-timer" aria-label="Time left">{mmss(until - now)}</div>
      </div>
      <div className="kidnap-ransom">
        {ransom ? (
          <>
            <div className="kidnap-ransom-row"><span>Ransom</span><b>{naira(ransom.pledged)} / {naira(ransom.amount)}</b></div>
            <div className="kidnap-bar"><i style={{ width: `${pct}%` }} /></div>
          </>
        ) : (
          <small className="jail-note">They’re still working out how much you’re worth…</small>
        )}
      </div>
      {asking ? (
        <AskBail
          amount={left || 100_000}
          message="🪢 I’ve been kidnapped! Abeg send money so I can pay the ransom!"
          what="ransom"
          note={`They get a request for ${naira(left || 100_000)}. Once it lands, tap “Pay ransom”. Friends can also chip in from Phone → Fixer → Ransoms.`}
          onClose={() => setAsking(false)}
        />
      ) : (
        <div className="jail-actions kidnap-actions">
          <button className="btn" disabled={busy || !ransom || left <= 0 || money <= 0} onClick={() => ransom && void pledgeRansom(ransom.id, Math.min(Math.floor(money), left))}>
            Pay ransom{ransom ? ` ${naira(Math.min(Math.floor(money), left))}` : ''}
          </button>
          <button className="btn ghost" onClick={() => setAsking(true)}>Ask a friend</button>
          <button className="btn ghost" onClick={openBank}>Bank loan</button>
          <button className="btn ghost" disabled={busy} onClick={() => void struggle()}>Slip the ropes</button>
        </div>
      )}
      {!asking && ransom && money < left && <small className="jail-note">Not enough cash. Ask a friend, take a loan, or try to escape.</small>}
      <small className="jail-note kidnap-warn">Time runs out and they let you go, but keep what you paid in, your phone, your accessories and the car they took you in.</small>
    </div>
  );
}

/** The police stop. Mounted once in App. */
export function ViceOverlays() {
  const me = useVice((s) => s.me);
  const dui = useVice((s) => s.dui);
  const busy = useVice((s) => s.busy);
  const money = useGame((s) => s.money);
  const now = useNow();
  const held = me.heldUntil && me.heldUntil > now ? me.heldUntil : null;
  useEffect(() => {
    if (held) void loadViceMe();
  }, [held]);
  // Drag them to the bush camp while they're held; walk them out when freed.
  useEffect(() => {
    const g = useGame.getState();
    if (held) {
      if (g.heldUntil !== held || g.insideId !== 'camp') g.abduct(held);
    } else if (g.heldUntil || (g.view === 'place' && g.insideId === 'camp')) {
      g.freed();
      g.toast('🕊️ You are free. Go home and rest.');
    }
  }, [held]);
  return (
    <>
      {held && <KidnapPanel until={held} now={now} />}
      {dui && (
        <div className="story-overlay" style={{ zIndex: 50 }}>
          <section className="story-card checkpoint-card" role="dialog" aria-modal="true" aria-labelledby="dui-title">
            <span className="story-icon">🚓</span>
            <small>POLICE STOP</small>
            <h2 id="dui-title">“Oga, why your eyes red?”</h2>
            <p>The officer sniffs the air. You smell like a bonfire. He asks you to step out.</p>
            <div className="story-choices">
              <button disabled={busy || money < dui.bribe} onClick={() => void answerDui('bribe')}>💵 Settle him · {naira(dui.bribe)} ({Math.round(DUI.bribeWorks * 100)}% works)</button>
              <button disabled={busy} onClick={() => void answerDui('flee')}>💨 Floor it ({Math.round(DUI.fleeWorks * 100)}% works)</button>
              <button disabled={busy} onClick={() => void answerDui('submit')}>🙇🏾 “Officer, I am sorry”</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
