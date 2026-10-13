// Forbes app: the rich list by age group with number one on the magazine cover, and your own card to share.
import { useEffect, useRef, useState } from 'react';
import { nairaShort, netWorthOf, useGame } from '../game/store';
import { FORBES_MIN_WORTH, forbesItems, type ForbesAssets, type ForbesItem, type ForbesKind } from '../game/forbes';
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

interface CloudPlayer { uid: string; username: string; name: string | null; balance: number; assets?: ForbesAssets }

interface ForbesEntry {
  uid?: string;
  name: string;
  handle: string;
  worth: number;
  /** Only the top of the list comes with these. */
  assets?: ForbesAssets;
  isMe?: boolean;
}
type Ranked = ForbesEntry & { rank: number };

type AgeTab = 'all' | 'u20' | 'u30';
const AGE_TABS: { id: AgeTab; label: string; under?: number }[] = [
  { id: 'all', label: 'All' },
  { id: 'u20', label: 'Under 20s', under: 20 },
  { id: 'u30', label: 'Under 30s', under: 30 },
];

/** What the card calls the main list. */
const ALL_AGES = 'All ages';

const ASSET_KINDS: { key: ForbesKind; emoji: string; one: string; many: string }[] = [
  { key: 'businesses', emoji: '🏢', one: 'Business', many: 'Businesses' },
  { key: 'houses', emoji: '🏠', one: 'House', many: 'Houses' },
  { key: 'cars', emoji: '🚗', one: 'Car', many: 'Cars' },
  { key: 'jets', emoji: '✈️', one: 'Jet', many: 'Jets' },
];

const CAN_SHARE_FILES = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'card.png', { type: 'image/png' })] });

function wealthTier(worth: number): string {
  if (worth >= 500_000_000) return 'Billionaire Mogul';
  if (worth >= 100_000_000) return 'Naija Tycoon';
  if (worth >= 20_000_000) return 'Multi-Millionaire';
  if (worth >= 5_000_000) return 'Big Spender';
  if (worth >= 1_000_000) return 'Comfortable';
  return 'Naija Hustler';
}

