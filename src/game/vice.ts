// Vice: rules shared by the game and the server (worker/vice.ts), which settles all of it.
//  - the Plug app: buy and sell cana & co, get high, risk a police sweep (just for having the app)
//  - driving high: police pull-overs
//  - protection rackets, murder/kidnap contracts, dirty work, and jail hustles

import { hash } from './live';

/* ---------- Goods ---------- */

export type GoodId = 'cana' | 'colorado' | 'codeine' | 'tramadol';

export interface Good {
  id: GoodId;
  name: string;
  icon: string;
  blurb: string;
  /** What the plug charges for one unit, before the market moves it. */
  base: number;
  /** How long one use keeps you high (real minutes). */
  highMin: number;
}

export const GOODS: Good[] = [
  { id: 'cana', name: 'Cana (igbo)', icon: '🌿', blurb: 'The people’s choice. Wrapped in old newspaper.', base: 3_000, highMin: 20 },
  { id: 'colorado', name: 'Colorado', icon: '🍁', blurb: 'Top-shelf loud. Sold by a guy who calls himself “Chemist”.', base: 8_000, highMin: 35 },
  { id: 'codeine', name: 'Codeine syrup', icon: '🍷', blurb: 'Purple, sticky, illegal. Sold in a Fanta bottle.', base: 12_000, highMin: 45 },
  { id: 'tramadol', name: 'Tramadol', icon: '💊', blurb: 'Strips of “energy”. Okada riders swear by it.', base: 5_000, highMin: 30 },
];
export const GOOD_BY_ID: Record<GoodId, Good> = Object.fromEntries(GOODS.map((g) => [g.id, g])) as Record<GoodId, Good>;
export const isGood = (id: unknown): id is GoodId => typeof id === 'string' && id in GOOD_BY_ID;

export const PLUG = {
  /** Per good, and in total, so nobody can carry the whole market. */
  stashCap: 12,
  stashTotalCap: 30,
  /** Prices drift every slot; one slot is this long. */
  slotMs: 15 * 60_000,
  /** Street customers pay this much over the plug's price… */
  streetMarkup: 1.3,
  /** …and the dealer can short you on a bad day. */
  rippedChance: 0.07,
  /** Public ads cost this much to run, per listing. */
  adFee: 1_000,
  maxListings: 5,
  /** Using more while you're still this high (minutes) risks an overdose. */
  overdoseAtMin: 90,
  overdoseChance: 0.3,
  hospitalBill: 25_000,
  /** Chance a street customer is an undercover officer, before patrols. */
  stingChance: 0.08,
};

/** Today's market price multiplier for a good (same for everyone). */
export function marketMult(good: GoodId, now = Date.now()) {
  const slot = Math.floor(now / PLUG.slotMs);
  const salt = GOODS.findIndex((g) => g.id === good) + 1;
  return 0.7 + (hash(slot * 31 + salt * 7919) % 700) / 1000; // 0.70 – 1.40
}
export const plugPrice = (good: GoodId, now = Date.now()) => Math.round((GOOD_BY_ID[good].base * marketMult(good, now)) / 50) * 50;
export const streetPrice = (good: GoodId, now = Date.now()) => Math.round((plugPrice(good, now) * PLUG.streetMarkup) / 50) * 50;

/* ---------- Police ---------- */

export const SWEEP = {
  /** The app sends a heartbeat this often; the server won't roll more often than minGapMs. */
  everyMs: 4 * 60_000,
  minGapMs: 3 * 60_000,
  /** Chance per roll of being searched just for having the app, at 50% patrols. */
  appChance: 0.05,
  /** Extra per unit in the stash. */
  perUnit: 0.012,
  /** Being high makes you twitchy. */
  highFactor: 1.5,
  maxChance: 0.5,
  /** Fine = this share of the stash's market value + base. */
  finePct: 0.5,
  baseFine: 10_000,
};

