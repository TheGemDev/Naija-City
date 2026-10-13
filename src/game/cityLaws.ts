// Laws a city's government sets that the rest of the game has to obey (worker/civic.ts): for now, the okada
// ban. The server sends them with every wallet sync and every Civic snapshot.

import { create } from 'zustand';

export const useCityLaws = create<{ okadaBan: string[] }>(() => ({ okadaBan: [] }));

export function setOkadaBan(cities: string[]) {
  if (cities.join() !== useCityLaws.getState().okadaBan.join()) useCityLaws.setState({ okadaBan: cities });
}

/** Has that city's government taken okada off its streets? */
export const okadaBanned = (city: string) => useCityLaws.getState().okadaBan.includes(city);
