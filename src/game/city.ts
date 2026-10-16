// The town map: Kaduna's outline, roads, River Kaduna, places you can visit, and filler houses/trees.
// Same cell convention as the house grid: cell (x, z) covers world [x, x+1] × [z, z+1]. North is -z.
//
// Rough real-world layout: River Kaduna winds west → east across the middle and splits the city.
//   North: the airport out north-west, Kawo (motor park, stadium), Rigasa (train) out west, NDA, the central district
//          (Lugard Hall, Murtala Square, Central Market, Hamdala, Arewa House), Ungwan Rimi / Malali GRA.
//   South: Tudun Wada (Poly), Kakuri (textile mills), Barnawa (home), Sabon Tasha, and the refinery.
// The only ways across are the bridges where the bypass, Ahmadu Bello Way / Kachia Road and
// Constitution Road meet the river.

import type { ActionDef } from './catalog';
import type { Cell } from './grid';
import { JET_TRIP } from './cars';
import { HOTEL_ID, ROOM_TYPES, roomPlaceId, type RoomType } from './hotel';
import { liveEvent } from './live';
import { trainActions } from './transport';

export const CITY_W = 60;
export const CITY_H = 84;

export interface Rect { x: number; z: number; w: number; d: number }
export type P2 = [number, number];

/* ---------- Shape of the city ---------- */

/** Closed Catmull-Rom curve through the points, `n` samples per segment. */
export function smoothClosed(pts: P2[], n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    for (let k = 0; k < n; k++) out.push(catmull(p0, p1, p2, p3, k / n));
  }
  return out;
}

