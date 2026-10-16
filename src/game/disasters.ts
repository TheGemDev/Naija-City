// Natural disasters: a river bursting its banks, a flash flood in the low streets, a market fire, a windstorm that rips
// the roofs off, and a harmattan bushfire on the edge of town. Unlike the live events (game/live.ts) they are not a pure
// function of the clock: the server rolls them on its five-minute cron (worker/disasters.ts) and keeps them in D1, so
// every player in that city reads the same row and sees the same water in the same streets for the same half hour.
//
// Each one has three phases. First a warning (NiMet, NIHSA or the fire service saying it is coming), then the disaster
// itself, then an aftermath that leaves mud, scorch marks or roofing sheets behind. The damage is done once, by the
// server, when the warning runs out: houses in the estates it reaches need repairs, shops there lose stock, cars parked
// there take a hit, roads crack and the state's own buildings suffer. Anyone caught in it ends up in hospital. Nobody
// loses everything: a repair bill never takes more than a share of what a player holds, and the state may send relief.
//
// The rolls follow the Nigerian seasons: floods from June to October (the coast earlier), line squalls when the rains
// arrive and leave, market fires and bushfires in the dry harmattan months. The weather on screen (game/weather.ts) is
// not consulted, because the Worker cannot load it; instead each wet disaster brings its own storm cell over the area.
//
// Everything here is shared by the game and the Worker, so it stays free of the DOM.

import './abuja';
import './lagos';
import './kano';
import { cityMap, potholeOf, potholeSites, type CityMap, type Place } from './city';
import type { CarPart } from './carCare';
import { hash } from './live';
import { DESIGN_BY_ID, CONTRACTOR_BY_ID, REGION_BY_ID, STAGES, costOf, stageLabour, stageMaterials } from './property';
import { lampOf, lampSites } from './roads';
import type { StateAsset } from './treasury';

export type DisasterKind = 'flood' | 'flashflood' | 'fire' | 'windstorm' | 'bushfire';
export type DisasterPhase = 'warning' | 'active' | 'aftermath' | 'over';
export const DISASTER_KINDS: DisasterKind[] = ['flood', 'flashflood', 'fire', 'windstorm', 'bushfire'];

/* ---------- Tunables ---------- */

export const DISASTER_RULES = {
  /** The cron's cadence: one roll per slot this long, so a tick that runs twice rolls the same dice. */
  tickMs: 5 * 60_000,
  /** Chance that something starts somewhere on a tick: about one every three to four real hours, gap included. */
  chance: 0.03,
  /** Nothing new starts anywhere within this long of the last one starting. */
  minGapMs: 45 * 60_000,
  /** One player's repairs for one disaster never take more than this share of what they hold. */
  maxBillShare: 0.35,
  /** Sandbags, tie-downs or a fire extinguisher bought during the warning cut the house bill by this share... */
  prepCut: 0.5,
  /** ...and cost this much. */
  prepCost: 20_000,
  /** Someone caught in it is hurt for this long (real minutes) and pays the hospital this, plus a share of their money, capped. */
  hurtMinutes: 20,
  hospitalBill: 8_000,
  hospitalPct: 0.02,
  hospitalCap: 120_000,
  /** The state's emergency agency pays back this share of what victims paid, from its own treasury... */
  reliefShare: 0.4,
  /** ...but never more than this share of what the treasury holds. Below reliefMin it pays nothing and gets the blame. */
  reliefTreasuryShare: 0.1,
  reliefMin: 5_000,
  /** At most this many players' houses, shops and cars are dealt with per disaster, and this many people on the street per tick. */
  maxVictims: 150,
  maxOnline: 60,
  /** An estate counts as in the way when its spot on the map is this close to the edge of the area. */
  estateReach: 3,
  /** A river flood spreads this far (cells) over the bank at its peak. Estates within floodReach of the water flood. */
  floodSpread: 4.5,
  floodReach: 6,
} as const;

