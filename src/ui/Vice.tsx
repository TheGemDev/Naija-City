// Phone apps for the dark side of Kaduna: Plug (drugs), Fixer (protection rackets, hit and kidnap
// contracts, ransoms, jail hustles) and Dirty Work (forgery, fake naira, bunkering, pirate radio, betting
// shop). Plus the kidnap screen and the police stop when you drive high. Rules: src/game/vice.ts.

import { useEffect, useState } from 'react';
import { naira, useGame } from '../game/store';
import { crimeTier, nextCrimeTier } from '../game/underworld';
import { CELL, CONTRACT, DUI, GOODS, GOOD_BY_ID, OPS, PLUG, RACKET, SWEEP, type GoodId } from '../game/vice';
import { useSession } from '../net/session';
import { searchPlayers, type PlayerRef } from '../net/social';
import {
  answerDui, answerOffer, answerRacket, assistBreakout, bribeGuard, buyGood, buyListing, cancelBreakout, cancelContract, cancelListing,
  collectOp, demandRacket, dropContract, endRacket, listGood, loadPlug, loadStreets, loadViceMe, makeOffer, pledgeRansom, postBreakout,
  postContract, reportRacket, rescue, sellGood, sellInside, startOp, strikeContract, struggle, takeContract, consumeGood, useVice,
} from '../net/vice';
import { AskBail } from './Police';
import { Icon } from './Icons';
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

export function FixerApp() {
  const signedIn = useSignedIn();
  const streets = useVice((s) => s.streets);
  const busy = useVice((s) => s.busy);
  const [tab, setTab] = useState<FixerTab>('protection');
  usePoll(loadStreets, 10_000);
  if (!signedIn) return <NotSignedIn />;
  const tier = streets ? crimeTier(streets.score) : null;
  const next = streets ? nextCrimeTier(streets.score) : null;
  const jailed = !!streets?.cell.jailed;
  return (
    <>
      <div className="hero hero-dark">
        <small>{tier ? `${tier.icon} ${tier.title} · crime score ${streets!.score}${next ? ` (${next.min - streets!.score} to ${next.title})` : ''}` : 'Loading…'}</small>
        <b>🕴🏾 Fixer</b>
        <small>Protection. Contracts. Ransoms. Jailbreaks. Nobody is watching. (They are.)</small>
      </div>
      <Err />
      <div className="tabs fixer-tabs">
        <button className={tab === 'protection' ? 'on' : ''} onClick={() => setTab('protection')}>🛡️ Protection</button>
        <button className={tab === 'contracts' ? 'on' : ''} onClick={() => setTab('contracts')}>📜 Contracts</button>
        <button className={tab === 'ransoms' ? 'on' : ''} onClick={() => setTab('ransoms')}>🆘 Ransoms</button>
        <button className={tab === 'cell' ? 'on' : ''} onClick={() => setTab('cell')}>⛓️ Cell{jailed ? ' (you)' : ''}</button>
      </div>
      {!streets && <p className="muted">Loading…</p>}
      {streets && tab === 'protection' && <Protection busy={busy} />}
      {streets && tab === 'contracts' && <Contracts busy={busy} />}
      {streets && tab === 'ransoms' && <Ransoms busy={busy} />}
      {streets && tab === 'cell' && <Cell busy={busy} />}
    </>
  );
}

