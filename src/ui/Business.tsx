// Business app. Home lists the businesses you own with an "Open a business" button pinned to the bottom; that
// opens a create page (kind, place, name and badge, fees), and tapping a business opens its manage page. A second
// tab browses every other player's shop. Rules in src/game/career.ts, server side in worker/career.ts.

import { ORIGIN_OF, restockPrice } from '../game/trade';
import { scaledFee } from '../game/treasury';
import { useStateCaps, useStateLaws } from '../net/roads';
import { useEffect, useState } from 'react';
import { naira, useGame } from '../game/store';
import {
  BIZ, BIZ_COLOURS, BIZ_ICONS, BIZ_SIZES, BIZ_SIZE_ORDER, BUSINESSES, BUSINESS_BY_ID, MARKET_PRODUCTS, MARKET_PRODUCT_BY_ID, SKILL_BY_ID, STALLS,
  openTotal, registrationFee, resizeCost, type BizSize, type BusinessDef, type BusinessType,
} from '../game/career';
import { cityMap, placeHere } from '../game/city';
import { regionOf } from '../game/regions';
import { useSession } from '../net/session';
import {
  brandBusiness, buyBusiness, collectBusiness, loadCareer, manageBusinessListing, moveBusiness, resizeBusiness, useCareer, type BizInfo,
} from '../net/career';
import { cityHere, loadPlaceShops, standingIn, useCityHere, usePlaceShops, useSharedShop, type PlaceShops } from '../net/market';
import { shareLink, shopLink } from '../net/deeplink';
import { PlayerShops } from './Market';
import './business.css';

type Page = { kind: 'home' } | { kind: 'create' } | { kind: 'manage'; id: number };

const Badge = ({ icon, color, large }: { icon: string; color: string; large?: boolean }) => (
  <span className={`biz-badge ${large ? 'lg' : ''}`} style={{ background: color }}>{icon}</span>
);

const freeStalls = (id: string, summary: Record<string, PlaceShops>) => (STALLS[id]?.slots ?? 0) - (summary[id]?.taken ?? 0);

/** A stall's place as it stands in its own city: the airport is a different place in each. */
const placeIn = (city: string, id: string) => cityMap(city).placeById[id];
/** The places in a city that a kind of business can open at. */
const placesFor = (def: BusinessDef, city: string) => def.places.filter((id) => STALLS[id] && cityMap(city).placeById[id]);

/** The place to suggest for a new stall: where you are standing if it fits, else the first place with room. */
function suggestedPlace(def: BusinessDef, summary: Record<string, PlaceShops>) {
  const here = standingIn();
  const places = placesFor(def, cityHere());
  if (here && places.includes(here) && freeStalls(here, summary) > 0) return here;
  return places.find((id) => freeStalls(id, summary) > 0) ?? places[0] ?? '';
}

/** The places in the city you are in that a kind of business can open at, as a drop-down. A place with no stall left can't be picked. */
function PlacePicker({ def, value, onChange, keep }: { def: BusinessDef; value: string; onChange(place: string): void; keep?: string }) {
  const summary = usePlaceShops((s) => s.places);
  const city = useCityHere();
  return (
    <select className="text-input" aria-label="Where to open" value={value} onChange={(e) => onChange(e.target.value)}>
      {placesFor(def, city).map((id) => {
        const place = placeIn(city, id);
        const stall = STALLS[id];
        if (!place || !stall) return null;
        const full = freeStalls(id, summary) <= 0 && id !== keep;
        return (
          <option key={id} value={id} disabled={full}>
            {place.icon} {place.name}, {place.area}{id === keep ? ' · you are here' : full ? ' · full' : ''}
          </option>
        );
      })}
    </select>
  );
}

