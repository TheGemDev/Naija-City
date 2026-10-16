// The furniture editor (Buy mode): what the pointer means while placing or dragging a piece, groups, free turns,
// duplicating, and undo / redo for the session. The rules for walls, ceilings and table tops are in game/mount.ts;
// the plain grid rules in game/grid.ts. Nothing here runs per frame: only on pointer moves while editing.

import { create } from 'zustand';
import { ITEMS } from './catalog';
import { avatarCell } from './avatar';
import { fitItemsToLayout, houseLayout, placementError, type Cell, type HouseLayout, type PlacedItem } from './grid';
import { activeDesignOf, decorHooks, houseKeyOf, naira, useGame } from './store';
import { useVisit } from './visits';
import { homeTransform } from './origins';
import {
  CEILING_Y, WALL_FACE, WALL_SHORT, WALL_TALL, carry, centreOf, degOf, edgeAt, indoor, isSurface, mountOf, poseOf,
  quarterSize, round3, surfaceTop, tidy, toLocal, toWorld, wallYOf, withDeg, type Pose,
} from './mount';

/** A ray in the house's own grid space (cells are 1 × 1, the floor is y = 0). */
export type Ray = { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number };
export type Guide = { a: [number, number, number]; b: [number, number, number] };

interface Decor {
  /** Where the piece being placed would go, and why it can't (null: it can). */
  pose: Pose | null;
  err: string | null;
  /** Alignment lines to draw while placing. */
  guides: Guide[];
  /** Everything else moving with it, at its new spot: the rest of a group and what stands on them. */
  extras: PlacedItem[];
  /** Tap-to-pick mode, and the picked pieces. */
  selectMode: boolean;
  sel: string[];
  /** Turn by the degree instead of in 15° steps. */
  smooth: boolean;
  /** A piece is being dragged right now. */
  dragging: boolean;
  /** How many steps undo / redo can take. */
  undo: number;
  redo: number;
}

export const useDecor = create<Decor>(() => ({ pose: null, err: null, guides: [], extras: [], selectMode: false, sel: [], smooth: false, dragging: false, undo: 0, redo: 0 }));

export const homeLayout = (s = useGame.getState()): HouseLayout => houseLayout(activeDesignOf(s), s.wallEdits[houseKeyOf(s)]);

/** World ray → house grid space. The home is drawn shifted and scaled (game/origins.ts homeTransform). */
export function toHouseRay(o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }): Ray {
  const s = useGame.getState();
  const t = homeTransform(s.origin, activeDesignOf(s));
  return { ox: (o.x - t.x) / t.scale, oy: o.y / t.scale, oz: (o.z - t.z) / t.scale, dx: d.x, dy: d.y, dz: d.z };
}

const toast = (text: string) => useGame.getState().toast(text);
/** A little tick under the finger, where phones have one. */
export const buzz = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
};

// ── Aiming ──────────────────────────────────────────────────

let lastRay: Ray | null = null;
/** The pointer's floor point to the piece's centre, so a dragged piece stays under the finger. */
let grab = { x: 0, z: 0 };
/** The pointer has aimed since this placing started (else turning keeps the piece where it is). */
let aimed = false;