/** NDLEA at the airport: every ticketed passenger is searched, so anything in your stash is found. */
export const AIRPORT = {
  /** Longer than a street arrest: this is trafficking, not possession. */
  jailFactor: 2,
  baseFine: 50_000,
  /** Fine = base + this share of the stash's market value. */
  finePct: 1,
};

export const DUI = {
  /** Police stop a high driver this often at most, and this likely (at 50% patrols). */
  everyMs: 25_000,
  chance: 0.28,
  bribe: 60_000,
  bribeWorks: 0.6,
  fleeWorks: 0.35,
  fine: 30_000,
  jailFactor: 1.5,
};

/* ---------- Protection rackets ---------- */

export const RACKET = {
  /** Crime tier needed to run a racket. */
  tier: 'areaboy' as const,
  fees: [5_000, 10_000, 25_000, 50_000],
  /** A game week is 168 real minutes (one real minute is one game hour). */
  periodMs: 168 * 60_000,
  maxVictims: 5,
  /** Boss can't pester the same person again for this long after a refusal. */
  cooldownMs: 60 * 60_000,
  /** Missing two payments in a row breaks the deal and the boys visit. */
  maxStrikes: 2,
  /** The boys take this share of your cash (capped) when you stiff them. */
  beating: { pct: 0.2, cap: 150_000 },
  /** A refusal gets you leaned on for this much of the fee. */
  leanPct: 0.4,
  /** Police catch a racketeer at each collection, before patrols. */
  raidChance: 0.05,
  reportArrest: 0.7,
  /** A protected target is off-limits to the boss for this long after the rival gang wins. */
  shieldMs: 168 * 60_000,
};

/* ---------- Contracts ---------- */

export const CONTRACT = {
  minReward: { hit: 20_000, kidnap: 30_000 },
  maxReward: 500_000,
  ransoms: [1_000_000, 5_000_000, 25_000_000, 100_000_000],
  /** The server keeps this much of the reward as its cut. */
  cutPct: 0.1,
  /** An untaken contract lapses after this long. */
  expiresMs: 3 * 3600_000,
  /** Taker must be this close to the target when they strike. */
  reach: 3.5,
  holdMs: 15 * 60_000,
  hospitalPct: 0.1,
  hospitalCap: 50_000,
  hitBase: 0.4,
  /** Failed attempts: the taker is caught by police this often. */
  failArrest: 0.5,
  struggleEveryMs: 3 * 60_000,
  struggleChance: 0.2,
  rescueBonus: 20_000,
};

/** Random kidnappings while walking or driving round the city (no contract needed). Deliberately rare. */
export const AMBUSH = {
  /** The client checks this often while you are out on the road; the server enforces the same gap. */
  everyMs: 60_000,
  walkChance: 0.003,
  driveChance: 0.005,
  /** A bodyguard scares them off half the time. */
  bodyguardCut: 0.5,
  /** After one lands, no other for this long. */
  cooldownMs: 45 * 60_000,
  /** Ransom = this share of your balance + this share of the price of the car you were taken in, kept inside your origin's range. */
  ransomShare: 0.4,
  carShare: 0.03,
  ransomRound: 5_000,
  /** The origin's max is only a ceiling for modest wallets: anyone richer can be asked for up to this share of their balance. */
  ransomWealthCap: 0.6,
  /** Floor and usual ceiling by status (src/game/origins.ts); wealth can lift the ceiling: a Dangote pikin costs far more than someone on sapa. */
  ransomRange: {
    starter: { min: 500_000, max: 5_000_000 },
    almajiri: { min: 200_000, max: 1_000_000 },
    lapo: { min: 1_000_000, max: 10_000_000 },
    nepo: { min: 5_000_000, max: 100_000_000 },
    richkid: { min: 20_000_000, max: 500_000_000 },
    dangote: { min: 50_000_000, max: 2_000_000_000 },
  } as Record<string, { min: number; max: number }>,
};

/** Garment slots the kidnappers strip when they take your accessories (src/game/wardrobe.ts). */
export const SEIZED_SLOTS = ['head', 'eyes', 'neck', 'wrist', 'bag'] as const;

