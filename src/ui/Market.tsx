// Player shops: what other players' businesses sell. Every shop is a stall at a place on the map, so the same
// listings show in three spots: the Business app's directory, the place's own hub when you are inside, and the
// map sheet, where you can browse a place's shops and order before you travel.

import { useEffect, useState } from 'react';
import { BIZ, BUSINESSES, STALLS, deliveryFee, typesAt } from '../game/career';
import { cityMap } from '../game/city';
import { regionOf } from '../game/regions';
import { naira, useGame } from '../game/store';
import { followDeepLink, shareLink, shopLink } from '../net/deeplink';
import { useSession } from '../net/session';
import './business.css';
import { buyMarketListing, browseMarket, loadPlaceShops, useCityHere, usePlaceShops, useSharedShop, type MarketListing } from '../net/market';

/** Places that rent stalls, in map-list order. */
/** The places in a city that rent stalls, by the names they go by there. */
const stallPlaces = (city: string) => Object.keys(STALLS).flatMap((id) => cityMap(city).placeById[id] ?? []).sort((a, b) => a.name.localeCompare(b.name));

/** The place the player is inside right now, or null. */
const useStandingIn = () => useGame((s) => (s.view === 'place' ? s.insideId : null));

/** Opens the Business app on the phone (closing the place hub it was tapped from). */
const openBusinessApp = () => useGame.setState({ panel: 'phone', openApp: 'business', placeHubOpen: false });

/** One product on a shop's shelf: a tile with its price, how many to take and the button that buys it. */
function Product({ item, own, here, onBought }: { item: MarketListing; own: boolean; here: boolean; onBought(): void }) {
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const max = Math.min(item.stock, BIZ.maxMarketOrder);
  const total = item.price * quantity;
  const fee = here ? 0 : deliveryFee(total);
  const step = (by: -1 | 1) => {
    setQuantity(Math.max(1, Math.min(max, quantity + by)));
    setRequestId(crypto.randomUUID());
  };

  async function buy() {
    setBusy(true);
    setError('');
    const result = await buyMarketListing(item.id, quantity, requestId);
    if (result.ok) {
      setRequestId(crypto.randomUUID());
      onBought();
    } else {
      setError(result.error);
      if (!result.retryable) setRequestId(crypto.randomUUID());
    }
    setBusy(false);
  }

  return (
    <div className="shop-product">
      <span className="shop-product-icon">{item.icon}</span>
      <b>{item.name}</b>
      <small><b className="good">{naira(item.price)}</b> · {item.stock} left</small>
      {own ? (
        <small className="shop-product-own">Yours · {item.sold} sold</small>
      ) : (
        <>
          <div className="shop-qty" role="group" aria-label={`Quantity of ${item.name}`}>
            <button type="button" aria-label="One less" disabled={busy || quantity <= 1} onClick={() => step(-1)}>−</button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" aria-label="One more" disabled={busy || quantity >= max} onClick={() => step(1)}>+</button>
          </div>
          <button className="btn sm go" disabled={busy || !item.open || max < 1} onClick={() => void buy()}>
            {busy ? 'Buying…' : max < 1 ? 'Sold out' : `${here ? 'Buy' : 'Deliver'} · ${naira(total + fee)}`}
          </button>
        </>
      )}
      {error && <small className="error-text">{error}</small>}
    </div>
  );
}

