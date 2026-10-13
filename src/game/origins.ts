// Where you start in life. A new player makes their person, then the draw decides: Sapa / Gbese to
// Dangote Pikin. Kept dependency-light so the server can use it
// too (worker/origin.ts rolls the draw; worker/progress.ts uses the starter furniture and car).

import { houseLayoutForDesign, type PlacedItem } from './grid';
import { DEFAULT_ITEMS } from './defaults';

// 'almajiri' is the Sapa / Gbese start: the id is what wallets and saves already store, so it stays.
export type OriginId = 'almajiri' | 'lapo' | 'nepo' | 'richkid' | 'dangote';
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

export const ORIGIN_IDS = Object.keys(ORIGINS) as OriginId[];
export const isOrigin = (v: unknown): v is OriginId => typeof v === 'string' && Object.hasOwn(ORIGINS, v);
const LEGACY_ORIGINS: Record<LegacyOriginId, OriginId> = { rich: 'nepo', ajebota: 'nepo', normal: 'nepo', ajepako: 'lapo' };
export function normalizeOrigin(v: unknown): OriginId {
  if (isOrigin(v)) return v;
  return typeof v === 'string' && Object.hasOwn(LEGACY_ORIGINS, v) ? LEGACY_ORIGINS[v as LegacyOriginId] : 'lapo';
}
export const originOf = (v: unknown): OriginDef => ORIGINS[normalizeOrigin(v)];
/**
 * How the home is drawn. The starter home (no design) is scaled to the origin's house size; houses
 * you build are drawn true to size, since each design already has its own interior area.
 */
export function homeTransform(v: unknown, design?: string | null) {
  const scale = design ? 1 : originOf(v).homeScale || 1;
  const layout = houseLayoutForDesign(design);
  return { scale, x: (layout.gridW / 2) * (1 - scale), z: (layout.gridH / 2) * (1 - scale) };
}

type Weights = Partial<Record<OriginId, number>>;
export interface OriginQuestion {
  id: string;
  text: string;
  options: { id: string; label: string; weights: Weights }[];
}

/** Base odds (out of 100), and the odds of every draw now that nobody is asked the questions. Both ends are rare: most people start in the middle. */
const BASE: Record<OriginId, number> = { almajiri: 12, lapo: 43, nepo: 32, richkid: 10, dangote: 3 };

// Answers that raise the chance of a rich start also raise the chance of a broke one: there is
// no safe way to game it, only more risk or less.
export const ORIGIN_QUESTIONS: OriginQuestion[] = [
  {
    id: 'papa',
    text: 'Who be your papa?',
    options: [
      { id: 'politician', label: '🏛️ Big politician', weights: { dangote: 8, richkid: 8, nepo: 12, lapo: -8, almajiri: -8 } },
      { id: 'alhaji', label: '🧵 Alhaji with business', weights: { dangote: 8, richkid: 8, nepo: 8, lapo: -5, almajiri: -8 } },
      { id: 'civil', label: '📋 Civil servant', weights: { dangote: -5, richkid: -4, nepo: -4, lapo: 8, almajiri: 1 } },
      { id: 'farmer', label: '🌾 Farmer for village', weights: { dangote: -4, richkid: -4, nepo: -6, lapo: 5, almajiri: 10 } },
    ],
  },
  {
    id: 'area',
    // The kind of area, not a named one: you can be born in any state. The ids are kept from when these were Kaduna districts.
    text: 'Which kind area you grow up?',
    options: [
      { id: 'gra', label: '🏡 GRA, behind high fence', weights: { dangote: 8, richkid: 8, nepo: 10, lapo: -10, almajiri: -8 } },
      { id: 'barnawa', label: '🏘️ Normal street, normal people', weights: { lapo: 8, almajiri: -4 } },
      { id: 'tudun', label: '🛺 Inside town, keke everywhere', weights: { dangote: -2, richkid: -2, nepo: -4, lapo: 8, almajiri: 7 } },
    ],
  },
  {
    id: 'motto',
    text: 'Your motto for life?',
    options: [
      { id: 'soft', label: '🛋️ Soft life or nothing', weights: { dangote: 6, richkid: 6, nepo: 10, lapo: -8, almajiri: -8 } },
      { id: 'steady', label: '🐢 Small small, steady', weights: { lapo: 8, almajiri: -3 } },
      { id: 'hustle', label: '💪 Hustle no dey sleep', weights: { nepo: -3, lapo: 2, almajiri: 6 } },
      { id: 'god', label: '🙏 Na God dey run am', weights: { dangote: 2, richkid: 1, almajiri: 4 } },
    ],
  },
];

export type OriginAnswers = Record<string, string>;

/** Odds (percent, summing to 100) for a set of answers. Unknown answers are ignored. */
export function originOdds(answers: OriginAnswers): Record<OriginId, number> {
  const w = { ...BASE };
  for (const q of ORIGIN_QUESTIONS) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (opt) for (const [k, v] of Object.entries(opt.weights)) w[k as OriginId] += v;
  }
  for (const k of ORIGIN_IDS) w[k] = Math.max(1, w[k]);
  const total = ORIGIN_IDS.reduce((a, k) => a + w[k], 0);
  return Object.fromEntries(ORIGIN_IDS.map((k) => [k, (w[k] / total) * 100])) as Record<OriginId, number>;
}

/** `r` is a uniform random number in [0, 1). */
export function drawOrigin(answers: OriginAnswers, r: number): OriginId {
  const odds = originOdds(answers);
  let acc = 0;
  for (const k of ORIGIN_IDS) {
    acc += odds[k] / 100;
    if (r < acc) return k;
  }
  return 'almajiri';
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