export function smoothOpen(pts: P2[], n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) out.push(catmull(p0, pts[i], pts[i + 1], p3, k / n));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function catmull(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/** City boundary: tall north–south, Rigasa bulging west, narrowing to the refinery in the south. */
export const OUTLINE: P2[] = smoothClosed(
  [
    [16, -1], [30, -2], [42, -1], [52, 3], [58, 11], [59.5, 22], [58, 32], [59.5, 44], [57, 56],
    [52, 66], [47, 76], [38, 84.5], [27, 84], [17, 76], [9, 69], [4, 58], [2, 46], [-1, 36], [-0.5, 24], [-0.5, 12], [-1, 3], [3, -1.5],
  ],
  8,
);

export function insidePoly(x: number, z: number, poly: P2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** River Kaduna's centre line, west → east. */
export const RIVER_PATH: P2[] = smoothOpen(
  [[-4, 36.5], [5, 38], [13, 41.5], [21, 41], [28, 38.8], [34, 40.5], [41, 44.5], [48, 46], [55, 44.5], [64, 46]],
  10,
);
export const RIVER_HALF_WIDTH = 1.45;
/** The part of the river that's drawn: only where it's over the island. */
export const RIVER_DRAW: P2[] = RIVER_PATH.filter(([x, z]) => insidePoly(x, z, OUTLINE));

function riverDistance(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const [ax, az] = RIVER_PATH[i];
    const [bx, bz] = RIVER_PATH[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

/* ---------- Roads ---------- */

export interface Road extends Rect { main?: boolean; name?: string }

export const ROADS: Road[] = [
  { x: 28, z: 0, w: 2, d: 42, main: true, name: 'Ahmadu Bello Way' },
  { x: 28, z: 42, w: 2, d: 40, main: true, name: 'Kachia Road' },
  { x: 8, z: 8, w: 2, d: 62, main: true, name: 'Nnamdi Azikiwe Bypass' },
  { x: 48, z: 6, w: 2, d: 58, main: true, name: 'Constitution Road' },
  { x: 8, z: 6, w: 44, d: 2, main: true, name: 'Kawo Road' },
  { x: 3, z: 16, w: 54, d: 2, main: true, name: 'Independence Way' },
  { x: 2, z: 27, w: 56, d: 2, main: true, name: 'Ali Akilu Road' },
  { x: 6, z: 52, w: 50, d: 2, main: true, name: 'Aminu Kano Way' },
  { x: 10, z: 64, w: 42, d: 2, main: true, name: 'Sabon Tasha Road' },
  { x: 18, z: 74, w: 28, d: 2, main: true, name: 'Refinery Road' },
  // Streets
  { x: 18, z: 2, w: 1, d: 34 },
  { x: 38, z: 4, w: 1, d: 32 },
  { x: 18, z: 44, w: 1, d: 30 },
  { x: 38, z: 47, w: 1, d: 27 },
  { x: 10, z: 60, w: 38, d: 1 },
  { x: 3, z: 23, w: 5, d: 1 },
];

export interface Pothole {
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
  severity: 1 | 2 | 3;
}

export const POTHOLES: Pothole[] = [
  // Nnamdi Azikiwe Bypass (heavy truck traffic with deep, notorious craters)
  { x: 8.4, z: 12.8, w: 0.65, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 9.3, z: 18.5, w: 0.85, d: 0.65, yaw: -0.2, severity: 3 },
  { x: 8.6, z: 24.3, w: 0.55, d: 0.45, yaw: 0.5, severity: 1 },
  { x: 9.2, z: 32.0, w: 0.8, d: 0.6, yaw: 0.1, severity: 2 },
  { x: 8.5, z: 46.2, w: 0.9, d: 0.7, yaw: -0.4, severity: 3 },
  { x: 9.3, z: 54.7, w: 0.65, d: 0.5, yaw: 0.2, severity: 2 },
  { x: 8.7, z: 62.4, w: 0.75, d: 0.55, yaw: 0.6, severity: 2 },

  // Sabon Tasha Road (worn asphalt, heavy commercial flow)
  { x: 15.6, z: 64.5, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 23.2, z: 65.3, w: 0.85, d: 0.6, yaw: -0.5, severity: 3 },
  { x: 33.7, z: 64.4, w: 0.55, d: 0.45, yaw: 0.2, severity: 1 },
  { x: 42.1, z: 65.2, w: 0.8, d: 0.6, yaw: 0.4, severity: 2 },

  // Refinery Road (industrial zone craters)
  { x: 24.5, z: 74.4, w: 0.9, d: 0.65, yaw: -0.2, severity: 3 },
  { x: 31.8, z: 75.2, w: 0.65, d: 0.5, yaw: 0.4, severity: 2 },
  { x: 39.2, z: 74.6, w: 0.75, d: 0.55, yaw: 0.1, severity: 2 },

  // Aminu Kano Way
  { x: 12.8, z: 53.3, w: 0.6, d: 0.5, yaw: 0.3, severity: 1 },
  { x: 26.4, z: 52.5, w: 0.8, d: 0.6, yaw: -0.3, severity: 2 },
  { x: 44.2, z: 53.4, w: 0.7, d: 0.5, yaw: 0.5, severity: 2 },

  // Ahmadu Bello Way & Kachia Road
  { x: 28.5, z: 11.4, w: 0.55, d: 0.45, yaw: 0.2, severity: 1 },
  { x: 29.3, z: 22.8, w: 0.75, d: 0.55, yaw: -0.3, severity: 2 },
  { x: 28.6, z: 32.1, w: 0.6, d: 0.5, yaw: 0.4, severity: 1 },
  { x: 29.4, z: 47.6, w: 0.85, d: 0.65, yaw: 0.2, severity: 3 },
  { x: 28.5, z: 58.2, w: 0.7, d: 0.5, yaw: -0.4, severity: 2 },
  { x: 29.2, z: 69.5, w: 0.75, d: 0.55, yaw: 0.3, severity: 2 },

  // Independence Way & Ali Akilu Road
  { x: 14.5, z: 16.4, w: 0.6, d: 0.45, yaw: 0.1, severity: 1 },
  { x: 41.2, z: 17.3, w: 0.75, d: 0.55, yaw: -0.2, severity: 2 },
  { x: 22.3, z: 27.5, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 45.8, z: 28.3, w: 0.55, d: 0.4, yaw: -0.3, severity: 1 },

  // Kawo Road
  { x: 16.2, z: 6.5, w: 0.7, d: 0.5, yaw: 0.4, severity: 2 },
  { x: 36.8, z: 7.3, w: 0.65, d: 0.5, yaw: -0.1, severity: 2 },

  // Side streets & back alleys
  { x: 18.5, z: 8.6, w: 0.55, d: 0.45, yaw: 0.5, severity: 2 },
  { x: 38.5, z: 19.3, w: 0.6, d: 0.5, yaw: -0.2, severity: 2 },
  { x: 18.5, z: 57.4, w: 0.65, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 22.4, z: 60.5, w: 0.7, d: 0.45, yaw: 0.2, severity: 2 },
];

// Every city's potholes share one numbering on the server (worker/roads.ts): Kaduna's sites are 0, 1, 2…,
// each other city's start at its own base (game/abuja.ts), so adding a site to one city never renumbers another.
const POTHOLE_SETS: { city: string; base: number; list: Pothole[] }[] = [{ city: 'kaduna', base: 0, list: POTHOLES }];
const potholeSet = (site: number) => POTHOLE_SETS.find((s) => site >= s.base && site < s.base + s.list.length);

export function addCityPotholes(city: string, base: number, list: Pothole[]) {
  if (!POTHOLE_SETS.some((s) => s.city === city)) POTHOLE_SETS.push({ city, base, list });
}
/** The pothole with that site number, in whichever city it is. */
export function potholeOf(site: number): Pothole | undefined {
  const set = potholeSet(site);
  return set?.list[site - set.base];
}
export const potholeCity = (site: number) => potholeSet(site)?.city;
/** The site numbers of one city's potholes. */
export const potholeSites = (city: string) => POTHOLE_SETS.filter((s) => s.city === city).flatMap((s) => s.list.map((_, i) => s.base + i));
export const allPotholeSites = () => POTHOLE_SETS.flatMap((s) => s.list.map((_, i) => s.base + i));

/* ---------- Places ---------- */

export interface Place extends Rect {
  id: string;
  name: string;
  area: string;
  icon: string;
  blurb: string;
  /** Model key in cityModels.tsx. */
  model: string;
  /** Where the avatar stands before going in. */
  door: Cell;
  /** Open ground (parks, pitches): you can walk on it. */
  ground?: boolean;
  /** Opening hours. A close past 24 runs over midnight. */
  hours?: [number, number];
  /** Jobs whose shift happens here. */
  jobs?: string[];
  actions: ActionDef[];
}

const hidden = 'hidden' as const;
/** A one-way ticket between Kaduna and Abuja. */
export const FLIGHT_FARE = 25_000;
/** An hour in an airline seat: a nap and the in-flight meal. Flights are short, so the rates are steep. */
export const FLIGHT_PERHOUR = { energy: 120, hunger: 147 };
/** A one-way ticket to or from Lagos (game/lagos.ts). */
export const LAGOS_FARE = 40_000;
/** A one-way ticket between Kano (game/kano.ts) and Kaduna or Abuja. Lagos is the long haul from there too. */
export const KANO_FARE = 30_000;
/** What an airline seat costs between two cities, either way. */
/** An airline seat for each pair of cities, by how far apart they are (Kaduna to Abuja or Kano is a short hop; Kano to Lagos is the longest). */
const FARES: Record<string, number> = {
  'abuja-kaduna': 20_000,
  'kaduna-kano': 21_500,
  'abuja-kano': 29_500,
  'abuja-lagos': 65_000,
  'kaduna-lagos': 85_000,
  'kano-lagos': 110_000,
};
export const flightFare = (a: string, b: string) => FARES[[a, b].sort().join('-')] ?? FLIGHT_FARE;
/** Your own jet on a route: dearer the further it goes, like the seat. */
export const jetFare = (a: string, b: string) => Math.round((flightFare(a, b) * 200) / 100_000) * 100_000;
/**
 * Minutes in the air between two cities, either way, on an airline and in your own jet: Abuja and Kano are short
 * hops from Kaduna, Lagos is the long haul. Every flight stays under SKIP_MIN_TASK (game/timeRates.ts): a flight
 * that long would skip ahead, and the furthest city would be the quickest to reach.
 */
const AIR_MINUTES: Record<string, { ticket: number; jet: number }> = {
  'abuja-kaduna': { ticket: 12, jet: 6 },
  'abuja-lagos': { ticket: 22, jet: 10 },
  'kaduna-lagos': { ticket: 30, jet: 14 },
  'kaduna-kano': { ticket: 10, jet: 5 },
  'abuja-kano': { ticket: 18, jet: 8 },
  'kano-lagos': { ticket: 36, jet: 16 },
};
const airMinutes = (a: string, b: string) => AIR_MINUTES[[a, b].sort().join('-')];
export const flightMinutes = (a: string, b: string) => airMinutes(a, b).ticket;
/** Your own jet on that route. However short the hop, every bar is full by the time you land. */
export function jetFlight(a: string, b: string) {
  const minutes = airMinutes(a, b).jet;
  const rate = ([need, perHour]: [string, number]) => [need, Math.round((perHour * JET_TRIP.minutes) / minutes)];
  return { minutes, perHour: Object.fromEntries(Object.entries(JET_TRIP.perHour).map(rate)) as typeof JET_TRIP.perHour };
}

export const PLACES: Place[] = [
  /* ---- Kawo & the far north ---- */
  {
    id: 'airport', name: 'Kaduna International Airport', area: 'Mando', icon: '✈️', model: 'airport', blurb: 'Kaduna’s international airport in Mando. Watch flights take off or report for ground crew duty.',
    x: 1, z: 0, w: 16, d: 5, door: { x: 12, z: 6 }, jobs: ['airport'],
    actions: [
      { id: 'planespot', label: 'Watch planes take off', icon: '🛫', category: 'social', minutes: 45, pose: 'stand', perHour: { fun: 40 }, tagline: 'Watch private jets and commercial flights soar into the sky' },
      { id: 'runway_dash', label: 'Sprint toward runway for high-speed selfie', icon: '🏃🏾', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 170, social: 120 }, tagline: 'Airport security screaming into radios while you snap the coolest flick!' },
      { id: 'first_class_flex', label: 'Lounge in VIP first-class executive suite', icon: '🍸', category: 'spend', cost: 12_000, minutes: 45, pose: 'sit', perHour: { fun: 130, social: 110, energy: 20 }, tagline: 'Unlimited chilled drinks and plush leather recliners' },
      { id: 'fly_abuja', label: 'Fly to Abuja', icon: '🛫', category: 'spend', cost: flightFare('kaduna', 'abuja'), minutes: flightMinutes('kaduna', 'abuja'), pose: hidden, effect: 'travel', destination: 'abuja', perHour: FLIGHT_PERHOUR, tagline: 'A short hop to Nnamdi Azikiwe International. Window seat, small chops' },
      { id: 'fly_abuja_jet', label: 'Fly your private jet to Abuja', icon: '🛩️', category: 'spend', cost: jetFare('kaduna', 'abuja'), ...jetFlight('kaduna', 'abuja'), pose: hidden, effect: 'travel', destination: 'abuja', jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
      { id: 'fly_lagos', label: 'Fly to Lagos', icon: '🛫', category: 'spend', cost: flightFare('kaduna', 'lagos'), minutes: flightMinutes('kaduna', 'lagos'), pose: hidden, effect: 'travel', destination: 'lagos', perHour: FLIGHT_PERHOUR, tagline: 'Half an hour south to Murtala Muhammed International. Hold your bag at arrivals' },
      { id: 'fly_lagos_jet', label: 'Fly your private jet to Lagos', icon: '🛩️', category: 'spend', cost: jetFare('kaduna', 'lagos'), ...jetFlight('kaduna', 'lagos'), pose: hidden, effect: 'travel', destination: 'lagos', jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
      { id: 'fly_kano', label: 'Fly to Kano', icon: '🛫', category: 'spend', cost: flightFare('kaduna', 'kano'), minutes: flightMinutes('kaduna', 'kano'), pose: hidden, effect: 'travel', destination: 'kano', perHour: FLIGHT_PERHOUR, tagline: 'Twenty minutes north to Mallam Aminu Kano International. Seat belts on, seat belts off' },
      { id: 'fly_kano_jet', label: 'Fly your private jet to Kano', icon: '🛩️', category: 'spend', cost: jetFare('kaduna', 'kano'), ...jetFlight('kaduna', 'kano'), pose: hidden, effect: 'travel', destination: 'kano', jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
      { id: 'ground_crew_hustle', label: 'Marshal arriving jet with bright orange batons', icon: '🛬', category: 'work', minutes: 60, payout: 5_000, pose: 'stand', perHour: { fun: 70, energy: -15 }, tagline: 'Guide 70-ton airplane safely into its parking bay' },
    ],
  },
  {
    id: 'motorpark', name: 'Kawo Motor Park', area: 'Kawo', icon: '🚌', model: 'motorpark', blurb: 'Buses, keke, loud agbero calls, and hot roasted corn.',
    x: 31, z: 1, w: 7, d: 4, door: { x: 33, z: 5 }, hours: [5, 22], jobs: ['keke'],
    actions: [
      { id: 'conductor_shout', label: 'Conductor hype: "BARNAWA CHIKUN ENTER WITH YOUR CHANGE!"', icon: '📢', category: 'wild', minutes: 30, payout: 3_500, pose: 'stand', perHour: { fun: 160, social: 140 }, tagline: 'Hang one leg out of the keke door and pack 4 passengers!' },
      { id: 'corn', label: 'Roasted corn & spicy pear snack', icon: '🌽', category: 'spend', minutes: 20, cost: 700, pose: 'stand', perHour: { hunger: 50, social: 30, fun: 20 }, tagline: 'Fresh yellow corn charred over open coals with ube' },
      { id: 'park_hustle', label: 'Load luggage onto bus rooftop rack', icon: '🧳', category: 'work', minutes: 45, payout: 4_000, pose: 'stand', perHour: { energy: -20, hygiene: -20, fun: 30 }, tagline: 'Tie down heavy sacks of yams and metal trunks with thick rope' },
      { id: 'zaria', label: 'Road trip bus to Zaria', icon: '🚌', category: 'social', minutes: 120, cost: 3_500, pose: hidden, perHour: { social: 30, fun: 20 }, tagline: 'Cruising the Kaduna-Zaria expressway with radio tunes' },
    ],
  },
  {
    id: 'secretariat', name: 'State Secretariat', area: 'Kawo', icon: '🏢', model: 'secretariat', blurb: 'Files, stamps and ‘come back tomorrow’.',
    x: 20, z: 1, w: 6, d: 4, door: { x: 22, z: 5 }, jobs: ['civil'],
    actions: [
      { id: 'file_missing', label: 'Execute "The file is missing" prank', icon: '📂', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 140, social: 70 }, tagline: '"Oga is in a meeting, bring Form 3B next month!"' },
      { id: 'stamps_tea', label: 'Civil service sweet tea & biscuits', icon: '☕', category: 'social', minutes: 45, cost: 500, pose: 'sit', perHour: { hunger: 40, social: 80, fun: 30 }, tagline: 'Gist with clerks while waiting for official stamps' },
      { id: 'express_speed', label: 'Pay "express processing" facilitation fee', icon: '⚡', category: 'spend', cost: 5_000, minutes: 15, pose: 'stand', perHour: { fun: 40, social: 50 }, tagline: 'Skip the 3-month bureaucratic queue instantly' },
    ],
  },
  {
    id: 'nda', name: 'Nigerian Defence Academy', area: 'Afaka Road', icon: '🎖️', model: 'nda', blurb: 'Officer cadets, drill and the famous passing-out parade.',
    x: 10, z: 9, w: 7, d: 6, door: { x: 13, z: 15 }, hours: [7, 18],
    actions: [
      { id: 'parade', label: 'Watch the passing-out parade', icon: '🎖️', category: 'social', minutes: 90, pose: 'stand', perHour: { fun: 20, social: 15 }, tagline: 'Watch swords glistening in the sun' },
      { id: 'drill', label: 'Join the fitness drill', icon: '💪🏾', category: 'work', minutes: 60, pose: 'stand', perHour: { fun: 10, energy: -12, hygiene: -25 }, tagline: 'March and do push-ups on the red parade ground' },
      { id: 'cadet_pushup', label: '100 knuckle push-up challenge', icon: '🔥', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 130, energy: -20, hygiene: -25 }, tagline: 'Compete against cadets on bare gravel' },
      { id: 'mess_lunch', label: 'Lunch at Senior Officers’ Mess', icon: '🍽️', category: 'spend', cost: 4_000, minutes: 45, pose: 'sit', perHour: { hunger: 100, fun: 40, social: 30 }, tagline: 'Cold malt and roasted chicken in officer quarters' },
    ],
  },
  {
    id: 'church', name: "St. Joseph's Cathedral", area: 'Kaduna North', icon: '⛪', model: 'church', blurb: 'Big choir, long sermon, plenty of friends after service.',
    x: 31, z: 8, w: 4, d: 5, door: { x: 30, z: 10 }, hours: [6, 20],
    actions: [
      { id: 'service', label: 'Attend Sunday service', icon: '🙏🏾', category: 'social', minutes: 120, pose: hidden, perHour: { social: 25, fun: 10 }, tagline: 'Praise, worship, and heartfelt preaching' },
      { id: 'choir_lead', label: 'Lead high-tempo praise & dance', icon: '💃🏾', category: 'wild', minutes: 45, pose: 'stand', perHour: { fun: 150, social: 120, energy: -15 }, tagline: 'Jump and wave white handkerchief in the aisle!' },
      { id: 'tithe_envelope', label: 'Drop generous offering & tithe', icon: '💸', category: 'spend', cost: 10_000, minutes: 15, pose: 'stand', effect: 'goodDeed', perHour: { social: 50, fun: 30 }, tagline: 'Dance forward to the altar with thanksgiving' },
    ],
  },
  {
    id: 'stadium', name: 'Ahmadu Bello Stadium', area: 'Kawo', icon: '🏟️', model: 'stadium', blurb: 'Home of Kaduna United. Roaring stands, athletic showdowns, and matchday drama.',
    x: 40, z: 8, w: 8, d: 7, door: { x: 43, z: 15 }, hours: [8, 22], jobs: ['fitness'],
    actions: [
      { id: 'match', label: 'Watch Kaduna United match', icon: '⚽', category: 'social', minutes: 120, cost: 2_000, pose: hidden, perHour: { fun: 30, social: 20 }, tagline: 'Cheer Kaduna United from the packed terraces' },
      { id: 'sprint_challenge', label: '100m street sprint showdown for ₦5k', icon: '🏃🏾', category: 'wild', minutes: 30, payout: 5_000, pose: 'stand', perHour: { fun: 170, energy: -25, hygiene: -30 }, tagline: 'Dust Kaduna’s fastest sprinters on the red track!' },
      { id: 'pitch_invasion', label: 'Pitch invasion knee-slide celebration', icon: '⚽', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 190, social: 140, hygiene: -20 }, tagline: 'Evade stadium stewards and knee-slide to the fans!' },
      { id: 'stadium_wave', label: 'Start roaring Mexican wave & chant', icon: '📣', category: 'social', minutes: 45, pose: 'stand', perHour: { fun: 150, social: 160 }, tagline: 'Get 5,000 Kaduna United fans singing in harmony' },
      { id: 'friendly_bet', label: 'Join the ₦500 score-prediction pool', icon: '🎟️', category: 'spend', minutes: 90, cost: 500, pose: 'stand', perHour: { fun: 24, social: 30 }, tagline: 'Try your score forecasting luck' },
      { id: 'run', label: 'Run training laps on the track', icon: '🏃🏾', category: 'work', minutes: 45, pose: hidden, perHour: { fun: 15, hygiene: -25, energy: -8 }, tagline: 'Build stamina and fitness' },
      { id: 'gym_shower', label: 'Use the changing-room shower', icon: '🚿', category: 'social', minutes: 20, pose: 'stand', perHour: { hygiene: 320 }, tagline: 'Cool down and freshen up' },
    ],
  },
  {
    id: 'police', name: 'Kaduna Police HQ', area: 'Central', icon: '👮🏾', model: 'secretariat', blurb: 'Kaduna’s central police station. High-drama bail negotiations and wanted fugitives.',
    x: 2, z: 30, w: 6, d: 5, door: { x: 4, z: 35 }, hours: [6, 22], jobs: ['police'],
    actions: [
      { id: 'dry_gin_bribe', label: 'Audacious dry gin & bribe attempt', icon: '🥃', category: 'wild', minutes: 20, cost: 3_000, pose: 'stand', perHour: { fun: 140, social: 80 }, tagline: '"Officer salute! Weekend dey come!" Slide gin across desk.' },
      { id: 'spiritual_report', label: 'Report neighbor for spiritual/juju attack', icon: '🧙‍♂️', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 150, social: 90 }, tagline: 'Explain to DPO why their rooster only crows at your window' },
      { id: 'snitch_bounty', label: 'Snitch on wanted street fugitive', icon: '🤠', category: 'social', minutes: 45, pose: 'stand', perHour: { fun: 100, social: 60 }, tagline: 'Give intelligence to the sergeant on local thieves' },
      { id: 'station_tea', label: 'Drink bitter police station tea & wait', icon: '☕', category: 'social', minutes: 30, pose: 'sit', perHour: { social: 30, fun: 10 }, tagline: 'Listen to the counter sergeant yell into crackling radio' },
    ],
  },
  {
    id: 'techhub', name: 'Tech Hub', area: 'Malali GRA', icon: '💻', model: 'techhub', blurb: 'Fast Wi-Fi, startups and free coffee.',
    x: 51, z: 10, w: 4, d: 4, door: { x: 52, z: 14 }, hours: [9, 21], jobs: ['dev'],
    actions: [
      { id: 'fake_startup', label: 'Pitch insane AI/Web3 startup to angels', icon: '🚀', category: 'wild', minutes: 45, pose: 'stand', perHour: { fun: 160, social: 120 }, tagline: '"Blockchain akara logistics!" Watch investor jaws drop.' },
      { id: 'leech_wifi', label: 'Leech 50GB high-speed Wi-Fi & coffee', icon: '☕', category: 'spend', cost: 500, minutes: 60, pose: 'sit', perHour: { fun: 120, energy: 15 }, tagline: 'Download entire seasons while staring at terminal' },
      { id: 'meetup', label: 'Attend developer meetup & demo', icon: '🧑🏾‍💻', category: 'work', minutes: 120, pose: hidden, knowledgePerHour: 0.5, perHour: { social: 20, fun: 5 }, tagline: 'Code review, tech networking, and pizza' },
    ],
  },

  /* ---- Rigasa & the central district ---- */
  {
    id: 'station', name: 'Rigasa Train Station', area: 'Rigasa', icon: '🚆', model: 'station', blurb: 'Kaduna – Abuja train. High speed, bustling platforms, and VIP lounges.',
    x: 2, z: 18, w: 6, d: 5, door: { x: 5, z: 23 }, hours: [6, 18],
    actions: [
      // Tickets to every city the lines reach (game/transport.ts), sold at the ticket desk (ui/TrainDesk.tsx).
      ...trainActions('kaduna'),
      { id: 'abuja', label: 'Day trip to Abuja', icon: '🚆', category: 'social', minutes: 480, cost: 10_000, pose: hidden, perHour: { fun: 15, social: 12 }, tagline: 'First-class morning express to Idu Station' },
      { id: 'platform_sprint', label: 'Dramatic sprint for departing train doors', icon: '🏃🏾', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 140, social: 60, energy: -15 }, tagline: 'Dive through the sliding doors as the whistle blows!' },
      { id: 'vip_lounge', label: 'Chill in VIP air-conditioned lounge', icon: '🛋️', category: 'spend', cost: 5_000, minutes: 45, pose: 'sit', perHour: { fun: 50, energy: 20 }, tagline: 'Sip cold drinks and relax away from the crowds' },
    ],
  },
  {
    id: 'mosque', name: 'Sultan Bello Mosque', area: 'Ungwan Sarki', icon: '🕌', model: 'mosque', blurb: 'Prayer hall with a free public wash area and toilet.',
    x: 12, z: 19, w: 5, d: 4, door: { x: 14, z: 23 },
    actions: [
      { id: 'pray', label: 'Offer prayers', icon: '🤲🏾', category: 'social', minutes: 30, pose: hidden, perHour: { social: 20, fun: 15 }, tagline: 'Find peace and quiet reflection' },
      { id: 'jumat', label: "Jumu'ah Friday prayers", icon: '🕌', category: 'social', minutes: 90, pose: hidden, perHour: { social: 30, fun: 12 }, tagline: 'Grand congregation with thousands of worshippers' },
      { id: 'sadaqah', label: 'Distribute generous Sadaqah charity', icon: '💸', category: 'spend', cost: 5_000, minutes: 20, pose: 'stand', effect: 'goodDeed', perHour: { social: 40, fun: 20 }, tagline: 'Share blessings with the needy outside the gates' },
    ],
  },
  {
    id: 'lugard', name: 'Lugard Hall', area: 'Central', icon: '🏛️', model: 'lugard', blurb: 'The domed seat of the old Northern Region.',
    x: 21, z: 19, w: 6, d: 5, door: { x: 23, z: 24 }, hours: [9, 17],
    actions: [
      { id: 'tour', label: 'Take a guided historical tour', icon: '🧭', category: 'social', minutes: 60, cost: 500, pose: 'stand', knowledgePerHour: 0.3, perHour: { fun: 12 }, tagline: 'Walk through historic legislative chambers' },
      { id: 'lugard_chair', label: 'Sneak selfie on Lugard’s historic chair', icon: '🏛️', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 150, social: 80 }, tagline: 'Hop the velvet rope and strike a gubernatorial pose!' },
    ],
  },
  {
    id: 'hamdala', name: 'Hamdala Hotel', area: 'Central', icon: '🏨', model: 'hotel', blurb: 'The grand old hotel on Ahmadu Bello Way. Pool, buffet, big men.',
    x: 31, z: 19, w: 5, d: 5, door: { x: 33, z: 24 }, jobs: ['hotel'],
    actions: [
      { id: 'swim', label: 'Swim in the luxury pool', icon: '🏊🏾', category: 'social', minutes: 60, cost: 3_000, pose: hidden, perHour: { fun: 30, hygiene: 40, energy: -5 }, tagline: 'Cool off in crystal-clear blue water' },
      { id: 'pool_cannonball', label: 'Cannonball dive into diplomat pool', icon: '🌊', category: 'wild', minutes: 25, pose: 'stand', perHour: { fun: 180, social: 90, hygiene: 50 }, tagline: 'Drench all the ambassadors and businessmen in linen suits!' },
      { id: 'presidential_suite', label: 'Order the Presidential cognac at the lobby bar', icon: '🍾', category: 'spend', cost: 45_000, minutes: 45, pose: 'sit', perHour: { fun: 150, social: 120, energy: 20 }, tagline: 'The rare bottle they keep for governors, poured at the marble bar' },
      { id: 'buffet', label: 'Executive buffet lunch', icon: '🍽️', category: 'spend', minutes: 45, cost: 7_500, pose: 'stand', untilFull: 'hunger', perHour: { hunger: 120, fun: 20, social: 10 }, tagline: 'Endless grilled fish, jollof, salads and desserts' },
      { id: 'hotel_desk', label: 'Book a room at reception', icon: '🛎️', category: 'spend', minutes: 0, effect: 'hotelDesk', tagline: 'From a Standard Room to the Presidential Suite, yours for as many nights as you pay for' },
      { id: 'hotel_lift', label: 'Take the lift up to your room', icon: '🛗', category: 'social', minutes: 0, effect: 'hotelLift', tagline: 'Your key card works the lift for as long as your stay lasts' },
      { id: 'lobby_lounge', label: 'Relax in the lobby lounge', icon: '🛋️', category: 'social', minutes: 45, pose: 'sit', perHour: { fun: 14, social: 18, energy: 6 }, tagline: 'Sink into a sofa and watch the big men come and go' },
    ],
  },
  {
    id: 'arewa', name: 'Arewa House', area: 'Central', icon: '📜', model: 'arewa', blurb: 'Sardauna’s old residence, now the North’s history archive.',
    x: 40, z: 19, w: 5, d: 4, door: { x: 42, z: 23 }, hours: [9, 17],
    actions: [
      { id: 'archive', label: 'Read in the history archives', icon: '📜', category: 'work', minutes: 120, cost: 500, pose: 'stand', knowledgePerHour: 0.45, perHour: { fun: 8 }, tagline: 'Study declassified colonial documents' },
      { id: 'sardauna_recite', label: 'Recite Sardauna’s famous 1959 speech', icon: '🎙️', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 130, social: 80 }, tagline: 'Command the courtyard with vintage orator energy' },
    ],
  },
  {
    id: 'polo', name: 'Kaduna Polo Club', area: 'Ungwan Rimi', icon: '🐎', model: 'polo', ground: true, blurb: 'Horses, hats and the famous Kaduna Polo Tournament.',
    x: 51, z: 18, w: 6, d: 8, door: { x: 53, z: 22 }, hours: [7, 19],
    actions: [
      { id: 'polo', label: 'Watch a high-goal polo match', icon: '🐎', category: 'social', minutes: 120, cost: 1_500, pose: 'stand', perHour: { fun: 28, social: 22 }, tagline: 'Watch thunderous thundering hooves on green turf' },
      { id: 'horse_sprint', label: 'Bareback horse sprint across the turf', icon: '🏇', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 200, social: 120, energy: -20 }, tagline: 'Gallop past the VIP grandstand like an Emirate cavalryman!' },
      { id: 'polo_champagne', label: 'Polo lawn champagne flex in shades', icon: '🥂', category: 'spend', cost: 40_000, minutes: 45, pose: 'sit', perHour: { fun: 160, social: 170 }, tagline: 'Sip bubbly on manicured green lawn with Kaduna elites' },
      { id: 'horses', label: 'Feed carrots to the polo ponies', icon: '🥕', category: 'social', minutes: 30, pose: 'stand', perHour: { fun: 30 }, tagline: 'Groom and pat Argentine thoroughbred horses' },
    ],
  },
  {
    id: 'market', name: 'Kaduna Central Market', area: 'Central', icon: '🛒', model: 'market', blurb: 'Everything under one (very loud) roof. Okrika, spices, fabrics, and pure street energy.',
    x: 10, z: 30, w: 7, d: 5, door: { x: 13, z: 35 }, hours: [7, 19], jobs: ['trader'],
    actions: [
      { id: 'okrika_dispute', label: 'Argue "Original Abibas" okrika shoe', icon: '👟', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 120, social: 80 }, tagline: 'Loudly drag the seller down from ₦50k to ₦2k!' },
      { id: 'thief_prank', label: 'Shout "Ewo! Catch thief!" prank', icon: '📢', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 150, social: 60, energy: -15 }, tagline: 'Watch the entire aisle panic and clutch their bags!' },
      { id: 'hawk_water', label: 'Hawk ice-cold pure water in traffic', icon: '🧊', category: 'work', minutes: 45, payout: 2_500, pose: 'stand', perHour: { energy: -12, hygiene: -20, fun: 30 }, tagline: 'Run through the keke jam yelling "Cold water dey!"' },
      { id: 'market_porter', label: 'Carry heavy yam sacks as porter', icon: '🛒', category: 'work', minutes: 60, payout: 4_500, pose: 'stand', perHour: { energy: -25, hygiene: -30, hunger: -20 }, tagline: 'Earn honest sweat money helping market mamas.' },
      { id: 'fake_rolex', label: 'Buy "Grade 1" counterfeit Rolex', icon: '⌚', category: 'spend', cost: 15_000, minutes: 20, pose: 'stand', perHour: { fun: 90, social: 60 }, tagline: 'Looks like real gold from 10 feet away!' },
      { id: 'fruit_tasting', label: 'Free fruit taste-test marathon', icon: '🍉', category: 'social', minutes: 30, pose: 'stand', perHour: { hunger: 50, fun: 70 }, tagline: 'Sample pineapples and watermelons from 6 stalls for free' },
      { id: 'ankara', label: 'Buy ankara & haggle', icon: '🧵', category: 'spend', minutes: 60, cost: 8_000, pose: hidden, perHour: { fun: 25, social: 20 }, tagline: 'Select 6 yards of vibrant wax print' },
      { id: 'clothes', label: 'Shop clothes, caps & beads', icon: '👕', category: 'spend', minutes: 0, effect: 'shop', shop: 'market', tagline: 'Browse market stalls for local fashion' },
      { id: 'phones', label: 'Phone village: buy a phone', icon: '📱', category: 'spend', minutes: 0, effect: 'phoneShop', tagline: 'Upgrade your phone or buy accessories' },
      { id: 'buy_ram', label: 'Buy a ram at Kasuwan Rago', icon: '🐏', category: 'spend', minutes: 30, cost: 75_000, pose: 'stand', effect: 'buyRam', perHour: { social: 8 }, tagline: 'Pick a heavy horned ram for Sallah' },
      { id: 'dambu', label: 'Eat dambu nama at Central Market', icon: '🥩', category: 'spend', minutes: 20, cost: 2_000, pose: 'stand', perHour: { hunger: 80, fun: 10 }, tagline: 'Shredded spicy dried beef delicacies' },
      { id: 'kilishi', label: 'Buy spicy kilishi', icon: '🍖', category: 'spend', minutes: 15, cost: 1_500, pose: 'stand', perHour: { hunger: 70, fun: 14 }, tagline: 'Paper-thin spicy beef sheets with yaji' },
    ],
  },
  {
    id: 'murtala', name: 'Murtala Square', area: 'Central', icon: '🎪', model: 'square', ground: true, blurb: 'Parades, Durbar, rallies and evening hangouts.',
    x: 20, z: 30, w: 7, d: 5, door: { x: 23, z: 32 },
    actions: [
      { id: 'hangout', label: 'Hang out', icon: '😎', minutes: 60, pose: 'stand', perHour: { social: 25, fun: 15 } },
      { id: 'durbar', label: 'Watch the Hawan Sallah Durbar', icon: '🐎', minutes: 120, pose: 'stand', effect: 'durbar', perHour: { fun: 35, social: 35 } },
      { id: 'jog', label: 'Jog round the square', icon: '🏃🏾', minutes: 45, pose: 'stand', perHour: { fun: 10, hygiene: -20, energy: -10 } },
    ],
  },
  {
    id: 'gamji', name: 'Gamji Park', area: 'Kaduna North', icon: '🌳', model: 'park', ground: true, blurb: 'Shady neem trees, public rest benches, and weekend picnics.',
    x: 31, z: 30, w: 6, d: 5, door: { x: 34, z: 32 },
    actions: [
      { id: 'picnic', label: 'Picnic', icon: '🧺', minutes: 90, cost: 1_500, pose: 'stand', perHour: { fun: 22, social: 15, hunger: 20 } },
      { id: 'relax', label: 'Relax under the trees', icon: '🌳', minutes: 60, pose: 'stand', perHour: { energy: 6, fun: 12 } },
    ],
  },
  {
    id: 'museum', name: 'National Museum', area: 'Central', icon: '🗿', model: 'museum', blurb: 'Home of Nok terracottas, 2,000+ years old.',
    x: 40, z: 30, w: 5, d: 4, door: { x: 42, z: 29 }, hours: [9, 17],
    actions: [{ id: 'nok', label: 'See the Nok terracottas', icon: '🗿', minutes: 90, cost: 1_000, pose: hidden, knowledgePerHour: 0.4, perHour: { fun: 15 } }],
  },
  {
    id: 'mall', name: 'KD Mall & Cinema', area: 'Ungwan Rimi', icon: '🎬', model: 'mall', blurb: 'Air-con, popcorn and the latest blockbusters.',
    x: 51, z: 30, w: 5, d: 5, door: { x: 53, z: 29 }, hours: [9, 22],
    actions: [
      { id: 'movie', label: 'Watch a movie', icon: '🍿', minutes: 120, cost: 3_000, pose: hidden, perHour: { fun: 30, social: 8 } },
      { id: 'icecream', label: 'Ice cream & waffles', icon: '🍦', category: 'spend', minutes: 15, cost: 2_000, pose: hidden, perHour: { hunger: 40, fun: 60 }, tagline: 'Creamy double-scoop sundae from the food court' },
      { id: 'escalator_stunt', label: 'Ride escalator backwards in designer shades', icon: '🕶️', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 130, social: 90 }, tagline: 'Strike movie star poses while Kaduna shoppers stop and stare!' },
      { id: 'perfume_sample', label: 'Bathe in free luxury perfume testers', icon: '✨', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 110, hygiene: 50 }, tagline: 'Spray 6 different French colognes until security keeps an eye on you' },
      { id: 'mall_flex', label: 'Strut central atrium with heavy shopping bags', icon: '🛍️', category: 'spend', cost: 15_000, minutes: 30, pose: 'stand', perHour: { fun: 150, social: 140 }, tagline: 'Walk slow like an oil tycoon inspecting their investments' },
      { id: 'clothes', label: 'Shop clothes & shoes', icon: '👟', category: 'spend', minutes: 0, effect: 'shop', shop: 'mall', tagline: 'Browse designer kicks, denim, and trendy outfits' },
      { id: 'phones', label: 'Phone shop: iPhone, Samsung & more', icon: '📱', category: 'spend', minutes: 0, effect: 'phoneShop', tagline: 'Upgrade to latest flagship smartphone' },
    ],
  },
  {
    id: 'boutique', name: 'Malali Boutique', area: 'Ungwan Rimi', icon: '👗', model: 'boutique', blurb: 'Agbada, lace and gold. If you ask for price, you no fit afford am.',
    x: 42, z: 24, w: 4, d: 3, door: { x: 43, z: 27 }, hours: [10, 21],
    actions: [
      { id: 'clothes', label: 'Browse designer pieces', icon: '👗', category: 'spend', minutes: 0, effect: 'shop', shop: 'boutique', tagline: 'Tailored Senator suits and imported lace' },
      { id: 'try_agbada', label: 'Try on ₦350k presidential Agbada and pose', icon: '👑', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 160, social: 110 }, tagline: 'Take 40 mirror selfies looking like a state governor!' },
      { id: 'bargain_war', label: 'Aggressive 30-minute bargaining with owner', icon: '🤝🏾', category: 'social', minutes: 30, pose: 'stand', perHour: { fun: 120, social: 140 }, tagline: '"Last price, mummy? I be your loyal customer o!"' },
      { id: 'gold_cufflinks', label: 'Buy gold cufflinks & pocket square', icon: '✨', category: 'spend', cost: 18_000, minutes: 15, pose: 'stand', perHour: { fun: 130, social: 120 }, tagline: 'Flashy accessories for the next elite wedding' },
    ],
  },
  {
    // Position is worked out from the river below.
    id: 'river', name: 'River Kaduna Fishing Spot', area: 'Riverside', icon: '🎣', model: 'jetty', ground: true, blurb: 'Crocodiles? Na story. Come and fish.',
    x: 21, z: 0, w: 4, d: 2, door: { x: 22, z: 0 },
    actions: [
      { id: 'fish', label: 'Catch fresh tilapia & catfish to sell', icon: '🐟', category: 'work', minutes: 60, payout: 3_500, pose: 'stand', perHour: { fun: 40, energy: -10 }, tagline: 'Bait your hook with bread and reel in dinner or profit' },
      { id: 'croc_dare', label: 'Peer into dark river reeds dare', icon: '🐊', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 160, social: 100 }, tagline: '"I swear I saw a crocodile head!" Jump back and scream' },
      { id: 'stone_skip', label: 'Skip flat river stones with the fishermen', icon: '🪨', category: 'social', minutes: 30, pose: 'stand', perHour: { fun: 90, social: 90 }, tagline: 'Count 7 skips across the gentle brown waters' },
      { id: 'sunset', label: 'Watch Kaduna golden sunset', icon: '🌅', category: 'social', minutes: 45, pose: 'stand', perHour: { fun: 60, energy: 20 }, tagline: 'Peaceful breeze as the sun dips below the palms' },
    ],
  },

  /* ---- South of the river ---- */
  {
    id: 'poly', name: 'Kaduna Polytechnic', area: 'Tudun Wada', icon: '🎓', model: 'poly', blurb: 'Lectures, campus activism, exam halls, and high-energy student gist.',
    x: 10, z: 46, w: 7, d: 5, door: { x: 13, z: 51 }, hours: [8, 18],
    actions: [
      { id: 'lecture', label: 'Attend engineering lecture', icon: '🎓', category: 'work', minutes: 180, cost: 2_000, pose: 'sit', knowledgePerHour: 0.8, perHour: { social: 6, fun: -3, energy: -4 }, tagline: 'Take notes and avoid the lecturer’s tough questions' },
      { id: 'protest_cancel', label: 'Protest 8:00 AM lecturer cancellation', icon: '📢', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 150, social: 120 }, tagline: 'Bang lecture desks: "We trekked from Barnawa for this?!"' },
      { id: 'library_cram', label: 'Night exam cram session in library', icon: '📚', category: 'work', minutes: 90, pose: 'sit', knowledgePerHour: 0.9, perHour: { energy: -15, fun: -5 }, tagline: 'Survive past questions with cold meat pie and coffee' },
      { id: 'course_cooking', label: 'Enrol: Catering & Cooking course', icon: '🍢', category: 'work', minutes: 120, pose: 'sit', skill: 'cooking', perHour: { energy: -4, fun: -3 }, tagline: 'Suya, jollof and pepper soup. Fee is charged to your wallet.' },
      { id: 'course_mechanic', label: 'Enrol: Auto Mechanics course', icon: '🔧', category: 'work', minutes: 120, pose: 'sit', skill: 'mechanic', perHour: { energy: -4, fun: -3 }, tagline: 'Keke engines and okada brakes. Fee is charged to your wallet.' },
      { id: 'course_tailoring', label: 'Enrol: Fashion & Tailoring course', icon: '🧵', category: 'work', minutes: 120, pose: 'sit', skill: 'tailoring', perHour: { energy: -4, fun: -3 }, tagline: 'Agbada, ankara and uniforms. Fee is charged to your wallet.' },
      { id: 'course_trading', label: 'Enrol: Business & Trading course', icon: '🧺', category: 'work', minutes: 120, pose: 'sit', skill: 'trading', perHour: { energy: -4, fun: -3 }, tagline: 'Buy low, sell high, bargain well. Fee is charged to your wallet.' },
      { id: 'canteen_feast', label: 'Eat massive student mountain of jollof', icon: '🍛', category: 'spend', cost: 1_200, minutes: 30, pose: 'sit', perHour: { hunger: 110, fun: 30 }, tagline: 'Huge plate of rice, plantain, and cow leg' },
    ],
  },
  {
    id: 'textile', name: 'KTL Textile Mill', area: 'Kakuri', icon: '🧶', model: 'mill', blurb: 'The old Kaduna Textiles mill — Kakuri’s pride. Looms still clatter.',
    x: 10, z: 54, w: 7, d: 5, door: { x: 13, z: 59 }, hours: [7, 18], jobs: ['textile'],
    actions: [
      { id: 'fabric', label: 'Buy fabric off the roll', icon: '🧵', category: 'spend', minutes: 30, cost: 5_000, pose: 'stand', perHour: { fun: 30, social: 10 }, tagline: 'Wholesale cotton rolls directly off the factory floor' },
      { id: 'custom_ankara', label: 'Weave custom loud neon Ankara pattern', icon: '🧶', category: 'spend', cost: 10_000, minutes: 45, pose: 'stand', perHour: { fun: 130, social: 70 }, tagline: 'Produce 6 yards of one-of-a-kind bespoke Kaduna drip' },
      { id: 'loom_race', label: 'Speed challenge on clattering loom', icon: '⚡', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 120, energy: -15, hygiene: -15 }, tagline: 'Race senior mill hands for factory floor bragging rights' },
    ],
  },
  {
    id: 'buka', name: 'Mama Hadiza Buka & Mai Shayi', area: 'Kakuri', icon: '🍲', model: 'buka', blurb: 'Late-night Indomie, spicy tea, masa and the latest compound gist.',
    x: 19, z: 55, w: 3, d: 3, door: { x: 20, z: 58 }, hours: [6, 26],
    actions: [
      { id: 'indomie_contest', label: 'Indomie eating contest with 3 eggs', icon: '🍜', category: 'wild', minutes: 30, cost: 2_500, pose: 'stand', perHour: { hunger: 180, fun: 140 }, tagline: 'Slurp boiling spicy noodles in front of a cheering crowd!' },
      { id: 'politics_tea', label: 'Heated election debate over spicy shayi', icon: '☕', category: 'social', minutes: 45, cost: 500, pose: 'stand', perHour: { fun: 110, social: 140 }, tagline: 'Slap the bench and quote the constitution from memory!' },
      { id: 'zobo_round', label: 'Buy round of ice-cold zobo for everyone', icon: '🥤', category: 'spend', cost: 2_500, minutes: 15, pose: 'stand', perHour: { social: 120, fun: 80 }, tagline: 'Hydrate all the hungry patrons in the compound' },
      { id: 'tuwo', label: 'Eat tuwo & miyan kuka', icon: '🥣', category: 'spend', minutes: 40, cost: 1_500, pose: 'stand', untilFull: 'hunger', perHour: { hunger: 100, fun: 8 }, tagline: 'Traditional Northern staple served steaming hot' },
      { id: 'shayi', label: 'Spicy tea & toasted bread', icon: '☕', category: 'spend', minutes: 30, cost: 500, pose: 'stand', perHour: { hunger: 55, energy: 8, social: 30, fun: 18 }, tagline: 'Ginger-infused black tea with condensed milk' },
      { id: 'masa', label: 'Masa with miyan taushe & yaji', icon: '🫓', category: 'spend', minutes: 30, cost: 1_200, pose: 'stand', perHour: { hunger: 100, fun: 16 }, tagline: 'Crispy rice cakes hot from the clay pan' },
      { id: 'danwake', label: 'Danwake with yaji', icon: '🥟', category: 'spend', minutes: 20, cost: 700, pose: 'stand', perHour: { hunger: 90, fun: 12 }, tagline: 'Dumplings tossed in groundnut oil and yaji' },
      { id: 'fura', label: 'Cold fura da nono', icon: '🥛', category: 'spend', minutes: 15, cost: 800, pose: 'stand', perHour: { hunger: 65, energy: 6, fun: 14 }, tagline: 'Fresh curdled milk with spicy millet balls' },
    ],
  },
  {
    id: 'bank', name: 'Kaduna Community Bank', area: 'Kakuri', icon: '🏦', model: 'bank', blurb: 'A local branch for secure savings, everyday banking, and high-drama queues.',
    x: 23, z: 55, w: 4, d: 4, door: { x: 25, z: 59 }, hours: [8, 18], jobs: ['banker'],
    actions: [
      { id: 'bank', label: 'Use the bank counter', icon: '🏦', category: 'spend', minutes: 0, effect: 'bank', tagline: 'Open mobile banking app to deposit or transfer' },
      { id: 'heist', label: 'Case the vault: plan a heist', icon: '🥷🏾', category: 'wild', minutes: 0, effect: 'bankHeist', tagline: 'Go solo or pull a crew together. Big risk, big cash, and EFCC will be watching your income' },
      { id: 'dispense_error', label: 'Stage dramatic "ATM dispense error" protest', icon: '📢', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 130, social: 90 }, tagline: 'Bang the counter: "ATM swallowed my ₦20k since Monday morning!"' },
      { id: 'flex_balance', label: 'Flash phone banking balance at the queue', icon: '📱', category: 'spend', minutes: 15, pose: 'stand', perHour: { fun: 120, social: 80 }, tagline: 'Hold phone up so everyone sweating in line sees 8 figures' },
      { id: 'queue_water', label: 'Buy cold pure water for sweating queue', icon: '🚰', category: 'social', minutes: 20, cost: 1_500, pose: 'stand', perHour: { social: 130, fun: 80 }, tagline: 'Cool down 20 angry people waiting under Kaduna sun!' },
    ],
  },
  {
    id: 'home', name: 'Your House', area: 'Barnawa', icon: '🏠', model: 'home', blurb: 'Home sweet home.',
    x: 31, z: 55, w: 4, d: 4, door: { x: 32, z: 59 },
    actions: [{ id: 'enter', label: 'Go inside', icon: '🚪', minutes: 0, effect: 'goHome' }],
  },
  {
    id: 'suya', name: 'Barnawa Suya Spot', area: 'Barnawa', icon: '🍢', model: 'suya', blurb: 'Smoky suya, cold drinks and loud gist till late.',
    x: 35, z: 56, w: 3, d: 3, door: { x: 36, z: 59 }, hours: [16, 26],
    actions: [
      { id: 'eat', label: 'Eat spicy beef suya', icon: '🍢', category: 'spend', minutes: 30, cost: 3_500, pose: 'stand', perHour: { hunger: 90, fun: 25, social: 15 }, tagline: 'Wrapped in newspaper with fresh onions and cabbage' },
      { id: 'yaji_challenge', label: 'Lethal extra-hot yaji pepper challenge', icon: '🌶️', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 170, social: 130, hygiene: -20 }, tagline: 'Eat a tablespoon of pure northern pepper and cry tears of fire!' },
      { id: 'suya_sprint', label: '10-stick suya eating sprint', icon: '🥩', category: 'wild', minutes: 20, cost: 6_000, pose: 'stand', perHour: { hunger: 150, fun: 140 }, tagline: 'Devour sizzling beef skewers in record time!' },
      { id: 'ludo_smash', label: 'Slap wooden Ludo board with all your might', icon: '🎲', category: 'wild', minutes: 45, pose: 'sit', perHour: { fun: 130, social: 120 }, tagline: '"DOUBLE SIX!" Slam the dice so hard the table shakes!' },
      { id: 'buy_grill', label: 'Buy out the entire grill for the block', icon: '🍢', category: 'spend', minutes: 30, cost: 25_000, pose: 'stand', perHour: { fun: 160, social: 180 }, tagline: 'Wrap 30 skewers and feed the whole street!' },
      { id: 'gist', label: 'Gist with the boys', icon: '🗣️', category: 'social', minutes: 60, cost: 600, pose: 'stand', perHour: { social: 45, fun: 20, bladder: -10 }, tagline: 'Cold drinks and neighborhood compound gist' },
      { id: 'landlord_gist', label: 'Spill scandalous compound landlord gist', icon: '🔥', category: 'social', minutes: 45, pose: 'stand', perHour: { social: 100, fun: 90 }, tagline: 'Who didn’t pay rent and who got caught sneaking out!' },
    ],
  },
  {
    id: 'school', name: 'LEA Primary School', area: 'Barnawa', icon: '🏫', model: 'school', blurb: 'Morning assembly, chalk dust and noisy pupils.',
    x: 40, z: 55, w: 7, d: 4, door: { x: 43, z: 59 }, hours: [7, 16], jobs: ['teacher'],
    actions: [
      { id: 'volunteer', label: 'Volunteer a reading class', icon: '📖', category: 'work', minutes: 60, pose: 'sit', knowledgePerHour: 0.1, perHour: { social: 20, fun: 8 }, tagline: 'Teach energetic pupils storybooks and rhymes' },
      { id: 'bell_prank', label: 'Ring morning assembly bell 2 hours early', icon: '🔔', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 140, social: 60 }, tagline: 'Watch hundreds of pupils stampede to assembly in confusion!' },
    ],
  },
  {
    id: 'club', name: 'The Castle Lounge & Nightclub', area: 'Barnawa', icon: '🪩', model: 'club', blurb: 'Kaduna’s premier luxury nightlife destination. VIP bottle service, top DJs, and heavy money spraying.',
    x: 31, z: 46, w: 6, d: 5, door: { x: 34, z: 51 }, hours: [19, 29], jobs: ['dj'],
    actions: [
      { id: 'dance', label: 'Turn up on the dance floor', icon: '🕺🏾', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 120, social: 80, energy: -15, hygiene: -25 }, tagline: 'Poco Lee legwork, amapiano shuffle, and pure energy' },
      { id: 'table_dance', label: 'Jump on VIP table and dance like Odogwu', icon: '🍾', category: 'wild', minutes: 12, pose: 'stand', perHour: { fun: 180, social: 140, energy: -20 }, tagline: 'Bouncers screaming "step down!" while everyone films on Snapchat!' },
      { id: 'hijack_mic', label: 'Hijack DJ hypeman mic for a crazy shoutout', icon: '🎤', category: 'wild', minutes: 6, pose: 'stand', perHour: { fun: 170, social: 160 }, tagline: '"KADUNA ARE YOU READY?!" Blast the club with wild hype' },
      { id: 'spray_money', label: 'Spray crisp ₦1,000 notes on dancers', icon: '💸', category: 'spend', minutes: 8, cost: 20_000, pose: 'stand', effect: 'sprayMoney', perHour: { fun: 400, social: 375 }, tagline: 'Rain crisp mint bills on the dance floor!' },
      { id: 'spray_heavy', label: 'Spray bundles with golden money gun', icon: '🔫', category: 'spend', minutes: 10, cost: 100_000, pose: 'stand', effect: 'sprayMoney', perHour: { fun: 660, social: 600 }, tagline: 'Dorime mode! Golden gun spraying non-stop ₦1,000 notes' },
      { id: 'dorime', label: 'DORIME! ₦500k rain + DJ shoutout', icon: '🌧️', category: 'spend', minutes: 12, cost: 500_000, pose: 'stand', effect: 'sprayMoney', perHour: { fun: 650, social: 650 }, tagline: 'Dorime! Millions in the air, the DJ blasts your name over the speakers and the whole club screams it back' },
      { id: 'champagne_tower', label: 'Build a Dom Pérignon champagne tower', icon: '🍾', category: 'spend', minutes: 15, cost: 250_000, pose: 'stand', perHour: { fun: 610, social: 610, hunger: 25 }, tagline: 'A glittering 8-level tower, poured while the whole club films' },
      { id: 'club_takeover', label: 'Take over The Castle for the night', icon: '👑', category: 'spend', minutes: 20, cost: 2_000_000, pose: 'stand', effect: 'sprayMoney', perHour: { fun: 900, social: 960, energy: 30 }, tagline: 'Lights, DJ and every drink on you. By morning all of Kaduna knows your name' },
      { id: 'bottle_service', label: 'VIP Ace of Spades & Hennessy procession', icon: '🍾', category: 'spend', minutes: 12, cost: 75_000, pose: 'sit', perHour: { fun: 450, social: 420, energy: 45, hunger: 45 }, tagline: 'Sparklers flying, sirens howling, VIP red carpet vibes' },
      { id: 'buy_out_bar', label: 'Buy round of shots for the entire club', icon: '🥂', category: 'spend', minutes: 10, cost: 50_000, pose: 'stand', perHour: { fun: 570, social: 630 }, tagline: 'Every single person raises a glass and shouts your name!' },
      { id: 'cocktail', label: 'Order signature cognac cocktail', icon: '🍸', category: 'spend', minutes: 5, cost: 6_000, pose: 'sit', perHour: { fun: 65, social: 40, hunger: 20 }, tagline: 'Sip chilled mix on plush leather sofa' },
      { id: 'dj_hype', label: 'Tip DJ for VIP hypeman praise song', icon: '🎧', category: 'social', minutes: 5, cost: 10_000, pose: 'stand', perHour: { fun: 120, social: 110 }, tagline: 'DJ drops beat: "Clear way for the highest spender in Kaduna!"' },
    ],
  },
  {
    id: 'hospital', name: 'Kaduna General Hospital', area: 'Barnawa', icon: '🏥', model: 'hospital', blurb: 'Emergency care, maternity ward, pharmacy, and compassionate nurses.',
    x: 39, z: 47, w: 7, d: 5, door: { x: 42, z: 52 },
    actions: [
      { id: 'checkup', label: 'General checkup & vital signs test', icon: '🩺', category: 'work', minutes: 40, cost: 3_000, pose: 'sit', perHour: { fun: 20, energy: 30 }, tagline: 'Check blood pressure, pulse, and get doctor advice' },
      { id: 'donate_blood', label: 'Donate pint of blood for emergency ward', icon: '🩸', category: 'social', minutes: 45, payout: 5_000, pose: 'sit', perHour: { social: 120, energy: -20, fun: 40 }, tagline: 'Save a life in need and get free chilled malt and milk!' },
      { id: 'faint_spell', label: 'Stage dramatic fainting spell in waiting room', icon: '😵‍💫', category: 'wild', minutes: 20, pose: 'sit', perHour: { fun: 160, social: 110 }, tagline: '"Doctor hold me! World dey spin!" Instant nurse attention' },
      { id: 'volunteer_triage', label: 'Volunteer sorting patient files', icon: '📋', category: 'work', minutes: 60, payout: 4_000, pose: 'sit', perHour: { social: 90, energy: -10 }, tagline: 'Help the overworked registry staff organize patient cards' },
      // Free, and the hospital never turns you away for smelling (SMELLY_OK): the way back in everywhere else.
      { id: 'hosp_shower', label: 'Bath in the free shower', icon: '🚿', category: 'social', minutes: 20, pose: 'stand', untilFull: 'hygiene', animation: 'wash', perHour: { hygiene: 320 }, tagline: 'Soap, clean water and no questions asked. Open to everybody' },
    ],
  },
  {
    id: 'viewing', name: 'Barnawa Football Viewing Centre', area: 'Barnawa', icon: '⚽', model: 'viewing', blurb: 'A noisy generator, wooden benches, heated arguments and match-day banters.',
    x: 33, z: 61, w: 4, d: 3, door: { x: 35, z: 60 }, hours: [16, 26],
    actions: [
      { id: 'watch', label: 'Watch Premier League derby on big screen', icon: '📺', category: 'social', minutes: 90, cost: 500, pose: 'sit', perHour: { fun: 70, social: 80 }, tagline: 'Arsenal vs Man United banter at ear-splitting volume' },
      { id: 'smash_chair', label: 'Slam plastic chair after missed 90th-min penalty', icon: '🪑', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 150, social: 130 }, tagline: '"HOW DID HE MISS THAT?!" Jump up and slam the chair down!' },
      { id: 'vuvuzela', label: 'Blow deafening vuvuzela after goal celebration', icon: '🎺', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 160, social: 120 }, tagline: 'Blast horns right into rival fans ears until they scream!' },
      { id: 'unplug_gen', label: 'Threaten to switch off the Tiger generator', icon: '🔌', category: 'wild', minutes: 10, pose: 'stand', perHour: { fun: 170, social: 110 }, tagline: 'Reach for the plug cord when rival team scores: instant uproar!' },
      { id: 'buy_cokes', label: 'Buy round of ice-cold sodas for the boys', icon: '🥤', category: 'spend', minutes: 20, cost: 3_500, pose: 'stand', perHour: { fun: 100, social: 150 }, tagline: 'Celebrate the winning goal like an absolute viewing center king' },
      { id: 'cr7_messi', label: 'Heated GOAT debate: Messi vs CR7 vs Okocha', icon: '🗣️', category: 'social', minutes: 45, pose: 'sit', perHour: { fun: 110, social: 120 }, tagline: 'Slam table with statistics dating back to 2004!' },
      { id: 'friendly_bet', label: 'Join the ₦500 score-prediction pool', icon: '🎟️', category: 'spend', minutes: 60, cost: 500, pose: 'sit', perHour: { fun: 50, social: 60 }, tagline: 'Back your team with cash and claim bragging rights' },
    ],
  },
  {
    id: 'pitch', name: 'Barnawa Football Pitch', area: 'Barnawa', icon: '⚽', model: 'pitch', ground: true, blurb: 'Dusty pitch. Evening matches are serious business.',
    x: 31, z: 67, w: 6, d: 5, door: { x: 34, z: 69 },
    actions: [
      { id: 'play', label: 'Play gritty 11-a-side community match', icon: '⚽', category: 'work', minutes: 60, pose: 'stand', perHour: { fun: 80, social: 60, hygiene: -30, energy: -20 }, tagline: 'Hard dusty tackles, fast wing play, and neighbourhood glory' },
      { id: 'bicycle_kick', label: 'Attempt dramatic overhead bicycle kick', icon: '🤸🏾‍♂️', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 180, social: 130, energy: -15 }, tagline: 'Fly through the air, miss the ball, and land flat on your back!' },
      { id: 'referee_bribe', label: 'Slip referee ₦1,000 for a controversial penalty', icon: '🤫', category: 'wild', minutes: 15, cost: 1_000, pose: 'stand', perHour: { fun: 150, social: 90 }, tagline: '"Ref ref, look well na!" Hand him a folded note discreetly' },
      { id: 'hawk_water', label: 'Hawk chilled pure water to sweating players', icon: '🚰', category: 'work', minutes: 45, payout: 3_000, pose: 'stand', perHour: { fun: 50, energy: -10 }, tagline: '"Ice water! Pure water!" Sell out two heavy buckets' },
      { id: 'watch', label: 'Cheer and scream from the sidelines', icon: '📣', category: 'social', minutes: 60, pose: 'stand', perHour: { fun: 70, social: 80 }, tagline: 'Hype your street team and mock the visiting defenders' },
    ],
  },
  {
    id: 'refinery', name: 'Kaduna Refinery (KRPC)', area: 'Chikun Road', icon: '🛢️', model: 'refinery', blurb: 'Tanks, pipes and a flare that never sleeps.',
    x: 30, z: 76, w: 9, d: 5, door: { x: 30, z: 75 }, jobs: ['refinery'],
    actions: [
      { id: 'flare_tour', label: 'Night pipeline inspection under the flare', icon: '🔥', category: 'work', minutes: 60, payout: 6_000, pose: 'stand', perHour: { fun: 70, energy: -15 }, tagline: 'Feel the heat and golden glow of the burning flare stacks' },
      { id: 'flare_climb', label: 'Climb industrial cat-walk ladder for epic selfie', icon: '🪜', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 170, social: 120 }, tagline: 'Scale the metal stairs for a breathtaking view over Kaduna' },
      { id: 'shift_hustle', label: 'Heavy maintenance shift on oil valves', icon: '🔧', category: 'work', minutes: 90, payout: 12_000, pose: 'stand', perHour: { energy: -25, hygiene: -30, fun: 20 }, tagline: 'Wrench high-pressure pipelines in your fire-retardant suit' },
    ],
  },
];

