// Where money goes when a player pays the state. Each city's government has a treasury of its own (state_treasuries)
// that takes what is paid in that city; civic_policies.treasury is the federal treasury, filled by the president's cut of
// every state's revenue and by federal-only money (transfer fees, loans, EFCC). Rules only; the server moves the money.

import type { CivicCity } from './civic';

/** Shares of what players already pay that the state keeps. The price to the player does not change. */
export const STATE_CUT = {
  /** VAT on everyday spending and shopping. */
  vat: 0.075,
  /** Land registration on everything paid for a plot or the house on it. */
  land: 0.05,
} as const;

/** The president's fee on money sent between players, as a percent of the amount. Paid by the sender on top. */
export const TRANSFER_FEE_LIMITS = [0, 10] as const;
export const transferFeeOf = (amount: number, pct: number) => Math.floor((amount * pct) / 100);

/** Charges that are paid to "nobody" on the server but are really the state's: they land in the treasury. */
export const STATE_KINDS = new Set(['owambe_fee']);
/** Fines (police and EFCC), bail and hospital bills go to the federal treasury, not the payer's state. */
export const FEDERAL_KINDS = new Set(['fine', 'efcc_fine', 'bail', 'hospital']);


/** The president's cut of every state's revenue, sent up to the federal treasury each round: a percent, in these steps. */
export const FEDERAL_CUT = { max: 30, step: 5, default: 10 } as const;

/** A round: the cut goes up, bills are paid, assets are kept up (or not). A game day is an hour of real time. */
export const STATE_ROUND_MS = 3_600_000;

/** Everything a state owns and has to keep up. */
export type StateAsset = 'roads' | 'lights' | 'markets' | 'hospital' | 'stadium' | 'govhouse' | 'police' | 'transport' | 'schools' | 'culture' | 'parks' | 'techhub';
export const STATE_ASSETS: StateAsset[] = ['roads', 'lights', 'markets', 'hospital', 'stadium', 'govhouse', 'police', 'transport', 'schools', 'culture', 'parks', 'techhub'];

/** How much of the full upkeep bill the governor pays for an asset, in percent. 50 keeps it as it is. */
export const UPKEEP_LEVELS = [0, 25, 50, 75, 100] as const;

export interface AssetInfo {
  icon: string;
  label: string;
  /** What keeping it fully up costs a round in the cheapest state (Kaduna). Bigger states pay CITY_SCALE times this. */
  base: number;
  /** What it brings in a round at full condition, as a share of `base` (markets take stall levies, the stadium sells tickets). */
  earns: number;
  /** What happens to the state as its condition falls. */
  effect: string;
}

export const ASSET_INFO: Record<StateAsset, AssetInfo> = {
  roads: { icon: '🛣️', label: 'Roads', base: 250_000, earns: 0, effect: 'Worse roads open potholes faster.' },
  lights: { icon: '💡', label: 'Street lights', base: 80_000, earns: 0, effect: 'Neglected lights go dark more often.' },
  markets: { icon: '🏪', label: 'Markets', base: 120_000, earns: 0.6, effect: 'Stall levies pay part of the upkeep. Run-down markets pay less.' },
  hospital: { icon: '🏥', label: 'Hospital', base: 200_000, earns: 0, effect: 'A run-down hospital charges up to double.' },
  stadium: { icon: '🏟️', label: 'Stadium', base: 150_000, earns: 0.5, effect: 'Gate money pays part of the upkeep. A ruined stadium draws nobody.' },
  govhouse: { icon: '🏛️', label: 'Government House', base: 120_000, earns: 0, effect: 'Below 30, the governor can’t award contracts, pardon or share palliatives.' },
  police: { icon: '🚔', label: 'Police stations', base: 120_000, earns: 0, effect: 'A ruined station is shut.' },
  transport: { icon: '🚌', label: 'Motor parks and stations', base: 100_000, earns: 0.5, effect: 'Levies pay part of the upkeep. Ruined ones are shut.' },
  schools: { icon: '🎓', label: 'Schools and polytechnic', base: 110_000, earns: 0.3, effect: 'Courses cost up to half as much again when they are run down. Ruined ones are shut.' },
  culture: { icon: '🏺', label: 'Museum and heritage', base: 40_000, earns: 0.5, effect: 'Ticket sales pay part of the upkeep. Ruined ones are shut.' },
  parks: { icon: '🌳', label: 'Parks and squares', base: 60_000, earns: 0.3, effect: 'Pitch fees pay part of the upkeep. Ruined ones are shut.' },
  techhub: { icon: '💻', label: 'Tech hub', base: 50_000, earns: 0.5, effect: 'Desk rent pays part of the upkeep. A ruined hub is shut.' },
};

