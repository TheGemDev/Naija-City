// Bookable billboards. Every board is its own slot: an ad is bought for one board and shows only there.
// Keys: `city:<n>` for Kaduna's nth roadside board (the map's billboards in city.ts) and `city:<city>:<n>` for another
// city's, `estate:<region>:<n>` for an estate verge board, `in:<place>:<n>` for a fixture inside one of Kaduna's places and
// `in:<city>:<place>:<n>` inside another city's. Kaduna's keys carry no city: ads were booked on them before there was a
// second one. `tv:<city>:<n>` is a slot on the TVs in a city's houses (always with its city: it came after the others).

import './abuja';
import './lagos';
import './kano';
import { CITY_MAPS, insidePoly, PLACE_BY_ID, type CityMap } from './city';
import { AD_PLANS } from './ads';
import { REGION_BY_ID } from './property';
import { regionOf } from './regions';
import { INTERIORS } from './interiors';
import { layout, NO_ADS, openFixtures } from './interiorAds';

/** Spots along an estate's left and right verges (x counts in from the edge it's on). */
export const ESTATE_BILLBOARDS = [
  { x: 1, z: 4.2, side: -1 }, { x: 1, z: 18.2, side: -1 }, { x: 1, z: 32.2, side: -1 },
  { x: -1, z: 11.2, side: 1 }, { x: -1, z: 25.2, side: 1 },
];

/** The city whose board keys carry no city name. */
const HOME = 'kaduna';
/** The map of a city that really exists (unlike cityMap, an unknown one is not Kaduna). */
const mapOf = (region: string = HOME): CityMap | undefined => (Object.hasOwn(CITY_MAPS, region) ? CITY_MAPS[region] : undefined);

export const cityBoard = (i: number, region: string = HOME) => (region === HOME ? `city:${i}` : `city:${region}:${i}`);
/** Which city a roadside board key is in, and its number there. */
export function parseCityBoard(key: string): { region: string; i: number } | null {
  const m = key.match(/^city:(?:([a-z]{1,20}):)?(\d{1,4})$/);
  return m ? { region: m[1] ?? HOME, i: +m[2] } : null;
}
/** A fixture inside a place. The cities share place ids (each has an 'airport'), so the key names the city too. */
export const interiorBoard = (placeId: string, i: number, region: string = HOME) => (region === HOME ? `in:${placeId}:${i}` : `in:${region}:${placeId}:${i}`);
/** Which city and place an indoor board key is in, and its number there. */
export function parseInteriorBoard(key: string): { region: string; placeId: string; i: number } | null {
  const m = key.match(/^in:(?:([a-z]{1,20}):)?([A-Za-z0-9_-]{1,40}):(\d{1,2})$/);
  return m ? { region: m[1] ?? HOME, placeId: m[2], i: +m[3] } : null;
}
export const estateBoard = (region: string, i: number) => `estate:${region}:${i}`;

/* ---------- Roadside boards on sale ---------- */
// A city's map has spots for many more boards than are sold. Only a few stand at once, so the roads are not lined with
// empty ones. A board keeps its number whether it is on sale or not, so raising CITY_BOARDS_OPEN never moves an ad.

/** The standing billboards (roadside and estate verge) are put away for now: none stand in the world and none are on sale. Set to false to bring them back. */
export const BILLBOARDS_HIDDEN = true;

/** Roadside boards a city shows and sells at once. */
export const CITY_BOARDS_OPEN = 4;
const openBoards: Record<string, number[]> = {};
/** The numbers of a city's roadside boards that are on sale: the one nearest the middle of each quarter of its map, so they are spread out. */
export function openCityBoards(region: string = HOME): number[] {
  if (BILLBOARDS_HIDDEN) return [];
  if (openBoards[region]) return openBoards[region];
  const map = mapOf(region);
  if (!map) return [];
  const open: number[] = [];
  for (let k = 0; k < CITY_BOARDS_OPEN && open.length < map.billboards.length; k++) {
    // Quarter by quarter, then round again for any boards past the first four.
    const cx = map.w * (k % 2 ? 0.75 : 0.25), cz = map.h * (k % 4 < 2 ? 0.25 : 0.75);
    let best = -1, d = Infinity;
    map.billboards.forEach((b, i) => {
      const dd = Math.hypot(b.x - cx, b.z - cz);
      if (dd < d && !open.includes(i)) { d = dd; best = i; }
    });
    open.push(best);
  }
  return (openBoards[region] = open);
}
/** Roadside board `i` of a city is one of those on sale. */
export const cityBoardOpen = (i: number, region: string = HOME) => openCityBoards(region).includes(i);