const floorAt = (r: Ray, y = 0) => {
  if (Math.abs(r.dy) < 1e-6) return null;
  const t = (y - r.oy) / r.dy;
  return t > 0 ? { x: r.ox + r.dx * t, z: r.oz + r.dz * t, t } : null;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Face = { cell: Cell; rot: number; along: number; dir: 'h' | 'v'; t: number };

/** The nearest inside wall face the ray meets. Cut-down walls count up to a little above their top. */
function wallFace(r: Ray, layout: HouseLayout): Face | null {
  let best: Face | null = null;
  for (const e of layout.edges) {
    if (e.kind !== 'wall') continue;
    const top = e.tall ? WALL_TALL : WALL_SHORT + 0.45;
    if (e.dir === 'h') {
      if (Math.abs(r.dz) < 1e-6) continue;
      const t = (e.z - r.oz) / r.dz;
      if (t <= 0 || (best && t >= best.t)) continue;
      const px = r.ox + r.dx * t, py = r.oy + r.dy * t;
      if (px < e.x || px > e.x + 1 || py < 0 || py > top) continue;
      const cell = r.dz > 0 ? { x: e.x, z: e.z - 1 } : { x: e.x, z: e.z };
      if (!indoor(layout, cell)) continue;
      best = { cell, rot: r.dz > 0 ? 2 : 0, along: px, dir: 'h', t };
    } else {
      if (Math.abs(r.dx) < 1e-6) continue;
      const t = (e.x - r.ox) / r.dx;
      if (t <= 0 || (best && t >= best.t)) continue;
      const pz = r.oz + r.dz * t, py = r.oy + r.dy * t;
      if (pz < e.z || pz > e.z + 1 || py < 0 || py > top) continue;
      const cell = r.dx > 0 ? { x: e.x - 1, z: e.z } : { x: e.x, z: e.z };
      if (!indoor(layout, cell)) continue;
      best = { cell, rot: r.dx > 0 ? 1 : 3, along: pz, dir: 'v', t };
    }
  }
  return best;
}

/** A tap on the floor: the closest wall of that tile. */
function wallNear(p: { x: number; z: number }, layout: HouseLayout): Face | null {
  const cell = { x: Math.floor(p.x), z: Math.floor(p.z) };
  if (!indoor(layout, cell)) return null;
  const fx = p.x - cell.x, fz = p.z - cell.z;
  const options: [number, 'h' | 'v', number, number, number][] = [
    [fz, 'h', cell.x, cell.z, 0],
    [1 - fz, 'h', cell.x, cell.z + 1, 2],
    [fx, 'v', cell.x, cell.z, 3],
    [1 - fx, 'v', cell.x + 1, cell.z, 1],
  ];
  let best: Face | null = null;
  let bestD = Infinity;
  for (const [d, dir, x, z, rot] of options) {
    const e = edgeAt(layout, { dir, x, z });
    if (!e || e.kind !== 'wall' || d >= bestD) continue;
    bestD = d;
    best = { cell, rot, along: dir === 'h' ? p.x : p.z, dir, t: 0 };
  }
  return best;
}

/** A wall piece on a face: slid along the wall so the tile under the pointer is covered and it fits, if it can. */
function onWall(type: string, face: Face, y: number, others: PlacedItem[], layout: HouseLayout): { pose: Pose; err: string | null } {
  const w = ITEMS[type]?.w ?? 1;
  const at = face.dir === 'h' ? face.cell.x : face.cell.z;
  const want = Math.round(face.along - w / 2);
  const starts: number[] = [];
  for (let a = at - w + 1; a <= at; a++) starts.push(a);
  starts.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
  let first: { pose: Pose; err: string | null } | null = null;
  for (const a of starts) {
    const pose: Pose = face.dir === 'h'
      ? { x: a, z: face.cell.z, rot: face.rot, mount: 'wall', y }
      : { x: face.cell.x, z: a, rot: face.rot, mount: 'wall', y };
    const err = placementError({ type, ...pose }, others, avatarCell(), undefined, layout);
    if (!err) return { pose, err };
    first ??= { pose, err };
  }
  return first!;
}

/** Where on a top (table, shelf...) the ray lands, snapped to 5 cm and to the top's middle lines. */
function onTop(r: Ray, type: string, deg: number, others: PlacedItem[]): { pose: Pose; guides: Guide[] } | null {
  let best: { it: PlacedItem; lx: number; lz: number; t: number; top: number } | null = null;
  for (const it of others) {
    if (!isSurface(it)) continue;
    const top = surfaceTop(it);
    const p = floorAt(r, top);
    if (!p || (best && p.t >= best.t)) continue;
    const s = ITEMS[it.type].surface!;
    const { lx, lz } = toLocal(it, p.x, p.z);
    if (Math.abs(lx - (s.x ?? 0)) > s.w / 2 + 0.12 || Math.abs(lz - (s.z ?? 0)) > s.d / 2 + 0.12) continue;
    best = { it, lx, lz, t: p.t, top };
  }
  if (!best) return null;
  const s = ITEMS[best.it.type].surface!;
  const sx = s.x ?? 0, sz = s.z ?? 0;
  const r0 = ITEMS[type]?.small ?? 0.2;
  const mx = Math.max(0, s.w / 2 - r0 * 0.6), mz = Math.max(0, s.d / 2 - r0 * 0.6);
  const snap = (v: number) => Math.round(v / 0.05) * 0.05;
  let lx = clamp(snap(best.lx - sx), -mx, mx);
  let lz = clamp(snap(best.lz - sz), -mz, mz);
  const guides: Guide[] = [];
  const y = best.top + 0.01;
  const line = (ax: number, az: number, bx: number, bz: number) => {
    const a = toWorld(best!.it, ax, az), b = toWorld(best!.it, bx, bz);
    guides.push({ a: [a.px, y, a.pz], b: [b.px, y, b.pz] });
  };
  if (Math.abs(lx) < 0.08) {
    lx = 0;
    line(sx, sz - s.d / 2, sx, sz + s.d / 2);
  }
  if (Math.abs(lz) < 0.08) {
    lz = 0;
    line(sx - s.w / 2, sz, sx + s.w / 2, sz);
  }
  const p = toWorld(best.it, sx + lx, sz + lz);
  return {
    pose: { x: Math.floor(p.px), z: Math.floor(p.pz), ...withDeg(deg), mount: 'surface', on: best.it.id, px: round3(p.px), pz: round3(p.pz), y: round3(best.top) },
    guides,
  };
}

/** A floor (or ceiling) piece centred on a point, snapped to the grid. */
function onGrid(type: string, deg: number, cx: number, cz: number, layout: HouseLayout): Pose {
  const q = withDeg(deg);
  const { w, d } = quarterSize(type, q.rot);
  return {
    x: clamp(Math.round(cx - w / 2), 0, Math.max(0, layout.gridW - w)),
    z: clamp(Math.round(cz - d / 2), 0, Math.max(0, layout.gridH - d)),
    ...q,
  };
}

/** Lines to other floor pieces whose centre lines up with this one's. */
function floorGuides(type: string, pose: Pose, others: PlacedItem[]): Guide[] {
  const { cx, cz } = centreOf({ type, ...pose });
  let bx: [number, PlacedItem] | null = null, bz: [number, PlacedItem] | null = null;
  for (const it of others) {
    if (mountOf(it) !== 'floor' || ITEMS[it.type]?.layer !== 'object' || it.type === 'gate') continue;
    const c = centreOf(it);
    const dx = Math.abs(c.cx - cx), dz = Math.abs(c.cz - cz);
    if (dx < 0.01 && dz > 0.5 && dz < 9 && (!bx || dz < bx[0])) bx = [dz, it];
    if (dz < 0.01 && dx > 0.5 && dx < 9 && (!bz || dx < bz[0])) bz = [dx, it];
  }
  const out: Guide[] = [];
  for (const hit of [bx, bz]) {
    if (!hit) continue;
    const c = centreOf(hit[1]);
    out.push({ a: [cx, 0.05, cz], b: [c.cx, 0.05, c.cz] });
  }
  return out;
}

/** Point on a wall piece's face, at its height. */
function facePoint(it: { type: string } & Pose): [number, number, number] {
  const { cx, cz } = centreOf(it);
  const back = [[0, -1], [1, 0], [0, 1], [-1, 0]][it.rot];
  return [cx + back[0] * (WALL_FACE - 0.03), wallYOf(it), cz + back[1] * (WALL_FACE - 0.03)];
}

/** Lines to other pieces on the same wall hung at the same height. */
function wallGuides(type: string, pose: Pose, others: PlacedItem[]): Guide[] {
  const me = { type, ...pose };
  const a = facePoint(me);
  const out: Guide[] = [];
  for (const it of others) {
    if (mountOf(it) !== 'wall' || it.rot !== pose.rot || Math.abs(wallYOf(it) - wallYOf(me)) > 0.01) continue;
    const b = facePoint(it);
    const sameLine = pose.rot % 2 ? Math.abs(b[0] - a[0]) < 0.01 : Math.abs(b[2] - a[2]) < 0.01;
    if (sameLine && Math.hypot(b[0] - a[0], b[2] - a[2]) < 8) out.push({ a, b });
  }
  return out;
}

/** Ids moving with the piece being placed: its group, and what stands on any of them. */
function movingIds(items: PlacedItem[], p: NonNullable<ReturnType<typeof useGame.getState>['placing']>): Set<string> {
  const ids = new Set<string>(p.group?.length ? p.group : p.moveId ? [p.moveId] : []);
  for (const it of items) if (it.on && ids.has(it.on) && mountOf(it) === 'surface') ids.add(it.id);
  return ids;
}

/**
 * Points the piece being placed at a ray (null: the last one again, e.g. after a turn). Works out its spot, whether
 * it fits, the guides, and where the rest of its group lands.
 */
export function aimAt(ray: Ray | null) {
  const s = useGame.getState();
  const p = s.placing;
  if (ray) {
    lastRay = ray;
    aimed = true;
  }
  if (!p) return;
  const def = ITEMS[p.type];
  const r = ray ?? (aimed ? lastRay : null);
  if (!def) return;
  const layout = homeLayout(s);
  const moving = movingIds(s.items, p);
  const others = s.items.filter((i) => !moving.has(i.id));
  const deg = degOf(p);
  const primary = p.moveId ? s.items.find((i) => i.id === p.moveId) : undefined;
  let pose: Pose | null;
  let err: string | null = null;
  let guides: Guide[] = [];

  if (!r) {
    // Not aimed yet (just picked Move, or turned before touching the house): keep it where it is.
    const cur = useDecor.getState().pose ?? (primary ? poseOf(primary) : null);
    if (!cur) return;
    const m = mountOf({ type: p.type, ...cur });
    if (m === 'wall') pose = { ...cur, y: p.y ?? cur.y };
    else if (m === 'surface' || p.group?.length) pose = p.group?.length ? cur : { ...cur, ...withDeg(deg) };
    else {
      const c = centreOf({ type: p.type, ...cur });
      pose = { ...onGrid(p.type, deg, c.cx, c.cz, layout), mount: cur.mount };
    }
  } else if (p.group?.length && primary) {
    // A group slides by whole tiles, keeping its shape.
    const pt = floorAt(r);
    if (!pt) return;
    const c = centreOf(primary);
    const dx = Math.round(pt.x + grab.x - c.cx), dz = Math.round(pt.z + grab.z - c.cz);
    pose = { ...poseOf(primary), x: primary.x + dx, z: primary.z + dz, px: primary.px === undefined ? undefined : round3(primary.px + dx), pz: primary.pz === undefined ? undefined : round3(primary.pz + dz) };
  } else if (def.mount === 'wall') {
    const y = p.y ?? def.wallY ?? 1.5;
    const pt = floorAt(r);
    const face = wallFace(r, layout) ?? (pt ? wallNear(pt, layout) : null);
    if (face) ({ pose, err } = onWall(p.type, face, y, others, layout));
    else if (pt) {
      pose = { x: clamp(Math.floor(pt.x), 0, layout.gridW - 1), z: clamp(Math.floor(pt.z), 0, layout.gridH - 1), rot: p.rot, mount: 'wall', y };
      err = 'Needs a wall behind it';
    } else return;
    if (!err) guides = wallGuides(p.type, pose!, others);
  } else if (def.mount === 'ceiling') {
    const pt = floorAt(r, CEILING_Y - 0.35) ?? floorAt(r);
    if (!pt) return;
    pose = { ...onGrid(p.type, deg, pt.x, pt.z, layout), mount: 'ceiling' };
  } else {
    const top = def.small ? onTop(r, p.type, deg, others) : null;
    if (top) ({ pose, guides } = top);
    else {
      const pt = floorAt(r);
      if (!pt) return;
      pose = onGrid(p.type, deg, pt.x + grab.x, pt.z + grab.z, layout);
      guides = floorGuides(p.type, pose, others);
    }
  }
  if (!pose) return;

  // Where everything else goes, and whether it all fits.
  const extras: PlacedItem[] = [];
  const placed = [...others];
  if (!err) err = placementError({ type: p.type, ...pose }, others, avatarCell(), undefined, layout);
  if (primary) {
    const after = tidy({ ...primary, ...poseOf(pose) });
    placed.push(after);
    if (p.group?.length) {
      const dx = pose.x - primary.x, dz = pose.z - primary.z;
      // Tops before what stands on them.
      const order = [...p.group].sort((a, b) => Number(s.items.find((i) => i.id === a)?.mount === 'surface') - Number(s.items.find((i) => i.id === b)?.mount === 'surface'));
      for (const id of order) {
        const it = s.items.find((i) => i.id === id);
        if (!it || id === primary.id) continue;
        const moved = tidy({ ...it, x: it.x + dx, z: it.z + dz, px: it.px === undefined ? undefined : round3(it.px + dx), pz: it.pz === undefined ? undefined : round3(it.pz + dz) });
        const e = placementError(moved, placed, avatarCell(), undefined, layout);
        if (e && !err) err = `${ITEMS[it.type]?.name ?? 'Something'}: ${e}`;
        placed.push(moved);
        extras.push(moved);
      }
    }
    // What stands on anything that moved rides along.
    for (const it of s.items) {
      if (!moving.has(it.id) || mountOf(it) !== 'surface' || p.group?.includes(it.id) || it.id === primary.id) continue;
      const before = s.items.find((b) => b.id === it.on);
      const after2 = placed.find((b) => b.id === it.on);
      if (before && after2) extras.push(carry(it, before, after2));
    }
  }
  useDecor.setState({ pose, err, guides, extras });
  s.setHover({ x: pose.x, z: pose.z });
}

/** Starts dragging a placed piece (or the group it is picked with) from where the pointer is. */
export function beginDrag(id: string, ray: Ray): boolean {
  const s = useGame.getState();
  const it = s.items.find((i) => i.id === id);
  if (!it || ITEMS[it.type]?.fixed) return false;
  const sel = useDecor.getState().sel;
  const group = sel.length > 1 && sel.includes(id) ? sel.filter((g) => s.items.some((i) => i.id === g && !ITEMS[i.type]?.fixed)) : undefined;
  useGame.setState({ placing: { type: it.type, rot: it.rot, rotDeg: it.rotDeg, y: it.y, moveId: id, group }, selectedId: null });
  const pt = floorAt(ray);
  const c = centreOf(it);
  grab = pt ? { x: c.cx - pt.x, z: c.cz - pt.z } : { x: 0, z: 0 };
  useDecor.setState({ dragging: true });
  buzz();
  aimAt(ray);
  return true;
}

/** Drags the ghost of what is being placed (keeps the finger's grip on it). */
export function grabGhost(ray: Ray) {
  const { pose } = useDecor.getState();
  const p = useGame.getState().placing;
  const pt = floorAt(ray);
  if (pose && p && pt) {
    const c = centreOf({ type: p.type, ...pose });
    grab = mountOf({ type: p.type, ...pose }) === 'floor' || p.group?.length ? { x: c.cx - pt.x, z: c.cz - pt.z } : { x: 0, z: 0 };
  }
  useDecor.setState({ dragging: true });
}

/** Lets go of a dragged piece: it lands if it fits, else goes back. */
export function endDrag(commit: boolean) {
  useDecor.setState({ dragging: false });
  const s = useGame.getState();
  if (!commit || !s.placing) return;
  const { pose, err } = useDecor.getState();
  if (err || !pose) {
    toast(err ?? "Can't go there");
    s.cancelPlacing();
    return;
  }
  buzz(8);
  s.placeAt({ x: pose.x, z: pose.z });
}

/** The store's placeAt asks this where the piece really goes (game/store.ts decorHooks.plan). */
function plan(c: Cell): { err?: string | null; cand?: Pose; items?: PlacedItem[] } | null {
  const s = useGame.getState();
  const p = s.placing;
  if (!p) return null;
  let { pose } = useDecor.getState();
  if (!pose) {
    // Asked for a tile the pointer never aimed at (keyboard, an old caller): aim straight down at it.
    aimAt({ ox: c.x + 0.5, oy: 40, oz: c.z + 0.5, dx: 0, dy: -1, dz: 0 });
    pose = useDecor.getState().pose;
  }
  const { err, extras } = useDecor.getState();
  if (!pose) return { err: 'Tap a spot first' };
  if (err) return { err };
  if (!p.moveId) return { cand: poseOf(pose) };
  const moved = new Map<string, PlacedItem>(extras.map((e) => [e.id, e]));
  return {
    items: s.items.map((i) => (i.id === p.moveId ? tidy({ ...i, ...poseOf(pose!) }) : moved.get(i.id) ?? i)),
  };
}

// ── Turning ─────────────────────────────────────────────────

/** Turns the piece being placed by `delta` degrees (or to `to`). */
export function turnPlacing(delta: number, to?: number) {
  const s = useGame.getState();
  const p = s.placing;
  if (!p) return;
  if (ITEMS[p.type]?.mount === 'wall') return toast('Wall pieces face the room: drag it to another wall');
  if (p.group?.length) return toast('Turn a group from its bar, a quarter at a time');
  const deg = to ?? degOf(p) + delta;
  useGame.setState({ placing: { ...p, ...withDeg(deg) } });
}

/**
 * Turns placed pieces where they stand: one about its own centre, a group about its middle. What stands on them turns
 * with them. Nothing moves unless everything fits.
 */
export function turnItems(ids: string[], delta: number) {
  const s = useGame.getState();
  const layout = homeLayout(s);
  const list = ids.map((id) => s.items.find((i) => i.id === id)).filter((i): i is PlacedItem => !!i && !ITEMS[i.type]?.fixed);
  if (!list.length) return;
  const turnable = list.filter((i) => mountOf(i) !== 'wall');
  if (!turnable.length) return toast('Wall pieces face the room: move it to another wall instead');
  const ids2 = new Set(turnable.map((i) => i.id));
  const riders = s.items.filter((i) => i.on && ids2.has(i.on) && !ids2.has(i.id) && mountOf(i) === 'surface');
  const fixedIds = new Set([...ids2, ...riders.map((r) => r.id)]);
  const placed = s.items.filter((i) => !fixedIds.has(i.id));
  // Pivot: the middle of the group, on the half-tile grid.
  const cs = turnable.map((i) => centreOf(i));
  const px = turnable.length > 1 ? Math.round(((Math.min(...cs.map((c) => c.cx)) + Math.max(...cs.map((c) => c.cx))) / 2) * 2) / 2 : cs[0].cx;
  const pz = turnable.length > 1 ? Math.round(((Math.min(...cs.map((c) => c.cz)) + Math.max(...cs.map((c) => c.cz))) / 2) * 2) / 2 : cs[0].cz;
  const yaw = (-delta * Math.PI) / 180;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const after = new Map<string, PlacedItem>();
  for (const it of turnable) {
    const c = centreOf(it);
    const vx = c.cx - px, vz = c.cz - pz;
    const nx = px + vx * cos + vz * sin, nz = pz - vx * sin + vz * cos;
    const deg = degOf(it) + delta;
    let next: PlacedItem;
    if (mountOf(it) === 'surface') next = tidy({ ...it, ...withDeg(deg), px: round3(nx), pz: round3(nz), x: Math.floor(nx), z: Math.floor(nz) });
    else next = tidy({ ...it, ...onGrid(it.type, deg, nx, nz, layout), mount: it.mount });
    after.set(it.id, next);
  }
  // Pieces on a top that turned without them stay where they are on it, so check those last.
  const order = [...turnable].sort((a, b) => Number(mountOf(a) === 'surface') - Number(mountOf(b) === 'surface'));
  for (const it of order) {
    const next = after.get(it.id)!;
    const err = placementError(next, placed, avatarCell(), undefined, layout);
    if (err) return toast(turnable.length > 1 ? `${ITEMS[it.type]?.name}: ${err}` : err);
    placed.push(next);
  }
  for (const r of riders) {
    const before = s.items.find((i) => i.id === r.on)!;
    after.set(r.id, carry(r, before, after.get(before.id)!));
  }
  useGame.setState({ items: s.items.map((i) => after.get(i.id) ?? i) });
}

// ── Groups ──────────────────────────────────────────────────

export function setSelectMode(on: boolean) {
  useDecor.setState({ selectMode: on, sel: on ? useDecor.getState().sel : [] });
  if (on) useGame.setState({ selectedId: null });
}

/** Adds or removes a piece from the picked group. */
export function toggleSel(id: string) {
  const s = useGame.getState();
  const it = s.items.find((i) => i.id === id);
  if (!it || ITEMS[it.type]?.fixed) return;
  const sel = useDecor.getState().sel;
  useDecor.setState({ selectMode: true, sel: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
  if (s.selectedId) useGame.setState({ selectedId: null });
  buzz(10);
}

/** Picks the whole group up to move it: tap a spot (or drag) to put it down. */
export function moveSel() {
  const s = useGame.getState();
  const sel = useDecor.getState().sel.filter((id) => s.items.some((i) => i.id === id));
  const it = s.items.find((i) => i.id === sel[0]);
  if (!it) return;
  grab = { x: 0, z: 0 };
  useGame.setState({ placing: { type: it.type, rot: it.rot, rotDeg: it.rotDeg, y: it.y, moveId: it.id, group: sel.length > 1 ? sel : undefined }, selectedId: null });
}

export const turnSel = (delta = 90) => turnItems(useDecor.getState().sel, delta);

/** Puts a set of pieces (and what stands on them) into storage. */
export function storeItems(ids: string[]) {
  const s = useGame.getState();
  const gone = new Set(ids.filter((id) => s.items.some((i) => i.id === id && !ITEMS[i.type]?.fixed)));
  for (const it of s.items) if (it.on && gone.has(it.on) && mountOf(it) === 'surface') gone.add(it.id);
  if (!gone.size) return;
  if (s.task?.itemId && gone.has(s.task.itemId)) s.cancelTask();
  useGame.setState({
    items: s.items.filter((i) => !gone.has(i.id)),
    furnitureInventory: [...s.furnitureInventory, ...s.items.filter((i) => gone.has(i.id))],
    selectedId: null,
  });
  useDecor.setState({ sel: useDecor.getState().sel.filter((id) => !gone.has(id)) });
  toast(`📦 ${gone.size} thing${gone.size > 1 ? 's' : ''} stored`);
}
export const storeSel = () => storeItems(useDecor.getState().sel);

/** Buys another of a placed piece, same colours and angle: it follows the pointer like a new purchase. */
export function duplicate(id: string) {
  const s = useGame.getState();
  const it = s.items.find((i) => i.id === id);
  const def = it && ITEMS[it.type];
  if (!it || !def || def.fixed) return;
  if (s.money < def.price) return toast(`Another ${def.name} costs ${naira(def.price)}`);
  useGame.setState({ placing: { type: it.type, rot: it.rot, rotDeg: it.rotDeg, y: it.y, paint: it.paint }, selectedId: null });
  // Start it beside the original (along the same wall, on the same top) until the pointer says otherwise.
  const layout = homeLayout(s);
  const c = centreOf(it);
  if (mountOf(it) === 'wall') {
    for (const k of [1, -1, 2, -2]) {
      const along = (it.rot % 2 ? c.cz : c.cx) + k * def.w;
      const cell = it.rot % 2 ? { x: it.x, z: Math.floor(along) } : { x: Math.floor(along), z: it.z };
      const res = onWall(it.type, { cell, rot: it.rot, along, dir: it.rot % 2 ? 'v' : 'h', t: 0 }, wallYOf(it), s.items, layout);
      if (!res.err) {
        useDecor.setState({ pose: res.pose, err: null, guides: [], extras: [] });
        useGame.getState().setHover({ x: res.pose.x, z: res.pose.z });
        return;
      }
    }
    useDecor.setState({ pose: poseOf(it), err: 'Something is already hanging there', guides: [], extras: [] });
    return;
  }
  const step = mountOf(it) === 'surface' ? (def.small ?? 0.2) * 2.2 : Math.max(def.w, def.d);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2]]) {
    const top = mountOf(it) === 'surface' ? (it.y ?? 0) : 0;
    aimAt({ ox: c.cx + dx * step, oy: top + 40, oz: c.cz + dz * step, dx: 0, dy: -1, dz: 0 });
    aimed = false;
    if (!useDecor.getState().err) return;
  }
}

