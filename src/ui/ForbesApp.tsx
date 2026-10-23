// Hustlers app: the rich list and the week's money makers. The top three stand on a podium,
// the rest follow, and your own place rides the bottom of the screen with how far it is to the next one up.
import { useEffect, useRef, useState } from 'react';
import { nairaShort, netWorthOf, useGame } from '../game/store';
import { FORBES_MIN_WORTH, HUSTLERS_WEEK_TOP, forbesItems, type ForbesAssets, type ForbesItem, type ForbesKind } from '../game/forbes';
import { DESIGN_BY_ID, isComplete, saleValue } from '../game/property';
import { CAR_BY_ID, JET_BY_ID, jetResale } from '../game/cars';
import { conditionOf, valueOf } from '../game/carCare';
import { JOBS } from '../game/catalog';
import { BUSINESS_BY_ID } from '../game/career';
import { useCareer } from '../net/career';
import { inviteLink, shareLink, userLink } from '../net/deeplink';
import { useSession } from '../net/session';
import { Emoji } from './Icons';
import { Face } from './Face';
import { drawRichCard, type RichCard } from './forbesCard';
import { saveImage } from './saveImage';
import './forbes.css';

interface RichPlayer { uid: string; username: string; name: string | null; balance: number; assets?: ForbesAssets }
interface WeekPlayer { uid: string; username: string; name: string | null; earned: number }
interface Week { players: WeekPlayer[]; last: WeekPlayer[] }

interface Entry {
  uid?: string;
  name: string;
  handle: string;
  /** Net worth on the rich lists, money made on the weekly board. */
  amount: number;
  /** Only the top of the rich list comes with these. */
  assets?: ForbesAssets;
  isMe?: boolean;
}
type Ranked = Entry & { rank: number };

type Tab = 'all' | 'week';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Richest' },
  { id: 'week', label: 'This week' },
];

const ASSET_KINDS: { key: ForbesKind; emoji: string; one: string; many: string }[] = [
  { key: 'businesses', emoji: '🏢', one: 'Business', many: 'Businesses' },
  { key: 'houses', emoji: '🏠', one: 'House', many: 'Houses' },
  { key: 'cars', emoji: '🚗', one: 'Car', many: 'Cars' },
  { key: 'jets', emoji: '✈️', one: 'Jet', many: 'Jets' },
];

const TIERS: { from: number; emoji: string; name: string }[] = [
  { from: 500_000_000, emoji: '💎', name: 'Billionaire Mogul' },
  { from: 100_000_000, emoji: '👑', name: 'Naija Tycoon' },
  { from: 20_000_000, emoji: '💰', name: 'Multi-Millionaire' },
  { from: 5_000_000, emoji: '🛍️', name: 'Big Spender' },
  { from: 1_000_000, emoji: '😎', name: 'Comfortable' },
  { from: 0, emoji: '💪', name: 'On the come-up' },
];
const tierOf = (worth: number) => TIERS.find((t) => worth >= t.from)!;

const CAN_SHARE_FILES = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'card.png', { type: 'image/png' })] });

