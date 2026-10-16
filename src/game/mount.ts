// Where furniture goes besides the floor grid, and free rotation. Pure data and maths, shared by the game, the
// 3D view and the worker (through grid.ts).
//
//  - 'floor'   (default) stands on the grid like it always has.
//  - 'wall'    hangs on one face of a wall edge: its footprint is the w cells in front of the wall, `rot` says which
//              way it faces (front = local +z, like every model), `y` its centre height. Never blocks the floor.
//  - 'ceiling' hangs over its cells. Never blocks the floor.
//  - 'surface' stands on another item's top (`on` = that item's id) at the exact point px / pz, height y.
//              x / z still name the cell under it, so old code and the server's bounds checks keep working.
//
// Free rotation: `rotDeg` (any angle, 15° steps in the editor) overrides `rot` for drawing; `rot` always holds the
// nearest quarter turn. A floor item's centre stays at its quarter-turn footprint's centre and the cells it blocks are
// the ones its turned outline really covers (less a third of a tile of slack at the edges), so a chair or a sofa at 15°
// still takes its own tiles and a sofa at 45° takes the diagonal strip it lies across.

import { ITEMS } from './catalog';
import type { Cell, Edge, HouseLayout, PlacedItem } from './grid';

export type Mount = 'floor' | 'wall' | 'surface' | 'ceiling';

/** Wall heights as drawn by three/World.tsx: outer walls full height, inner partitions cut down. */
export const WALL_TALL = 2.6;
export const WALL_SHORT = 0.9;
export const WALL_THICK = 0.14;
/** Distance from a cell's centre to the face of the wall behind it. */
export const WALL_FACE = 0.5 - WALL_THICK / 2;
/** Height ceiling items hang from. */
export const CEILING_Y = 2.6;
/** The editor's rotation step. */
export const ROT_STEP = 15;
/** The glass of a window (three/World.tsx), which only curtains may cover. */
const WINDOW_SPAN: [number, number] = [1.1, 1.9];
/**
 * How far a turned item's outline may poke into a neighbouring tile without taking it: about a third of a tile, so a
 * 3-seater turned 15° still fits its row, and at 30° or more it claims the tiles it really lies across.
 */
const SLACK = 0.32;

/** The parts of a placed item that say where it is. Everything else (paint, broken...) rides along. */
export interface Pose {
  x: number;
  z: number;
  rot: number;
  rotDeg?: number;
  mount?: Mount;
  on?: string;
  px?: number;
  pz?: number;
  y?: number;
}
export type Placed = Pose & { type: string; id?: string };

export const POSE_KEYS = ['x', 'z', 'rot', 'rotDeg', 'mount', 'on', 'px', 'pz', 'y'] as const;

/** An item's pose fields only, with every optional one present (undefined clears it when spread over an item). */
export function poseOf(it: Pose): Required<Pick<Pose, 'x' | 'z' | 'rot'>> & Pose {
  return { x: it.x, z: it.z, rot: it.rot, rotDeg: it.rotDeg, mount: it.mount, on: it.on, px: it.px, pz: it.pz, y: it.y };
}

