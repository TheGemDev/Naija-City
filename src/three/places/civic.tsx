// Government and federal landmarks on the city map: Aso Villa and the Government Houses, Aso Rock, Zuma Rock, the
// Abuja City Gate, the Supreme Court, the CBN, NNPC Towers, the ECOWAS Commission, the National Assembly, the National
// Mosque, the Federal Secretariat (and the state secretariats and police commands that share it) and the World Trade
// Centre. Each is drawn after the real building where there is one, and made to read from the map camera, which looks
// almost straight down from the south: roofs, domes and towers carry the shape, the +z front carries the detail.
// Centred on its footprint (w along x, d along z), sits on y=0, door on the +z side.
//
// Built with the place kit (placeKit.tsx, as the stadium is): one merged geometry per colour, so StaticBatch folds a
// whole building into the town's buckets. Windows are 'glass' panes (each lit or dark at night on its own), lamps
// 'lamp…' keys, and floodlit facades and domes go in one night-only Glow. Low performance mode keeps the shapes and
// drops the small things: people, most cars, railings, column bases, half the windows and trees.

import { IcosahedronGeometry } from 'three';
import { clamp, frame, Glow, Kit, KitModel, prep, rng, scale, unitCyl, type Built, type RGB, type V3 } from '../placeKit';

/* ---------- Colours ---------- */

const WHITE = '#f4f2ec';
const STONE = '#e6dfcf';
const CREAM = '#efe4cc';
const TRIM = '#d8cfbb';
const SHADOW = '#b9b1a1';
const PAVING = '#d6d0c4';
const PAVING_DARK = '#c4bdaf';
const KERB = '#ebe7df';
const ASPHALT = '#4b5563';
const LINE = '#f8fafc';
const LAWN = '#97c068';
const LAWN_DARK = '#82ad57';
const HEDGE = '#3f7d3a';
const TREE_A = '#2f7d3b';
const TREE_B = '#3f8f45';
const TREE_C = '#4f9a3c';
const TRUNK = '#6b4a2f';
const STEEL = '#94a3b8';
const DARK = '#1f2937';
const DOOR = '#3b2a1a';
const OPENING = '#2b2723';
const GREEN = '#15803d';
const GREEN_DEEP = '#166534';
const FLAG_WHITE = '#f8fafc';
const GOLD = '#d4a017';
const GOLD_DEEP = '#b8860b';
const WATER = '#4fa3c7';
const RED = '#dc2626';
const CAR_GLASS = '#273444';
const CARS = ['#f8fafc', '#111827', '#9ca3af', '#1e3a8a', '#7f1d1d', '#e5e7eb', '#334155', '#facc15'];
const CLOTHES = ['#f8fafc', '#15803d', '#1d4ed8', '#7c2d12', '#facc15', '#6d28d9', '#0f172a', '#dc2626', '#f97316'];
const SKIN = '#5b3a24';
const WARM: RGB = [1, 0.86, 0.6];
const NIGERIA = [GREEN, FLAG_WHITE, GREEN];

/* ---------- Shapes ---------- */

const ICO = prep(new IcosahedronGeometry(1, 0));
const TAU = Math.PI * 2;

/**
 * Window glass. The kit seeds each pane on its own, so at night some rooms are lit and others dark. Two keys rather
 * than one: StaticBatch only keeps a material shared (and lit at night) when more than one mesh uses it.
 */
let glassTurn = 0;
const glass = () => `glass${glassTurn++ % 2}`;

/** A wall to put things on: its middle at (x, z), running along `ax`, facing `n` (+1 or -1) across it. */
interface Wall { x: number; z: number; ax: 'x' | 'z'; n: 1 | -1 }
/** A point on a wall: `u` along it, `y` up, `off` out from it. */
const wpt = (w: Wall, u: number, y: number, off = 0.006): V3 => (w.ax === 'x' ? [w.x + u, y, w.z + w.n * off] : [w.x + w.n * off, y, w.z + u]);
const wout = (w: Wall): V3 => (w.ax === 'x' ? [0, 0, w.n] : [w.n, 0, 0]);
/** The four walls of a box `bw` by `bd` centred on (x, z). */
const wallsOf = (x: number, z: number, bw: number, bd: number) => ({
  front: { x, z: z + bd / 2, ax: 'x', n: 1 } as Wall,
  back: { x, z: z - bd / 2, ax: 'x', n: -1 } as Wall,
  right: { x: x + bw / 2, z, ax: 'z', n: 1 } as Wall,
  left: { x: x - bw / 2, z, ax: 'z', n: -1 } as Wall,
});

/** A flat panel on a wall, from u0 to u1 and y0 to y1. */
function panel(kit: Kit, key: string, w: Wall, u0: number, u1: number, y0: number, y1: number, off = 0.006) {
  kit.quad(key, wpt(w, u0, y0, off), wpt(w, u1, y0, off), wpt(w, u1, y1, off), wpt(w, u0, y1, off), wout(w));
}

/** Rows of windows on a wall `len` long: `cols` panes a floor, `rows` floors of `fh` from y0, each pane pw by ph. */
function windows(kit: Kit, rand: () => number, w: Wall, len: number, o: { y0: number; rows: number; fh: number; cols: number; pw: number; ph: number; sill?: string; skip?: (c: number, r: number) => boolean }) {
  const step = len / o.cols;
  for (let r = 0; r < o.rows; r++) {
    const y = o.y0 + r * o.fh + (o.fh - o.ph) / 2;
    for (let c = 0; c < o.cols; c++) {
      if (o.skip?.(c, r)) continue;
      const u = -len / 2 + step * (c + 0.5);
      panel(kit, glass(), w, u - o.pw / 2, u + o.pw / 2, y, y + o.ph);
      if (o.sill) panel(kit, o.sill, w, u - o.pw / 2 - 0.02, u + o.pw / 2 + 0.02, y - 0.03, y, 0.012);
    }
  }
}

/** A box with sloping sides: w0 by d0 at its foot (y0), w1 by d1 at its top, h tall, its top capped. */
function frustum(kit: Kit, key: string, x: number, y0: number, z: number, w0: number, d0: number, w1: number, d1: number, h: number, cap = key) {
  const b = (sx: number, sz: number): V3 => [x + sx * w0 / 2, y0, z + sz * d0 / 2];
  const t = (sx: number, sz: number): V3 => [x + sx * w1 / 2, y0 + h, z + sz * d1 / 2];
  kit.quad(key, b(-1, 1), b(1, 1), t(1, 1), t(-1, 1), [0, 0, 1]);
  kit.quad(key, b(1, -1), b(-1, -1), t(-1, -1), t(1, -1), [0, 0, -1]);
  kit.quad(key, b(1, 1), b(1, -1), t(1, -1), t(1, 1), [1, 0, 0]);
  kit.quad(key, b(-1, -1), b(-1, 1), t(-1, 1), t(-1, -1), [-1, 0, 0]);
  kit.quad(cap, t(-1, 1), t(1, 1), t(1, -1), t(-1, -1), [0, 1, 0]);
}

/** A hipped roof over a w by d box whose walls top out at y: four slopes rising `h` to a ridge along the longer side. */
function hipRoof(kit: Kit, key: string, x: number, z: number, w: number, d: number, y: number, h: number) {
  const along = w >= d;
  const half = Math.abs(w - d) / 2;
  const r0: V3 = along ? [x - half, y + h, z] : [x, y + h, z - half];
  const r1: V3 = along ? [x + half, y + h, z] : [x, y + h, z + half];
  const c = (sx: number, sz: number): V3 => [x + sx * w / 2, y, z + sz * d / 2];
  if (along) {
    kit.quad(key, c(-1, 1), c(1, 1), r1, r0, [0, 1, 1]);
    kit.quad(key, c(1, -1), c(-1, -1), r0, r1, [0, 1, -1]);
    kit.tri(key, c(1, 1), c(1, -1), r1, [1, 1, 0]);
    kit.tri(key, c(-1, -1), c(-1, 1), r0, [-1, 1, 0]);
  } else {
    kit.quad(key, c(1, 1), c(1, -1), r0, r1, [1, 1, 0]);
    kit.quad(key, c(-1, -1), c(-1, 1), r1, r0, [-1, 1, 0]);
    kit.tri(key, c(-1, 1), c(1, 1), r1, [0, 1, 1]);
    kit.tri(key, c(1, -1), c(-1, -1), r0, [0, 1, -1]);
  }
}

/**
 * A surface of revolution round (cx, cy, cz): `prof` is a list of [radius, height] from the bottom up, `seg` sides,
 * stretched sx along x and sz along z. `key` can pick a colour for each facet (ring j, side i).
 */
function lathe(kit: Kit, key: string | ((i: number, j: number) => string), c: V3, prof: [number, number][], seg: number, sx = 1, sz = 1, rot = 0) {
  for (let j = 0; j < prof.length - 1; j++) {
    const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
    for (let i = 0; i < seg; i++) {
      const a0 = rot + (i / seg) * TAU, a1 = rot + ((i + 1) / seg) * TAU, am = (a0 + a1) / 2;
      const p = (a: number, r: number, y: number): V3 => [c[0] + Math.cos(a) * r * sx, c[1] + y, c[2] + Math.sin(a) * r * sz];
      const out: V3 = [Math.cos(am) * (y1 - y0), r0 - r1, Math.sin(am) * (y1 - y0)];
      if (!out[0] && !out[1] && !out[2]) continue;
      const k = typeof key === 'string' ? key : key(i, j);
      if (r1 < 1e-4) kit.tri(k, p(a0, r0, y0), p(a1, r0, y0), p(am, 0, y1), out);
      else if (r0 < 1e-4) kit.tri(k, p(am, 0, y0), p(a1, r1, y1), p(a0, r1, y1), out);
      else kit.quad(k, p(a0, r0, y0), p(a1, r0, y0), p(a1, r1, y1), p(a0, r1, y1), out);
    }
  }
}

/** A flat disc (or ring, from r0 out to r1) at height y. */
function disc(kit: Kit, key: string, x: number, z: number, r1: number, y: number, seg: number, r0 = 0) {
  lathe(kit, key, [x, y, z], [[r1, 0], [r0, 0]], seg);
}

/** A column: a round shaft with a square base and capital (left off in low mode). */
function column(kit: Kit, key: string, x: number, y0: number, z: number, h: number, r: number, low: boolean) {
  kit.post(key, [x, y0, z], r, h, low ? 6 : 8);
  if (!low) {
    kit.box(key, [x, y0 + 0.025, z], [r * 2.6, 0.05, r * 2.6]);
    kit.box(key, [x, y0 + h - 0.025, z], [r * 2.6, 0.05, r * 2.6]);
  }
}

/** Steps up to a front door: `n` treads from the ground to `top`, w wide, the bottom one at z1, climbing towards -z. */
function steps(kit: Kit, key: string, x: number, z1: number, w: number, top: number, n: number, tread = 0.07) {
  for (let i = 0; i < n; i++) {
    const h = (top * (i + 1)) / n;
    const depth = tread * (n - i);
    kit.box(key, [x, h / 2, z1 - depth / 2], [w - i * 0.02, h, depth]);
  }
}

/** A flagpole with a flag flying towards +x (green, white, green unless told otherwise). */
function flag(kit: Kit, x: number, z: number, h: number, cols: string[] = NIGERIA, size = 1) {
  kit.post(STEEL, [x, 0, z], 0.014 * size, h, 5, 0.6);
  kit.box(GOLD, [x, h + 0.015, z], [0.03, 0.03, 0.03]);
  const sw = (0.27 * size) / cols.length;
  cols.forEach((c, i) => kit.box(c, [x + 0.012 + sw * (i + 0.5), h - 0.09 * size, z], [sw, 0.16 * size, 0.008]));
}

function tree(kit: Kit, rand: () => number, x: number, z: number, s = 1) {
  kit.post(TRUNK, [x, 0, z], 0.035 * s, 0.32 * s, 5, 0.7);
  const c = [TREE_A, TREE_B, TREE_C][Math.floor(rand() * 3)];
  kit.shape(c, ICO, [x, 0.42 * s, z], [0.26 * s, 0.22 * s, 0.26 * s], [0, rand() * 3, 0]);
}

/** A palm: a leaning trunk and a crown of fronds. */
function palm(kit: Kit, rand: () => number, x: number, z: number, s = 1, low = false) {
  const h = 0.75 * s;
  kit.post('#7a5c3c', [x, 0, z], 0.03 * s, h, 5, 0.7);
  const n = low ? 4 : 6;
  const r0 = rand() * TAU;
  for (let i = 0; i < n; i++) {
    const a = r0 + (i / n) * TAU;
    const f = frame([x, h, z], [0, -a, 0]);
    kit.box(i % 2 ? TREE_A : TREE_C, [0.13 * s, -0.03 * s, 0], [0.28 * s, 0.015, 0.07 * s], [0, 0, -0.35], f);
  }
}

function bush(kit: Kit, rand: () => number, x: number, z: number, s = 1, c = HEDGE) {
  kit.shape(c, ICO, [x, 0.06 * s, z], [0.14 * s, 0.1 * s, 0.14 * s], [0, rand() * 3, 0]);
}

/** A parked car, nose along `yaw` (0 faces +z). */
function car(kit: Kit, x: number, z: number, yaw: number, c: string) {
  const f = frame([x, 0, z], [0, yaw, 0]);
  kit.box(c, [0, 0.065, 0], [0.17, 0.08, 0.34], [0, 0, 0], f);
  kit.box(CAR_GLASS, [0, 0.13, -0.02], [0.15, 0.055, 0.18], [0, 0, 0], f);
  kit.box(c, [0, 0.16, -0.02], [0.14, 0.01, 0.16], [0, 0, 0], f);
}

