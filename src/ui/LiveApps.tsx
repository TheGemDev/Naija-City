// Phone apps for the live city: Twitter (feed, live events, cup-final bets), Hustle (keke/okada
// routes, driving, fuel), Yahoo (scams), Area (crime ladder, motor parks) and Legacy (reputation,
// achievements, hall of fame). Plus the "happening here" panels for places on the map.

import { useEffect, useState } from 'react';
import { dayOf, naira, netWorthOf, useGame } from '../game/store';
import { fed, FOOD_ENERGY } from '../game/catalog';
import { okadaBanned } from '../game/cityLaws';
import { CAR_FUEL, fuelLeft } from '../game/carFuel';
import { BET_WINDOW_MS, blackMarketPrice, FINAL_ODDS, FINAL_TEAMS, FUEL, fuelPrice, liveEvent, MAX_STAKE, roadEvent, type FinalPick } from '../game/live';
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
import { blogOf } from '../game/news';
import { CITY_NAME, CIVIC_CITIES } from '../game/civic';
import {
  FEED_WINDOW, claimPark, collectDues, deletePost, legacyInput, likePost, loadFeed, loadFriendsFeed, loadLive, loadVdmFeed, loadReplies, loadScams, loadUnderworld, placeBet, postGist, sendScam, setFeedCity, useLive,
  type FeedPost,
} from '../net/live';
import { searchPlayers, type PlayerRef } from '../net/social';
import { useSession } from '../net/session';
import { owambeNow } from './Owambe';
import { PARTY, PARTY_KINDS } from '../game/owambe';
import { useParty } from '../net/owambe';
import { abujaEventButtons } from './AbujaEvents';
import { lagosEventButtons } from './LagosEvents';
import { kanoEventButtons } from './KanoEvents';
import { Face } from './Face';
import { Mugshot, MugshotShare } from './Mugshot';
import { Poster } from './PlayerName';
import { shareLink, tweetLink } from '../net/deeplink';
import { Emoji } from './Icons';

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
const placeName = (city: string, id: string) => placeIn(city, id)?.name;

/* ---------- Live event card (Gist, HUD) ---------- */

function LiveEventCard() {
  const now = useNow();
  const city = useGame((s) => s.destinationId);
  const e = liveEvent(now, city);
  const road = roadEvent(now);
  return (
    <>
    <div className={`live-card ${e.active ? 'on' : ''}`}>
      <span className="live-icon"><Emoji char={e.def.icon} size={30} /></span>
      <span className="live-info">
        <small>{e.active ? <><Emoji char="🔴" size={10} /> LIVE NOW · whole city</> : `Next live event in ${mmss(e.startsAt - now)}`}</small>
        <b>{e.def.title}</b>
        <small>{e.def.blurb}</small>
        {e.active && <small className="live-ends">Ends in {mmss(e.endsAt - now)}{e.def.place && <> · <Emoji char="📍" size={11} /> {placeName(city, e.def.place)}</>}</small>}
      </span>
    </div>
    <div className={`live-card ${road.active ? 'on' : ''}`}>
      <span className="live-icon"><Emoji char={road.def.icon} size={30} /></span>
      <span className="live-info">
        <small>{road.active ? <><Emoji char="🔴" size={10} /> ON THE ROADS NOW · drivers</> : `Next road event in ${mmss(road.startsAt - now)}`}</small>
        <b>{road.def.title}</b>
        <small>{road.def.blurb}</small>
        {road.active && <small className="live-ends">Ends in {mmss(road.endsAt - now)}</small>}
      </span>
    </div>
    </>
  );
}