function Protection({ busy }: { busy: boolean }) {
  const s = useVice((st) => st.streets)!;
  const money = useGame((st) => st.money);
  const [target, setTarget] = useState('');
  const [fee, setFee] = useState<number>(RACKET.fees[1]);
  const [rival, setRival] = useState('');
  const now = useNow(5000);
  const weeks = Math.round(RACKET.periodMs / 60_000);
  return (
    <>
      <div className="civic-notice">
        “Protection” is a weekly fee (one game week is about {Math.floor(weeks / 60)}h {weeks % 60}m real time). Area boys and above can demand it from anyone: shop owners, big spenders, you name it. Payers can pay, refuse, hire a rival gang… or call the police.
      </div>
      {s.rackets.asPayer.length > 0 && <h4>Deals on you</h4>}
      {s.rackets.asPayer.map((r) => (
        <div key={r.id} className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <b>🕴🏾 @{r.other} wants {naira(r.fee)} a week</b>
          {r.status === 'demanded' && (
            <>
              <div className="row-btns">
                <button className="btn sm go" disabled={busy || money < r.fee} onClick={() => void answerRacket(r.id, 'pay')}>Pay up</button>
                <button className="btn sm danger" disabled={busy} onClick={() => void answerRacket(r.id, 'refuse')}>Refuse</button>
                <button className="btn sm" disabled={busy} onClick={() => void reportRacket(r.id)}>🚔 Report</button>
              </div>
              <div className="row-btns">
                <UserPick placeholder="Rival gang boss" value={rival} onChange={setRival} />
                <button className="btn sm" disabled={busy || !rival.trim() || money < r.fee} onClick={() => void answerRacket(r.id, 'hire', rival)}>⚔️ Hire gang · {naira(r.fee)}</button>
              </div>
              <small className="muted">Refusing gets you leaned on for {naira(Math.round(r.fee * RACKET.leanPct))}. A hired gang wins or loses on crime score.</small>
            </>
          )}
          {r.status === 'active' && (
            <>
              <small className="muted">Paid {naira(r.paidTotal)} so far · next payment in {r.nextDue ? mmss(r.nextDue - now) : '?'}{r.strikes ? ` · ${r.strikes} missed` : ''}</small>
              <div className="row-btns">
                <button className="btn sm danger" disabled={busy} onClick={() => void endRacket(r.id)}>Stop paying ({naira(Math.round(r.fee * 1.5))} exit tax)</button>
                <button className="btn sm" disabled={busy} onClick={() => void reportRacket(r.id)}>🚔 Report</button>
              </div>
            </>
          )}
          {r.status === 'protected' && <small className="muted">🛡️ @{r.protector} has your back this week.</small>}
        </div>
      ))}
      <h4>Your racket</h4>
      <div className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
        <UserPick placeholder="Who to “protect”" value={target} onChange={setTarget} />
        <div className="row-btns">
          {RACKET.fees.map((f) => (
            <button key={f} className={`btn sm ${fee === f ? 'go' : ''}`} onClick={() => setFee(f)}>{naira(f)}</button>
          ))}
        </div>
        <button className="btn sm danger" disabled={busy || !target.trim()} onClick={() => void demandRacket(target, fee)}>Send the boys</button>
        <small className="muted">Needs Area boy or higher. At most {RACKET.maxVictims} people at once. Each collection risks a police raid.</small>
      </div>
      {s.rackets.asBoss.map((r) => (
        <div key={r.id} className="tile">
          <span className="tile-icon">💰</span>
          <span className="tile-info">
            <b>@{r.other} · {naira(r.fee)}/week</b>
            <small>{r.status === 'demanded' ? 'Waiting for an answer' : `Collected ${naira(r.paidTotal)} · next ${r.nextDue ? mmss(r.nextDue - now) : '?'}${r.strikes ? ` · ${r.strikes} missed` : ''}`}</small>
          </span>
          <button className="btn sm danger" disabled={busy || r.status !== 'active'} onClick={() => void endRacket(r.id)}>Drop</button>
        </div>
      ))}
    </>
  );
}