/** Name, icon and colour: the badge players see on the shop. */
function BrandFields({ def, name, setName, icon, setIcon, color, setColor }: {
  def: BusinessDef; name: string; setName(v: string): void; icon: string; setIcon(v: string): void; color: string; setColor(v: string): void;
}) {
  return (
    <>
      <input className="text-input" aria-label="Business name" placeholder={`Name your ${def.name.toLowerCase()}`} maxLength={BIZ.maxNameLen} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="biz-picks" role="group" aria-label="Icon">
        {[def.icon, ...BIZ_ICONS].map((i) => (
          <button key={i} className={`biz-pick ${icon === i ? 'on' : ''}`} aria-label={`Icon ${i}`} aria-pressed={icon === i} onClick={() => setIcon(i)}>{i}</button>
        ))}
      </div>
      <div className="biz-picks" role="group" aria-label="Badge colour">
        {BIZ_COLOURS.map((c) => (
          <button key={c} className={`biz-swatch ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
        ))}
      </div>
    </>
  );
}

/* ---------- Create ---------- */

function CreatePage({ back, done }: { back(): void; done(type: BusinessType): void }) {
  const { businesses, skills } = useCareer();
  const summary = usePlaceShops((s) => s.places);
  const money = useGame((s) => s.money);
  const owned = new Set(businesses.map((b) => b.type));
  const level = (id: string) => skills.find((s) => s.id === id)?.level ?? 1;
  const canOpen = (d: BusinessDef) => !owned.has(d.id) && level(d.skill) >= d.minSkill;
  const here = standingIn();
  // A business opens in the city you are in.
  const city = useCityHere();

  // Start on something you can open right where you stand, else the cheapest you qualify for.
  const [type, setType] = useState<BusinessType | null>(() =>
    (BUSINESSES.find((d) => canOpen(d) && !!here && placesFor(d, city).includes(here)) ?? BUSINESSES.find(canOpen))?.id ?? null);
  const def = type ? BUSINESS_BY_ID[type] : null;
  const [placeId, setPlaceId] = useState(() => (def ? suggestedPlace(def, summary) : ''));
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(def?.icon ?? '🏪');
  const [color, setColor] = useState<string>(BIZ_COLOURS[0]);
  const [size, setSize] = useState<BizSize>('small');
  const [busy, setBusy] = useState(false);

  function pickType(d: BusinessDef) {
    setType(d.id);
    setPlaceId(suggestedPlace(d, summary));
    // Keep a custom icon; swap the default one for the new kind's.
    if (!BIZ_ICONS.includes(icon)) setIcon(d.icon);
  }

  const place = placeIn(city, placeId);
  // The state the business opens in sets the registration fee.
  const laws = useStateLaws(city);
  const caps = useStateCaps();
  const cost = def ? openTotal(def, size, laws.bizFee) : 0;
  const registration = def ? scaledFee(registrationFee(def, size), laws.bizFee) : 0;
  const full = !!def && (!place || freeStalls(placeId, summary) <= 0);
  const short = Math.max(0, cost - money);

  async function open() {
    if (!def || busy) return;
    setBusy(true);
    const ok = await buyBusiness({ type: def.id, name, place: placeId, icon, color, size });
    setBusy(false);
    void loadPlaceShops(0);
    if (ok) done(def.id);
  }

  return (
    <>
      <div className="biz-back">
        <button onClick={back}>← Back</button>
        <b>Open a business</b>
      </div>

      {def && (
        <div className="biz-preview">
          <Badge icon={icon} color={color} large />
          <span className="tile-info">
            <b>{name.trim() || def.name}</b>
            <small>{def.name}</small>
            <small>📍 {place ? `${place.name}, ${place.area}` : 'Pick a place'}</small>
          </span>
        </div>
      )}

      <div className="biz-step"><i>1</i> What kind?</div>
      <div className="biz-types">
        {BUSINESSES.map((d) => {
          const locked = level(d.skill) < d.minSkill;
          return (
            <button key={d.id} className={`biz-type ${type === d.id ? 'on' : ''}`} disabled={locked || owned.has(d.id)} onClick={() => pickType(d)}>
              <span>{d.icon}</span>
              <b>{d.name}</b>
              <small>{owned.has(d.id) ? '✅ You own one' : locked ? `🔒 ${SKILL_BY_ID[d.skill].label} Lv ${d.minSkill}` : naira(d.cost)}</small>
            </button>
          );
        })}
      </div>
      {!def && <small className="muted">Train a skill at {placeHere('poly')?.name ?? 'the polytechnic'} to unlock more kinds of business.</small>}

      {def && (
        <>
          <small className="muted">{def.blurb}</small>

          <div className="biz-step"><i>2</i> Where?</div>
          <small className="muted">A {def.name.toLowerCase()} can only open at these places in {regionOf(city).name}. Players who walk in see your shop there.</small>
          <PlacePicker def={def} value={placeId} onChange={setPlaceId} />

          <div className="biz-step"><i>3</i> How big?</div>
          <small className="muted">A bigger building holds more of each product and costs more to open. You can build bigger later.</small>
          <div className="biz-types biz-sizes">
            {BIZ_SIZE_ORDER.map((s) => (
              <button key={s} className={`biz-type ${size === s ? 'on' : ''}`} aria-pressed={size === s} onClick={() => setSize(s)}>
                <span>{BIZ_SIZES[s].icon}</span>
                <b>{BIZ_SIZES[s].label}</b>
                <small>{naira(openTotal(def, s, laws.bizFee))}</small>
                <small>Holds {BIZ_SIZES[s].shelf} each</small>
              </button>
            ))}
          </div>

          <div className="biz-step"><i>4</i> Name and badge</div>
          <BrandFields def={def} name={name} setName={setName} icon={icon} setIcon={setIcon} color={color} setColor={setColor} />

          <div className="biz-step"><i>5</i> What it costs</div>
          <div className="biz-fees">
            <div><span>Stall fit-out<small>Equipment, signboard and first paint</small></span><b>{naira(cost - registration)}</b></div>
            <div><span>CAC registration<small className="biz-gov">🏛️ {regionOf(city).name}: {laws.bizFee}% of standard · max {caps.bizFee}%</small></span><b>{naira(registration)}</b></div>
            <div className="total"><span>To open today</span><b>{naira(cost)}</b></div>
          </div>
          <small className="muted">No guaranteed income: you buy stock at wholesale, set your price and earn when other players buy from your shop. Stock only leaves the shelf when someone buys, and the shop is open for as long as there is something on it.</small>
        </>
      )}

      <div className="biz-footer">
        <button disabled={!def || busy || full || short > 0} onClick={() => void open()}>
          {busy ? 'Opening…' : def ? `Open for ${naira(cost)}` : 'Nothing to open yet'}
        </button>
        {def && (full || short > 0) && <small>{!place ? `Nowhere in ${regionOf(city).name} takes a ${def.name.toLowerCase()}.` : full ? `Every stall at ${place.name} is taken. Pick another place.` : `You need ${naira(short)} more.`}</small>}
      </div>
    </>
  );
}

/* ---------- Manage ---------- */

/** One product on the shelf. Tap it to open its price and stock controls; everything else stays folded away. */
function ProductRow({ b, productId, open, toggle }: { b: BizInfo; productId: string; open: boolean; toggle(): void }) {
  const item = MARKET_PRODUCT_BY_ID[productId];
  const listing = b.listings.find((l) => l.product === productId);
  const [price, setPrice] = useState(listing?.price ?? item?.price ?? 0);
  const [quantity, setQuantity] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPrice(listing?.price ?? item?.price ?? 0); }, [listing?.price, item?.price]);
  // Goods made in the shop's own state are cheaper; goods from another carry that state's export levy. The server charges the same.
  const origin = ORIGIN_OF[productId];
  const originLaws = useStateLaws(origin ?? b.city);
  if (!item) return null;
  const stock = restockPrice(item.wholesale, productId, b.city, originLaws.exportLevy);
  const tag = stock.origin ? (stock.local ? 'local' : `from ${regionOf(stock.origin).name}`) : '';
  const room = Math.min(BIZ.maxRestock, b.shelf - (listing?.stock ?? 0));
  const top = item.wholesale * BIZ.maxMarketPriceMultiple;
  const priceOk = price >= item.wholesale && price <= top;
  const changed = quantity > 0 || (!!listing && price !== listing.price);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await manageBusinessListing(b.id, productId, price, quantity);
      setQuantity(0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`biz-product ${open ? 'on' : ''}`}>
      <button className="biz-product-head" aria-expanded={open} onClick={toggle}>
        <span className="tile-icon">{item.icon}</span>
        <span className="tile-info">
          <b>{item.name}</b>
          <small>{listing ? `${naira(listing.price)} each · ${listing.stock} in stock · ${listing.sold} sold` : 'Not on your shelf yet'}</small>
        </span>
        <span className="biz-product-cta">{open ? 'Close' : listing ? 'Edit' : 'Sell this'}</span>
      </button>
      {open && (
        <div className="biz-product-body">
          <label>
            <small>Your price (you buy it at {naira(stock.unit)}{tag ? ` · ${tag}` : ''})</small>
            <input className="text-input" type="number" inputMode="numeric" min={item.wholesale} max={top} step={100} value={price} disabled={busy} onChange={(e) => setPrice(Number(e.target.value))} />
          </label>
          {!priceOk && <small className="biz-warn">Price must be between {naira(item.wholesale)} and {naira(top)}.</small>}
          <small>Add stock · room for {Math.max(0, room)} more</small>
          <div className="biz-qty" role="group" aria-label="How many to add">
            {[0, 5, 10, 25].filter((q) => q <= room).map((q) => (
              <button key={q} className={quantity === q ? 'on' : ''} aria-pressed={quantity === q} disabled={busy} onClick={() => setQuantity(q)}>{q ? `+${q}` : 'None'}</button>
            ))}
            {room > 0 && ![5, 10, 25].includes(room) && (
              <button className={quantity === room ? 'on' : ''} aria-pressed={quantity === room} disabled={busy} onClick={() => setQuantity(room)}>Fill +{room}</button>
            )}
          </div>
          <button className="btn go" disabled={busy || !priceOk || !changed || (!listing && quantity < 1)} onClick={() => void save()}>
            {busy ? 'Saving…' : quantity > 0 ? `Buy ${quantity} · ${naira(stock.unit * quantity)}` : 'Save price'}
          </button>
        </div>
      )}
    </div>
  );
}

type ManageTab = 'overview' | 'products' | 'grow';

function ManagePage({ b, back }: { b: BizInfo; back(): void }) {
  const stateLaws = useStateLaws(b.city);
  const permit = scaledFee(BIZ.moveFee, stateLaws.moveFee);
  const def = BUSINESS_BY_ID[b.type];
  const place = placeIn(b.city, b.place);
  // A stall moves within its own city, and the stalls listed are those of the city you are in.
  const away = useCityHere() !== b.city;
  const [tab, setTab] = useState<ManageTab>('overview');
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(b.name);
  const [icon, setIcon] = useState(b.icon);
  const [color, setColor] = useState(b.color);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState(b.place || def.places[0]);
  useEffect(() => { setMoveTo(b.place || def.places[0]); }, [b.place, def.places]);
  const products = MARKET_PRODUCTS.filter((p) => p.business === b.type);
  const units = b.listings.reduce((sum, l) => sum + l.stock, 0);
  const sold = b.listings.reduce((sum, l) => sum + l.sold, 0);

  return (
    <>
      <div className="biz-back">
        <button onClick={back}>← Back</button>
        <b>{b.name}</b>
      </div>

      <div className="biz-preview">
        <Badge icon={b.icon} color={b.color} large />
        <span className="tile-info">
          <b>{b.name}</b>
          <small>{def.name} · {BIZ_SIZES[b.size].icon} {BIZ_SIZES[b.size].label}</small>
          <small>📍 {place ? `${place.name}, ${place.area} · ${regionOf(b.city).name}` : 'No stall yet'}</small>
          <span className={`biz-chip ${b.open ? 'open' : b.hasStall ? 'closed' : 'warn'}`} style={{ alignSelf: 'flex-start', marginTop: 3 }}>
            {b.open ? `🟢 Open · ${units} in stock` : b.hasStall ? '🔴 Closed · add stock to open' : '⚠️ Stall lapsed · add stock to take it back'}
          </span>
        </span>
      </div>

      <div className="tabs">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>📊 Overview</button>
        <button className={tab === 'products' ? 'on' : ''} onClick={() => setTab('products')}>🛒 Products</button>
        <button className={tab === 'grow' ? 'on' : ''} onClick={() => setTab('grow')}>📈 Grow</button>
      </div>

      {tab === 'overview' && (
        <>
          {/* The one thing that keeps the shop open: something on the shelf. It only leaves when a player buys. */}
          <div className="biz-do">
            <span className="tile-info">
              <small>{b.open ? 'On the shelf' : 'Out of stock'}</small>
              <b>{b.open ? `${units} unit${units === 1 ? '' : 's'}` : 'Closed'}</b>
            </span>
            <button className={`btn ${b.open ? '' : 'go'}`} onClick={() => setTab('products')}>📦 Add stock</button>
          </div>
          <div className="biz-do">
            <span className="tile-info">
              <small>Sold to players</small>
              <b>{sold} unit{sold === 1 ? '' : 's'}</b>
            </span>
          </div>
          {b.pending > 0 && (
            <div className="biz-do">
              <span className="tile-info">
                <small>Ready to collect</small>
                <b className="good">{naira(b.pending)}</b>
              </span>
              <button className="btn go" onClick={() => void collectBusiness(b.id)}>💰 Collect</button>
            </div>
          )}
          <small className="muted">Every sale is paid straight into your wallet. Stock stays on the shelf until a player buys it.</small>
        </>
      )}

      {tab === 'products' && (
        <>
          <small className="muted">What players can buy from you. Tap a product to set its price or add stock. Your {BIZ_SIZES[b.size].label.toLowerCase()} holds {b.shelf} of each.</small>
          {products.map((p) => (
            <ProductRow key={p.id} b={b} productId={p.id} open={openProduct === p.id} toggle={() => setOpenProduct(openProduct === p.id ? null : p.id)} />
          ))}
        </>
      )}

      {tab === 'grow' && (
        <>
          <h4>Building size</h4>
          <small className="muted">A bigger building holds more of each product.</small>
          <div className="biz-types biz-sizes">
            {BIZ_SIZE_ORDER.map((s) => {
              const current = s === b.size;
              const smaller = BIZ_SIZE_ORDER.indexOf(s) < BIZ_SIZE_ORDER.indexOf(b.size);
              return (
                <button key={s} className={`biz-type ${current ? 'on' : ''}`} disabled={current || smaller} onClick={() => void resizeBusiness(b.id, s)}>
                  <span>{BIZ_SIZES[s].icon}</span>
                  <b>{BIZ_SIZES[s].label}</b>
                  <small>{current ? '✅ Yours now' : smaller ? 'Smaller' : naira(resizeCost(def, b.size, s))}</small>
                  <small>Holds {BIZ_SIZES[s].shelf} each</small>
                </button>
              );
            })}
          </div>

          <small className="muted">{regionOf(b.city).name} takes {stateLaws.bizTax}% business tax on what you collect and {stateLaws.salesTax}% sales tax on your marketplace sales.</small>

          <h4>Location</h4>
          {away ? (
            <small className="muted">This stall is in {regionOf(b.city).name}. Travel there to move it to another place.</small>
          ) : moving ? (
            <>
              <small className="muted">Busier places have more players walking in. A move permit costs {naira(permit)}, paid to {regionOf(b.city).name}.</small>
              <PlacePicker def={def} value={moveTo} onChange={setMoveTo} keep={b.hasStall ? b.place : undefined} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => setMoving(false)}>Cancel</button>
                <button className="btn go" style={{ flex: 2 }} disabled={moveTo === b.place && b.hasStall} onClick={() => void moveBusiness(b.id, moveTo).then((ok) => { void loadPlaceShops(0); if (ok) setMoving(false); })}>
                  Move here · {naira(permit)}
                </button>
              </div>
            </>
          ) : (
            <button className="btn" onClick={() => setMoving(true)}>🚚 Move to another place · {naira(permit)}</button>
          )}

          <h4>Name and badge</h4>
          {editing ? (
            <>
              <div className="biz-preview">
                <Badge icon={icon} color={color} />
                <span className="tile-info"><b>{name.trim() || b.name}</b><small>How players will see it</small></span>
              </div>
              <BrandFields def={def} name={name} setName={setName} icon={icon} setIcon={setIcon} color={color} setColor={setColor} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn go" style={{ flex: 2 }} onClick={() => void brandBusiness(b.id, name, icon, color).then((ok) => { if (ok) setEditing(false); })}>Save</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setEditing(true)}>✏️ Rename or restyle</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => void shareLink(shopLink(b.id), `${b.name} on Naija City`)}>↗️ Share shop link</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ---------- Home ---------- */

function Home({ open, create }: { open(id: number): void; create(): void }) {
  const { businesses, loaded } = useCareer();
  const units = (b: BizInfo) => b.listings.reduce((sum, l) => sum + l.stock, 0);

  return (
    <>
      <div className="hero biz-hero">
        <div>
          <small>{businesses.length} business{businesses.length === 1 ? '' : 'es'} · {businesses.filter((b) => b.open).length} open</small>
          <b>{businesses.reduce((sum, b) => sum + units(b), 0)}</b>
          <small>units on your shelves</small>
        </div>
      </div>

      {businesses.map((b) => {
        const place = placeIn(b.city, b.place);
        return (
          <div key={b.id} className="biz-card">
            <div className="biz-card-top">
              <Badge icon={b.icon} color={b.color} />
              <span className="tile-info">
                <b>{b.name}</b>
                <small>{BUSINESS_BY_ID[b.type].name} · 📍 {place ? `${place.name}, ${regionOf(b.city).name}` : 'No stall yet'}</small>
              </span>
              <span className={`biz-chip ${b.open ? 'open' : b.hasStall ? 'closed' : 'warn'}`}>{b.open ? 'Open' : b.hasStall ? 'Closed' : 'Stall lapsed'}</span>
            </div>
            <div className="biz-card-money">
              <b>{units(b)}</b>
              <small>in stock</small>
            </div>
            <div className="biz-card-actions">
              {b.pending > 0 && <button className="btn go" onClick={() => void collectBusiness(b.id)}>💰 Collect {naira(b.pending)}</button>}
              <button className={`btn ${b.open ? '' : 'go'}`} onClick={() => open(b.id)}>{b.open ? '⚙️ Manage' : '📦 Add stock'}</button>
            </div>
          </div>
        );
      })}

      {loaded && !businesses.length && (
        <div className="biz-empty">
          <span>🏪</span>
          <b>You don’t run a business yet</b>
          <p>Rent a stall at a place on the map: a POS stand at the Secretariat, a bar at the club, a kiosk in the market. Players who walk in buy from you.</p>
        </div>
      )}

      <div className="biz-footer">
        <button onClick={create}>＋ Open a business</button>
      </div>
    </>
  );
}

export function BusinessApp() {
  const ok = !!useSession((s) => s.user?.username);
  // A share link (/shop/<id>) lands on the Player shops tab, on that shop's shelf.
  const shared = useSharedShop((s) => s.shop);
  const [tab, setTab] = useState<'mine' | 'shops'>(() => (useSharedShop.getState().shop ? 'shops' : 'mine'));
  useEffect(() => { if (shared) { setTab('shops'); setPage({ kind: 'home' }); } }, [shared]);
  const [page, setPage] = useState<Page>({ kind: 'home' });
  const businesses = useCareer((s) => s.businesses);
  useEffect(() => { if (ok) { void loadCareer(); void loadPlaceShops(); } }, [ok]);
  if (!ok) {
    return (
      <div className="list-card" style={{ padding: 14 }}>
        <b>Sign in to run a business</b>
        <small className="muted">Your businesses are saved on your account.</small>
      </div>
    );
  }

  const home = () => setPage({ kind: 'home' });
  if (page.kind === 'create') {
    // Land on the new business's page once it exists, so the next step (stocking the shelf) is right there.
    return <CreatePage back={home} done={(type) => {
      const made = useCareer.getState().businesses.find((b) => b.type === type);
      setPage(made ? { kind: 'manage', id: made.id } : { kind: 'home' });
    }} />;
  }
  const managed = page.kind === 'manage' ? businesses.find((b) => b.id === page.id) : undefined;
  if (managed) return <ManagePage b={managed} back={home} />;

  return (
    <>
      <div className="tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => { useSharedShop.setState({ shop: null }); setTab('mine'); }}>🏪 My businesses</button>
        <button className={tab === 'shops' ? 'on' : ''} onClick={() => { useSharedShop.setState({ shop: null }); setTab('shops'); }}>🛍️ Player shops</button>
      </div>
      {tab === 'mine' ? <Home open={(id) => setPage({ kind: 'manage', id })} create={() => setPage({ kind: 'create' })} /> : <PlayerShops />}
    </>
  );
}
