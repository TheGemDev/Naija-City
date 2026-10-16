// The player's houses, built in code with the place kit (placeKit.tsx): the same model stands on its estate plot
// (three/Estate.tsx), on the city map as "Your House" (places/heritage.tsx Home) and in the House app's pictures
// (three/houseThumbs.tsx). Each design is its own believable Nigerian house:
//   self-con      a low block with a zinc gable roof, a lean-to verandah, louvre windows and a blue drum by the door;
//   bungalow      a hipped roof over a wide body, a projecting front room and a columned porch;
//   executive     a two-storey block beside a single-storey wing, a tall portico and a balcony over it;
//   block of flats three storeys round a glazed stair core, balconies either side, tanks on the flat roof;
//   mansion       two storeys and two wings, a double-height portico under a pediment, a balustraded balcony.
// Around it the compound the owner chose (game/exterior.ts): the fence and gate, paving, roof shape and finish, trim,
// the carport, and what stands in the yard (tank, generator house, security post, trees, beds, gazebo, pool, bar,
// grill). Extensions show outside too: a second floor, the boys' quarters at the back, a balcony, a roof terrace.
// Unfinished houses show their stage: beacons, then the foundation and rods, grey blockwork in scaffolding, the roof.
//
// Everything is merged per colour (Kit): windows are 'glass…' parts and gate lamps 'lamp…' parts, so they light with
// the town at night, and lamp pools and the pool's light are Glow, drawn only after dark. Low performance mode leaves
// out the bars, spikes, paving joints, flowers and small props.

import { BufferGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry } from 'three';
// cityModels before placeKit: placeKit needs its night materials, and cityModels' own imports (trainKit) need placeKit
// finished first. Loading this file first (the House app's pictures) would otherwise start that circle from the wrong end.
import './cityModels';
import { Glow, Kit, prep, scale, type Built, type RGB, type V3 } from './placeKit';
import { exteriorHex, type Exterior } from '../game/exterior';
import { plantTree } from './trees';

/* ---------- Colours ---------- */

const DARK = '#1f2937';
const STEEL = '#64748b';
const STEEL_LIGHT = '#94a3b8';
const WHITE = '#f4f6f8';
const CONCRETE = '#a8a29e';
const CONCRETE_DARK = '#8a847d';
const BLOCK = '#9c9a94';
const BLOCK_DARK = '#86847e';
const PLINTH = '#8f8a80';
const WOOD = '#6b4426';
const WOOD_LIGHT = '#8a5a32';
const DOOR = '#4a2a14';
const LAWN = '#6fa346';
const LAWN_DARK = '#5e8f3a';
const HEDGE = '#2f6b2a';
const LEAF = ['#3f7d2a', '#4d8a34', '#2f6b24'];
const SOIL = '#7a5236';
const LATERITE = '#b9764a';
const GRAVEL = '#b8aa94';
const WATER = '#3aa6c9';
const DECK = '#d9c7a5';
const TANK_BLUE = '#1d4ed8';
const TANK_BLACK = '#1f2328';
const GEN_RED = '#c2281e';
const GEN_GREEN = '#15803d';
const THATCH = '#b08a4a';
const FLOWERS = ['#dc2626', '#facc15', '#ec4899', '#f97316'];
const STONE = ['#a39a8a', '#b4ab9b', '#958c7d'];
const RAZOR = '#4b5563';
const RUST = '#8a4b2a';
const WARM: RGB = [1, 0.78, 0.48];
const POOL_GLOW: RGB = [0.25, 0.75, 1];

/* ---------- Shared shapes ---------- */

const shapes = new Map<string, BufferGeometry>();
const cached = (key: string, make: () => BufferGeometry) => {
  let g = shapes.get(key);
  if (!g) shapes.set(key, (g = prep(make())));
  return g;
};
const LUMP = () => cached('lump', () => new IcosahedronGeometry(1, 0));
const DOME = () => cached('dome', () => new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2));
const CONE = (seg: number) => cached(`cone${seg}`, () => new CylinderGeometry(0, 1, 1, seg));

/* ---------- A pen that draws at an offset ---------- */

/** The kit and glow, drawing everything shifted by (ox, oz): many houses go into one kit on the estate. */
export class HousePen {
  kit: Kit;
  glow: Glow;
  ox = 0;
  oz = 0;
  constructor(kit = new Kit(), glow = new Glow()) {
    this.kit = kit;
    this.glow = glow;
  }
  at(x: number, y: number, z: number): V3 { return [x + this.ox, y, z + this.oz]; }
  box(key: string, p: V3, s: V3, r?: V3) { this.kit.box(key, this.at(p[0], p[1], p[2]), s, r); }
  post(key: string, p: V3, r: number, h: number, seg = 6, taper = 1) { this.kit.post(key, this.at(p[0], p[1], p[2]), r, h, seg, taper); }
  shape(key: string, g: BufferGeometry, p: V3, s: V3, r?: V3) { this.kit.shape(key, g, this.at(p[0], p[1], p[2]), s, r); }
  bar(key: string, a: V3, b: V3, t: number) { this.kit.bar(key, this.at(a[0], a[1], a[2]), this.at(b[0], b[1], b[2]), t); }
  tri(key: string, a: V3, b: V3, c: V3, out: V3) { this.kit.tri(key, this.at(...a), this.at(...b), this.at(...c), out); }
  quad(key: string, a: V3, b: V3, c: V3, d: V3, out: V3) { this.kit.quad(key, this.at(...a), this.at(...b), this.at(...c), this.at(...d), out); }
  flat(key: string, x0: number, z0: number, x1: number, z1: number, y: number) { this.quad(key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]); }
  /** A soft pool of light on the ground, seen after dark. */
  pool(x: number, z: number, r: number, b: number, c: RGB = WARM, y = 0.03) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, e = ((i + 1) / 8) * Math.PI * 2;
      this.glow.tri(this.at(x, y, z), this.at(x + Math.cos(a) * r, y, z + Math.sin(a) * r), this.at(x + Math.cos(e) * r, y, z + Math.sin(e) * r), scale(c, b), [0, 0, 0]);
    }
  }
  done(): Built {
    return { parts: this.kit.build(), glow: this.glow.pos.length ? this.glow.build() : undefined };
  }
}

/* ---------- Roofs ---------- */

/** A hipped roof over a w×d box from eaves height y, rising h, ridge along the longer side. */
function hip(k: HousePen, key: string, cx: number, cz: number, w: number, d: number, y: number, h: number) {
  const hw = w / 2, hd = d / 2;
  const c = (sx: number, sz: number): V3 => [cx + sx * hw, y, cz + sz * hd];
  if (w >= d) {
    const r = hw - hd;
    const ra: V3 = [cx - r, y + h, cz], rb: V3 = [cx + r, y + h, cz];
    k.quad(key, c(-1, 1), c(1, 1), rb, ra, [0, 1, 1]);
    k.quad(key, c(1, -1), c(-1, -1), ra, rb, [0, 1, -1]);
    k.tri(key, c(1, 1), c(1, -1), rb, [1, 1, 0]);
    k.tri(key, c(-1, -1), c(-1, 1), ra, [-1, 1, 0]);
  } else {
    const r = hd - hw;
    const ra: V3 = [cx, y + h, cz - r], rb: V3 = [cx, y + h, cz + r];
    k.quad(key, c(1, 1), c(1, -1), ra, rb, [1, 1, 0]);
    k.quad(key, c(-1, -1), c(-1, 1), rb, ra, [-1, 1, 0]);
    k.tri(key, c(-1, 1), c(1, 1), rb, [0, 1, 1]);
    k.tri(key, c(1, -1), c(-1, -1), ra, [0, 1, -1]);
  }
}

/** A gable roof, ridge along x: two slopes and the gable ends filled in the wall colour. */
function gable(k: HousePen, key: string, wall: string, cx: number, cz: number, w: number, d: number, y: number, h: number) {
  const hw = w / 2, hd = d / 2, o = 0.08;
  k.quad(key, [cx - hw - o, y, cz + hd], [cx + hw + o, y, cz + hd], [cx + hw + o, y + h, cz], [cx - hw - o, y + h, cz], [0, 1, 1]);
  k.quad(key, [cx + hw + o, y, cz - hd], [cx - hw - o, y, cz - hd], [cx - hw - o, y + h, cz], [cx + hw + o, y + h, cz], [0, 1, -1]);
  for (const s of [-1, 1]) k.tri(wall, [cx + s * (hw - 0.01), y, cz - hd + 0.04], [cx + s * (hw - 0.01), y, cz + hd - 0.04], [cx + s * (hw - 0.01), y + h - 0.04, cz], [s, 0, 0]);
}