/** Labelled landmarks you can see but not enter. */
export interface Landmark extends Rect {
  name: string;
  icon: string;
  model: string;
  walkable?: boolean;
  /** Drawn without a name over it: one of several pieces of the same thing (Kano's city wall, game/kano.ts). */
  quiet?: boolean;
}

export const LANDMARKS: Landmark[] = [
  { name: 'Government House', icon: '🏛️', model: 'govhouse', x: 21, z: 9, w: 6, d: 5 },
  { name: 'Kawo Flyover', icon: '🛣️', model: 'flyover', x: 24, z: 5, w: 10, d: 3, walkable: true },
  { name: 'Kaduna Golf Club', icon: '⛳', model: 'golf', x: 11, z: 66, w: 6, d: 6, walkable: true },
  { name: 'Trade Fair Complex', icon: '🎡', model: 'tradefair', x: 40, z: 66, w: 7, d: 6 },
];

/* ---------- Maps ---------- */
// A map is one city: its outline, water, roads, places, and the filler houses and trees. Kaduna is built
// here; other cities (game/abuja.ts) are added with addCityMap. The cell checks and the pathfinding further
// down work on whichever map the player is standing in (setActiveMap).

const ckey = (x: number, z: number) => `${x},${z}`;
const inRect = (r: Rect, x: number, z: number) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d;

