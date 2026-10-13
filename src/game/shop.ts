// Naira top-up packs sold for real money (paid through Bachs; see worker/shop.ts). Edit prices here.

export interface Pack {
  id: string;
  /** Price in real naira. */
  price: number;
  /** In-game naira credited to the wallet. */
  naira: number;
  label: string;
  icon: string;
  tag?: string;
}

export const PACKS: Pack[] = [
  { id: 'p1k', price: 1_000, naira: 50_000, label: 'Pocket Money', icon: '💵' },
  { id: 'p2500', price: 2_500, naira: 150_000, label: 'Small Chop', icon: '💰', tag: 'Popular' },
  { id: 'p5k', price: 5_000, naira: 400_000, label: 'Big Man', icon: '🤑' },
  { id: 'p10k', price: 10_000, naira: 1_000_000, label: 'Dangote Pikin', icon: '🏦', tag: 'Best value' },
];

export const PACK_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p])) as Record<string, Pack>;

/** Real-money purchases a player may complete in a day. */
export const MAX_ORDERS_PER_DAY = 5;