export interface DisasterDef {
  kind: DisasterKind;
  icon: string;
  title: string;
  /** Who raises the alarm. */
  agency: string;
  warnMs: number;
  activeMs: number;
  afterMs: number;
  /** Radius of the area hit (cells). A fire's is set by the building it starts in. */
  radius: number;
  /** A damaged house costs this share of what it took to build. */
  house: number;
  /** Shops in the area lose this share of their stock. */
  stock: number;
  /** What happens to a car parked in it. */
  car: { part: CarPart; amount: number }[];
  /** Chance that someone standing in it is hurt. */
  hurt: number;
  /** New potholes and street lights knocked out in the area. */
  potholes: number;
  lamps: number;
  /** The state building it damages, and by how much condition. */
  asset?: { asset: StateAsset; condition: number };
  /** What sandbagging the house is called for this one. */
  prep: string;
}

const MIN = 60_000;

export const DISASTERS: Record<DisasterKind, DisasterDef> = {
  flood: {
    kind: 'flood', icon: '🌊', title: 'River flood', agency: 'NIHSA',
    warnMs: 15 * MIN, activeMs: 40 * MIN, afterMs: 120 * MIN, radius: 8,
    house: 0.06, stock: 0.4, car: [{ part: 'engine', amount: 45 }, { part: 'battery', amount: 60 }],
    hurt: 0.35, potholes: 3, lamps: 0, asset: { asset: 'roads', condition: 8 }, prep: 'Sandbag the house',
  },
  flashflood: {
    kind: 'flashflood', icon: '🌧️', title: 'Flash flood', agency: 'NiMet',
    warnMs: 8 * MIN, activeMs: 25 * MIN, afterMs: 60 * MIN, radius: 5,
    house: 0.03, stock: 0.25, car: [{ part: 'engine', amount: 30 }],
    hurt: 0.25, potholes: 2, lamps: 0, asset: { asset: 'roads', condition: 5 }, prep: 'Clear the gutters',
  },
  fire: {
    kind: 'fire', icon: '🔥', title: 'Fire', agency: 'Fire Service',
    warnMs: 4 * MIN, activeMs: 25 * MIN, afterMs: 180 * MIN, radius: 3,
    house: 0.12, stock: 0.7, car: [{ part: 'ac', amount: 60 }, { part: 'engine', amount: 25 }],
    hurt: 0.5, potholes: 0, lamps: 1, asset: { asset: 'markets', condition: 12 }, prep: 'Buy a fire extinguisher',
  },
  windstorm: {
    kind: 'windstorm', icon: '🌪️', title: 'Windstorm', agency: 'NiMet',
    warnMs: 10 * MIN, activeMs: 20 * MIN, afterMs: 120 * MIN, radius: 9,
    house: 0.05, stock: 0.15, car: [{ part: 'ac', amount: 35 }, { part: 'suspension', amount: 20 }],
    hurt: 0.25, potholes: 0, lamps: 3, asset: { asset: 'lights', condition: 8 }, prep: 'Tie down the roof',
  },
  bushfire: {
    kind: 'bushfire', icon: '🔥', title: 'Bushfire', agency: 'Fire Service',
    warnMs: 10 * MIN, activeMs: 30 * MIN, afterMs: 180 * MIN, radius: 6,
    house: 0.04, stock: 0.3, car: [{ part: 'tyres', amount: 40 }],
    hurt: 0.3, potholes: 0, lamps: 2, asset: { asset: 'parks', condition: 6 }, prep: 'Cut a firebreak',
  },
};

/** A fire on the market's street hits the markets; anywhere else it hits whatever the state keeps there. */
const FIRE_ASSET: Record<string, StateAsset> = { market: 'markets', motorpark: 'transport', station: 'transport', mall: 'markets', textile: 'markets' };
export const assetHit = (d: { kind: DisasterKind; place?: string | null }) =>
  d.kind === 'fire' ? { asset: FIRE_ASSET[d.place ?? ''] ?? 'markets', condition: DISASTERS.fire.asset!.condition } : DISASTERS[d.kind].asset;

/* ---------- Seasons ---------- */