/* ---------- Home TVs: airtime on the television in every house of a city ---------- */
// Key `tv:<city>:<n>`: one of the city's TV_SLOTS slots. A TV that is on, in any house in that city, rolls through the
// ads booked on the slots (src/three/TvAds.tsx), so each slot is seen in every home, not on one screen.

/** Ads that can share a city's home TVs at once. */
export const TV_SLOTS = 6;
/** Price factor for a TV slot: it plays in every house in the city, so it costs more than one roadside board. */
const TV_FACTOR = 2;
export const tvBoard = (region: string, i: number) => `tv:${region}:${i}`;
/** Which city's TVs a slot key is on, and its number there (null for a city that does not exist). */
export function parseTv(key: string): { region: string; i: number } | null {
  const m = key.match(/^tv:([a-z]{1,20}):(\d)$/);
  return m && mapOf(m[1]) && +m[2] < TV_SLOTS ? { region: m[1], i: +m[2] } : null;
}

/* ---------- Sea boards: panels on stilts in the water around the island ---------- */
// Key `sea:<x>,<z>,<w>,<d>` (Kaduna) or `sea:<city>:<x>,<z>,<w>,<d>`: a w×d block of grid cells whose top-left cell is (x, z). Cells are one map cell (1 unit),
// and every cell must be open water inside the sea zone: a cell the island reaches into, even partly, is not bookable.
// The ad is one panel over the whole block.

export interface SeaRect { x: number; z: number; w: number; d: number; /** The city whose sea it is; Kaduna's when left out. */ region?: string }
/** How far past the island's bounding box the sea can be booked. */
export const SEA_MARGIN = 12;
export const SEA_MAX_W = 12;
export const SEA_MAX_D = 8;
/** Naira per grid cell on the shortest plan (a day); longer plans scale with the plan's own price. */
export const SEA_CELL_PRICE = 200;
/** Plans the sea can be booked on. */
export const SEA_PLANS = ['day', 'week'];

const regionOfSea = (r: SeaRect) => r.region ?? HOME;
export const seaBoard = (r: SeaRect) => `sea:${regionOfSea(r) === HOME ? '' : `${r.region}:`}${r.x},${r.z},${r.w},${r.d}`;

export function parseSea(key: string): SeaRect | null {
  const m = key.match(/^sea:(?:([a-z]{1,20}):)?(-?\d{1,3}),(-?\d{1,3}),(\d{1,2}),(\d{1,2})$/);
  if (!m || !mapOf(m[1])) return null;
  const r: SeaRect = { x: +m[2], z: +m[3], w: +m[4], d: +m[5], ...(m[1] && m[1] !== HOME ? { region: m[1] } : {}) };
  return r.w >= 1 && r.d >= 1 && r.w <= SEA_MAX_W && r.d <= SEA_MAX_D ? r : null;
}

/** Clear water kept between a sea block and the island's outline (the ground slab's bevel sticks 0.3 out past it). */
export const SEA_SHORE_GAP = 0.5;

interface SeaMask { cols: number; rows: number; open: Uint8Array }
const seaMasks: Record<string, SeaMask> = {};

/** Segment a→b touches the box (x0, z0)–(x1, z1). */
function segmentHitsBox(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number): boolean {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[ax, bx - ax, x0, x1], [az, bz - az, z0, z1]]) {
    if (d === 0) { if (p < lo || p > hi) return false; continue; }
    const a = (lo - p) / d, b = (hi - p) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return false;
  }
  return true;
}