interface RoofSpec { shape: Exterior['roof']; finish: Exterior['roofFinish']; colour: string; trim: string; wall: string; low: boolean }

/** The finish shows in the lines: ribs down a long-span sheet, courses across tiles, a ridge cap on stone-coated steel. */
function roofLines(k: HousePen, r: RoofSpec, cx: number, cz: number, w: number, d: number, y: number, h: number) {
  if (r.low) return;
  const line = shade(r.colour, r.finish === 'aluminium' ? 1.18 : 0.78);
  const front = cz + d / 2;
  if (r.finish === 'aluminium') {
    // Ribs down the front slope, from eaves towards the ridge.
    const n = Math.max(3, Math.round(w / 0.18));
    for (let i = 1; i < n; i++) {
      const x = cx - w / 2 + (i / n) * w;
      const inset = Math.max(0, Math.abs(x - cx) - (w / 2 - d / 2));
      const t = Math.min(1, 1 - inset / (d / 2));
      if (t <= 0.05) continue;
      k.bar(line, [x, y + 0.012, front + 0.005], [x, y + h * t + 0.01, front - (d / 2) * t + 0.005], 0.012);
    }
  } else {
    // Courses across the front slope.
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const half = w / 2 - (d / 2) * t;
      if (half <= 0.05) continue;
      k.box(line, [cx, y + h * t + 0.012, front - (d / 2) * t + 0.01], [half * 2, 0.012, 0.02]);
    }
  }
  if (r.finish !== 'aluminium' && w > d) k.box(shade(r.colour, 0.6), [cx, y + h + 0.01, cz], [Math.max(0.05, w - d) + 0.04, 0.03, 0.05]);
}

/** One roof over a box, in the shape chosen (a flat deck has a parapet; stepped is hips over hips). */
function roof(k: HousePen, r: RoofSpec, cx: number, cz: number, w: number, d: number, y: number) {
  const ow = w + 0.16, od = d + 0.16, h = Math.min(0.55, d * 0.36);
  const key = r.colour;
  // The fascia board round the eaves, in the trim colour.
  if (r.shape !== 'flat') k.box(r.trim, [cx, y - 0.02, cz], [ow + 0.01, 0.05, od + 0.01]);
  if (r.shape === 'flat') {
    k.box('#d6d0c4', [cx, y + 0.04, cz], [w + 0.04, 0.08, d + 0.04]);
    k.box(CONCRETE_DARK, [cx, y + 0.085, cz], [w - 0.1, 0.01, d - 0.1]);
    const p = 0.16;
    for (const [px, pz, sx, sz] of [[cx, cz + d / 2, w + 0.04, 0.05], [cx, cz - d / 2, w + 0.04, 0.05], [cx - w / 2, cz, 0.05, d], [cx + w / 2, cz, 0.05, d]] as const)
      k.box(r.wall, [px, y + 0.08 + p / 2, pz], [sx, p, sz]);
    for (const [px, pz, sx, sz] of [[cx, cz + d / 2, w + 0.08, 0.07], [cx, cz - d / 2, w + 0.08, 0.07], [cx - w / 2, cz, 0.07, d + 0.04], [cx + w / 2, cz, 0.07, d + 0.04]] as const)
      k.box(r.trim, [px, y + 0.08 + p + 0.015, pz], [sx, 0.03, sz]);
    return;
  }
  if (r.shape === 'gable') {
    gable(k, key, r.wall, cx, cz, ow, od, y, h);
    return;
  }
  if (r.shape === 'stepped') {
    // A low skirt roof all round, a short wall of the upper storey's colour, then a steeper hip on top.
    const lip = 0.18;
    hipSkirt(k, key, cx, cz, ow, od, y, lip, 0.14);
    k.box(r.wall, [cx, y + 0.14 + 0.06, cz], [ow - 2 * lip, 0.12, od - 2 * lip]);
    hip(k, key, cx, cz, ow - 2 * lip + 0.1, od - 2 * lip + 0.1, y + 0.26, h * 0.9);
    roofLines(k, r, cx, cz, ow - 2 * lip + 0.1, od - 2 * lip + 0.1, y + 0.26, h * 0.9);
    return;
  }
  hip(k, key, cx, cz, ow, od, y, h);
  roofLines(k, r, cx, cz, ow, od, y, h);
}

/** A sloping band round a box: the lower skirt of a stepped roof. */
function hipSkirt(k: HousePen, key: string, cx: number, cz: number, w: number, d: number, y: number, inset: number, h: number) {
  const hw = w / 2, hd = d / 2, iw = hw - inset, id = hd - inset;
  k.quad(key, [cx - hw, y, cz + hd], [cx + hw, y, cz + hd], [cx + iw, y + h, cz + id], [cx - iw, y + h, cz + id], [0, 1, 1]);
  k.quad(key, [cx + hw, y, cz - hd], [cx - hw, y, cz - hd], [cx - iw, y + h, cz - id], [cx + iw, y + h, cz - id], [0, 1, -1]);
  k.quad(key, [cx + hw, y, cz + hd], [cx + hw, y, cz - hd], [cx + iw, y + h, cz - id], [cx + iw, y + h, cz + id], [1, 1, 0]);
  k.quad(key, [cx - hw, y, cz - hd], [cx - hw, y, cz + hd], [cx - iw, y + h, cz + id], [cx - iw, y + h, cz - id], [-1, 1, 0]);
}

/* ---------- Walls, windows, doors ---------- */

/** Darker or lighter version of a hex colour (for lines and shadows that read on any paint). */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

let paneNo = 0;
/** A window on a face (front +z or a side ±x): glass, a frame and sill in the trim colour, burglar-proof bars. */
function windowAt(k: HousePen, x: number, y: number, z: number, face: 'front' | 'left' | 'right', w: number, h: number, trim: string, low: boolean, louvre = false) {
  const g = `glass${paneNo++ % 4}`;
  const t = 0.022;
  if (face === 'front') {
    k.box(trim, [x, y, z + 0.004], [w + 0.06, h + 0.06, 0.02]);
    k.box(g, [x, y, z + 0.012], [w, h, t]);
    k.box(trim, [x, y - h / 2 - 0.025, z + 0.03], [w + 0.1, 0.03, 0.05]);
    if (!low) {
      if (louvre) for (let i = 1; i < 5; i++) k.box(STEEL_LIGHT, [x, y - h / 2 + (i * h) / 5, z + 0.026], [w, 0.008, 0.012]);
      else for (let i = 1; i < 4; i++) k.box(DARK, [x - w / 2 + (i * w) / 4, y, z + 0.03], [0.01, h, 0.008]);
    }
  } else {
    const s = face === 'right' ? 1 : -1;
    k.box(trim, [x + s * 0.004, y, z], [0.02, h + 0.06, w + 0.06]);
    k.box(g, [x + s * 0.012, y, z], [t, h, w]);
    if (!low) for (let i = 1; i < 4; i++) k.box(DARK, [x + s * 0.03, y, z - w / 2 + (i * w) / 4], [0.008, h, 0.01]);
  }
}

/** A front door: the frame in trim, a panelled steel-and-wood leaf, a step and a light over it. */
function doorAt(k: HousePen, x: number, z: number, fh: number, trim: string, wide = false, y0 = 0.06) {
  const w = wide ? 0.34 : 0.22, h = Math.min(0.5, fh * 0.68);
  k.box(trim, [x, y0 + h / 2 + 0.02, z + 0.004], [w + 0.06, h + 0.06, 0.02]);
  k.box(DOOR, [x, y0 + h / 2, z + 0.014], [w, h, 0.02]);
  k.box(shade(DOOR, 1.4), [x, y0 + h * 0.62, z + 0.026], [w * 0.7, h * 0.3, 0.008]);
  if (wide) k.box(DARK, [x, y0 + h / 2, z + 0.026], [0.012, h, 0.01]);
  k.box(CONCRETE, [x, y0 / 2, z + 0.08], [w + 0.16, y0, 0.16]);
  k.box('lamp2', [x, y0 + h + 0.07, z + 0.03], [0.05, 0.035, 0.035]);
  k.pool(x, z + 0.3, 0.42, 0.22);
}

/** A row of windows along a front face from x0 to x1, skipping where the door is. */
function frontWindows(k: HousePen, x0: number, x1: number, z: number, y: number, trim: string, low: boolean, skip: number[] = [], w = 0.24, h = 0.24, louvre = false) {
  const n = Math.max(1, Math.round((x1 - x0) / 0.5));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
    if (skip.some((s) => Math.abs(s - x) < 0.24)) continue;
    windowAt(k, x, y, z, 'front', w, h, trim, low, louvre);
  }
}

