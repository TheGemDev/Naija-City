// Side hustles and windfalls paid outside a job shift. The game pays them instantly; the server
// (worker/wallet.ts) accepts each payout only up to these limits, so a modified client can't print money.

export type GigId = 'keke_fare' | 'okada_fare' | 'dispatch_fare' | 'odd_job' | 'dance_tips' | 'fuel_sale' | 'durbar_prize' | 'luck' | 'shift_bonus';

export interface GigRule {
  label: string;
  /** Most a single payout can be. */
  max: number;
  /** Most that can be earned from this gig in any rolling real hour. */
  perHour: number;
}

export const GIGS: Record<GigId, GigRule> = {
  keke_fare: { label: 'Keke fare', max: 7_000, perHour: 100_000 },
  okada_fare: { label: 'Okada fare', max: 5_500, perHour: 85_000 },
  /** Food and parcel deliveries on a dispatch bike (game/drive.ts). */
  dispatch_fare: { label: 'Dispatch delivery', max: 9_000, perHour: 120_000 },
  /** The 💰 tiles at places on the map: hawking, portering, volunteering (ODD_JOB_PAY). */
  odd_job: { label: 'Odd job', max: 20_000, perHour: 45_000 },
  dance_tips: { label: 'Owambe dance tips', max: 25_000, perHour: 50_000 },
  fuel_sale: { label: 'Fuel sale', max: 14_000, perHour: 70_000 },
  durbar_prize: { label: 'Durbar prize', max: 35_000, perHour: 35_000 },
  /** Street-story windfalls: found money, small wins. */
  luck: { label: 'Lucky break', max: 50_000, perHour: 60_000 },
  /** The shift game (src/game/shiftGame.ts): up to 30% of a day's wage, once a shift (two can fall in one rolling hour). */
  shift_bonus: { label: 'Shift bonus', max: 90_000, perHour: 180_000 },
};

/** A perfect shift game pays this share of the job's daily wage on top (src/game/shiftGame.ts). */
export const SHIFT_BONUS_PCT = 0.3;
/** The most a shift bonus can be for a job paying `pay` a day. The server holds every claim to this. */
export const maxShiftBonus = (pay: number) => Math.min(GIGS.shift_bonus.max, Math.round((pay * SHIFT_BONUS_PCT) / 50) * 50);

export const isGig = (ref: string | undefined): ref is GigId => !!ref && ref in GIGS;

/** Share of keke/okada fares the motor park's boss takes ("dues"). */
export const PARK_LEVY = 0.1;

/** Renting the vehicle for a hustle (paid once per session). A dispatch bike comes with its cool box. */
export const RENTAL = { keke: 1_500, okada: 800, dispatch: 1_000 };

/** Odd jobs at places pay their listed payout times this (the place tiles show the same). */
export const ODD_JOB_PAY = 1.5;
export const oddJobPay = (payout: number) => Math.min(GIGS.odd_job.max, Math.round((payout * ODD_JOB_PAY) / 50) * 50);

/** What this device has been paid per gig lately, so a payout past the hourly limit is held back here, not taken back by the server. */
const recent: Partial<Record<GigId, { at: number; amount: number }[]>> = {};
const HOUR_MS = 3_600_000;

/** How much more this gig can pay in the rolling hour (the server keeps the real count). */
export function gigRoom(gig: GigId, now = Date.now()) {
  const list = (recent[gig] = (recent[gig] ?? []).filter((p) => now - p.at < HOUR_MS));
  return Math.max(0, GIGS[gig].perHour - list.reduce((a, p) => a + p.amount, 0));
}

/** Note a payout against the gig's hourly limit. */
export function noteGig(gig: GigId, amount: number, now = Date.now()) {
  (recent[gig] ??= []).push({ at: now, amount });
}