/** A black SUV of the kind a convoy is made of. */
function suv(kit: Kit, x: number, z: number, yaw: number, c = '#0b0f17') {
  const f = frame([x, 0, z], [0, yaw, 0]);
  kit.box(c, [0, 0.08, 0], [0.19, 0.1, 0.4], [0, 0, 0], f);
  kit.box(CAR_GLASS, [0, 0.16, -0.03], [0.18, 0.07, 0.27], [0, 0, 0], f);
  kit.box(c, [0, 0.2, -0.03], [0.18, 0.012, 0.26], [0, 0, 0], f);
}

function person(kit: Kit, rand: () => number, x: number, z: number) {
  kit.box(CLOTHES[Math.floor(rand() * CLOTHES.length)], [x, 0.08, z], [0.05, 0.11, 0.04]);
  kit.box(SKIN, [x, 0.16, z], [0.035, 0.035, 0.035]);
}

/** A street lamp with its pool of light on the ground at night. */
function lamp(kit: Kit, glow: Glow, x: number, z: number, h = 0.5, pool = true) {
  kit.post(STEEL, [x, 0, z], 0.012, h, 4);
  kit.box('lampPost', [x, h + 0.02, z], [0.06, 0.035, 0.06]);
  if (pool) glowDisc(glow, x, 0.07, z, 0.6, scale(WARM, 0.14));
}

/** A soft round patch of light: bright in the middle, fading to nothing at the rim. */
function glowDisc(glow: Glow, x: number, y: number, z: number, r: number, c: RGB, seg = 8) {
  const mid = scale(c, 0.45);
  const at = (a: number, k: number): V3 => [x + Math.cos(a) * r * k, y, z + Math.sin(a) * r * k];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU, b = ((i + 1) / seg) * TAU;
    glow.tri([x, y, z], at(a, 0.4), at(b, 0.4), c, mid);
    glow.quad(at(a, 0.4), at(a, 1), at(b, 1), at(b, 0.4), mid, [0, 0, 0], [0, 0, 0], mid);
  }
}

/** Floodlight washing up a wall from its foot: `c` at the bottom fading to nothing at y1. */
function wash(glow: Glow, w: Wall, u0: number, u1: number, y0: number, y1: number, c: RGB) {
  glow.quad(wpt(w, u0, y0, 0.03), wpt(w, u1, y0, 0.03), wpt(w, u1, y1, 0.03), wpt(w, u0, y1, 0.03), c, c, [0, 0, 0], [0, 0, 0]);
}

/** A parking bay row: lines on asphalt from x0 to x1 at z0..z1, with cars in some of the bays. */
function parking(kit: Kit, rand: () => number, x0: number, x1: number, z0: number, z1: number, fill: number, nose: 1 | -1) {
  kit.flat(ASPHALT, x0, z0, x1, z1, 0.047);
  const n = Math.max(1, Math.floor((x1 - x0) / 0.26));
  const bw = (x1 - x0) / n;
  for (let i = 0; i <= n; i++) kit.flat(LINE, x0 + i * bw - 0.006, z0 + 0.03, x0 + i * bw + 0.006, z1 - 0.03, 0.05);
  for (let i = 0; i < n; i++) if (rand() < fill) car(kit, x0 + (i + 0.5) * bw, (z0 + z1) / 2, nose > 0 ? 0 : Math.PI, CARS[Math.floor(rand() * CARS.length)]);
}

/* ---------- The model wrapper ---------- */

const model = (build: (w: number, d: number, low: boolean) => Built) =>
  function Model({ w, d }: { w: number; d: number }) {
    return <KitModel build={(low) => build(w, d, low)} deps={[w, d]} />;
  };

/* ---------- Government House / Aso Villa ---------- */

// The governor's (or the President's) house: a long white two-storey mansion under a green hipped roof, a columned
// portico with a pediment in the middle, a turning circle round the flagpole out front, the convoy waiting at the
// steps, all inside a white wall with a guarded gate.
function govHouse(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 97 + d * 13));
  const ROOF = '#2e7d4f';
  kit.box(LAWN, [0, 0.02, 0], [w, 0.04, d]);

  // The compound wall: solid at the back and sides, railings on the street side either side of the gate.
  const t = 0.08, wh = 0.3, gate = 0.95;
  const side = (x: number, z: number, sx: number, sz: number) => {
    kit.box(CREAM, [x, wh / 2, z], [sx, wh, sz]);
    kit.box(GREEN_DEEP, [x, wh + 0.015, z], [sx + 0.02, 0.03, sz + 0.02]);
  };
  side(0, -d / 2 + t / 2, w, t);
  side(-w / 2 + t / 2, 0, t, d);
  side(w / 2 - t / 2, 0, t, d);
  const fz = d / 2 - t / 2;
  for (const s of [-1, 1]) {
    const x0 = s * (gate / 2 + 0.12), x1 = s * (w / 2);
    const mid = (x0 + x1) / 2, len = Math.abs(x1 - x0);
    kit.box(CREAM, [mid, 0.06, fz], [len, 0.12, t]);
    if (low) kit.box(DARK, [mid, 0.2, fz], [len, 0.16, 0.02]);
    else {
      kit.box(DARK, [mid, 0.27, fz], [len, 0.015, 0.02]);
      for (let x = Math.min(x0, x1) + 0.06; x < Math.max(x0, x1) - 0.03; x += 0.06) kit.box(DARK, [x, 0.2, fz], [0.012, 0.16, 0.012]);
    }
    for (let k = 0; k <= Math.floor(len / 0.6); k++) {
      const x = x0 + s * Math.min(k * 0.6, len - 0.05);
      kit.box(CREAM, [x, 0.15, fz], [0.09, 0.3, 0.1]);
      kit.box(GREEN_DEEP, [x, 0.315, fz], [0.11, 0.03, 0.12]);
    }
    // The gate piers, a lamp on each.
    kit.box(CREAM, [s * (gate / 2 + 0.06), 0.24, fz], [0.14, 0.48, 0.14]);
    kit.box(GREEN_DEEP, [s * (gate / 2 + 0.06), 0.49, fz], [0.16, 0.03, 0.16]);
    kit.box('lampGate', [s * (gate / 2 + 0.06), 0.54, fz], [0.06, 0.07, 0.06]);
    glowDisc(glow, s * (gate / 2 + 0.06), 0.07, fz - 0.1, 0.45, scale(WARM, 0.12));
  }
  // The gate itself, half open, and the guard house and boom just inside.
  kit.box(DARK, [-gate / 4 - 0.05, 0.2, fz - 0.12], [gate / 2, 0.32, 0.015], [0, 0.5, 0]);
  kit.box(GOLD_DEEP, [-gate / 4 - 0.05, 0.36, fz - 0.12], [gate / 2, 0.02, 0.02], [0, 0.5, 0]);
  kit.box(DARK, [gate / 4 + 0.05, 0.2, fz - 0.12], [gate / 2, 0.32, 0.015], [0, -0.5, 0]);
  kit.box(GOLD_DEEP, [gate / 4 + 0.05, 0.36, fz - 0.12], [gate / 2, 0.02, 0.02], [0, -0.5, 0]);
  const gx = gate / 2 + 0.4, gz = d / 2 - 0.38;
  kit.box(WHITE, [gx, 0.17, gz], [0.36, 0.34, 0.3]);
  kit.box(GREEN_DEEP, [gx, 0.36, gz], [0.44, 0.04, 0.38]);
  panel(kit, glass(), wallsOf(gx, gz, 0.36, 0.3).left, -0.1, 0.1, 0.14, 0.27);
  kit.box(RED, [gate / 2 - 0.12, 0.17, gz - 0.12], [0.5, 0.025, 0.025]);
  for (let i = 0; i < 3; i++) kit.box(FLAG_WHITE, [gate / 2 - 0.3 + i * 0.13, 0.17, gz - 0.12], [0.05, 0.027, 0.027]);

  // The drive: up from the gate, round the turning circle and the flag in the middle of it.
  const W = Math.min(w - 1.1, 4.8);
  const D = clamp(d * 0.34, 1.25, 1.65);
  const zb = -d / 2 + 0.4 + D / 2; // the house's middle
  const zf = zb + D / 2; // its front wall
  const rc = clamp((d / 2 - zf) * 0.3, 0.38, 0.6);
  const zc = zf + 0.42 + rc;
  kit.flat(PAVING, -0.24, zc, 0.24, d / 2 - 0.02, 0.046);
  disc(kit, PAVING, 0, zc, rc + 0.24, 0.047, 20, rc);
  disc(kit, LAWN_DARK, 0, zc, rc, 0.05, 16);
  disc(kit, '#e85d75', 0, zc, rc * 0.55, 0.055, 12, rc * 0.4);
  flag(kit, 0, zc, 1.25, NIGERIA, 1.3);
  kit.flat(PAVING, -W * 0.3, zf, W * 0.3, zc - rc - 0.1, 0.046);

  // The house: wings either side, the middle block standing forward and a little higher.
  const hw = 1.12, hm = 1.28, mw = W * 0.34;
  kit.box(TRIM, [0, 0.04, zb], [W + 0.08, 0.08, D + 0.08]);
  kit.box(WHITE, [0, hw / 2, zb], [W, hw, D]);
  kit.box(WHITE, [0, hm / 2, zb + 0.12], [mw, hm, D + 0.24]);
  for (const y of [0.56, hw - 0.02]) kit.box(TRIM, [0, y, zb], [W + 0.02, 0.035, D + 0.02]);
  kit.box(TRIM, [0, hm - 0.02, zb + 0.12], [mw + 0.02, 0.035, D + 0.26]);
  hipRoof(kit, ROOF, 0, zb, W + 0.16, D + 0.16, hw, 0.42);
  hipRoof(kit, ROOF, 0, zb + 0.12, mw + 0.16, D + 0.4, hm, 0.5);
  // Windows: tall ones on both floors of the wings, round the sides too.
  const wings = (W - mw) / 2;
  const cols = Math.max(2, Math.round(wings / (low ? 0.42 : 0.3)));
  for (const s of [-1, 1]) {
    const wall: Wall = { x: s * (mw / 2 + wings / 2), z: zf, ax: 'x', n: 1 };
    windows(kit, rand, wall, wings - 0.1, { y0: 0.08, rows: 2, fh: 0.5, cols, pw: 0.12, ph: 0.3, sill: low ? undefined : TRIM });
    const end: Wall = { x: s * W / 2, z: zb, ax: 'z', n: s as 1 | -1 };
    windows(kit, rand, end, D - 0.3, { y0: 0.08, rows: 2, fh: 0.5, cols: low ? 2 : 3, pw: 0.12, ph: 0.3 });
  }
  const mid: Wall = { x: 0, z: zb + 0.12 + (D + 0.24) / 2, ax: 'x', n: 1 };
  windows(kit, rand, mid, mw - 0.1, { y0: 0.62, rows: 1, fh: 0.55, cols: 4, pw: 0.1, ph: 0.34 });
  panel(kit, DOOR, mid, -0.12, 0.12, 0.08, 0.5);
  panel(kit, glass(), mid, -0.09, 0.09, 0.42, 0.5, 0.008);
  // The portico: six columns, a pediment with the coat of arms in gold, steps down to the drive.
  const pz = mid.z + 0.32;
  kit.box(STONE, [0, 0.05, pz - 0.14], [mw + 0.2, 0.1, 0.5]);
  steps(kit, STONE, 0, pz + 0.22, mw * 0.8, 0.1, 3, 0.04);
  for (let i = 0; i < 6; i++) column(kit, WHITE, -mw / 2 + 0.06 + (i * (mw - 0.12)) / 5, 0.1, pz, 0.92, 0.04, low);
  kit.box(WHITE, [0, 1.06, pz - 0.14], [mw + 0.14, 0.1, 0.52]);
  const pe = (x: number, y: number, z: number): V3 => [x, y, z];
  const ph = 0.3, pw = mw / 2 + 0.07;
  kit.tri(WHITE, pe(-pw, 1.11, pz + 0.12), pe(pw, 1.11, pz + 0.12), pe(0, 1.11 + ph, pz + 0.12), [0, 0, 1]);
  kit.quad(ROOF, pe(-pw - 0.03, 1.1, pz + 0.14), pe(0, 1.12 + ph, pz + 0.14), pe(0, 1.12 + ph, zb), pe(-pw - 0.03, 1.1, zb), [-1, 2, 0]);
  kit.quad(ROOF, pe(pw + 0.03, 1.1, pz + 0.14), pe(pw + 0.03, 1.1, zb), pe(0, 1.12 + ph, zb), pe(0, 1.12 + ph, pz + 0.14), [1, 2, 0]);
  kit.shape(GOLD, unitCyl(10, 1), [0, 1.22, pz + 0.125], [0.07, 0.01, 0.07], [Math.PI / 2, 0, 0]);
  kit.box(GREEN, [0, 1.22, pz + 0.132], [0.05, 0.06, 0.005]);
  // A cupola on the ridge, with the presidential standard.
  const ry = hm + 0.5;
  kit.post(WHITE, [0, ry - 0.08, zb + 0.12], 0.13, 0.2, 8);
  lathe(kit, ROOF, [0, ry + 0.12, zb + 0.12], [[0.15, 0], [0.13, 0.06], [0.09, 0.12], [0, 0.17]], 8);
  flag(kit, 0, zb + 0.12, ry + 0.55, NIGERIA, 0.8);

  // The convoy: black SUVs at the steps, a police pickup by the gate.
  const vz = zc - rc - 0.3;
  suv(kit, -0.62, vz + 0.04, Math.PI / 2);
  if (!low) {
    suv(kit, 0.62, vz + 0.04, -Math.PI / 2);
    suv(kit, -1.1, vz + 0.05, Math.PI / 2);
    kit.flat(PAVING, -1.4, vz - 0.17, 1.0, vz + 0.27, 0.0465);
    car(kit, gx + 0.05, gz - 0.55, Math.PI, '#1e3a8a');
    kit.box(FLAG_WHITE, [gx + 0.05, 0.11, gz - 0.55], [0.172, 0.02, 0.342]);
    // Guards at the gate and the steps.
    for (const [x, z] of [[-gate / 2 + 0.05, d / 2 - 0.25], [gate / 2 - 0.05, d / 2 - 0.25], [-mw / 2 - 0.1, pz + 0.12], [mw / 2 + 0.1, pz + 0.12]]) {
      kit.box('#3f4a2a', [x, 0.08, z], [0.05, 0.11, 0.04]);
      kit.box(SKIN, [x, 0.16, z], [0.035, 0.035, 0.035]);
      kit.box('#1f2a14', [x, 0.185, z], [0.045, 0.015, 0.045]);
    }
  }
  // The grounds: hedges along the drive, trees round the edge, a palm or two by the house.
  for (const s of [-1, 1]) {
    kit.box(HEDGE, [s * 0.34, 0.07, (zc + rc + d / 2) / 2], [0.08, 0.1, Math.max(0.2, d / 2 - zc - rc - 0.2)]);
    palm(kit, rand, s * (W / 2 + 0.25), zf + 0.15, 1.1, low);
    tree(kit, rand, s * (w / 2 - 0.35), -d / 2 + 0.35, 1.1);
    tree(kit, rand, s * (w / 2 - 0.4), zc + 0.1, 1);
    if (!low) {
      tree(kit, rand, s * (w / 2 - 0.35), 0, 0.9);
      tree(kit, rand, s * (W / 2 - 0.4), -d / 2 + 0.25, 0.8);
      for (let i = 0; i < 4; i++) bush(kit, rand, s * (mw / 2 + 0.25 + i * 0.32), zf + 0.12, 0.9, i % 2 ? HEDGE : '#4d8a3a');
    }
  }
  for (const s of [-1, 1]) lamp(kit, glow, s * 0.36, zc + rc + 0.45, 0.42);

  // Night: the house floodlit from the lawn.
  const front: Wall = { x: 0, z: zf, ax: 'x', n: 1 };
  wash(glow, front, -W / 2, W / 2, 0.05, hw, scale(WARM, 0.32));
  wash(glow, { x: 0, z: pz + 0.13, ax: 'x', n: 1 }, -pw, pw, 0.1, 1.3, scale(WARM, 0.4));
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- Aso Rock ---------- */