/** A storey-tall block of wall with its plinth. */
function body(k: HousePen, wall: string, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, plinth = true) {
  k.box(wall, [(x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2], [x1 - x0, h, z1 - z0]);
  if (plinth && y0 < 0.1) k.box(PLINTH, [(x0 + x1) / 2, 0.05, (z0 + z1) / 2], [x1 - x0 + 0.05, 0.1, z1 - z0 + 0.05]);
}

/** Railings: a top rail and balusters from a to b at height y. */
function railing(k: HousePen, ax: number, az: number, bx: number, bz: number, y: number, h: number, colour: string, low: boolean, step = 0.08) {
  k.bar(colour, [ax, y + h, az], [bx, y + h, bz], 0.02);
  if (low) {
    k.box(colour, [(ax + bx) / 2, y + h / 2, (az + bz) / 2], [Math.abs(bx - ax) + 0.01, h * 0.7, Math.abs(bz - az) + 0.01]);
    return;
  }
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) k.post(colour, [ax + ((bx - ax) * i) / n, y, az + ((bz - az) * i) / n], 0.008, h, 4);
}

/* ---------- The look ---------- */

export interface HouseLook {
  /** Design id; null is the government starter house. */
  design: string | null;
  /** Stages done (game/property.ts STAGES.length = finished); a design-less plot is bare land. */
  stage: number;
  /** Builders on site right now. */
  building?: boolean;
  /** Outside walls (the owner's paint, else the design's own). */
  wall: string;
  ext: Exterior;
  extensions: string[];
  plot: 'half' | 'full' | 'double';
  /** Colours of cars parked under the carport, if any. */
  cars?: string[];
  /** Picks small variations (which side the tank stands, the flowers). */
  seed: number;
}

/** Where to draw: the yard w×d centred on (0,0), the house box within it, a storey's height. */
export interface HouseFrame {
  w: number;
  d: number;
  house: { x0: number; z0: number; x1: number; z1: number };
  fh: number;
  /** Leave out the compound wall (the map home has the town's own verge round it). */
  noFence?: boolean;
}

/** The default wall colour of each design, when the owner hasn't painted it. */
export const DESIGN_WALL: Record<string, string> = {
  starter: '#efe3c6', selfcon: '#e9d6b4', bungalow: '#f1e4c8', duplex: '#f4efe4', flats: '#e8e0cc', mansion: '#f3ead8',
};

const FINISHED = 4;

/** Draws one whole plot: the compound and the house as it stands. */
export function drawHouse(k: HousePen, look: HouseLook, f: HouseFrame, low: boolean) {
  const hw = f.w / 2, hd = f.d / 2;
  const { x0, z0, x1, z1 } = f.house;
  if (!look.design || look.stage <= 0) return drawBareLand(k, f, look, low);
  const done = look.stage >= FINISHED;
  if (!done) return drawSite(k, look, f, low);
  const e = look.ext;
  const trim = exteriorHex(e.trim, WHITE);
  const fence = exteriorHex(e.fenceColour, '#e6dcc6');
  const gateC = exteriorHex(e.gateColour, DARK);
  const roofC = exteriorHex(e.roofColour, '#7c2d12');
  const r: RoofSpec = { shape: e.roof, finish: e.roofFinish, colour: roofFinishShade(roofC, e.roofFinish), trim, wall: look.wall, low };
  const items = new Set(e.items);

  // The yard: paving over the whole compound, the drive and lawns on it.
  drawPaving(k, e.paving, -hw + 0.06, -hd + 0.06, hw - 0.06, hd - 0.06, low);
  if (items.has('lawn')) {
    k.flat(LAWN, -hw + 0.12, z1 + 0.25, -0.42, hd - 0.15, 0.016);
    k.flat(LAWN, x1 + 0.08, -hd + 0.12, hw - 0.12, z0 + (z1 - z0) * 0.5, 0.016);
    if (!low) k.flat(LAWN_DARK, -hw + 0.12, z1 + 0.25, -0.42, z1 + 0.29, 0.018);
  }
  if (items.has('garden')) {
    const n = low ? 0 : 6;
    k.flat(SOIL, x0 + 0.02, z1 + 0.04, x1 - 0.02, z1 + 0.14, 0.018);
    for (let i = 0; i < n; i++) {
      const x = x0 + 0.1 + (i * (x1 - x0 - 0.2)) / Math.max(1, n - 1);
      k.shape(LEAF[i % 3], LUMP(), [x, 0.05, z1 + 0.09], [0.06, 0.05, 0.05]);
      k.box(FLOWERS[(i + look.seed) % FLOWERS.length], [x, 0.09, z1 + 0.1], [0.04, 0.03, 0.04]);
    }
  }

  // The house itself.
  drawDesign(k, look, f, r, trim, low);

  // Extensions outside the main house: the boys' quarters at the back corner.
  if (look.extensions.includes('bq')) {
    const bx = look.design === 'flats' ? -hw + 0.45 : hw - 0.42, bz = -hd + 0.32;
    body(k, look.wall, bx - 0.3, bz - 0.2, bx + 0.3, bz + 0.2, 0, 0.5);
    roof(k, { ...r, shape: r.shape === 'flat' || r.shape === 'stepped' ? 'hipped' : r.shape }, bx, bz, 0.6, 0.4, 0.5);
    doorAt(k, bx - 0.12, bz + 0.2, 0.6, trim);
    windowAt(k, bx + 0.14, 0.32, bz + 0.2, 'front', 0.16, 0.14, trim, low, true);
  }

  // Compound wall and gate.
  if (!f.noFence) drawFence(k, e, fence, gateC, trim, hw, hd, low);

  // What stands in the yard. The strip beside the house carries the services (tank at the back, the generator in
  // front of it), the other side and the front yard the trees, the pool or gazebo, the carport by the gate.
  const right = hw - x1, left = x0 + hw, behind = z0 + hd;
  const sx = right >= left ? 1 : -1;
  const strip = sx > 0 ? (x1 + hw) / 2 : (x0 - hw) / 2;
  const stripW = Math.max(right, left);
  const flats = look.design === 'flats', big = look.design === 'mansion' || flats;
  if (items.has('tank')) {
    if (flats) drawTank(k, (x0 + x1) / 2 + (x1 - x0) * 0.25, z0 + (z1 - z0) * 0.35, true, low, f.fh * 3 + 0.17);
    else if (behind > 0.55) drawTank(k, sx * (hw - 0.35), -hd + 0.3, big, low);
    else drawTank(k, strip, z0 + 0.3, big, low);
  }
  if (items.has('genhouse')) drawGenHouse(k, stripW > 0.8 ? strip : sx * (hw - 0.35), behind > 0.55 && !items.has('tank') ? -hd + 0.3 : z0 + (stripW > 0.8 ? 0.95 : 0.3) + (behind > 0.55 ? -0.3 : 0), big, low);
  else if (!low && look.design !== 'starter') {
    // No generator house: the "I better pass my neighbour" set under the window.
    k.box(GEN_RED, [x1 - 0.12, 0.07, z1 + 0.14], [0.16, 0.12, 0.1]);
  }
  if (items.has('security') && !f.noFence) drawSecurity(k, hw, hd, low);
  if (items.has('palm')) for (const s of [-1, 1]) drawPalm(k, s * 0.62, hd - 0.28, 0.9 + (s > 0 ? 0.1 : 0), low);
  const otherW = Math.min(right, left);
  if (items.has('mango')) {
    if (behind > 0.55) drawMango(k, -sx * (hw - 0.45), -hd + 0.45, 0.75, low);
    else if (otherW > 0.5) drawMango(k, -sx * (hw - otherW / 2), z0 + 0.5, 0.7, low);
    else drawMango(k, sx * (hw - 0.35), z1 - 0.2, 0.65, low);
  }
  const front = hd - z1;
  if (items.has('pool') && look.plot !== 'half' && front > 0.7) drawPool(k, -hw + 0.14, z1 + 0.3, -0.52, hd - 0.18, low);
  else if (items.has('pool') && look.plot !== 'half') drawPool(k, strip - stripW / 2 + 0.12, z0 + 0.15, strip + stripW / 2 - 0.12, z1 - 0.2, low);
  else if (items.has('gazebo')) drawGazebo(k, front > 0.7 ? -hw + 0.5 : strip, front > 0.7 ? z1 + front * 0.5 : z1 - 0.3, low);
  if (items.has('bar') && !low) drawBar(k, strip, z1 - 0.15, low);
  if (items.has('grill') && !low) drawGrill(k, otherW > 0.4 ? -sx * (hw - otherW / 2) : -hw + 0.3, z1 + 0.25);
  const carX = Math.min(hw - 0.4, 0.62);
  if (items.has('carport')) drawCarport(k, e.carport, exteriorHex(e.carportColour, STEEL_LIGHT), carX, Math.max(z1 + 0.42, hd - 0.55), look.cars ?? [], low);
  else for (const c of (look.cars ?? []).slice(0, 1)) drawCar(k, carX, hd - 0.5, c, low);

  // A DSTV dish catches the light on most roofs.
  if (!low && look.design !== 'flats') {
    const top = f.fh * storeysFor(look);
    k.post('#e5e7eb', [x1 - 0.2, top + 0.02, z1 - 0.1], 0.1, 0.04, 8, 1.4);
    k.box(DARK, [x1 - 0.2, top + 0.08, z1 - 0.07], [0.015, 0.08, 0.015]);
  }
}

