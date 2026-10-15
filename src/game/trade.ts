// What each state makes. A shop that stocks up on something another state makes pays that state a levy on the
// wholesale price; stock from its own state is a little cheaper. The goods are the market products of game/career.ts.
// Rules only: the server charges the levy when a business restocks (worker/career.ts).

import type { CivicCity } from './civic';

export interface Produce {
  icon: string;
  label: string;
  /** The market products (career.ts MARKET_PRODUCTS) this state is where they come from. */
  goods: string[];
}

export const PRODUCES: Record<CivicCity, Produce[]> = {
  kaduna: [{ icon: '🧵', label: 'Cloth', goods: ['cap-beads', 'ankara-fit', 'kaftan'] }],
  kano: [
    { icon: '👜', label: 'Leather and crafts', goods: ['leather-bag', 'calabash-art', 'woven-fan'] },
    { icon: '🥜', label: 'Groundnuts', goods: ['groundnut', 'kilishi-pack'] },
  ],
  lagos: [
    { icon: '📱', label: 'Gadgets', goods: ['screen-guard', 'earbuds', 'power-bank'] },
    { icon: '🐟', label: 'Fish', goods: ['smoked-fish', 'catfish-soup', 'grilled-fish'] },
  ],
  abuja: [{ icon: '📄', label: 'Paperwork', goods: ['photocopy', 'passport-photo', 'cv-typing'] }],
};

/** The state a product comes from, if it has one. */
export const ORIGIN_OF: Record<string, CivicCity> = Object.fromEntries(
  (Object.entries(PRODUCES) as [CivicCity, Produce[]][]).flatMap(([city, list]) => list.flatMap((p) => p.goods.map((g) => [g, city] as const))),
);

export const TRADE = {
  /** Stock from your own state costs this much less than the wholesale price. */
  localDiscount: 0.1,
  /** The levy on stock from another state, as a percent of the wholesale price, until a governor changes it. */
  levy: 20,
};

/** What a state makes, in a line: "🧵 Cloth". */
export const producesLine = (city: CivicCity) => PRODUCES[city].map((p) => `${p.icon} ${p.label}`).join(' · ');

export interface RestockPrice {
  /** What one unit costs the shop, all in. */
  unit: number;
  /** The part of it that is the origin state's export levy. */
  levy: number;
  /** The state the goods come from, if they come from one. */
  origin: CivicCity | null;
  /** Made in the shop's own state: a little cheaper. */
  local: boolean;
}

/** What a shop in `city` pays per unit to restock `product`: cheaper from its own state, dearer by the origin state's export levy (`levyPct`) from another's. */
export function restockPrice(wholesale: number, product: string, city: string, levyPct: number): RestockPrice {
  const origin = ORIGIN_OF[product] ?? null;
  if (!origin) return { unit: wholesale, levy: 0, origin: null, local: false };
  if (origin === city) return { unit: Math.round(wholesale * (1 - TRADE.localDiscount)), levy: 0, origin, local: true };
  const levy = Math.round((wholesale * levyPct) / 100);
  return { unit: wholesale + levy, levy, origin, local: false };
}