// The 400 m granite outcrop behind the Three Arms Zone: one great bald dome running east-west, a lower hump beside
// it and shoulders at its foot, bare grey rock streaked black where the rain runs down, bush and trees at the base.
// Drawn as a height field, each facet coloured by its height and slope, so the streaks show on the steep faces.

/** Smooth wobble for the rock, the same at the same place. */
const wob = (x: number, z: number) => Math.sin(x * 1.7 + z * 0.6) * 0.5 + Math.sin(x * 0.7 - z * 2.1 + 1.3) * 0.35 + Math.sin(x * 3.1 + z * 2.3) * 0.15;

function asoRock(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const rand = rng(Math.round(w * 41 + d * 7));
  kit.box('#7fae58', [0, 0.02, 0], [w, 0.04, d]);
  const sx = w / 10, sz = d / 7;
  // Domes: middle, half-widths, height. The big one is left of centre, set back.
  const lobes: [number, number, number, number, number][] = [
    [-0.9 * sx, -0.7 * sz, 3.3 * sx, 2.3 * sz, 4.6],
    [2.3 * sx, -0.9 * sz, 2.3 * sx, 1.9 * sz, 3.4],
    [-3.3 * sx, 0.5 * sz, 1.4 * sx, 1.4 * sz, 1.9],
    [0.9 * sx, 0.9 * sz, 1.8 * sx, 1.2 * sz, 1.6],
    [3.6 * sx, 0.6 * sz, 1.0 * sx, 1.0 * sz, 1.1],
  ];
  const height = (x: number, z: number) => {
    let h = 0;
    for (const [cx, cz, rx, rz, H] of lobes) {
      const a = Math.atan2(z - cz, x - cx);
      const k = 1 + 0.08 * Math.sin(a * 3 + cx) + 0.05 * Math.sin(a * 5 + cz);
      const r = Math.hypot((x - cx) / rx, (z - cz) / rz) / k;
      if (r < 1) h = Math.max(h, H * (1 - r ** 2.4) ** 0.5 * (1 + 0.04 * wob(x, z)));
    }
    return h;
  };
  const nx = low ? 22 : 34, nz = low ? 16 : 24;
  const x0 = -w / 2 + 0.2, z0 = -d / 2 + 0.2, cw = (w - 0.4) / nx, cd = (d - 0.4) / nz;
  const H: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    H.push([]);
    for (let j = 0; j <= nz; j++) H[i].push(height(x0 + i * cw, z0 + j * cd));
  }
  // Each cell takes one colour from its slope and height, so the facets read as rock rather than noise. Rain
  // streaks run down whole columns of cells on the faces turned north or south (whole rows on the ends).
  const hash = (k: number) => {
    const v = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const h00 = H[i][j], h10 = H[i + 1][j], h01 = H[i][j + 1], h11 = H[i + 1][j + 1];
      if (Math.max(h00, h10, h01, h11) < 0.05) continue;
      const gx = (h10 - h00 + h11 - h01) / (2 * cw), gz = (h01 - h00 + h11 - h10) / (2 * cd);
      const up = 1 / Math.hypot(gx, 1, gz);
      const y = (h00 + h10 + h01 + h11) / 4;
      const line = Math.abs(gz) > Math.abs(gx) ? hash(i) < 0.24 : hash(j + 100) < 0.24;
      let key: string;
      if (y < 0.3 && up > 0.5) key = '#6e8f4a'; // scrub on the gentle foot
      else if (up < 0.8 && y > 0.3 && line) key = up < 0.5 ? '#4e4943' : '#5c564e';
      else if (up > 0.88) key = y > 2.8 ? '#aea79b' : '#a39b8f';
      else if (up > 0.65) key = '#958d81';
      else if (up > 0.4) key = '#877f74';
      else key = '#7a736a';
      const p = (ii: number, jj: number, h: number): V3 => [x0 + ii * cw, Math.max(h, 0.03), z0 + jj * cd];
      const a = p(i, j, h00), b = p(i + 1, j, h10), c = p(i + 1, j + 1, h11), e = p(i, j + 1, h01);
      // Split each cell along the diagonal that follows the rock rather than cutting across it.
      if (Math.abs(h00 - h11) < Math.abs(h10 - h01)) { kit.tri(key, a, b, c, [0, 1, 0]); kit.tri(key, a, c, e, [0, 1, 0]); }
      else { kit.tri(key, a, b, e, [0, 1, 0]); kit.tri(key, b, c, e, [0, 1, 0]); }
    }
  }
  // Boulders tumbled at the foot, then bush and trees round the rock.
  const foot: [number, number][] = [];
  for (let k = 0; k < 200 && foot.length < (low ? 14 : 34); k++) {
    const x = (rand() - 0.5) * (w - 0.6), z = (rand() - 0.5) * (d - 0.6);
    const h = height(x, z);
    if (h > 0.02 || height(x * 0.93, z * 0.9 - 0.1) < 0.02) continue;
    foot.push([x, z]);
  }
  foot.forEach(([x, z], i) => {
    if (i % 4 === 0) kit.shape(i % 8 ? '#8d867b' : '#9a9388', ICO, [x, 0.08, z], [0.22, 0.16, 0.18], [0, rand() * 3, 0]);
    else if (i % 4 === 1) tree(kit, rand, x, z, 0.9 + rand() * 0.4);
    else bush(kit, rand, x, z, 1.2 + rand() * 0.8, i % 2 ? HEDGE : '#557f35');
  });
  // The edge of the bush along the front and sides, where the map's streets meet it.
  const ring = low ? 8 : 16;
  for (let i = 0; i < ring; i++) {
    const x = -w / 2 + 0.35 + (i / (ring - 1)) * (w - 0.7);
    if (height(x, d / 2 - 0.5) > 0.02 || rand() < 0.2) continue;
    const z = d / 2 - 0.3 - rand() * 0.45;
    if (i % 3 === 1) bush(kit, rand, x + (rand() - 0.5) * 0.3, z, 1.3 + rand() * 0.6, '#557f35');
    else tree(kit, rand, x + (rand() - 0.5) * 0.3, z, 0.8 + rand() * 0.5);
  }
  return { parts: kit.build() };
}

/* ---------- Zuma Rock ---------- */

// The lone monolith by the road to Kaduna: sheer sides, a rounded crown, grey-brown granite with dark streaks, and on
// its south face the shapes people read as a face, two eyes, a nose and a mouth. A wrapped surface with gentle bumps,
// the face and streaks laid over it as patches that follow the rock.

function zumaRock(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const rand = rng(Math.round(w * 53 + d * 11));
  kit.box('#8fb963', [0, 0.02, 0], [w, 0.04, d]);
  const RX = Math.min(w / 2 - 0.55, 2.4), RZ = Math.min(d / 2 - 0.45, 1.55), HT = 4.8, cz = -0.12;
  // Radius (as a share of the ellipse) at height share t: a flared foot, sheer sides, a domed crown.
  const prof = (t: number) => (t < 0.06 ? 1.06 - t : t < 0.55 ? 1.0 - (t - 0.06) * 0.1 : 0.951 * Math.sqrt(Math.max(0, 1 - ((t - 0.55) / 0.45) ** 2)));
  const bump = (a: number, t: number) => 1 + 0.035 * Math.sin(a * 5 + t * 4) + 0.025 * Math.sin(a * 9 - t * 7 + 1) + 0.02 * Math.sin(a * 2 + 0.7);
  const surf = (a: number, t: number, out = 0): V3 => {
    const r = prof(t) * bump(a, t) + out;
    return [Math.cos(a) * RX * r, t * HT, cz + Math.sin(a) * RZ * r];
  };
  const seg = low ? 20 : 32;
  const ts = low ? [0, 0.06, 0.25, 0.45, 0.6, 0.74, 0.86, 0.95, 1] : [0, 0.03, 0.08, 0.18, 0.3, 0.42, 0.52, 0.6, 0.68, 0.76, 0.83, 0.89, 0.94, 0.98, 1];
  for (let j = 0; j < ts.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, t0 = ts[j], t1 = ts[j + 1];
      const am = (a0 + a1) / 2;
      const n = Math.sin(i * 2.3 + j * 1.7) + Math.sin(i * 0.9 - j * 2.9);
      const key = t0 > 0.7 ? (n > 0.6 ? '#a39a8b' : '#aaa193') : n > 0.9 ? '#8e8475' : n > -0.4 ? '#9a8f7f' : '#a29786';
      const out: V3 = [Math.cos(am), t0 > 0.55 ? 0.8 : 0.1, Math.sin(am)];
      if (t1 === 1) kit.tri(key, surf(a0, t0), surf(a1, t0), surf(am, 1), out);
      else kit.quad(key, surf(a0, t0), surf(a1, t0), surf(a1, t1), surf(a0, t1), out);
    }
  }
  // A patch on the rock from angle a0..a1 and height t0..t1, lying a hair proud of it.
  const patch = (key: string, a0: number, a1: number, t0: number, t1: number, nu = 3, nv = nu) => {
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const A0 = a0 + ((a1 - a0) * i) / nu, A1 = a0 + ((a1 - a0) * (i + 1)) / nu;
        const T0 = t0 + ((t1 - t0) * j) / nv, T1 = t0 + ((t1 - t0) * (j + 1)) / nv;
        const am = (A0 + A1) / 2;
        kit.quad(key, surf(A0, T0, 0.012), surf(A1, T0, 0.012), surf(A1, T1, 0.012), surf(A0, T1, 0.012), [Math.cos(am), 0.2, Math.sin(am)]);
      }
    }
  };
  // Rain streaks all round, longest on the south face.
  const streaks = low ? 12 : 26;
  for (let k = 0; k < streaks; k++) {
    const a = (k / streaks) * TAU + rand() * 0.15;
    // Leave the face clear of streaks.
    if (Math.abs(a - Math.PI / 2) < 0.45) continue;
    const wid = 0.015 + rand() * 0.025;
    const top = 0.62 + rand() * 0.2, bot = 0.06 + rand() * 0.2;
    patch(k % 3 ? '#6f665a' : '#5f574d', a - wid, a + wid, bot, top, 1, low ? 3 : 5);
  }
  // The face, on the south side: eyes, the long nose between them, and a wide mouth.
  const s = Math.PI / 2;
  patch('#423d37', s - 0.36, s - 0.2, 0.52, 0.63);
  patch('#423d37', s + 0.17, s + 0.33, 0.53, 0.65);
  patch('#4a443e', s - 0.05, s + 0.05, 0.34, 0.54);
  patch('#423d37', s - 0.26, s + 0.26, 0.2, 0.27, low ? 3 : 4);
  patch('#5d564d', s - 0.42, s - 0.36, 0.36, 0.58, 2);
  // Scrub on the crown and at the foot.
  for (let k = 0; k < (low ? 5 : 11); k++) {
    const a = rand() * TAU, t = 0.78 + rand() * 0.14;
    const p = surf(a, t, 0.01);
    kit.shape(k % 2 ? '#6b7448' : '#5d6a3d', ICO, p, [0.13, 0.05, 0.13], [0, rand() * 3, 0]);
  }
  for (let k = 0; k < (low ? 10 : 22); k++) {
    const a = rand() * TAU;
    const p = surf(a, 0, 0.08 + rand() * 0.2);
    if (Math.abs(p[0]) > w / 2 - 0.2 || Math.abs(p[2]) > d / 2 - 0.2) continue;
    if (k % 3 === 0) kit.shape('#9a9388', ICO, [p[0], 0.1, p[2]], [0.2, 0.17, 0.16], [0, rand() * 3, 0]);
    else bush(kit, rand, p[0], p[2], 1.1 + rand() * 0.7, k % 2 ? HEDGE : '#557f35');
  }
  for (const [x, z] of [[-w / 2 + 0.35, d / 2 - 0.3], [w / 2 - 0.35, -d / 2 + 0.35], [-w / 2 + 0.35, -d / 2 + 0.4], [w / 2 - 0.4, d / 2 - 0.35]]) tree(kit, rand, x, z, 1);
  return { parts: kit.build() };
}