/** The server's list with you slotted in at your live net worth (`me` is null when the list isn't for your age). */
function rankList(players: CloudPlayer[], me: ForbesEntry | null, myUsername?: string | null): Ranked[] {
  const entries: ForbesEntry[] = players
    .filter((p) => p.username !== myUsername && p.balance >= FORBES_MIN_WORTH)
    .map((p) => ({ uid: p.uid, name: p.name || p.username, handle: `@${p.username}`, worth: p.balance, assets: p.assets }));
  if (me) entries.push(me);
  return entries.sort((a, b) => b.worth - a.worth).map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

export function ForbesApp() {
  const money = useGame((s) => s.money);
  const debtOwed = useGame((s) => s.debtOwed);
  const bankLoanOwed = useGame((s) => s.bankLoanOwed);
  const investments = useGame((s) => s.investments);
  const ownedCars = useGame((s) => s.ownedCars ?? []);
  const carCondition = useGame((s) => s.carCondition);
  const myName = useGame((s) => s.name);
  const myUsername = useSession((s) => s.user?.username);
  const myAge = useSession((s) => s.user?.age);
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
  const title = job?.title ?? (business ? `${business.name} Owner` : wealthTier(myNetWorth));
  const [tab, setTab] = useState<AgeTab>('all');
  const [lists, setLists] = useState<Partial<Record<AgeTab, CloudPlayer[]>>>({});
  const [showCard, setShowCard] = useState(false);
  /** Whose receipt is out, by handle. */
  const [receipt, setReceipt] = useState<string | null>(null);
  const asked = useRef(new Set<AgeTab>());

  useEffect(() => {
    if (asked.current.has(tab)) return;
    asked.current.add(tab);
    fetch(tab === 'all' ? '/api/forbes' : `/api/forbes?age=${tab}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setLists((l) => ({ ...l, [tab]: Array.isArray(data?.players) ? data.players : [] })))
      .catch(() => setLists((l) => ({ ...l, [tab]: [] })));
  }, [tab]);

  const myEntry: ForbesEntry = {
    name: myName || 'You',
    handle: myUsername ? `@${myUsername}` : '@you',
    worth: myNetWorth,
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

  const { label, under } = AGE_TABS.find((t) => t.id === tab)!;
  const players = lists[tab];
  // Your age comes with your session; until it does, being on the server's list is proof enough.
  const eligible = !under || (myAge != null ? myAge < under : !!players?.some((p) => p.username === myUsername));
  // The list starts at FORBES_MIN_WORTH: below it you are not ranked.
  const listed = myNetWorth >= FORBES_MIN_WORTH;
  const ranked = rankList(players ?? [], eligible && listed ? myEntry : null, myUsername);
  const mine = ranked.find((e) => e.isMe) ?? null;
  const king = ranked[0];
  const runnersUp = ranked.slice(1, 3);
  const rest = ranked.slice(3, 10);
  if (mine && mine.rank > 10) rest.push(mine);
  const toggleReceipt = (entry: Ranked) => setReceipt((open) => (open === entry.handle ? null : entry.handle));
  const starReceipt = runnersUp.find((e) => e.assets && e.handle === receipt);

  if (showCard) {
    // A list you are too old for has no rank for you: the card falls back to the main list.
    const from = mine ?? rankList(lists.all ?? [], myEntry, myUsername).find((e) => e.isMe)!;
    const card: RichCard = { rank: from.rank, name: myEntry.name, handle: myEntry.handle, worth: nairaShort(myNetWorth), title, list: mine && under ? label : ALL_AGES, look: myLook };
    return <MyCard card={card} username={myUsername} onClose={() => setShowCard(false)} />;
  }

  return (
    <div className="fb">
      <div className="tabs">
        {AGE_TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* The cover belongs to whoever is number one. */}
      <div className="fb-cover">
        <div className="fb-mast">
          <b>Forbes</b>
          <span>{under ? `Richest under ${under}` : 'Naija Rich List'}</span>
        </div>
        {!players ? <small className="fb-note">Updating…</small>
          : !king ? <small className="fb-note">Nobody under {under} has made the list yet.</small>
          : (
            <>
              <div className="fb-king">
                <span className="fb-king-face">
                  <Face uid={king.uid} username={king.isMe ? king.name : king.handle.slice(1)} look={king.isMe ? myLook : null} size="fill" />
                  <i><Emoji char="👑" size={22} /></i>
                </span>
                <span className="fb-king-who">
                  <b>{king.name}{king.isMe && <em>You</em>}</b>
                  <small>{king.handle}</small>
                </span>
                <b className="fb-king-rank">#1</b>
              </div>
              <div className="fb-king-worth">
                <span><small>Net worth</small><b>{nairaShort(king.worth)}</b></span>
                <em>{wealthTier(king.worth)}</em>
              </div>
              {king.assets && <button className="fb-more" aria-expanded={receipt === king.handle} onClick={() => toggleReceipt(king)}>{receipt === king.handle ? 'See less' : 'See more'}</button>}
              {king.assets && receipt === king.handle && <Receipt entry={king} assets={king.assets} />}
            </>
          )}
      </div>

      {players && runnersUp.length > 0 && (
        <div className="fb-top">
          {runnersUp.map((entry) => (
            <div key={entry.handle} className={`fb-star r${entry.rank} ${entry.isMe ? 'me' : ''}`}>
              <span className="fb-star-rank">#{entry.rank}</span>
              <Face uid={entry.uid} username={entry.isMe ? entry.name : entry.handle.slice(1)} look={entry.isMe ? myLook : null} className="fb-star-face" />
              <span className="fb-star-who">
                <b>{entry.name}{entry.isMe && <em>You</em>}</b>
                <small>{entry.handle}</small>
                <strong>{nairaShort(entry.worth)}</strong>
                <i>{wealthTier(entry.worth)}</i>
              </span>
              {entry.assets && <button className="fb-more" aria-expanded={receipt === entry.handle} onClick={() => toggleReceipt(entry)}>{receipt === entry.handle ? 'See less' : 'See more'}</button>}
            </div>
          ))}
          {/* Too wide for a medal card: the receipt runs under both. */}
          {starReceipt?.assets && <Receipt entry={starReceipt} assets={starReceipt.assets} />}
        </div>
      )}

      {players && rest.length > 0 && (
        <div className="fb-list">
          {rest.map((entry) => (
            <div key={entry.handle} className={`fb-row ${entry.isMe ? 'me' : ''} ${entry.rank > 10 ? 'far' : ''}`}>
              <span className="fb-rank">{entry.rank}</span>
              <Face uid={entry.uid} username={entry.isMe ? entry.name : entry.handle.slice(1)} look={entry.isMe ? myLook : null} className="fb-face" />
              <span className="fb-who">
                <b>{entry.name}{entry.isMe && <em>You</em>}</b>
                <small>{entry.handle} · {wealthTier(entry.worth)}</small>
              </span>
              <b className="fb-worth">{nairaShort(entry.worth)}</b>
            </div>
          ))}
        </div>
      )}

      <div className="fb-dock">
        {!listed && <small className="muted small" style={{ display: 'block', textAlign: 'center', marginBottom: 8 }}>The list starts at {nairaShort(FORBES_MIN_WORTH)}. You are worth {nairaShort(myNetWorth)}: {nairaShort(FORBES_MIN_WORTH - myNetWorth)} to go.</small>}
        <button disabled={!players || !lists.all || !listed} onClick={() => setShowCard(true)}>See your card</button>
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
        <b>FORBES</b>
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
      <div className="fb-line fb-receipt-total"><span>Net worth</span><i /><b>{nairaShort(entry.worth)}</b></div>
      <small className="fb-receipt-foot">Cash, shares and debts make up the rest.</small>
    </div>
  );
}

/** Your own rich-list card, full screen, with ways to send it out. */
function MyCard({ card, username, onClose }: { card: RichCard; username?: string | null; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { rank, name, handle, worth, title, list, look } = card;
  useEffect(() => {
    if (canvas.current) void drawRichCard(canvas.current, { rank, name, handle, worth, title, list, look });
  }, [rank, name, handle, worth, title, list, look]);

  const blob = () => new Promise<Blob | null>((done) => (canvas.current ? canvas.current.toBlob(done, 'image/png') : done(null)));
  const save = async () => {
    const png = await blob();
    if (png) await saveImage(new File([png], 'naija-rich-list.png', { type: 'image/png' }));
  };
  const share = async () => {
    const line = `I’m #${rank} on the Naija Rich List${list === ALL_AGES ? '' : ` (${list})`} with ${worth}. Come and catch me.`;
    const png = CAN_SHARE_FILES ? await blob() : null;
    if (!png) return void shareLink(username ? userLink(username) : 'https://naija.city', line);
    const file = new File([png], 'naija-rich-list.png', { type: 'image/png' });
    void navigator.share({ files: [file], title: 'Naija Rich List', text: `${line}\nPlay here 👉 ${username ? inviteLink(username) : 'https://naija.city'}` }).catch(() => { /* closed the share sheet */ });
  };

  return (
    <div className="fb fb-mycard">
      <canvas ref={canvas} className="fb-card" role="img" aria-label={`${name}, number ${rank} on the Naija Rich List, net worth ${worth}`} />
      <div className="fb-card-actions">
        <button onClick={onClose}>Back</button>
        <button onClick={() => void save()}>Save</button>
        <button className="go" onClick={() => void share()}>Share</button>
      </div>
    </div>
  );
}