/** 1 for every sea-zone cell of a city that is open water, built on first use. */
function seaMask(region: string): SeaMask | null {
  if (seaMasks[region]) return seaMasks[region];
  const map = mapOf(region);
  if (!map) return null;
  const OUTLINE = map.outline;
  const SEA_COLS = map.w + SEA_MARGIN * 2, SEA_ROWS = map.h + SEA_MARGIN * 2;
  const open = new Uint8Array(SEA_COLS * SEA_ROWS);
  for (let z = 0; z < SEA_ROWS; z++)
    for (let x = 0; x < SEA_COLS; x++)
      open[z * SEA_COLS + x] = insidePoly(x - SEA_MARGIN + 0.5, z - SEA_MARGIN + 0.5, OUTLINE) ? 0 : 1;
  // A cell whose centre is in the water can still have the shore cutting through it: close every cell the coastline comes near.
  const g = SEA_SHORE_GAP;
  OUTLINE.forEach(([ax, az], i) => {
    const [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length];
    for (let z = Math.floor(Math.min(az, bz) - g); z <= Math.floor(Math.max(az, bz) + g); z++)
      for (let x = Math.floor(Math.min(ax, bx) - g); x <= Math.floor(Math.max(ax, bx) + g); x++) {
        const cx = x + SEA_MARGIN, cz = z + SEA_MARGIN;
        if (cx < 0 || cz < 0 || cx >= SEA_COLS || cz >= SEA_ROWS) continue;
        if (segmentHitsBox(ax, az, bx, bz, x - g, z - g, x + 1 + g, z + 1 + g)) open[cz * SEA_COLS + cx] = 0;
      }
  });
  return (seaMasks[region] = { cols: SEA_COLS, rows: SEA_ROWS, open });
}

/** Cell (x, z) is water an ad can sit on: inside the city's sea zone, with no part of it on the island or against its shore. */
export function seaCellOpen(x: number, z: number, region: string = HOME): boolean {
  const mask = seaMask(region);
  const cx = x + SEA_MARGIN, cz = z + SEA_MARGIN;
  return !!mask && cx >= 0 && cz >= 0 && cx < mask.cols && cz < mask.rows && mask.open[cz * mask.cols + cx] === 1;
}

/** Every cell of the block is open water. */
export function seaWater(r: SeaRect): boolean {
  for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.d; z++) if (!seaCellOpen(x, z, regionOfSea(r))) return false;
  return true;
}

/* Zones: the sea is split into named regions (a 3×3 split around the island's bounding box, by the block's centre).
   Players pick a zone and a size and the block is placed on the first free water there, so nobody drags a grid. */
export interface SeaZone { id: string; name: string; note: string; mult: number; col: 0 | 1 | 2; row: 0 | 1 | 2 }
export const SEA_ZONES: SeaZone[] = [
  { id: 'nw', name: 'Northwest Bay', note: 'Quiet corner', mult: 0.8, col: 0, row: 0 },
  { id: 'n', name: 'North Shore', note: 'Prime · seen by most players', mult: 1.2, col: 1, row: 0 },
  { id: 'ne', name: 'Northeast Bay', note: 'Quiet corner', mult: 0.8, col: 2, row: 0 },
  { id: 'w', name: 'West Shore', note: 'Open water', mult: 1, col: 0, row: 1 },
  { id: 'c', name: 'Inner Bay', note: 'Water tucked inside the island', mult: 0.9, col: 1, row: 1 },
  { id: 'e', name: 'East Shore', note: 'Open water', mult: 1, col: 2, row: 1 },
  { id: 'sw', name: 'Southwest Bay', note: 'Quiet corner', mult: 0.8, col: 0, row: 2 },
  { id: 's', name: 'South Shore', note: 'Prime · seen by most players', mult: 1.2, col: 1, row: 2 },
  { id: 'se', name: 'Southeast Bay', note: 'Quiet corner', mult: 0.8, col: 2, row: 2 },
];
export const SEA_SIZES = [
  { id: 'small', name: 'Small', w: 2, d: 1 },
  { id: 'medium', name: 'Medium', w: 4, d: 2 },
  { id: 'large', name: 'Large', w: 8, d: 4 },
] as const;

