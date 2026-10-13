// Estates: one walkable scene per region where every player's land in that region sits on its own
// plot slot. Slots are handed out by the server (worker/estate.ts) so neighbours line up the same for
// everyone; guests get local slots. A region has many estates ("Kachia 1", "Kachia 2", ...), each a
// fixed block of CAP plots, so a busy region adds estates instead of one endless scene.

import type { Cell } from './grid';
import type { PlotSize } from './property';

export const COLS = 8;
export const PLOT = 5;
export const ROAD = 2;
/** Grass verge on the left and right. */
export const EDGE = 2;
/** Plot rows in one estate, and so how many plots it holds. */
export const ROWS = 5;
export const CAP = COLS * ROWS;
/** A region's slots count up across its estates: slot 0-39 is estate 1, 40-79 estate 2, and so on. */
export const sectionOf = (slot: number) => Math.floor(slot / CAP);

export const estateW = () => EDGE * 2 + COLS * PLOT;
export const rowsFor = (_maxSlot?: number) => ROWS;
export const estateH = (rows: number) => rows * (PLOT + ROAD);

/** Top-left corner of a plot slot within its estate. Each row is plots, then the road in front of them. */
export function slotOrigin(slot: number): Cell {
  const i = slot % CAP;
  return { x: EDGE + (i % COLS) * PLOT, z: Math.floor(i / COLS) * (PLOT + ROAD) };
}

/** The house footprint inside its plot, by plot size: width × depth, set back from the road. */
export function houseRect(slot: number, plot: PlotSize) {
  const o = slotOrigin(slot);
  // Back of the house at the plot's back edge, leaving the front row free as the yard.
  const [w, d] = plot === 'half' ? [2, 3] : plot === 'full' ? [3, 3] : [4, 4];
  const x0 = o.x + Math.floor((PLOT - w) / 2);
  const z0 = o.z + PLOT - 1 - d;
  return { x0, z0, x1: x0 + w, z1: z0 + d };
}

/** Where you arrive: the road at the bottom-left of the estate. */
export const entrance = (rows: number): Cell => ({ x: 1, z: estateH(rows) - 2 });

export interface EstateLot { slot: number; plot: PlotSize; stage: number; design: string | null }

/** Shortest walk across the estate, going round houses that have walls up. */
export function estatePath(start: Cell, goal: Cell, lots: EstateLot[], rows: number): Cell[] | null {
  const W = estateW();
  const H = estateH(rows);
  const blocked = new Set<string>();
  for (const l of lots) {
    if (!l.design || l.stage < 2) continue;
    const r = houseRect(l.slot, l.plot);
    for (let x = r.x0; x < r.x1; x++) for (let z = r.z0; z < r.z1; z++) blocked.add(`${x},${z}`);
  }
  const k = (c: Cell) => `${c.x},${c.z}`;
  if (blocked.has(k(goal)) || goal.x < 0 || goal.z < 0 || goal.x >= W || goal.z >= H) return null;
  const prev = new Map<string, Cell | null>([[k(start), null]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === goal.x && cur.z === goal.z) {
      const path: Cell[] = [];
      for (let p: Cell | null = cur; p && k(p) !== k(start); p = prev.get(k(p)) ?? null) path.unshift(p);
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: cur.x + dx, z: cur.z + dz };
      if (n.x < 0 || n.z < 0 || n.x >= W || n.z >= H || prev.has(k(n)) || blocked.has(k(n))) continue;
      prev.set(k(n), cur);
      queue.push(n);
    }
  }
  return null;
}