/* ---------- Abuja City Gate ---------- */

// The gateway on the airport road (and, in Lagos, the Lekki toll gate): two white pylons either side of the road, a
// deep lintel across the top with an arch under it, the coat of arms in the middle and gold lettering, green bands
// up the pylons. The road runs through along x. Floodlit at night.

function cityGate(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 17 + d * 29));
  const pz = d / 2 - 0.36;
  const H = 2.75;
  const PX = Math.min(0.62, w * 0.34), PZ = 0.5;
  for (const s of [-1, 1]) {
    const z = s * pz;
    // Planter round the foot, then the tapering pylon.
    kit.box(TRIM, [0, 0.07, z], [PX + 0.36, 0.14, PZ + 0.24]);
    kit.box(HEDGE, [0, 0.16, z], [PX + 0.3, 0.06, PZ + 0.18]);
    frustum(kit, WHITE, 0, 0.14, z, PX, PZ, PX * 0.78, PZ * 0.78, H - 0.14);
    // Green bands up the faces drivers see, and a slot of light up the inner face.
    for (const n of [-1, 1]) {
      const at = (y: number) => (PX - (PX * 0.22 * (y - 0.14)) / (H - 0.14)) / 2;
      const q = (u: number, y: number, off: number): V3 => [n * (at(y) + off), y, z + u];
      const bw = 0.06;
      kit.quad(GREEN, q(-bw, 0.3, 0.006), q(bw, 0.3, 0.006), q(bw, H - 0.25, 0.006), q(-bw, H - 0.25, 0.006), [n, 0, 0]);
      for (const k of [-1, 1]) kit.quad(GREEN_DEEP, q(k * 0.17 - 0.015, 0.3, 0.006), q(k * 0.17 + 0.015, 0.3, 0.006), q(k * 0.15 + 0.015, H - 0.25, 0.006), q(k * 0.15 - 0.015, H - 0.25, 0.006), [n, 0, 0]);
      glow.quad(q(-0.24, 0.16, 0.03), q(0.24, 0.16, 0.03), q(0.2, H * 0.8, 0.03), q(-0.2, H * 0.8, 0.03), scale(WARM, 0.3), scale(WARM, 0.3), [0, 0, 0], [0, 0, 0]);
    }
    // A green cap stepping up to a point.
    frustum(kit, GREEN, 0, H, z, PX * 0.86, PZ * 0.86, PX * 0.3, PZ * 0.3, 0.3);
    kit.box(GOLD, [0, H + 0.34, z], [0.06, 0.08, 0.06]);
  }
  // The lintel and the arch under it.
  const span = pz * 2 - PZ * 0.78;
  const ly = H - 0.5;
  kit.box(WHITE, [0, ly + 0.25, 0], [PX * 0.7, 0.5, span]);
  kit.box(GREEN, [0, ly + 0.53, 0], [PX * 0.74, 0.06, span + 0.1]);
  kit.box(GREEN, [0, ly - 0.02, 0], [PX * 0.72, 0.04, span]);
  const segs = low ? 6 : 10;
  const ar = span / 2;
  const archY = (zz: number) => ly - 0.55 + 0.55 * Math.sqrt(Math.max(0, 1 - (zz / ar) ** 2));
  for (let i = 0; i < segs; i++) {
    const za = -ar + (i / segs) * span, zb = -ar + ((i + 1) / segs) * span;
    const ya = archY(za), yb = archY(zb);
    // A thin web from the arch up to the lintel, either face.
    for (const n of [-1, 1]) kit.quad(STONE, [n * PX * 0.3, ya, za], [n * PX * 0.3, yb, zb], [n * PX * 0.3, ly, zb], [n * PX * 0.3, ly, za], [n, 0, 0]);
    kit.quad(SHADOW, [-PX * 0.3, ya, za], [PX * 0.3, ya, za], [PX * 0.3, yb, zb], [-PX * 0.3, yb, zb], [0, -1, 0]);
    if (i % 2) kit.box('lampArch', [0, (ya + yb) / 2 - 0.02, (za + zb) / 2], [0.05, 0.02, 0.05]);
  }
  // The coat of arms on both faces: the black shield with its white Y, the red eagle, the white horses, the green
  // ground. Gold lettering either side.
  for (const n of [-1, 1]) {
    const f = frame([n * PX * 0.36, ly + 0.25, 0], [0, (n * Math.PI) / 2, 0]);
    kit.box(DARK, [0, 0, 0], [0.18, 0.22, 0.02], [0, 0, 0], f);
    kit.box(FLAG_WHITE, [-0.04, 0.05, 0.012], [0.025, 0.11, 0.005], [0, 0, 0.7], f);
    kit.box(FLAG_WHITE, [0.04, 0.05, 0.012], [0.025, 0.11, 0.005], [0, 0, -0.7], f);
    kit.box(FLAG_WHITE, [0, -0.05, 0.012], [0.025, 0.1, 0.005], [0, 0, 0], f);
    kit.box(RED, [0, 0.16, 0.01], [0.1, 0.07, 0.02], [0, 0, 0], f);
    for (const k of [-1, 1]) kit.box(FLAG_WHITE, [k * 0.14, -0.01, 0.01], [0.06, 0.16, 0.02], [0, 0, 0], f);
    kit.box(GREEN, [0, -0.14, 0.01], [0.36, 0.04, 0.02], [0, 0, 0], f);
    for (const k of [-1, 1]) {
      if (low) kit.box(GOLD, [k * 0.48, 0, 0.006], [0.42, 0.07, 0.01], [0, 0, 0], f);
      else for (let i = 0; i < 5; i++) kit.box(GOLD, [k * (0.3 + i * 0.09), 0, 0.006], [0.06, 0.08, 0.01], [0, 0, 0], f);
    }
    glow.quad([n * (PX * 0.36 + 0.03), ly + 0.06, -span / 2], [n * (PX * 0.36 + 0.03), ly + 0.06, span / 2], [n * (PX * 0.36 + 0.03), ly + 0.46, span / 2], [n * (PX * 0.36 + 0.03), ly + 0.46, -span / 2], scale(WARM, 0.22));
  }
  // Guard posts and lamps on the verge.
  if (!low) {
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.2), z = s * (pz - 0.3);
      kit.box(WHITE, [x, 0.13, z], [0.2, 0.26, 0.2]);
      kit.box(GREEN, [x, 0.28, z], [0.26, 0.03, 0.26]);
      panel(kit, glass(), wallsOf(x, z, 0.2, 0.2).front, -0.06, 0.06, 0.12, 0.21);
      person(kit, rand, x - s * 0.18, z);
    }
  }
  for (const s of [-1, 1]) lamp(kit, glow, -s * (w / 2 - 0.15), s * (pz + PZ / 2 + 0.05), 0.6);
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- Supreme Court ---------- */

// The Supreme Court in the Three Arms Zone: a white hall on a stepped podium, ringed with tall columns under a deep
// flat entablature, a stepped attic and a low bronze dome on top, the scales of justice over the door, a pool and the
// flags out front, the judges' cars round the side.

function supremeCourt(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 61 + d * 19));
  kit.box(PAVING, [0, 0.02, 0], [w, 0.04, d]);
  const BW = Math.min(w - 1.3, 3.4), BD = Math.min(d - 1.4, 2.4), zc = -d / 2 + 0.35 + BD / 2;
  const P = 0.16, CH = 1.25;
  // Lawns either side of the approach, a long pool down the middle.
  const zf = zc + BD / 2;
  for (const s of [-1, 1]) {
    kit.flat(LAWN, s * 0.55, zf + 0.35, s * (w / 2 - 0.08), d / 2 - 0.08, 0.045);
    kit.flat(LAWN, s * (BW / 2 + 0.2), -d / 2 + 0.08, s * (w / 2 - 0.08), zf + 0.2, 0.045);
  }
  kit.box(KERB, [0, 0.06, (zf + 0.45 + d / 2 - 0.2) / 2], [0.5, 0.06, d / 2 - 0.2 - zf - 0.45]);
  kit.flat(WATER, -0.22, zf + 0.47, 0.22, d / 2 - 0.22, 0.095);
  // Podium in three steps, wider at the front.
  for (let i = 0; i < 3; i++) kit.box(i % 2 ? STONE : TRIM, [0, (P * (i + 1)) / 6 + (P * i) / 6, zc + 0.08], [BW + 0.5 - i * 0.12, (P / 3) * (i + 1) * 2 - (P / 3) * i * 2 + 0.001, BD + 0.56 - i * 0.12]);
  kit.box(STONE, [0, P / 2, zc], [BW + 0.3, P, BD + 0.3]);
  steps(kit, STONE, 0, zf + 0.32, BW * 0.55, P, 4, 0.045);
  // The hall inside the colonnade, glazed between piers.
  const IW = BW - 0.42, ID = BD - 0.42;
  kit.box(STONE, [0, P + CH / 2, zc], [IW, CH, ID]);
  const hall = wallsOf(0, zc, IW, ID);
  const cols = Math.round(IW / 0.3);
  windows(kit, rand, hall.front, IW, { y0: P + 0.1, rows: 2, fh: 0.55, cols, pw: 0.16, ph: 0.4, skip: (c) => Math.abs(c - (cols - 1) / 2) < 0.6 });
  for (const s of [hall.left, hall.right]) windows(kit, rand, s, ID, { y0: P + 0.1, rows: 2, fh: 0.55, cols: Math.round(ID / 0.32), pw: 0.16, ph: 0.4 });
  panel(kit, DOOR, hall.front, -0.16, 0.16, P, P + 0.7);
  // Columns all round.
  const n = low ? Math.round(BW / 0.42) : Math.round(BW / 0.3);
  const m = low ? Math.round(BD / 0.45) : Math.round(BD / 0.32);
  const cx = BW / 2 - 0.1, cz = BD / 2 - 0.1;
  for (let i = 0; i <= n; i++) {
    const x = -cx + (i / n) * cx * 2;
    column(kit, WHITE, x, P, zc + cz, CH, 0.055, low);
    column(kit, WHITE, x, P, zc - cz, CH, 0.055, low);
  }
  for (let i = 1; i < m; i++) {
    const z = zc - cz + (i / m) * cz * 2;
    column(kit, WHITE, -cx, P, z, CH, 0.055, low);
    column(kit, WHITE, cx, P, z, CH, 0.055, low);
  }
  // The deep entablature, the stepped attic, the dome.
  const top = P + CH;
  kit.box(WHITE, [0, top + 0.12, zc], [BW + 0.08, 0.24, BD + 0.08]);
  kit.box(TRIM, [0, top + 0.025, zc], [BW + 0.1, 0.05, BD + 0.1]);
  kit.box('#ece7dc', [0, top + 0.3, zc], [BW - 0.3, 0.12, BD - 0.3]);
  kit.box(WHITE, [0, top + 0.42, zc], [BW - 0.7, 0.12, BD - 0.7]);
  const dr = Math.min(BW, BD) * 0.26;
  kit.post(STONE, [0, top + 0.48, zc], dr * 1.05, 0.14, 16);
  lathe(kit, (i) => (i % 2 ? '#8a6d3b' : '#97794a'), [0, top + 0.62, zc], [[dr, 0], [dr * 0.92, dr * 0.22], [dr * 0.72, dr * 0.42], [dr * 0.4, dr * 0.56], [0, dr * 0.62]], low ? 12 : 16);
  kit.post(GOLD, [0, top + 0.62 + dr * 0.6, zc], 0.025, 0.14, 5);
  // The scales of justice in gold over the door.
  const sy = top + 0.12, sz = zc + BD / 2 + 0.045;
  kit.box(GOLD, [0, sy, sz], [0.015, 0.16, 0.01]);
  kit.box(GOLD, [0, sy + 0.07, sz], [0.24, 0.012, 0.01]);
  for (const s of [-1, 1]) kit.box(GOLD, [s * 0.11, sy - 0.02, sz], [0.07, 0.015, 0.01]);
  // Flags on the forecourt, lamps along the approach, the judges' cars by the side.
  for (const s of [-1, 1]) {
    flag(kit, s * 0.42, zf + 0.42, 1.0);
    lamp(kit, glow, s * 0.42, d / 2 - 0.35, 0.42);
    tree(kit, rand, s * (w / 2 - 0.3), d / 2 - 0.35, 0.9);
    tree(kit, rand, s * (w / 2 - 0.3), -d / 2 + 0.35, 0.9);
  }
  const lx0 = BW / 2 + 0.35, lx1 = w / 2 - 0.1;
  if (lx1 - lx0 > 0.3) {
    kit.flat(ASPHALT, lx0, zc - BD / 2, lx1, zc + BD / 2 - 0.1, 0.047);
    const k = Math.floor((BD - 0.2) / 0.26);
    for (let i = 0; i < k && !low; i++) if (rand() < 0.7) car(kit, (lx0 + lx1) / 2, zc - BD / 2 + 0.15 + i * 0.26, Math.PI / 2, CARS[Math.floor(rand() * 3) + 1]);
  }
  if (!low) for (let i = 0; i < 5; i++) person(kit, rand, (rand() - 0.5) * BW * 0.6, zf + 0.15 + rand() * 0.2);
  // Night: the colonnade floodlit, the dome glowing.
  wash(glow, { x: 0, z: zc + cz + 0.07, ax: 'x', n: 1 }, -BW / 2, BW / 2, P, top + 0.24, scale(WARM, 0.32));
  for (const s of [-1, 1]) wash(glow, { x: s * (cx + 0.07), z: zc, ax: 'z', n: s as 1 | -1 }, -BD / 2, BD / 2, P, top + 0.24, scale(WARM, 0.18));
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- Glass towers ---------- */