/** Cell centre is inside Kaduna's outline. */
export const onLand = (x: number, z: number) => x >= 0 && z >= 0 && x < CITY_W && z < CITY_H && insidePoly(x + 0.5, z + 0.5, OUTLINE);
export const isWaterCell = (x: number, z: number) => riverDistance(x + 0.5, z + 0.5) < RIVER_HALF_WIDTH;
export const isRoad = (x: number, z: number) => ROADS.some((r) => inRect(r, x, z)) && onLand(x, z);

/** Height of a bridge deck above the ground. */
export const BRIDGE_Y = 0.16;
/** Cells of slope at each end of a bridge. */
export const BRIDGE_RAMP = 1.5;

// The fishing spot sits on the north bank just west of Ahmadu Bello Way.
{
  const river = PLACES.find((p) => p.id === 'river')!;
  const wet = (x: number, z: number) => onLand(x, z) && isWaterCell(x, z);
  let z = 30;
  while (!wet(river.x + 1, z + 1) && z < 50) z++;
  river.z = z - 1;
  river.door = { x: river.x + 1, z: river.z };
}

/** A lake: an ellipse of water, centre and radii in cells. */
export interface Lake { x: number; z: number; rx: number; rz: number; name: string }
export type Bridge = Rect & { horiz: boolean };
/** A billboard standing on a verge cell beside a main road. Boards all face south, toward the map camera. */
export interface BillboardSpot { x: number; z: number }
export type HouseKind = 'home' | 'chapel' | 'mosque' | 'shop' | 'clinic' | 'tank';
export interface House extends Rect { style: number; wall: string; roof: string; storeys: number; yaw: number; kind: HouseKind }