function Contracts({ busy }: { busy: boolean }) {
  const s = useVice((st) => st.streets)!;
  const money = useGame((st) => st.money);
  const [kind, setKind] = useState<'hit' | 'kidnap'>('hit');
  const [target, setTarget] = useState('');
  const [reward, setReward] = useState('50000');
  const [ransom, setRansom] = useState<number>(CONTRACT.ransoms[1]);
  const c = s.contracts;
  const myUser = useSession((st) => st.user?.username);
  return (
    <>
      <div className="civic-notice">
        Post a job and the money is held until someone does it. The taker has to find the target in person. Hits put them in hospital. Kidnaps hold them for {CONTRACT.holdMs / 60_000} minutes until their friends pay the ransom. Police can raid a kidnapper’s den.
      </div>
      {c.taking.length > 0 && <h4>Your jobs</h4>}
      {c.taking.map((j) => (
        <div key={j.id} className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <b>{j.kind === 'hit' ? '🥊 Hit' : '🪢 Kidnap'} @{j.target} · {naira(j.reward)}</b>
          <small className="muted">
            {j.status === 'ransom' ? `Hostage held. Ransom ${naira(j.pledged)} / ${naira(j.ransom)}` : 'Stand right next to them (same building or street) and strike.'}
          </small>
          {j.status === 'taken' && (
            <div className="row-btns">
              <button className="btn sm danger" disabled={busy} onClick={() => void strikeContract(j.id)}>Strike</button>
              <button className="btn sm" disabled={busy} onClick={() => void dropContract(j.id)}>Drop the job</button>
            </div>
          )}
        </div>
      ))}
      <h4>Job board</h4>
      {c.open.length === 0 && <p className="muted">No jobs right now.</p>}
      {c.open.map((j) => (
        <div key={j.id} className="tile">
          <span className="tile-icon">{j.kind === 'hit' ? '🥊' : '🪢'}</span>
          <span className="tile-info">
            <b>{j.kind === 'hit' ? 'Hit' : 'Kidnap'} @{j.target}</b>
            <small>{naira(Math.round(j.reward * (1 - CONTRACT.cutPct)))} for you{j.kind === 'kidnap' ? ` + ransom ${naira(j.ransom)}` : ''} · {ago(j.at)}</small>
          </span>
          <button className="btn sm" disabled={busy || j.target === myUser} onClick={() => void takeContract(j.id)}>Take</button>
        </div>
      ))}
      <h4>Post a contract</h4>
      <div className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
        <div className="row-btns">
          <button className={`btn sm ${kind === 'hit' ? 'go' : ''}`} onClick={() => setKind('hit')}>🥊 Hit</button>
          <button className={`btn sm ${kind === 'kidnap' ? 'go' : ''}`} onClick={() => setKind('kidnap')}>🪢 Kidnap</button>
        </div>
        <UserPick placeholder="Target" value={target} onChange={setTarget} />
        <input className="text-input" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value.replace(/\D/g, ''))} aria-label="Reward" />
        {kind === 'kidnap' && (
          <div className="row-btns">
            {CONTRACT.ransoms.map((r) => (
              <button key={r} className={`btn sm ${ransom === r ? 'go' : ''}`} onClick={() => setRansom(r)}>Ransom {naira(r)}</button>
            ))}
          </div>
        )}
        <button className="btn sm danger" disabled={busy || !target.trim() || Number(reward) < CONTRACT.minReward[kind] || Number(reward) > CONTRACT.maxReward || money < Number(reward)}
          onClick={() => void postContract(kind, target, Number(reward), kind === 'kidnap' ? ransom : undefined)}>
          Post · {naira(Number(reward) || 0)} held ({naira(CONTRACT.minReward[kind])} to {naira(CONTRACT.maxReward)})
        </button>
        <small className="muted">The server keeps {Math.round(CONTRACT.cutPct * 100)}% as its cut. Untaken jobs lapse after {CONTRACT.expiresMs / 3_600_000} hours and you’re refunded.</small>
      </div>
      {c.mine.length > 0 && <h4>Contracts you posted</h4>}
      {c.mine.map((j) => (
        <div key={j.id} className="tile">
          <span className="tile-icon">{j.kind === 'hit' ? '🥊' : '🪢'}</span>
          <span className="tile-info"><b>@{j.target} · {naira(j.reward)}</b><small>{j.status}</small></span>
          <button className="btn sm danger" disabled={busy || j.status !== 'open'} onClick={() => void cancelContract(j.id)}>Cancel</button>
        </div>
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
  const [amount, setAmount] = useState('10000');
  const list = s.contracts.ransoms;
  return (
    <>
      <div className="civic-notice">When a friend is kidnapped, the ransom is crowdfunded. Chip in whatever you can; if it isn’t met in time, everyone is refunded and the victim is dumped by the road.</div>
      {me.ransom && (
        <div className="list-card" style={{ padding: 10 }}>
          <b>🆘 You are being held</b>
          <small className="muted">Ransom {naira(me.ransom.pledged)} / {naira(me.ransom.amount)} · {mmss(me.ransom.endsAt - now)} left</small>
        </div>
      )}
      {list.length === 0 && <p className="muted">Nobody is being held right now. The streets are calm. For now.</p>}
      {list.map((j) => (
        <div key={j.id} className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <b>🆘 @{j.target}{j.friend ? ' (your friend)' : ''}</b>
          <div className="bar light"><i style={{ width: `${Math.min(100, (j.pledged / Math.max(1, j.ransom)) * 100)}%` }} /></div>
          <small className="muted">{naira(j.pledged)} of {naira(j.ransom)} · {j.holdEnds ? mmss(j.holdEnds - now) : ''} left</small>
          <div className="row-btns">
            <input className="text-input" inputMode="numeric" style={{ width: 90 }} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} aria-label="Amount" />
            <button className="btn sm go" disabled={busy || !Number(amount) || money <= 0} onClick={() => void pledgeRansom(j.id, Number(amount))}>🙏🏾 Chip in</button>
            {officer && <button className="btn sm danger" disabled={busy} onClick={() => void rescue(j.id)}>🚔 Raid the den</button>}
          </div>
        </div>
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
          <div className="civic-notice">You’re inside for {mmss((cell.jailedUntil ?? now) - now)}. Time to hustle.</div>
          <div className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <b>🔑 Bribe a guard · {naira(cell.bribeCost ?? 0)}</b>
            <small className="muted">Cuts {Math.round(CELL.cutPct * 100)}% off what’s left. {Math.round(CELL.snitchChance * 100)}% of guards snitch: more time and a fine.</small>
            <button className="btn sm danger" disabled={busy || money < (cell.bribeCost ?? 0)} onClick={() => void bribeGuard()}>Slide the envelope</button>
          </div>
          <div className="list-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <b>📞 Plan a jailbreak</b>
            <small className="muted">Offer a price; any free player can take the job. You pay only if it works.</small>
            <div className="row-btns">
              <input className="text-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} aria-label="Price" />
              <button className="btn sm" disabled={busy || Number(price) < CELL.breakoutMin} onClick={() => void postBreakout(Number(price))}>Put the word out</button>
            </div>
          </div>
          {stashed.length > 0 && <small className="muted">Got stash on you? Open Plug → Stash and sell inside to cellmates at {CELL.insideMarkup}× (guards catch {Math.round(CELL.guardCatch * 100)}%).</small>}
        </>
      ) : (
        <div className="civic-notice">You’re free. Below: friends and strangers locked up and looking for a way out. A breakout costs {naira(CELL.helperCost)} in tools and, if it fails, you join them.</div>
      )}
      <h4>Jailbreak board</h4>
      {cell.breakouts.length === 0 && <p className="muted">Nobody is planning anything. The guards are bored.</p>}
      {cell.breakouts.map((b) => (
        <div key={b.id} className="tile">
          <span className="tile-icon">🔓</span>
          <span className="tile-info"><b>@{b.inmate}{b.mine ? ' (you)' : ''}</b><small>pays {naira(b.price)} on success · {ago(b.at)}</small></span>
          {b.mine
            ? <button className="btn sm danger" disabled={busy} onClick={() => void cancelBreakout(b.id)}>Cancel</button>
            : <button className="btn sm" disabled={busy || cell.jailed || money < CELL.helperCost} onClick={() => void assistBreakout(b.id)}>Break them out</button>}
        </div>
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