/** How far north a city is (0 the coast, 1 the Sahel), as in game/weather.ts. */
const NORTH: Record<string, number> = { lagos: 0, abuja: 0.5, kaduna: 0.7, kano: 1 };

// How likely each kind is by month, January first: on the coast, then in the far north. Cities in between mix the two.
const SEASON: Record<DisasterKind, [number[], number[]]> = {
  flood: [[0.05, 0.05, 0.2, 0.5, 0.8, 1, 0.9, 0.6, 1, 0.9, 0.3, 0.05], [0, 0, 0, 0.05, 0.2, 0.5, 0.9, 1, 1, 0.4, 0, 0]],
  flashflood: [[0.1, 0.15, 0.4, 0.8, 1, 1, 0.9, 0.6, 1, 0.9, 0.4, 0.1], [0, 0, 0.05, 0.3, 0.6, 0.9, 1, 1, 0.8, 0.3, 0, 0]],
  // Line squalls blow in as the rains arrive and again as they leave.
  windstorm: [[0.1, 0.2, 0.6, 1, 0.9, 0.6, 0.4, 0.3, 0.5, 0.7, 0.3, 0.1], [0, 0.1, 0.3, 0.8, 1, 0.8, 0.5, 0.4, 0.5, 0.4, 0.1, 0]],
  // Market fires never stop, but the dry months are the worst.
  fire: [[0.7, 0.7, 0.6, 0.5, 0.4, 0.35, 0.35, 0.35, 0.35, 0.4, 0.5, 0.7], [1, 1, 0.9, 0.7, 0.5, 0.35, 0.35, 0.35, 0.35, 0.5, 0.8, 1]],
  bushfire: [[0.2, 0.15, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.2], [1, 0.9, 0.5, 0.1, 0, 0, 0, 0, 0, 0.1, 0.6, 1]],
};
/** Floods and fires make the news more often than a windstorm or a bushfire. */
const BASE: Record<DisasterKind, number> = { flood: 1.2, flashflood: 1, fire: 1, windstorm: 0.8, bushfire: 0.6 };

/** The month (0 to 11) in Nigeria, an hour ahead of UTC all year. */
export const monthAt = (now: number) => new Date(now + 3600_000).getUTCMonth();

/** How likely this kind is in that city in that month (0 when it can't happen there, like a river flood with no water). */
export function seasonWeight(kind: DisasterKind, city: string, month: number) {
  const north = NORTH[city] ?? 0.6;
  const [south, far] = SEASON[kind];
  const w = BASE[kind] * (south[month] * (1 - north) + far[month] * north);
  const map = cityMap(city);
  if (kind === 'flood' && map.riverDraw.length < 6 && !map.lakes.length) return 0;
  return w;
}

/* ---------- Where each estate sits ---------- */

// Estates (game/estate.ts) are scenes of their own, not on the town map. A disaster finds the houses it reaches by where
// each estate's neighbourhood is on its city's map, roughly where it is in the real city.
export const ESTATE_SPOTS: Record<string, { x: number; z: number }> = {
  // Kaduna: River Kaduna runs west to east across the middle. Kigo Road (Malali), Kabala and Kakuri sit on its banks.
  rigasa: { x: 6, z: 24 }, kawo: { x: 32, z: 6 }, malali: { x: 51, z: 41 }, ungwan_rimi: { x: 54, z: 26 },
  kakuri: { x: 16, z: 47 }, barnawa: { x: 38, z: 49 }, sabon_tasha: { x: 30, z: 66 }, millennium: { x: 50, z: 68 }, kachia: { x: 30, z: 80 },
  // Abuja: Jabi by the lake, Gwarinpa and Kubwa up north, Lugbe on Airport Road in the south.
  jabi: { x: 11, z: 11 }, gwarinpa: { x: 24, z: 10 }, kubwa: { x: 32, z: 4 }, wuse2: { x: 38, z: 17 },
  maitama: { x: 54, z: 12 }, asokoro: { x: 66, z: 40 }, lugbe: { x: 24, z: 54 },
  // Lagos: the lagoon splits the mainland from the Island. Banana Island, Makoko-side Yaba and Ikorodu are on the water.
  ikeja_gra: { x: 20, z: 8 }, festac: { x: 6, z: 28 }, surulere: { x: 36, z: 22 }, yaba: { x: 54, z: 28 }, ikorodu: { x: 80, z: 28 },
  banana: { x: 42, z: 37 }, ikoyi: { x: 36, z: 44 }, vi: { x: 48, z: 46 }, lekki1: { x: 64, z: 44 },
  // Kano: the Challawa takes a bite out of the south-west corner, past Sharada.
  rijiyar_zaki: { x: 6, z: 30 }, sharada: { x: 15, z: 47 }, fagge: { x: 46, z: 18 }, sabon_gari: { x: 66, z: 15 },
  gyadi_gyadi: { x: 38, z: 40 }, hotoro: { x: 64, z: 44 }, nassarawa_gra: { x: 74, z: 28 },
};