export interface MapDef {
  id: string;
  w: number;
  h: number;
  /** The boundary, already smoothed. */
  outline: P2[];
  /** Centre line of the river, already smoothed. */
  river?: { path: P2[]; half: number; name: string };
  lakes?: Lake[];
  roads: Road[];
  places: Place[];
  landmarks: Landmark[];
  /** GRA areas get bigger houses with more space. */
  gra: Rect[];
  /** Roadside ad boards (see src/three/Billboard.tsx). The server knows them by city and number (game/boards.ts). */
  billboards?: boolean;
  /** Seeds the filler houses and trees, so the town looks the same every load. */
  seed: number;
  /** How leafy the city is: 1 is Kaduna. */
  green?: number;
  walls?: string[];
  roofs?: string[];
}

export interface CityMap {
  id: string;
  w: number;
  h: number;
  outline: P2[];
  /** The part of the river that's drawn: only where it's over the island. Empty when there is no river. */
  riverDraw: P2[];
  riverHalf: number;
  riverName: string;
  lakes: Lake[];
  roads: Road[];
  /** Bridges: the stretch of each road that crosses the river, as whole-width rectangles. */
  bridges: Bridge[];
  billboards: BillboardSpot[];
  houses: House[];
  trees: { x: number; z: number; s: number }[];
  places: Place[];
  landmarks: Landmark[];
  placeById: Record<string, Place>;
  isRoad(x: number, z: number): boolean;
  isWater(x: number, z: number): boolean;
  isLand(x: number, z: number): boolean;
  isBridge(x: number, z: number): boolean;
  walkable(x: number, z: number): boolean;
  /** Height of the road surface at a world point: raised on bridges, sloping up the ramps. */
  groundY(x: number, z: number): number;
  bfs(start: Cell, isGoal: (c: Cell) => boolean): Cell[] | null;
}

