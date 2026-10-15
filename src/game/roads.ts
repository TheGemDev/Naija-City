// Potholes, shared by the game and the server (worker/roads.ts). Every pothole of every city (city.ts,
// abuja.ts) is a site: the server keeps track of which are open. Every so often one breaks open again in each
// city (more often when its government underfunds the roads), and whoever runs the city can pay to fix them.

import './abuja';
import './lagos';
import './kano';
import { cityMap, potholeCity, potholeOf } from './city';
import { TIME_RATE } from './timeRates';

export const ROADWORK = {
  /** Real hours between new potholes: 6 when the state's roads are in ruins, 30 when they are in perfect condition. */
  spawnHours: (roadsFunding: number) => 6 + (roadsFunding / 100) * 24,
  /** At most this many open in one go after a long quiet spell. */
  maxSpawnBatch: 3,
  /** What fixing one costs, by severity. */
  fixCost: { 1: 250_000, 2: 500_000, 3: 1_000_000 } as Record<1 | 2 | 3, number>,
  /** VDM tweets about a repair at most once in this long (6 game hours). The Gazette still records every one. */
  fixPostMs: ((6 * 60) / TIME_RATE) * 1000,
};

/** Street lights go out the same way potholes open, on how well the state keeps its lights up, and are fixed the same way. */
export const LAMPS = {
  /** Real hours between street lights going out: 4 with ruined lights, 24 with perfect ones. */
  spawnHours: (roadsFunding: number) => 4 + (roadsFunding / 100) * 20,
  maxSpawnBatch: 3,
  fixCost: 300_000,
};

export const fixCostOf = (site: number) => ROADWORK.fixCost[potholeOf(site)?.severity ?? 2];

/** The named road a site is on ("a side street" if none). */
export function roadOf(site: number) {
  const p = potholeOf(site);
  if (!p) return 'a side street';
  const road = cityMap(potholeCity(site)).roads.find((r) => r.name && p.x >= r.x - 0.3 && p.x <= r.x + r.w + 0.3 && p.z >= r.z - 0.3 && p.z <= r.z + r.d + 0.3);
  return road?.name ?? 'a side street';
}

export interface StreetLamp { x: number; z: number; road: string }

/** Each city's lamp sites are numbered from here, like its potholes. */
const LAMP_BASE: Record<string, number> = { kaduna: 0, abuja: 1000, lagos: 2000, kano: 3000 };
const lampLists = new Map<string, StreetLamp[]>();

/** A town's street lights: one every few tiles along its main roads, on alternate sides, where there is free land. */
export function streetLamps(city: string): StreetLamp[] {
  let list = lampLists.get(city);
  if (list) return list;
  const map = cityMap(city);
  list = [];
  for (const r of map.roads) {
    if (!r.main) continue;
    const horiz = r.w > r.d;
    const len = horiz ? r.w : r.d;
    for (let i = 2; i < len; i += 5) {
      const side = (i / 5) % 2 < 1;
      const cx = horiz ? r.x + i : side ? r.x - 1 : r.x + r.w;
      const cz = horiz ? (side ? r.z - 1 : r.z + r.d) : r.z + i;
      if (map.isRoad(cx, cz) || !map.walkable(cx, cz)) continue;
      const [x, z] = horiz ? [cx + 0.5, side ? r.z - 0.12 : r.z + r.d + 0.12] : [side ? r.x - 0.12 : r.x + r.w + 0.12, cz + 0.5];
      list.push({ x, z, road: r.name ?? 'a side street' });
    }
  }
  lampLists.set(city, list);
  return list;
}
/** The site numbers of one city's street lights. Only cities with a government have them: elsewhere the lights never go out. */
export const lampSites = (city: string) => (city in LAMP_BASE ? streetLamps(city).map((_, i) => LAMP_BASE[city] + i) : []);
export const lampCity = (site: number) => Object.keys(LAMP_BASE).find((city) => site >= LAMP_BASE[city] && site < LAMP_BASE[city] + streetLamps(city).length);
/** The street light with that site number, in whichever city it is. */
export function lampOf(site: number): StreetLamp | undefined {
  const city = lampCity(site);
  return city ? streetLamps(city)[site - LAMP_BASE[city]] : undefined;
}

export interface PotholeFix {
  site: number;
  by: string | null;
  cost: number;
  paidFrom: 'treasury' | 'pocket';
  at: number;
}

export interface RoadsSnapshot {
  /** Open pothole sites in every city (city.ts, potholeOf). */
  open: number[];
  /** When the next one is due to break open in Kaduna. */
  nextAt: number;
  treasury: number;
  /** Kaduna's treasury: the most a repair paid for by the state can cost. */
  budget: number;
  /** The same two numbers for each city. */
  cities: Record<string, { nextAt: number; budget: number; lampNextAt?: number }>;
  /** Street lights that are out, in every city (lampOf). */
  lamps?: number[];
  recent: PotholeFix[];
  /** How each city's buildings are holding up (0 to 100), by city then asset (game/treasury.ts). */
  assets?: Record<string, Record<string, number>>;
  /** Each state's own taxes and fees, by city (game/treasury.ts StateLaws). */
  laws?: Record<string, import('./treasury').StateLaws>;
  /** The most a state may charge for each of them (the president's maximum). */
  caps?: import('./treasury').StateCaps;
}
