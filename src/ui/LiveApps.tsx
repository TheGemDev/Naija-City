// Phone apps for the live city: Twitter (feed, live events, cup-final bets), Hustle (keke/okada
// routes, driving, fuel), Yahoo (scams), Area (crime ladder, motor parks) and Legacy (reputation,
// achievements, hall of fame). Plus the "happening here" panels for places on the map.

import { useEffect, useState } from 'react';
import { dayOf, naira, netWorthOf, useGame } from '../game/store';
import { fed, FOOD_ENERGY } from '../game/catalog';
import { okadaBanned } from '../game/cityLaws';
import { CAR_FUEL, fuelLeft } from '../game/carFuel';
import { blackMarketPrice, FUEL, fuelPrice, liveEvent } from '../game/live';
import { ACHIEVEMENTS, legacyOf, nextRepTier, repScore, repTier, REP_TIERS } from '../game/legacy';
import { CRIME_TIERS, crimeTier, nextCrimeTier, PARK_RULES, PARKS } from '../game/underworld';
import { MUGUS, MUGU_PREFIX, PERK_BY_ID, SCAMS, SCAM_RULES } from '../game/scams';
import { RENTAL } from '../game/gigs';
import { CAR_BY_ID } from '../game/cars';
import { startDrive } from '../game/drive';
import { PLACE_BY_ID } from '../game/city';
import { generatorOf } from '../game/power';
import { regionPlace } from '../game/regions';
import { ORIGINS } from '../game/origins';
import { claimPark, collectDues, legacyInput, loadScams, loadUnderworld, sendScam, useLive } from '../net/live';
import { searchPlayers, type PlayerRef } from '../net/social';
import { useSession } from '../net/session';
import { owambeNow } from './Owambe';
import { PARTY, PARTY_KINDS } from '../game/owambe';
import { useParty } from '../net/owambe';
import { abujaEventButtons } from './AbujaEvents';
import { lagosEventButtons } from './LagosEvents';
import { kanoEventButtons } from './KanoEvents';
import { Face } from './Face';
import { Emoji } from './Icons';
import { DailyTab, DispatchTile, FarmTab, FreelanceTab, HUSTLE_TABS, type HustleTab } from './Hustles';

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

const closePhone = () => useGame.getState().setPanel(null);

/** A place by the name it goes by in that city (Murtala Square is Eagle Square in Abuja). */
const placeIn = (city: string, id: string) => regionPlace(city, id) ?? PLACE_BY_ID[id];

/* ---------- Twitter (the city feed): src/ui/Twitter.tsx ---------- */

export { GistApp } from './Twitter';

/* ---------- Hustle ---------- */