function BetSlip() {
  const now = useNow();
  const e = liveEvent(now);
  const bets = useLive((s) => s.bets);
  const results = useLive((s) => s.results);
  const busy = useLive((s) => s.busy);
  const money = useGame((s) => s.money);
  const [pick, setPick] = useState<FinalPick>('home');
  const [stake, setStake] = useState(5_000);
  useEffect(() => void loadLive(), []);
  const open = e.active && e.def.id === 'final' && now < e.startsAt + BET_WINDOW_MS;
  const mine = bets.find((b) => b.slot === e.slot);
  if (!open && !bets.length && !results.length) return null;
  return (
    <div className="list-card bet-card">
      <b><Emoji char="🏆" size={16} /> {FINAL_TEAMS.home} vs {FINAL_TEAMS.away}</b>
      {open && !mine && (
        <>
          <small className="muted">Bets close in {mmss(e.startsAt + BET_WINDOW_MS - now)}. Result at full time.</small>
          <div className="bet-picks">
            {(Object.keys(FINAL_ODDS) as FinalPick[]).map((p) => (
              <button key={p} className={pick === p ? 'on' : ''} onClick={() => setPick(p)}>
                <b>{p === 'draw' ? 'Draw' : FINAL_TEAMS[p]}</b>
                <small>×{FINAL_ODDS[p]}</small>
              </button>
            ))}
          </div>
          <div className="bet-stakes">
            {[1_000, 5_000, 20_000, MAX_STAKE].map((a) => (
              <button key={a} className={stake === a ? 'on' : ''} disabled={money < a} onClick={() => setStake(a)}>{naira(a)}</button>
            ))}
          </div>
          <button className="btn go wide" disabled={busy || money < stake} onClick={() => placeBet(pick, stake)}>
            Stake {naira(stake)} · win {naira(Math.floor(stake * FINAL_ODDS[pick]))}
          </button>
        </>
      )}
      {mine && (
        <small>
          Your bet: {naira(mine.stake)} on {mine.pick === 'draw' ? 'a draw' : FINAL_TEAMS[mine.pick]}{' '}
          {mine.payout === null ? <>· waiting for full time <Emoji char="⏳" size={13} /></> : mine.payout > 0 ? <>· WON {naira(mine.payout)} <Emoji char="🤑" size={13} /></> : <>· lost <Emoji char="😩" size={13} /></>}
        </small>
      )}
      {results.slice(0, 2).map((r) => (
        <small key={r.slot} className="muted">Result: {FINAL_TEAMS.home} {r.score} {FINAL_TEAMS.away}</small>
      ))}
    </div>
  );
}

/* ---------- Twitter (the city feed) ---------- */

