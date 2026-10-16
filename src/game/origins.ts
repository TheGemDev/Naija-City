// Where you start in life. Everyone is born the same now: the Fresh Start, ₦300,000 and a small house. The old draw's
// starts (Sapa / Gbese to Dangote Pikin) stay defined only for lives that drew one before; no new life gets them.
// Kept dependency-light so the server can use it too (worker/wallet.ts gives the start; worker/progress.ts uses the
// starter furniture and car).

import { designOfKey } from './exterior';
import { houseLayoutForDesign, type PlacedItem } from './grid';
import { DEFAULT_ITEMS } from './defaults';

// 'almajiri' is the Sapa / Gbese start: the id is what wallets and saves already store, so it stays.
export type OriginId = 'starter' | 'almajiri' | 'lapo' | 'nepo' | 'richkid' | 'dangote';
type LegacyOriginId = 'rich' | 'ajebota' | 'normal' | 'ajepako';

export interface OriginDef {
  id: OriginId;
  label: string;
  emoji: string;
  /** One line shown on the reveal card. */
  tagline: string;
  home: string;
  /** Scale of the starter home scene; larger origins start in larger houses. */
  homeScale: number;
  money: number;
  debt?: number;
  /** Work pay multiplier: soft starts earn less, hustlers more. The server checks pay against it. */
  pay: number;
  items: PlacedItem[];
  car: string | null;
  /** The phone you are born with (game/phones.ts). It is yours for free, so it cannot be sold. */
  phone: string;
  /** Extra clothes in your wardrobe from day one (only the ones that fit your body are wearable). */
  clothes: string[];
  /** Owed to LAPO at the start; paid back automatically every week. */
  loan?: { owed: number; weekly: number };
  perks: string[];
  catches: string[];
  color: string;
}

const without = (types: string[]) => DEFAULT_ITEMS.filter((i) => !types.includes(i.id));
const swap = (items: PlacedItem[], id: string, type: string) => items.map((i) => (i.id === id ? { ...i, type } : i));

// Furnishing builds on the standard layout; the starter home's scale sets its actual footprint.
const SOFT: PlacedItem[] = [...swap(DEFAULT_ITEMS, 'bed', 'bed_royal'), { id: 'desk', type: 'desk', x: 4, z: 0, rot: 0 }];
const BIG: PlacedItem[] = [...SOFT, { id: 'solar', type: 'solar', x: 1, z: 11, rot: 0 }, { id: 'suya', type: 'suya_grill', x: 13, z: 11, rot: 0 }];
const HUSTLE: PlacedItem[] = swap(without(['tv', 'rug', 'sofa', 'shelf', 'dining', 'plant1', 'plant2', 'fridge', 'gen', 'chair2']), 'shower', 'bucket');
const LAPO_HOME: PlacedItem[] = HUSTLE.filter((i) => !['fan', 'chair1', 'counter', 'mango'].includes(i.id));