/** Big cities cost more to run: the multiplier on every bill and every earning. */
export const CITY_SCALE: Record<CivicCity, number> = { kaduna: 1, kano: 1.2, abuja: 2, lagos: 3 };

const to1000 = (n: number) => Math.round(n / 1000) * 1000;
/** What an asset costs a state each round at this upkeep level. */
export const upkeepOf = (asset: StateAsset, city: CivicCity, level: number) => to1000((ASSET_INFO[asset].base * CITY_SCALE[city] * level) / 100);
/** What an asset brings in a round at this condition. */
export const earningOf = (asset: StateAsset, city: CivicCity, condition: number) => to1000((ASSET_INFO[asset].base * CITY_SCALE[city] * ASSET_INFO[asset].earns * condition) / 100);
/** How much an asset's condition moves in a round when the bill is paid: level 50 holds it steady. */
export const driftOf = (level: number) => Math.round((level - 50) / 12.5);
/** ...and when the treasury could not pay. */
export const UNPAID_DRIFT = -5;

/** An emergency repair: pay this many rounds of full upkeep for this much condition back at once. */
export const REPAIR = { rounds: 8, condition: 25 };
export const repairCost = (asset: StateAsset, city: CivicCity) => upkeepOf(asset, city, 100) * REPAIR.rounds;

/** An asset below this is broken: the building is closed, and Government House shuts the governor's powers. */
export const BROKEN_BELOW = 30;
export const GOVHOUSE_SHUT = BROKEN_BELOW;
/** The places on the map a state keeps up (the ids are the same in every city). */
export const PLACE_ASSET: Record<string, StateAsset> = {
  hospital: 'hospital', stadium: 'stadium', market: 'markets', secretariat: 'govhouse',
  police: 'police', motorpark: 'transport', station: 'transport', school: 'schools', poly: 'schools',
  museum: 'culture', arewa: 'culture', murtala: 'parks', gamji: 'parks', pitch: 'parks', river: 'parks', techhub: 'techhub',
};
/** A course costs this many times as much when the state's schools are run down (up to one and a half). */
export const schoolFactor = (condition: number) => 1 + (100 - condition) / 200;
/** A hospital bill is this many times as much when the hospital is in the state it is in. */
export const hospitalFactor = (condition: number) => 1 + (100 - condition) / 100;

/** Things go wrong. Each round a state has this chance of a bill nobody planned for. */
export const FEE_CHANCE = 0.06;
export interface StateFee {
  id: string;
  icon: string;
  label: string;
  /** The bill, in rounds of the state's full upkeep (all assets at 100). */
  rounds: number;
  /** An asset it damages, and by how much. */
  hits?: { asset: StateAsset; condition: number };
}
export const STATE_FEES: StateFee[] = [
  { id: 'flood', icon: '🌊', label: 'Flood damage', rounds: 6, hits: { asset: 'roads', condition: 25 } },
  { id: 'surge', icon: '⚡', label: 'Power surge', rounds: 3, hits: { asset: 'lights', condition: 30 } },
  { id: 'pensions', icon: '👴🏾', label: 'Pensions and gratuity', rounds: 8 },
  { id: 'strike', icon: '🪧', label: 'Doctors’ strike', rounds: 5, hits: { asset: 'hospital', condition: 20 } },
  { id: 'contractor', icon: '⚖️', label: 'Contractor sues the state', rounds: 12 },
  { id: 'riot', icon: '🔥', label: 'Stadium riot', rounds: 4, hits: { asset: 'stadium', condition: 30 } },
  { id: 'roof', icon: '🏚️', label: 'Government House roof collapses', rounds: 4, hits: { asset: 'govhouse', condition: 30 } },
  { id: 'fire', icon: '🧯', label: 'Market fire', rounds: 5, hits: { asset: 'markets', condition: 30 } },
];
/** One bill never takes more than this share of what the state holds. The rest is arrears. */
export const FEE_MAX_SHARE = 0.5;
/** Every asset at full upkeep for a round: what a bill is measured in. */
export const fullRound = (city: CivicCity) => STATE_ASSETS.reduce((n, a) => n + upkeepOf(a, city, 100), 0);

/** What a governor can ask the federal treasury for, and the president can grant. */
export const GRANT_SIZES = [10_000_000, 50_000_000, 100_000_000, 250_000_000] as const;