export function GistApp() {
  const feed = useLive((s) => s.feed);
  const friendsFeed = useLive((s) => s.friendsFeed);
  const vdmFeed = useLive((s) => s.vdmFeed);
  const loading = useLive((s) => s.feedLoading);
  const busy = useLive((s) => s.busy);
  const feedEnd = useLive((s) => s.feedEnd);
  const feedCity = useLive((s) => s.feedCity);
  const feedAuto = useLive((s) => s.feedAuto);
  const here = useGame((s) => s.destinationId);
  const friendsEnd = useLive((s) => s.friendsEnd);
  const sharedPost = useLive((s) => s.sharedPost);
  const myUid = useSession((s) => s.user?.uid);
  const signedIn = !!myUid;
  const [text, setText] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<'friends' | 'news' | 'vdm'>('friends');
  // The news is the news of the state I am in, until I pick another.
  useEffect(() => {
    const state = CIVIC_CITIES.find((c) => c === here);
    if (feedAuto && state) setFeedCity(state);
  }, [here, feedAuto]);
  // A tweet opened from a share link comes with its replies showing.
  useEffect(() => {
    if (sharedPost) setOpenId(sharedPost.id);
  }, [sharedPost?.id]);
  useEffect(() => {
    const load = tab === 'vdm' ? loadVdmFeed : tab === 'friends' ? loadFriendsFeed : loadFeed;
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [tab]);
  const cards = (posts: FeedPost[]) => posts.filter((p) => p.id !== sharedPost?.id).map((p) => (
    <TweetCard key={p.id} p={p} myUid={myUid} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
  ));
  const compose = signedIn && (
    <form
      className="gist-compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        void postGist(text.trim()).then((r) => r !== null && setText(''));
      }}
    >
      <textarea value={text} maxLength={200} rows={2} placeholder="What’s happening in Naija?" onChange={(e) => setText(e.target.value)} />
      <button className="btn sm go" disabled={busy || !text.trim()}>Post</button>
    </form>
  );
  return (
    <>
      {sharedPost && (
        <>
          <div className="shared-head">
            <b><Emoji char="🔗" size={14} /> Shared with you</b>
            <button className="gist-like" onClick={() => useLive.setState({ sharedPost: null })}>✕ Close</button>
          </div>
          <TweetCard p={sharedPost} myUid={myUid} open={openId === sharedPost.id} onToggle={() => setOpenId(openId === sharedPost.id ? null : sharedPost.id)} />
        </>
      )}
      <div className="tabs">
        <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}><Emoji char="👥" size={16} /> Friends</button>
        <button className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}><Emoji char="📰" size={16} /> News</button>
        <button className={tab === 'vdm' ? 'on' : ''} onClick={() => setTab('vdm')}><Emoji char="📢" size={16} /> VDM</button>
      </div>

      {tab === 'friends' && (
        <>
          {compose}
          {!friendsFeed.length && (
            <p className="muted small">
              {loading ? 'Loading tweets…' : 'Nothing from your friends yet. Add friends in Messages, or check the News tab for what is happening in the country.'}
            </p>
          )}
          {cards(friendsFeed)}
          {!friendsEnd && friendsFeed.length > 0 && <button className="ghost-btn" disabled={loading} onClick={() => loadFriendsFeed(true)}>Older tweets</button>}
        </>
      )}

      {tab === 'news' && (
        <>
          <LiveEventCard />
          <BetSlip />
          <h4>Trending in Naija</h4>
          <div className="pills" style={{ marginBottom: 10 }}>
            <button className={feedCity === null ? 'on' : ''} onClick={() => { useLive.setState({ feedAuto: false }); setFeedCity(null); }}>All</button>
            {CIVIC_CITIES.map((c) => (
              <button key={c} className={feedCity === c ? 'on' : ''} onClick={() => { useLive.setState({ feedAuto: c === here }); setFeedCity(c); }}>{CITY_NAME[c]}</button>
            ))}
          </div>
          {!feed.length && (
            <p className="muted small">
              {loading ? 'Loading the news…' : feedCity ? `No news from ${CITY_NAME[feedCity]} yet today. The blogs are watching the government.` : 'No news yet today. The blogs are watching the government.'}
            </p>
          )}
          {cards(feed)}
          {!feedEnd && feed.length > 0 && <button className="ghost-btn" disabled={loading} onClick={() => loadFeed(true)}>Older news</button>}
          {feedEnd && feed.length >= FEED_WINDOW && <p className="muted small">That’s the latest {FEED_WINDOW} stories{feedCity ? ` from ${CITY_NAME[feedCity]}` : ''}.</p>}
        </>
      )}

      {tab === 'vdm' && (
        <>
          <div className="vdm-hero">
            <span><Emoji char="📢" size={30} /></span>
            <span>
              <b>VDM <Emoji char="✔️" size={14} /></b>
              <small>Naija’s loudest whistleblower. He exposes thieves and drags the government. Call him from the Police app.</small>
            </span>
          </div>
          {!vdmFeed.length && <p className="muted small">{loading ? 'Loading…' : 'VDM is quiet today. Nobody has called him, and the government has behaved.'}</p>}
          {cards(vdmFeed)}
        </>
      )}
    </>
  );
}