export const ORIGINS: Record<OriginId, OriginDef> = {
  starter: {
    id: 'starter', label: 'Fresh Start', emoji: '🌱', tagline: 'Everybody starts the same. The rest is on you.',
    home: 'Small one-room house', homeScale: 0.62, money: 300_000, pay: 1, items: HUSTLE, car: null, phone: 'tecno_spark', clothes: [],
    perks: ['₦300,000 to start: ₦50,000 now, ₦50,000 more each day you play', 'A small starter home'], catches: [],
    color: '#22c55e',
  },
  // Legacy starts, for lives already living them.
  almajiri: {
    id: 'almajiri', label: 'Sapa / Gbese', emoji: '💸', tagline: 'You’re broke. No house, no money, and you owe.',
    home: 'No home', homeScale: 0, money: 0, debt: 20_000, pay: 1.5, items: [], car: null, phone: 'itel_a70', clothes: [],
    perks: ['No house', 'Public amenities are free'], catches: ['₦20,000 in debt'],
    color: '#64748b',
  },
  lapo: {
    id: 'lapo', label: 'LAPO', emoji: '🏦', tagline: 'You’re surviving on loans.',
    home: 'Tiny one-room house', homeScale: 0.62, money: 10_000, pay: 1.35, items: LAPO_HOME, car: null, phone: 'tecno_spark',
    loan: { owed: 150_000, weekly: 20_000 }, clothes: [],
    perks: ['A tiny starter home'], catches: ['₦150,000 LAPO loan'],
    color: '#ef4444',
  },
  nepo: {
    id: 'nepo', label: 'Nepo Baby', emoji: '😎', tagline: 'Connections are helping you.',
    home: 'Large furnished house', homeScale: 1, money: 500_000, pay: 0.95, items: BIG, car: 'peugeot_504', phone: 'galaxy_a56',
    clothes: ['polo_navy', 'hoodie_grey', 'sneakers_white', 'cap_black'],
    perks: ['₦500,000 to start', 'A large furnished home'], catches: ['Work pay ×0.95'],
    color: '#a855f7',
  },
  richkid: {
    id: 'richkid', label: 'Rich Kid', emoji: '💰', tagline: 'Money is no longer a major problem.',
    home: 'Big furnished house with solar', homeScale: 1.15, money: 1_000_000, pay: 0.88, items: BIG, car: 'golf_3', phone: 'iphone_16',
    clothes: ['polo_navy', 'hoodie_grey', 'sneakers_white', 'cap_black', 'shades_black', 'chain_gold'],
    perks: ['₦1,000,000 to start', 'VW Golf 3', 'A big furnished home'], catches: ['Work pay ×0.88'],
    color: '#10b981',
  },
  dangote: {
    id: 'dangote', label: 'Dangote Pikin', emoji: '👑', tagline: 'Born into serious money.',
    home: 'Mansion in the GRA', homeScale: 1.32, money: 2_000_000, pay: 0.8, items: BIG, car: 'benz_190e', phone: 'iphone_17_pro_max',
    clothes: ['suit_black', 'agbada_white', 'gown_lace', 'loafers_brown', 'heels_gold', 'shades_black', 'chain_gold'],
    perks: ['₦2,000,000 to start', 'Benz 190E', 'Mansion with solar'], catches: ['Work pay ×0.8'],
    color: '#eab308',
  },
};

/** The start every new life gets. */
export const NEW_LIFE_ORIGIN: OriginId = 'starter';

/**
 * A life's starting money comes in installments, so a throwaway account has little to hand over on day one: this much at
 * birth, then this much more on each later day the player is online, until the origin's money is all paid
 * (worker/wallet.ts payStarter).
 */
export const STARTER_INSTALLMENT = 50_000;
/** What a life is born holding; the rest of its origin's money follows a day at a time. */
export const firstInstallment = (o: OriginDef) => Math.min(o.money, STARTER_INSTALLMENT);
/** Which day it is in Nigeria (UTC+1), for paying one installment a day. */
export const starterDay = (ms: number) => Math.floor((ms + 3_600_000) / 86_400_000);
export const isOrigin = (v: unknown): v is OriginId => typeof v === 'string' && Object.hasOwn(ORIGINS, v);
const LEGACY_ORIGINS: Record<LegacyOriginId, OriginId> = { rich: 'nepo', ajebota: 'nepo', normal: 'nepo', ajepako: 'lapo' };
export function normalizeOrigin(v: unknown): OriginId {
  if (isOrigin(v)) return v;
  return typeof v === 'string' && Object.hasOwn(LEGACY_ORIGINS, v) ? LEGACY_ORIGINS[v as LegacyOriginId] : NEW_LIFE_ORIGIN;
}
export const originOf = (v: unknown): OriginDef => ORIGINS[normalizeOrigin(v)];
/**
 * How the home is drawn. The starter home (no design) is scaled to the origin's house size; houses
 * you build are drawn true to size, since each design already has its own interior area.
 */
export function homeTransform(v: unknown, design?: string | null) {
  // `design` may be a layout key (game/exterior.ts): the starter home with cars parked is '+park1', still the starter.
  const scale = designOfKey(design) ? 1 : originOf(v).homeScale || 1;
  const layout = houseLayoutForDesign(design);
  return { scale, x: (layout.gridW / 2) * (1 - scale), z: (layout.gridH / 2) * (1 - scale) };
}

/** Starter furniture counts for an origin, plus its car. Used to check what a player really owns. */
export function starterCounts(origin: unknown): Record<string, number> {
  const legacyItems: Partial<Record<LegacyOriginId, PlacedItem[]>> = {
    rich: BIG,
    ajebota: SOFT,
    normal: DEFAULT_ITEMS,
    ajepako: HUSTLE,
  };
  const items = typeof origin === 'string' && Object.hasOwn(legacyItems, origin)
    ? legacyItems[origin as LegacyOriginId]!
    : originOf(origin).items;
  const m: Record<string, number> = {};
  for (const i of items) m[i.type] = (m[i.type] ?? 0) + 1;
  const o = originOf(origin);
  if (o.car) m[o.car] = (m[o.car] ?? 0) + 1;
  return m;
}
