// Where money goes when a player pays the state: into the treasury (civic_policies.treasury), which the
// elected officials then spend on roads and palliatives. Rules only; the server moves the money.

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
export const STATE_KINDS = new Set(['fine', 'bail', 'hospital', 'owambe_fee']);