const roofFinishShade = (c: string, finish: Exterior['roofFinish']) => (finish === 'stone' ? shade(c, 0.86) : finish === 'tile' ? shade(c, 0.95) : c);

const storeysFor = (look: HouseLook) =>
  look.design === 'flats' ? 3 : look.design === 'mansion' || look.design === 'duplex' || look.extensions.includes('floor2') ? 2 : 1;

/* ---------- The designs ---------- */

function drawDesign(k: HousePen, look: HouseLook, f: HouseFrame, r: RoofSpec, trim: string, low: boolean) {
  const { x0, z0, x1, z1 } = f.house;
  const fh = f.fh;
  const wall = look.wall;
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const up = look.extensions.includes('floor2');
  const balcony = look.extensions.includes('balcony');
  const terrace = look.extensions.includes('terrace') && r.shape === 'flat';
  switch (look.design) {
    case 'selfcon': {
      // A low block, a zinc lean-to over a verandah, two louvre windows, a blue drum by the door.
      const bw = W * 0.92, bd = D * 0.72;
      const bx0 = cx - bw / 2, bz0 = z0, bz1 = z0 + bd;
      const floors = up ? 2 : 1;
      body(k, wall, bx0, bz0, bx0 + bw, bz1, 0, fh * floors);
      if (up) k.box(trim, [cx, fh, bz1 + 0.01], [bw + 0.02, 0.04, 0.03]);
      roof(k, r, cx, (bz0 + bz1) / 2, bw, bd, fh * floors);
      // The verandah: a slab, two posts and a sloping zinc sheet.
      k.box(CONCRETE, [cx, 0.04, bz1 + 0.18], [bw * 0.9, 0.08, 0.36]);
      for (const s of [-1, 1]) k.post(WOOD, [cx + s * bw * 0.4, 0.08, bz1 + 0.32], 0.018, fh * 0.78, 5);
      k.box(shade(r.colour, 1.05), [cx, fh * 0.86, bz1 + 0.18], [bw * 0.95, 0.025, 0.46], [0.22, 0, 0]);
      doorAt(k, cx - bw * 0.18, bz1, fh, trim);
      windowAt(k, cx + bw * 0.22, fh * 0.52, bz1, 'front', 0.24, 0.2, trim, low, true);
      windowAt(k, bx0 + 0.16, fh * 0.52, bz1, 'front', 0.18, 0.2, trim, low, true);
      windowAt(k, bx0 + bw, fh * 0.52, cz - 0.1, 'right', 0.2, 0.18, trim, low, true);
      if (up) frontWindows(k, bx0 + 0.1, bx0 + bw - 0.1, bz1, fh * 1.52, trim, low, [], 0.22, 0.2, true);
      if (!low) {
        k.post(TANK_BLUE, [cx - bw * 0.4, 0.06, bz1 + 0.12], 0.06, 0.16, 8);
        k.box('#e2e8f0', [cx + bw * 0.05, 0.12, bz1 + 0.24], [0.1, 0.02, 0.1]);
        k.box('#e2e8f0', [cx + bw * 0.05, 0.18, bz1 + 0.2], [0.1, 0.1, 0.02]);
      }
      upperExtras(k, cx, bz1, bw, fh, up ? 2 : 1, wall, trim, balcony, terrace, low);
      break;
    }
    case 'bungalow': {
      // A wide hipped body, a front room pushed forward on the left with its own hip, a columned porch on the right.
      const bd = D * 0.78;
      const floors = up ? 2 : 1;
      body(k, wall, x0, z0, x1, z0 + bd, 0, fh * floors);
      const pw = W * 0.38, px0 = x0, pz1 = z0 + bd + 0.32;
      body(k, wall, px0, z0 + bd - 0.05, px0 + pw, pz1, 0, fh);
      if (up) k.box(trim, [cx, fh, z0 + bd + 0.01], [W + 0.02, 0.04, 0.03]);
      roof(k, r, cx, z0 + bd / 2, W, bd, fh * floors);
      roof(k, { ...r, shape: r.shape === 'gable' ? 'gable' : 'hipped' }, px0 + pw / 2, z0 + bd + 0.13, pw, 0.4, fh);
      windowAt(k, px0 + pw / 2, fh * 0.52, pz1, 'front', 0.34, 0.26, trim, low);
      windowAt(k, x0, fh * 0.52, z0 + bd * 0.5, 'left', 0.26, 0.24, trim, low);
      windowAt(k, x1, fh * 0.52, z0 + bd * 0.5, 'right', 0.26, 0.24, trim, low);
      // The porch: slab, steps, two round columns and a flat roof slab.
      const dx = px0 + pw + (x1 - px0 - pw) * 0.35;
      k.box(CONCRETE, [dx + 0.1, 0.05, z0 + bd + 0.2], [0.8, 0.1, 0.4]);
      for (const s of [-1, 1]) k.post(WHITE, [dx + 0.1 + s * 0.32, 0.1, z0 + bd + 0.36], 0.03, fh * 0.86 - 0.1, 8);
      k.box(trim, [dx + 0.1, fh * 0.88, z0 + bd + 0.2], [0.86, 0.06, 0.48]);
      doorAt(k, dx, z0 + bd, fh, trim);
      frontWindows(k, dx + 0.28, x1 - 0.05, z0 + bd, fh * 0.52, trim, low, [], 0.26, 0.24);
      if (up) frontWindows(k, x0 + 0.1, x1 - 0.1, z0 + bd, fh * 1.52, trim, low);
      upperExtras(k, cx, z0 + bd, W, fh, floors, wall, trim, balcony, terrace, low);
      break;
    }
    case 'duplex': {
      // Executive duplex: two storeys on the left, a one-storey wing on the right, a tall portico, a balcony over it.
      const mw = W * 0.62, mx1 = x0 + mw, bd = D * 0.8;
      const wingFloors = up ? 2 : 1;
      body(k, wall, x0, z0, mx1, z0 + bd, 0, fh * 2);
      body(k, wall, mx1 - 0.02, z0 + 0.1, x1, z0 + bd - 0.05, 0, fh * wingFloors);
      k.box(trim, [x0 + mw / 2, fh, z0 + bd + 0.01], [mw + 0.02, 0.05, 0.04]);
      roof(k, r, x0 + mw / 2, z0 + bd / 2, mw, bd, fh * 2);
      roof(k, r, (mx1 + x1) / 2, z0 + 0.1 + (bd - 0.15) / 2, x1 - mx1, bd - 0.15, fh * wingFloors);
      // Portico: two tall columns, a deck at first-floor level that is the balcony.
      const px = x0 + mw * 0.55;
      k.box(CONCRETE, [px, 0.05, z0 + bd + 0.24], [0.66, 0.1, 0.48]);
      for (const s of [-1, 1]) k.post(WHITE, [px + s * 0.26, 0.1, z0 + bd + 0.42], 0.035, fh - 0.1, 10);
      k.box(trim, [px, fh + 0.02, z0 + bd + 0.24], [0.7, 0.06, 0.52]);
      railing(k, px - 0.33, z0 + bd + 0.49, px + 0.33, z0 + bd + 0.49, fh + 0.05, 0.16, trim, low);
      doorAt(k, px, z0 + bd, fh, trim, true);
      k.box('glass1', [px, fh + 0.3, z0 + bd + 0.012], [0.3, 0.38, 0.022]);
      frontWindows(k, x0 + 0.05, px - 0.2, z0 + bd, fh * 0.52, trim, low, [], 0.24, 0.26);
      frontWindows(k, x0 + 0.05, px - 0.2, z0 + bd, fh * 1.52, trim, low, [], 0.24, 0.26);
      frontWindows(k, px + 0.2, mx1 - 0.02, z0 + bd, fh * 1.52, trim, low, [], 0.22, 0.26);
      // The wing: wide windows, and upstairs too once a second floor goes on.
      frontWindows(k, mx1 + 0.05, x1 - 0.05, z0 + bd - 0.05, fh * 0.52, trim, low, [], 0.3, 0.26);
      if (up) frontWindows(k, mx1 + 0.05, x1 - 0.05, z0 + bd - 0.05, fh * 1.52, trim, low, [], 0.3, 0.26);
      windowAt(k, x0, fh * 1.5, z0 + bd * 0.5, 'left', 0.26, 0.26, trim, low);
      if (balcony) {
        k.box(trim, [(mx1 + x1) / 2, fh + 0.02, z0 + bd + 0.12], [x1 - mx1 - 0.05, 0.05, 0.3]);
        railing(k, mx1 + 0.03, z0 + bd + 0.26, x1 - 0.03, z0 + bd + 0.26, fh + 0.04, 0.15, trim, low);
      }
      if (terrace) terraceOn(k, (mx1 + x1) / 2, z0 + bd / 2, x1 - mx1 - 0.2, bd - 0.3, fh * wingFloors + 0.1, low);
      break;
    }
    case 'flats': {
      // Three storeys round a glazed stair core, balconies to each flat, a flat roof with tanks and dishes.
      const bd = D * 0.82, floors = 3;
      const top = fh * floors;
      body(k, wall, x0, z0, x1, z0 + bd, 0, top);
      for (let i = 1; i < floors; i++) k.box(trim, [cx, fh * i, z0 + bd + 0.01], [W + 0.03, 0.05, 0.04]);
      roof(k, { ...r, shape: r.shape === 'gable' ? 'gable' : r.shape === 'flat' ? 'flat' : r.shape }, cx, z0 + bd / 2, W, bd, top);
      // The stair core: a tower a little proud of the front, a strip of glass louvres up it.
      const sw = 0.36;
      body(k, shade(wall, 0.94), cx - sw / 2, z0 + bd - 0.05, cx + sw / 2, z0 + bd + 0.14, 0, top + 0.14);
      for (let i = 0; i < floors; i++) k.box(`glass${i % 4}`, [cx, fh * i + fh * 0.58, z0 + bd + 0.152], [0.16, fh * 0.6, 0.02]);
      doorAt(k, cx, z0 + bd + 0.14, fh, trim, true);
      for (const s of [-1, 1]) {
        const bx = cx + s * (W / 4 + sw / 4);
        const bwid = W / 2 - sw / 2 - 0.2;
        for (let i = 0; i < floors; i++) {
          const y = fh * i;
          windowAt(k, bx - s * bwid * 0.22, y + fh * 0.52, z0 + bd, 'front', 0.22, 0.24, trim, low);
          if (i > 0) {
            // A balcony slab and its rail for this flat.
            k.box(CONCRETE, [bx + s * bwid * 0.18, y + 0.03, z0 + bd + 0.15], [bwid * 0.55, 0.05, 0.3]);
            railing(k, bx + s * bwid * 0.18 - bwid * 0.27, z0 + bd + 0.29, bx + s * bwid * 0.18 + bwid * 0.27, z0 + bd + 0.29, y + 0.05, 0.14, trim, low);
            k.box('glass2', [bx + s * bwid * 0.18, y + fh * 0.45, z0 + bd + 0.012], [0.2, fh * 0.62, 0.022]);
          } else {
            windowAt(k, bx + s * bwid * 0.22, y + fh * 0.52, z0 + bd, 'front', 0.22, 0.24, trim, low);
          }
          if (!low) k.box('#e5e7eb', [bx + s * bwid * 0.45, y + fh * 0.75, z0 + bd + 0.04], [0.14, 0.09, 0.07]);
        }
        windowAt(k, s > 0 ? x1 : x0, fh * 1.5, z0 + bd * 0.5, s > 0 ? 'right' : 'left', 0.24, 0.24, trim, low);
      }
      if (!low) for (const s of [-1, 1]) {
        k.post('#e5e7eb', [cx + s * W * 0.3, top + 0.24, z0 + bd - 0.15], 0.09, 0.035, 8, 1.4);
      }
      if (terrace) terraceOn(k, cx + W * 0.22, z0 + bd * 0.45, W * 0.4, bd * 0.6, top + 0.1, low);
      break;
    }
    case 'mansion': {
      // Two storeys: a centre block between wings set back, a double-height portico under a pediment.
      const cw = W * 0.46, bd = D * 0.78;
      const cx0 = cx - cw / 2, cx1 = cx + cw / 2;
      body(k, wall, cx0, z0, cx1, z0 + bd + 0.12, 0, fh * 2);
      for (const s of [-1, 1]) {
        const wx0 = s < 0 ? x0 : cx1 - 0.02, wx1 = s < 0 ? cx0 + 0.02 : x1;
        body(k, wall, wx0, z0 + 0.04, wx1, z0 + bd - 0.04, 0, fh * 2);
        roof(k, r, (wx0 + wx1) / 2, z0 + 0.04 + (bd - 0.08) / 2, wx1 - wx0, bd - 0.08, fh * 2);
        frontWindows(k, wx0 + 0.04, wx1 - 0.04, z0 + bd - 0.04, fh * 0.52, trim, low, [], 0.24, 0.3);
        frontWindows(k, wx0 + 0.04, wx1 - 0.04, z0 + bd - 0.04, fh * 1.52, trim, low, [], 0.24, 0.3);
        windowAt(k, s < 0 ? x0 : x1, fh * 1.5, z0 + bd * 0.5, s < 0 ? 'left' : 'right', 0.28, 0.3, trim, low);
        windowAt(k, s < 0 ? x0 : x1, fh * 0.5, z0 + bd * 0.5, s < 0 ? 'left' : 'right', 0.28, 0.3, trim, low);
      }
      k.box(trim, [cx, fh, z0 + bd + 0.13], [cw + 0.02, 0.05, 0.03]);
      roof(k, { ...r, shape: r.shape === 'flat' ? 'flat' : 'hipped' }, cx, z0 + (bd + 0.12) / 2, cw, bd + 0.12, fh * 2);
      // The portico: four columns two storeys high, an entablature and a pediment.
      const pz = z0 + bd + 0.12, depth = 0.46, top = fh * 2;
      k.box(CONCRETE, [cx, 0.06, pz + depth / 2], [cw * 0.9, 0.12, depth]);
      if (!low) k.box(CONCRETE_DARK, [cx, 0.03, pz + depth + 0.08], [cw * 0.6, 0.06, 0.16]);
      for (let i = 0; i < 4; i++) {
        const x = cx - cw * 0.38 + (i * cw * 0.76) / 3;
        k.post(WHITE, [x, 0.12, pz + depth - 0.06], 0.04, top - 0.18, 10);
        k.box(trim, [x, 0.14, pz + depth - 0.06], [0.11, 0.04, 0.11]);
        k.box(trim, [x, top - 0.08, pz + depth - 0.06], [0.11, 0.05, 0.11]);
      }
      k.box(trim, [cx, top - 0.02, pz + depth / 2], [cw * 0.92, 0.1, depth + 0.04]);
      const pw = cw * 0.92 / 2, py = top + 0.03, ph = 0.3;
      k.tri(WHITE, [cx - pw, py, pz + depth + 0.02], [cx + pw, py, pz + depth + 0.02], [cx, py + ph, pz + depth + 0.02], [0, 0, 1]);
      k.quad(r.colour, [cx - pw - 0.03, py, pz + depth + 0.04], [cx, py + ph + 0.02, pz + depth + 0.04], [cx, py + ph + 0.02, pz - 0.02], [cx - pw - 0.03, py, pz - 0.02], [-0.6, 1, 0]);
      k.quad(r.colour, [cx, py + ph + 0.02, pz + depth + 0.04], [cx + pw + 0.03, py, pz + depth + 0.04], [cx + pw + 0.03, py, pz - 0.02], [cx, py + ph + 0.02, pz - 0.02], [0.6, 1, 0]);
      // A balcony across the portico at first-floor level, and the big doors under it.
      k.box(trim, [cx, fh + 0.02, pz + 0.16], [cw * 0.7, 0.05, 0.32]);
      railing(k, cx - cw * 0.35, pz + 0.31, cx + cw * 0.35, pz + 0.31, fh + 0.04, 0.15, trim, low, 0.06);
      doorAt(k, cx, pz, fh, trim, true);
      k.box('glass0', [cx, fh + 0.3, pz + 0.012], [0.4, 0.4, 0.022]);
      for (const s of [-1, 1]) windowAt(k, cx + s * cw * 0.33, fh * 0.52, pz, 'front', 0.22, 0.32, trim, low);
      for (const s of [-1, 1]) windowAt(k, cx + s * cw * 0.33, fh * 1.52, pz, 'front', 0.22, 0.32, trim, low);
      // Lamps on the portico columns and a pool of light on the steps.
      for (const s of [-1, 1]) k.box(`lamp${s > 0 ? 1 : 3}`, [cx + s * cw * 0.38, fh * 0.7, pz + depth - 0.0], [0.05, 0.07, 0.05]);
      k.pool(cx, pz + depth + 0.2, 0.7, 0.3);
      if (terrace) terraceOn(k, cx, z0 + bd / 2, cw - 0.2, bd - 0.2, top + 0.1, low);
      break;
    }
    default: {
      // The government starter house: a small hipped bungalow with a little porch.
      const bd = D * 0.8;
      body(k, wall, x0, z0, x1, z0 + bd, 0, fh);
      roof(k, r, cx, z0 + bd / 2, W, bd, fh);
      doorAt(k, cx, z0 + bd, fh, trim);
      k.box(shade(r.colour, 1.05), [cx, fh * 0.86, z0 + bd + 0.14], [0.5, 0.03, 0.3], [0.2, 0, 0]);
      frontWindows(k, x0 + 0.05, x1 - 0.05, z0 + bd, fh * 0.52, trim, low, [cx]);
    }
  }
}