/* ---------- One disaster ---------- */

/** A disaster as the server stores it and every client reads it (GET /api/disasters). Times are real ms. */
export interface Disaster {
  id: number;
  city: string;
  kind: DisasterKind;
  /** Centre and radius of the area, in map cells. */
  x: number;
  z: number;
  r: number;
  /** The building a fire started in. */
  place?: string | null;
  /** The neighbourhood, as the news calls it. */
  area: string;
  /** Warning from here... */
  at: number;
  /** ...the disaster itself from here... */
  strikesAt: number;
  /** ...the aftermath from here... */
  endsAt: number;
  /** ...and gone from here. */
  clearAt: number;
  /** What it did, once it has struck. */
  toll?: DisasterToll | null;
}

export interface DisasterToll {
  houses: number;
  shops: number;
  cars: number;
  hurt: number;
  potholes: number;
  lamps: number;
  /** Naira: what victims paid in repairs, and what the state gave back. */
  repairs: number;
  relief: number;
}

export function phaseOf(d: Pick<Disaster, 'at' | 'strikesAt' | 'endsAt' | 'clearAt'>, now = Date.now()): DisasterPhase {
  if (now < d.strikesAt) return 'warning';
  if (now < d.endsAt) return 'active';
  if (now < d.clearAt) return 'aftermath';
  return 'over';
}

/**
 * How strong it is right now, 0 to 1: nothing during the warning, rising to its peak through the first half of the
 * disaster, holding, then easing off at the end. The aftermath fades from 1 to 0 separately (aftermathOf).
 */
export function intensityOf(d: Pick<Disaster, 'strikesAt' | 'endsAt'>, now = Date.now()) {
  if (now < d.strikesAt || now >= d.endsAt) return 0;
  const t = (now - d.strikesAt) / (d.endsAt - d.strikesAt);
  const rise = Math.min(1, t / 0.5);
  const fall = t > 0.85 ? 1 - ((t - 0.85) / 0.15) * 0.4 : 1;
  return rise * rise * (3 - 2 * rise) * fall;
}

/** How much of the trace is left: 1 when the disaster ends, 0 when the aftermath is over. */
export function aftermathOf(d: Pick<Disaster, 'endsAt' | 'clearAt'>, now = Date.now()) {
  if (now < d.endsAt) return 0;
  return Math.max(0, 1 - (now - d.endsAt) / (d.clearAt - d.endsAt));
}

/* ---------- Geometry ---------- */

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

/** Distance from a point to the city's river or lake shore (Infinity with neither). */
export function waterDistance(map: CityMap, x: number, z: number) {
  let best = Infinity;
  const path = map.riverDraw;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz) - map.riverHalf);
  }
  for (const l of map.lakes) {
    // Near enough for a shore: the distance from the ellipse along the line to its centre.
    const k = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz);
    best = Math.min(best, k <= 1 ? 0 : Math.hypot(x - l.x, z - l.z) * (1 - 1 / k));
  }
  return Math.max(0, best);
}

