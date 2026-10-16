// Where each estate's road leaves a city's map. Estates are scenes of their own (three/Estate.tsx), not places on the
// map, so a ride to one runs across town to the edge of the map in that estate's direction, a signpost marks the
// turning ("→ Gwarinpa Estate", three/EstateSigns.tsx), and the estate opens at its gate. Leaving an estate puts you
// back on the map at the same spot. Worked out once per city from its roads, so it stays put between visits.

import { cityMap } from './city';
import type { Cell } from './grid';
import { cityEstates } from './property';

export interface EstateExit {
  region: string;
  /** The road cell the ride ends on. */
  cell: Cell;
  /** Unit direction out of town from there, for turning the signpost. */
  out: { x: number; z: number };
}

const cache = new Map<string, Record<string, EstateExit>>();

/** Every estate's exit on a city's map, by estate (region) id. */
export function estateExits(city: string): Record<string, EstateExit> {
  const map = cityMap(city);
  const hit = cache.get(map.id);
  if (hit) return hit;
  const start = (map.placeById.airport ?? map.places[0]).door;
  // Road cells a ride can reach from the airport (the map's own search, used here as a flood fill).
  const roads: Cell[] = [];
  const seen = new Set<string>();
  map.bfs(start, (c) => {
    const k = `${c.x},${c.z}`;
    if (!seen.has(k) && map.isRoad(c.x, c.z) && !map.isBridge(c.x, c.z)) {
      seen.add(k);
      roads.push(c);
    }
    return false;
  });
  const doors = map.places.map((p) => p.door);
  const cx = roads.reduce((a, c) => a + c.x, 0) / Math.max(1, roads.length);
  const cz = roads.reduce((a, c) => a + c.z, 0) / Math.max(1, roads.length);
  const estates = cityEstates(map.id);
  const out: Record<string, EstateExit> = {};
  const taken: Cell[] = [];
  estates.forEach((e, i) => {
    // Spread round the compass in the estates' own order, starting north-east.
    const a = -Math.PI / 4 + (i / estates.length) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let best: Cell | null = null;
    let bestScore = -Infinity;
    for (const c of roads) {
      const rx = c.x + 0.5 - cx, rz = c.z + 0.5 - cz;
      // Far out along the direction, not far off to the side of it.
      const score = rx * dx + rz * dz - 0.7 * Math.abs(-rx * dz + rz * dx);
      if (score <= bestScore) continue;
      if (taken.some((t) => Math.abs(t.x - c.x) + Math.abs(t.z - c.z) < 7)) continue;
      if (doors.some((d) => Math.abs(d.x - c.x) + Math.abs(d.z - c.z) < 2)) continue;
      best = c;
      bestScore = score;
    }
    const cell = best ?? start;
    taken.push(cell);
    const len = Math.hypot(cell.x + 0.5 - cx, cell.z + 0.5 - cz) || 1;
    out[e.id] = { region: e.id, cell, out: { x: (cell.x + 0.5 - cx) / len, z: (cell.z + 0.5 - cz) / len } };
  });
  cache.set(map.id, out);
  return out;
}

/** The exit of one estate on its city's map. */
export const estateExit = (city: string, region: string): EstateExit | null => estateExits(city)[region] ?? null;
