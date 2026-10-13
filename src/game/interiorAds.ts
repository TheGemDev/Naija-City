// Where player-ad fixtures hang inside each place. Pure, so the server and the booking list can count the same slots.

import { propCells, type Interior } from './interiors';

/** Places with a screen on the back wall (the rest get posters only). */
export const SCREEN_PLACES = new Set(['mall', 'techhub', 'station', 'airport', 'motorpark', 'club', 'bank', 'hospital', 'viewing', 'poly', 'secretariat']);
/** No ads in a cell, a place of worship or the kidnappers' camp. */
export const NO_ADS = new Set(['prison', 'camp', 'church', 'mosque']);
const WALL = 0.07;

export type Fixture =
  | { kind: 'poster' | 'banner'; x: number; z: number; yaw: number; y: number; wall: 'back' | 'left' | 'right' | 'fence' }
  | { kind: 'screen'; x: number; z: number; yaw: number; y: number; wall: 'back' }
  | { kind: 'easel'; x: number; z: number; yaw: number; y: number; wall: 'fence' };

/** Where the fixtures go for one interior. Pure: depends only on the room's size, door and props. */
export function layout(placeId: string, it: Interior): Fixture[] {
  const out: Fixture[] = [];
  // A hotel room is private: nothing to advertise to.
  if (it.room) return out;
  const screen = !it.outdoor && SCREEN_PLACES.has(placeId) && it.w >= 8;
  const wallKind = it.outdoor ? 'banner' : 'poster';
  const y = it.outdoor ? 0.52 : 1.6;
  // Back wall: evenly spaced, the middle given to the screen when there is one.
  const n = Math.max(1, Math.floor(it.w / 5));
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) * it.w) / n;
    if (screen && Math.abs(x - it.w / 2) < it.w / (2 * n) + 0.01) continue;
    out.push({ kind: wallKind, x, z: WALL + 0.02, yaw: 0, y, wall: it.outdoor ? 'fence' : 'back' } as Fixture);
  }
  if (screen) out.push({ kind: 'screen', x: it.w / 2, z: WALL + 0.02, yaw: 0, y: 1.65, wall: 'back' });
  // Side walls (rooms only: an open-air spot's fence is too low and too far from the camera).
  if (!it.outdoor && it.h >= 8) {
    out.push({ kind: 'poster', x: WALL + 0.02, z: it.h * 0.45, yaw: Math.PI / 2, y, wall: 'left' });
    out.push({ kind: 'poster', x: it.w - WALL - 0.02, z: it.h * 0.45, yaw: -Math.PI / 2, y, wall: 'right' });
  }
  // Sandwich boards stand a few cells in from the door, turned to face the camera (it looks in from the front-right),
  // on free cells that keep the lane from the door clear. Against the front wall they would face it and hide behind it.
  const taken = new Set([
    ...it.props.flatMap((p) => propCells(p).map((c) => `${c.x},${c.z}`)),
    ...(it.blocked ?? []).flatMap((r) => Array.from({ length: r.w * r.d }, (_, i) => `${r.x + (i % r.w)},${r.z + Math.floor(i / r.w)}`)),
  ]);
  const free = (x: number, z: number) => x >= 1 && x < it.w - 1 && z >= 1 && z < it.h - 1 && !taken.has(`${x},${z}`);
  for (const cx of [it.doorX - 3, it.doorX + 4]) {
    const cz = [it.h - 3, it.h - 4, it.h - 5].find((z) => free(cx, z));
    if (cz === undefined) continue;
    out.push({ kind: 'easel', x: cx + 0.5, z: cz + 0.5, yaw: Math.PI / 4, y: 0, wall: 'fence' });
  }
  return out;
}

/** Fixtures a place shows and sells at once. 0 for now: ads inside places are switched off. Raise it to bring them back, best spots first. */
export const FIXTURES_OPEN = 0;

/**
 * The numbers of a place's fixtures that are on sale, best spot first: the screen, then the back wall (or fence) from the
 * middle out, then the sandwich boards, then the side walls. `w` is the room's width. A fixture keeps its number (its
 * place in layout()) whether it is on sale or not, so raising FIXTURES_OPEN never moves an ad.
 */
export function openFixtures(fixtures: Fixture[], w: number): number[] {
  const rank = (f: Fixture) => (f.kind === 'screen' ? 0 : f.kind === 'easel' ? 2 : f.wall === 'left' || f.wall === 'right' ? 3 : 1);
  return fixtures
    .map((f, i) => ({ i, rank: rank(f), off: Math.abs(f.x - w / 2) }))
    .sort((a, b) => a.rank - b.rank || a.off - b.off || a.i - b.i)
    .slice(0, FIXTURES_OPEN)
    .map((f) => f.i);
}