/** Is this point (map cells) in the area hit? A river flood only spreads so far from the water. */
export function inZone(d: Pick<Disaster, 'city' | 'kind' | 'x' | 'z' | 'r'>, x: number, z: number, pad = 0) {
  if (dist(x, z, d.x, d.z) > d.r + pad) return false;
  return d.kind !== 'flood' || waterDistance(cityMap(d.city), x, z) <= DISASTER_RULES.floodReach + pad;
}

const centre = (p: Place) => ({ x: p.x + p.w / 2, z: p.z + p.d / 2 });

/** The places (by id) in the area: their shops lose stock and anyone inside is caught in it. A fire always has its own. */
export function placesIn(d: Pick<Disaster, 'city' | 'kind' | 'x' | 'z' | 'r' | 'place'>): string[] {
  const out = cityMap(d.city).places.filter((p) => {
    const c = centre(p);
    return inZone(d, c.x, c.z, Math.min(p.w, p.d) / 2);
  }).map((p) => p.id);
  if (d.place && !out.includes(d.place)) out.unshift(d.place);
  return out;
}

/** The estates (region ids) whose houses it reaches. */
export function estatesIn(d: Pick<Disaster, 'city' | 'kind' | 'x' | 'z' | 'r'>): string[] {
  return Object.entries(ESTATE_SPOTS)
    .filter(([id, s]) => REGION_BY_ID[id]?.city === d.city && inZone(d, s.x, s.z, DISASTER_RULES.estateReach))
    .map(([id]) => id);
}

/** Pothole sites in the area that a flood can open, nearest first. */
export function potholesIn(d: Pick<Disaster, 'city' | 'kind' | 'x' | 'z' | 'r'>): number[] {
  return potholeSites(d.city)
    .filter((s) => {
      const p = potholeOf(s)!;
      return dist(p.x, p.z, d.x, d.z) <= d.r + 1;
    })
    .sort((a, b) => dist(potholeOf(a)!.x, potholeOf(a)!.z, d.x, d.z) - dist(potholeOf(b)!.x, potholeOf(b)!.z, d.x, d.z));
}

/** Street-light sites in the area, nearest first. */
export function lampsIn(d: Pick<Disaster, 'city' | 'kind' | 'x' | 'z' | 'r'>): number[] {
  return lampSites(d.city)
    .filter((s) => {
      const l = lampOf(s)!;
      return dist(l.x, l.z, d.x, d.z) <= d.r + 1;
    })
    .sort((a, b) => dist(lampOf(a)!.x, lampOf(a)!.z, d.x, d.z) - dist(lampOf(b)!.x, lampOf(b)!.z, d.x, d.z));
}

/** What a house cost to build so far (materials and a standard contractor), without the land: what a disaster can spoil. */
export function builtValue(region: string, design: string | null, stage: number) {
  const des = DESIGN_BY_ID[design ?? ''];
  if (!des) return 0;
  const c = CONTRACTOR_BY_ID.standard;
  return STAGES.slice(0, Math.max(0, Math.min(STAGES.length, stage)))
    .reduce((sum, s) => sum + costOf(stageMaterials(des, s), region, des.id) + stageLabour(des, s, c, region), 0);
}

/** One house's repair bill, before the per-player cap. */
export const houseBill = (kind: DisasterKind, region: string, design: string | null, stage: number, prepared: boolean) =>
  Math.round((builtValue(region, design, stage) * DISASTERS[kind].house * (prepared ? 1 - DISASTER_RULES.prepCut : 1)) / 1000) * 1000;

/** Someone hurt in it: the hospital bill on what they hold. */
export const hospitalBillOf = (balance: number) =>
  Math.min(DISASTER_RULES.hospitalCap, DISASTER_RULES.hospitalBill + Math.round(Math.max(0, balance) * DISASTER_RULES.hospitalPct));

/* ---------- Rolling ---------- */

/** A small seeded random stream (mulberry32), so the server rolls the same disaster for the same slot every time. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fire starts where people cook, store fuel and trade: the market most of all. */
const FIRE_PLACES: [string, number][] = [['market', 5], ['motorpark', 2], ['buka', 2], ['textile', 2], ['mall', 1], ['club', 1], ['suya', 1], ['boutique', 1], ['station', 1]];