/** On top of a house that has gone up a floor or more: the balcony across the front, the roof terrace. */
function upperExtras(k: HousePen, cx: number, front: number, w: number, fh: number, floors: number, _wall: string, trim: string, balcony: boolean, terrace: boolean, low: boolean) {
  if (balcony && floors >= 2) {
    k.box(trim, [cx, fh + 0.02, front + 0.14], [w * 0.5, 0.05, 0.3]);
    railing(k, cx - w * 0.25, front + 0.28, cx + w * 0.25, front + 0.28, fh + 0.04, 0.15, trim, low);
  }
  if (terrace) terraceOn(k, cx, front - 0.5, w * 0.6, 0.6, fh * floors + 0.1, low);
}

/** A roof terrace: tiles on the deck, a rail round it, a parasol and two chairs. */
function terraceOn(k: HousePen, cx: number, cz: number, w: number, d: number, y: number, low: boolean) {
  k.flat('#c7a98a', cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y - 0.005);
  railing(k, cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2, y, 0.14, STEEL_LIGHT, low);
  k.post(WHITE, [cx, y, cz], 0.012, 0.32, 4);
  k.shape('#dc2626', CONE(8), [cx, y + 0.34, cz], [0.22, 0.08, 0.22]);
  if (!low) for (const s of [-1, 1]) k.box(WHITE, [cx + s * 0.16, y + 0.05, cz + 0.08], [0.08, 0.1, 0.08]);
}