/** Drops undefined keys, so saved items stay small and old-looking. */
export function tidy<T extends object>(it: T): T {
  const out = { ...it } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

export function mountOf(it: { type: string; mount?: Mount; on?: string }): Mount {
  const fixed = ITEMS[it.type]?.mount;
  if (fixed) return fixed;
  return it.mount === 'surface' && it.on ? 'surface' : 'floor';
}
export const onFloor = (it: { type: string; mount?: Mount; on?: string }) => mountOf(it) === 'floor';

// ── Rotation ────────────────────────────────────────────────

export const normDeg = (deg: number) => ((deg % 360) + 360) % 360;
/** The quarter turn (0-3) nearest an angle. */
export const quarterOf = (deg: number) => ((Math.round(normDeg(deg) / 90) % 4) + 4) % 4;
/** The angle an item faces, in degrees. */
export const degOf = (it: { rot: number; rotDeg?: number }) => (it.rotDeg !== undefined && Number.isFinite(it.rotDeg) ? normDeg(it.rotDeg) : it.rot * 90);
/** Three.js yaw of an item: models face +z at 0, and a quarter turn is -90° about y. */
export const yawOf = (it: { rot: number; rotDeg?: number }) => -(degOf(it) * Math.PI) / 180;
/** Turned off the quarter grid. */
export const isTurned = (it: { rot: number; rotDeg?: number }) => degOf(it) % 90 !== 0;

/** An angle and the quarter turn that goes with it, ready to spread over an item (no rotDeg on a plain quarter turn). */
export function withDeg(deg: number): { rot: number; rotDeg?: number } {
  const d = Math.round(normDeg(deg) * 10) / 10;
  return d % 90 === 0 ? { rot: (d / 90) % 4, rotDeg: undefined } : { rot: quarterOf(d), rotDeg: d };
}

/** Tile size of an item at a quarter turn. */
export function quarterSize(type: string, rot: number) {
  const def = ITEMS[type];
  if (!def) return { w: 1, d: 1 };
  return rot % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

/** Cells a w × d outline centred at (cx, cz), turned `deg`, covers by more than the slack. */
export function turnedCells(cx: number, cz: number, w: number, d: number, deg: number): Cell[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const hw = Math.max(0.05, w / 2 - SLACK), hd = Math.max(0.05, d / 2 - SLACK);
  // The outline's own axes in the world (a -deg yaw turns local +x towards +z).
  const ux = c, uz = s, vx = -s, vz = c;
  const ex = hw * Math.abs(c) + hd * Math.abs(s);
  const ez = hw * Math.abs(s) + hd * Math.abs(c);
  const out: Cell[] = [];
  const eps = 1e-6;
  for (let x = Math.floor(cx - ex); x < Math.ceil(cx + ex); x++) {
    for (let z = Math.floor(cz - ez); z < Math.ceil(cz + ez); z++) {
      const qx = x + 0.5 - cx, qz = z + 0.5 - cz;
      if (Math.abs(qx) >= 0.5 + ex - eps || Math.abs(qz) >= 0.5 + ez - eps) continue;
      if (Math.abs(qx * ux + qz * uz) >= hw + 0.5 * (Math.abs(ux) + Math.abs(uz)) - eps) continue;
      if (Math.abs(qx * vx + qz * vz) >= hd + 0.5 * (Math.abs(vx) + Math.abs(vz)) - eps) continue;
      out.push({ x, z });
    }
  }
  return out;
}

/** Centre of an item on the floor plan. */
export function centreOf(it: Placed): { cx: number; cz: number } {
  if (mountOf(it) === 'surface' && Number.isFinite(it.px) && Number.isFinite(it.pz)) return { cx: it.px!, cz: it.pz! };
  const { w, d } = quarterSize(it.type, it.rot);
  return { cx: it.x + w / 2, cz: it.z + d / 2 };
}

/** The cells an item stands over. Wall and ceiling items: the cells in front of / under them. Surface items: the cell below. */
export function cellsOf(it: Placed): Cell[] {
  const m = mountOf(it);
  if (m === 'surface') {
    const { cx, cz } = centreOf(it);
    return [{ x: Math.floor(cx), z: Math.floor(cz) }];
  }
  const { w, d } = quarterSize(it.type, it.rot);
  if (m === 'floor' && isTurned(it)) {
    const def = ITEMS[it.type];
    const cells = turnedCells(it.x + w / 2, it.z + d / 2, def?.w ?? 1, def?.d ?? 1, degOf(it));
    if (cells.length) return cells;
  }
  const cells: Cell[] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) cells.push({ x: it.x + i, z: it.z + j });
  return cells;
}

// ── Walls ───────────────────────────────────────────────────

export type EdgeRef = { dir: 'h' | 'v'; x: number; z: number };
const ek = (e: EdgeRef) => `${e.dir}:${e.x}:${e.z}`;

/** The wall edges behind a wall item, one per tile along it. */
export function wallEdgesOf(it: Placed): EdgeRef[] {
  const w = ITEMS[it.type]?.w ?? 1;
  const out: EdgeRef[] = [];
  for (let i = 0; i < w; i++) {
    if (it.rot === 0) out.push({ dir: 'h', x: it.x + i, z: it.z });
    else if (it.rot === 2) out.push({ dir: 'h', x: it.x + i, z: it.z + 1 });
    else if (it.rot === 1) out.push({ dir: 'v', x: it.x + 1, z: it.z + i });
    else out.push({ dir: 'v', x: it.x, z: it.z + i });
  }
  return out;
}

/** One side of one wall edge: two things hang on the same face only if these match. */
export const faceKeys = (it: Placed) => wallEdgesOf(it).map((e) => `${ek(e)}|${it.rot}`);

/** Centre height of a wall item. */
export const wallYOf = (it: { type: string; y?: number }) => (Number.isFinite(it.y) ? it.y! : ITEMS[it.type]?.wallY ?? 1.5);
export function wallSpan(it: { type: string; y?: number }): [number, number] {
  const y = wallYOf(it), h = ITEMS[it.type]?.wallH ?? 0.5;
  return [y - h / 2, y + h / 2];
}
const overlap = (a: [number, number], b: [number, number]) => a[0] < b[1] - 0.01 && b[0] < a[1] - 0.01;

const edgeMaps = new WeakMap<HouseLayout, Map<string, Edge>>();
export function edgeAt(layout: HouseLayout, e: EdgeRef): Edge | undefined {
  let map = edgeMaps.get(layout);
  if (!map) {
    map = new Map(layout.edges.map((x) => [ek(x), x]));
    edgeMaps.set(layout, map);
  }
  return map.get(ek(e));
}

/** Windows sit on the outer walls at fixed spots (three/World.tsx draws them from this). */
export function edgeHasWindow(e: Edge, layout: HouseLayout) {
  if (!e.tall) return false;
  if (e.dir === 'h') return (e.z === 0 || e.z === layout.depth) && e.x % 5 === 2;
  return (e.x === 0 || e.x === layout.width) && e.z % 4 === 2;
}

const OUTDOOR = /yard|compound|carport|balcony|terrace/i;
/** Under a roof: the house itself or a walled extension room. */
export function indoor(layout: HouseLayout, c: Cell) {
  if (c.x >= 0 && c.z >= 0 && c.x < layout.width && c.z < layout.depth) return true;
  return layout.rooms.some((r) => !OUTDOOR.test(r.name) && c.x >= r.x0 && c.x < r.x1 && c.z >= r.z0 && c.z < r.z1);
}

/** How tall the wall behind a wall item is drawn (the lowest edge it hangs on). */
export function wallHeightBehind(it: Placed, layout: HouseLayout) {
  let h = WALL_TALL;
  for (const e of wallEdgesOf(it)) {
    const edge = edgeAt(layout, e);
    if (edge && !edge.tall) h = Math.min(h, WALL_SHORT);
  }
  return h;
}

// ── Surfaces ────────────────────────────────────────────────

/** Height of the floor (or wall point) an item's model is drawn from. */
export function baseY(it: Placed): number {
  const m = mountOf(it);
  if (m === 'wall') return wallYOf(it);
  if (m === 'surface') return Number.isFinite(it.y) ? it.y! : 0;
  return 0;
}

/** World height of an item's top surface. */
export const surfaceTop = (it: Placed) => baseY(it) + (ITEMS[it.type]?.surface?.y ?? 0);

/** A point on the floor plan in a placed item's own space. */
export function toLocal(it: Placed, px: number, pz: number) {
  const { cx, cz } = centreOf(it);
  const yaw = yawOf(it);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const wx = px - cx, wz = pz - cz;
  return { lx: wx * c - wz * s, lz: wx * s + wz * c };
}
/** A point in a placed item's own space on the floor plan. */
export function toWorld(it: Placed, lx: number, lz: number) {
  const { cx, cz } = centreOf(it);
  const yaw = yawOf(it);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { px: cx + lx * c + lz * s, pz: cz - lx * s + lz * c };
}

/** Can items stand on this one? Not on something that is itself standing on something. */
export const isSurface = (it: Placed) => !!ITEMS[it.type]?.surface && mountOf(it) !== 'surface';

// ── Validity ────────────────────────────────────────────────

/** Why a wall, ceiling or surface item can't go here, or null. Floor items are grid.ts placementError's job. */
export function mountError(cand: Placed, items: PlacedItem[], layout: HouseLayout, ignoreId?: string): string | null {
  const def = ITEMS[cand.type];
  if (!def) return 'Unknown item';
  const m = mountOf(cand);
  const inGrid = (c: Cell) => c.x >= 0 && c.z >= 0 && c.x < layout.gridW && c.z < layout.gridH;
  if (m === 'wall') {
    const cells = cellsOf(cand);
    if (!cells.every(inGrid)) return 'Out of bounds';
    if (!cells.every((c) => indoor(layout, c))) return 'Hang it on an inside wall';
    const span = wallSpan(cand);
    for (const e of wallEdgesOf(cand)) {
      const edge = edgeAt(layout, e);
      if (!edge || edge.kind !== 'wall') return def.window ? 'Curtains go over a window' : 'Needs a wall behind it';
      const win = edgeHasWindow(edge, layout);
      if (def.window && !win) return 'Curtains go over a window';
      if (!def.window && win && overlap(span, WINDOW_SPAN)) return 'A window is in the way';
    }
    if (span[1] > WALL_TALL - 0.02) return 'Too high';
    if (span[0] < 0.05) return 'Too low';
    const faces = new Set(faceKeys(cand));
    for (const it of items) {
      if (it.id === ignoreId || mountOf(it) !== 'wall') continue;
      if (faceKeys(it).some((f) => faces.has(f)) && overlap(span, wallSpan(it))) return 'Something is already hanging there';
    }
    return null;
  }
  if (m === 'ceiling') {
    const cells = cellsOf(cand);
    if (!cells.every(inGrid)) return 'Out of bounds';
    if (!cells.every((c) => indoor(layout, c))) return 'Needs a ceiling over it';
    const keys = new Set(cells.map((c) => `${c.x},${c.z}`));
    for (const it of items) {
      if (it.id === ignoreId || mountOf(it) !== 'ceiling') continue;
      if (cellsOf(it).some((c) => keys.has(`${c.x},${c.z}`))) return 'Something already hangs there';
    }
    return null;
  }
  if (m === 'surface') {
    if (!def.small) return 'Too big to stand on that';
    const parent = items.find((i) => i.id === cand.on);
    if (!parent || parent.id === ignoreId || !isSurface(parent)) return 'Put it on a table or shelf';
    const top = ITEMS[parent.type].surface!;
    if (!Number.isFinite(cand.px) || !Number.isFinite(cand.pz)) return 'Put it on a table or shelf';
    const { lx, lz } = toLocal(parent, cand.px!, cand.pz!);
    const r = def.small;
    const room = (half: number) => Math.max(0, half - r * 0.6);
    if (Math.abs(lx - (top.x ?? 0)) > room(top.w / 2) + 1e-6 || Math.abs(lz - (top.z ?? 0)) > room(top.d / 2) + 1e-6) {
      return r * 1.2 > Math.min(top.w, top.d) ? `Too big for the ${ITEMS[parent.type].name}` : 'Keep it on the top';
    }
    for (const it of items) {
      if (it.id === ignoreId || it.id === cand.id || it.on !== parent.id || mountOf(it) !== 'surface') continue;
      const gap = Math.hypot((it.px ?? 0) - cand.px!, (it.pz ?? 0) - cand.pz!);
      if (gap < (r + (ITEMS[it.type]?.small ?? 0.2)) * 0.85) return 'Something is already there';
    }
    return null;
  }
  return null;
}

/** Things standing on an item. */
export const childrenOf = (items: PlacedItem[], id: string) => items.filter((i) => i.on === id && mountOf(i) === 'surface');

/**
 * Where the things standing on `before` end up once it moves or turns to `after`: they ride along, keeping their
 * spot and angle on the top.
 */
export function carry<T extends PlacedItem>(child: T, before: Placed, after: Placed): T {
  const a = toLocal(before, child.px ?? child.x + 0.5, child.pz ?? child.z + 0.5);
  const p = toWorld(after, a.lx, a.lz);
  const turn = degOf(after) - degOf(before);
  return tidy({
    ...child,
    px: round3(p.px),
    pz: round3(p.pz),
    x: Math.floor(p.px),
    z: Math.floor(p.pz),
    y: round3(surfaceTop(after)),
    ...withDeg(degOf(child) + turn),
  });
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;
export { round3 };

/**
 * Old and odd saves: makes the new fields consistent (or drops them) so anything that loads stays drawable.
 * Saves from before these fields are returned unchanged.
 */
export function normalizePlaced<T extends PlacedItem>(it: T): T {
  if (it.rotDeg === undefined && it.mount === undefined && it.on === undefined && it.px === undefined && it.pz === undefined && it.y === undefined) return it;
  const out = { ...it } as T;
  if (out.rotDeg !== undefined) {
    if (!Number.isFinite(out.rotDeg)) delete out.rotDeg;
    else Object.assign(out, withDeg(out.rotDeg));
  }
  if (out.y !== undefined && !Number.isFinite(out.y)) delete out.y;
  if (out.mount === 'surface') {
    if (typeof out.on !== 'string' || !Number.isFinite(out.px) || !Number.isFinite(out.pz)) {
      delete out.mount; delete out.on; delete out.px; delete out.pz; delete out.y;
    }
  } else {
    delete out.on; delete out.px; delete out.pz;
    if (mountOf(out) !== 'wall') delete out.y;
  }
  return tidy(out);
}