/** Bold every @handle in a post. */
function boldNames(text: string) {
  return text.split(/(@\w+)/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

function TweetCard({ p, myUid, open, onToggle }: { p: FeedPost; myUid?: string; open: boolean; onToggle: () => void }) {
  const replies = useLive((s) => s.replies[p.id]);
  const busy = useLive((s) => s.busy);
  const [text, setText] = useState('');
  const signedIn = !!myUid;
  useEffect(() => {
    if (open) void loadReplies(p.id);
  }, [open, p.id]);
  const header = (q: FeedPost) => (
    <div className="gist-meta">
      {q.kind === 'post' && q.uid ? <Poster uid={q.uid} username={q.username} /> : <span><Emoji char={q.icon} size={18} /></span>}
      <b>{q.kind === 'post' ? (q.uid ? '' : `@${q.username ?? 'someone'}`) : q.kind === 'vdm' ? <>VDM <Emoji char="✔️" size={12} /></> : q.kind === 'mugshot' ? <>Nigeria Police <Emoji char="✔️" size={12} /></> : q.kind === 'achievement' ? 'Achievement' : <>{blogOf(q.id)} <Emoji char="📰" size={13} /></>}</b>
      <small>· {ago(q.at)}</small>
    </div>
  );
  return (
    <div className={`post gist-post kind-${p.kind}`}>
      {header(p)}
      <p>{boldNames(p.text)}</p>
      {p.kind === 'mugshot' && p.uid && <Mugshot uid={p.uid} username={p.username} seed={p.id} at={p.at} />}
      <div className="gist-actions">
        <button className={`gist-like ${p.liked ? 'on' : ''}`} onClick={() => likePost(p.id)}>
          <Emoji char={p.liked ? '❤️' : '🤍'} size={13} /> {p.likes}
        </button>
        <button className="gist-like" onClick={onToggle}><Emoji char="💬" size={13} /> {replies?.length ?? p.replies ?? 0}</button>
        <button className="gist-like" onClick={() => void shareLink(tweetLink(p.id), `${p.kind === 'post' ? `@${p.username ?? 'someone'}` : p.kind === 'vdm' ? 'VDM' : blogOf(p.id)} on Naija Twitter`)}><Emoji char="↗️" size={13} /> Share</button>
        {p.kind === 'mugshot' && p.uid && <MugshotShare uid={p.uid} username={p.username} seed={p.id} at={p.at} />}
        {p.kind === 'post' && p.uid === myUid && (
          <button className="gist-like" onClick={() => window.confirm('Delete this tweet?') && void deletePost(p.id).catch(() => {})}><Emoji char="🗑️" size={13} /></button>
        )}
      </div>
      {open && (
        <div className="gist-replies">
          {(replies ?? []).map((r) => (
            <div key={r.id} className="gist-reply">
              {header(r)}
              <p>{boldNames(r.text)}</p>
              <div className="gist-actions">
                <button className={`gist-like ${r.liked ? 'on' : ''}`} onClick={() => likePost(r.id)}>
                  <Emoji char={r.liked ? '❤️' : '🤍'} size={13} /> {r.likes}
                </button>
                {r.uid === myUid && (
                  <button className="gist-like" onClick={() => void deletePost(r.id, p.id).catch(() => {})}><Emoji char="🗑️" size={13} /></button>
                )}
              </div>
            </div>
          ))}
          {signedIn && (
            <form
              className="gist-compose"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                void postGist(text.trim(), p.id).then((r) => r !== null && setText(''));
              }}
            >
              <textarea value={text} maxLength={200} rows={1} placeholder={`Reply to @${p.username ?? 'someone'}…`} onChange={(e) => setText(e.target.value)} />
              <button className="btn sm go" disabled={busy || !text.trim()}>Reply</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [tab, setTab] = useState<'drive' | 'fuel'>('drive');
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
        <button className={tab === 'drive' ? 'on' : ''} onClick={() => setTab('drive')}>🚗 Drive</button>
        <button className={tab === 'fuel' ? 'on' : ''} onClick={() => setTab('fuel')}>⛽ Fuel{scarcity ? ' · SCARCITY' : ''}</button>
      </div>
      {tab === 'drive' && (
      <>
      <div className="tile">
        <span className="tile-icon">🛺</span>
        <span className="tile-info"><b>Keke route</b><small>Rent for {naira(RENTAL.keke)} at {placeIn(useGame.getState().destinationId, 'motorpark')?.name ?? 'the motor park'} · up to ₦4k a trip</small></span>
        <button className="btn sm go" disabled={money < RENTAL.keke} onClick={() => go(() => startDrive('keke', { gig: 'keke' }))}>Start</button>
      </div>
      <div className="tile">
        <span className="tile-icon">🏍️</span>
        <span className="tile-info"><b>Okada route</b><small>Rent for {naira(RENTAL.okada)} · faster, cheaper fares</small></span>
        <button className="btn sm go" disabled={money < RENTAL.okada || okadaBanned(useGame.getState().destinationId)} onClick={() => go(() => startDrive('okada', { gig: 'okada' }))}>{okadaBanned(useGame.getState().destinationId) ? 'Banned' : 'Start'}</button>
      </div>
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
    <div className="live-banner">
      <span className="live-banner-icon">{e.def.icon}</span>
      <div className="live-banner-info">
        <b>LIVE · {e.def.title}</b>
        <small>{mmss(e.endsAt - now)} left{place ? ` · ${place.name}` : ''}</small>
        {place && <button className="live-banner-go" onClick={goToPlace}>📍 Go to {place.name}</button>}
      </div>
      <button className="live-banner-close" onClick={() => setHidden(key)} aria-label="Dismiss live event">✕</button>
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
