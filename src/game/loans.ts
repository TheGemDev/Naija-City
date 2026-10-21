// Bank loans. Borrow cash now against what you own, repay with interest. The president sets the interest rate (% per
// real day), and all the interest goes to the treasury. Leave a loan unpaid a day past its due date and the bank takes
// what you own to cover it, and you go to a cell. Rules shared with worker/loans.ts.

const DAY_MS = 86_400_000;

export const LOAN = {
  /** Interest is added once per real day, compounding. */
  periodMs: DAY_MS,
  /** A loan falls due this many real days after it is taken. */
  termDays: 7,
  /** After the due date the bank waits this long, then moves in. */
  graceMs: DAY_MS,
  /** Everyone can borrow this much, plus a share of what the bank could take from them (collateral). */
  baseLimit: 50_000,
  /** The share of collateral it lends against: more for each loan repaid on time, up to `max`. */
  share: { base: 0.5, perRepaid: 0.05, max: 0.7 },
  maxLimit: 20_000_000,
  min: 10_000,
  /** Fee kept by the treasury when the loan is paid out. */
  feePct: 2,
  /** Overdue loans charge this many times the going rate. */
  overdueFactor: 2,
  rateLimits: [0, 10] as const,
  defaultRate: 3,
  /** A cell for defaulting, and a longer one when everything the bank took still didn't cover it. */
  jailMinutes: 6 * 60,
  shortJailMinutes: 12 * 60,
  /** After a default the bank won't lend again for this long. */
  banMs: 7 * DAY_MS,
};

/** How much of their collateral the bank lends a borrower with this many loans repaid on time. */
export const creditShare = (repaidOnTime: number) => Math.min(LOAN.share.max, LOAN.share.base + LOAN.share.perRepaid * Math.max(0, repaidOnTime));

/** What the bank counts as security, at what it would sell for today. Businesses aren't: the bank can't take them. */
export interface Collateral {
  cash: number;
  savings: number;
  houses: number;
  cars: number;
  jets: number;
}

export const collateralTotal = (c: Collateral) => c.cash + c.savings + c.houses + c.cars + c.jets;

/** Credit limit for this collateral and record. */
export const creditLimit = (c: Collateral, repaidOnTime: number) =>
  Math.min(LOAN.maxLimit, Math.round(LOAN.baseLimit + creditShare(repaidOnTime) * collateralTotal(c)));

export interface LoanRow {
  id: number;
  principal: number;
  interest: number;
  owed: number;
  borrowed: number;
  takenAt: number;
  dueAt: number;
  /** When the bank moves in if it is still unpaid. */
  seizeAt: number;
  overdue: boolean;
}

/** One thing the bank took for a loan in default, for the borrower's game to apply once. */
export interface Foreclosure {
  id: number;
  kind: 'house' | 'car' | 'jet';
  ref: string;
  value: number;
}

export interface LoanSnapshot {
  rate: number;
  limit: number;
  available: number;
  owed: number;
  overdue: boolean;
  loans: LoanRow[];
  collateral: Collateral;
  /** Share of collateral lent against now, and the record behind it. */
  share: number;
  repaidOnTime: number;
  /** After a default, no lending until then. */
  bannedUntil: number | null;
  /** Taken by the bank and not yet applied to the game. */
  foreclosed: Foreclosure[];
}

/** Interest after `periods` days at `rate`% per day, compounding. */
export const grow = (balance: number, rate: number, periods: number) => Math.round(balance * Math.pow(1 + rate / 100, periods));