/**
 * A state's own taxes and fees, set by its governor (or the president while the seat is empty). Income tax is extra wage
 * tax on people who live in the state. The fees are a percent of the standard fee (src/game/career.ts BIZ): the standard
 * is 100, and what the player pays moves with it.
 */
export type StateLawKey = 'incomeTax' | 'bizFee' | 'moveFee' | 'deliveryFee' | 'bizTax' | 'salesTax' | 'hospitalFee' | 'exportLevy';
export type StateLaws = Record<StateLawKey, number>;
const FEE_CAPS = [0, 50, 100, 150, 200];
export interface StateLawDef {
  /** The column in state_treasuries holding the value in force. */
  column: string;
  /** The column in civic_policies holding the president's maximum, and the name the policy action and the snapshot give it. */
  capColumn: string;
  capField: string;
  title: string;
  unit: string;
  /** The highest the president can set the maximum (and what it starts at). */
  max: number;
  /** What the president can set the maximum to. */
  capOptions: number[];
  hint: string;
}
export const STATE_LAWS: Record<StateLawKey, StateLawDef> = {
  incomeTax: { column: 'income_tax', capColumn: 'cap_income_tax', capField: 'capIncomeTax', title: 'State income tax', unit: '%', max: 10, capOptions: [0, 2, 5, 10], hint: 'Taken from the wages of people who live here, on top of the president’s.' },
  bizFee: { column: 'biz_fee', capColumn: 'cap_biz_fee', capField: 'capBizFee', title: 'Business registration', unit: '%', max: 200, capOptions: FEE_CAPS, hint: 'Of the standard fee, for opening a business here.' },
  moveFee: { column: 'move_fee', capColumn: 'cap_move_fee', capField: 'capMoveFee', title: 'Move permit', unit: '%', max: 200, capOptions: FEE_CAPS, hint: 'Of the standard fee, for moving a business here.' },
  deliveryFee: { column: 'delivery_fee', capColumn: 'cap_delivery_fee', capField: 'capDeliveryFee', title: 'Delivery levy', unit: '%', max: 200, capOptions: FEE_CAPS, hint: 'Of the standard levy, on orders delivered here.' },
  bizTax: { column: 'biz_tax', capColumn: 'cap_biz_tax', capField: 'capBizTax', title: 'Business tax', unit: '%', max: 20, capOptions: [0, 5, 10, 15, 20], hint: 'Of the income a business here collects.' },
  salesTax: { column: 'sales_tax', capColumn: 'cap_sales_tax', capField: 'capSalesTax', title: 'Sales tax', unit: '%', max: 10, capOptions: [0, 2, 5, 10], hint: 'Taken from the seller on every marketplace sale by a shop here.' },
  exportLevy: { column: 'export_levy', capColumn: 'cap_export_levy', capField: 'capExportLevy', title: 'Export levy', unit: '%', max: 40, capOptions: [0, 10, 20, 30, 40], hint: 'Of the wholesale price, paid by shops in other states that restock goods made here.' },
  hospitalFee: { column: 'hospital_fee', capColumn: 'cap_hospital_fee', capField: 'capHospitalFee', title: 'Hospital fee', unit: '%', max: 200, capOptions: FEE_CAPS, hint: 'Of the standard hospital bill, for people who live here.' },
};
export const STATE_LAW_KEYS = Object.keys(STATE_LAWS) as StateLawKey[];
export const DEFAULT_STATE_LAWS: StateLaws = { incomeTax: 0, bizFee: 100, moveFee: 100, deliveryFee: 100, bizTax: 0, salesTax: 0, hospitalFee: 100, exportLevy: 20 };
/** The president's maximum for each tax and fee. */
export type StateCaps = Record<StateLawKey, number>;
export const DEFAULT_STATE_CAPS = Object.fromEntries(STATE_LAW_KEYS.map((k) => [k, STATE_LAWS[k].max])) as StateCaps;
/** A governor picks a share of the maximum, in these steps (percent). */
export const GOV_STEPS = [0, 25, 50, 75, 100] as const;
/** What a share of the maximum comes to. With a maximum of 200 and 50 percent that is 100, the standard fee. */
export const lawAt = (cap: number, step: number) => Math.round((cap * step) / 100);
/** The distinct values a governor can choose under this maximum, each with the share that gives it. */
export const lawChoices = (cap: number) =>
  GOV_STEPS.map((step) => ({ step, value: lawAt(cap, step) })).filter((c, i, all) => all.findIndex((o) => o.value === c.value) === i);
/** A fee after the state's percent: the standard fee at 100. */
export const scaledFee = (standard: number, pct: number) => Math.round((standard * pct) / 100);