/** The neighbourhood the news names: the nearest estate if one is close, else the nearest place's area. */
function areaName(map: CityMap, x: number, z: number) {
  let best: { name: string; d: number } | null = null;
  for (const [id, s] of Object.entries(ESTATE_SPOTS)) {
    const r = REGION_BY_ID[id];
    if (r?.city !== map.id) continue;
    const d = dist(s.x, s.z, x, z);
    if (d < 6 && (!best || d < best.d)) best = { name: r.name, d };
  }
  if (best) return best.name;
  let near: Place | null = null;
  let nd = Infinity;
  for (const p of map.places) {
    const c = centre(p);
    const d = dist(c.x, c.z, x, z);
    if (d < nd) {
      nd = d;
      near = p;
    }
  }
  return near?.area ?? map.id;
}

export type DisasterSpot = Pick<Disaster, 'city' | 'kind' | 'x' | 'z' | 'r' | 'place' | 'area'>;

/** Where a disaster of this kind lands in that city, from a seed. */
export function placeDisaster(kind: DisasterKind, city: string, seed: number): DisasterSpot {
  const map = cityMap(city);
  const rand = seeded(seed);
  const def = DISASTERS[kind];
  let x = map.w / 2;
  let z = map.h / 2;
  let r: number = def.radius;
  let place: string | null = null;
  if (kind === 'flood') {
    // A stretch of the river, away from where it leaves the map; or the lake shore.
    const path = map.riverDraw;
    if (path.length >= 6) {
      [x, z] = path[3 + Math.floor(rand() * (path.length - 6))];
    } else if (map.lakes.length) {
      const l = map.lakes[Math.floor(rand() * map.lakes.length)];
      const a = rand() * Math.PI * 2;
      x = l.x + Math.cos(a) * l.rx;
      z = l.z + Math.sin(a) * l.rz;
    }
  } else if (kind === 'flashflood') {
    // The low point of a main road, where the gutters give up first.
    const roads = map.roads.filter((rd) => rd.main);
    const rd = roads[Math.floor(rand() * roads.length)];
    const t = 0.2 + rand() * 0.6;
    x = rd.x + (rd.w > rd.d ? rd.w * t : rd.w / 2);
    z = rd.z + (rd.w > rd.d ? rd.d / 2 : rd.d * t);
  } else if (kind === 'fire') {
    const options = FIRE_PLACES.filter(([id]) => map.placeById[id]);
    let pick = rand() * options.reduce((a, [, w]) => a + w, 0);
    const id = (options.find(([, w]) => (pick -= w) < 0) ?? options[0])[0];
    const p = map.placeById[id];
    ({ x, z } = centre(p));
    r = Math.max(p.w, p.d) / 2 + def.radius;
    place = id;
  } else if (kind === 'windstorm') {
    // Squalls tear through where people live: a neighbourhood with an estate in it.
    const spots = Object.entries(ESTATE_SPOTS).filter(([id]) => REGION_BY_ID[id]?.city === city).map(([, s]) => s);
    const s = spots[Math.floor(rand() * spots.length)] ?? { x, z };
    x = s.x + (rand() - 0.5) * 6;
    z = s.z + (rand() - 0.5) * 6;
  } else {
    // The bush at the edge of town: a point on the outline, pulled a little way in.
    const o = map.outline[Math.floor(rand() * map.outline.length)];
    const k = 5 / Math.max(1, dist(o[0], o[1], map.w / 2, map.h / 2));
    x = o[0] + (map.w / 2 - o[0]) * k;
    z = o[1] + (map.h / 2 - o[1]) * k;
  }
  x = Math.round(x * 10) / 10;
  z = Math.round(z * 10) / 10;
  return { city, kind, x, z, r, place, area: place ? map.placeById[place].area : areaName(map, x, z) };
}