/* ---------- Dirty work ---------- */

export type OpId = 'forgery' | 'counterfeit' | 'bunker' | 'pirate' | 'betting';

export interface OpDef {
  id: OpId;
  name: string;
  icon: string;
  blurb: string;
  /** Pay up front to start (or to set up, for ones that keep running). */
  cost: number;
  /** Real minutes until there's something to collect. */
  mins: number;
  payout: number;
  /** Keeps running after you collect (you pay to set it up once). */
  persistent?: boolean;
  /** Who catches you: the police or the EFCC. */
  agency: 'police' | 'efcc';
  /** Chance of a bust at each collection, at 50% patrols (or the EFCC fine at 25%). */
  bust: number;
  fine: number;
  /** Only runs during this live event. */
  event?: 'fuel';
}

export const OPS: OpDef[] = [
  { id: 'forgery', name: 'Fake documents', icon: '📄', blurb: 'Forge certificates, “NYSC” letters and land papers for people who need a quick CV.', cost: 25_000, mins: 6, payout: 30_000, agency: 'police', bust: 0.7, fine: 80_000 },
  { id: 'counterfeit', name: 'Print naira', icon: '💵', blurb: 'A printer, some green ink and an unbothered conscience. The EFCC checks serial numbers.', cost: 100_000, mins: 10, payout: 120_000, agency: 'efcc', bust: 0.6, fine: 250_000 },
  { id: 'bunker', name: 'Fuel bunkering', icon: '🛢️', blurb: 'Siphon from the depot while the city queues. Only pays during a fuel scarcity.', cost: 50_000, mins: 5, payout: 60_000, agency: 'police', bust: 0.5, fine: 120_000 },
  { id: 'pirate', name: 'Pirate radio mast', icon: '📡', blurb: 'Radio KD but louder and unlicensed. Ad money every few minutes.', cost: 120_000, mins: 20, payout: 12_000, persistent: true, agency: 'police', bust: 0.35, fine: 100_000 },
  { id: 'betting', name: 'Backstreet betting shop', icon: '🎰', blurb: 'No licence, odds that always favour the house. Collect the takings.', cost: 150_000, mins: 20, payout: 18_000, persistent: true, agency: 'efcc', bust: 0.4, fine: 200_000 },
];
export const OP_BY_ID: Record<OpId, OpDef> = Object.fromEntries(OPS.map((o) => [o.id, o])) as Record<OpId, OpDef>;
export const isOp = (id: unknown): id is OpId => typeof id === 'string' && id in OP_BY_ID;

/* ---------- Jail hustles ---------- */

export const CELL = {
  /** Bribing a guard: costs this much per minute left, and cuts the sentence by this share. */
  bribePerMin: 4_000,
  bribeMin: 15_000,
  cutPct: 0.35,
  /** The guard snitches: more time and a fine. */
  snitchChance: 0.25,
  snitchExtraPct: 0.5,
  snitchFine: 20_000,
  /** Selling inside: the other inmates pay this much over the street price… */
  insideMarkup: 2.2,
  /** …but the guards catch you this often (more time, stash gone). */
  guardCatch: 0.3,
  /** Breakouts. */
  breakoutMin: 20_000,
  breakoutMax: 250_000,
  breakoutChance: 0.45,
  helperCost: 10_000,
  helperJailFactor: 1.5,
};

export interface ViceMe {
  highUntil: number | null;
  heldUntil: number | null;
}

/**
 * Shared with the driving loop (game/drive.ts) and the store without them importing the network layer.
 * `onBoard` is the airport search before a ticketed flight: it resolves true if you were arrested.
 */
export const viceHooks: { highUntil: number; onDriveTick: null | (() => void); onBoard: null | (() => Promise<boolean>) } = { highUntil: 0, onDriveTick: null, onBoard: null };

export const isHighNow = (now = Date.now()) => viceHooks.highUntil > now;