/**
 * A curtain-wall tower `tw` by `td` on (x, z) from y0 to y0+h: glass panes floor by floor between white mullions and
 * spandrels, every face. `pier` puts solid piers between the columns of panes (stone-faced towers).
 */
function tower(kit: Kit, rand: () => number, x: number, z: number, tw: number, td: number, y0: number, h: number, o: { body: string; band: string; floor: number; bay: number; low: boolean; pier?: number }) {
  kit.box(o.body, [x, y0 + h / 2, z], [tw, h, td]);
  const floors = Math.max(2, Math.round(h / o.floor));
  const fh = h / floors;
  const walls = wallsOf(x, z, tw, td);
  for (const [k, wall] of Object.entries(walls)) {
    const len = k === 'front' || k === 'back' ? tw : td;
    const cols = Math.max(1, Math.round(len / (o.low ? o.bay * 1.6 : o.bay)));
    const pw = (len / cols) * (1 - (o.pier ?? 0.18));
    // In low mode a floor is one strip of glass; otherwise a pane per bay.
    if (o.low) for (let f = 0; f < floors; f++) panel(kit, glass(), wall, -len / 2 + 0.04, len / 2 - 0.04, y0 + f * fh + fh * 0.2, y0 + f * fh + fh * 0.88);
    else windows(kit, rand, wall, len - 0.06, { y0, rows: floors, fh, cols, pw, ph: fh * 0.7 });
    for (let f = 0; f <= floors && !o.low; f += 2) panel(kit, o.band, wall, -len / 2, len / 2, y0 + f * fh - 0.012, y0 + f * fh + 0.012, 0.01);
  }
}

/** A helipad on a roof at height y: the dark pad, its white ring and the H. */
function helipad(kit: Kit, x: number, y: number, z: number, r: number) {
  disc(kit, '#374151', x, z, r, y, 12);
  disc(kit, LINE, x, z, r * 0.85, y + 0.002, 12, r * 0.75);
  kit.box(LINE, [x - r * 0.25, y + 0.003, z], [r * 0.1, 0.004, r * 0.6]);
  kit.box(LINE, [x + r * 0.25, y + 0.003, z], [r * 0.1, 0.004, r * 0.6]);
  kit.box(LINE, [x, y + 0.003, z], [r * 0.5, 0.004, r * 0.1]);
}

/** Rooftop clutter: air-conditioning units and a water tank or two. */
function rooftop(kit: Kit, rand: () => number, x: number, z: number, rw: number, rd: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const px = x + (rand() - 0.5) * rw, pz = z + (rand() - 0.5) * rd;
    if (i % 3 === 0) kit.post('#111827', [px, y, pz], 0.07, 0.14, 8);
    else kit.box('#cbd5e1', [px, y + 0.04, pz], [0.12, 0.08, 0.09]);
  }
}

/* ---------- Central Bank of Nigeria ---------- */

// The CBN headquarters (and Lagos's NECOM House): a stone-and-dark-glass tower with chamfered corners rising from a
// colonnaded podium, set back twice near the top under a gold band, a mast on the crown. Out front: a forecourt with
// a fountain, flags and the bank's green sign.

function cbn(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 71 + d * 23));
  kit.box(PAVING, [0, 0.02, 0], [w, 0.04, d]);
  const PW = w - 0.5, PD = Math.min(d - 1.0, 2.6), pz = -d / 2 + 0.25 + PD / 2, PH = 0.45;
  // Podium: granite base, a colonnade of square piers across the front, glass behind.
  kit.box('#cfc6b6', [0, PH / 2, pz], [PW, PH, PD]);
  kit.box(TRIM, [0, PH + 0.02, pz], [PW + 0.06, 0.04, PD + 0.06]);
  const pod = wallsOf(0, pz, PW, PD);
  panel(kit, glass(), pod.front, -PW / 2 + 0.1, PW / 2 - 0.1, 0.06, PH - 0.06);
  for (let i = 0; i <= 8; i++) kit.box(STONE, [-PW / 2 + 0.08 + (i * (PW - 0.16)) / 8, PH / 2, pz + PD / 2 + 0.03], [0.07, PH, 0.07]);
  panel(kit, DOOR, pod.front, -0.18, 0.18, 0.04, 0.3, 0.04);
  kit.box(STONE, [0, 0.33, pz + PD / 2 + 0.16], [0.7, 0.03, 0.3]);
  // The tower: an octagon in plan, stone piers between strips of dark glass.
  const TW = Math.min(1.7, PW - 0.6), TD = Math.min(1.35, PD - 0.35), TH = 4.0, ch = 0.22;
  const tz = pz - 0.05;
  const oct: [number, number][] = [[-TW / 2 + ch, TD / 2], [TW / 2 - ch, TD / 2], [TW / 2, TD / 2 - ch], [TW / 2, -TD / 2 + ch], [TW / 2 - ch, -TD / 2], [-TW / 2 + ch, -TD / 2], [-TW / 2, -TD / 2 + ch], [-TW / 2, TD / 2 - ch]];
  const floors = low ? 8 : 13;
  const fh = (TH - PH) / floors;
  for (let k = 0; k < 8; k++) {
    const [ax, az] = oct[k], [bx, bz] = oct[(k + 1) % 8];
    const nx = bz - az, nz = -(bx - ax);
    const l = Math.hypot(nx, nz);
    const out: V3 = [-nx / l, 0, -nz / l];
    const len = Math.hypot(bx - ax, bz - az);
    const P = (f: number, y: number, off = 0): V3 => [ax + (bx - ax) * f + out[0] * off, y, tz + az + (bz - az) * f + out[2] * off];
    kit.quad('#e2dccd', P(0, PH), P(1, PH), P(1, TH), P(0, TH), out);
    const bays = Math.max(1, Math.round(len / (low ? 0.36 : 0.24)));
    for (let b = 0; b < bays; b++) {
      const f0 = (b + 0.2) / bays, f1 = (b + 0.8) / bays;
      if (low) kit.quad(glass(), P(f0, PH + 0.05, 0.006), P(f1, PH + 0.05, 0.006), P(f1, TH - 0.08, 0.006), P(f0, TH - 0.08, 0.006), out);
      else for (let f = 0; f < floors; f++) kit.quad(glass(), P(f0, PH + f * fh + 0.04, 0.006), P(f1, PH + f * fh + 0.04, 0.006), P(f1, PH + (f + 1) * fh - 0.02, 0.006), P(f0, PH + (f + 1) * fh - 0.02, 0.006), out);
    }
  }
  // The roof of the shaft, two setbacks and the gold band, the mast.
  const roof = (s: number, y: number, h: number, key: string) => {
    const pts = oct.map(([x, z]): V3 => [x * s, 0, tz + z * s]);
    for (let k = 0; k < 8; k++) {
      const a = pts[k], b = pts[(k + 1) % 8];
      kit.quad(key, [a[0], y, a[2]], [b[0], y, b[2]], [b[0], y + h, b[2]], [a[0], y + h, a[2]], [a[0] + b[0], 0, a[2] + b[2] - 2 * tz]);
      kit.tri(key, [0, y + h, tz], [a[0], y + h, a[2]], [b[0], y + h, b[2]], [0, 1, 0]);
    }
  };
  roof(1.02, TH, 0.08, GOLD);
  roof(0.8, TH + 0.08, 0.32, '#e2dccd');
  roof(0.82, TH + 0.4, 0.05, GOLD);
  roof(0.5, TH + 0.45, 0.25, '#e2dccd');
  kit.bar(RED, [0, TH + 0.7, tz], [0, TH + 1.35, tz], 0.03);
  for (let i = 0; i < 3; i++) kit.box(FLAG_WHITE, [0, TH + 0.82 + i * 0.2, tz], [0.034, 0.06, 0.034]);
  kit.box('lampBeacon', [0, TH + 1.38, tz], [0.05, 0.05, 0.05]);
  if (!low) rooftop(kit, rand, -TW * 0.3, tz, TW * 0.2, TD * 0.3, TH + 0.4, 3);
  // The forecourt: fountain, flags, the bank's sign, cars at the kerb.
  const fz = pz + PD / 2 + 0.55;
  if (fz < d / 2 - 0.15) {
    disc(kit, KERB, 0, Math.min(fz, d / 2 - 0.35), 0.3, 0.07, 14);
    disc(kit, WATER, 0, Math.min(fz, d / 2 - 0.35), 0.26, 0.075, 14);
    kit.post(KERB, [0, 0.07, Math.min(fz, d / 2 - 0.35)], 0.04, 0.12, 6);
  }
  for (const s of [-1, 1]) {
    flag(kit, s * (PW / 2 - 0.15), d / 2 - 0.22, 0.9);
    if (!low) car(kit, s * (PW / 2 - 0.55), d / 2 - 0.25, Math.PI / 2, CARS[s > 0 ? 1 : 2]);
    lamp(kit, glow, s * 0.7, d / 2 - 0.2, 0.42);
  }
  kit.box(GREEN_DEEP, [0, PH + 0.13, pz + PD / 2 + 0.01], [1.2, 0.16, 0.02]);
  for (let i = 0; i < 7; i++) kit.box(GOLD, [-0.45 + i * 0.15, PH + 0.13, pz + PD / 2 + 0.024], [0.08, 0.08, 0.008]);
  if (!low) for (let i = 0; i < 4; i++) person(kit, rand, (rand() - 0.5) * 1.2, pz + PD / 2 + 0.25 + rand() * 0.2);
  // Night: the crown lit gold, the podium's sign.
  for (let k = 0; k < 8; k++) {
    const a = oct[k], b = oct[(k + 1) % 8];
    const o = 1.06;
    glow.quad([a[0] * o, TH - 0.4, tz + a[1] * o], [b[0] * o, TH - 0.4, tz + b[1] * o], [b[0] * o, TH + 0.1, tz + b[1] * o], [a[0] * o, TH + 0.1, tz + a[1] * o], [0, 0, 0], [0, 0, 0], scale(WARM, 0.45), scale(WARM, 0.45));
  }
  glow.quad([-0.62, PH + 0.04, pz + PD / 2 + 0.04], [0.62, PH + 0.04, pz + PD / 2 + 0.04], [0.62, PH + 0.22, pz + PD / 2 + 0.04], [-0.62, PH + 0.22, pz + PD / 2 + 0.04], [0.3, 0.38, 0.2]);
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- NNPC Towers ---------- */

// NNPC Towers: four tall blue-green glass blocks round a glazed core, joined by bridges, on one podium. The NNPC
// sign in yellow and green crowns the front pair; a helipad on a back one. Flags and a fountain on the plaza.

function nnpc(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 89 + d * 31));
  kit.box(PAVING, [0, 0.02, 0], [w, 0.04, d]);
  const PW = w - 0.35, PD = d - 0.75, pz = -0.2, PH = 0.35;
  kit.box('#cbd5e1', [0, PH / 2, pz], [PW, PH, PD]);
  kit.box(LINE, [0, PH + 0.015, pz], [PW + 0.04, 0.03, PD + 0.04]);
  panel(kit, glass(), wallsOf(0, pz, PW, PD).front, -PW / 2 + 0.1, PW / 2 - 0.1, 0.05, PH - 0.06);
  const TW = Math.min(0.95, PW * 0.3), TD = Math.min(0.85, PD * 0.38);
  const gx = PW / 2 - TW / 2 - 0.12, gz = PD / 2 - TD / 2 - 0.08;
  const spots: [number, number, number][] = [[-gx, pz - gz, 3.9], [gx, pz - gz, 3.9], [-gx, pz + gz, 3.4], [gx, pz + gz, 3.4]];
  const GLASS_BODY = '#2f6f86';
  for (const [x, z, h] of spots) {
    tower(kit, rand, x, z, TW, TD, PH, h - PH, { body: GLASS_BODY, band: '#e2e8f0', floor: 0.26, bay: 0.16, low, pier: 0.12 });
    kit.box('#e2e8f0', [x, h + 0.04, z], [TW + 0.04, 0.08, TD + 0.04]);
    // White corner piers up each tower.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box('#e2e8f0', [x + sx * (TW / 2 - 0.02), (PH + h) / 2, z + sz * (TD / 2 - 0.02)], [0.06, h - PH, 0.06]);
  }
  // The core between them, lower, all glass, and the bridges.
  kit.box(GLASS_BODY, [0, (PH + 2.4) / 2, pz], [gx * 2 - TW + 0.04, 2.4 - PH, gz * 2 - TD + 0.04]);
  windows(kit, rand, wallsOf(0, pz, gx * 2 - TW + 0.04, 1).front, gx * 2 - TW, { y0: PH, rows: low ? 4 : 8, fh: (2.4 - PH) / (low ? 4 : 8), cols: 2, pw: 0.25, ph: 0.16 });
  kit.box('#e2e8f0', [0, 2.44, pz], [gx * 2 - TW + 0.1, 0.08, gz * 2 - TD + 0.1]);
  for (const y of [1.3, 2.9]) {
    for (const s of [-1, 1]) kit.box('#e2e8f0', [0, y, pz + s * gz], [gx * 2 - TW, 0.14, 0.3]);
  }
  // The NNPC sign on the front towers: yellow board, green letters.
  for (const s of [-1, 1]) {
    const x = s * gx, z = pz + gz + TD / 2;
    kit.box('#facc15', [x, 3.25, z + 0.02], [TW * 0.86, 0.2, 0.03]);
    for (let i = 0; i < 4; i++) kit.box(GREEN, [x - TW * 0.3 + i * TW * 0.2, 3.25, z + 0.04], [0.08, 0.13, 0.01]);
    glow.quad([x - TW * 0.43, 3.15, z + 0.05], [x + TW * 0.43, 3.15, z + 0.05], [x + TW * 0.43, 3.35, z + 0.05], [x - TW * 0.43, 3.35, z + 0.05], [0.5, 0.42, 0.08]);
  }
  helipad(kit, gx, 3.99, pz - gz, Math.min(TW, TD) * 0.42);
  rooftop(kit, rand, -gx, pz - gz, TW * 0.6, TD * 0.5, 3.98, low ? 2 : 4);
  kit.box('lampBeacon', [-gx + TW / 2 - 0.05, 4.02, pz - gz - TD / 2 + 0.05], [0.04, 0.04, 0.04]);
  // The plaza: fountain, flags, cars.
  const fz = d / 2 - 0.35;
  disc(kit, KERB, 0, fz, 0.26, 0.07, 14);
  disc(kit, WATER, 0, fz, 0.22, 0.075, 14);
  kit.post('#e2e8f0', [0, 0.07, fz], 0.03, 0.14, 6);
  for (const s of [-1, 1]) {
    flag(kit, s * 0.48, fz, 0.85);
    if (!low) flag(kit, s * 0.72, fz, 0.85, ['#facc15', GREEN, '#facc15']);
    if (!low) car(kit, s * (w / 2 - 0.35), fz, 0, CARS[Math.floor(rand() * CARS.length)]);
    lamp(kit, glow, s * 1.0, fz + 0.1, 0.42);
  }
  if (!low) for (let i = 0; i < 4; i++) person(kit, rand, (rand() - 0.5) * 1.6, pz + PD / 2 + 0.12 + rand() * 0.15);
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- World Trade Centre ---------- */

