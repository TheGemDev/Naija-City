// Cribs: your houses' style score and how to raise it, the best houses in the country, house tours, saved layouts,
// one-tap style packs and interior designers for hire. Rules in game/cribs.ts, network in net/cribs.ts.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ITEMS, ITEM_LIST } from '../game/catalog';
import { houseLayout, type HouseLayout, type PlacedItem } from '../game/grid';
import { PAINT_COLOURS } from '../game/paint';
import { DESIGN_BY_ID, REGION_BY_ID, houseTitle } from '../game/property';
import { designOfKey } from '../game/exterior';
import { CITY_NAME, type CivicCity } from '../game/civic';
import { activeDesignOf, houseKeyOf, nairaShort, naira, useGame } from '../game/store';
import {
  CRIB_TIER_BY_ID, CRIB_TIERS, DESIGN_JOB, LAYOUTS, STYLE_PACKS, autoPlace, cribTips, packPrice, scoreCrib, tierOf, type CribPart, type DesignDraft, type StylePack,
} from '../game/cribs';
import {
  applyBlocker, applySnapshot, currentSnapshot, deleteLayout, deleteTour, hireDesigner, jobAction, jobOp, loadJob, loadJobs, loadLayouts, loadMyCribs, loadTop,
  loadTours, packSnapshot, postTour, quoteHere, saveLayout, useCribs, visitTour, type CribHouse, type DesignJob, type JobLog, type SavedLayout, type Tour,
} from '../net/cribs';
import { useSession } from '../net/session';
import { loadSnaps, useSnaps } from '../net/snaps';
import { FloorPlan } from './FloorPlan';
import { Emoji } from './Icons';
import { Face } from './Face';
import './cribs.css';

type Tab = 'mine' | 'top' | 'tours' | 'design';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mine', label: 'My crib' },
  { id: 'top', label: 'Top cribs' },
  { id: 'tours', label: 'Tours' },
  { id: 'design', label: 'Designers' },
];

const err = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const toast = (t: string) => useGame.getState().toast(t);
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const cityName = (c: string) => CITY_NAME[c as CivicCity] ?? c;
const designName = (key: string | null | undefined) => DESIGN_BY_ID[designOfKey(key) ?? '']?.name ?? 'Starter house';

/** The houses I can score: finished properties and, while I live there, the starter house. */
function useMyHouses() {
  const properties = useGame((s) => s.properties);
  const active = useGame(houseKeyOf);
  return useMemo(() => {
    const done = properties.filter((p) => p.stage >= 4 && p.design);
    const list = done.map((p) => ({ pid: p.id, name: houseTitle(p), design: p.design, region: p.region }));
    if (!list.some((h) => h.pid === active)) list.unshift({ pid: active, name: 'Where I live', design: null, region: '' });
    return list;
  }, [properties, active]);
}

/** A yes/no card over the app, for anything that spends money. */
function Confirm({ title, lines, total, ok, onOk, onCancel, busy }: { title: string; lines: ReactNode[]; total?: number; ok: string; onOk(): void; onCancel(): void; busy?: boolean }) {
  const money = useGame((s) => s.money);
  const short = total !== undefined && total > money;
  // Over the phone's screen when there is one, so it stays inside the phone; else over the page.
  const screen = document.querySelector('.phone .screen');
  const card = (
    <div className={`cb-confirm${screen ? ' in-phone' : ''}`} role="dialog" aria-label={title}>
      <div className="cb-confirm-card">
        <b>{title}</b>
        <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        {total !== undefined && (
          <div className="cb-confirm-total"><span>Total</span><b>{naira(total)}</b></div>
        )}
        {short && <small className="cb-warn">You have {naira(money)}. Not enough.</small>}
        <div className="cb-confirm-row">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn go" disabled={busy || short} onClick={onOk}>{busy ? '…' : ok}</button>
        </div>
      </div>
    </div>
  );
  return screen ? createPortal(card, screen) : card;
}

/* ---------- Score card ---------- */

function ScoreRing({ score, tier, size = 92 }: { score: number; tier: string; size?: number }) {
  const t = CRIB_TIER_BY_ID[tier] ?? tierOf(score);
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <span className="cb-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="cb-ring-bg" />
        <circle cx="50" cy="50" r={r} className="cb-ring-fg" style={{ stroke: t.colour, strokeDasharray: `${(c * score) / 100} ${c}` }} />
      </svg>
      <b>{score}</b>
    </span>
  );
}

export function TierChip({ tier, score }: { tier: string; score?: number }) {
  const t = CRIB_TIER_BY_ID[tier] ?? CRIB_TIERS[0];
  return <span className="cb-tier" style={{ background: t.colour }}><Emoji char={t.icon} size={13} /> {t.name}{score !== undefined ? ` · ${score}` : ''}</span>;
}

