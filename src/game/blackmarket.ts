// Black Market (a shady store app): fence furniture you stole in a burglary. The seller's name is on the
// listing for everyone to see, it sells at half what the item costs new, and listing costs a fee up front.
// Server: worker/blackmarket.ts.

import { ITEMS } from './catalog';

export const BLACK_MARKET = {
  /** Asking price: this share of the item's shop price. */
  priceFactor: 0.5,
  /** Listing fee: this share of the item's shop price, at least `minFee`. Not refunded. */
  feeFactor: 0.1,
  minFee: 5_000,
};

export const blackMarketPrice = (type: string) => Math.round(((ITEMS[type]?.price ?? 0) * BLACK_MARKET.priceFactor) / 100) * 100;
export const blackMarketFee = (type: string) =>
  Math.max(BLACK_MARKET.minFee, Math.round(((ITEMS[type]?.price ?? 0) * BLACK_MARKET.feeFactor) / 100) * 100);

export interface BlackMarketListing {
  id: number;
  item: string;
  price: number;
  seller: string;
  sellerUid: string;
  status: 'listed' | 'sold' | 'cancelled';
  buyer: string | null;
  at: number;
}