// The Abuja World Trade Centre (and the towers of Eko Atlantic): a tall blue-glass tower with its crown sliced at an
// angle under a spire, a shorter twin beside it with a helipad, both on a glass-fronted shopping podium.

function wtc(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 37 + d * 43));
  kit.box(PAVING, [0, 0.02, 0], [w, 0.04, d]);
  const PW = w - 0.3, PD = d - 0.7, pz = -0.2, PH = 0.42;
  kit.box('#cbd5e1', [0, PH / 2, pz], [PW, PH, PD]);
  kit.box(LINE, [0, PH + 0.015, pz], [PW + 0.04, 0.03, PD + 0.04]);
  const pod = wallsOf(0, pz, PW, PD);
  panel(kit, glass(), pod.front, -PW / 2 + 0.06, PW / 2 - 0.06, 0.05, PH - 0.06);
  panel(kit, glass(), pod.left, -PD / 2 + 0.1, PD / 2 - 0.1, 0.05, PH - 0.06);
  panel(kit, glass(), pod.right, -PD / 2 + 0.1, PD / 2 - 0.1, 0.05, PH - 0.06);
  kit.box(LINE, [0, PH - 0.02, pz + PD / 2 + 0.12], [PW * 0.6, 0.03, 0.25]);
  const BODY = '#2c5878';
  // The tall tower, back left.
  const AW = Math.min(1.15, PW * 0.48), AD = Math.min(1.15, PD * 0.48), ax = -PW / 2 + AW / 2 + 0.1, az = pz - PD / 2 + AD / 2 + 0.1, AH = 4.8;
  tower(kit, rand, ax, az, AW, AD, PH, AH - PH, { body: BODY, band: '#e2e8f0', floor: 0.26, bay: 0.16, low, pier: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box('#e2e8f0', [ax + sx * (AW / 2 - 0.015), (PH + AH) / 2, az + sz * (AD / 2 - 0.015)], [0.05, AH - PH, 0.05]);
  // Its crown: a wedge of glass rising from the front edge to the back, framed in white, the spire above.
  const c = (sx: number, sz: number, y: number): V3 => [ax + sx * AW / 2, y, az + sz * AD / 2];
  const CR = 0.6;
  kit.quad(BODY, c(-1, 1, AH), c(1, 1, AH), c(1, -1, AH + CR), c(-1, -1, AH + CR), [0, 1, 1]);
  kit.quad(BODY, c(-1, -1, AH), c(1, -1, AH), c(1, -1, AH + CR), c(-1, -1, AH + CR), [0, 0, -1]);
  for (const sx of [-1, 1]) kit.tri(BODY, c(sx, 1, AH), c(sx, -1, AH), c(sx, -1, AH + CR), [sx, 0, 0]);
  for (const sx of [-1, 1]) kit.bar('#e2e8f0', c(sx, 1, AH + 0.02), c(sx, -1, AH + CR + 0.02), 0.04);
  kit.bar('#e2e8f0', c(-1, -1, AH + CR + 0.02), c(1, -1, AH + CR + 0.02), 0.04);
  kit.bar(STEEL, [ax, AH + CR, az - AD / 2 + 0.08], [ax, AH + CR + 0.7, az - AD / 2 + 0.08], 0.03);
  kit.box('lampBeacon', [ax, AH + CR + 0.72, az - AD / 2 + 0.08], [0.04, 0.04, 0.04]);
  // The shorter tower, front right.
  const BW = Math.min(0.95, PW * 0.42), BD = Math.min(0.95, PD * 0.4), bx = PW / 2 - BW / 2 - 0.08, bz = pz + PD / 2 - BD / 2 - 0.1, BH = 3.5;
  tower(kit, rand, bx, bz, BW, BD, PH, BH - PH, { body: '#3b6f94', band: '#e2e8f0', floor: 0.26, bay: 0.16, low, pier: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box('#e2e8f0', [bx + sx * (BW / 2 - 0.015), (PH + BH) / 2, bz + sz * (BD / 2 - 0.015)], [0.05, BH - PH, 0.05]);
  kit.box('#e2e8f0', [bx, BH + 0.04, bz], [BW + 0.06, 0.08, BD + 0.06]);
  helipad(kit, bx, BH + 0.085, bz, Math.min(BW, BD) * 0.42);
  // A sky bridge between them.
  kit.box('#e2e8f0', [(ax + bx) / 2, 2.2, (az + bz) / 2], [Math.abs(bx - ax), 0.16, 0.24], [0, Math.atan2(bz - az, bx - ax) * -1, 0]);
  // Plaza: palms, flags, taxis.
  const fz = d / 2 - 0.25;
  for (const s of [-1, 1]) {
    palm(kit, rand, s * (w / 2 - 0.25), fz, 0.9, low);
    flag(kit, s * 0.3, fz - 0.05, 0.8);
    lamp(kit, glow, s * 0.75, fz, 0.42);
  }
  if (!low) {
    car(kit, -0.6, fz, Math.PI / 2, '#facc15');
    car(kit, 0.62, fz, -Math.PI / 2, '#111827');
    for (let i = 0; i < 4; i++) person(kit, rand, (rand() - 0.5) * 1.4, pz + PD / 2 + 0.1 + rand() * 0.2);
  }
  // Night: the crown's glass and edges lit cool white.
  glow.quad(c(-1, 1, AH + 0.02), c(1, 1, AH + 0.02), c(1, -1, AH + CR + 0.02), c(-1, -1, AH + CR + 0.02), [0.3, 0.42, 0.55], [0.3, 0.42, 0.55], [0.05, 0.08, 0.12], [0.05, 0.08, 0.12]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) glow.quad([ax + sx * (AW / 2 + 0.03), PH, az + sz * (AD / 2 + 0.03)], [ax + sx * (AW / 2 + 0.03) + (sz * 0.05), PH, az + sz * (AD / 2 + 0.03) - sx * 0.05], [ax + sx * (AW / 2 + 0.03) + (sz * 0.05), AH, az + sz * (AD / 2 + 0.03) - sx * 0.05], [ax + sx * (AW / 2 + 0.03), AH, az + sz * (AD / 2 + 0.03)], [0, 0, 0], [0, 0, 0], [0.4, 0.55, 0.7], [0.4, 0.55, 0.7]);
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- ECOWAS Commission ---------- */

// The ECOWAS headquarters in Asokoro: a white office block curved round a round plaza, bands of glass on every floor,
// the community's emblem in the middle of the plaza and the flags of the fifteen member states in an arc round it.

const ECOWAS_FLAGS: string[][] = [
  [GREEN, FLAG_WHITE, GREEN], ['#16a34a', '#facc15', '#dc2626'], ['#f97316', FLAG_WHITE, '#16a34a'], ['#dc2626', '#facc15', '#16a34a'],
  ['#1d4ed8', FLAG_WHITE, '#dc2626'], ['#dc2626', '#facc15', '#16a34a'], ['#16a34a', '#facc15', '#dc2626'], ['#1d4ed8', '#facc15', '#16a34a'],
  ['#16a34a', FLAG_WHITE, '#1d4ed8'], ['#dc2626', '#facc15', '#16a34a'], ['#dc2626', FLAG_WHITE, '#1d4ed8'], ['#16a34a', FLAG_WHITE, '#f97316'],
  ['#1d4ed8', FLAG_WHITE, '#16a34a'], ['#f97316', FLAG_WHITE, '#16a34a'], ['#dc2626', '#facc15', '#16a34a'],
];

function ecowas(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 29 + d * 59));
  kit.box(LAWN, [0, 0.02, 0], [w, 0.04, d]);
  // The block curves round a centre at the front edge, so it bows back, hugging a fan-shaped plaza.
  const cz = d / 2 - 0.25, R1 = d - 0.5, R0 = R1 - 0.62;
  const span = Math.min(1.1, Math.asin(Math.min(0.98, (w / 2 - 0.2) / R1)));
  const H = 1.7, floors = 5, fh = (H - 0.15) / floors;
  const segs = low ? 10 : 16;
  const at = (a: number, r: number, y: number): V3 => [Math.sin(a) * r, y, cz - Math.cos(a) * r];
  for (let i = 0; i < 16; i++) {
    const a0 = -span + (i / 16) * span * 2, a1 = -span + ((i + 1) / 16) * span * 2;
    kit.tri(PAVING, [0, 0.045, cz], at(a0, R0 - 0.02, 0.045), at(a1, R0 - 0.02, 0.045), [0, 1, 0]);
  }
  kit.flat(PAVING, -0.3, cz, 0.3, d / 2, 0.045);
  for (let i = 0; i < segs; i++) {
    const a0 = -span + (i / segs) * span * 2, a1 = -span + ((i + 1) / segs) * span * 2, am = (a0 + a1) / 2;
    const inN: V3 = [-Math.sin(am), 0, Math.cos(am)], outN: V3 = [Math.sin(am), 0, -Math.cos(am)];
    // The inner face (towards the plaza and the street): white bands between glass.
    kit.quad(WHITE, at(a0, R0, 0), at(a1, R0, 0), at(a1, R0, H), at(a0, R0, H), inN);
    kit.quad(WHITE, at(a0, R1, 0), at(a1, R1, 0), at(a1, R1, H), at(a0, R1, H), outN);
    kit.quad('#e5e7eb', at(a0, R0, H), at(a1, R0, H), at(a1, R1, H), at(a0, R1, H), [0, 1, 0]);
    for (let f = 0; f < floors; f++) {
      const y0 = 0.12 + f * fh + 0.05, y1 = 0.12 + (f + 1) * fh - 0.04;
            kit.quad(glass(), at(a0 + 0.004, R0 - 0.006, y0), at(a1 - 0.004, R0 - 0.006, y0), at(a1 - 0.004, R0 - 0.006, y1), at(a0 + 0.004, R0 - 0.006, y1), inN);
      if (!low && f % 2 === 0) kit.quad(glass(), at(a0 + 0.02, R1 + 0.006, y0), at(a1 - 0.02, R1 + 0.006, y0), at(a1 - 0.02, R1 + 0.006, y1), at(a0 + 0.02, R1 + 0.006, y1), outN);
    }
    // A green cornice and the fins between bays.
    kit.quad(GREEN, at(a0, R0 - 0.02, H - 0.02), at(a1, R0 - 0.02, H - 0.02), at(a1, R0 - 0.02, H + 0.08), at(a0, R0 - 0.02, H + 0.08), inN);
    if (!low) kit.bar(WHITE, at(a0, R0 - 0.03, 0.1), at(a0, R0 - 0.03, H), 0.035);
  }
  for (const s of [-1, 1]) {
    const a = s * span;
    kit.quad(WHITE, at(a, R0, 0), at(a, R1, 0), at(a, R1, H), at(a, R0, H), [Math.cos(a) * s, 0, Math.sin(a) * s]);
  }
  // A rooftop pavilion at the middle of the bow and a glass entrance hall below it.
  kit.box('#e5e7eb', [0, H + 0.12, cz - (R0 + R1) / 2], [0.7, 0.24, 0.4]);
  kit.box(GREEN, [0, H + 0.26, cz - (R0 + R1) / 2], [0.8, 0.04, 0.5]);
  const ez = cz - R0 + 0.1;
  kit.box(WHITE, [0, 0.62, ez], [0.9, 0.06, 0.36]);
  panel(kit, glass(), { x: 0, z: ez + 0.13, ax: 'x', n: 1 }, -0.35, 0.35, 0.05, 0.58);
  for (const s of [-1, 1]) column(kit, WHITE, s * 0.4, 0, ez + 0.15, 0.6, 0.03, low);
  // The emblem: a green disc with the yellow ring and the member states' link.
  const mz = cz - R0 * 0.48;
  disc(kit, '#e5e7eb', 0, mz, 0.34, 0.05, 20);
  disc(kit, GREEN, 0, mz, 0.27, 0.06, 20);
  disc(kit, '#facc15', 0, mz, 0.22, 0.065, 20, 0.16);
  disc(kit, GREEN_DEEP, 0, mz, 0.1, 0.07, 12);
  // Fifteen flags in an arc round the plaza (eight in low mode).
  const n = low ? 8 : 15;
  for (let i = 0; i < n; i++) {
    const a = -span * 0.86 + (i / (n - 1)) * span * 1.72;
    const p = at(a, R0 - 0.3, 0);
    flag(kit, p[0], p[2], 0.8, ECOWAS_FLAGS[i % ECOWAS_FLAGS.length], 0.75);
  }
  // Trees behind and round the sides, a couple of diplomatic cars on the drive.
  for (const s of [-1, 1]) {
    tree(kit, rand, s * (w / 2 - 0.25), -d / 2 + 0.3, 0.9);
    tree(kit, rand, s * (w / 2 - 0.25), d / 2 - 0.3, 0.8);
    const lp = at(s * span * 0.5, R0 * 0.55, 0);
    lamp(kit, glow, lp[0], lp[2], 0.42);
  }
  if (!low) {
    car(kit, -0.12, d / 2 - 0.25, Math.PI, '#111827');
    car(kit, 0.12, cz - 0.1, Math.PI, '#e5e7eb');
    for (let i = 0; i < 4; i++) person(kit, rand, (rand() - 0.5) * 0.9, mz + 0.4 + rand() * 0.25);
  }
  // Night: the curve floodlit from the plaza.
  for (let i = 0; i < segs; i++) {
    const a0 = -span + (i / segs) * span * 2, a1 = -span + ((i + 1) / segs) * span * 2;
    glow.quad(at(a0, R0 - 0.03, 0.05), at(a1, R0 - 0.03, 0.05), at(a1, R0 - 0.03, H), at(a0, R0 - 0.03, H), scale(WARM, 0.25), scale(WARM, 0.25), [0, 0, 0], [0, 0, 0]);
  }
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- National Assembly ---------- */

// The National Assembly: the great green dome on a drum ringed with white columns, raised on a square white base with
// a pointed-arch arcade, the Senate and House wings either side, a grand stair and a long pool on the forecourt, the
// flag on the lantern. The dome is ribbed in white and glows from below at night.

function nass(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 23 + d * 67));
  kit.box(PAVING, [0, 0.02, 0], [w, 0.04, d]);
  const zc = -d / 2 + 1.35;
  const B = Math.min(2.5, w * 0.42), BH = 0.95;
  // Lawns at the front corners, the pool up the middle of the forecourt.
  const zf = zc + B / 2;
  for (const s of [-1, 1]) {
    kit.flat(LAWN, s * 0.5, zf + 0.55, s * (w / 2 - 0.1), d / 2 - 0.1, 0.045);
    // Hedged lawns with rows of trees down the pool's sides.
    kit.box(HEDGE, [s * 0.52, 0.07, (zf + 0.55 + d / 2 - 0.1) / 2], [0.06, 0.08, d / 2 - 0.65 - zf]);
    const rows = Math.max(1, Math.floor((d / 2 - 0.3 - zf - 0.7) / 0.42));
    for (let i = 0; i <= rows; i++) tree(kit, rand, s * 0.72, zf + 0.75 + i * 0.42, 0.75);
    if (!low) for (let i = 0; i <= rows; i++) tree(kit, rand, s * (w / 2 - 0.35), zf + 0.75 + i * 0.42, 0.8);
  }
  kit.box(KERB, [0, 0.055, (zf + 0.6 + d / 2 - 0.15) / 2], [0.6, 0.05, d / 2 - 0.15 - zf - 0.6]);
  kit.flat(WATER, -0.26, zf + 0.62, 0.26, d / 2 - 0.17, 0.085);
  for (let i = 0; i < (low ? 2 : 4); i++) kit.post(LINE, [0, 0.08, zf + 0.75 + i * ((d / 2 - zf - 1) / 3)], 0.02, 0.1, 5, 0.3);
  // The wings: long and low, flat roofs with a green fascia, arcades of windows.
  const WW = Math.max(0.6, (w - B) / 2 - 0.25), WD = Math.min(d - 1.6, 2.2), WH = 0.7;
  for (const s of [-1, 1]) {
    const x = s * (B / 2 + 0.1 + WW / 2);
    kit.box(WHITE, [x, WH / 2, zc], [WW, WH, WD]);
    kit.box(GREEN, [x, WH + 0.03, zc], [WW + 0.08, 0.06, WD + 0.08]);
    kit.box('#e5e7eb', [x, WH + 0.065, zc], [WW - 0.06, 0.012, WD - 0.06]);
    const wl = wallsOf(x, zc, WW, WD);
    windows(kit, rand, wl.front, WW - 0.1, { y0: 0.06, rows: 2, fh: 0.3, cols: Math.round(WW / (low ? 0.3 : 0.2)), pw: 0.1, ph: 0.2, sill: low ? undefined : TRIM });
    windows(kit, rand, s > 0 ? wl.right : wl.left, WD - 0.2, { y0: 0.06, rows: 2, fh: 0.3, cols: Math.round(WD / (low ? 0.36 : 0.24)), pw: 0.1, ph: 0.2 });
    // The chambers' roof lights over the Senate's red and the House's green.
    kit.box('#cbd5e1', [x, WH + 0.09, zc], [WW * 0.56, 0.04, WD * 0.46]);
    kit.box(s > 0 ? '#14532d' : '#7f1d1d', [x, WH + 0.115, zc], [WW * 0.46, 0.02, WD * 0.36]);
    if (!low) tree(kit, rand, s * (w / 2 - 0.25), -d / 2 + 0.3, 0.8);
  }
  // The base: white, a pointed-arch arcade on every side.
  kit.box(WHITE, [0, BH / 2, zc], [B, BH, B]);
  kit.box(TRIM, [0, BH + 0.03, zc], [B + 0.08, 0.06, B + 0.08]);
  const walls = wallsOf(0, zc, B, B);
  const arches = low ? 5 : 7;
  for (const [k, wl] of Object.entries(walls)) {
    if (k === 'left' || k === 'right') continue;
    for (let i = 0; i < arches; i++) {
      const u = -B / 2 + (B / arches) * (i + 0.5), aw = (B / arches) * 0.55;
      kit.quad(OPENING, wpt(wl, u - aw / 2, 0.08), wpt(wl, u + aw / 2, 0.08), wpt(wl, u + aw / 2, 0.55), wpt(wl, u - aw / 2, 0.55), wout(wl));
      kit.tri(OPENING, wpt(wl, u - aw / 2, 0.55), wpt(wl, u + aw / 2, 0.55), wpt(wl, u, 0.72), wout(wl));
      panel(kit, glass(), wl, u - aw * 0.32, u + aw * 0.32, 0.12, 0.5, 0.01);
    }
  }
  // The grand stair up to the arcade.
  steps(kit, STONE, 0, zf + 0.5, B * 0.7, 0.16, 5, 0.1);
  // The drum, ringed with columns, then the dome with its white ribs and the lantern.
  const R = B * 0.4, dy = BH + 0.06, DH = 0.42;
  kit.post(WHITE, [0, dy, zc], R * 0.92, DH, 20);
  kit.post(TRIM, [0, dy + DH, zc], R * 1.04, 0.05, 20);
  const nc = low ? 12 : 18;
  for (let i = 0; i < nc; i++) {
    const a = (i / nc) * TAU;
    kit.post(WHITE, [Math.cos(a) * R, dy, zc + Math.sin(a) * R], 0.03, DH, low ? 4 : 6);
  }
  const by = dy + DH + 0.05, seg = low ? 16 : 24;
  const prof: [number, number][] = [[R * 1.0, 0], [R * 0.98, R * 0.2], [R * 0.92, R * 0.4], [R * 0.8, R * 0.6], [R * 0.62, R * 0.78], [R * 0.4, R * 0.9], [R * 0.16, R * 0.97], [0, R * 0.99]];
  lathe(kit, (i) => (i % 2 ? '#15803d' : '#178a43'), [0, by, zc], prof, seg);
  const ribs = low ? 8 : 12;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * TAU;
    for (let j = 0; j < prof.length - 2; j++) {
      const p = (k: number): V3 => [Math.cos(a) * (prof[k][0] + 0.012), by + prof[k][1] + 0.01, zc + Math.sin(a) * (prof[k][0] + 0.012)];
      kit.bar(WHITE, p(j), p(j + 1), 0.022);
    }
  }
  const ly = by + R * 0.99;
  kit.post(WHITE, [0, ly - 0.02, zc], 0.1, 0.16, 8);
  lathe(kit, GREEN, [0, ly + 0.14, zc], [[0.12, 0], [0.08, 0.06], [0, 0.1]], 8);
  flag(kit, 0, zc, ly + 0.55, NIGERIA, 0.9);
  // Flags along the front, the members' cars to the sides.
  for (const s of [-1, 1]) {
    flag(kit, s * 0.38, zf + 0.45, 0.95);
    lamp(kit, glow, s * 0.42, d / 2 - 0.25, 0.42);
    if (!low) {
      const x0 = s * (B / 2 + 0.25), x1 = s * (w / 2 - 0.15);
      const zz = zc + WD / 2 + 0.1;
      if (zz + 0.4 < d / 2) parking(kit, rand, Math.min(x0, x1), Math.max(x0, x1), zz, zz + 0.4, 0.75, -1);
    }
  }
  if (!low) for (let i = 0; i < 6; i++) person(kit, rand, (rand() - 0.5) * B * 0.6, zf + 0.15 + rand() * 0.35);
  // Night: the dome lit from below, the arcade glowing.
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p = (a: number, k: number, o: number): V3 => [Math.cos(a) * (prof[k][0] + o), by + prof[k][1], zc + Math.sin(a) * (prof[k][0] + o)];
    glow.quad(p(a0, 0, 0.03), p(a1, 0, 0.03), p(a1, 3, 0.03), p(a0, 3, 0.03), scale([0.6, 1, 0.7], 0.3), scale([0.6, 1, 0.7], 0.3), [0, 0, 0], [0, 0, 0]);
  }
  wash(glow, walls.front, -B / 2, B / 2, 0.05, BH, scale(WARM, 0.3));
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- National Mosque ---------- */

