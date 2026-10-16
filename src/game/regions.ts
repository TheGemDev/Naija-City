// The cities you can be in. Kaduna is home; Abuja (game/abuja.ts), Lagos (game/lagos.ts) and Kano (game/kano.ts) are a flight from the airport.
// Each city has its own map (city.ts): its own outline, roads, places and landmarks.

import type { ActionDef } from './catalog';
import './abuja';
import './lagos';
import './kano';
import { activeMap, cityMap, CITY_MAPS, FLIGHT_FARE, KANO_FARE, LAGOS_FARE, PLACE_BY_ID, type Landmark, type Place } from './city';

export type RegionId = 'kaduna' | 'abuja' | 'lagos' | 'kano';

export interface Region {
  id: RegionId;
  name: string;
  airport: string;
  /** Where its police lock you up, as a sentence says it ("taken to …"): the cells at the back of its police station. */
  prison: string;
  tagline: string;
  ground: string;
  accent: string;
  fare: number;
}

export const REGIONS: Record<RegionId, Region> = {
  kaduna: {
    id: 'kaduna',
    name: 'Kaduna',
    airport: 'Kaduna International Airport',
    prison: 'the cells at Kaduna Police HQ',
    tagline: 'The Crocodile City · Kaduna State',
    ground: '#a9c46a',
    accent: '#3f7d2a',
    fare: 0,
  },
  abuja: {
    id: 'abuja',
    name: 'Abuja',
    airport: 'Nnamdi Azikiwe International Airport',
    prison: 'the cells at Force Headquarters',
    tagline: 'Centre of Unity · Federal Capital Territory',
    ground: '#9fcb7c',
    accent: '#2f7d3b',
    fare: FLIGHT_FARE,
  },
  lagos: {
    id: 'lagos',
    name: 'Lagos',
    airport: 'Murtala Muhammed International Airport',
    prison: 'the cells at the Lagos State Police Command',
    tagline: 'Centre of Excellence · Lagos State',
    ground: '#b5c98a',
    accent: '#2f8a5a',
    fare: LAGOS_FARE,
  },
  kano: {
    id: 'kano',
    name: 'Kano',
    airport: 'Mallam Aminu Kano International Airport',
    prison: 'the cells at the Kano State Police Command',
    tagline: 'Centre of Commerce · Kano State',
    ground: '#cdbb80',
    accent: '#6f8f3a',
    fare: KANO_FARE,
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];
export const REGION_ROUTES: Record<RegionId, RegionId[]> = {
  kaduna: ['abuja', 'lagos', 'kano'],
  abuja: ['kaduna', 'lagos', 'kano'],
  lagos: ['kaduna', 'abuja', 'kano'],
  kano: ['kaduna', 'abuja', 'lagos'],
};

/** The city with that id; anything unknown is Kaduna. */
export function regionOf(id?: string | null): Region {
  return REGIONS[id as RegionId] ?? REGIONS.kaduna;
}

/** The city the player is standing in. */
export const regionHere = () => regionOf(activeMap().id);
export const cityNameHere = () => regionHere().name;

/** A place's name in a city: the bank is Kaduna Community Bank in Kaduna, Garki Community Bank in Abuja. */
export const placeNameIn = (regionId: string | null | undefined, placeId: string) =>
  cityMap(regionId).placeById[placeId]?.name ?? PLACE_BY_ID[placeId]?.name ?? '';

/** Where a job is done in that city, by the name the place goes by there: a Market Trader works at Wuse Market in Abuja. */
export function jobPlaceName(job: { id: string; place: string }, regionId?: string | null) {
  const region = regionOf(regionId).id;
  if (region === 'kaduna') return job.place;
  const base = cityMap('kaduna').places.find((p) => p.jobs?.includes(job.id));
  return (base && cityMap(region).placeById[base.id]?.name) ?? job.place;
}

/** The city of a live position ('city:abuja', 'place:abuja:bank'); Kaduna for anywhere else. */
export const regionOfArea = (area?: string | null) => regionOf(area?.match(/^(?:city|place):([\w-]+)/)?.[1]);

export function regionPlaces(id?: string | null): Place[] {
  return cityMap(id).places;
}

export function regionLandmarks(id?: string | null): Landmark[] {
  return cityMap(id).landmarks;
}

/** A place as it is in that city, if the city has it. */
export function regionPlace(regionId: string | null | undefined, placeId: string): Place | undefined {
  return cityMap(regionId).placeById[placeId];
}

export function regionalAction(regionId: string, placeId: string, actionId: string): ActionDef | undefined {
  if (placeId === 'gamji' && actionId === 'public_rest') {
    return { id: actionId, label: 'Rest on the public bench', icon: '🪑', minutes: 60, pose: 'sit', untilFull: 'energy', perHour: { energy: 100 } };
  }
  if (placeId === 'mosque' && actionId === 'public_bath') {
    return { id: actionId, label: 'Use the public wash area', icon: '🚿', minutes: 60, pose: 'stand', untilFull: 'hygiene', perHour: { hygiene: 100 } };
  }
  // Abuja's National Mosque has no toilet inside (game/places/culture.ts).
  if (((placeId === 'mosque' && regionId !== 'abuja') || placeId === 'motorpark') && actionId === 'public_toilet') {
    return { id: actionId, label: 'Use the public toilet', icon: '🚽', minutes: 60, pose: 'stand', untilFull: 'bladder', perHour: { bladder: 100 } };
  }
  return undefined;
}

export function getRegion(id: string): Region | undefined {
  return id in CITY_MAPS ? REGIONS[id as RegionId] : undefined;
}

/** Where you step out after landing in a city. */
export function regionAirportDoor(id?: string | null) {
  return cityMap(id).placeById.airport.door;
}

/** Where you stand when you arrive in a city with nowhere particular to be: your door at home, the airport elsewhere. */
export function regionStartDoor(id?: string | null) {
  const map = cityMap(id);
  return (map.placeById.home ?? map.placeById.airport).door;
}