/* ---------- The compound ---------- */

function drawPaving(k: HousePen, paving: Exterior['paving'], x0: number, z0: number, x1: number, z1: number, low: boolean) {
  if (paving === 'gravel') {
    k.flat(LATERITE, x0, z0, x1, z1, 0.012);
    if (!low) for (let i = 0; i < 18; i++) {
      const x = x0 + ((i * 0.618) % 1) * (x1 - x0), z = z0 + ((i * 0.382 + 0.17) % 1) * (z1 - z0);
      k.box(GRAVEL, [x, 0.016, z], [0.05, 0.008, 0.04]);
    }
    return;
  }
  const base = paving === 'checker' ? '#c9c1b1' : paving === 'herringbone' ? '#b7a58c' : '#b9b2a6';
  k.flat(base, x0, z0, x1, z1, 0.012);
  if (low) return;
  const line = paving === 'herringbone' ? '#9e8c74' : '#a39b8e';
  if (paving === 'interlock') {
    for (let z = z0 + 0.2; z < z1; z += 0.2) k.flat(line, x0, z - 0.005, x1, z + 0.005, 0.014);
  } else if (paving === 'herringbone') {
    for (let x = x0 + 0.18; x < x1; x += 0.18) k.flat(line, x - 0.004, z0, x + 0.004, z1, 0.014);
    for (let z = z0 + 0.36; z < z1; z += 0.36) k.flat(line, x0, z - 0.004, x1, z + 0.004, 0.014);
  } else {
    const s = 0.3;
    for (let x = x0, i = 0; x < x1 - 0.01; x += s, i++) for (let z = z0, j = 0; z < z1 - 0.01; z += s, j++) if ((i + j) % 2) k.flat('#8f877a', x, z, Math.min(x1, x + s), Math.min(z1, z + s), 0.014);
  }
}

function drawFence(k: HousePen, e: Exterior, colour: string, gateC: string, trim: string, hw: number, hd: number, low: boolean) {
  const style = e.fence;
  const FH = style === 'stone' ? 0.7 : style === 'hedge' ? 0.36 : 0.55;
  const T = 0.08;
  const gate = 0.9;
  const inset = 0.08;
  const X = hw - inset, Z = hd - inset;
  const runs: [number, number, number, number][] = [
    [-X, -Z, X, -Z], [-X, -Z, -X, Z], [X, -Z, X, Z],
    [-X, Z, -gate / 2 - 0.08, Z], [gate / 2 + 0.08, Z, X, Z],
  ];
  const stone = (i: number) => STONE[i % STONE.length];
  for (const [ax, az, bx, bz] of runs) {
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, lx = Math.abs(bx - ax) || T, lz = Math.abs(bz - az) || T;
    if (style === 'hedge') {
      k.box(CONCRETE, [cx, 0.04, cz], [lx + 0.02, 0.08, lz + 0.02]);
      const n = Math.max(1, Math.round(Math.max(lx, lz) / 0.32));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        k.shape(i % 2 ? HEDGE : LEAF[2], LUMP(), [ax + (bx - ax) * t, 0.2, az + (bz - az) * t], [Math.max(lx / n, 0.12) * 0.75, 0.18, Math.max(lz / n, 0.12) * 0.75]);
      }
      continue;
    }
    if (style === 'railing') {
      k.box(colour, [cx, 0.14, cz], [lx, 0.28, lz]);
      k.box(trim, [cx, 0.29, cz], [lx + 0.03, 0.03, lz + 0.03]);
      railing(k, ax, az, bx, bz, 0.3, FH - 0.3, gateC, low, 0.07);
    } else {
      k.box(style === 'stone' ? stone(0) : colour, [cx, FH / 2, cz], [lx, FH, lz]);
      k.box(style === 'stone' ? CONCRETE : trim, [cx, FH + 0.02, cz], [lx + 0.03, 0.04, lz + 0.03]);
      if (!low && style === 'stone') {
        // Coursed stone faces: a few darker stones along each run.
        const n = Math.round(Math.max(lx, lz) / 0.25);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          k.box(stone(i + 1), [px, 0.18 + (i % 3) * 0.16, pz], [lx > lz ? 0.16 : T + 0.01, 0.1, lz > lx ? 0.16 : T + 0.01]);
        }
        k.bar(RAZOR, [ax, FH + 0.1, az], [bx, FH + 0.1, bz], 0.035);
      } else if (!low) {
        k.box(DARK, [cx, FH + 0.08, cz], [lx > lz ? lx : 0.012, 0.09, lz > lx ? lz : 0.012]);
      }
    }
  }
  // Pillars at the corners and halfway along.
  if (style !== 'hedge') for (const [x, z] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z], [-X, 0], [X, 0], [0, -Z]]) {
    k.box(style === 'stone' ? stone(2) : colour, [x, (FH + 0.06) / 2, z], [0.13, FH + 0.06, 0.13]);
    k.box(style === 'stone' ? CONCRETE : trim, [x, FH + 0.08, z], [0.16, 0.03, 0.16]);
  }
  // The gate pillars, with lamps on top.
  const PH = style === 'stone' ? 0.86 : 0.7;
  for (const s of [-1, 1]) {
    const x = s * (gate / 2 + 0.04);
    k.box(style === 'stone' ? stone(1) : style === 'hedge' ? CONCRETE : colour, [x, PH / 2, Z], [0.15, PH, 0.15]);
    k.box(style === 'stone' ? CONCRETE : trim, [x, PH + 0.02, Z], [0.19, 0.04, 0.19]);
    k.box(`lamp${s > 0 ? 1 : 0}`, [x, PH + 0.08, Z], [0.07, 0.09, 0.07]);
    k.pool(x, Z + 0.15, 0.4, 0.28);
  }
  // The gate.
  const gh = e.gate === 'ornate' ? PH - 0.06 : FH;
  if (e.gate === 'sliding') {
    k.box(gateC, [0.06, gh / 2 + 0.02, Z + 0.02], [gate - 0.02, gh - 0.02, 0.035]);
    k.box(STEEL, [0, 0.01, Z + 0.04], [gate * 1.8, 0.015, 0.02]);
    if (!low) for (let i = 0; i < 8; i++) k.box(shade(gateC, 1.3), [-gate / 2 + 0.12 + i * ((gate - 0.1) / 8), gh / 2, Z + 0.04], [0.025, gh - 0.1, 0.008]);
  } else {
    for (const s of [-1, 1]) k.box(gateC, [s * gate / 4, gh / 2 + 0.02, Z], [gate / 2 - 0.03, gh - 0.02, 0.035]);
    if (!low) for (let i = 0; i < 10; i++) k.box(shade(gateC, 0.7), [-gate / 2 + 0.06 + i * ((gate - 0.12) / 9), gh / 2, Z + 0.022], [0.016, gh - 0.08, 0.008]);
  }
  if (e.gate === 'ornate') {
    // Wrought scrolls under an arch of spear tops, gold bands and finials.
    k.box(exteriorHex('gold', '#c9a227'), [0, gh * 0.55, Z + 0.024], [gate - 0.06, 0.03, 0.012]);
    if (!low) for (let i = 0; i < 9; i++) {
      const x = -gate / 2 + 0.07 + i * ((gate - 0.14) / 8);
      const lift = Math.cos((x / (gate / 2)) * (Math.PI / 2)) * 0.12;
      k.post(exteriorHex('gold', '#c9a227'), [x, gh + lift - 0.04, Z], 0.014, 0.07, 4, 0.1);
      k.shape(shade(gateC, 1.4), LUMP(), [x, gh * 0.3, Z + 0.024], [0.03, 0.03, 0.006]);
    }
  } else if (!low) {
    k.box(exteriorHex('gold', '#c9a227'), [0, gh * 0.7, Z + 0.026], [gate - 0.08, 0.025, 0.01]);
  }
}