// The Abuja National Mosque: the great golden dome on a drum of windows over a square prayer hall with pointed-arch
// arcades, four small gold domes at its corners, a courtyard and fountain in front, and the four slender minarets at
// the corners of the grounds, their balconies lit at night.

function nationalMosque(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 47 + d * 83));
  const MARBLE = '#efe9dc';
  kit.box(MARBLE, [0, 0.02, 0], [w, 0.04, d]);
  const S = Math.min(2.7, w - 2.1, d - 1.6), zc = -d / 2 + 0.45 + S / 2, HH = 0.95;
  // The courtyard: paving, a fountain, arcades either side.
  const zf = zc + S / 2;
  kit.flat(PAVING, -S / 2, zf, S / 2, d / 2 - 0.1, 0.045);
  const fz = (zf + d / 2) / 2;
  lathe(kit, KERB, [0, 0.04, fz], [[0.3, 0], [0.3, 0.07], [0.26, 0.07]], 8);
  disc(kit, WATER, 0, fz, 0.26, 0.09, 8);
  kit.post(KERB, [0, 0.04, fz], 0.05, 0.16, 8);
  lathe(kit, GOLD, [0, 0.2, fz], [[0.07, 0], [0.05, 0.04], [0, 0.07]], 8);
  for (const s of [-1, 1]) {
    const x = s * (S / 2 + 0.12);
    const len = d / 2 - 0.1 - zf;
    kit.box(CREAM, [x, 0.22, zf + len / 2], [0.22, 0.44, len]);
    kit.box(TRIM, [x, 0.46, zf + len / 2], [0.26, 0.04, len + 0.02]);
    const wl: Wall = { x: x - s * 0.11, z: zf + len / 2, ax: 'z', n: (-s) as 1 | -1 };
    const n = Math.max(2, Math.round(len / 0.24));
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (len / n) * (i + 0.5), aw = (len / n) * 0.55;
      kit.quad(OPENING, wpt(wl, u - aw / 2, 0.04), wpt(wl, u + aw / 2, 0.04), wpt(wl, u + aw / 2, 0.26), wpt(wl, u - aw / 2, 0.26), wout(wl));
      kit.tri(OPENING, wpt(wl, u - aw / 2, 0.26), wpt(wl, u + aw / 2, 0.26), wpt(wl, u, 0.34), wout(wl));
    }
  }
  // The prayer hall.
  kit.box(CREAM, [0, HH / 2, zc], [S, HH, S]);
  kit.box(TRIM, [0, HH + 0.03, zc], [S + 0.08, 0.06, S + 0.08]);
  const hall = wallsOf(0, zc, S, S);
  for (const [k, wl] of Object.entries(hall)) {
    if (k === 'back') continue;
    const n = low ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const u = -S / 2 + (S / n) * (i + 0.5), aw = (S / n) * 0.5;
      const big = k === 'front' && i === (n - 1) / 2;
      const top = big ? 0.66 : 0.5;
      kit.quad(big ? DOOR : OPENING, wpt(wl, u - aw / 2, 0.06), wpt(wl, u + aw / 2, 0.06), wpt(wl, u + aw / 2, top), wpt(wl, u - aw / 2, top), wout(wl));
      kit.tri(big ? DOOR : OPENING, wpt(wl, u - aw / 2, top), wpt(wl, u + aw / 2, top), wpt(wl, u, top + 0.16), wout(wl));
      if (!big) panel(kit, glass(), wl, u - aw * 0.3, u + aw * 0.3, 0.6, 0.78, 0.008);
    }
    if (k === 'front') {
      // A tall entrance frame round the main door, green and gold.
      panel(kit, '#0f766e', wl, -S / 14 - 0.08, S / 14 + 0.08, 0.04, 0.88, 0.004);
      panel(kit, GOLD, wl, -S / 14 - 0.08, S / 14 + 0.08, 0.86, 0.9, 0.008);
    }
  }
  // Small gold domes at the hall's corners.
  const sd = S * 0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (S / 2 - sd - 0.05), z = zc + sz * (S / 2 - sd - 0.05);
    kit.post(CREAM, [x, HH + 0.06, z], sd * 1.05, 0.08, 10);
    lathe(kit, GOLD, [x, HH + 0.14, z], [[sd, 0], [sd * 0.9, sd * 0.45], [sd * 0.6, sd * 0.8], [0, sd * 1.05]], low ? 8 : 10);
  }
  // The drum and the great dome, pointed a little at the crown, ribbed in deeper gold, the crescent on top.
  const R = S * 0.36, dy = HH + 0.06;
  kit.post(CREAM, [0, dy, zc], R * 1.02, 0.3, 20);
  kit.post(TRIM, [0, dy + 0.3, zc], R * 1.08, 0.04, 20);
  const dn = low ? 10 : 16;
  for (let i = 0; i < dn; i++) {
    const a = (i / dn) * TAU + 0.1;
    const wl: Wall = { x: Math.cos(a) * R * 1.02, z: zc + Math.sin(a) * R * 1.02, ax: 'x', n: 1 };
    const ta: V3 = [-Math.sin(a), 0, Math.cos(a)];
    const out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const hwid = 0.05;
    const P = (u: number, y: number): V3 => [wl.x + ta[0] * u + out[0] * 0.006, y, wl.z + ta[2] * u + out[2] * 0.006];
    kit.quad(glass(), P(-hwid, dy + 0.06), P(hwid, dy + 0.06), P(hwid, dy + 0.22), P(-hwid, dy + 0.22), out);
  }
  const by = dy + 0.34, seg = low ? 16 : 24;
  const prof: [number, number][] = [[R * 1.04, 0], [R * 1.06, R * 0.22], [R * 1.0, R * 0.45], [R * 0.86, R * 0.68], [R * 0.64, R * 0.88], [R * 0.36, R * 1.04], [R * 0.12, R * 1.14], [0, R * 1.2]];
  lathe(kit, (i) => (i % 2 ? GOLD : '#dcae2a'), [0, by, zc], prof, seg);
  const ribs = low ? 8 : 12;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * TAU;
    for (let j = 0; j < prof.length - 2; j++) {
      const p = (k: number): V3 => [Math.cos(a) * (prof[k][0] + 0.01), by + prof[k][1] + 0.008, zc + Math.sin(a) * (prof[k][0] + 0.01)];
      kit.bar(GOLD_DEEP, p(j), p(j + 1), 0.02);
    }
  }
  const top = by + R * 1.2;
  kit.post(GOLD, [0, top - 0.02, zc], 0.02, 0.3, 5);
  kit.shape(GOLD, ICO, [0, top + 0.1, zc], [0.045, 0.045, 0.045]);
  // The crescent: a few gold blocks bent round, facing the street.
  for (let i = 0; i < 5; i++) {
    const a = -1.1 + (i / 4) * 2.2;
    kit.box(GOLD, [Math.sin(a) * 0.08, top + 0.33 + Math.cos(a) * 0.08 - 0.08, zc], [0.035, 0.03, 0.015], [0, 0, -a]);
  }
  // The four minarets: octagonal shafts, two balconies, a slimmer top stage and a gold spike.
  const mx = w / 2 - 0.42, mz = d / 2 - 0.42;
  const MH = 3.9;
  for (const [x, z] of [[-mx, -mz], [mx, -mz], [-mx, mz], [mx, mz]]) {
    kit.box(CREAM, [x, 0.1, z], [0.42, 0.2, 0.42]);
    const ms = low ? 6 : 8;
    kit.post(CREAM, [x, 0.2, z], 0.15, MH * 0.62, ms, 0.85);
    for (const [y, r] of [[MH * 0.5, 0.21], [MH * 0.78, 0.17]] as [number, number][]) {
      kit.post(TRIM, [x, y, z], r, 0.06, ms);
      if (!low) kit.post(CREAM, [x, y + 0.06, z], r * 0.98, 0.05, ms);
      kit.post('lampMinaret', [x, y + 0.11, z], r * 0.62, 0.05, ms);
    }
    kit.post(CREAM, [x, MH * 0.62 + 0.2, z], 0.1, MH * 0.34, ms, 0.8);
    kit.post(TRIM, [x, MH * 0.96 + 0.2, z], 0.11, 0.05, ms);
    kit.shape(GOLD, unitCyl(ms, 0), [x, MH + 0.2 + 0.25, z], [0.1, 0.5, 0.1]);
    kit.post(GOLD, [x, MH + 0.7, z], 0.012, 0.18, 4);
  }
  // Palms along the front and round the hall, worshippers in the courtyard.
  for (const s of [-1, 1]) {
    palm(kit, rand, s * (w / 2 - 0.4), 0.1, 1, low);
    palm(kit, rand, s * (S / 2 + 0.45), zc - S / 2 + 0.2, 1, low);
    if (!low) palm(kit, rand, s * (S / 2 + 0.55), zc, 0.9, low);
    lamp(kit, glow, s * 0.45, d / 2 - 0.2, 0.42);
  }
  if (!low) {
    for (let i = 0; i < 10; i++) {
      const x = (rand() - 0.5) * (S - 0.4), z = zf + 0.1 + rand() * (d / 2 - zf - 0.3);
      if (Math.hypot(x, z - fz) < 0.36) continue;
      kit.box(i % 3 ? FLAG_WHITE : '#e7e5e4', [x, 0.08, z], [0.05, 0.11, 0.04]);
      kit.box(SKIN, [x, 0.16, z], [0.035, 0.035, 0.035]);
    }
  }
  // Night: the dome floodlit gold from its foot, the hall's face lit.
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p = (a: number, k: number, o: number): V3 => [Math.cos(a) * (prof[k][0] + o), by + prof[k][1], zc + Math.sin(a) * (prof[k][0] + o)];
    glow.quad(p(a0, 0, 0.03), p(a1, 0, 0.03), p(a1, 4, 0.03), p(a0, 4, 0.03), scale([1, 0.8, 0.4], 0.38), scale([1, 0.8, 0.4], 0.38), [0, 0, 0], [0, 0, 0]);
  }
  wash(glow, hall.front, -S / 2, S / 2, 0.05, HH, scale(WARM, 0.3));
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- Secretariat ---------- */

