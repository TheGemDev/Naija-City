// Centralised money-movement caps so bank, social, and vice stay in sync.

/** Max amount for a single bank transfer or withdrawal. */
export const MAX_BANK_TRANSFER = 100_000_000;

/** Max amount for a player-to-player payment or money request. */
export const MAX_SOCIAL_AMOUNT = 10_000_000_000;

/** Max ransom pledge a player can put toward a kidnapping contract. */
export const MAX_RANSOM_PLEDGE = 100_000_000_000;