/** Bridges cover the water and the muddy bank, so no road tile ever sits under the river. */
const BRIDGE_BANK = 1.1;
const BILLBOARD_GAP = 5;
/** Boards keep this many cells clear of any building, so they never clash with a place's model. */
const BILLBOARD_MARGIN = 2;

/** Some filler buildings are not homes. Chosen from the position, not rand(), so the city layout stays put. */
function houseKind(x: number, z: number, size: number): HouseKind {
  const h = (Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  const r = h % 100;
  if (r < 5) return 'chapel';
  if (r < 10) return 'mosque';
  if (r < 15) return 'shop';
  if (r < 18 && size >= 3) return 'clinic';
  if (r < 24) return 'tank';
  return 'home';
}

const WALLS = ['#f1e4c8', '#e9d3a8', '#f4efe4', '#dcc39a', '#efd9c2', '#e8e0cc', '#f2d7b0'];
const ROOFS = ['#7f8c8d', '#9a5b3c', '#2f6f6a', '#5b6b7a', '#a0442c', '#3b5f43', '#8a7a5c'];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function buildMap(def: MapDef): CityMap {
  const { w: W, h: H, outline, roads, places, landmarks } = def;
  const river = def.river;
  const lakes = def.lakes ?? [];
  const walls = def.walls ?? WALLS;
  const roofs = def.roofs ?? ROOFS;
  const green = def.green ?? 1;

  function riverDistance(x: number, z: number) {
    let best = Infinity;
    if (!river) return best;
    for (let i = 0; i < river.path.length - 1; i++) {
      const [ax, az] = river.path[i];
      const [bx, bz] = river.path[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
    return best;
  }
  const riverHalf = river?.half ?? 0;
  /** In a lake, or within `pad` cells of its shore. */
  const inLake = (x: number, z: number, pad = 0) => lakes.some((l) => Math.hypot((x - l.x) / (l.rx + pad), (z - l.z) / (l.rz + pad)) < 1);
  const roadAt = (x: number, z: number) => roads.find((r) => inRect(r, x, z));

  // Precompute the cell grid.
  const LAND = new Uint8Array(W * H);
  const WATER = new Uint8Array(W * H);
  const ROAD = new Uint8Array(W * H);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < H; z++) {
      const i = z * W + x;
      LAND[i] = insidePoly(x + 0.5, z + 0.5, outline) ? 1 : 0;
      WATER[i] = LAND[i] && (riverDistance(x + 0.5, z + 0.5) < riverHalf || inLake(x + 0.5, z + 0.5)) ? 1 : 0;
      ROAD[i] = LAND[i] && roadAt(x, z) ? 1 : 0;
    }
  const at = (arr: Uint8Array, x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H && arr[z * W + x] === 1;
  const isWater = (x: number, z: number) => at(WATER, x, z) && !at(ROAD, x, z);

  const bridges: Bridge[] = roads.flatMap((r) => {
    const cells: Cell[] = [];
    for (let x = r.x; x < r.x + r.w; x++)
      for (let z = r.z; z < r.z + r.d; z++) if (at(ROAD, x, z) && riverDistance(x + 0.5, z + 0.5) < riverHalf + BRIDGE_BANK) cells.push({ x, z });
    if (!cells.length) return [];
    const horiz = r.w > r.d;
    const along = cells.map((c) => (horiz ? c.x : c.z));
    const a0 = Math.min(...along);
    const a1 = Math.max(...along) + 1;
    return [horiz ? { x: a0, z: r.z, w: a1 - a0, d: r.d, horiz } : { x: r.x, z: a0, w: r.w, d: a1 - a0, horiz }];
  });

  function groundY(x: number, z: number) {
    for (const b of bridges) {
      const lat = b.horiz ? z : x;
      const lo = b.horiz ? b.z : b.x;
      const hi = lo + (b.horiz ? b.d : b.w);
      if (lat < lo || lat > hi) continue;
      const a = b.horiz ? x : z;
      const a0 = b.horiz ? b.x : b.z;
      const a1 = a0 + (b.horiz ? b.w : b.d);
      const off = Math.max(a0 - a, a - a1, 0);
      if (off < BRIDGE_RAMP) return BRIDGE_Y * (1 - off / BRIDGE_RAMP);
    }
    return 0;
  }

  const blocked = new Set<string>();
  const reserved = new Set<string>(); // keep clear of filler: roads, places, doors

  for (let x = 0; x < W; x++)
    for (let z = 0; z < H; z++) {
      if (!at(LAND, x, z) || isWater(x, z)) blocked.add(ckey(x, z));
      if (at(ROAD, x, z)) reserved.add(ckey(x, z));
      // Leave the river banks and the lake shore open.
      if (riverDistance(x + 0.5, z + 0.5) < riverHalf + 1.2 || inLake(x + 0.5, z + 0.5, 1.2)) reserved.add(ckey(x, z));
    }
  for (const p of [...places, ...landmarks]) {
    const ground = 'ground' in p ? p.ground : 'walkable' in p ? p.walkable : false;
    for (let x = p.x; x < p.x + p.w; x++)
      for (let z = p.z; z < p.z + p.d; z++) {
        if (!ground) blocked.add(ckey(x, z));
        reserved.add(ckey(x, z));
      }
    if ('door' in p) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) reserved.add(ckey(p.door.x + dx, p.door.z + dz));
  }

  const free = (x: number, z: number) => !blocked.has(ckey(x, z)) && !reserved.has(ckey(x, z));
  const walkable = (x: number, z: number) => at(LAND, x, z) && !blocked.has(ckey(x, z));

  // Deterministic pseudo-random so the town looks the same every load.
  let seed = def.seed;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Roadside billboards (player ads). Placed BEFORE houses and trees, so nothing ends up standing in front of one.
  const billboards: BillboardSpot[] = [];
  const nearBuilding = (x: number, z: number) =>
    [...places, ...landmarks].some((p) => x > p.x - BILLBOARD_MARGIN && x < p.x + p.w + BILLBOARD_MARGIN && z > p.z - BILLBOARD_MARGIN && z < p.z + p.d + BILLBOARD_MARGIN);
  for (const r of def.billboards ? roads : []) {
    if (!r.main) continue;
    const horiz = r.w > r.d;
    const len = horiz ? r.w : r.d;
    for (let a = 4; a < len - 3; a++)
      for (const side of [-1, 1]) {
        // A board is four cells wide, faces south, and stands one cell further south than its spot (src/three/Billboard.tsx
        // pushes it forward as it leans back). So it must sit clear of the road on both rows, and beside a north–south
        // road it sits far enough back that its whole width stays off the tarmac.
        const x = horiz ? r.x + a : side < 0 ? r.x - 3 : r.x + r.w + 2;
        const z = horiz ? (side < 0 ? r.z - 2 : r.z + r.d) : r.z + a;
        let ok = !nearBuilding(x, z);
        for (let i = -2; i <= 2 && ok; i++) for (const dz of [0, 1]) if (!walkable(x + i, z + dz) || at(ROAD, x + i, z + dz)) ok = false;
        if (!ok || billboards.some((c) => Math.hypot(c.x - x, c.z - z) < BILLBOARD_GAP)) continue;
        blocked.add(ckey(x, z));
        blocked.add(ckey(x, z + 1));
        billboards.push({ x, z });
      }
  }

  const houses: House[] = [];
  const trees: { x: number; z: number; s: number }[] = [];

  // A house needs a ring of walkable cells round it. That way it can never cut off a path.
  function canBuild(x: number, z: number, size: number) {
    for (let i = -1; i <= size; i++)
      for (let j = -1; j <= size; j++) {
        const inner = i >= 0 && j >= 0 && i < size && j < size;
        if (inner ? !free(x + i, z + j) : !walkable(x + i, z + j)) return false;
      }
    return true;
  }

  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const size = def.gra.some((r) => inRect(r, x, z)) ? 4 : 3;
      if (rand() < 0.12 || !canBuild(x, z, size)) continue;
      for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) blocked.add(ckey(x + i, z + j));
      const roadBelow = at(ROAD, x + 1, z + size) || at(ROAD, x + 1, z + size + 1);
      const roadAbove = at(ROAD, x + 1, z - 1) || at(ROAD, x + 1, z - 2);
      houses.push({
        x, z, w: size, d: size,
        style: Math.floor(rand() * 3),
        wall: walls[Math.floor(rand() * walls.length)],
        roof: roofs[Math.floor(rand() * roofs.length)],
        storeys: size >= 4 ? 2 : rand() < 0.2 ? 2 : 1,
        yaw: !roadBelow && roadAbove ? Math.PI : 0,
        kind: houseKind(x, z, size),
      });
    }

  // Then squeeze small 2×2 houses into the gaps.
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      if (rand() < 0.35 || !canBuild(x, z, 2)) continue;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) blocked.add(ckey(x + i, z + j));
      houses.push({
        x, z, w: 2, d: 2, style: Math.floor(rand() * 3),
        wall: walls[Math.floor(rand() * walls.length)], roof: roofs[Math.floor(rand() * roofs.length)], storeys: 1,
        yaw: at(ROAD, x, z - 1) && !at(ROAD, x, z + 2) ? Math.PI : 0,
        kind: houseKind(x, z, 2),
      });
    }

  // Neem trees: a single blocked cell whose 8 neighbours are all walkable can't cut off a path.
  for (let x = 0; x < W; x++)
    for (let z = 0; z < H; z++) {
      if (!free(x, z)) continue;
      const nearRoad = at(ROAD, x + 1, z) || at(ROAD, x - 1, z) || at(ROAD, x, z + 1) || at(ROAD, x, z - 1);
      if (rand() > (nearRoad ? 0.3 : 0.08) * green) continue;
      let ok = true;
      for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) if ((i || j) && !walkable(x + i, z + j)) ok = false;
      if (!ok) continue;
      blocked.add(ckey(x, z));
      trees.push({ x, z, s: 0.45 + rand() * 0.25 });
    }

  /** Breadth-first search that prefers roads: off-road steps cost more, so trips follow the streets. */
  function bfs(start: Cell, isGoal: (c: Cell) => boolean): Cell[] | null {
    if (isGoal(start)) return [];
    // Two-bucket 0-1-ish BFS: road steps cost 1, off-road cost 3 (Dijkstra with small integer weights).
    const dist = new Map<string, number>([[ckey(start.x, start.z), 0]]);
    const prev = new Map<string, Cell>();
    const buckets: Cell[][] = [[start]];
    for (let d = 0; d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (const cur of bucket) {
        if ((dist.get(ckey(cur.x, cur.z)) ?? Infinity) < d) continue;
        if (isGoal(cur)) {
          const path: Cell[] = [];
          let c: Cell | undefined = cur;
          while (c && (c.x !== start.x || c.z !== start.z)) {
            path.unshift(c);
            c = prev.get(ckey(c.x, c.z));
          }
          return path;
        }
        for (const [dx, dz] of DIRS) {
          const nx = cur.x + dx;
          const nz = cur.z + dz;
          if (!walkable(nx, nz)) continue;
          const nd = d + (at(ROAD, nx, nz) ? 1 : 3);
          const k = ckey(nx, nz);
          if (nd >= (dist.get(k) ?? Infinity)) continue;
          dist.set(k, nd);
          prev.set(k, cur);
          (buckets[nd] ??= []).push({ x: nx, z: nz });
        }
      }
    }
    return null;
  }

  return {
    id: def.id, w: W, h: H, outline,
    riverDraw: river ? river.path.filter(([x, z]) => insidePoly(x, z, outline)) : [],
    riverHalf, riverName: river?.name ?? '', lakes,
    roads, bridges, billboards, houses, trees, places, landmarks,
    placeById: Object.fromEntries(places.map((p) => [p.id, p])),
    isRoad: (x, z) => at(ROAD, x, z),
    isWater,
    isLand: (x, z) => at(LAND, x, z),
    isBridge: (x, z) => bridges.some((b) => inRect(b, x, z)),
    walkable, groundY, bfs,
  };
}