// The Federal Secretariat (and the state secretariats and police commands): a long six-storey slab of offices with
// a taller stair-and-lift core in the middle carrying the green name band, sunshade fins over every window row,
// black water tanks and air-conditioners on the roof, a car park out front with a gatehouse and a queue at the door.

function secretariat(w: number, d: number, low: boolean): Built {
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 13 + d * 101));
  kit.box(PAVING_DARK, [0, 0.02, 0], [w, 0.04, d]);
  const W = w - 0.7, D = clamp(d * 0.3, 1.0, 1.35), zc = -d / 2 + 0.3 + D / 2, H = 2.5, floors = 6;
  const fh = (H - 0.1) / floors;
  const BODY = '#ece6d8';
  // Wings go back from each end where there is room, making a U behind.
  kit.box(BODY, [0, H / 2, zc], [W, H, D]);
  const wl = wallsOf(0, zc, W, D);
  const cols = Math.round(W / (low ? 0.36 : 0.24));
  const core = 0.7;
  const inCore = (c: number) => Math.abs(-W / 2 + (W / cols) * (c + 0.5)) < core / 2 + 0.05;
  windows(kit, rand, wl.front, W, { y0: 0.1, rows: floors, fh, cols, pw: (W / cols) * 0.62, ph: fh * 0.55, skip: (c) => inCore(c) });
  windows(kit, rand, wl.back, W, { y0: 0.1, rows: floors, fh, cols: Math.round(cols * 0.6), pw: (W / cols) * 0.7, ph: fh * 0.55 });
  for (const s of [wl.left, wl.right]) windows(kit, rand, s, D, { y0: 0.1, rows: floors, fh, cols: Math.max(2, Math.round(D / 0.3)), pw: 0.12, ph: fh * 0.55 });
  // Sunshade fins: a ledge over every row of windows on the front.
  for (let f = 1; f <= floors; f++) {
    const y = 0.1 + f * fh - fh * 0.12;
    for (const s of [-1, 1]) {
      const x0 = s * (core / 2 + 0.02), x1 = s * W / 2;
      kit.box(TRIM, [(x0 + x1) / 2, y, zc + D / 2 + 0.04], [Math.abs(x1 - x0), 0.025, 0.08]);
    }
  }
  if (!low) for (let i = 0; i <= cols; i += 2) {
    const x = -W / 2 + (W / cols) * i;
    if (Math.abs(x) < core / 2 + 0.05) continue;
    kit.box(TRIM, [x, H / 2, zc + D / 2 + 0.03], [0.025, H - 0.1, 0.06]);
  }
  kit.box(TRIM, [0, H + 0.03, zc], [W + 0.06, 0.06, D + 0.06]);
  kit.box('#9ca3af', [0, H + 0.065, zc], [W - 0.06, 0.01, D - 0.06]);
  // The core: a taller block in the middle with a strip of glass up the stairwell and the green name band.
  const CH = H + 0.45;
  kit.box('#e2dccd', [0, CH / 2, zc + 0.06], [core, CH, D + 0.12]);
  const cw: Wall = { x: 0, z: zc + D / 2 + 0.12, ax: 'x', n: 1 };
  for (let f = 0; f < floors; f++) panel(kit, glass(), cw, -0.12, 0.12, 0.45 + f * fh, 0.35 + (f + 1) * fh);
  panel(kit, GREEN, cw, -core / 2 + 0.02, core / 2 - 0.02, H + 0.1, H + 0.36, 0.008);
  for (let i = 0; i < 5; i++) panel(kit, FLAG_WHITE, cw, -0.24 + i * 0.12 - 0.035, -0.24 + i * 0.12 + 0.035, H + 0.16, H + 0.3, 0.012);
  kit.box(TRIM, [0, CH + 0.03, zc + 0.06], [core + 0.06, 0.06, D + 0.18]);
  // The entrance: a canopy on two posts over the steps, glass doors.
  const ez = zc + D / 2 + 0.12;
  panel(kit, glass(), cw, -0.24, 0.24, 0.06, 0.38, 0.01);
  kit.box(WHITE, [0, 0.44, ez + 0.22], [0.8, 0.05, 0.46]);
  for (const s of [-1, 1]) kit.post(WHITE, [s * 0.35, 0, ez + 0.4], 0.025, 0.42, 6);
  steps(kit, STONE, 0, ez + 0.2, 0.7, 0.06, 2, 0.06);
  // Rooftop: the black water tanks every Nigerian office has, air-conditioners, a dish.
  const tanks = Math.max(2, Math.round(W / 1.2));
  for (let i = 0; i < tanks; i++) {
    const x = -W / 2 + 0.35 + (i * (W - 0.7)) / Math.max(1, tanks - 1);
    if (Math.abs(x) < core / 2 + 0.15) continue;
    kit.post('#111827', [x, H + 0.07, zc - D / 4], 0.1, 0.18, 8);
    kit.box(STEEL, [x, H + 0.06, zc - D / 4], [0.24, 0.02, 0.24]);
  }
  if (!low) {
    rooftop(kit, rand, 0, zc + D * 0.15, W * 0.8, D * 0.3, H + 0.07, 8);
    kit.shape('#e5e7eb', unitCyl(8, 1), [W / 2 - 0.3, H + 0.2, zc + D * 0.25], [0.12, 0.02, 0.12], [-0.7, 0, 0]);
    kit.post(STEEL, [W / 2 - 0.3, H + 0.07, zc + D * 0.25], 0.012, 0.1, 4);
  }
  // The car park: two rows either side of the drive up to the door, a gatehouse and a boom at the street.
  const pz0 = zc + D / 2 + 0.75, pz1 = d / 2 - 0.12;
  kit.flat(ASPHALT, -0.28, ez + 0.4, 0.28, d / 2, 0.046);
  if (pz1 - pz0 > 0.35) {
    for (const s of [-1, 1]) {
      const x0 = s * 0.38, x1 = s * (w / 2 - 0.15);
      const rows = pz1 - pz0 > 0.85 ? 2 : 1;
      for (let r = 0; r < rows; r++) {
        const z0 = pz0 + r * 0.45;
        parking(kit, rand, Math.min(x0, x1), Math.max(x0, x1), z0, z0 + 0.4, low ? 0.4 : 0.8, r ? -1 : 1);
      }
    }
  }
  const gx = 0.48, gz = d / 2 - 0.2;
  kit.box(WHITE, [gx, 0.12, gz], [0.22, 0.24, 0.2]);
  kit.box(GREEN, [gx, 0.26, gz], [0.28, 0.03, 0.26]);
  kit.box(RED, [0.16, 0.14, gz], [0.4, 0.02, 0.02]);
  for (const s of [-1, 1]) {
    flag(kit, s * 0.45, ez + 0.45, 1.05);
    lamp(kit, glow, s * 0.32, (ez + d / 2) / 2 + 0.2, 0.42);
    tree(kit, rand, s * (w / 2 - 0.22), zc - D / 2 - 0.05, 0.8);
  }
  // The queue at the door and the people waiting under the canopy.
  if (!low) for (let i = 0; i < 9; i++) person(kit, rand, (i % 2 ? 0.06 : -0.06) + (rand() - 0.5) * 0.04, ez + 0.35 + i * 0.09);
  // Night: the core floodlit, the name band glowing.
  wash(glow, cw, -core / 2, core / 2, 0.05, CH, scale(WARM, 0.28));
  glow.quad(wpt(cw, -core / 2, H + 0.1, 0.02), wpt(cw, core / 2, H + 0.1, 0.02), wpt(cw, core / 2, H + 0.36, 0.02), wpt(cw, -core / 2, H + 0.36, 0.02), [0.12, 0.42, 0.2]);
  return { parts: kit.build(), glow: glow.build() };
}

/* ---------- The models ---------- */

export const GovHouseModel = model(govHouse);
export const AsoRockModel = model(asoRock);
export const ZumaRockModel = model(zumaRock);
export const CityGateModel = model(cityGate);
export const SupremeCourtModel = model(supremeCourt);
export const CbnModel = model(cbn);
export const NnpcModel = model(nnpc);
export const WtcModel = model(wtc);
export const EcowasModel = model(ecowas);
export const NassModel = model(nass);
export const NationalMosqueModel = model(nationalMosque);
export const SecretariatModel = model(secretariat);
