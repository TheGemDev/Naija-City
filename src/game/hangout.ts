// Group hangouts (match nights, owambe squads, suya nights, date nights) and love: dating and marriage.
// Rules only; the server (worker/hangout.ts) hosts, settles and pays.

export type HangoutKind = 'match' | 'owambe' | 'suya' | 'date';
export type HangoutScope = 'friends';

export interface HangoutDef {
  id: HangoutKind;
  label: string;
  icon: string;
  blurb: string;
  /** People needed (host included) for the hangout to pay out. */
  min: number;
  max: number;
  /** Only while the cup final is live. */
  needsFinal?: boolean;
  /** Only for couples; the guest is your partner. */
  couples?: boolean;
}

export const HANGOUTS: HangoutDef[] = [
  { id: 'match', label: 'Match night', icon: '⚽', blurb: 'Gather your people to watch the cup final together.', min: 3, max: 10, needsFinal: true },
  { id: 'owambe', label: 'Owambe squad', icon: '💃🏾', blurb: 'Rock up to the square as a squad, aso-ebi and all.', min: 3, max: 10 },
  { id: 'suya', label: 'Suya night', icon: '🍢', blurb: 'Pepper, onions, cold drinks and gist with your people.', min: 3, max: 10 },
  { id: 'date', label: 'Date night', icon: '🌹', blurb: 'A quiet evening with your partner. Builds your bond.', min: 2, max: 2, couples: true },
];

export const HANGOUT_BY_ID = Object.fromEntries(HANGOUTS.map((h) => [h.id, h])) as Record<HangoutKind, HangoutDef>;

export const HANGOUT = {
  /** Joining window: the hangout runs this long. */
  durationMs: 30 * 60_000,
  /** One hosted hangout per player per this long. */
  hostCooldownMs: 45 * 60_000,
  /** Paid per other attendee, capped. */
  perHead: 2_000,
  maxReward: 20_000,
  /** Total hangout money a player can earn in a real day. */
  dailyCap: 30_000,
  points: 6,
  /** Married couples earn this much more. */
  marriedBoost: 1.1,
  /** Bond added to a couple for a settled date night / any shared hangout. */
  bondDate: 10,
  bondShared: 2,
} as const;

export const hangoutReward = (attendees: number, married: boolean) =>
  Math.min(HANGOUT.maxReward, Math.round((attendees - 1) * HANGOUT.perHead * (married ? HANGOUT.marriedBoost : 1)));

/* ---------- Love ---------- */

export const LOVE = {
  /** Bought at the proposal, refunded if turned down. */
  ringCost: 150_000,
  /** Real time you must have been dating before you can propose. */
  datingMs: 12 * 3_600_000,
  /** Bond needed to propose (a few date nights). */
  bondToMarry: 20,
  divorceCost: 100_000,
  /** Relationships (including pending asks) one player can hold at once. */
  maxPartners: 3,
  /** Chance each existing partner finds out when you take on someone new. */
  caughtChance: 0.4,
  /** Chance a partner finds out when you spend the night with someone else. */
  caughtNightChance: 0.2,
  /** Bond lost when you are caught. A dating partner just leaves. */
  caughtBond: 12,
  /** Spend the night together: bond gained and the wait before the next one. */
  nightBond: 6,
  nightCooldownMs: 8 * 3_600_000,
  /** Clear your name off the cheaters list. Doubles every time you do it. */
  wipeCost: 5_000_000,
} as const;

/** Price of wiping your cheating record, given how many times you've already done it. */
export const cheatWipeCost = (times: number) => LOVE.wipeCost * 2 ** Math.min(times, 10);

/** One time someone cheated, as the Family app's cheaters search shows it. */
export interface CheatRecord {
  id: number;
  cheater: string;
  /** Who they cheated on. */
  partner: string;
  /** Who they cheated with. */
  with: string;
  caught: boolean;
  at: number;
}

export type LoveStatus = 'dating' | 'married';