// ── Undo / redo ─────────────────────────────────────────────
// Every change to the furniture while decorating is a step. Undo puts the arrangement back, but never money: a
// piece bought since goes into storage, and one sold since stays sold.

type Snap = { items: PlacedItem[]; inv: PlacedItem[] };
const past: Snap[] = [];
const future: Snap[] = [];
const HISTORY = 60;
let applying = false;

const counts = () => useDecor.setState({ undo: past.length, redo: future.length });
function clearHistory() {
  past.length = 0;
  future.length = 0;
  counts();
}

function restore(to: Snap) {
  const s = useGame.getState();
  const owned = new Map([...s.items, ...s.furnitureInventory].map((i) => [i.id, i]));
  const items = to.items.filter((i) => owned.has(i.id)).map((i) => tidy({ ...owned.get(i.id)!, ...poseOf(i), paint: i.paint }));
  const placedIds = new Set(items.map((i) => i.id));
  const wasStored = new Set(to.inv.map((i) => i.id));
  const inv = [
    ...to.inv.filter((i) => owned.has(i.id) && !placedIds.has(i.id)).map((i) => owned.get(i.id)!),
    ...[...owned.values()].filter((i) => !placedIds.has(i.id) && !wasStored.has(i.id)),
  ];
  // Walls may have changed since: anything that no longer fits waits in storage.
  const fitted = fitItemsToLayout(items, homeLayout(s));
  applying = true;
  useGame.setState({ items: fitted.items, furnitureInventory: [...inv, ...fitted.boxed], selectedId: null, placing: null });
  applying = false;
  if (fitted.boxed.length) toast(`📦 ${fitted.boxed.length} thing${fitted.boxed.length > 1 ? 's' : ''} didn't fit any more and went to storage`);
}

