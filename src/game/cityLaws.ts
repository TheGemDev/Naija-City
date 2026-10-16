// Laws a city's government sets that the rest of the game has to obey (worker/civic.ts): the okada ban, and the weekly
// rent of its government houses. The server sends the ban with every wallet sync and both with every Civic snapshot.

import { create } from 'zustand';
import { DEFAULT_STATE_CAPS, DEFAULT_STATE_LAWS } from './treasury';

export const useCityLaws = create<{ okadaBan: string[]; govRent: Record<string, number> }>(() => ({ okadaBan: [], govRent: {} }));

export function setOkadaBan(cities: string[]) {
  if (cities.join() !== useCityLaws.getState().okadaBan.join()) useCityLaws.setState({ okadaBan: cities });
}

/** Has that city's government taken okada off its streets? */
export const okadaBanned = (city: string) => useCityLaws.getState().okadaBan.includes(city);

/** Each state's government house rent, already held to the president's maximum (net/civic.ts). */
export function setGovRents(rents: Record<string, number>) {
  const was = useCityLaws.getState().govRent;
  if (Object.keys(rents).some((city) => rents[city] !== was[city])) useCityLaws.setState({ govRent: rents });
}

/** What a government house in that state costs a week: the standard ₦10k until the state's own rate is known. */
export const govRentIn = (city: string) => useCityLaws.getState().govRent[city] ?? Math.min(DEFAULT_STATE_LAWS.govRent, DEFAULT_STATE_CAPS.govRent);