/** GRA areas get bigger houses with more space. */
const GRA: Rect[] = [{ x: 40, z: 0, w: 20, d: 16 }, { x: 46, z: 33, w: 14, d: 10 }];

const KADUNA = buildMap({
  id: 'kaduna', w: CITY_W, h: CITY_H, outline: OUTLINE,
  river: { path: RIVER_PATH, half: RIVER_HALF_WIDTH, name: 'River Kaduna' },
  roads: ROADS, places: PLACES, landmarks: LANDMARKS, gra: GRA, billboards: true, seed: 20_26,
});

export const BRIDGES = KADUNA.bridges;
export const BILLBOARDS = KADUNA.billboards;
export const HOUSES = KADUNA.houses;
export const TREES = KADUNA.trees;

/** Every city, by region id (game/regions.ts). */
export const CITY_MAPS: Record<string, CityMap> = { kaduna: KADUNA };
let active = KADUNA;

/** The map of a city, or Kaduna's when there is no such city. */
export const cityMap = (id?: string | null) => CITY_MAPS[id ?? ''] ?? KADUNA;
/** The city the player is in. */
export const activeMap = () => active;
export function setActiveMap(id?: string | null) {
  active = cityMap(id);
}
export function addCityMap(def: MapDef) {
  return (CITY_MAPS[def.id] = buildMap(def));
}

export const cellIsRoad = (x: number, z: number) => active.isRoad(x, z);
export const cellIsWater = (x: number, z: number) => active.isWater(x, z);
export const cellIsLand = (x: number, z: number) => active.isLand(x, z);
export const cellIsBridge = (x: number, z: number) => active.isBridge(x, z);
export const mapGroundY = (x: number, z: number) => active.groundY(x, z);

/* ---------- Places: lookups & helpers ---------- */

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
/** A place as it is in the city the player is in (its name, and where it stands). One that city doesn't have is Kaduna's. */
export const placeHere = (id: string): Place | undefined => active.placeById[id] ?? PLACE_BY_ID[id];
export const MARKET_AREAS = [...new Set(PLACES.map((p) => p.area))].sort((a, b) => a.localeCompare(b));
export const HOME_PLACE = PLACE_BY_ID.home;

