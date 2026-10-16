// Trains between the cities, and the government's fare subsidy on trains and flights. Rules only: shared by the game
// (the station's ticket desk, the flight desk, the store charging for a ticket) and the server (worker/wallet.ts works
// out what a ticket really costs and pays the subsidy out of the federal treasury).
//
// The lines are the real ones. The standard-gauge Abuja – Kaduna line (Idu to Rigasa), the old narrow-gauge line north
// from Kaduna to Kano through Zaria, and the Western line from Lagos up through Ibadan, Ilorin and Minna to Kaduna and
// on to Kano: the line the Kano station's blurb talks about. There is no train between Abuja and Lagos or Kano, so the
// desk offers none.

import type { ActionDef } from './catalog';

export type RailClass = 'standard' | 'business';

interface RailRoute {
  /** The line, as the departures board names it. */
  line: string;
  /** Train number on the ticket. */
  train: string;
  /** Game minutes on board. Under SKIP_MIN_TASK (game/timeRates.ts), like every flight, so it plays out in real time. */
  minutes: number;
  fare: Record<RailClass, number>;
  tagline: string;
}

/**
 * Each pair of cities a train runs between, either way. Cheaper and slower than flying: the airline seat between Abuja
 * and Kaduna is ₦20,000 and 12 minutes (game/city.ts); the train is ₦6,500 and half an hour.
 */
const RAIL: Record<string, RailRoute> = {
  'abuja-kaduna': { line: 'Abuja – Kaduna Train Service', train: 'AK 1', minutes: 32, fare: { standard: 6_500, business: 14_000 }, tagline: 'The standard-gauge express between Idu and Rigasa' },
  'kaduna-kano': { line: 'Kaduna – Kano Line', train: 'KK 7', minutes: 34, fare: { standard: 5_500, business: 12_000 }, tagline: 'North through Zaria on the old line' },
  'kaduna-lagos': { line: 'Lagos – Kano Express', train: 'LK 3', minutes: 74, fare: { standard: 19_000, business: 42_000 }, tagline: 'Down through Minna, Ilorin and Ibadan to Ebute Metta' },
  'kano-lagos': { line: 'Lagos – Kano Express', train: 'LK 1', minutes: 86, fare: { standard: 23_000, business: 50_000 }, tagline: 'The whole Western line, end to end, the way it ran in 1912' },
};

const key = (a: string, b: string) => [a, b].sort().join('-');
export const railRoute = (a: string, b: string): RailRoute | undefined => RAIL[key(a, b)];
/** Every city a train goes to from `from`. */
export const railDestinations = (from: string) => Object.keys(RAIL).flatMap((k) => {
  const [a, b] = k.split('-');
  return a === from ? [b] : b === from ? [a] : [];
});
export const railFare = (a: string, b: string, cls: RailClass) => railRoute(a, b)?.fare[cls] ?? 0;

const CITY_NAME: Record<string, string> = { kaduna: 'Kaduna', abuja: 'Abuja', lagos: 'Lagos', kano: 'Kano' };
/** An hour on board standard class: a doze and something from the trolley. Business class lands you fresher. */
const RAIL_PERHOUR: Record<RailClass, ActionDef['perHour']> = {
  standard: { energy: 40, fun: 20 },
  business: { energy: 80, fun: 40, hunger: 40 },
};
/** The ticket id for a train: train_abuja, train_abuja_biz. */
export const trainId = (to: string, cls: RailClass) => `train_${to}${cls === 'business' ? '_biz' : ''}`;

/** The tickets a station sells, to every city its lines reach, in both classes. */
export const trainActions = (from: string): ActionDef[] => railDestinations(from).flatMap((to) => {
  const r = railRoute(from, to)!;
  return (['standard', 'business'] as const).map((cls): ActionDef => ({
    id: trainId(to, cls), label: `Train to ${CITY_NAME[to]}${cls === 'business' ? ' · business' : ''}`, icon: '🚆', category: 'spend',
    cost: r.fare[cls], minutes: r.minutes, pose: 'hidden', effect: 'travel', destination: to, rail: true, cls,
    perHour: RAIL_PERHOUR[cls], tagline: r.tagline,
  }));
});
/** Every train ticket id a station's desk could sell, for the props that list them (game/places/trade.ts). */
export const ALL_TRAIN_IDS = Object.keys(CITY_NAME).flatMap((to) => [trainId(to, 'standard'), trainId(to, 'business')]);

/* ---------- The fare subsidy ---------- */

export type FareMode = 'air' | 'rail';

/**
 * The President's subsidy on tickets: a percent off every airline seat and every train ticket, paid by the federal
 * treasury. It is only paid while the treasury would still hold `reserve` afterwards; below that every ticket is full price.
 */
export const FARE_SUBSIDY = {
  air: { max: 50, options: [0, 10, 20, 30, 40, 50] },
  rail: { max: 80, options: [0, 10, 25, 40, 50, 60, 80] },
  reserve: 2_000_000,
} as const;

/** What the government pays of a `base` fare at `pct`, and what is left for the passenger. */
export function subsidise(base: number, pct: number) {
  const off = Math.floor((base * Math.max(0, Math.min(100, pct))) / 100);
  return { off, price: base - off };
}

/** The subsidy in force as the game last heard it from the server (worker/wallet.ts): percents, and whether it is being paid. */
export interface FareSubsidy { air: number; rail: number; funded: boolean }

/** A ticket as the wallet event names it, so the server can price it: fare:rail:abuja:kaduna:business. */
export const fareRef = (mode: FareMode, from: string, to: string, cls: RailClass = 'standard') => `fare:${mode}:${from}:${to}:${cls}`;
export function parseFareRef(ref: string | undefined) {
  const m = ref ? /^fare:(air|rail):([a-z]+):([a-z]+):(standard|business)$/.exec(ref) : null;
  return m ? { mode: m[1] as FareMode, from: m[2], to: m[3], cls: m[4] as RailClass } : null;
}