/** A whole business on one card: who and where it is, with its shelf of products to buy underneath. */
function Shop({ items, username, startOpen, onBought, onGo }: { items: MarketListing[]; username: string; startOpen?: boolean; onBought(): void; onGo?(): void }) {
  const [open, setOpen] = useState(!!startOpen);
  const shop = items[0];
  // Shops listed are in the city you are in; one opened from a share link can be in another.
  const inTown = useCityHere() === shop.city;
  const here = useStandingIn() === shop.place && inTown;
  const own = shop.seller === username;
  const business = BUSINESSES.find((b) => b.id === shop.businessType);
  const place = cityMap(shop.city).placeById[shop.place];
  const from = Math.min(...items.map((item) => item.price));
  return (
    <div className={`list-card shop-card ${open ? 'open' : ''}`}>
      <button type="button" className="shop-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="biz-badge" style={{ background: shop.businessColor }}>{shop.businessIcon}</span>
        <span className="tile-info">
          <b>{shop.businessName}</b>
          <small>{business?.name ?? 'Business'} · @{shop.seller}{own ? ' · yours' : ''}</small>
          <small className="shop-shelf">📍 {place ? `${place.icon} ${place.name}` : shop.area}{inTown ? '' : `, ${regionOf(shop.city).name}`} · {items.length} product{items.length === 1 ? '' : 's'} from {naira(from)}</small>
        </span>
        <span className={`shop-status ${shop.open ? '' : 'closed'}`}>{shop.open ? 'Open' : 'Closed'}</span>
        <span className="shop-chevron" aria-hidden>›</span>
      </button>
      {open && (
        <div className="shop-body">
          <div className="shop-products">
            {items.map((item) => <Product key={item.id} item={item} own={own} here={here} onBought={onBought} />)}
          </div>
          <div className="shop-note">
            <small className="muted">{own ? 'Your own shop: you can’t buy from it.' : here ? 'You are here: no delivery fee.' : 'Not here: delivery is added to the price.'}</small>
            {own ? (
              <button className="btn sm" onClick={openBusinessApp}>Manage</button>
            ) : !here && inTown && place && (
              <button className="btn sm" onClick={() => (onGo ? onGo() : void followDeepLink({ kind: 'place', placeId: place.id, city: shop.city }))}>📍 Go there</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The listings on a page, gathered into their businesses in the order they came. */
function byShop(items: MarketListing[]) {
  const shops = new Map<number, MarketListing[]>();
  for (const item of items) shops.set(item.businessId, [...(shops.get(item.businessId) ?? []), item]);
  return [...shops.values()];
}

/** Loads one page of listings, reloading when the filters change. */
function useListings(filters: { q: string; type: string; place: string; page: number; shop?: number; friends?: boolean }, reload: number) {
  const { q, type, place, page, shop, friends } = filters;
  const [data, setData] = useState<{ items: MarketListing[]; pages: number; total: number }>({ items: [], pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The shops are those of the city you are in.
  const city = useCityHere();
  useEffect(() => {
    let stale = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void browseMarket({ q: q.trim(), type, place, page, shop, friends })
        .then((result) => { if (!stale) setData(result); })
        .catch((reason: unknown) => { if (!stale) setError(reason instanceof Error ? reason.message : 'Could not load shops'); })
        .finally(() => { if (!stale) setLoading(false); });
    }, q ? 250 : 0);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [q, type, place, page, shop, friends, reload, city]);
  return { data, loading, error };
}

function Pager({ page, pages, loading, setPage }: { page: number; pages: number; loading: boolean; setPage(page: number): void }) {
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <button className="btn sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>← Previous</button>
      <small className="muted">Page {page} of {pages}</small>
      <button className="btn sm" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Next →</button>
    </div>
  );
}

/** The Business app's Player shops tab: every open shop in town, filtered by kind of business and by place. */
export function PlayerShops() {
  const username = useSession((s) => s.user?.username ?? '');
  const standing = useStandingIn();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const city = useCityHere();
  const [place, setPlace] = useState(() => (standing && standing in STALLS ? standing : ''));
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  // Everybody's shops, or only the ones my friends own.
  const [friends, setFriends] = useState(false);
  // A shop opened from a share link: only its shelf, until the player asks for every shop again.
  const shared = useSharedShop((s) => s.shop);
  const { data, loading, error } = useListings(shared ? { q: '', type: '', place: '', page, shop: shared.id } : { q: query, type, place, page, friends }, reload);
  const summary = usePlaceShops((s) => s.places);
  useEffect(() => { void loadPlaceShops(); }, [reload, city]);

  if (shared) {
    return (
      <>
        <div className="biz-preview">
          <span className="biz-badge lg" style={{ background: shared.color }}>{shared.icon}</span>
          <span className="tile-info">
            <b>{shared.name}</b>
            <small>{shared.kind}{shared.owner ? ` · @${shared.owner}` : ''}</small>
            <small>📍 {shared.where} · {shared.open ? '🟢 Open' : '🔴 Closed'}</small>
          </span>
          <button className="btn sm" onClick={() => void shareLink(shopLink(shared.id), shared.name)}>↗️ Share</button>
        </div>
        {loading && <small className="muted">Loading the shelf…</small>}
        {error && <small className="error-text">{error}</small>}
        {!loading && !error && !data.items.length && (
          <div className="list-card" style={{ padding: 14 }}>
            <b>{shared.open ? 'Nothing on the shelf right now' : 'This shop is closed'}</b>
            <small className="muted">Check back later, or look at the other shops in town.</small>
          </div>
        )}
        {byShop(data.items).map((items) => (
          <Shop key={items[0].businessId} items={items} username={username} startOpen onBought={() => setReload((value) => value + 1)} />
        ))}
        <Pager page={page} pages={data.pages} loading={loading} setPage={setPage} />
        <button className="btn" onClick={() => { useSharedShop.setState({ shop: null }); setPage(1); }}>🛍️ See every shop</button>
      </>
    );
  }

  return (
    <>
      <p className="muted small">Every shop is a stall at a place on the map. Walk in and you pay the shelf price; order from here and delivery is added.</p>
      <div className="shop-scope" role="group" aria-label="Whose shops">
        <button type="button" className={friends ? '' : 'on'} aria-pressed={!friends} onClick={() => { setFriends(false); setPage(1); }}>🌍 Global</button>
        <button type="button" className={friends ? 'on' : ''} aria-pressed={friends} onClick={() => { setFriends(true); setPage(1); }}>🤝 Friends</button>
      </div>
      <input
        className="text-input"
        aria-label="Search businesses and products"
        placeholder="Search shops, products or sellers"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setPage(1); }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="text-input" aria-label="Business type" style={{ minWidth: 0, flex: 1 }} value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
          <option value="">All businesses</option>
          {BUSINESSES.map((business) => <option key={business.id} value={business.id}>{business.icon} {business.name}</option>)}
        </select>
        <select className="text-input" aria-label="Place" style={{ minWidth: 0, flex: 1 }} value={place} onChange={(event) => { setPlace(event.target.value); setPage(1); }}>
          <option value="">All places</option>
          {stallPlaces(city).map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}{summary[p.id]?.open ? ` (${summary[p.id].open})` : ''}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>{friends ? 'Friends’ shops' : 'Shops'} · {data.total}</h4>
        <button className="btn sm" disabled={loading} onClick={() => setReload((value) => value + 1)}>Refresh</button>
      </div>
      {loading && <small className="muted">Finding open shops…</small>}
      {error && <small className="error-text">{error}</small>}
      {!loading && !error && !data.items.length && (
        <div className="list-card" style={{ padding: 14 }}>
          <b>{friends ? 'None of your friends has a shop open' : 'No open shops found'}</b>
          <small className="muted">{friends ? 'Switch to Global to see every shop in town.' : 'Try another place, or open a stall there yourself from the My businesses tab.'}</small>
        </div>
      )}
      {byShop(data.items).map((items) => (
        <Shop key={items[0].businessId} items={items} username={username} onBought={() => setReload((value) => value + 1)} />
      ))}
      <Pager page={page} pages={data.pages} loading={loading} setPage={setPage} />
    </>
  );
}

/** Stalls at one place: how many are free and which kinds of business it takes, with a way to open one. */
function StallsHere({ placeId }: { placeId: string }) {
  const stall = STALLS[placeId];
  const info = usePlaceShops((s) => s.places[placeId]);
  if (!stall) return null;
  const free = stall.slots - (info?.taken ?? 0);
  return (
    <div className="list-card" style={{ padding: 12, display: 'grid', gap: 6 }}>
      <b>{free > 0 ? `🏪 ${free} of ${stall.slots} stalls free` : `🏪 All ${stall.slots} stalls taken`}</b>
      <small className="muted">
        Takes: {typesAt(placeId).map((b) => `${b.icon} ${b.name}`).join(' · ')}. Rent {naira(stall.rent)}/hr while trading
        {info ? ` · ${info.visitors} visitor${info.visitors === 1 ? '' : 's'} lately` : ''}.
      </small>
      <button className="btn sm go" style={{ justifySelf: 'start' }} onClick={openBusinessApp}>
        {free > 0 ? 'Open a business here' : 'Manage my businesses'}
      </button>
    </div>
  );
}

/**
 * A place's own shops, shown in its hub while you are inside, or on the map sheet before you travel. On the map
 * sheet `onGo` takes "Go there" back to the travel options, and the card about renting a stall is left out.
 */
export function PlaceShopsPanel({ placeId, limit, onGo }: { placeId: string; limit?: number; onGo?(): void }) {
  const username = useSession((s) => s.user?.username ?? '');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useListings({ q: '', type: '', place: placeId, page }, reload);
  useEffect(() => { void loadPlaceShops(reload ? 0 : undefined); }, [placeId, reload]);
  const shops = limit ? byShop(data.items).slice(0, limit) : byShop(data.items);
  return (
    <div className="hub-shops" style={{ display: 'grid', gap: 10 }}>
      {loading && !data.items.length && <small className="muted">Checking the stalls…</small>}
      {error && <small className="error-text">{error}</small>}
      {!loading && !error && !data.items.length && !limit && (
        <div className="hub-empty">
          <span className="empty-icon">🏪</span>
          <b>No player shop is trading here yet</b>
          <p>Be the first: rent a stall and every player who walks in sees your goods.</p>
        </div>
      )}
      {shops.map((items) => (
        <Shop key={items[0].businessId} items={items} username={username} startOpen onBought={() => setReload((value) => value + 1)} onGo={onGo} />
      ))}
      {!limit && <Pager page={page} pages={data.pages} loading={loading} setPage={setPage} />}
      {!limit && !onGo && <StallsHere placeId={placeId} />}
    </div>
  );
}

/** Map sheet: the player shops open at a place. Tap it to see what they sell, before you decide to travel there. */
export function PlaceShopsLine({ placeId, onOpen }: { placeId: string; onOpen(): void }) {
  const stall = STALLS[placeId];
  const info = usePlaceShops((s) => s.places[placeId]);
  useEffect(() => { if (stall) void loadPlaceShops(); }, [placeId, stall]);
  if (!stall || !info?.open) return null;
  return (
    <button className="venue-bet-entry" onClick={onOpen}>
      🏪 {info.open} player shop{info.open === 1 ? '' : 's'} here{info.top ? ` · ${info.top}` : ''} · see what they sell ›
    </button>
  );
}
