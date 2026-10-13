// Player shops: what other players' businesses sell, place by place (server side: worker/career.ts).

import { create } from 'zustand';
import { fed } from '../game/catalog';
import { MARKET_PRODUCT_BY_ID, STALLS } from '../game/career';
import { cityMap } from '../game/city';
import { useGame, naira } from '../game/store';
import { api, useSession } from './session';
import { setServerBalance } from './wallet';

export interface MarketListing {
  id: number;
  product: string;
  name: string;
  icon: string;
  price: number;
  stock: number;
  sold: number;
  businessId: number;
  businessType: string;
  businessName: string;
  businessIcon: string;
  businessColor: string;
  area: string;
  /** The city the shop is in, and the place there. */
  city: string;
  place: string;
  seller: string;
  open: boolean;
}

export interface MarketPage {
  items: MarketListing[];
  page: number;
  total: number;
  pages: number;
}

/** The place the player is standing inside, if any: buying there is a walk-in, anywhere else is a delivery. */
export const standingIn = () => {
  const s = useGame.getState();
  return s.view === 'place' ? s.insideId : null;
};

/** The city the player is in. A business belongs to one city: Kaduna's airport stalls are not Abuja's. */
export const cityHere = () => cityMap(useGame.getState().destinationId).id;
export const useCityHere = () => useGame((s) => cityMap(s.destinationId).id);

export interface PlaceShops { slots: number; taken: number; open: number; top: string | null; visitors: number }

/** Stalls and open shops at every place of `city` (the one the player is in) that rents them. Shared by the map sheet, the place hub and the Business app. */
export const usePlaceShops = create<{ places: Record<string, PlaceShops>; city: string; at: number }>(() => ({ places: {}, city: '', at: 0 }));

let loadingPlaces: { city: string; done: Promise<void> } | null = null;
/** Refreshes the per-place summary unless it was fetched for this city within `maxAge` ms. */
export function loadPlaceShops(maxAge = 60_000): Promise<void> {
  const city = cityHere();
  const have = usePlaceShops.getState();
  // Another city's stalls are not this one's: drop them at once, before the fetch lands.
  if (have.city !== city) usePlaceShops.setState({ places: {}, city, at: 0 });
  else if (Date.now() - have.at < maxAge) return Promise.resolve();
  if (loadingPlaces?.city === city) return loadingPlaces.done;
  const done = api(`/api/market/places?city=${city}`)
    .then(async (response) => {
      if (!response.ok || cityHere() !== city) return;
      const data = await response.json() as { places: Record<string, PlaceShops> };
      usePlaceShops.setState({ places: data.places, city, at: Date.now() });
    })
    .catch(() => undefined)
    .finally(() => { if (loadingPlaces?.done === done) loadingPlaces = null; });
  loadingPlaces = { city, done };
  return done;
}

/** Tells the server when the player walks into a place with stalls: foot traffic lifts trade for the shops there. */
export function startMarket() {
  const seen = new Set<string>();
  const visit = (place: string | null) => {
    const uid = useSession.getState().user?.uid;
    if (!place || !uid || !(place in STALLS)) return;
    const city = cityHere();
    const key = `${uid}:${city}:${place}:${Math.floor(Date.now() / 86_400_000)}`;
    if (seen.has(key)) return;
    seen.add(key);
    void api('/api/market/visit', { method: 'POST', body: JSON.stringify({ place, city }) }).catch(() => seen.delete(key));
  };
  visit(standingIn());
  return useGame.subscribe((s, p) => {
    if (s.insideId !== p.insideId || s.view !== p.view || s.destinationId !== p.destinationId) visit(standingIn());
    // Landed in another city: its stalls, not the last one's.
    if (s.destinationId !== p.destinationId) void loadPlaceShops();
  });
}

/** A shop opened from a share link (/shop/<id>): the Player shops tab shows only its shelf until this is cleared. */
export interface SharedShop { id: number; name: string; icon: string; color: string; kind: string; where: string; city: string; owner: string | null; open: boolean }
export const useSharedShop = create<{ shop: SharedShop | null }>(() => ({ shop: null }));

export async function browseMarket(filters: { q: string; type: string; place: string; page: number; shop?: number; friends?: boolean }): Promise<MarketPage> {
  const query = new URLSearchParams();
  if (filters.q) query.set('q', filters.q);
  if (filters.type) query.set('type', filters.type);
  if (filters.place) query.set('place', filters.place);
  if (filters.shop) query.set('shop', String(filters.shop));
  if (filters.friends) query.set('scope', 'friends');
  query.set('city', cityHere());
  query.set('page', String(filters.page));
  const response = await api(`/api/market?${query}`);
  if (!response.ok) throw new Error(`Could not load shops (${response.status})`);
  return response.json() as Promise<MarketPage>;
}

export type MarketPurchaseResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean };

export async function buyMarketListing(listingId: number, quantity: number, requestId: string): Promise<MarketPurchaseResult> {
  try {
    const response = await api('/api/market/buy', {
      method: 'POST',
      body: JSON.stringify({ listingId, quantity, requestId, at: standingIn() ?? undefined, city: cityHere() }),
    });
    const result = await response.json() as { product?: string; quantity?: number; total?: number; fee?: number; balance?: number; error?: string };
    if (!response.ok) return { ok: false, error: result.error ?? 'Could not complete this purchase', retryable: response.status >= 500 };
    if (typeof result.balance === 'number') setServerBalance(result.balance);

    const product = result.product ? MARKET_PRODUCT_BY_ID[result.product] : undefined;
    if (!product) throw new Error('The purchased product is not in the game catalogue');
    const count = result.quantity ?? quantity;
    useGame.setState((state) => ({
      needs: {
        ...state.needs,
        ...Object.fromEntries(Object.entries(fed(product.benefit)).map(([need, amount]) => [
          need,
          Math.min(100, state.needs[need as keyof typeof state.needs] + amount! * count),
        ])),
      },
    }));
    const paid = (result.total ?? product.price * count) + (result.fee ?? 0);
    useGame.getState().toast(`Bought ${count} × ${product.name} for ${naira(paid)}${result.fee ? ` (${naira(result.fee)} delivery)` : ''}`);
    usePlaceShops.setState({ at: 0 });
    return { ok: true };
  } catch (error) {
    console.error('Marketplace purchase failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Could not complete this purchase', retryable: true };
  }
}