/** The server's rich list with you slotted in at your live net worth (`me` is null when you aren't on this list). */
function rankRich(players: RichPlayer[], me: Entry | null, myUsername?: string | null): Ranked[] {
  const entries: Entry[] = players
    .filter((p) => p.username !== myUsername && p.balance >= FORBES_MIN_WORTH)
    .map((p) => ({ uid: p.uid, name: p.name || p.username, handle: `@${p.username}`, amount: p.balance, assets: p.assets }));
  if (me) entries.push(me);
  return entries.sort((a, b) => b.amount - a.amount).map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

const rankWeek = (players: WeekPlayer[], myUsername?: string | null): Ranked[] =>
  players.map((p, idx) => ({ uid: p.uid, name: p.name || p.username, handle: `@${p.username}`, amount: p.earned, isMe: p.username === myUsername, rank: idx + 1 }));

export function ForbesApp() {
  const money = useGame((s) => s.money);
  const debtOwed = useGame((s) => s.debtOwed);
  const bankLoanOwed = useGame((s) => s.bankLoanOwed);
  const investments = useGame((s) => s.investments);
  const ownedCars = useGame((s) => s.ownedCars ?? []);
  const carCondition = useGame((s) => s.carCondition);
  const myName = useGame((s) => s.name);
  const myUsername = useSession((s) => s.user?.username);
  const myLook = useGame((s) => s.look);
  const properties = useGame((s) => s.properties);
  const ownedPhones = useGame((s) => s.ownedPhones);
  const freePhone = useGame((s) => s.freePhone);
  const ownedJets = useGame((s) => s.ownedJets ?? []);
  const job = useGame((s) => JOBS.find((j) => j.id === s.jobId));
  // Someone with no job is known for the business they own: the most expensive kind, if they have several.
  const businesses = useCareer((s) => s.businesses);
  const business = businesses.map((b) => BUSINESS_BY_ID[b.type]).sort((a, b) => b.cost - a.cost)[0];
  const myNetWorth = netWorthOf({ money, debtOwed, bankLoanOwed, investments, ownedCars, ownedJets, carCondition, ownedPhones, freePhone, properties });
  const [tab, setTab] = useState<Tab>('all');
  const [rich, setRich] = useState<RichPlayer[] | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [showCard, setShowCard] = useState(false);
  /** Whose receipt is out, by handle. */
  const [receipt, setReceipt] = useState<string | null>(null);
  const asked = useRef(new Set<Tab>());

  useEffect(() => {
    if (asked.current.has(tab)) return;
    asked.current.add(tab);
    if (tab === 'week') {
      fetch('/api/hustlers/week')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setWeek({ players: Array.isArray(data?.players) ? data.players : [], last: Array.isArray(data?.last) ? data.last : [] }))
        .catch(() => setWeek({ players: [], last: [] }));
      return;
    }
    fetch('/api/forbes')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setRich(Array.isArray(data?.players) ? data.players : []))
      .catch(() => setRich([]));
  }, [tab]);

  const myEntry: Entry = {
    name: myName || 'You',
    handle: myUsername ? `@${myUsername}` : '@you',
    amount: myNetWorth,
    assets: {
      businesses: businesses.length, houses: properties.filter(isComplete).length, cars: ownedCars.length, jets: ownedJets.length,
      items: forbesItems([
        ...businesses.map((b) => ({ kind: 'businesses' as const, name: BUSINESS_BY_ID[b.type].name, value: BUSINESS_BY_ID[b.type].cost })),
        ...properties.filter(isComplete).map((p) => ({ kind: 'houses' as const, name: DESIGN_BY_ID[p.design ?? '']?.name ?? 'House', value: saleValue(p) })),
        ...ownedCars.filter((id) => CAR_BY_ID[id]).map((id) => ({ kind: 'cars' as const, name: CAR_BY_ID[id].name, value: valueOf(id, conditionOf(carCondition, id)) })),
        ...ownedJets.filter((id) => JET_BY_ID[id]).map((id) => ({ kind: 'jets' as const, name: JET_BY_ID[id].name, value: jetResale(id) })),
      ]),
    },
    isMe: true,
  };

  const isWeek = tab === 'week';
  // The rich list starts at FORBES_MIN_WORTH: below it you are not ranked.
  const listed = myNetWorth >= FORBES_MIN_WORTH;
  const loaded = isWeek ? !!week : !!rich;
  const ranked = isWeek ? rankWeek(week?.players ?? [], myUsername) : rankRich(rich ?? [], listed ? myEntry : null, myUsername);
  const mine = ranked.find((e) => e.isMe) ?? null;
  const ahead = mine && mine.rank > 1 ? ranked[mine.rank - 2] : null;
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const open = podium.find((e) => e.assets && e.handle === receipt);
  const title = job?.title ?? (business ? `${business.name} Owner` : tierOf(myNetWorth).name);

  if (showCard) {
    const from = mine!;
    const card: RichCard = {
      rank: from.rank, name: myEntry.name, handle: myEntry.handle, title, look: myLook,
      board: isWeek ? 'week' : 'rich',
      amount: nairaShort(isWeek ? from.amount : myNetWorth),
      list: isWeek ? 'This week' : 'Naija City',
    };
    return <MyCard card={card} username={myUsername} onClose={() => setShowCard(false)} />;
  }

  // What the bar at the bottom says about you on this list.
  let chase: string;
  let progress: number | null = null;
  if (mine && !ahead) chase = isWeek ? 'Top earner this week. Keep the money coming!' : 'The richest in Naija. Hold am tight!';
  else if (mine && ahead) {
    chase = `${nairaShort(Math.max(1, ahead.amount - mine.amount))} to pass ${ahead.name}`;
    progress = mine.amount / ahead.amount;
  } else if (isWeek) {
    const full = ranked.length >= HUSTLERS_WEEK_TOP;
    chase = full ? `Make over ${nairaShort(ranked[ranked.length - 1].amount)} this week to get on` : 'Work a shift, run a gig or sell from your shop to get on';
  } else {
    chase = `${nairaShort(FORBES_MIN_WORTH - myNetWorth)} more to make the list`;
    progress = myNetWorth / FORBES_MIN_WORTH;
  }
  const canShare = !!mine;

  return (
    <div className="fb">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setReceipt(null); }}>
            {t.id === 'week' && <Emoji char="🔥" size={13} />} {t.label}
          </button>
        ))}
      </div>

      <div className={`fb-stage ${isWeek ? 'week' : ''}`}>
        <div className="fb-mast">
          <b>{isWeek ? 'Money Makers' : 'Rich List'}</b>
          <span>{isWeek ? 'This week' : 'Naija’s richest'}</span>
        </div>
        <i className="fb-flag" aria-hidden />
        {!loaded ? <small className="fb-note">Updating…</small>
          : ranked.length === 0 ? <small className="fb-note">{isWeek ? 'Nobody has made money this week yet. Be the first.' : 'Nobody has made the list yet.'}</small>
          : (
            <>
              <div className="fb-podium">
                {/* Two, one, three: number one stands in the middle, highest. */}
                {[1, 0, 2].map((i) => {
                  const e = podium[i];
                  const place = i + 1;
                  if (!e) return <div key={place} className={`fb-step p${place} empty`}><span className="fb-step-face" /><small>Open spot</small><span className="fb-pillar">{place}</span></div>;
                  return (
                    <button key={place} className={`fb-step p${place} ${e.isMe ? 'me' : ''} ${receipt === e.handle ? 'open' : ''}`} aria-expanded={e.assets ? receipt === e.handle : undefined}
                      onClick={() => e.assets && setReceipt((r) => (r === e.handle ? null : e.handle))}>
                      <span className="fb-step-face">
                        <Face uid={e.uid} username={e.isMe ? e.name : e.handle.slice(1)} look={e.isMe ? myLook : null} size="fill" />
                        {place === 1 && <i><Emoji char="👑" size={24} /></i>}
                      </span>
                      <b>{e.isMe ? 'You' : e.name}</b>
                      <strong>{isWeek && '+'}{nairaShort(e.amount)}</strong>
                      <span className="fb-pillar">{place}</span>
                    </button>
                  );
                })}
              </div>
              {open?.assets ? <Receipt entry={open} assets={open.assets} />
                : podium.some((e) => e.assets) && <small className="fb-hint">Tap the top three to see what they own</small>}
            </>
          )}
      </div>

      {loaded && rest.length > 0 && (
        <div className="fb-list">
          {rest.map((e) => {
            const tier = tierOf(e.amount);
            return (
              <div key={e.handle} className={`fb-row ${e.isMe ? 'me' : ''}`}>
                <span className="fb-rank">{e.rank}</span>
                <Face uid={e.uid} username={e.isMe ? e.name : e.handle.slice(1)} look={e.isMe ? myLook : null} className="fb-face" />
                <span className="fb-who">
                  <b>{e.name}{e.isMe && <em>You</em>}</b>
                  {isWeek ? <small>{e.handle}</small> : <small><Emoji char={tier.emoji} size={11} /> {tier.name}</small>}
                </span>
                <b className={`fb-amount ${isWeek ? 'up' : ''}`}>{isWeek && '+'}{nairaShort(e.amount)}</b>
              </div>
            );
          })}
        </div>
      )}

      {isWeek && week && (
        <>
          {week.last.length > 0 && (
            <div className="fb-last">
              <h5>Last week’s champions</h5>
              {week.last.map((p, i) => (
                <div key={p.uid} className="fb-last-row">
                  <Emoji char={['🥇', '🥈', '🥉'][i]} size={16} />
                  <Face uid={p.uid} username={p.username} className="fb-face sm" />
                  <span>{p.name || p.username}</span>
                  <b>{nairaShort(p.earned)}</b>
                </div>
              ))}
            </div>
          )}
          <small className="fb-foot">What counts: wages, gigs, business takings, shop sales and rent. Gifts, loans, office pay, winnings and crime don’t.</small>
        </>
      )}

      <div className="fb-dock">
        <div className="fb-me">
          <Face look={myLook} username={myEntry.name} className="fb-me-face" />
          <span className="fb-me-text">
            <b>
              {mine ? `#${mine.rank}` : 'Not ranked'}
              <em>{isWeek ? (mine ? `+${nairaShort(mine.amount)}` : 'this week') : nairaShort(myNetWorth)}</em>
            </b>
            <small>{chase}</small>
            {progress != null && <span className="fb-bar"><i style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%` }} /></span>}
          </span>
          <button className="fb-share" disabled={!canShare} onClick={() => setShowCard(true)}>Share</button>
        </div>
      </div>
    </div>
  );
}

/** What one of the top three owns, itemised like a till receipt. */
function Receipt({ entry, assets }: { entry: Ranked; assets: ForbesAssets }) {
  // An older answer from the server has the counts but not the names: then each kind is just its count.
  const lines = (kind: ForbesKind): ForbesItem[] => assets.items?.filter((i) => i.kind === kind) ?? [];
  const sections = ASSET_KINDS.filter(({ key }) => assets[key] > 0);
  const total = assets.items?.reduce((sum, i) => sum + i.value, 0);
  return (
    <div className="fb-receipt" aria-label={`What ${entry.name} owns`}>
      <div className="fb-receipt-head">
        <b>HUSTLERS</b>
        <small>Rich list · No. {entry.rank}</small>
        <small>{entry.name} · {entry.handle}</small>
      </div>
      {sections.length === 0 && <small className="fb-receipt-foot">Nothing to declare. It is all cash.</small>}
      {sections.map(({ key, emoji, one, many }) => (
        <div key={key} className="fb-receipt-section">
          <span className="fb-receipt-kind"><span><Emoji char={emoji} size={12} /> {assets[key] === 1 ? one : many}</span><span>× {assets[key]}</span></span>
          {lines(key).map((line) => (
            <div key={line.name} className="fb-line"><span>{line.n > 1 ? `${line.n} × ` : ''}{line.name}</span><i /><b>{nairaShort(line.value)}</b></div>
          ))}
        </div>
      ))}
      {total != null && sections.length > 0 && <div className="fb-line"><span>Assets</span><i /><b>{nairaShort(total)}</b></div>}
      <div className="fb-line fb-receipt-total"><span>Net worth</span><i /><b>{nairaShort(entry.amount)}</b></div>
      <small className="fb-receipt-foot">Cash, shares and debts make up the rest.</small>
    </div>
  );
}

/** Your own card, full screen, with ways to send it out. */
function MyCard({ card, username, onClose }: { card: RichCard; username?: string | null; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { rank, name, handle, amount, title, list, look, board } = card;
  useEffect(() => {
    if (canvas.current) void drawRichCard(canvas.current, { rank, name, handle, amount, title, list, look, board });
  }, [rank, name, handle, amount, title, list, look, board]);

  const what = board === 'week' ? 'the Naija City money makers this week' : 'the Naija Rich List';
  const line = `I’m #${rank} on ${what} with ${amount}${board === 'week' ? ' made' : ''}. Come and catch me.`;
  const blob = () => new Promise<Blob | null>((done) => (canvas.current ? canvas.current.toBlob(done, 'image/png') : done(null)));
  const save = async () => {
    const png = await blob();
    if (png) await saveImage(new File([png], 'naija-hustlers.png', { type: 'image/png' }));
  };
  const share = async () => {
    const png = CAN_SHARE_FILES ? await blob() : null;
    if (!png) return void shareLink(username ? userLink(username) : 'https://naija.city', line);
    const file = new File([png], 'naija-hustlers.png', { type: 'image/png' });
    void navigator.share({ files: [file], title: 'Naija City Hustlers', text: `${line}\nPlay here 👉 ${username ? inviteLink(username) : 'https://naija.city'}` }).catch(() => { /* closed the share sheet */ });
  };

  return (
    <div className="fb fb-mycard">
      <canvas ref={canvas} className="fb-card" role="img" aria-label={`${name}, number ${rank} on ${what}, ${amount}`} />
      <div className="fb-card-actions">
        <button onClick={onClose}>Back</button>
        <button onClick={() => void save()}>Save</button>
        <button className="go" onClick={() => void share()}>Share</button>
      </div>
    </div>
  );
}
