// Side hustles and windfalls paid outside a job shift. The game pays them instantly; the server
// (worker/wallet.ts) accepts each payout only up to these limits, so a modified client can't print money.

export type GigId = 'keke_fare' | 'okada_fare' | 'dance_tips' | 'fuel_sale' | 'durbar_prize' | 'luck' | 'shift_bonus';

export interface GigRule {
  label: string;
  /** Most a single payout can be. */
  max: number;
  /** Most that can be earned from this gig in any rolling real hour. */
  perHour: number;
}

export const GIGS: Record<GigId, GigRule> = {
  keke_fare: { label: 'Keke fare', max: 4_000, perHour: 60_000 },
  okada_fare: { label: 'Okada fare', max: 3_000, perHour: 50_000 },
  dance_tips: { label: 'Owambe dance tips', max: 15_000, perHour: 30_000 },
  fuel_sale: { label: 'Fuel sale', max: 14_000, perHour: 70_000 },
  durbar_prize: { label: 'Durbar prize', max: 20_000, perHour: 20_000 },
  /** Street-story windfalls: found money, small wins. */
  luck: { label: 'Lucky break', max: 50_000, perHour: 60_000 },
  /** The shift game (src/game/shiftGame.ts): up to 30% of a day's wage, once a shift. */
  shift_bonus: { label: 'Shift bonus', max: 6_000, perHour: 12_000 },
};

/** A perfect shift game pays this share of the job's daily wage on top (src/game/shiftGame.ts). */
export const SHIFT_BONUS_PCT = 0.3;
/** The most a shift bonus can be for a job paying `pay` a day. The server holds every claim to this. */
export const maxShiftBonus = (pay: number) => Math.min(GIGS.shift_bonus.max, Math.round((pay * SHIFT_BONUS_PCT) / 50) * 50);

export const isGig = (ref: string | undefined): ref is GigId => !!ref && ref in GIGS;

/** Share of keke/okada fares the motor park's boss takes ("dues"). */
export const PARK_LEVY = 0.1;

/** Renting the vehicle for a hustle (paid once per session). */
export const RENTAL = { keke: 1_500, okada: 800 };
