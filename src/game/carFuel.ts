// Every car has a fuel tank. Trips burn litres, and you fill it from the 25L jerrycans in your store.
import { CAR_BY_ID } from './cars';
import { DEFAULT_KM, fuelForKm } from './fares';

export const CAR_FUEL = {
  /** Litres a full tank holds. */
  tank: 40,
    /** Litres in one jerrycan (matches the fuel the pump sells). */
  can: 25,
};

/** Fuel-efficient cars sip less. */
export const fuelUse = (carId: string, km = DEFAULT_KM) => fuelForKm(km, !!CAR_BY_ID[carId]?.perk.includes('Fuel efficient'));

/** Litres left; a car with no record yet has a full tank. */
export const fuelLeft = (carFuel: Record<string, number> | undefined, carId: string) => Math.max(0, Math.min(CAR_FUEL.tank, carFuel?.[carId] ?? CAR_FUEL.tank));