const snap = (): Snap => ({ items: useGame.getState().items, inv: useGame.getState().furnitureInventory });

export function undo() {
  const prev = past.pop();
  if (!prev) return;
  future.push(snap());
  restore(prev);
  counts();
  buzz(8);
}
export function redo() {
  const next = future.pop();
  if (!next) return;
  past.push(snap());
  restore(next);
  counts();
  buzz(8);
}

/** Boxes up wall, ceiling and table-top pieces that lost what held them (a wall knocked down). */
function settle(why: string) {
  const s = useGame.getState();
  const fitted = fitItemsToLayout(s.items, homeLayout(s));
  const lost = fitted.boxed.filter((i) => mountOf(i) !== 'floor');
  if (!lost.length) return;
  const gone = new Set(lost.map((i) => i.id));
  useGame.setState({ items: s.items.filter((i) => !gone.has(i.id)), furnitureInventory: [...s.furnitureInventory, ...lost] });
  toast(`📦 ${lost.map((i) => ITEMS[i.type]?.name ?? 'Something').join(', ')} ${why} and went to storage`);
}

// ── Wiring ──────────────────────────────────────────────────

decorHooks.plan = plan;
decorHooks.turn = turnItems;
decorHooks.settle = settle;

useGame.subscribe((s, prev) => {
  // Leaving Buy mode, switching house or visiting someone ends the session.
  if ((prev.mode === 'buy' && s.mode !== 'buy') || s.activeHouseId !== prev.activeHouseId || s.view !== 'home') {
    if (past.length || future.length) clearHistory();
    if (useDecor.getState().sel.length || useDecor.getState().selectMode) useDecor.setState({ sel: [], selectMode: false });
  }
  if (!applying && (s.items !== prev.items || s.furnitureInventory !== prev.furnitureInventory) &&
    prev.mode === 'buy' && s.mode === 'buy' && s.view === 'home' && s.activeHouseId === prev.activeHouseId && !useVisit.getState().current) {
    past.push({ items: prev.items, inv: prev.furnitureInventory });
    if (past.length > HISTORY) past.shift();
    future.length = 0;
    counts();
  }
  if (s.items !== prev.items && useDecor.getState().sel.length) {
    const sel = useDecor.getState().sel.filter((id) => s.items.some((i) => i.id === id));
    if (sel.length !== useDecor.getState().sel.length) useDecor.setState({ sel });
  }
  if (s.placing !== prev.placing) {
    const p = s.placing, q = prev.placing;
    if (!p) {
      grab = { x: 0, z: 0 };
      aimed = false;
      useDecor.setState({ pose: null, err: null, guides: [], extras: [], dragging: false });
      return;
    }
    const fresh = !q || q.type !== p.type || q.moveId !== p.moveId || q.group !== p.group || q.inventoryItemId !== p.inventoryItemId;
    if (fresh && !useDecor.getState().dragging) {
      aimed = false;
      grab = { x: 0, z: 0 };
      const it = p.moveId ? s.items.find((i) => i.id === p.moveId) : undefined;
      useDecor.setState({ pose: it ? poseOf(it) : null, err: null, guides: [], extras: [] });
      if (it) aimAt(null);
      return;
    }
    if (!fresh) aimAt(null);
  }
});