function drawTank(k: HousePen, x: number, z: number, big: boolean, low: boolean, y0 = 0) {
  const h = y0 ? 0.25 : 1.0, r = big ? 0.2 : 0.16;
  for (const ox of [-r * 0.8, r * 0.8]) for (const oz of [-r * 0.8, r * 0.8]) k.post(STEEL, [x + ox, y0, z + oz], 0.016, h, 4);
  k.box(STEEL, [x, y0 + h, z], [r * 2.1, 0.035, r * 2.1]);
  k.post(big ? TANK_BLACK : TANK_BLUE, [x, y0 + h + 0.02, z], r, r * 1.7, 10);
  k.shape(big ? TANK_BLACK : '#1e40af', DOME(), [x, y0 + h + 0.02 + r * 1.7, z], [r, r * 0.3, r]);
  if (!low && !y0) for (let y = 0.3; y < h; y += 0.32) k.box(STEEL, [x, y, z - r * 0.8], [r * 1.6, 0.012, 0.012]);
  if (big && !low) k.post(big ? TANK_BLACK : TANK_BLUE, [x + r * 2.4, y0 + h + 0.02, z], r * 0.8, r * 1.4, 10);
}

function drawGenHouse(k: HousePen, x: number, z: number, big: boolean, low: boolean) {
  k.box('#e6dcc6', [x, 0.2, z - 0.14], [0.56, 0.4, 0.04]);
  k.box('#9aa3ad', [x, 0.43, z], [0.62, 0.025, 0.36], [-0.12, 0, 0]);
  for (const s of [-1, 1]) k.post(WOOD, [x + s * 0.26, 0, z + 0.15], 0.014, 0.42, 4);
  k.box(big ? GEN_GREEN : GEN_RED, [x, 0.1, z], big ? [0.42, 0.18, 0.22] : [0.26, 0.16, 0.18]);
  k.box(DARK, [x, 0.02, z], big ? [0.44, 0.04, 0.24] : [0.28, 0.04, 0.2]);
  if (!low) k.box(DARK, [x + 0.08, 0.21, z - 0.04], [0.025, 0.07, 0.025]);
}

function drawSecurity(k: HousePen, hw: number, hd: number, low: boolean) {
  // The gatehouse inside the wall by the gate, a window facing the drive, cameras on the corners.
  const x = -0.82, z = hd - 0.32;
  body(k, '#e8e2d4', x - 0.18, z - 0.16, x + 0.18, z + 0.16, 0, 0.42);
  k.box('#475569', [x, 0.45, z], [0.44, 0.04, 0.4]);
  k.box('glass3', [x + 0.181, 0.27, z], [0.02, 0.12, 0.2]);
  k.box('lamp3', [x, 0.48, z + 0.17], [0.05, 0.03, 0.03]);
  k.pool(x, z + 0.3, 0.35, 0.2);
  if (!low) for (const [cx, cz] of [[-hw + 0.1, -hd + 0.1], [hw - 0.1, -hd + 0.1], [hw - 0.1, hd - 0.1], [-hw + 0.1, hd - 0.1]]) {
    k.box(DARK, [cx, 0.68, cz], [0.06, 0.04, 0.09]);
    k.box('#dc2626', [cx, 0.68, cz + 0.05], [0.015, 0.015, 0.01]);
  }
}

/** Where a tree stands on the estate, so two houses' yards never grow the same tree on the same local spot. */
const yardSeed = (k: HousePen) => k.ox * 7.13 + k.oz * 3.71;

/** A coconut palm from the tree kit (trees.ts), about 0.9×`s` tall. */
function drawPalm(k: HousePen, x: number, z: number, s: number, low: boolean) {
  plantTree(k, 'coconut', x, z, 0.62 * s, { low, seed: yardSeed(k) });
}

/** A mango tree from the tree kit (trees.ts), its crown about 0.43×`s` in radius. */
function drawMango(k: HousePen, x: number, z: number, s: number, low: boolean) {
  plantTree(k, 'mango', x, z, 0.7 * s, { low, seed: yardSeed(k) });
}

function drawPool(k: HousePen, x0: number, z0: number, x1: number, z1: number, low: boolean) {
  k.flat(DECK, x0, z0, x1, z1, 0.02);
  const p = 0.08;
  k.flat(WATER, x0 + p, z0 + p, x1 - p, z1 - p, 0.024);
  if (!low) {
    k.flat('#2b8fb0', x0 + p, z0 + p, x1 - p, z0 + p + 0.04, 0.026);
    for (const s of [0, 1]) k.box(WHITE, [x0 + 0.2 + s * 0.25, 0.05, z1 + 0.05], [0.1, 0.03, 0.2]);
  }
  // Lit from under the water after dark.
  k.glow.quad(k.at(x0 + p, 0.03, z0 + p), k.at(x1 - p, 0.03, z0 + p), k.at(x1 - p, 0.03, z1 - p), k.at(x0 + p, 0.03, z1 - p), scale(POOL_GLOW, 0.35));
}