/** Not on the map: you only end up here in handcuffs (src/net/crime.ts), and can't walk out. */
export const PRISON_PLACE: Place = {
  id: 'prison', name: 'Kaduna Central Prison', area: 'Kaduna', icon: '⛓️', model: 'prison', blurb: 'Where thieves wait out their sentence or their bail.',
  x: 0, z: 0, w: 0, d: 0, door: HOME_PLACE.door,
  actions: [
    { id: 'cell_sleep', label: 'Sleep on the mattress', icon: '😴', minutes: 240, pose: 'lie', untilFull: 'energy', perHour: { energy: 18, fun: -3 } },
    { id: 'cell_eat', label: 'Eat the prison ration (beans & garri)', icon: '🫘', minutes: 30, pose: 'stand', untilFull: 'hunger', perHour: { hunger: 90, fun: -6 } },
    { id: 'cell_toilet', label: 'Use the cell toilet', icon: '🚽', minutes: 15, pose: 'stand', untilFull: 'bladder', perHour: { bladder: 300, fun: -4 } },
    { id: 'cell_wash', label: 'Bucket bath', icon: '🪣', minutes: 30, pose: 'stand', untilFull: 'hygiene', perHour: { hygiene: 120, fun: -2 } },
    { id: 'cell_gist', label: 'Gist with the other inmates', icon: '🗣️', minutes: 45, pose: 'sit', perHour: { social: 30, fun: 6 } },
    { id: 'cell_exercise', label: 'Push-ups & sit-ups', icon: '💪🏾', minutes: 30, pose: 'stand', perHour: { fun: 10, energy: -10, hygiene: -10 } },
  ],
};
PLACE_BY_ID.prison = PRISON_PLACE;

/** Where kidnappers keep you while a ransom is raised (src/ui/Vice.tsx). Not on the map. */
export const CAMP_PLACE: Place = {
  id: 'camp', name: 'Kidnappers’ Camp', area: 'The bush', icon: '🪢', model: 'prison', blurb: 'Somewhere in the bush. Nobody is coming unless the ransom is paid.',
  x: 0, z: 0, w: 0, d: 0, door: HOME_PLACE.door,
  actions: [
    { id: 'camp_sleep', label: 'Lie on the straw mat', icon: '😴', minutes: 240, pose: 'lie', untilFull: 'energy', perHour: { energy: 14, fun: -4 } },
    { id: 'camp_eat', label: 'Eat the beans they throw at you', icon: '🫘', minutes: 30, pose: 'stand', untilFull: 'hunger', perHour: { hunger: 80, fun: -8 } },
    { id: 'camp_gist', label: 'Whisper with the other captives', icon: '🗣️', minutes: 45, pose: 'sit', perHour: { social: 25, fun: 2 } },
  ],
};
PLACE_BY_ID.camp = CAMP_PLACE;

/** What you can do in a hotel room: better rooms rest you faster and have more in them (game/hotel.ts). */
function roomActions(room: RoomType): ActionDef[] {
  const tier = ROOM_TYPES.indexOf(room);
  const top = tier === 3;
  const sleep = [14, 17, 20, 24][tier];
  return [
    { id: 'room_sleep', label: top ? 'Sleep like a president' : 'Sleep', icon: '😴', minutes: top ? 360 : 480, pose: 'lie', untilFull: 'energy', perHour: { energy: sleep, hunger: -2, bladder: -3, hygiene: -1, fun: tier } },
    { id: 'room_nap', label: 'Short nap', icon: '💤', minutes: 60, fast: true, pose: 'lie', perHour: { energy: Math.round(sleep * 0.75) } },
    { id: 'room_shower', label: tier ? 'Take a hot shower' : 'Take a shower', icon: '🚿', minutes: 20, untilFull: 'hygiene', animation: 'wash', perHour: { hygiene: tier ? 380 : 320, fun: 8 } },
    { id: 'room_toilet', label: 'Use the toilet', icon: '🚽', minutes: 10, untilFull: 'bladder', perHour: { bladder: 650 } },
    { id: 'room_tv', label: top ? 'Watch a film on the home cinema' : 'Watch DSTV', icon: '📺', minutes: 90, untilFull: 'fun', pose: 'sit', perHour: { fun: [26, 30, 34, 45][tier] } },
    { id: 'room_view', label: 'Look out over Ahmadu Bello Way', icon: '🌆', minutes: 20, pose: 'stand', animation: 'drink', perHour: { fun: 20 + tier * 8, social: 6 } },
    { id: 'leave_room', label: 'Go down to the lobby', icon: '🛗', minutes: 0, effect: 'leaveRoom' },
    ...(tier === 0 ? [
      { id: 'room_tea', label: 'Make tea with the kettle', icon: '🫖', minutes: 15, animation: 'drink', perHour: { hunger: 40, energy: 12, fun: 8 } },
    ] satisfies ActionDef[] : []),
    ...(tier >= 1 && !top ? [
      { id: 'room_bath', label: 'Soak in the bathtub', icon: '🛁', minutes: 40, pose: 'sit', untilFull: 'hygiene', perHour: { hygiene: 260, fun: 18, energy: 12 } },
      { id: 'room_minibar', label: 'Raid the minibar', icon: '🍫', minutes: 15, cost: 2_500, animation: 'eat', perHour: { hunger: 160, fun: 30, bladder: -15 } },
      { id: 'room_read', label: 'Read at the desk', icon: '📖', minutes: 90, animation: 'read', knowledgePerHour: 0.4, perHour: { fun: -2 } },
    ] satisfies ActionDef[] : []),
    ...(tier >= 2 ? [
      // The Presidential rate covers the kitchen: everywhere else room service goes on your bill.
      { id: 'room_service', label: top ? 'Have the butler serve dinner' : 'Order room service', icon: '🍽️', minutes: 40, cost: top ? undefined : 9_000, pose: 'sit', animation: 'eat', untilFull: 'hunger', perHour: { hunger: 150, fun: 25 } },
      { id: 'room_massage', label: 'Sit in the massage chair', icon: '💆🏾', minutes: 45, pose: 'sit', perHour: { energy: 30, fun: 25 } },
    ] satisfies ActionDef[] : []),
    ...(top ? [
      { id: 'room_jacuzzi', label: 'Soak in the jacuzzi', icon: '🫧', minutes: 45, pose: 'sit', untilFull: 'hygiene', perHour: { hygiene: 200, fun: 40, energy: 14 } },
      { id: 'room_bar', label: 'Have the butler pour you a drink', icon: '🥃', minutes: 30, animation: 'drink', perHour: { fun: 90, social: 40, bladder: -20 } },
      { id: 'room_piano', label: 'Play the grand piano', icon: '🎹', minutes: 60, animation: 'perform', knowledgePerHour: 0.2, perHour: { fun: 32, energy: -2 } },
      { id: 'room_lounge', label: 'Relax in the cigar lounge', icon: '🛋️', minutes: 45, pose: 'sit', perHour: { fun: 30, social: 30, energy: 6 } },
    ] satisfies ActionDef[] : []),
  ];
}

/** Hotel rooms: up the lift from Hamdala's lobby while you hold a stay. Not on the map. */
export const ROOM_PLACES: Place[] = ROOM_TYPES.map((room) => ({
  id: roomPlaceId(room.id), name: room.name, area: PLACE_BY_ID[HOTEL_ID].name, icon: room.icon, model: 'hotel', blurb: room.blurb,
  x: 0, z: 0, w: 0, d: 0, door: PLACE_BY_ID[HOTEL_ID].door,
  actions: roomActions(room),
}));
for (const room of ROOM_PLACES) PLACE_BY_ID[room.id] = room;

/** A shift is worked at your post in the workplace, where everybody can see you (ui/ShiftGame.tsx). */
export const WORK_ACTION: ActionDef = { id: 'work', label: 'Start shift', icon: '💼', minutes: 0, pose: 'stand', effect: 'work' };
export const ENTER_ACTION: ActionDef = { id: 'enter', label: 'Go inside', icon: '🚪', minutes: 0, effect: 'enterPlace' };
export const LEAVE_ACTION: ActionDef = { id: 'leave', label: 'Back to the map', icon: '🗺️', minutes: 0, effect: 'goCity' };

/** Look up an action at a place, including the built-in enter / leave / work ones. */
export function placeAction(placeId: string, actionId: string): ActionDef | undefined {
  const own = placeHere(placeId)?.actions.find((a) => a.id === actionId);
  if (own) return own;
  return { work: WORK_ACTION, enter: ENTER_ACTION, leave: LEAVE_ACTION }[actionId];
}

/** Places that still let you in smelling awful: home, open-air spots, and places where you can wash or get treated. A place you hold a room in lets you in too (game/store.ts startPlace). */
export const SMELLY_OK = new Set(['home', 'prison', 'camp', 'hospital', 'mosque', 'stadium']);
export const turnedAwayForSmell = (p: Place) => !p.ground && !SMELLY_OK.has(p.id);

/** A live event runs on the real clock (game/live.ts), so its venue stays open until it ends, whatever the game hour. */
const hostingLiveEvent = (p: Place) => {
  const e = liveEvent(Date.now(), active.id);
  return e.active && e.def.place === p.id;
};

export function isOpen(p: Place, hour: number) {
  if (!p.hours || hostingLiveEvent(p)) return true;
  const [o, c] = p.hours;
  return c > 24 ? hour >= o || hour < c - 24 : hour >= o && hour < c;
}

export function hoursLabel(p: Place) {
  if (!p.hours) return 'Open 24 hours';
  const fmt = (h: number) => {
    const hh = h % 24;
    return `${hh % 12 === 0 ? 12 : hh % 12}${hh < 12 ? 'am' : 'pm'}`;
  };
  return `${fmt(p.hours[0])} – ${fmt(p.hours[1])}`;
}

/** Rotation that turns a model (front = local +z) to face its door. */
export function placeYaw(p: Place) {
  if (p.ground) return 0;
  if (p.door.z >= p.z + p.d) return 0;
  if (p.door.z < p.z) return Math.PI;
  if (p.door.x >= p.x + p.w) return Math.PI / 2;
  return -Math.PI / 2;
}

export const placeCenter = (p: Rect) => ({ x: p.x + p.w / 2, z: p.z + p.d / 2 });

/* ---------- Pathfinding ---------- */

export const cityWalkable = (c: Cell) => active.walkable(c.x, c.z);

/** Breadth-first search that prefers roads: off-road steps cost more, so trips follow the streets. */
export const cityBfs = (start: Cell, isGoal: (c: Cell) => boolean) => active.bfs(start, isGoal);

export const cityPathToCell = (start: Cell, goal: Cell) => (cityWalkable(goal) ? cityBfs(start, (c) => c.x === goal.x && c.z === goal.z) : null);
export const cityPathToPlace = (start: Cell, p: Place) => cityBfs(start, (c) => c.x === p.door.x && c.z === p.door.z);

/** Straight-line path ignoring terrain — for helicopter flights that don't follow roads. */
export function cityStraightPath(start: Cell, goal: Cell): Cell[] {
  const path: Cell[] = [];
  const dx = goal.x - start.x, dz = goal.z - start.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  if (steps === 0) return [];
  for (let i = 1; i <= steps; i++) {
    path.push({ x: start.x + Math.round((dx * i) / steps), z: start.z + Math.round((dz * i) / steps) });
  }
  return path;
}

/** Layout problems in a city, for the dev console and the check script. */
export function cityProblems(map: CityMap = KADUNA) {
  const out: string[] = [];
  const { places, landmarks } = map;
  // Everywhere must be reachable from where you start out: home, or the airport in a city you fly to.
  const from = (map.placeById.home ?? map.placeById.airport ?? places[0]).door;
  const reach = (p: Place) => map.bfs(from, (c) => c.x === p.door.x && c.z === p.door.z);
  for (const p of places) {
    for (let x = p.x; x < p.x + p.w; x++) for (let z = p.z; z < p.z + p.d; z++) {
      if (!map.isLand(x, z)) out.push(`${p.name}: cell ${x},${z} is off the map`);
      else if (map.isRoad(x, z)) out.push(`${p.name}: cell ${x},${z} is on a road`);
      else if (map.isWater(x, z) && p.id !== 'river') out.push(`${p.name}: cell ${x},${z} is in the water`);
    }
    if (!map.walkable(p.door.x, p.door.z)) out.push(`${p.name}: door ${p.door.x},${p.door.z} is blocked`);
    else if (!reach(p)) out.push(`${p.name}: can't be reached from ${map.placeById.home ? 'home' : 'the airport'}`);
  }
  for (const a of places) for (const b of places) if (a !== b && a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d) out.push(`${a.name} overlaps ${b.name}`);
  for (const l of landmarks) for (const p of places) if (l.x < p.x + p.w && p.x < l.x + l.w && l.z < p.z + p.d && p.z < l.z + l.d) out.push(`${l.name} overlaps ${p.name}`);
  return out;
}

if (import.meta.env?.DEV) for (const msg of cityProblems()) console.warn('[city]', msg);