export function HustleApp() {
  const money = useGame((s) => s.money);
  const ownedCars = useGame((s) => s.ownedCars);
  const fuelCans = useGame((s) => s.fuelCans);
  const carFuel = useGame((s) => s.carFuel);
  const stats = useGame((s) => s.stats);
  const genFuel = useGame((s) => Math.round(s.power.genFuel));
  const ownsGen = useGame((s) => !!generatorOf(s.items));
  const now = useNow(5000);
  const e = liveEvent(now, useGame((s) => s.destinationId));
  const scarcity = e.active && e.def.id === 'fuel';
  const [tab, setTab] = useState<HustleTab>('daily');
  const durbar = e.active && e.def.id === 'durbar';
  const go = (fn: () => void) => {
    closePhone();
    fn();
  };
  return (
    <>
      <div className="hero hero-yellow">
        <small>Side hustles</small>
        <b>🛺 Hustle</b>
        <small>{stats.trips ?? 0} trips · {naira(stats.fares ?? 0)} in fares · {stats.escapes ?? 0} checkpoint escapes</small>
      </div>
      <div className="tabs">
        {HUSTLE_TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'fuel' && scarcity ? ' · SCARCITY' : ''}</button>
        ))}
      </div>
      {tab === 'daily' && <DailyTab />}
      {tab === 'freelance' && <FreelanceTab />}
      {tab === 'farm' && <FarmTab />}
      {tab === 'drive' && (
      <>
      <div className="tile">
        <span className="tile-icon">🛺</span>
        <span className="tile-info"><b>Keke route</b><small>Rent for {naira(RENTAL.keke)} at {placeIn(useGame.getState().destinationId, 'motorpark')?.name ?? 'the motor park'} · up to ₦6k a trip</small></span>
        <button className="btn sm go" disabled={money < RENTAL.keke} onClick={() => go(() => startDrive('keke', { gig: 'keke' }))}>Start</button>
      </div>
      <div className="tile">
        <span className="tile-icon">🏍️</span>
        <span className="tile-info"><b>Okada route</b><small>Rent for {naira(RENTAL.okada)} · faster, cheaper fares</small></span>
        <button className="btn sm go" disabled={money < RENTAL.okada || okadaBanned(useGame.getState().destinationId)} onClick={() => go(() => startDrive('okada', { gig: 'okada' }))}>{okadaBanned(useGame.getState().destinationId) ? 'Banned' : 'Start'}</button>
      </div>
      <DispatchTile onGo={closePhone} />
      {ownedCars.map((id) => (
        <div key={id} className="tile">
          <span className="tile-icon">🚗</span>
          <span className="tile-info"><b>Drive my {CAR_BY_ID[id]?.name ?? 'car'}</b><small>⛽ {Math.floor(fuelLeft(carFuel, id))}/{CAR_FUEL.tank}L · cruise the city, fun goes up</small></span>
          <div className="row-btns">
            <button className="btn sm" disabled={fuelLeft(carFuel, id) > CAR_FUEL.tank - 1} onClick={() => useGame.getState().refuelCar(id)}>Refuel</button>
            <button className="btn sm go" onClick={() => go(() => startDrive('car', { carId: id }))}>Drive</button>
          </div>
        </div>
      ))}
      {durbar && (
        <div className="tile live">
          <span className="tile-icon">🐎</span>
          <span className="tile-info"><b>Ride in the Durbar</b><small>LIVE · gallop through the rings round Murtala Square for a prize</small></span>
          <button className="btn sm go" onClick={() => go(() => startDrive('horse'))}>Mount up</button>
        </div>
      )}
      <p className="muted small">WASD / arrows (or the on-screen pads) to drive. Police checkpoints on the main roads will want “something for the boys”.</p>
      </>
      )}
      {tab === 'fuel' && (
      <>
      <div className="flow">
        <div><small>⛽ Jerrycans</small><b>{fuelCans} / {FUEL.maxCans}</b></div>
        <div><small>Generator</small><b>{ownsGen ? `${genFuel}%` : 'none'}</b></div>
      </div>
      <div className="tile">
        <span className="tile-icon">⛽</span>
        <span className="tile-info"><b>Buy at the pump</b><small>{scarcity ? 'Stations are dry during the scarcity. Black market only' : `${naira(fuelPrice(now))} a can`}</small></span>
        <button className="btn sm" disabled={scarcity || money < fuelPrice(now)} onClick={() => useGame.getState().buyFuel(false)}>Buy</button>
      </div>
      <div className="tile">
        <span className="tile-icon">🛢️</span>
        <span className="tile-info"><b>Black market (“stolen”)</b><small>{naira(blackMarketPrice())} · {Math.round(FUEL.raidChance * 100)}% chance of a police raid</small></span>
        <button className="btn sm danger" disabled={money < blackMarketPrice()} onClick={() => useGame.getState().buyFuel(true)}>Buy</button>
      </div>
      <div className="row-btns">
        <button className="btn" disabled={!fuelCans || !ownsGen} onClick={() => useGame.getState().pourFuel()}>Pour into gen</button>
        <button className="btn go" disabled={!fuelCans || !scarcity} onClick={() => useGame.getState().sellFuel()}>
          Sell a can · {naira(FUEL.scarcitySell)}
        </button>
      </div>
      {!scarcity && <p className="muted small">Fuel only sells at a premium during a fuel scarcity (a live event). Stock up now…</p>}
      </>
      )}
    </>
  );
}

/* ---------- Yahoo ---------- */