function drawGazebo(k: HousePen, x: number, z: number, low: boolean) {
  k.box(CONCRETE, [x, 0.03, z], [0.5, 0.06, 0.5]);
  for (const [ox, oz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) k.post(WOOD, [x + ox, 0.06, z + oz], 0.02, 0.4, 5);
  k.shape(THATCH, CONE(8), [x, 0.6, z], [0.38, 0.28, 0.38]);
  if (!low) {
    k.box(WOOD_LIGHT, [x, 0.14, z - 0.15], [0.36, 0.03, 0.08]);
    k.box(WOOD_LIGHT, [x, 0.18, z], [0.2, 0.03, 0.16]);
  }
}

function drawBar(k: HousePen, x: number, z: number, low: boolean) {
  k.box(WOOD, [x, 0.12, z], [0.42, 0.24, 0.12]);
  k.box(WOOD_LIGHT, [x, 0.25, z], [0.46, 0.03, 0.16]);
  if (!low) for (const s of [-1, 0, 1]) k.post(DARK, [x + s * 0.14, 0, z + 0.14], 0.025, 0.16, 6);
  k.post(WHITE, [x - 0.24, 0, z - 0.04], 0.012, 0.5, 4);
  k.shape('#f59e0b', CONE(8), [x - 0.24, 0.52, z - 0.04], [0.26, 0.1, 0.26]);
}

function drawGrill(k: HousePen, x: number, z: number) {
  k.post(DARK, [x, 0.1, z], 0.08, 0.06, 8);
  for (const s of [-1, 1]) k.post(RUST, [x + s * 0.05, 0, z], 0.008, 0.1, 4);
  k.box('#f97316', [x, 0.165, z], [0.12, 0.005, 0.12]);
  k.box(WOOD_LIGHT, [x + 0.2, 0.08, z], [0.08, 0.04, 0.22]);
}

/** A parked car's shape: body, cabin, glass and wheels, nose to the gate. */
function drawCar(k: HousePen, x: number, z: number, colour: string, low: boolean) {
  k.box(colour, [x, 0.1, z], [0.3, 0.11, 0.58]);
  k.box(colour, [x, 0.19, z - 0.04], [0.26, 0.09, 0.3]);
  k.box('glass3', [x, 0.195, z + 0.115], [0.24, 0.065, 0.01]);
  if (!low) for (const ox of [-0.15, 0.15]) for (const oz of [-0.18, 0.18]) k.box(DARK, [x + ox, 0.045, z + oz], [0.04, 0.09, 0.1]);
}

/** The carport: slim steel posts and a canopy in the style chosen, over the cars parked under it. */
function drawCarport(k: HousePen, style: Exterior['carport'], colour: string, x: number, z: number, cars: string[], low: boolean) {
  const n = Math.max(1, Math.min(2, cars.length || 1));
  const w = 0.42 * n + 0.12, d = 0.78, h = 0.42;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  k.flat('#a8a39a', x0, z0, x1, z1, 0.018);
  for (const px of [x0 + 0.03, x1 - 0.03]) for (const pz of [z0 + 0.05, z1 - 0.05]) k.post(STEEL, [px, 0, pz], 0.016, h + (style === 'sloped' ? (pz < z ? 0.08 : 0) : 0), 6);
  if (style === 'curved') {
    // Bent sheets: a few flat strips round an arch across the depth.
    const seg = low ? 3 : 6;
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
      const p = (a: number): [number, number] => [z - Math.cos(a) * (d / 2 + 0.04), h + Math.sin(a) * 0.16];
      const [za, ya] = p(a0), [zb, yb] = p(a1);
      k.quad(colour, [x0 - 0.03, ya, za], [x1 + 0.03, ya, za], [x1 + 0.03, yb, zb], [x0 - 0.03, yb, zb], [0, 1, 0]);
      k.quad(colour, [x1 + 0.03, ya, za], [x0 - 0.03, ya, za], [x0 - 0.03, yb, zb], [x1 + 0.03, yb, zb], [0, -1, 0]);
    }
    k.bar(STEEL, [x0 + 0.03, h, z0 + 0.05], [x0 + 0.03, h, z1 - 0.05], 0.02);
    k.bar(STEEL, [x1 - 0.03, h, z0 + 0.05], [x1 - 0.03, h, z1 - 0.05], 0.02);
  } else if (style === 'tensile') {
    // Two fabric sails pulled down to opposite corners off a centre mast.
    k.post(STEEL, [x, 0, z0 - 0.02], 0.02, h + 0.24, 6);
    const top: V3 = [x, h + 0.24, z0 - 0.02];
    k.tri(colour, top, [x0 - 0.05, h - 0.02, z1 + 0.04], [x, h + 0.06, z1 + 0.06], [0, 1, 0.3]);
    k.tri(colour, top, [x, h + 0.06, z1 + 0.06], [x0 - 0.05, h - 0.02, z1 + 0.04], [0, -1, -0.3]);
    k.tri(colour, top, [x, h + 0.06, z1 + 0.06], [x1 + 0.05, h - 0.02, z1 + 0.04], [0, 1, 0.3]);
    k.tri(colour, top, [x1 + 0.05, h - 0.02, z1 + 0.04], [x, h + 0.06, z1 + 0.06], [0, -1, -0.3]);
    k.tri(shade(colour, 0.9), top, [x0 - 0.05, h + 0.02, z0], [x0 - 0.05, h - 0.02, z1 + 0.04], [-1, 1, 0]);
    k.tri(shade(colour, 0.9), top, [x1 + 0.05, h - 0.02, z1 + 0.04], [x1 + 0.05, h + 0.02, z0], [1, 1, 0]);
  } else {
    // One run of sheets falling to the front.
    k.box(colour, [x, h + 0.05, z], [w + 0.1, 0.025, d + 0.1], [-0.1, 0, 0]);
    if (!low) for (let i = 1; i < 6; i++) k.box(shade(colour, 0.85), [x0 - 0.05 + (i * (w + 0.1)) / 6, h + 0.065, z], [0.012, 0.012, d + 0.1], [-0.1, 0, 0]);
  }
  cars.slice(0, 2).forEach((c, i) => drawCar(k, x - (n - 1) * 0.21 + i * 0.42, z, c, low));
}

/* ---------- Unfinished ---------- */

function drawBareLand(k: HousePen, f: HouseFrame, look: HouseLook, low: boolean) {
  const hw = f.w / 2, hd = f.d / 2;
  k.flat(LATERITE, -hw + 0.1, -hd + 0.1, hw - 0.1, hd - 0.1, 0.012);
  for (const [x, z] of [[-hw + 0.2, -hd + 0.2], [hw - 0.2, -hd + 0.2], [-hw + 0.2, hd - 0.2], [hw - 0.2, hd - 0.2]]) {
    k.box('#ef4444', [x, 0.12, z], [0.08, 0.24, 0.08]);
    k.box(WHITE, [x, 0.25, z], [0.09, 0.03, 0.09]);
  }
  if (!look.design) {
    // "This land is not for sale": the sign every bought plot gets.
    k.post(WOOD, [0, 0, hd - 0.4], 0.02, 0.5, 4);
    k.box('#fef3c7', [0, 0.5, hd - 0.4], [0.7, 0.3, 0.03]);
    if (!low) for (let i = 0; i < 3; i++) k.box('#b91c1c', [0, 0.58 - i * 0.08, hd - 0.38], [0.5 - i * 0.12, 0.03, 0.01]);
  }
  if (!low) for (let i = 0; i < 6; i++) k.shape(LEAF[i % 3], LUMP(), [-hw + 0.4 + ((i * 0.7) % (f.w - 0.8)), 0.04, -hd + 0.4 + ((i * 1.3) % (f.d - 0.8))], [0.1, 0.05, 0.1]);
}

/** A house going up: the foundation and rods, then grey blockwork in scaffolding, then the roof on. */
function drawSite(k: HousePen, look: HouseLook, f: HouseFrame, low: boolean) {
  const hw = f.w / 2, hd = f.d / 2;
  const { x0, z0, x1, z1 } = f.house;
  k.flat(LATERITE, -hw + 0.1, -hd + 0.1, hw - 0.1, hd - 0.1, 0.012);
  const floors = storeysFor(look);
  const fh = f.fh;
  const W = x1 - x0, D = (z1 - z0) * 0.8;
  const cx = (x0 + x1) / 2, cz = z0 + D / 2;
  k.box(CONCRETE, [cx, 0.06, cz], [W + 0.06, 0.12, D + 0.06]);
  if (look.stage === 1) {
    if (!low) for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.post(RUST, [x0 + 0.05 + (i * (W - 0.1)) / 5, 0.12, cz + s * (D / 2 - 0.05)], 0.008, 0.3, 4);
  } else {
    // Blockwork: grey walls with the window holes left open.
    const h = fh * floors;
    k.box(BLOCK, [cx, 0.12 + h / 2, cz], [W, h, D]);
    if (!low) for (let y = 0.2; y < h + 0.1; y += 0.12) k.box(BLOCK_DARK, [cx, y, cz + D / 2 + 0.003], [W, 0.012, 0.006]);
    for (let fl = 0; fl < floors; fl++) for (let i = 0; i < Math.max(2, Math.round(W / 0.55)); i++) {
      const x = x0 + ((i + 0.5) * W) / Math.max(2, Math.round(W / 0.55));
      k.box(DARK, [x, 0.12 + fl * fh + fh * 0.52, cz + D / 2 + 0.004], [0.22, 0.22, 0.012]);
    }
    if (look.stage >= 3) hip(k, '#94a3b8', cx, cz, W + 0.16, D + 0.16, 0.12 + h, Math.min(0.5, D * 0.36));
    if (!low) {
      // Bamboo-and-plank scaffolding along the front.
      for (let i = 0; i <= 4; i++) k.post('#c8a165', [x0 - 0.05 + (i * (W + 0.1)) / 4, 0, cz + D / 2 + 0.16], 0.012, h + 0.2, 4);
      for (let y = 0.4; y < h + 0.1; y += 0.4) k.box(WOOD_LIGHT, [cx, y, cz + D / 2 + 0.16], [W + 0.14, 0.02, 0.08]);
    }
  }
  // Materials on site: cement bags, a stack of blocks, a heap of sharp sand, the mixer.
  const mx = hw - 0.45, mz = hd - 0.5;
  k.box('#e7e5e4', [mx, 0.06, mz], [0.24, 0.12, 0.18]);
  k.box('#d6d3d1', [mx, 0.15, mz], [0.2, 0.08, 0.16]);
  k.box(BLOCK, [mx - 0.4, 0.12, mz], [0.3, 0.24, 0.22]);
  k.shape('#d4b483', CONE(7), [-hw + 0.5, 0.14, hd - 0.5], [0.3, 0.28, 0.3]);
  if (look.building && !low) {
    k.post('#f97316', [mx + 0.05, 0.12, mz - 0.4], 0.09, 0.16, 8, 0.7);
    k.box(DARK, [mx + 0.05, 0.06, mz - 0.4], [0.2, 0.12, 0.08]);
  }
}

/* ---------- Helpers ---------- */

/** A stable number for a string (a property id), to vary one house from the next. */
export const seedOf = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