function Breakdown({ parts }: { parts: CribPart[] }) {
  return (
    <div className="cb-parts">
      {parts.map((p) => (
        <div key={p.key} className="cb-part">
          <span className="cb-part-head"><Emoji char={p.icon} size={15} /> {p.label}<em>{Math.round(p.got)}/{p.max}</em></span>
          <span className="cb-bar"><i style={{ width: `${(p.got / p.max) * 100}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

function Tips({ parts }: { parts: CribPart[] }) {
  const tips = cribTips({ base: 0, parts, value: 0, items: 0 });
  if (!tips.length) return <div className="cb-note">Nothing left to fix. This crib is finished. 👑</div>;
  return (
    <div className="cb-tips">
      {tips.map((t) => (
        <div key={t.key} className="cb-tip"><Emoji char={t.icon} size={16} /><span className="cb-tip-text">{t.tip}</span><b>+{t.gain}</b></div>
      ))}
    </div>
  );
}

/** The house I'm standing in, scored on the spot (for guests and before the server answers). */
function useLocalScore() {
  const items = useGame((s) => s.items);
  const design = useGame((s) => activeDesignOf(s));
  const key = useGame(houseKeyOf);
  const walls = useGame((s) => s.wallEdits[key]);
  const paint = useGame((s) => s.housePaint[key]);
  const rooms = useGame((s) => s.properties.find((p) => p.id === key)?.rooms);
  return useMemo(() => scoreCrib({ items, design, walls, paint, rooms }), [items, design, walls, paint, rooms]);
}

/* ---------- My crib ---------- */

function MyCrib() {
  const signedIn = useSession((s) => !!s.user);
  const houses = useCribs((s) => s.houses);
  const loading = useCribs((s) => s.loading);
  const active = useGame(houseKeyOf);
  const local = useLocalScore();
  const [pick, setPick] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'tour'>(null);
  useEffect(() => { if (signedIn) loadMyCribs(true).catch((e) => toast(err(e))); }, [signedIn]);
  const server = houses.find((h) => h.pid === (pick ?? active)) ?? houses[0];
  const house: CribHouse = server ?? { pid: active, design: null, city: '', base: local.base, score: local.base, tier: tierOf(local.base).id, value: local.value, items: local.items, parts: local.parts, rating: null };
  return (
    <>
      {houses.length > 1 && (
        <div className="tabs cb-houses">
          {houses.map((h) => (
            <button key={h.pid} className={h.pid === house.pid ? 'on' : ''} onClick={() => setPick(h.pid)}>{designName(h.design)}{h.city ? ` · ${cityName(h.city)}` : ''}</button>
          ))}
        </div>
      )}
      <div className="cb-hero" style={{ ['--tier' as string]: (CRIB_TIER_BY_ID[house.tier] ?? tierOf(house.score)).colour }}>
        <ScoreRing score={house.score} tier={house.tier} />
        <span className="cb-hero-who">
          <small>Crib score</small>
          <TierChip tier={house.tier} />
          <span className="cb-hero-sub">
            {designName(house.design)}{house.city ? ` · ${cityName(house.city)}` : ''} · {house.items} pieces · {nairaShort(house.value)}
          </span>
          {house.rating
            ? <span className="cb-hero-sub">⭐ {house.rating.avg} from {house.rating.n} visitor{house.rating.n === 1 ? '' : 's'}{house.score !== house.base ? ` (${house.score > house.base ? '+' : '−'}${Math.abs(house.score - house.base)})` : ''}</span>
            : <span className="cb-hero-sub">No visitor ratings yet. Invite people round!</span>}
        </span>
      </div>
      {!signedIn && <div className="cb-note">Scored on this phone. Sign in to get on the Cribs leaderboard.</div>}
      {loading && !server && <div className="cb-note">Scoring your house…</div>}
      <h4>Breakdown</h4>
      <Breakdown parts={house.parts} />
      <h4>How to raise it</h4>
      <Tips parts={house.parts} />
      {signedIn && (
        <div className="cb-row">
          <button className="btn" onClick={() => setSheet('tour')}>📸 Post a house tour</button>
        </div>
      )}
      {sheet === 'tour' && <TourComposer pid={house.pid} onClose={() => setSheet(null)} />}
      <Layouts />
      <Packs />
      <TierLadder score={house.score} />
    </>
  );
}

function TierLadder({ score }: { score: number }) {
  return (
    <>
      <h4>Tiers</h4>
      <div className="cb-ladder">
        {CRIB_TIERS.map((t) => (
          <span key={t.id} className={score >= t.min ? 'got' : ''} style={{ ['--c' as string]: t.colour }}>
            <Emoji char={t.icon} size={18} /><b>{t.name}</b><small>{t.min}+</small>
          </span>
        ))}
      </div>
    </>
  );
}

function TourComposer({ pid, onClose }: { pid: string; onClose(): void }) {
  const me = useSession((s) => s.user?.uid);
  const all = useSnaps((s) => s.global);
  const snaps = useMemo(() => all.filter((x) => x.uid === me), [all, me]);
  const [caption, setCaption] = useState('');
  const [open, setOpen] = useState(true);
  const [snap, setSnap] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadSnaps('global'); }, []);
  const post = async () => {
    setBusy(true);
    try {
      await postTour(pid, caption, open, snap);
      toast('🏠 Your house tour is on Cribs');
      onClose();
    } catch (e) {
      toast(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cb-card cb-compose">
      <b>Show off this house</b>
      <input value={caption} maxLength={120} placeholder="Say something about it…" onChange={(e) => setCaption(e.target.value)} />
      <label className="cb-check"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Open house: anyone can walk in from the tour</label>
      <small>Add a photo from your Snaps (the plan of the house is always on the card):</small>
      <div className="cb-snaps">
        <button className={snap === null ? 'on' : ''} onClick={() => setSnap(null)}>Plan only</button>
        {snaps.slice(0, 6).map((x) => (
          <button key={x.id} className={snap === x.id ? 'on' : ''} onClick={() => setSnap(x.id)}><img src={x.url} alt="" /></button>
        ))}
      </div>
      <div className="cb-row">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn go" disabled={busy} onClick={() => void post()}>Post tour</button>
      </div>
    </div>
  );
}

/* ---------- Layouts ---------- */

function Layouts() {
  const signedIn = useSession((s) => !!s.user);
  const layouts = useCribs((s) => s.layouts);
  const design = useGame((s) => activeDesignOf(s));
  const key = useGame(houseKeyOf);
  const wallEdits = useGame((s) => s.wallEdits[key]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<SavedLayout | null>(null);
  useEffect(() => { if (signedIn) loadLayouts().catch(() => {}); }, [signedIn]);
  if (!signedIn) return null;
  const save = async () => {
    setBusy(true);
    try {
      await saveLayout(name.trim() || `Layout ${layouts.length + 1}`);
      setName('');
      toast('💾 Layout saved');
    } catch (e) {
      toast(err(e));
    } finally {
      setBusy(false);
    }
  };
  const quote = confirm ? quoteHere(confirm.snapshot.items) : null;
  const apply = () => {
    if (!confirm) return;
    const why = applyBlocker();
    if (why) return toast(why);
    const r = applySnapshot(confirm.snapshot, { label: `Layout “${confirm.name}”` });
    toast(`🛋️ “${confirm.name}” is in.${r.bought ? ` Bought ${r.bought} piece${r.bought === 1 ? '' : 's'} for ${naira(r.spent)}.` : ''}${r.stored ? ` ${r.stored} didn’t fit and went to storage.` : ''}`);
    setConfirm(null);
  };
  const sameDesign = (l: SavedLayout) => designOfKey(l.snapshot.design) === designOfKey(design);
  return (
    <>
      <h4>Saved layouts · {layouts.length}/{LAYOUTS.max}</h4>
      <div className="cb-card cb-save">
        <input value={name} maxLength={LAYOUTS.nameMax} placeholder="Name this arrangement" onChange={(e) => setName(e.target.value)} />
        <button className="btn sm" disabled={busy || layouts.length >= LAYOUTS.max} onClick={() => void save()}>Save current</button>
      </div>
      <div className="cb-grid">
        {layouts.map((l) => (
          <div key={l.id} className="cb-card cb-layout">
            <FloorPlan layout={houseLayout(l.snapshot.design, sameDesign(l) ? wallEdits : null)} items={l.snapshot.items} inner={l.snapshot.paint?.inner} className="sm" />
            <b>{l.name}</b>
            <small>{designName(l.snapshot.design)} · {l.items} pieces · {nairaShort(l.value)}</small>
            {!sameDesign(l) && <small className="cb-warn">Different house: what doesn’t fit is stored</small>}
            <div className="cb-row">
              <button className="btn sm ghost" onClick={() => void deleteLayout(l.id).catch((e) => toast(err(e)))}>Delete</button>
              <button className="btn sm" onClick={() => setConfirm(l)}>Restore</button>
            </div>
          </div>
        ))}
      </div>
      {confirm && quote && (
        <Confirm
          title={`Restore “${confirm.name}”`}
          lines={[
            `${quote.reused} piece${quote.reused === 1 ? '' : 's'} from this house and storage reused`,
            ...quote.missing.map((m) => <span key={m.type}><Emoji char={ITEMS[m.type].icon} size={14} /> {ITEMS[m.type].name}{m.n > 1 ? ` × ${m.n}` : ''} <em>{naira(m.price * m.n)}</em></span>),
            quote.missing.length ? 'Missing pieces are bought at today’s prices.' : 'Nothing to buy.',
            'Everything else in the house goes to storage.',
          ]}
          total={quote.total}
          ok={quote.total ? `Buy & restore` : 'Restore'}
          onOk={apply}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

/* ---------- Style packs ---------- */

function usePackPlan(pack: StylePack) {
  const items = useGame((s) => s.items);
  const design = useGame((s) => activeDesignOf(s));
  const key = useGame(houseKeyOf);
  const walls = useGame((s) => s.wallEdits[key]);
  const rooms = useGame((s) => s.properties.find((p) => p.id === key)?.rooms);
  return useMemo(() => {
    const layout = houseLayout(design, walls);
    const plan = autoPlace(pack.items.map((type) => ({ type, rot: 0 })), items, layout, { rooms });
    return { layout, plan, items };
  }, [pack, items, design, walls, rooms]);
}

function PackCard({ pack, onApply }: { pack: StylePack; onApply(): void }) {
  const { layout, plan, items } = usePackPlan(pack);
  const fresh = useMemo(() => new Set(plan.placed.map((_, i) => `p${i}`)), [plan]);
  const shown = [...items.map((i) => ({ ...i })), ...plan.placed.map((p, i) => ({ ...p, id: `p${i}`, paint: pack.itemPaint?.[p.type] }))];
  return (
    <div className="cb-card cb-pack" style={{ ['--a' as string]: pack.bg[0], ['--b' as string]: pack.bg[1] }}>
      <div className="cb-pack-head"><Emoji char={pack.icon} size={26} /><span><b>{pack.name}</b><small>{pack.blurb}</small></span></div>
      <FloorPlan layout={layout} items={shown} inner={pack.paint.inner} fresh={fresh} className="sm" />
      <div className="cb-pack-icons">{pack.items.map((t, i) => <Emoji key={i} char={ITEMS[t]?.icon ?? '❔'} size={16} />)}</div>
      <div className="cb-swatches">
        {[pack.paint.inner, pack.paint.outer].filter(Boolean).map((c, i) => <i key={i} title={c} style={{ background: PAINT_COLOURS.find((p) => p.id === c)?.hex }} />)}
        <span>{pack.items.length} pieces · {naira(packPrice(pack))}</span>
      </div>
      {plan.left.length > 0 && <small className="cb-warn">{plan.left.length} won’t fit here and will go to storage</small>}
      <button className="btn" onClick={onApply}>Preview & apply</button>
    </div>
  );
}

function Packs() {
  const [pick, setPick] = useState<StylePack | null>(null);
  return (
    <>
      <h4>Style packs</h4>
      <div className="cb-packs">
        {STYLE_PACKS.map((p) => <PackCard key={p.id} pack={p} onApply={() => setPick(p)} />)}
      </div>
      {pick && <PackConfirm pack={pick} onClose={() => setPick(null)} />}
    </>
  );
}

function PackConfirm({ pack, onClose }: { pack: StylePack; onClose(): void }) {
  const { plan } = usePackPlan(pack);
  const quote = quoteHere(pack.items.map((type) => ({ type })), false);
  const apply = () => {
    const why = applyBlocker();
    if (why) return toast(why);
    const snap = packSnapshot(pack.id, [...plan.placed, ...plan.left.map((l) => ({ ...l, x: 0, z: 0, rot: 0 }))]);
    const r = applySnapshot(snap, { keepRest: true, label: `Style pack: ${pack.name}` });
    toast(`${pack.icon} ${pack.name} applied.${r.bought ? ` ${r.bought} new piece${r.bought === 1 ? '' : 's'} for ${naira(r.spent)}.` : ''}${r.stored ? ` ${r.stored} went to storage.` : ''}`);
    onClose();
  };
  return (
    <Confirm
      title={`${pack.icon} Apply ${pack.name}`}
      lines={[
        `${plan.placed.length} pieces placed around the house${plan.left.length ? `, ${plan.left.length} to storage` : ''}`,
        quote.reused ? `${quote.reused} taken from your storage` : 'Nothing in storage matches',
        `Walls: ${[pack.paint.inner && `inside ${pack.paint.inner}`, pack.paint.outer && `outside ${pack.paint.outer}`].filter(Boolean).join(', ')}`,
        'Your furniture already in the house stays where it is.',
      ]}
      total={quote.total}
      ok="Buy & apply"
      onOk={apply}
      onCancel={onClose}
    />
  );
}

/* ---------- Top cribs ---------- */

const CITY_TABS: { id: string | null; label: string }[] = [
  { id: null, label: 'Nationwide' }, { id: 'lagos', label: 'Lagos' }, { id: 'abuja', label: 'Abuja' }, { id: 'kaduna', label: 'Kaduna' }, { id: 'kano', label: 'Kano' },
];

function TopCribs() {
  const [city, setCity] = useState<string | null>(null);
  const list = useCribs((s) => s.top[city ?? 'all']);
  const me = useSession((s) => s.user?.uid);
  useEffect(() => { loadTop(city).catch((e) => toast(err(e))); }, [city]);
  return (
    <>
      <div className="tabs">
        {CITY_TABS.map((c) => <button key={c.label} className={c.id === city ? 'on' : ''} onClick={() => setCity(c.id)}>{c.label}</button>)}
      </div>
      {!list ? <div className="cb-note">Loading…</div> : !list.length ? <div className="cb-note">No cribs ranked here yet. Furnish yours and be the first.</div> : (
        <div className="cb-list">
          {list.map((h, i) => (
            <div key={h.uid} className={`cb-rank-row${h.uid === me ? ' me' : ''}${i < 3 ? ` top${i + 1}` : ''}`}>
              <span className="cb-rank">{i + 1}</span>
              <Face uid={h.uid} username={h.username} className="cb-face" />
              <span className="cb-who">
                <b>@{h.username}</b>
                <small>{designName(h.design)} · {cityName(h.city)}{h.rating ? ` · ⭐ ${h.rating.avg} (${h.rating.n})` : ''}</small>
                <TierChip tier={h.tier} />
              </span>
              <ScoreRing score={h.score} tier={h.tier} size={46} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Tours ---------- */

function TourCard({ t, mine }: { t: Tour; mine: boolean }) {
  const layout = houseLayout(t.layout.design, null);
  return (
    <div className="cb-card cb-tour">
      <div className="cb-tour-head">
        <Face uid={t.uid} username={t.username} className="cb-face" />
        <span className="cb-tour-who"><b>@{t.username}</b><small>{designName(t.layout.design)} · {t.region ? `${REGION_BY_ID[t.region]?.name ?? ''}, ` : ''}{cityName(t.city)} · {ago(t.at)}</small></span>
        <TierChip tier={t.tier} score={t.score} />
      </div>
      {t.photo && <img className="cb-tour-photo" src={t.photo} alt={`@${t.username}’s house`} />}
      <FloorPlan layout={layout} items={t.layout.items} inner={t.layout.paint?.inner} />
      {t.caption && <p className="cb-tour-caption">“{t.caption}”</p>}
      <div className="cb-row">
        {t.open && <span className="pill-tag on">Open house</span>}
        <span className="cb-grow" />
        {mine
          ? <button className="btn sm ghost" onClick={() => void deleteTour(t.id).catch((e) => toast(err(e)))}>Delete</button>
          : <button className="btn sm go" onClick={() => void visitTour(t).catch((e) => toast(err(e)))}>{t.open ? '🚶🏾 Visit' : '🚪 Ask to visit'}</button>}
      </div>
    </div>
  );
}

function Tours() {
  const tours = useCribs((s) => s.tours);
  const me = useSession((s) => s.user?.uid);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { loadTours().then(() => setLoaded(true)).catch((e) => toast(err(e))); }, []);
  if (!loaded && !tours.length) return <div className="cb-note">Loading tours…</div>;
  if (!tours.length) return <div className="cb-note">No house tours this week. Post yours from My crib.</div>;
  return <div className="cb-feed">{tours.map((t) => <TourCard key={t.id} t={t} mine={t.uid === me} />)}</div>;
}

/* ---------- Designers ---------- */

const STATUS_LABEL: Record<string, string> = {
  offered: 'Waiting for the designer', active: 'Designer at work', submitted: 'Ready for review', approved: 'Approved', reverted: 'Reverted',
  declined: 'Declined', cancelled: 'Withdrawn', expired: 'Offer expired',
};

function Designers() {
  const signedIn = useSession((s) => !!s.user);
  const jobs = useCribs((s) => s.jobs);
  const designer = useCribs((s) => s.designer);
  const [open, setOpen] = useState<number | null>(null);
  const [hiring, setHiring] = useState(false);
  useEffect(() => { if (signedIn) loadJobs().catch((e) => toast(err(e))); }, [signedIn]);
  if (!signedIn) return <div className="cb-note">Sign in to hire a designer or work as one.</div>;
  if (open !== null) return <JobView id={open} onBack={() => { setOpen(null); void loadJobs(); }} />;
  return (
    <>
      <div className="cb-hero cb-hero-design">
        <Emoji char="🛋️" size={40} />
        <span className="cb-hero-who">
          <small>Interior design</small>
          <b>Level {designer?.level ?? 1} designer</b>
          <span className="cb-hero-sub">{designer?.jobs ?? 0} approved job{designer?.jobs === 1 ? '' : 's'} · {designer?.xp ?? 0} XP</span>
        </span>
      </div>
      <div className="cb-note">Hire another player to do up your house. Their fee and your furniture budget sit in escrow; they get the keys for a few hours; you approve their work (they get paid) or revert it.</div>
      {hiring ? <HireForm onDone={() => setHiring(false)} /> : <button className="btn" onClick={() => setHiring(true)}>🤝 Hire a designer</button>}
      <h4>Jobs</h4>
      {!jobs.length && <div className="cb-note">No jobs yet.</div>}
      <div className="cb-list">
        {jobs.map((j) => (
          <button key={j.id} className="cb-job" onClick={() => setOpen(j.id)}>
            <Emoji char={j.role === 'client' ? '🏠' : '🎨'} size={22} />
            <span className="cb-who">
              <b>{j.role === 'client' ? `Designer @${j.designer.username}` : `For @${j.client.username}`}</b>
              <small>{STATUS_LABEL[j.status]} · fee {naira(j.fee)} · budget {naira(j.budget)}{j.spent ? ` (${naira(j.spent)} spent)` : ''}</small>
            </span>
            <span className={`cb-status s-${j.status}`}>{j.status}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function HireForm({ onDone }: { onDone(): void }) {
  const houses = useMyHouses();
  const [designer, setDesigner] = useState('');
  const [pid, setPid] = useState(houses[0]?.pid ?? 'starter');
  const [fee, setFee] = useState(50_000);
  const [budget, setBudget] = useState(500_000);
  const [hours, setHours] = useState<number>(2);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const hire = async () => {
    setBusy(true);
    try {
      await hireDesigner(designer, pid, fee, budget, hours, note);
      toast(`🤝 Offer sent to @${designer.replace(/^@/, '')}. Your money is in escrow.`);
      onDone();
    } catch (e) {
      toast(err(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <div className="cb-card cb-form">
      <label>Designer<input value={designer} placeholder="@username" onChange={(e) => setDesigner(e.target.value)} /></label>
      <label>House
        <select value={pid} onChange={(e) => setPid(e.target.value)}>
          {houses.map((h) => <option key={h.pid} value={h.pid}>{h.name}</option>)}
        </select>
      </label>
      <label>Their fee<input type="number" min={DESIGN_JOB.minFee} step={5000} value={fee} onChange={(e) => setFee(Number(e.target.value))} /></label>
      <label>Furniture budget<input type="number" min={0} step={50000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
      <label>Time with the keys
        <span className="tabs">{DESIGN_JOB.hours.map((h) => <button key={h} className={hours === h ? 'on' : ''} onClick={() => setHours(h)}>{h}h</button>)}</span>
      </label>
      <label>Brief<input value={note} maxLength={DESIGN_JOB.noteMax} placeholder="e.g. Make the parlour owambe-ready" onChange={(e) => setNote(e.target.value)} /></label>
      <div className="cb-row">
        <button className="btn ghost" onClick={onDone}>Cancel</button>
        <button className="btn go" disabled={!designer.trim()} onClick={() => setConfirm(true)}>Review</button>
      </div>
      {confirm && (
        <Confirm
          title={`Hire @${designer.replace(/^@/, '')}`}
          lines={[
            <span key="f">Designer’s fee <em>{naira(fee)}</em></span>,
            <span key="b">Furniture budget <em>{naira(budget)}</em></span>,
            `Both go into escrow now. Unspent budget comes back when the job ends.`,
            `They get ${hours} hour${hours === 1 ? '' : 's'} with your house, then you approve (fee paid) or revert (${Math.round(DESIGN_JOB.calloutShare * 100)}% call-out kept).`,
          ]}
          total={fee + budget}
          ok="Hire"
          busy={busy}
          onOk={() => void hire()}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function JobView({ id, onBack }: { id: number; onBack(): void }) {
  const [job, setJob] = useState<DesignJob | null>(null);
  const [log, setLog] = useState<JobLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'approve' | 'revert'>(null);
  const [view, setView] = useState<'draft' | 'before'>('draft');
  const reload = async () => {
    const d = await loadJob(id);
    setJob(d.job);
    setLog(d.log);
  };
  useEffect(() => { reload().catch((e) => toast(err(e))); }, [id]);
  if (!job || !job.draft) return <div className="cb-note">Loading job…</div>;
  const act = async (action: Parameters<typeof jobAction>[1]) => {
    setBusy(true);
    try {
      await jobAction(job.id, action);
      await reload();
    } catch (e) {
      toast(err(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const layout = houseLayout(job.design, null);
  const editing = job.role === 'designer' && job.status === 'active';
  const left = Math.max(0, job.budget - job.spent);
  const callout = Math.round(job.fee * DESIGN_JOB.calloutShare);
  return (
    <>
      <button className="cb-back" onClick={onBack}>‹ Jobs</button>
      <div className="cb-card cb-job-head">
        <b>{job.role === 'client' ? `@${job.designer.username} is designing your house` : `Designing @${job.client.username}’s house`}</b>
        <small>{STATUS_LABEL[job.status]} · {designName(job.design)}{job.expiresAt && job.status === 'active' ? ` · keys until ${new Date(job.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</small>
        <small>Fee {naira(job.fee)} · budget {naira(job.budget)} · spent {naira(job.spent)} · left {naira(left)}</small>
        {job.note && <small>Brief: “{job.note}”</small>}
      </div>
      {editing
        ? <DesignEditor job={job} layout={layout} onChange={(next) => setJob(next)} />
        : (
          <>
            {job.base && (
              <div className="tabs">
                <button className={view === 'draft' ? 'on' : ''} onClick={() => setView('draft')}>The design</button>
                <button className={view === 'before' ? 'on' : ''} onClick={() => setView('before')}>Before</button>
              </div>
            )}
            <FloorPlan layout={layout} items={(view === 'draft' ? job.draft : job.base ?? job.draft).items} inner={(view === 'draft' ? job.draft : job.base ?? job.draft).paint?.inner} fresh={new Set(view === 'draft' ? job.draft.bought : [])} />
            <DraftScore draft={view === 'draft' ? job.draft : job.base ?? job.draft} design={job.design} />
          </>
        )}
      <div className="cb-row cb-actions">
        {job.role === 'designer' && job.status === 'offered' && (<>
          <button className="btn ghost" disabled={busy} onClick={() => void act('decline')}>Decline</button>
          <button className="btn go" disabled={busy} onClick={() => void act('accept')}>Accept the job</button>
        </>)}
        {job.role === 'designer' && job.status === 'active' && <button className="btn go" disabled={busy} onClick={() => void act('submit')}>Hand it over</button>}
        {job.role === 'client' && job.status === 'offered' && <button className="btn ghost" disabled={busy} onClick={() => void act('cancel')}>Withdraw offer</button>}
        {job.role === 'client' && (job.status === 'submitted' || job.status === 'active') && (<>
          <button className="btn danger" disabled={busy} onClick={() => setConfirm('revert')}>Revert</button>
          <button className="btn go" disabled={busy} onClick={() => setConfirm('approve')}>Approve</button>
        </>)}
      </div>
      {confirm && (
        <Confirm
          title={confirm === 'approve' ? 'Approve the design' : 'Revert the house'}
          lines={confirm === 'approve'
            ? [`@${job.designer.username} is paid ${naira(job.fee)} from escrow.`, `${naira(left)} of unspent budget comes back to you.`, `The new arrangement goes into your house; what they bought is yours.`]
            : [`Your house stays as it was. What they bought (${naira(job.spent)}) goes to your storage.`, `@${job.designer.username} keeps ${naira(callout)} for their time.`, `${naira(job.fee - callout + left)} comes back to you.`]}
          ok={confirm === 'approve' ? 'Approve & pay' : 'Revert'}
          busy={busy}
          onOk={() => void act(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
      <h4>Job log</h4>
      <div className="cb-log">
        {log.map((l, i) => <div key={i}><small>{new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><span>{l.detail || l.action}</span>{l.amount ? <b>{naira(l.amount)}</b> : null}</div>)}
      </div>
    </>
  );
}

function DraftScore({ draft, design }: { draft: DesignDraft; design: string | null }) {
  const s = useMemo(() => scoreCrib({ items: draft.items, design, paint: draft.paint }), [draft, design]);
  return <div className="cb-row cb-draft-score"><span>Style score</span><TierChip tier={tierOf(s.base).id} score={s.base} /></div>;
}

type Pick = { kind: 'item'; id: string } | { kind: 'storage'; id: string } | { kind: 'buy'; type: string } | null;

/** The designer's view: tap a piece then a spot to move it; or take one from storage or the shop and tap a spot. */
function DesignEditor({ job, layout, onChange }: { job: DesignJob; layout: HouseLayout; onChange(j: DesignJob): void }) {
  const [pick, setPick] = useState<Pick>(null);
  const [rot, setRot] = useState(0);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [shop, setShop] = useState(false);
  const [busy, setBusy] = useState(false);
  const draft = job.draft!;
  const left = job.budget - job.spent;
  const run = async (op: Parameters<typeof jobOp>[2]) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await jobOp(job.id, job.version, op);
      onChange({ ...job, version: r.version, draft: r.draft, spent: r.spent });
      setPick(null);
    } catch (e) {
      toast(err(e));
    } finally {
      setBusy(false);
    }
  };
  const onCell = (x: number, z: number) => {
    setHover({ x, z });
    if (!pick) return;
    if (pick.kind === 'item') void run({ op: 'move', itemId: pick.id, x, z, rot });
    else if (pick.kind === 'storage') void run({ op: 'place', itemId: pick.id, x, z, rot });
    else void run({ op: 'buy', type: pick.type, x, z, rot });
  };
  const selected = pick?.kind === 'item' ? draft.items.find((i) => i.id === pick.id) : null;
  const ghostType = pick?.kind === 'buy' ? pick.type : pick?.kind === 'storage' ? draft.storage.find((i) => i.id === pick.id)?.type : selected?.type;
  const ghost = ghostType && hover ? { type: ghostType, x: hover.x, z: hover.z, rot } : null;
  const shopList = ITEM_LIST.filter((d) => !d.fixed && d.price <= left).sort((a, b) => a.price - b.price);
  return (
    <>
      <div className="cb-note">{pick ? 'Now tap where it goes.' : 'Tap a piece to move or store it, or pick one from storage or the shop.'} Budget left: <b>{naira(left)}</b></div>
      <FloorPlan layout={layout} items={draft.items} inner={draft.paint?.inner} selected={pick?.kind === 'item' ? pick.id : null} fresh={new Set(draft.bought)} ghost={ghost}
        onItem={(id) => { if (ITEMS[draft.items.find((i) => i.id === id)?.type ?? '']?.fixed) return; setPick({ kind: 'item', id }); setRot(draft.items.find((i) => i.id === id)?.rot ?? 0); }}
        onCell={onCell} />
      <div className="cb-row">
        <button className="btn sm ghost" disabled={!pick} onClick={() => setRot((r) => (r + 1) % 4)}>↻ Rotate</button>
        {selected && <button className="btn sm ghost" disabled={busy} onClick={() => void run({ op: 'store', itemId: selected.id })}>📦 Store {ITEMS[selected.type].name}</button>}
        {pick && <button className="btn sm ghost" onClick={() => setPick(null)}>Cancel</button>}
      </div>
      <h4>Storage · {draft.storage.length}</h4>
      <div className="cb-tray">
        {draft.storage.map((i: PlacedItem) => (
          <button key={i.id} className={pick?.kind === 'storage' && pick.id === i.id ? 'on' : ''} onClick={() => setPick({ kind: 'storage', id: i.id })}>
            <Emoji char={ITEMS[i.type]?.icon ?? '📦'} size={20} /><small>{ITEMS[i.type]?.name}</small>
          </button>
        ))}
        {!draft.storage.length && <small className="cb-note">Nothing in storage.</small>}
      </div>
      <h4>Walls</h4>
      <div className="cb-swatches big">
        {PAINT_COLOURS.slice(0, 12).map((c) => (
          <button key={c.id} title={c.name} className={draft.paint?.inner === c.id ? 'on' : ''} style={{ background: c.hex }} onClick={() => void run({ op: 'paint', part: 'inner', colour: c.id })} />
        ))}
      </div>
      <h4><button className="cb-link" onClick={() => setShop(!shop)}>{shop ? '▾' : '▸'} Buy with the client’s budget</button></h4>
      {shop && (
        <div className="cb-tray shop">
          {shopList.slice(0, 60).map((d) => (
            <button key={d.type} className={pick?.kind === 'buy' && pick.type === d.type ? 'on' : ''} onClick={() => setPick({ kind: 'buy', type: d.type })}>
              <Emoji char={d.icon} size={20} /><small>{d.name}</small><em>{nairaShort(d.price)}</em>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- The app ---------- */

export function CribsApp() {
  const [tab, setTab] = useState<Tab>('mine');
  const best = useCribs((s) => s.best);
  return (
    <div className="cb">
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'mine' && <MyCrib />}
      {tab === 'top' && <TopCribs />}
      {tab === 'tours' && <Tours />}
      {tab === 'design' && <Designers />}
      {best && tab !== 'mine' && <small className="cb-foot">Your best: <TierChip tier={best.tier} score={best.score} /></small>}
    </div>
  );
}

/** The profile badge: my best crib's tier. */
export function CribBadge() {
  const signedIn = useSession((s) => !!s.user);
  const best = useCribs((s) => s.best);
  useEffect(() => { if (signedIn && !best) loadMyCribs().catch(() => {}); }, [signedIn, best]);
  if (!best) return null;
  const t = CRIB_TIER_BY_ID[best.tier] ?? tierOf(best.score);
  return (
    <div className="list-card cb-badge" style={{ ['--c' as string]: t.colour }}>
      <Emoji char={t.icon} size={28} />
      <span><b>{t.name}</b><small>Crib score {best.score}/100 · Cribs app</small></span>
    </div>
  );
}

export { currentSnapshot };