export function YahooApp() {
  const scams = useLive((s) => s.scams);
  const perks = useLive((s) => s.perks);
  const busy = useLive((s) => s.busy);
  const sent = useGame((s) => s.stats.scams ?? 0);
  const paidCount = scams.filter((s) => s.status === 'paid').length;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PlayerRef[]>([]);
  const [target, setTarget] = useState<PlayerRef | null>(null);
  const [script, setScript] = useState(SCAMS[0].id);
  useEffect(() => void loadScams(), []);
  useEffect(() => {
    if (!q.trim()) return setFound([]);
    const id = setTimeout(() => void searchPlayers(q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(id);
  }, [q]);
  const rank = sent >= 20 ? 'Chairman of the Yahoo Association 👑' : sent >= 10 ? 'Big Yahoo Boy 💻' : sent >= 3 ? 'Yahoo apprentice 🧑🏾‍💻' : 'JJC (just joined) 🐣';
  return (
    <>
      <div className="hero hero-dark">
        <small>Rank: {rank}</small>
        <b>💻 Yahoo</b>
        <small>Send a “client” a fake request. If they pay it, the money is yours. EFCC is watching.</small>
      </div>
      <div className="civic-notice civic-error">
        ⚠️ {Math.round(SCAM_RULES.catchChance * 100)}%+ chance the EFCC catches you on send. Victims can report you later ({Math.round(SCAM_RULES.reportCatchChance * 100)}% traced). Caught = fine, refund and a cell.
      </div>
      {perks.length > 0 && (
        <div className="civic-notice">
          {perks.map((p) => `${PERK_BY_ID[p.perk]?.icon ?? '✨'} ${PERK_BY_ID[p.perk]?.label ?? p.perk} ×${p.charges}`).join('  ·  ')}
        </div>
      )}
      <h4>1 · Pick your client</h4>
      {!target && (
        <>
          <small className="muted">Mugus (NPCs) can actually fall for it. Pick the script that fits them.</small>
          {MUGUS.map((m) => (
            <button key={m.id} className="tile tile-btn" onClick={() => setTarget({ uid: MUGU_PREFIX + m.id, username: m.name } as PlayerRef)}>
              <span className="tile-icon">{m.icon}</span>
              <span className="tile-info"><b>{m.name}</b><small>{m.bio} Likes: {m.weak.map((id) => SCAMS.find((x) => x.id === id)?.icon).join(' ')}</small></span>
            </button>
          ))}
        </>
      )}
      {target ? (
        <div className="tile">
          <span className="tile-icon">🎯</span>
          <span className="tile-info"><b>{target.uid.startsWith(MUGU_PREFIX) ? target.username : `@${target.username}`}</b><small>Target locked</small></span>
          <button className="btn sm" onClick={() => setTarget(null)}>Change</button>
        </div>
      ) : (
        <>
          <input className="text-input" value={q} placeholder="Search @username" onChange={(e) => setQ(e.target.value)} />
          {found.map((p) => (
            <button key={p.uid} className="tile tile-btn" onClick={() => setTarget(p)}>
              <Face uid={p.uid} username={p.username} look={p.look} size="lg" />
              <span className="tile-info"><b>@{p.username}</b><small>{p.name ?? ''}</small></span>
            </button>
          ))}
        </>
      )}
      <h4>2 · Pick your script</h4>
      {SCAMS.map((s) => (
        <button key={s.id} disabled={!!s.minPaid && paidCount < s.minPaid} className={`tile tile-btn ${script === s.id ? 'picked' : ''}`} onClick={() => setScript(s.id)}>
          <span className="tile-icon">{s.icon}</span>
          <span className="tile-info"><b>{s.title} · asks {naira(s.amount)}</b><small>{s.minPaid && paidCount < s.minPaid ? `🔒 Land ${s.minPaid} paid scams (${paidCount} now)` : `${s.text.slice(0, 70)}…`}</small></span>
        </button>
      ))}
      <button className="btn danger wide" disabled={busy || !target} onClick={() => target && sendScam(target.uid, script)}>
        📨 Send the message
      </button>
      {scams.length > 0 && (
        <>
          <h4>Your “clients”</h4>
          {scams.map((s) => (
            <div key={s.id} className="tile">
              <span className="tile-icon">{s.status === 'paid' ? '🤑' : s.status === 'caught' || s.status === 'reported' ? '🚔' : '⏳'}</span>
              <span className="tile-info">
                <b>{s.victimUid?.startsWith(MUGU_PREFIX) ? s.victim : `@${s.victim ?? 'someone'}`} · {naira(s.status === 'paid' && s.payout ? s.payout : s.amount)}</b>
                <small>{s.note && s.status !== 'sent' ? `“${s.note}”` : { sent: 'Waiting for them to pay…', paid: 'They PAID! 💰', caught: 'EFCC caught you on send', reported: 'They reported you to EFCC', cleared: 'Cleared' }[s.status]} · {ago(s.at)} ago</small>
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ---------- Area (underworld) ---------- */

export function AreaApp() {
  const uw = useLive((s) => s.underworld);
  const busy = useLive((s) => s.busy);
  const uid = useSession((s) => s.user?.uid);
  const notoriety = useGame((s) => s.notoriety);
  const view = useGame((s) => s.view);
  const insideId = useGame((s) => s.insideId);
  const city = useGame((s) => s.destinationId);
  useEffect(() => {
    void loadUnderworld();
    const id = setInterval(() => void loadUnderworld(), 30_000);
    return () => clearInterval(id);
  }, []);
  const score = uw?.score ?? 0;
  const tier = crimeTier(score);
  const next = nextCrimeTier(score);
  const canClaim = CRIME_TIERS.findIndex((t) => t.id === tier.id) >= CRIME_TIERS.findIndex((t) => t.id === PARK_RULES.claimTier);
  return (
    <>
      <div className="hero hero-dark">
        <small>Street name: {tier.icon} {tier.title}</small>
        <b>🕴🏾 The Area</b>
        <small>Crime score {score}{next ? ` · ${next.min - score} to ${next.title}` : ' · top of the food chain'} · street heat {notoriety}</small>
      </div>
      <h4>The ladder</h4>
      <div className="list-card ladder">
        {CRIME_TIERS.map((t) => (
          <div key={t.id} className={`ladder-row ${t.id === tier.id ? 'on' : score >= t.min ? 'done' : ''}`}>
            <span>{t.icon}</span>
            <b>{t.title}</b>
            <small>{t.min}+</small>
          </div>
        ))}
        <small className="muted">Score comes from successful thefts, scams that paid, turf wars won and checkpoint escapes, as the server records them.</small>
      </div>
      <h4>Motor parks</h4>
      {PARKS.map((park) => {
        const info = uw?.parks.find((p) => p.id === park.id);
        const mine = !!info?.boss && info.boss.uid === uid;
        const here = city === park.city && ((view === 'place' && insideId === park.place) || view === 'city');
        return (
          <div key={park.id} className="list-card park-card">
            <b>🚌 {park.name}</b>
            <small>{info?.boss ? `Godfather: @${info.boss.username ?? 'someone'}${mine ? ' (YOU)' : ''}` : 'No godfather. The park is up for grabs.'}</small>
            {mine ? (
              <>
                <small>Dues waiting: <b>{naira(info?.dues ?? 0)}</b> ({naira(PARK_RULES.duesPerHour)}/hour + 10% of every keke & okada fare)</small>
                <button className="btn go" disabled={busy || !here} onClick={() => collectDues(park.id)}>💰 Collect dues</button>
                <small className="muted">Each collection risks a police raid (more patrols, more raids).</small>
              </>
            ) : (
              <>
                <button className="btn danger" disabled={busy || !canClaim} onClick={() => claimPark(park.id)}>
                  {info?.boss ? `⚔️ Start a turf war · ${naira(PARK_RULES.warCost)}` : `🤝 Settle the elders · ${naira(PARK_RULES.claimCost)}`}
                </button>
                {!canClaim && <small className="muted">You must be at least an Agbero before the boys will follow you.</small>}
              </>
            )}
            <small className="muted">You have to be at {park.name} (or on the map by its gate).</small>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Legacy ---------- */

export function LegacyApp() {
  // Re-scores every few seconds rather than on every game tick.
  useNow(4000);
  const achievements = useGame((st) => st.achievements);
  const hall = useGame((st) => st.legacy);
  const day = useGame((st) => dayOf(st.minutes));
  const [sure, setSure] = useState(false);
  const input = legacyInput();
  const rep = repScore(input);
  const tier = repTier(rep);
  const next = nextRepTier(rep);
  const legacy = legacyOf(input);
  const unlocked = new Set(achievements);
  return (
    <>
      <div className="hero hero-green">
        <small>Street reputation</small>
        <b>{tier.icon} {tier.title}</b>
        <small>{rep} rep{next ? ` · ${next.min - rep} to ${next.icon} ${next.title}` : ' · the very top'}</small>
        <div className="bar"><i style={{ width: `${next ? Math.min(100, ((rep - tier.min) / (next.min - tier.min)) * 100) : 100}%` }} /></div>
      </div>
      <div className="rep-ladder">
        {REP_TIERS.map((t) => <span key={t.title} className={rep >= t.min ? 'on' : ''} title={t.title}>{t.icon}</span>)}
      </div>
      <h4>Legacy if your life ended today</h4>
      <div className="list-card legacy-card">
        <b>{legacy.icon} {legacy.title} · {legacy.total.toLocaleString()} pts</b>
        <div className="legacy-grid">
          <span>💰 Wealth <b>{legacy.wealth.toLocaleString()}</b></span>
          <span>😇 Good deeds <b>{legacy.deeds.toLocaleString()}</b></span>
          <span>🦹🏾 Infamy <b>{legacy.infamy.toLocaleString()}</b></span>
          <span>🏆 Achievements <b>{legacy.achievements.toLocaleString()}</b></span>
          <span>🏛️ Power <b>{legacy.power.toLocaleString()}</b></span>
          <span>🏠 Property <b>{legacy.property.toLocaleString()}</b></span>
          <span>📅 Days lived <b>{legacy.years.toLocaleString()}</b></span>
          <span>💼 Net worth <b>{naira(netWorthOf(useGame.getState()))}</b></span>
        </div>
      </div>
      <h4>Achievements · {unlocked.size}/{ACHIEVEMENTS.length}</h4>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={`ach ${unlocked.has(a.id) ? 'on' : ''}`} title={a.desc}>
            <span>{unlocked.has(a.id) ? a.icon : '🔒'}</span>
            <b>{a.title}</b>
            <small>{a.desc}</small>
          </div>
        ))}
      </div>
      {hall.length > 0 && (
        <>
          <h4>Hall of fame</h4>
          {hall.map((r) => (
            <div key={r.at} className="tile">
              <span className="tile-icon">{r.icon}</span>
              <span className="tile-info">
                <b>{r.name} · {r.title}</b>
                <small>{r.score.toLocaleString()} pts · {r.days} days · {ORIGINS[r.origin as keyof typeof ORIGINS]?.label ?? r.origin}</small>
              </span>
            </div>
          ))}
        </>
      )}
      <h4>End of the road</h4>
      {sure ? (
        <div className="row-btns">
          <button className="btn danger" onClick={() => useGame.getState().endLife()}>Yes, end this life</button>
          <button className="btn" onClick={() => setSure(false)}>Not yet</button>
        </div>
      ) : (
        <button className="btn danger" onClick={() => setSure(true)}>⚰️ Retire &amp; score this life (day {day})</button>
      )}
    </>
  );
}

/* ---------- Places: what's happening here ---------- */

/** On the map card: a heads-up about events at this place. */
export function PlaceHappening({ placeId }: { placeId: string }) {
  const now = useNow(5000);
  useGame((s) => Math.floor(s.minutes / 30));
  const e = liveEvent(now, useGame((s) => s.destinationId));
  const notes: string[] = [];
  if (e.active && e.def.place === placeId) notes.push(`${e.def.icon} LIVE: ${e.def.title}`);
  if (placeId === 'murtala' && owambeNow().party) notes.push(`${PARTY_KINDS[owambeNow().party!.kind].icon} ${owambeNow().party!.title} is on!`);
  else if (placeId === 'murtala' && owambeNow().open && !(e.active && e.def.id === 'owambe')) notes.push(`💃🏾 Owambe today${owambeNow().invited ? ' (you’re invited!)' : ''}`);
  if (placeId === 'motorpark') notes.push('🛺 Rent a keke or okada · 🕴🏾 Godfather business');
  if (e.active && e.def.id === 'fuel' && placeId === 'motorpark') notes.push('🛢️ Black-market fuel boys are here');
  if (!notes.length) return null;
  return (
    <div className="happening">
      {notes.map((n) => <b key={n}>{n}</b>)}
      <small>Go inside to join in.</small>
    </div>
  );
}

const protestedSlots = new Set<string>();
/** One go per player per slot for the one-off events. */
const grabbedSlots = new Set<string>();
/** A one-off go at an event is for that city's event: the same time slot in another city is a different one. */
const slotHere = (slot: number) => `${useGame.getState().destinationId}:${slot}`;

/** Inside a place: buttons for whatever is happening there. */
export function PlaceEvents() {
  const view = useGame((s) => s.view);
  const insideId = useGame((s) => s.insideId);
  const money = useGame((s) => s.money);
  const city = useGame((s) => s.destinationId);
  const now = useNow(3000);
  const [, bump] = useState(0);
  if (view !== 'place' || !insideId) return null;
  const e = liveEvent(now, city);
  const live = (id: string) => e.active && e.def.id === id;
  const g = useGame.getState();
  const buttons: { icon: string; label: string; sub?: string; onClick: () => void; disabled?: boolean; danger?: boolean }[] = [];

  if (insideId === 'murtala') {
    const o = owambeNow();
    const hosted = o.party;
    if (o.open) {
      buttons.push({
        icon: hosted ? PARTY_KINDS[hosted.kind].icon : '💃🏾',
        label: hosted ? (hosted.isHost ? 'Your party is on!' : `Go to ${hosted.title}`) : o.mega ? 'Join the mega owambe' : 'Go to the owambe',
        sub: hosted?.isHost ? 'Stand here and get sprayed' : o.invited ? 'You are on the list' : 'Not invited… yet',
        onClick: () => g.setOwambe(true),
      });
    }
    if (!hosted) {
      buttons.push({
        icon: '🎊', label: `Throw your own owambe · ${naira(PARTY.fee)}`, sub: 'Book the square; guests spray YOU',
        disabled: money < PARTY.fee,
        onClick: () => {
          useParty.setState({ planning: true });
          g.setOwambe(true);
        },
      });
    }
    if (live('moneyrain')) {
      buttons.push({
        icon: '💸', label: 'Grab the falling cash', sub: grabbedSlots.has(slotHere(e.slot)) ? 'You already grabbed some' : 'Elbows out. Someone might snatch your phone', disabled: grabbedSlots.has(slotHere(e.slot)),
        onClick: () => {
          grabbedSlots.add(slotHere(e.slot));
          if (Math.random() < 0.25) {
            const fine = g.charge(Math.min(8_000, Math.max(0, Math.floor(g.money))), 'Pickpocketed in the cash scramble');
            g.toast(`🤕 A crowd swallowed you. Someone took ${naira(fine)} from your pocket.`);
          } else {
            const got = g.earn('luck', 3_000 + Math.floor(Math.random() * 17_000), 'Grabbed cash at the senator’s spray');
            g.toast(`💸 You snatched ${naira(got)} out of the air!`);
          }
          bump((n) => n + 1);
        },
      });
    }
    if (live('ufo')) {
      buttons.push({
        icon: '🛸', label: 'Look up at the UFO', sub: grabbedSlots.has(slotHere(e.slot)) ? 'You already saw it' : 'Could be a sign. Could be a drone', disabled: grabbedSlots.has(slotHere(e.slot)),
        onClick: () => {
          grabbedSlots.add(slotHere(e.slot));
          const r = Math.random();
          if (r < 0.3) {
            useGame.setState((s) => ({ needs: { ...s.needs, energy: Math.max(0, s.needs.energy - 40), hunger: Math.max(0, s.needs.hunger - 30), fun: Math.min(100, s.needs.fun + 40) } }));
            g.toast('👽 You were beamed up, probed and returned behind the stage. Nobody believes you.');
          } else if (r < 0.6) {
            const got = g.earn('luck', 5_000, 'Sold UFO footage to a blog');
            g.toast(`📱 Your blurry video went viral. A blog paid ${naira(got)}.`);
          } else {
            useGame.setState((s) => ({ needs: { ...s.needs, fun: Math.min(100, s.needs.fun + 25), social: Math.min(100, s.needs.social + 20) } }));
            g.toast('🛸 Everybody gasped together. A pastor claimed credit. Strangers hugged.');
          }
          bump((n) => n + 1);
        },
      });
    }
    if (live('jollof')) {
      buttons.push({
        icon: '🍛', label: 'Queue for free jollof', sub: grabbedSlots.has(slotHere(e.slot)) ? 'You already ate' : 'Free, if the pot lasts', disabled: grabbedSlots.has(slotHere(e.slot)),
        onClick: () => {
          grabbedSlots.add(slotHere(e.slot));
          if (Math.random() < 0.2) {
            g.toast('🥄 The pot finished just before your turn. Only the smell was free.');
          } else {
            useGame.setState((s) => ({ needs: { ...s.needs, hunger: Math.min(100, s.needs.hunger + 55), energy: Math.min(100, s.needs.energy + 55 * FOOD_ENERGY), fun: Math.min(100, s.needs.fun + 10) } }));
            g.toast('🍛 Smoky party jollof, a free chicken laps and a campaign T-shirt. Delicious.');
          }
          bump((n) => n + 1);
        },
      });
    }
    if (live('durbar')) buttons.push({ icon: '🐎', label: 'Ride in the Durbar', sub: 'Gallop through the rings for a prize', onClick: () => startDrive('horse') });
    if (live('protest')) {
      buttons.push({
        icon: '✊🏾', label: 'Join the protest', sub: protestedSlots.has(slotHere(e.slot)) ? 'You already marched today' : 'Placards, whistles, teargas risk', disabled: protestedSlots.has(slotHere(e.slot)),
        onClick: () => {
          protestedSlots.add(slotHere(e.slot));
          g.bump('protests');
          const r = Math.random();
          if (r < 0.25) {
            useGame.setState((s) => ({ needs: { ...s.needs, energy: Math.max(0, s.needs.energy - 15), hygiene: Math.max(0, s.needs.hygiene - 25), fun: Math.max(0, s.needs.fun - 5) } }));
            g.toast('😷 TEARGAS! You ran with your eyes streaming. Still, the voice of the people was heard.');
          } else if (r < 0.35) {
            const fine = g.charge(Math.min(10_000, Math.max(0, Math.floor(g.money))), '“Bail” after the protest');
            g.toast(`🚓 Police “invited” you for questioning. ${naira(fine)} later, you were released.`);
          } else {
            useGame.setState((s) => ({ goodDeeds: s.goodDeeds + 1, needs: { ...s.needs, social: Math.min(100, s.needs.social + 25), fun: Math.min(100, s.needs.fun + 15), energy: Math.max(0, s.needs.energy - 10) } }));
            g.toast('✊🏾 You marched, sang and chanted. Your video is trending on Twitter!');
          }
          bump((n) => n + 1);
        },
      });
    }
  }
  if ((insideId === 'viewing' || insideId === 'stadium') && live('final')) {
    buttons.push({
      icon: '📺', label: 'Watch the cup final', sub: 'The whole city is screaming',
      onClick: () => {
        useGame.setState((s) => ({ needs: { ...s.needs, fun: Math.min(100, s.needs.fun + 30), social: Math.min(100, s.needs.social + 30) } }));
        g.toast(pick(['⚽ GOOOAAAL! The viewing centre exploded. Somebody’s bench broke.', '⚽ Penalty shout! Everybody is a referee now.', '⚽ The generator went off at the key moment. Chaos.']));
      },
    });
    buttons.push({ icon: '🎟️', label: 'Place a bet', sub: 'Phone → Gist', onClick: () => g.setPanel('phone') });
  }
  /** `run` returns false when nothing happened (not enough money), so the go is not used up. */
  const once = (b: { icon: string; label: string; sub: string; done: string; run: () => void | false }) => {
    const done = grabbedSlots.has(slotHere(e.slot));
    buttons.push({ icon: b.icon, label: b.label, sub: done ? b.done : b.sub, disabled: done, onClick: () => { grabbedSlots.add(slotHere(e.slot)); if (b.run() === false) grabbedSlots.delete(slotHere(e.slot)); bump((n) => n + 1); } });
  };
  const needs = (d: Partial<Record<'hunger' | 'energy' | 'fun' | 'social' | 'hygiene', number>>) =>
    useGame.setState((s) => {
      const n = { ...s.needs };
      const gain = fed(d);
      for (const k of Object.keys(gain) as (keyof typeof d)[]) n[k] = Math.max(0, Math.min(100, n[k] + gain[k]!));
      return { needs: n };
    });
  if (insideId === 'mosque' && live('eid')) {
    once({
      icon: '🌙', label: 'Pray Eid and collect Sallah money', sub: 'Elders hand out crisp notes', done: 'You already prayed',
      run: () => {
        needs({ social: 25, fun: 15 });
        const got = g.earn('luck', 2_000 + Math.floor(Math.random() * 6_000), 'Sallah money from the elders');
        g.toast(`🌙 Eid Mubarak! Embraced by every uncle in the row, and ${naira(got)} Sallah money in your babanriga pocket.`);
      },
    });
  }
  if (insideId === 'murtala' && live('dambe')) {
    once({
      icon: '🥊', label: 'Step into the dambe ring', sub: 'Wrapped fist, big juju, bigger risk', done: 'You already fought',
      run: () => {
        if (Math.random() < 0.45) {
          const got = g.earn('luck', 10_000, 'Won a dambe bout');
          needs({ energy: -20, fun: 25 });
          g.toast(`🥊 Your opponent's juju failed. The crowd carried you round the ring. Prize: ${naira(got)}.`);
        } else {
          needs({ energy: -35, hygiene: -25 });
          g.toast('🥊 Knocked flat in the second round. A man sold you hot kunu while you were on the ground.');
        }
      },
    });
  }
  if (insideId === 'polo' && live('polocup')) {
    once({
      icon: '🥂', label: 'Mingle with the VIP tent', sub: 'Champagne, handshakes, tips', done: 'You already mingled',
      run: () => {
        needs({ social: 30, fun: 20 });
        const got = g.earn('luck', 4_000 + Math.floor(Math.random() * 8_000), 'Tips from polo guests');
        g.toast(`🥂 A commissioner mistook you for somebody important and gave you ${naira(got)}.`);
      },
    });
    buttons.push({ icon: '🏇', label: 'Ride a pony', sub: 'Gallop the field', onClick: () => startDrive('horse') });
  }
  if (insideId === 'market' && live('ramfair')) {
    once({
      icon: '🐏', label: 'Haggle for a ram and flip it', sub: 'Pay ₦20k now, resale price varies', done: 'You already traded',
      run: () => {
        if (g.money < 20_000) { grabbedSlots.delete(slotHere(e.slot)); return g.toast('🐏 You need ₦20,000 to buy a ram.'); }
        g.charge(20_000, 'Bought a ram at the fair');
        if (Math.random() < 0.65) {
          const got = g.earn('luck', 28_000 + Math.floor(Math.random() * 10_000), 'Sold the ram on at Sallah prices');
          g.toast(`🐏 You flipped the ram to a desperate family. Made ${naira(got - 20_000)} profit.`);
        } else {
          g.toast('🐏 The ram refused to follow you, bit your agbada and got sold for nothing. You lost it all.');
        }
      },
    });
  }
  if (e.active) buttons.push(...abujaEventButtons(insideId, e.def.id, { g, once, needs, pick }), ...lagosEventButtons(insideId, e.def.id, { g, once, needs, pick }), ...kanoEventButtons(insideId, e.def.id, { g, once, needs, pick }));
  if (insideId === 'motorpark' && live('goats')) {
    buttons.push({
      icon: '🐐', label: 'Catch a runaway goat', sub: grabbedSlots.has(slotHere(e.slot)) ? 'You already tried' : 'The owner pays a finder’s fee. Goats headbutt', disabled: grabbedSlots.has(slotHere(e.slot)),
      onClick: () => {
        grabbedSlots.add(slotHere(e.slot));
        if (Math.random() < 0.35) {
          useGame.setState((s) => ({ needs: { ...s.needs, energy: Math.max(0, s.needs.energy - 20), hygiene: Math.max(0, s.needs.hygiene - 30) } }));
          g.toast('🐐 The goat headbutted you into a gutter and escaped. It looked proud.');
        } else {
          const got = g.earn('luck', 6_000 + Math.floor(Math.random() * 6_000), 'Finder’s fee for a runaway goat');
          g.toast(`🐐 You wrestled it down. The owner paid ${naira(got)} and offered a leg.`);
        }
        bump((n) => n + 1);
      },
    });
  }
  if (insideId === 'motorpark') {
    buttons.push({ icon: '🛺', label: `Rent a keke · ${naira(RENTAL.keke)}`, sub: 'Drive passengers for fares', disabled: money < RENTAL.keke, onClick: () => startDrive('keke', { gig: 'keke' }) });
    buttons.push({ icon: '🏍️', label: `Rent an okada · ${naira(RENTAL.okada)}`, sub: okadaBanned(g.destinationId) ? 'Okada is banned in this city' : undefined, disabled: money < RENTAL.okada || okadaBanned(g.destinationId), onClick: () => startDrive('okada', { gig: 'okada' }) });
    buttons.push({ icon: '📦', label: `Dispatch bike · ${naira(RENTAL.dispatch)}`, sub: 'Deliver food and parcels across town', disabled: money < RENTAL.dispatch, onClick: () => startDrive('okada', { gig: 'dispatch' }) });
    buttons.push({ icon: '🛢️', label: `Black-market fuel · ${naira(blackMarketPrice())}`, sub: `${Math.round(FUEL.raidChance * 100)}% raid risk`, danger: true, disabled: money < blackMarketPrice(), onClick: () => g.buyFuel(true) });
    if (live('fuel')) buttons.push({ icon: '💰', label: `Sell a jerrycan · ${naira(FUEL.scarcitySell)}`, sub: 'Desperate drivers are queueing', disabled: g.fuelCans <= 0, onClick: () => g.sellFuel() });
    buttons.push({ icon: '🕴🏾', label: 'Godfather business', sub: 'Phone → Area', onClick: () => g.setPanel('phone') });
  }
  if (!buttons.length) return null;
  const place = placeIn(city, insideId);
  return (
    <div className="place-events">
      <small>{place?.icon} HAPPENING AT {place?.name.toUpperCase()}</small>
      {buttons.map((b) => (
        <button key={b.label} className={`place-event ${b.danger ? 'danger' : ''}`} disabled={b.disabled} onClick={b.onClick}>
          <span>{b.icon}</span>
          <span><b>{b.label}</b>{b.sub && <small>{b.sub}</small>}</span>
        </button>
      ))}
    </div>
  );
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/* ---------- HUD: the live banner ---------- */

export function LiveBanner() {
  const now = useNow();
  const started = useGame((s) => s.started);
  const city = useGame((s) => s.destinationId);
  const e = liveEvent(now, city);
  const [hidden, setHidden] = useState<string | null>(null);
  const key = `${city}:${e.slot}`;
  if (!started || !e.active || hidden === key) return null;
  const place = e.def.place ? placeIn(city, e.def.place) : null;
  const goToPlace = () => {
    const game = useGame.getState();
    game.setPanel(null);
    if (game.view !== 'city') game.openMap();
    const current = useGame.getState();
    if (current.view === 'city' && place) current.selectPlace(place.id);
  };
  return (
    <div className="hud-card live-pill">
      {/* Tap the pill to go to where it's on. */}
      <button type="button" className="live-pill-go" disabled={!place} onClick={goToPlace} aria-label={place ? `Go to ${place.name}` : undefined}>
        <span className="live-pill-icon"><Emoji char={e.def.icon} size={28} /></span>
        <span className="live-pill-text">
          <em><i className="live-dot" />LIVE · {mmss(e.endsAt - now)} left</em>
          <b>{e.def.title}</b>
          {place && <small>📍 Tap to go to {place.name}</small>}
        </span>
      </button>
      <button type="button" className="live-pill-close" onClick={() => setHidden(key)} aria-label="Dismiss live event">✕</button>
    </div>
  );
}

/* ---------- End of life ---------- */

export function LifeSummary({ onNewLife }: { onNewLife: () => void }) {
  const sum = useGame((s) => s.lifeSummary);
  if (!sum) return null;
  return (
    <div className="story-overlay">
      <section className="story-card life-card" role="dialog" aria-modal="true" aria-labelledby="life-title">
        <span className="story-icon">{sum.icon}</span>
        <small>A LIFE IN NAIJA CITY · {sum.record.days} DAYS</small>
        <h2 id="life-title">{sum.record.name}: {sum.title}</h2>
        <p className="life-score">{sum.total.toLocaleString()} legacy points</p>
        <div className="legacy-grid">
          <span>💰 Wealth <b>{sum.wealth.toLocaleString()}</b></span>
          <span>😇 Deeds <b>{sum.deeds.toLocaleString()}</b></span>
          <span>🦹🏾 Infamy <b>{sum.infamy.toLocaleString()}</b></span>
          <span>🏆 Achievements <b>{sum.achievements.toLocaleString()}</b></span>
          <span>🏛️ Power <b>{sum.power.toLocaleString()}</b></span>
          <span>🏠 Property <b>{sum.property.toLocaleString()}</b></span>
        </div>
        <div className="story-choices">
          <button onClick={onNewLife}>🌱 Born again (your hall of fame stays)</button>
        </div>
      </section>
    </div>
  );
}