/** The roll for one cron slot: null most of the time, else what starts and where. The same for the same slot, always. */
export function rollDisaster(slot: number, cities: readonly string[], now = slot * DISASTER_RULES.tickMs): DisasterSpot | null {
  if (hash(slot * 7919 + 11) / 4294967296 >= DISASTER_RULES.chance) return null;
  const month = monthAt(now);
  const options = cities.flatMap((city) => DISASTER_KINDS.map((kind) => ({ city, kind, w: seasonWeight(kind, city, month) }))).filter((o) => o.w > 0);
  if (!options.length) return null;
  let pick = (hash(slot * 104_729 + 3) / 4294967296) * options.reduce((a, o) => a + o.w, 0);
  const o = options.find((x) => (pick -= x.w) < 0) ?? options[options.length - 1];
  return placeDisaster(o.kind, o.city, hash(slot * 31 + 7));
}

/** The timings of a disaster that starts warning at `at`. */
export function timesOf(kind: DisasterKind, at: number) {
  const def = DISASTERS[kind];
  const strikesAt = at + def.warnMs;
  const endsAt = strikesAt + def.activeMs;
  return { at, strikesAt, endsAt, clearAt: endsAt + def.afterMs };
}

/* ---------- Words ---------- */

/** What the area is called with its water: "River Kaduna at Kakuri". */
const waterName = (city: string) => {
  const map = cityMap(city);
  return map.riverName || map.lakes[0]?.name || 'the river';
};

/** The headline while it is coming, while it is on, and once it is over. */
export function headline(d: Pick<Disaster, 'city' | 'kind' | 'area' | 'place'>, phase: DisasterPhase) {
  const place = d.place ? cityMap(d.city).placeById[d.place]?.name ?? d.area : d.area;
  switch (d.kind) {
    case 'flood':
      return phase === 'warning' ? `Flood alert: ${waterName(d.city)} is rising near ${d.area}`
        : phase === 'active' ? `${waterName(d.city)} has burst its banks at ${d.area}` : `Flood waters going down in ${d.area}`;
    case 'flashflood':
      return phase === 'warning' ? `Heavy rain warning for ${d.area}` : phase === 'active' ? `Flash flood in ${d.area}` : `Mud everywhere in ${d.area}`;
    case 'fire':
      return phase === 'warning' ? `Smoke seen at ${place}` : phase === 'active' ? `${place} is on fire` : `${place} burnt out`;
    case 'windstorm':
      return phase === 'warning' ? `Windstorm warning for ${d.area}` : phase === 'active' ? `Windstorm tearing roofs off in ${d.area}` : `Roofs gone in ${d.area}`;
    case 'bushfire':
      return phase === 'warning' ? `Bushfire spreading towards ${d.area}` : phase === 'active' ? `Bushfire at the edge of ${d.area}` : `Burnt bush outside ${d.area}`;
  }
}

/** The warning as the agency puts it, for the feed and the push. */
export function warningText(d: Pick<Disaster, 'city' | 'kind' | 'area' | 'place'>, minutes: number) {
  const place = d.place ? cityMap(d.city).placeById[d.place]?.name ?? d.area : d.area;
  switch (d.kind) {
    case 'flood':
      return `NIHSA flood alert: ${waterName(d.city)} is rising fast near ${d.area}. It may overflow in about ${minutes} minutes. Move your car to high ground and sandbag your doors.`;
    case 'flashflood':
      return `NiMet: a heavy downpour is heading for ${d.area} in about ${minutes} minutes. Low roads will flood. Do not drive through moving water.`;
    case 'fire':
      return `Fire Service: smoke reported at ${place}. Traders, carry your goods out now. Fire engines are on the way (they say).`;
    case 'windstorm':
      return `NiMet: a violent line squall will hit ${d.area} in about ${minutes} minutes. Tie down your roofing sheets and stay off the street.`;
    case 'bushfire':
      return `Fire Service: a harmattan bushfire is burning towards ${d.area}. It may reach houses in about ${minutes} minutes. Clear dry grass round your compound.`;
  }
}
