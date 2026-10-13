import { activeEvent } from './live';
import { useGame } from './store';
import { stateRide } from '../net/civic';
import type { ExecutiveOffice, StateVehicle } from './civic';

// Trip prices scale with distance: fares for rides, litres for your own car.
export type PaidMode = 'keke' | 'okada' | 'cab' | 'helicopter';

/** Drivers charge more while the city queues for fuel. */
export const FARE_SCARCITY = 1.5;

/** One map cell is about 15m. */
export const CELL_METRES = 15;
/** Used where a trip has no map position (estates, or before a place is picked). */
export const DEFAULT_KM = 1.5;

const RATES: Record<PaidMode, { base: number; perKm: number }> = {
  okada: { base: 150, perKm: 100 },
  keke: { base: 200, perKm: 200 },
  cab: { base: 400, perKm: 400 },
  helicopter: { base: 500_000, perKm: 250_000 },
};
/** A convoy is no cab: outriders, a siren and a Hilux of escorts, all on the treasury. */
const CONVOY_RATE = { base: 300_000, perKm: 150_000 };

export const kmBetween = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  (Math.hypot(a.x - b.x, a.z - b.z) * CELL_METRES) / 1000;

/** Drivers pass the president's income tax on to their passengers: a 10% tax makes every ride 10% dearer. */
export const fareTax = () => 1 + useGame.getState().taxRate / 100;

/** What a ride of `km` costs whoever pays for it, tax included, rounded to the nearest ₦50. */
const listFareForKm = (mode: string, km: number, r: { base: number; perKm: number } | undefined = RATES[mode as PaidMode]) => {
  const surge = (activeEvent() === 'fuel' ? FARE_SCARCITY : 1) * fareTax();
  return r ? Math.max(50, Math.round(((r.base + r.perKm * Math.max(0, km)) * surge) / 50) * 50) : 0;
};

/**
 * An office holder's helicopter and convoy (game/civic.ts STATE_FLEET) are the state's: whose fleet this ride is in,
 * and what the treasury pays for it. Null for everyone else, and when the budget can't cover it.
 */
export const stateFareForKm = (mode: string, km: number): { office: ExecutiveOffice; vehicle: StateVehicle; amount: number } | null => {
  if (mode !== 'helicopter' && mode !== 'cab') return null;
  const amount = listFareForKm(mode, km, mode === 'cab' ? CONVOY_RATE : undefined);
  const office = stateRide(amount);
  return office ? { office, vehicle: mode, amount } : null;
};

/** Fare you pay for a ride of `km`: nothing when the treasury pays. */
export const fareForKm = (mode: string, km: number) => (stateFareForKm(mode, km) ? 0 : listFareForKm(mode, km));

/** Litres a trip of `km` burns: a little to start, then more the further you go. */
export const fuelForKm = (km: number, efficient: boolean) => {
  const litres = (1 + 1.5 * Math.max(0, km)) * (efficient ? 0.75 : 1);
  return Math.max(0.5, Math.round(litres * 2) / 2);
};