/** A city's size in cells (Kaduna's for a city that does not exist, which no key can name anyway). */
const sizeOf = (region: string = HOME) => { const m = mapOf(region) ?? CITY_MAPS[HOME]; return { w: m.w, h: m.h }; };

export function seaZone(r: SeaRect): SeaZone {
  const { w: CITY_W, h: CITY_H } = sizeOf(regionOfSea(r));
  const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
  const col = cx < 0 ? 0 : cx > CITY_W ? 2 : 1, row = cz < 0 ? 0 : cz > CITY_H ? 2 : 1;
  return SEA_ZONES.find((z) => z.col === col && z.row === row)!;
}

/** The zone's area on a city's map, for drawing. */
export function seaZoneBox(z: SeaZone, region: string = HOME) {
  const { w: CITY_W, h: CITY_H } = sizeOf(region);
  const x = z.col === 0 ? -SEA_MARGIN : z.col === 1 ? 0 : CITY_W;
  const zz = z.row === 0 ? -SEA_MARGIN : z.row === 1 ? 0 : CITY_H;
  return { x, z: zz, w: z.col === 1 ? CITY_W : SEA_MARGIN, d: z.row === 1 ? CITY_H : SEA_MARGIN };
}

/** First free block of a size in a zone of a city's sea: the one nearest `near` (default the zone's middle), or null when the zone is full. */
export function seaAutoPlace(zone: SeaZone, size: { w: number; d: number }, taken: SeaRect[], near?: { x: number; z: number }, region: string = HOME): SeaRect | null {
  const box = seaZoneBox(zone, region);
  const tx = near?.x ?? box.x + box.w / 2, tz = near?.z ?? box.z + box.d / 2;
  let best: SeaRect | null = null, bestD = Infinity;
  for (let x = box.x - size.w; x <= box.x + box.w; x++) {
    for (let z = box.z - size.d; z <= box.z + box.d; z++) {
      const r: SeaRect = { x, z, w: size.w, d: size.d, ...(region === HOME ? {} : { region }) };
      const dist = Math.hypot(x + size.w / 2 - tx, z + size.d / 2 - tz);
      if (dist >= bestD || seaZone(r) !== zone || !seaWater(r) || taken.some((o) => seaOverlap(r, o))) continue;
      best = r; bestD = dist;
    }
  }
  return best;
}

/** Two blocks in the same city's sea share a cell. */
export const seaOverlap = (a: SeaRect, b: SeaRect) => regionOfSea(a) === regionOfSea(b) && a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

/** True when `key` names a board that exists and is on sale. */
export function validBoard(key: string): boolean {
  if (key.startsWith('sea:')) { const r = parseSea(key); return !!r && seaWater(r); }
  if (key.startsWith('tv:')) return !!parseTv(key);
  const c = parseCityBoard(key);
  if (c) return cityBoardOpen(c.i, c.region);
  const m = key.match(/^estate:([A-Za-z0-9_-]{1,40}):(\d)$/);
  // An estate that exists: a made-up one would be a board nobody ever sees.
  if (m) return !BILLBOARDS_HIDDEN && Object.hasOwn(REGION_BY_ID, m[1]) && +m[2] < ESTATE_BILLBOARDS.length;
  const n = parseInteriorBoard(key);
  // Another city's board is in a place that city has.
  return !!n && (n.region === HOME || !!mapOf(n.region)?.placeById[n.placeId]) && openInterior(n.placeId).includes(n.i);
}

/** Fixture kinds an ad can be booked on inside one place (empty where ads aren't allowed). */
function interiorBoards(placeId: string) {
  const it = INTERIORS[placeId];
  return it && !it.jungle && !NO_ADS.has(placeId) ? layout(placeId, it) : [];
}
/** The numbers of a place's fixtures that are on sale. */
const openInterior = (placeId: string) => openFixtures(interiorBoards(placeId), INTERIORS[placeId]?.w ?? 0);

