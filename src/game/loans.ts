// Bank loans. Borrow cash now, repay with interest. The president sets the interest rate (% per game week,
// which is 168 real minutes), and all the interest goes to the treasury. Rules shared with worker/loans.ts.

export const LOAN = {
  /** Interest is added once per game week (one real minute is one game hour). */
  periodMs: 168 * 60_000,
  /** A loan falls due after this many game weeks. */
  termWeeks: 4,
  /** Everyone can borrow this much, plus a share of what they already have in the bank. */
  baseLimit: 100_000,
  wealthShare: 0.5,
  maxLimit: 3_000_000,
  min: 10_000,
  /** Fee kept by the treasury when the loan is paid out. */
  feePct: 2,
  /** Overdue loans charge this many times the going rate. */
  overdueFactor: 2,
  rateLimits: [0, 30] as const,
  defaultRate: 10,
};

export interface LoanRow {
  id: number;
  principal: number;
  interest: number;
  owed: number;
  borrowed: number;
  takenAt: number;
  dueAt: number;
  overdue: boolean;
}

export interface LoanSnapshot {
  rate: number;
  limit: number;
  available: number;
  owed: number;
  overdue: boolean;
  loans: LoanRow[];
}

/** Interest after `periods` weeks at `rate`% per week, compounding. */
export const grow = (balance: number, rate: number, periods: number) => Math.round(balance * Math.pow(1 + rate / 100, periods));
