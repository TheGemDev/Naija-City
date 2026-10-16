// The police cells: a room inside each city's police station, the way a hotel room is inside the hotel. You go
// through from the charge room (the CELLS gate, places/civic.ts `police`) to a corridor with barred cells along the
// back (`prison`). Anybody can walk the corridor and talk to whoever is locked up; an arrested player is put in one of
// the cells and can only move about inside it, until the warder opens the door and walks them out (store.release).

import type { Cell } from './grid';
import { INTERIORS } from './interiors';
import { avatarCell } from './avatar';

/** The place / interior id of the cell block. It kept the old prison's id, so everything that knew the prison knows it. */
export const CELLS_ID = 'prison';
/** The station the cell block is inside. */
export const CELLS_PARENT = 'police';

export interface JailCell {
  /** The cell's floor: what is inside the bars. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** The barred door in the front row of bars. */
  door: Cell;
  /** Just inside the door, and just outside it in the corridor. */
  inside: Cell;
  outside: Cell;
  /** Where you stand when they lock you in. */
  spot: Cell;
}

/** Every cell in the block, left to right (laid out in places/civic.ts as `cells`). */
export const CELLS: JailCell[] = (INTERIORS[CELLS_ID]?.cells ?? []).map((r) => {
  const mid = r.x + Math.floor(r.w / 2);
  const front = r.z + r.d;
  return { ...r, door: { x: mid, z: front }, inside: { x: mid, z: front - 1 }, outside: { x: mid, z: front + 1 }, spot: { x: mid, z: front - 2 } };
});

/** The cell a spot in the block is in, or -1 for the corridor (and anywhere else). */
export function cellAt(c: Cell): number {
  return CELLS.findIndex((r) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d);
}

/** Standing in a cell in the cells right now: locked in, not visiting from the corridor. */
export const inCellNow = (g: { view: string; insideId: string | null }) => g.view === 'place' && g.insideId === CELLS_ID && cellAt(avatarCell()) >= 0;

/** A small stable number from an id, so the same player always prefers the same cell. */
function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Who goes in which cell, worked out the same way on every phone from the same list of prisoners: in id order, each
 * takes the cell their id points at, or the next empty one along. Once every cell has somebody, they double up, in
 * whichever cell has the fewest.
 */
export function assignCells(uids: Iterable<string>): Map<string, number> {
  const out = new Map<string, number>();
  const n = CELLS.length;
  if (!n) return out;
  const count = new Array<number>(n).fill(0);
  for (const uid of [...new Set(uids)].sort()) {
    const first = hash(uid) % n;
    let best = first;
    for (let k = 0; k < n; k++) {
      const i = (first + k) % n;
      if (count[i] < count[best]) best = i;
      if (!count[i]) { best = i; break; }
    }
    count[best]++;
    out.set(uid, best);
  }
  return out;
}

/** The game's link to who I am and who else is locked up (set by net/crime.ts), for picking my cell on arrest. */
export const cellHooks: { pick?: () => number } = {};

/** What a visitor sees on the activity list in the cell block, and what a prisoner sees: the cell's own things, or the corridor's. */
export const cellActionShown = (actionId: string, lockedIn: boolean) => actionId.startsWith('cell_') === lockedIn;