/** Friendly name for the picker: the nearest place for a roadside board. */
/** Where a board is on its city's map (its city, and the tile at its middle), or null for one with no spot there (estate verges). */
export function boardSpot(key: string): { region: string; x: number; z: number } | null {
  const sea = parseSea(key);
  if (sea) return { region: regionOfSea(sea), x: sea.x + sea.w / 2, z: sea.z + sea.d / 2 };
  const c = parseCityBoard(key);
  if (c) {
    const b = mapOf(c.region)?.billboards[c.i];
    return b ? { region: c.region, x: b.x + 0.5, z: b.z + 0.5 } : null;
  }
  const n = parseInteriorBoard(key);
  if (n) {
    const p = mapOf(n.region)?.placeById[n.placeId];
    return p ? { region: n.region, x: p.x + p.w / 2, z: p.z + p.d / 2 } : null;
  }
  return null;
}

export function boardLabel(key: string): string {
  const sea = parseSea(key);
  if (sea) return `${seaZone(sea).name} · ${sea.w}×${sea.d} (${sea.w * sea.d} grids)`;
  const tv = parseTv(key);
  if (tv) return `Home TVs in ${regionOf(tv.region).name} · slot #${tv.i + 1}`;
  const c = parseCityBoard(key);
  if (c) {
    const map = mapOf(c.region);
    const b = map?.billboards[c.i];
    if (!map || !b) return 'Roadside board';
    let best = map.places[0], d = Infinity;
    for (const p of map.places) {
      const dd = Math.hypot(p.x + p.w / 2 - b.x, p.z + p.d / 2 - b.z);
      if (dd < d) { d = dd; best = p; }
    }
    return `Road near ${best.name} · #${c.i + 1}`;
  }
  const n = parseInteriorBoard(key);
  if (n) {
    const f = interiorBoards(n.placeId)[n.i];
    const what = { poster: 'Wall poster', banner: 'Fence banner', screen: 'TV screen', easel: 'Sandwich board' }[f?.kind ?? 'poster'];
    return `${mapOf(n.region)?.placeById[n.placeId]?.name ?? PLACE_BY_ID[n.placeId]?.name ?? n.placeId} · ${what} #${n.i + 1}`;
  }
  const e = key.match(/^estate:.+:(\d)$/);
  return e ? `Estate verge board #${+e[1] + 1}` : key;
}

/** Every board an ad can be booked on, in picker order. */
export const allBoards = (): string[] => [
  ...Object.values(CITY_MAPS).flatMap((map) => openCityBoards(map.id).map((i) => cityBoard(i, map.id))),
  ...(BILLBOARDS_HIDDEN ? [] : Object.keys(REGION_BY_ID).flatMap((region) => ESTATE_BILLBOARDS.map((_, i) => estateBoard(region, i)))),
  ...Object.keys(CITY_MAPS).flatMap((region) => Array.from({ length: TV_SLOTS }, (_, i) => tvBoard(region, i))),
  ...Object.values(CITY_MAPS).flatMap((map) => Object.keys(INTERIORS).filter((id) => map.id === HOME || map.placeById[id]).flatMap((id) => openInterior(id).map((i) => interiorBoard(id, i, map.id)))),
];

/** Price factor per board size: the big roadside boards cost the plan price, smaller spots cost a share of it. */
const KIND_FACTOR = { poster: 0.4, banner: 0.5, screen: 0.6, easel: 0.3 } as const;
export function boardFactor(key: string): number {
  if (key.startsWith('sea:')) return 1;
  if (key.startsWith('tv:')) return TV_FACTOR;
  if (key.startsWith('estate:')) return 0.5;
  const n = parseInteriorBoard(key);
  if (n) return KIND_FACTOR[interiorBoards(n.placeId)[n.i]?.kind ?? 'poster'];
  return 1;
}

/** What one board costs for a plan, in naira, rounded to the nearest ₦100. */
export function boardPrice(planPrice: number, key: string): number {
  const sea = parseSea(key);
  if (sea) return Math.round((sea.w * sea.d * SEA_CELL_PRICE * seaZone(sea).mult * planPrice) / AD_PLANS[0].price / 100) * 100;
  return Math.max(100, Math.round((planPrice * boardFactor(key)) / 100) * 100);
}
