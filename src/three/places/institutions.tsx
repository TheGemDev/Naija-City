// Institutions, transport and industry on the city map, rebuilt the way the stadium was (Stadium.tsx): the schools,
// campuses and polytechnics, the defence academy, hospitals, churches and mosques, the tech hub, motor parks,
// airports, jetties, the port, the flyover, the refinery, the textile mill and Computer Village.
//
// Each is made with the place kit (placeKit.tsx): every part is merged into one geometry per colour, so a whole
// building is a handful of plain meshes that the map's StaticBatch folds into the town's own buckets. Windows are
// 'glass' parts and lamps 'lamp' parts, so they light up with the town after dark; lit signs, floodlight pools and the
// refinery's flare go in the night-only Glow.
//
// Every model is centred on its footprint (w along x, d along z), sits on y=0 and has its door on the +z side. The map
// camera looks almost straight down from the south, so roofs and outlines carry each place (the U of blue school
// roofs, a red parade ground, a cross on the hospital roof, a green dome), and the fronts carry the detail. Low
// performance mode leaves out the people, most parked vehicles, roof ribs, mullions and small trim.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { IcosahedronGeometry, Matrix4, SphereGeometry, Vector3, type BufferGeometry, type Group } from 'three';
import { clamp, frame, Glow, Kit, KitModel, prep, rng, scale, unitCyl, type Built, type RGB, type V3 } from '../placeKit';
import { plantTree, shadeKind } from '../trees';
import { seedAt } from '../StaticBatch';

/* ---------- Colours shared across the group ---------- */

const DARK = '#1f2937';
const SHADOW = '#2b2b30';
const STEEL = '#94a3b8';
const CONCRETE = '#a8a29e';
const SLAB = '#cfc8ba';
const PAVING = '#d6d0c4';
const ASPHALT = '#4b5563';
const LINE = '#f8fafc';
const AMBER = '#facc15';
const GREEN = '#15803d';
const WHITE = '#f4f6f8';
const RED = '#dc2626';
const GOLD = '#eab308';
const LAWN = '#8fb86a';
const LATERITE = '#c98b5e';
const SAND = '#dcc39a';
const SKIN = ['#5b3a24', '#6b4226', '#4a2e1c'];
const CLOTHES = ['#dc2626', '#2563eb', '#facc15', '#16a34a', '#f97316', '#f8fafc', '#7c3aed', '#0f172a', '#db2777', '#0d9488'];
const WATER_TANK = '#111827';
const CAR_GLASS = '#334155';
const CARS = ['#f8fafc', '#1e293b', '#9ca3af', '#b91c1c', '#1d4ed8', '#0f766e', '#a16207'];
const WARM: RGB = [1, 0.86, 0.6];

/* ---------- Shapes made on first use ---------- */

// Made lazily: placeKit may still be loading when this file is (they import each other through cityModels).
let hemi: BufferGeometry | undefined;
let hemiLo: BufferGeometry | undefined;
let ball: BufferGeometry | undefined;
let globe: BufferGeometry | undefined;
/** A half sphere of radius 1 standing on y=0. */
const HEMI = (low: boolean) =>
  low ? (hemiLo ??= prep(new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2))) : (hemi ??= prep(new SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)));
/** A rough ball of radius 1 (20 faces): flower beds, finials, bundles. */
const BALL = () => (ball ??= prep(new IcosahedronGeometry(1, 0)));
/** A round ball of radius 1: gas spheres. */
const GLOBE = () => (globe ??= prep(new SphereGeometry(1, 12, 8)));

/* ---------- Drawing in a local frame ---------- */

const _v = new Vector3();
/** A frame at (x, y, z) turned `yaw` about the vertical. */
const F = (x: number, z: number, yaw = 0, y = 0) => frame([x, y, z], [0, yaw, 0]);
/** `f` moved by (x, y, z) in its own axes. */
const shift = (f: Matrix4, x: number, y: number, z: number) => f.clone().multiply(new Matrix4().makeTranslation(x, y, z));
function pt(f: Matrix4 | undefined, p: V3): V3 {
  if (!f) return p;
  _v.set(p[0], p[1], p[2]).applyMatrix4(f);
  return [_v.x, _v.y, _v.z];
}
function nd(f: Matrix4 | undefined, n: V3): V3 {
  if (!f) return n;
  _v.set(n[0], n[1], n[2]).transformDirection(f);
  return [_v.x, _v.y, _v.z];
}
function quad(k: Kit, key: string, a: V3, b: V3, c: V3, d: V3, out: V3, f?: Matrix4) {
  k.quad(key, pt(f, a), pt(f, b), pt(f, c), pt(f, d), nd(f, out));
}
function tri(k: Kit, key: string, a: V3, b: V3, c: V3, out: V3, f?: Matrix4, seed?: number) {
  k.tri(key, pt(f, a), pt(f, b), pt(f, c), nd(f, out), seed);
}
/** A box standing on y0 (its foot), centred on x and z. */
function bx(k: Kit, key: string, x: number, y0: number, z: number, sx: number, sy: number, sz: number, f?: Matrix4) {
  k.box(key, [x, y0 + sy / 2, z], [sx, sy, sz], undefined, f);
}
/** An upright rectangle on a face looking along +z (s = 1) or -z (s = -1). */
function rz(k: Kit, key: string, x0: number, y0: number, x1: number, y1: number, z: number, s = 1, f?: Matrix4) {
  quad(k, key, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, s], f);
}
/** An upright rectangle on a face looking along +x (s = 1) or -x (s = -1). */
function rx(k: Kit, key: string, z0: number, y0: number, z1: number, y1: number, x: number, s = 1, f?: Matrix4) {
  quad(k, key, [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [s, 0, 0], f);
}
/** A flat rectangle on the ground (a marking, a path), x0..x1 by z0..z1 at height y. */
function fl(k: Kit, key: string, x0: number, z0: number, x1: number, z1: number, y: number, f?: Matrix4) {
  quad(k, key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], f);
}

/* ---------- Glow ---------- */

function glowZ(g: Glow, x0: number, y0: number, x1: number, y1: number, z: number, c: RGB, f?: Matrix4, cTop: RGB = c) {
  g.quad(pt(f, [x0, y0, z]), pt(f, [x1, y0, z]), pt(f, [x1, y1, z]), pt(f, [x0, y1, z]), c, c, cTop, cTop);
}
/** A point of light (a lamp seen from afar): a small glowing cross, readable from above and from the side. */
function spark(g: Glow, x: number, y: number, z: number, s: number, c: RGB) {
  g.quad([x - s, y, z], [x + s, y, z], [x + s, y, z + 0.001], [x - s, y, z + 0.001], c);
  for (const [a, b] of [[[x - s, y, z], [x + s, y, z]], [[x, y, z - s], [x, y, z + s]]] as [V3, V3][]) {
    g.tri(a, b, [x, y + s, (a[2] + b[2]) / 2], [0, 0, 0], [0, 0, 0], c);
    g.tri(a, b, [x, y - s, (a[2] + b[2]) / 2], [0, 0, 0], [0, 0, 0], c);
  }
  g.quad([x - s, y, z], [x, y, z - s], [x + s, y, z], [x, y, z + s], c, [0, 0, 0], [0, 0, 0], [0, 0, 0]);
}
/** A pool of light on the ground, bright in the middle and fading to nothing at `r`. */
function pool(g: Glow, x: number, z: number, r: number, c: RGB, y = 0.06, seg = 10) {
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
    g.tri([x, y, z], [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(b) * r, y, z + Math.sin(b) * r], c, [0, 0, 0]);
  }
}

/* ---------- Windows and roofs ---------- */

/** `n` framed windows across a0..a1 on a +z face (s = 1) or -z face at z, y0..y1 tall: louvre blades or a glazing bar in full detail. */
function winZ(k: Kit, n: number, a0: number, a1: number, y0: number, y1: number, z: number, s: number, trim: string, low: boolean, f?: Matrix4, louvre = false) {
  const step = (a1 - a0) / n, gap = Math.min(0.12, step * 0.3);
  for (let i = 0; i < n; i++) {
    const x0 = a0 + i * step + gap / 2, x1 = x0 + step - gap;
    rz(k, trim, x0 - 0.022, y0 - 0.022, x1 + 0.022, y1 + 0.022, z + 0.003 * s, s, f);
    rz(k, 'glass', x0, y0, x1, y1, z + 0.006 * s, s, f);
    if (low) continue;
    if (louvre) for (let j = 1; j < 3; j++) {
      const y = y0 + ((y1 - y0) * j) / 3;
      rz(k, trim, x0, y - 0.007, x1, y + 0.007, z + 0.009 * s, s, f);
    }
    else rz(k, trim, (x0 + x1) / 2 - 0.01, y0, (x0 + x1) / 2 + 0.01, y1, z + 0.009 * s, s, f);
  }
}
/** The same along a ±x face (windows spread along z). */
function winX(k: Kit, n: number, a0: number, a1: number, y0: number, y1: number, x: number, s: number, trim: string, f?: Matrix4) {
  const step = (a1 - a0) / n, gap = Math.min(0.12, step * 0.3);
  for (let i = 0; i < n; i++) {
    const z0 = a0 + i * step + gap / 2, z1 = z0 + step - gap;
    rx(k, trim, z0 - 0.022, y0 - 0.022, z1 + 0.022, y1 + 0.022, x + 0.003 * s, s, f);
    rx(k, 'glass', z0, y0, z1, y1, x + 0.006 * s, s, f);
  }
}
/** Where the bays of a run of glass a0..a1 fall, about `every` wide. */
function bays(a0: number, a1: number, every: number) {
  const n = Math.max(1, Math.round((a1 - a0) / every)), out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a0 + ((a1 - a0) * i) / n);
  return out;
}
/**
 * A run of glass (a ribbon window or a curtain wall) on a ±z face: a pane per bay, so each lights up on its own at
 * night (a room at a time), and mullions between them in full detail.
 */
function bandZ(k: Kit, a0: number, a1: number, y0: number, y1: number, z: number, s: number, mull: string, every: number, low: boolean, f?: Matrix4) {
  const b = bays(a0, a1, every);
  for (let i = 0; i < b.length - 1; i++) {
    rz(k, 'glass', b[i], y0, b[i + 1], y1, z + 0.005 * s, s, f);
    if (!low && i > 0) rz(k, mull, b[i] - 0.012, y0, b[i] + 0.012, y1, z + 0.009 * s, s, f);
  }
}
function bandX(k: Kit, a0: number, a1: number, y0: number, y1: number, x: number, s: number, mull: string, every: number, low: boolean, f?: Matrix4) {
  const b = bays(a0, a1, every);
  for (let i = 0; i < b.length - 1; i++) {
    rx(k, 'glass', b[i], y0, b[i + 1], y1, x + 0.005 * s, s, f);
    if (!low && i > 0) rx(k, mull, b[i] - 0.012, y0, b[i] + 0.012, y1, x + 0.009 * s, s, f);
  }
}

/**
 * A hipped roof over a w×d plan centred in `f`, eaves at y, ridge along the longer side: the usual zinc roof of
 * a Nigerian school, barracks or bungalow. `rib` draws the corrugations up the front and back slopes.
 */
function hipRoof(k: Kit, key: string, w: number, d: number, y: number, rise: number, f: Matrix4, rib?: string) {
  if (w < d) {
    hipRoof(k, key, d, w, y, rise, f.clone().multiply(new Matrix4().makeRotationY(Math.PI / 2)), rib);
    return;
  }
  const hw = w / 2, hd = d / 2, r = hw - hd, top = y + rise;
  quad(k, key, [-hw, y, hd], [hw, y, hd], [r, top, 0], [-r, top, 0], [0, hd, rise], f);
  quad(k, key, [hw, y, -hd], [-hw, y, -hd], [-r, top, 0], [r, top, 0], [0, hd, -rise], f);
  tri(k, key, [-hw, y, -hd], [-hw, y, hd], [-r, top, 0], [-rise, hd, 0], f);
  tri(k, key, [hw, y, hd], [hw, y, -hd], [r, top, 0], [rise, hd, 0], f);
  if (!rib) return;
  for (let u = -hw + 0.1; u < hw - 0.05; u += 0.15) {
    // Up the slope as far as the ridge, or the hip near the ends.
    const reach = Math.abs(u) <= r ? 1 : (hw - Math.abs(u)) / hd;
    for (const s of [1, -1]) {
      const z1 = s * hd * (1 - reach), y1 = y + rise * reach + 0.006;
      quad(k, rib, [u - 0.007, y + 0.006, s * hd], [u + 0.007, y + 0.006, s * hd], [u + 0.007, y1, z1], [u - 0.007, y1, z1], [0, hd, s * rise], f);
    }
  }
}

/** A pitched roof, ridge along x, over walls `len` long and `dep` deep (eaves at y), centred in `f`; the gable ends filled in `wall`. */
function gableRoof(k: Kit, key: string, wall: string, len: number, dep: number, y: number, rise: number, f: Matrix4, eave = 0.1, end = 0.08) {
  const hl = len / 2 + end, hd = dep / 2 + eave, top = y + rise, ye = y - (eave * rise) / (dep / 2);
  quad(k, key, [-hl, ye, hd], [hl, ye, hd], [hl, top, 0], [-hl, top, 0], [0, 1, 1], f);
  quad(k, key, [hl, ye, -hd], [-hl, ye, -hd], [-hl, top, 0], [hl, top, 0], [0, 1, -1], f);
  // The undersides, seen in the close views.
  quad(k, key, [-hl, ye, hd], [hl, ye, hd], [hl, top - 0.02, 0], [-hl, top - 0.02, 0], [0, -1, -1], f);
  quad(k, key, [hl, ye, -hd], [-hl, ye, -hd], [-hl, top - 0.02, 0], [hl, top - 0.02, 0], [0, -1, 1], f);
  for (const s of [-1, 1]) tri(k, wall, [(s * len) / 2, y, -dep / 2], [(s * len) / 2, y, dep / 2], [(s * len) / 2, top, 0], [s, 0, 0], f);
}

/** Half a round tower (an apse, a lecture theatre's back): walls round from +x to -x through -z, a cone of roof over it. */
function halfDrum(k: Kit, wall: string, roof: string, x: number, z: number, r: number, h: number, rise: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI, b = ((i + 1) / n) * Math.PI, m = (a + b) / 2;
    const pa: V3 = [x + Math.cos(a) * r, 0, z - Math.sin(a) * r], pb: V3 = [x + Math.cos(b) * r, 0, z - Math.sin(b) * r];
    const out: V3 = [Math.cos(m), 0, -Math.sin(m)];
    quad(k, wall, pa, pb, [pb[0], h, pb[2]], [pa[0], h, pa[2]], out);
    const ea: V3 = [x + Math.cos(a) * (r + 0.06), h - 0.02, z - Math.sin(a) * (r + 0.06)], eb: V3 = [x + Math.cos(b) * (r + 0.06), h - 0.02, z - Math.sin(b) * (r + 0.06)];
    tri(k, roof, ea, eb, [x, h + rise, z], [out[0], 1, out[2]]);
  }
}

/* ---------- Little things: people, trees, flags, lamps, signs ---------- */

/** Someone standing about: legs, a shirt in `top`, a head. */
function person(k: Kit, x: number, z: number, top: string, legs = DARK, skin = SKIN[0], f?: Matrix4) {
  k.box(legs, [x, 0.06, z], [0.07, 0.12, 0.05], undefined, f);
  k.box(top, [x, 0.165, z], [0.09, 0.1, 0.06], undefined, f);
  k.box(skin, [x, 0.245, z], [0.055, 0.055, 0.055], undefined, f);
}
/** `n` people scattered over a rectangle, in everyday colours (or `palette`). */
function crowd(k: Kit, rand: () => number, n: number, x0: number, z0: number, x1: number, z1: number, palette = CLOTHES) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
    person(k, x, z, palette[Math.floor(rand() * palette.length)], rand() < 0.5 ? DARK : '#374151', SKIN[Math.floor(rand() * 3)]);
  }
}
/** A shade tree from the tree kit (trees.ts): `i` picks neem, mango, or either now and then a flame tree. */
function tree(k: Kit, x: number, z: number, s: number, low: boolean, i = 0) {
  plantTree(k, i % 3 === 0 ? 'neem' : i % 3 === 1 ? 'mango' : shadeKind(x, z), x, z, 0.95 * s, { low });
}
/** A palm from the tree kit, its trunk `h` tall: a coconut, or for odd `i` a shorter, fuller oil palm. */
function palm(k: Kit, x: number, z: number, h: number, low: boolean, i = 0) {
  if (i % 2) plantTree(k, 'oilpalm', x, z, h / 1.1, { low });
  else plantTree(k, 'coconut', x, z, h / 1.3, { low });
}
/** A flagpole on a plinth, its flag in `bands` (Nigeria's green-white-green unless told otherwise). */
function flag(k: Kit, x: number, z: number, h: number, bands = [GREEN, WHITE, GREEN]) {
  bx(k, CONCRETE, x, 0, z, 0.14, 0.06, 0.14);
  k.post(STEEL, [x, 0.06, z], 0.014, h, 5);
  bands.forEach((c, i) => bx(k, c, x + 0.045 + i * 0.07, h - 0.16, z, 0.07, 0.16, 0.008));
}
/** A street lamp: a pole, an arm reaching `arm` along x, a lamp, and the pool of light under it after dark. */
function lampPost(k: Kit, g: Glow, x: number, z: number, h: number, low: boolean, arm = 0.12, r = 0.7) {
  k.post(STEEL, [x, 0, z], 0.016, h, 4);
  k.box(STEEL, [x + arm / 2, h + 0.01, z], [Math.abs(arm) + 0.02, 0.016, 0.016]);
  bx(k, 'lamp', x + arm, h - 0.035, z, 0.1, 0.035, 0.07);
  if (!low) pool(g, x + arm, z, r, scale(WARM, 0.16));
}
/** A tall floodlight mast, its bank of lamps tilted down and turned `yaw` (0 shines towards +z), and its wide pool of light. */
function floodMast(k: Kit, g: Glow, x: number, z: number, h: number, low: boolean, r = 1.6, yaw = 0) {
  const f = F(x, z, yaw);
  k.post(STEEL, [x, 0, z], 0.035, h, 4, 0.6);
  bx(k, DARK, 0, h, 0, 0.32, 0.14, 0.06, f);
  k.box('lamp', [0, h + 0.07, 0.035], [0.28, 0.1, 0.012], [-0.5, 0, 0], f);
  const c = pt(f, [0, 0, r * 0.6]);
  pool(g, c[0], c[2], r, scale(WARM, low ? 0.12 : 0.18), 0.06, 12);
}
/** A square pyramid roof (a tower's cap) on y, `half` its half-width. */
function pyramid(k: Kit, key: string, x: number, y: number, z: number, half: number, h: number) {
  k.shape(key, unitCyl(4, 0), [x, y + h / 2, z], [half * Math.SQRT2, h, half * Math.SQRT2], [0, Math.PI / 4, 0]);
}
/** Letters painted on a sign facing +z: a row of blocks between x0 and x1, a gap now and then between words. */
function letters(k: Kit, key: string, x0: number, x1: number, y: number, h: number, z: number, f?: Matrix4, seed = 3) {
  const lw = h * 0.6, step = h * 0.82;
  const n = Math.max(1, Math.floor((x1 - x0 - lw) / step) + 1);
  const start = (x0 + x1) / 2 - ((n - 1) * step + lw) / 2;
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1 && (i * 5 + seed) % 7 === 3) continue;
    const x = start + i * step;
    rz(k, key, x, y - h / 2, x + lw, y + h / 2, z, 1, f);
  }
}
/** A signboard facing +z: on two legs when `leg` (its foot height) is set, else hung on a wall; lettering; lit at night. */
function signboard(k: Kit, g: Glow, x: number, z: number, w: number, h: number, y: number, board: string, ink: string, glow: RGB | null, leg = 0, f?: Matrix4) {
  if (leg) for (const s of [-1, 1]) bx(k, STEEL, x + s * (w / 2 - 0.05), 0, z - 0.02, 0.035, y - h / 2 + 0.02, 0.035, f);
  bx(k, board, x, y - h / 2, z, w, h, 0.035, f);
  letters(k, ink, x - w / 2 + 0.05, x + w / 2 - 0.05, y, h * 0.46, z + 0.019, f);
  if (glow) glowZ(g, x - w / 2, y - h / 2, x + w / 2, y + h / 2, z + 0.026, glow, f);
}
/** A black plastic water tank on a steel stand: on every Nigerian compound. */
function waterTank(k: Kit, x: number, z: number, y = 0, legH = 0.45) {
  if (legH > 0) {
    for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) bx(k, STEEL, x + dx, y, z + dz, 0.025, legH, 0.025);
    bx(k, STEEL, x, y + legH, z, 0.32, 0.025, 0.32);
  }
  k.post(WATER_TANK, [x, y + legH + 0.02, z], 0.14, 0.24, 8);
  k.post(WATER_TANK, [x, y + legH + 0.26, z], 0.05, 0.03, 6);
}
/** A beach umbrella over a seller's table. */
function umbrella(k: Kit, x: number, z: number, h: number, r: number, c: string, low: boolean) {
  k.post('#52525b', [x, 0, z], 0.012, h, 4);
  k.post(c, [x, h - 0.08, z], r, 0.12, low ? 6 : 8, 0.05);
}
/** A walled compound: the wall round the plot, a coping in `cap`, a gate `gate` wide at gateX in the front with piers either side. */
function compound(k: Kit, w: number, d: number, wall: string, cap: string, gate: number, h: number, low: boolean, gateX = 0) {
  const hw = w / 2 - 0.06, hd = d / 2 - 0.06, t = 0.07;
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.max(t, Math.abs(x1 - x0)), sz = Math.max(t, Math.abs(z1 - z0));
    bx(k, wall, cx, 0, cz, sx, h, sz);
    bx(k, cap, cx, h, cz, sx + 0.02, 0.035, sz + 0.02);
    if (low) return;
    const len = Math.max(sx, sz);
    for (let a = 0.9; a < len - 0.3; a += 0.9) {
      const px = sx > sz ? Math.min(x0, x1) + a : cx, pz = sx > sz ? cz : Math.min(z0, z1) + a;
      bx(k, wall, px, 0, pz, 0.1, h + 0.05, 0.1);
    }
  };
  run(-hw, -hd, hw, -hd);
  run(-hw, -hd, -hw, hd);
  run(hw, -hd, hw, hd);
  run(-hw, hd, gateX - gate / 2, hd);
  run(gateX + gate / 2, hd, hw, hd);
  for (const s of [-1, 1]) {
    bx(k, cap, gateX + s * (gate / 2 + 0.03), 0, hd, 0.13, h + 0.2, 0.13);
    bx(k, 'lamp', gateX + s * (gate / 2 + 0.03), h + 0.2, hd, 0.08, 0.06, 0.08);
  }
}

/* ---------- Vehicles (front along +z in their frame) ---------- */

function car(k: Kit, f: Matrix4, body: string) {
  k.box(body, [0, 0.15, 0], [0.44, 0.15, 0.96], undefined, f);
  k.box(CAR_GLASS, [0, 0.28, -0.04], [0.4, 0.12, 0.5], undefined, f);
  k.box(body, [0, 0.35, -0.05], [0.38, 0.03, 0.4], undefined, f);
  for (const z of [-0.3, 0.3]) k.box(DARK, [0, 0.07, z], [0.46, 0.13, 0.17], undefined, f);
}
/** A danfo: the boxy minibus, yellow with black stripes in Lagos, a roof rack piled with luggage. */
function danfo(k: Kit, f: Matrix4, low: boolean, body = '#facc15', stripe = '#111827', rand?: () => number) {
  const L = 1.25, W = 0.54;
  k.box(body, [0, 0.27, 0], [W, 0.32, L], undefined, f);
  k.box('#27303b', [0, 0.5, 0.01], [W - 0.01, 0.15, L - 0.06], undefined, f);
  k.box(body, [0, 0.595, 0], [W, 0.04, L - 0.03], undefined, f);
  k.box(stripe, [0, 0.33, 0], [W + 0.008, 0.035, L + 0.004], undefined, f);
  for (const z of [-0.38, 0.38]) k.box(DARK, [0, 0.075, z], [W + 0.02, 0.15, 0.2], undefined, f);
  if (low) return;
  for (const x of [-0.18, 0.18]) k.box('#fef9c3', [x, 0.3, L / 2 + 0.003], [0.1, 0.05, 0.01], undefined, f);
  // The roof rack: two rails and a few cross bars, so the yellow roof still shows from above.
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) k.box(DARK, [x, 0.63, -0.05], [0.02, 0.025, L - 0.3], undefined, f);
  for (const z of [-0.45, -0.05, 0.35]) k.box(DARK, [0, 0.63, z], [W - 0.1, 0.02, 0.02], undefined, f);
  if (rand) for (let i = 0; i < 3; i++) {
    if (rand() < 0.3) continue;
    k.box(CLOTHES[Math.floor(rand() * CLOTHES.length)], [(rand() - 0.5) * 0.2, 0.68, -0.35 + i * 0.3], [0.2 + rand() * 0.1, 0.1, 0.22], [0, rand(), 0], f);
  }
}
/** A long-distance coach: white with a stripe, glass all along. */
function coach(k: Kit, f: Matrix4, low: boolean, stripe = GREEN) {
  const L = 1.75, W = 0.62;
  k.box(WHITE, [0, 0.36, 0], [W, 0.5, L], undefined, f);
  k.box('#27303b', [0, 0.58, 0.02], [W + 0.005, 0.2, L - 0.12], undefined, f);
  k.box(WHITE, [0, 0.72, 0], [W - 0.02, 0.06, L - 0.04], undefined, f);
  k.box(stripe, [0, 0.3, 0], [W + 0.01, 0.07, L + 0.004], undefined, f);
  for (const z of [-0.55, 0.55]) k.box(DARK, [0, 0.08, z], [W + 0.02, 0.16, 0.22], undefined, f);
  if (!low) k.box('#d1d5db', [0, 0.76, -0.4], [0.3, 0.04, 0.4], undefined, f);
}
/** A keke napep: the yellow tricycle taxi with its green skirt and black canvas roof. */
function keke(k: Kit, f: Matrix4) {
  k.box('#facc15', [0, 0.15, 0], [0.22, 0.16, 0.42], undefined, f);
  k.box(GREEN, [0, 0.1, 0], [0.225, 0.04, 0.425], undefined, f);
  k.box('#18181b', [0, 0.35, -0.03], [0.24, 0.03, 0.36], undefined, f);
  k.box('#18181b', [0, 0.27, 0.15], [0.2, 0.15, 0.015], undefined, f);
  k.box(DARK, [0, 0.05, -0.08], [0.25, 0.1, 0.1], undefined, f);
}
/** A van ambulance: white, a red band, a blue light bar. */
function ambulance(k: Kit, f: Matrix4) {
  k.box(WHITE, [0, 0.3, -0.06], [0.46, 0.44, 0.78], undefined, f);
  k.box(WHITE, [0, 0.22, 0.4], [0.46, 0.28, 0.26], undefined, f);
  k.box(CAR_GLASS, [0, 0.42, 0.33], [0.44, 0.12, 0.12], undefined, f);
  k.box(RED, [0, 0.3, -0.06], [0.465, 0.06, 0.78], undefined, f);
  k.box(RED, [0, 0.53, -0.25], [0.1, 0.01, 0.3], undefined, f);
  k.box(RED, [0, 0.53, -0.25], [0.3, 0.01, 0.1], undefined, f);
  k.box('#2563eb', [0, 0.54, 0.22], [0.3, 0.04, 0.06], undefined, f);
  for (const z of [-0.3, 0.3]) k.box(DARK, [0, 0.07, z], [0.48, 0.13, 0.16], undefined, f);
}
/** A lorry: a cab and a flat bed carrying `load` (a container, bales) of the given height. */
function lorry(k: Kit, f: Matrix4, cab: string, load: string, loadH = 0.32, L = 1.5) {
  k.box(cab, [0, 0.27, L / 2 - 0.2], [0.5, 0.38, 0.38], undefined, f);
  k.box(CAR_GLASS, [0, 0.38, L / 2 - 0.005], [0.46, 0.12, 0.02], undefined, f);
  k.box(DARK, [0, 0.12, -0.18], [0.46, 0.08, L - 0.4], undefined, f);
  k.box(load, [0, 0.16, -0.2], [0.5, loadH, L - 0.46], undefined, f);
  for (const z of [L / 2 - 0.22, -0.2, -L / 2 + 0.25]) k.box(DARK, [0, 0.07, z], [0.52, 0.13, 0.16], undefined, f);
}
/** An airliner about `L` long, nose along +z, wings out along x, the tail fin in `tail`. */
function airliner(k: Kit, f: Matrix4, low: boolean, tail = GREEN, L = 2.6) {
  const r = 0.15, cy = 0.32, seg = low ? 6 : 10, half = L * 0.31;
  k.shape(WHITE, unitCyl(seg, 1), [0, cy, 0], [r, half * 2, r], [Math.PI / 2, 0, 0], f);
  k.shape(WHITE, unitCyl(seg, 0.32), [0, cy, half + 0.17], [r, 0.34, r], [Math.PI / 2, 0, 0], f);
  k.shape(WHITE, unitCyl(seg, 0.28), [0, cy + 0.02, -half - 0.22], [r, 0.44, r * 0.95], [-Math.PI / 2, 0, 0], f);
  for (const s of [-1, 1]) {
    k.box(WHITE, [s * 0.66, cy - 0.07, -0.05], [1.12, 0.035, 0.34], [0, s * 0.34, 0], f);
    k.shape('#cbd5e1', unitCyl(6, 1), [s * 0.48, cy - 0.15, 0.12], [0.065, 0.3, 0.065], [Math.PI / 2, 0, 0], f);
    k.box(WHITE, [s * 0.24, cy + 0.03, -half - 0.3], [0.48, 0.025, 0.18], [0, s * 0.3, 0], f);
  }
  k.box(tail, [0, cy + 0.3, -half - 0.24], [0.03, 0.44, 0.34], [-0.5, 0, 0], f);
  if (low) return;
  k.box(tail, [0, cy, 0], [r * 2 + 0.008, 0.04, half * 1.7], undefined, f);
  k.box(DARK, [0, cy + 0.07, half + 0.14], [0.19, 0.05, 0.1], [-0.4, 0, 0], f);
  for (const s of [-1, 0, 1]) k.box(DARK, [s * 0.1, 0.07, s ? -0.05 : half + 0.05], [0.04, 0.14, 0.04], undefined, f);
}

/* ---------- Shared buildings ---------- */

interface Row { len: number; dep: number; ver: number; h: number; wall: string; dado: string; roof: string; rib: string; trim: string; door: string; pillar: string }

/**
 * A single-storey row block: classrooms or barrack rooms in a line, each with a door and louvred windows, a
 * verandah along the front (+z in `f`) on square pillars, and a hipped zinc roof over the lot.
 */
function rowBlock(k: Kit, b: Row, f: Matrix4, low: boolean, g?: Glow) {
  const { len, dep, ver, h } = b;
  const hl = len / 2, fz = dep / 2;
  k.box(SLAB, [0, 0.04, ver / 2], [len + 0.04, 0.08, dep + ver], undefined, f);
  k.box(b.wall, [0, h / 2, 0], [len, h, dep], undefined, f);
  k.box(b.dado, [0, 0.16, 0], [len + 0.012, 0.16, dep + 0.012], undefined, f);
  const rooms = Math.max(2, Math.round(len / 1.05)), rw = len / rooms;
  for (let i = 0; i < rooms; i++) {
    const cx = -hl + rw * (i + 0.5);
    rz(k, b.door, cx - rw / 2 + 0.1, 0.08, cx - rw / 2 + 0.28, 0.6, fz + 0.004, 1, f);
    winZ(k, 2, cx - rw / 2 + 0.36, cx + rw / 2 - 0.08, 0.32, 0.62, fz, 1, b.trim, low, f, true);
  }
  for (let i = 0; i <= rooms; i++) {
    const x = -hl + rw * i + (i === 0 ? 0.04 : i === rooms ? -0.04 : 0);
    k.box(b.pillar, [x, h / 2 + 0.04, fz + ver - 0.05], [0.065, h - 0.08, 0.065], undefined, f);
  }
  // A bulb under the eaves outside each room, lighting the verandah after dark.
  for (let i = 0; i < rooms; i++) {
    const x = -hl + rw * (i + 0.5);
    k.box('lamp', [x, h - 0.05, fz + 0.04], [0.06, 0.04, 0.04], undefined, f);
    if (g) {
      const c = pt(f, [x, 0, fz + ver]);
      pool(g, c[0], c[2], 0.55, scale(WARM, 0.14), 0.09, 8);
    }
  }
  hipRoof(k, b.roof, len + 0.24, dep + ver + 0.22, h, 0.3, shift(f, 0, 0, ver / 2), low ? undefined : b.rib);
  k.box(b.trim, [0, h - 0.025, fz + ver + 0.11], [len + 0.24, 0.05, 0.02], undefined, f);
}

/**
 * A round lecture theatre: a drum of brick or render, a shallow cone of roof with a skylight at its crown, a
 * glazed foyer on the front and the raked rows showing as steps round the roof edge.
 */
function theatre(k: Kit, x: number, z: number, r: number, h: number, wall: string, roof: string, trim: string, low: boolean) {
  const seg = low ? 10 : 14;
  k.post(wall, [x, 0, z], r, h, seg);
  k.post(trim, [x, h - 0.06, z], r + 0.03, 0.06, seg);
  k.post(roof, [x, h, z], r + 0.06, 0.26, seg, 0.32);
  k.post(trim, [x, h + 0.26, z], r * 0.32, 0.04, seg);
  if (!low) for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    if (Math.sin(a) > 0.55) continue;
    k.box(trim, [x + Math.cos(a) * (r + 0.02), (h - 0.06) / 2, z + Math.sin(a) * (r + 0.02)], [0.05, h - 0.06, 0.05]);
  }
  // The foyer: a glass box on the front.
  const fz = z + r * 0.8;
  bx(k, trim, x, 0, fz, r * 0.95, h * 0.62, r * 0.5);
  bandZ(k, x - r * 0.44, x + r * 0.44, 0.06, h * 0.56, fz + r * 0.25, 1, trim, 0.18, low);
  bx(k, roof, x, h * 0.62, fz, r * 1.05, 0.05, r * 0.6);
}

/** A gate arch: two pillars carrying a named beam, lit at night. */
function gateArch(k: Kit, g: Glow, x: number, z: number, span: number, h: number, pillar: string, beam: string, ink: string, glow: RGB) {
  for (const s of [-1, 1]) {
    bx(k, pillar, x + (s * span) / 2, 0, z, 0.16, h, 0.16);
    bx(k, beam, x + (s * span) / 2, h, z, 0.2, 0.05, 0.2);
  }
  bx(k, beam, x, h - 0.32, z, span + 0.3, 0.28, 0.12);
  bx(k, pillar, x, h - 0.04, z, span + 0.34, 0.04, 0.14);
  letters(k, ink, x - span / 2, x + span / 2, h - 0.18, 0.12, z + 0.062);
  glowZ(g, x - span / 2 - 0.15, h - 0.32, x + span / 2 + 0.15, h - 0.04, z + 0.07, glow);
}

/* ---------- School: classroom blocks round an assembly ground ---------- */

const SCH_WALL = '#f6ecd4';
const SCH_BLUE = '#1d4ed8';
const SCH_ROOF = '#2950b8';
const SCH_RIB = '#22449e';
const SCH_DOOR = '#1e3a8a';

function school(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 97 + d * 13);
  const hw = w / 2, hd = d / 2;
  bx(k, LATERITE, 0, 0, 0, w, 0.04, d);
  compound(k, w, d, SCH_WALL, SCH_BLUE, 0.6, 0.3, low);

  // Three blocks of classrooms round the assembly ground, painted cream and blue under blue zinc: one across the
  // back, a wing down each side, their verandahs facing in.
  const dep = 0.8, ver = 0.3, h = 0.78;
  const blk = { dep, ver, h, wall: SCH_WALL, dado: SCH_BLUE, roof: SCH_ROOF, rib: SCH_RIB, trim: LINE, door: SCH_DOOR, pillar: LINE };
  const backZ = -hd + 0.2 + dep / 2;
  rowBlock(k, { ...blk, len: w - 0.5 }, F(0, backZ), low, g);
  const wz0 = backZ + dep / 2 + ver + 0.04, wz1 = hd - 0.85;
  for (const s of [-1, 1]) rowBlock(k, { ...blk, len: wz1 - wz0 }, F(s * (hw - 0.25 - dep / 2), (wz0 + wz1) / 2, (-s * Math.PI) / 2), low, g);

  // The assembly ground: swept sand, the flag on a little dais, the pupils in their lines in blue and white.
  const ax = hw - 0.25 - dep - ver - 0.08;
  fl(k, SAND, -ax, wz0, ax, hd - 0.3, 0.045);
  bx(k, SLAB, 0, 0, wz0 + 0.3, 0.7, 0.08, 0.36);
  flag(k, 0.24, wz0 + 0.3, 1.7);
  if (!low) {
    const cols = Math.min(6, Math.floor((ax * 2 - 0.6) / 0.24)), rows = 4;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const x = (c - (cols - 1) / 2) * 0.24 + (c >= cols / 2 ? 0.12 : -0.12);
      person(k, x, wz0 + 0.78 + r * 0.2, LINE, SCH_BLUE, SKIN[(c + r) % 3]);
    }
    person(k, -0.2, wz0 + 0.5, '#7c3aed', '#7c3aed', SKIN[1]);
    person(k, 0.05, wz0 + 0.32, DARK, DARK, SKIN[2]);
  }

  // Out front: the signboard, a mango tree, the water tank on its stand.
  signboard(k, g, -1.2, hd - 0.28, 1.0, 0.34, 0.66, LINE, SCH_BLUE, [0.3, 0.32, 0.4], 0.32);
  tree(k, -hw + 0.55, hd - 0.48, 1.05, low, 1);
  waterTank(k, hw - 0.5, hd - 0.5);
  if (!low) {
    tree(k, hw - 1.25, hd - 0.42, 0.8, low, 2);
    for (let i = 0; i < 3; i++) person(k, 0.35 + rand() * 0.6, hd - 0.2 - rand() * 0.3, CLOTHES[i + 3]);
  }
  pool(g, 0, hd, 0.9, scale(WARM, 0.18));
  pool(g, 0, wz0 + 0.5, 1.1, scale(WARM, 0.1));
  return { parts: k.build(), glow: g.build() };
}

/* ---------- University campus (the small landmark): faculty, lecture theatre, gate ---------- */

const UNI_WALL = '#efe6d4';
const UNI_FIN = '#9a4a2e';
const UNI_ROOF = '#8f3b28';
const COPPER = '#5f9e8f';

/** A faculty block: two or three storeys of ribbon windows behind concrete sun-fins, a flat roof with tanks on it. */
function faculty(k: Kit, x: number, z: number, len: number, dep: number, floors: number, wall: string, fin: string, low: boolean, finEvery = 0.3) {
  const fh = 0.66, H = floors * fh, fz = z + dep / 2;
  bx(k, wall, x, 0, z, len, H, dep);
  bx(k, fin, x, H, z, len + 0.06, 0.08, dep + 0.06);
  fl(k, SLAB, x - len / 2 + 0.05, z - dep / 2 + 0.05, x + len / 2 - 0.05, z + dep / 2 - 0.05, H + 0.081);
  for (let i = 0; i < floors; i++) {
    bandZ(k, x - len / 2 + 0.1, x + len / 2 - 0.1, i * fh + 0.18, i * fh + 0.5, fz, 1, wall, 0.2, true);
    bx(k, fin, x, i * fh + 0.12, fz + 0.04, len + 0.02, 0.04, 0.08);
  }
  if (!low) for (let a = x - len / 2 + 0.1; a <= x + len / 2 - 0.09; a += finEvery) bx(k, fin, a, 0.12, fz + 0.045, 0.035, H - 0.12, 0.09);
  waterTank(k, x + len / 2 - 0.3, z - dep / 4, H + 0.08, 0);
  if (!low) waterTank(k, x + len / 2 - 0.62, z - dep / 4, H + 0.08, 0);
}

function campus(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 31 + d * 7);
  const hw = w / 2, hd = d / 2;
  bx(k, LAWN, 0, 0, 0, w, 0.04, d);
  // Paths: up from the gate, and across the lawn.
  fl(k, PAVING, -0.2, -hd + 0.9, 0.2, hd, 0.045);
  fl(k, PAVING, -hw + 0.3, 0.05, hw - 0.3, 0.35, 0.046);

  // The faculty building across the back, its clock tower over the entrance.
  const fz = -hd + 0.55, len = w - 1.0;
  faculty(k, 0, fz, len, 0.8, 2, UNI_WALL, UNI_FIN, low);
  const H = 2 * 0.66;
  bx(k, UNI_WALL, 0, 0, fz + 0.32, 0.5, H + 0.75, 0.42);
  bx(k, UNI_FIN, 0, H + 0.75, fz + 0.32, 0.58, 0.06, 0.5);
  pyramid(k, UNI_ROOF, 0, H + 0.81, fz + 0.32, 0.29, 0.34);
  k.shape(LINE, unitCyl(12, 1), [0, H + 0.48, fz + 0.535], [0.13, 0.015, 0.13], [Math.PI / 2, 0, 0]);
  k.box(DARK, [0, H + 0.51, fz + 0.545], [0.015, 0.09, 0.005]);
  k.box(DARK, [0.03, H + 0.48, fz + 0.545], [0.07, 0.015, 0.005]);
  rz(k, SHADOW, -0.14, 0.08, 0.14, 0.5, fz + 0.532);

  // The round lecture theatre to one side, the library and car park the other.
  const tr = clamp(Math.min(w * 0.15, d * 0.24), 0.55, 0.72);
  theatre(k, -hw + 0.3 + tr, hd - 0.4 - tr * 1.2, tr, 0.72, '#b45c3c', COPPER, UNI_WALL, low);
  const lx = hw - 0.95;
  bx(k, UNI_WALL, lx, 0, 0.75, 1.0, 0.7, 0.7);
  bandZ(k, lx - 0.42, lx + 0.42, 0.1, 0.6, 1.1, 1, UNI_FIN, 0.14, low);
  bx(k, UNI_ROOF, lx, 0.7, 0.75, 1.1, 0.05, 0.8);
  tree(k, 0.75, -0.25, 0.75, low, 0);
  tree(k, -0.75, 0.75, 0.7, low, 2);
  if (!low) {
    car(k, F(hw - 0.6, hd - 0.35, Math.PI / 2), CARS[1]);
    crowd(k, rand, 9, -hw + 0.6, 0.0, hw - 0.6, 0.4);
    crowd(k, rand, 4, -0.25, 0.5, 0.25, hd - 0.3);
  }
  gateArch(k, g, 0, hd - 0.12, 0.7, 0.62, UNI_WALL, UNI_FIN, AMBER, [0.32, 0.26, 0.16]);
  lampPost(k, g, 0.4, 0.8, 0.6, low);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Polytechnic / university: tall faculty, a wing, a theatre, the big gate ---------- */

const POLY_WALL = '#f3ead2';
const POLY_FIN = '#7c5a3a';
const POLY_NAVY = '#1e3a8a';
const POLY_RIB = '#1a3277';

function poly(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 53 + d * 29);
  const hw = w / 2, hd = d / 2;
  bx(k, LATERITE, 0, 0, 0, w, 0.04, d);
  fl(k, LAWN, -hw + 0.3, -0.75, hw - 1.6, hd - 0.9, 0.044);
  fl(k, PAVING, -0.3, -0.75, 0.3, hd, 0.046);
  fl(k, PAVING, -hw + 0.3, -0.25, hw - 1.6, 0.1, 0.047);

  // The main faculty block across the back: three storeys behind brown concrete fins, a stair tower on the roof.
  const fz = -hd + 0.75, flen = w - 1.6;
  faculty(k, -0.5, fz, flen, 1.0, 3, POLY_WALL, POLY_FIN, low, 0.26);
  bx(k, POLY_WALL, -0.5 - flen / 4, 1.98, fz - 0.1, 0.5, 0.3, 0.4);
  // The entrance: a portico of columns up to a navy fascia.
  bx(k, POLY_NAVY, -0.5, 0.95, fz + 0.75, 1.3, 0.1, 0.5);
  for (const x of [-1.05, -0.75, -0.25, 0.05]) bx(k, LINE, x, 0, fz + 0.94, 0.06, 0.95, 0.06);
  bx(k, SLAB, -0.5, 0, fz + 0.72, 1.4, 0.07, 0.5);

  // A two-storey wing down the right side under a navy hipped roof.
  const wx = hw - 0.8, wz0 = fz - 0.4, wz1 = hd - 1.2, wl = wz1 - wz0;
  bx(k, POLY_WALL, wx, 0, (wz0 + wz1) / 2, 0.9, 1.3, wl);
  bx(k, POLY_FIN, wx, 0.62, (wz0 + wz1) / 2, 0.92, 0.05, wl + 0.02);
  for (const y of [0.22, 0.86]) winX(k, Math.max(2, Math.round(wl / 0.45)), wz0 + 0.1, wz1 - 0.1, y, y + 0.3, wx - 0.45, -1, LINE);
  winZ(k, 2, wx - 0.35, wx + 0.35, 0.86, 1.16, wz1, 1, LINE, low);
  rz(k, SHADOW, wx - 0.15, 0.05, wx + 0.15, 0.5, wz1 + 0.004);
  hipRoof(k, POLY_NAVY, 1.1, wl + 0.2, 1.3, 0.34, F(wx, (wz0 + wz1) / 2), low ? undefined : POLY_RIB);

  // The lecture theatre out front on the left, the car park on the right.
  theatre(k, -hw + 1.25, hd - 1.35, 0.85, 0.85, '#b45c3c', COPPER, POLY_WALL, low);
  const px0 = 0.55, px1 = hw - 0.25, pz0 = hd - 1.05, pz1 = hd - 0.3;
  fl(k, ASPHALT, px0, pz0, px1, pz1, 0.047);
  const bays = Math.floor((px1 - px0) / 0.62);
  for (let i = 0; i <= bays; i++) fl(k, LINE, px0 + i * 0.62 - 0.01, pz0 + 0.05, px0 + i * 0.62 + 0.01, pz0 + 0.55, 0.05);
  for (let i = 0; i < bays; i++) if ((!low || i % 2 === 0) && rand() < 0.75) car(k, F(px0 + 0.31 + i * 0.62, pz0 + 0.42, Math.PI), CARS[Math.floor(rand() * CARS.length)]);

  // The gate: navy pillars and a gold beam with the name, a gatehouse and a boom.
  const gx = 0;
  gateArch(k, g, gx, hd - 0.15, 1.1, 0.95, POLY_NAVY, AMBER, POLY_NAVY, [0.4, 0.34, 0.14]);
  bx(k, POLY_WALL, gx - 1.05, 0, hd - 0.3, 0.42, 0.42, 0.36);
  bx(k, POLY_NAVY, gx - 1.05, 0.42, hd - 0.3, 0.5, 0.04, 0.44);
  rz(k, 'glass', gx - 1.2, 0.2, gx - 0.9, 0.36, hd - 0.118);
  for (let i = 0; i < 4; i++) bx(k, i % 2 ? LINE : RED, gx - 0.48 + i * 0.12, 0.3, hd - 0.42, 0.12, 0.035, 0.035);
  for (const x of [-hw + 0.35, -hw + 0.55, -hw + 0.75]) flag(k, x, -0.55, 1.3, x === -hw + 0.55 ? [POLY_NAVY, AMBER, POLY_NAVY] : undefined);
  tree(k, -hw + 0.45, 0.35, 0.9, low, 0);
  tree(k, 0.95, -0.55, 0.8, low, 1);
  tree(k, hw - 0.4, -hd + 0.5, 0.8, low, 2);
  if (!low) {
    crowd(k, rand, 14, -hw + 0.6, -0.3, hw - 1.8, 0.2);
    crowd(k, rand, 6, -0.3, 0.3, 0.3, hd - 0.4);
    crowd(k, rand, 5, -1.5, fz + 0.75, 0.5, fz + 1.05);
  }
  lampPost(k, g, 0.45, 0.6, 0.65, low);
  lampPost(k, g, -0.45, hd - 0.7, 0.65, low, -0.12);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Defence academy / barracks: the red parade ground ---------- */

const NDA_WALL = '#e9e1cb';
const NDA_ROOF = '#556b2f';
const NDA_RIB = '#47592a';
const OLIVE = '#4d5d3a';
const PARADE = '#b4532a';
const BERET = '#7f1d1d';
const KHAKI = '#8a7650';

function nda(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow();
  const hw = w / 2, hd = d / 2;
  bx(k, '#9fae7e', 0, 0, 0, w, 0.04, d);
  const gateX = hw - 1.0;
  compound(k, w, d, NDA_WALL, OLIVE, 0.7, 0.28, low, gateX);

  // Barrack blocks: one across the back, another down the left on the bigger grounds.
  const dep = 0.8, ver = 0.28, h = 0.82;
  const blk = { dep, ver, h, wall: NDA_WALL, dado: KHAKI, roof: NDA_ROOF, rib: NDA_RIB, trim: LINE, door: '#3f4a2c', pillar: LINE };
  const backZ = -hd + 0.2 + dep / 2;
  rowBlock(k, { ...blk, len: w - 0.5 }, F(0, backZ), low, g);
  const pz0 = backZ + dep / 2 + ver + 0.2;
  let px0 = -hw + 0.4;
  if (d >= 5) {
    const z0 = pz0 - 0.16, z1 = hd - 1.0;
    rowBlock(k, { ...blk, len: z1 - z0 }, F(-hw + 0.25 + dep / 2, (z0 + z1) / 2, Math.PI / 2), low, g);
    px0 = -hw + 0.25 + dep + ver + 0.25;
  }
  const px1 = hw - 0.35, pz1 = hd - 0.55;

  // The parade ground, red with white edges, the saluting base at its head under an olive canopy.
  fl(k, PARADE, px0, pz0, px1, pz1, 0.045);
  for (const [a, b, c, e] of [[px0 + 0.08, pz0 + 0.08, px1 - 0.08, pz0 + 0.11], [px0 + 0.08, pz1 - 0.11, px1 - 0.08, pz1 - 0.08], [px0 + 0.08, pz0 + 0.08, px0 + 0.11, pz1 - 0.08], [px1 - 0.11, pz0 + 0.08, px1 - 0.08, pz1 - 0.08]]) fl(k, LINE, a, b, c, e, 0.048);
  const sx = (px0 + px1) / 2, sz = pz0 + 0.34, sw = Math.min(1.7, (px1 - px0) * 0.5);
  bx(k, CONCRETE, sx, 0, sz, sw, 0.1, 0.5);
  bx(k, '#d6d3d1', sx, 0.1, sz - 0.08, sw - 0.1, 0.08, 0.3);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(k, LINE, sx + dx * (sw / 2 - 0.05), 0.1, sz + dz * 0.2, 0.04, 0.66, 0.04);
  bx(k, OLIVE, sx, 0.76, sz, sw + 0.1, 0.05, 0.6);
  bx(k, AMBER, sx, 0.72, sz + 0.3, sw + 0.1, 0.05, 0.02);
  flag(k, sx - sw / 2 - 0.3, sz, 1.45);
  flag(k, sx + sw / 2 + 0.3, sz, 1.45, ['#c8102e', '#00205b', '#5b9bd5']);

  // The cadets in their squads, facing the saluting base; an officer out in front of each.
  const squadW = 0.78, squads = Math.max(1, Math.min(4, Math.floor((px1 - px0 - 0.3) / (squadW + 0.25))));
  const ranks = Math.max(2, Math.min(4, Math.floor((pz1 - sz - 0.75) / 0.18)));
  // Drawn up in the middle of the square, between the saluting base and the far edge.
  const fz0 = (sz + 0.25 + pz1) / 2 - ((ranks - 1) * 0.18) / 2 + 0.1;
  for (let s = 0; s < squads; s++) {
    const cx = sx + (s - (squads - 1) / 2) * (squadW + 0.25);
    if (low) {
      bx(k, OLIVE, cx, 0, fz0 + ((ranks - 1) * 0.18) / 2, squadW, 0.2, ranks * 0.18 - 0.08);
      bx(k, BERET, cx, 0.2, fz0 + ((ranks - 1) * 0.18) / 2, squadW - 0.04, 0.04, ranks * 0.18 - 0.12);
      continue;
    }
    for (let f = 0; f < 5; f++) for (let r = 0; r < ranks; r++) {
      const x = cx + (f - 2) * (squadW / 5), z = fz0 + r * 0.18;
      k.box(OLIVE, [x, 0.1, z], [0.08, 0.2, 0.06]);
      k.box(BERET, [x, 0.225, z], [0.06, 0.05, 0.06]);
    }
    person(k, cx, fz0 - 0.22, OLIVE, KHAKI, SKIN[1]);
  }

  // The gate: a guardroom, a sentry, a striped boom; an old tank kept on a plinth inside.
  const gz = hd - 0.06;
  bx(k, NDA_WALL, gateX + 0.75, 0, gz - 0.35, 0.5, 0.45, 0.42);
  hipRoof(k, NDA_ROOF, 0.62, 0.54, 0.45, 0.18, F(gateX + 0.75, gz - 0.35));
  rz(k, 'glass', gateX + 0.6, 0.2, gateX + 0.9, 0.36, gz - 0.136);
  for (let i = 0; i < 5; i++) bx(k, i % 2 ? LINE : RED, gateX - 0.3 + i * 0.12, 0.3, gz - 0.2, 0.12, 0.035, 0.035);
  bx(k, '#a8a29e', gateX - 0.5, 0, gz - 0.2, 0.06, 0.34, 0.06);
  person(k, gateX + 0.42, gz - 0.25, OLIVE, KHAKI, SKIN[2]);
  const tx = d >= 5 ? -hw + 0.75 : -hw + 0.65, tz = hd - 0.32;
  bx(k, CONCRETE, tx, 0, tz, 0.72, 0.1, 0.42);
  bx(k, DARK, tx, 0.1, tz - 0.13, 0.62, 0.09, 0.08);
  bx(k, DARK, tx, 0.1, tz + 0.13, 0.62, 0.09, 0.08);
  bx(k, OLIVE, tx, 0.14, tz, 0.56, 0.1, 0.22);
  bx(k, OLIVE, tx - 0.04, 0.24, tz, 0.26, 0.09, 0.2);
  k.box(OLIVE, [tx + 0.24, 0.29, tz], [0.32, 0.03, 0.03]);

  // Floodlights over the square.
  floodMast(k, g, px0 + 0.05, pz1 + 0.12, 1.5, low, 1.6, Math.PI);
  floodMast(k, g, px1 - 0.05, pz1 + 0.12, 1.5, low, 1.6, Math.PI);
  tree(k, gateX + 0.65, hd - 1.0, 0.8, low, 1);
  if (d >= 5) tree(k, -hw + 0.55, hd - 0.85, 0.8, low, 2);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Hospital: a ward block with a red cross on the roof, the A&E bay ---------- */

const HOS_WALL = '#f8fafc';
const TEAL = '#0f766e';
const TEAL_PALE = '#ccfbf1';
const HOS_ROOF = '#d4d4d8';
const NURSE = '#e0f2fe';

function hospital(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 71 + d * 5);
  const hw = w / 2, hd = d / 2;
  bx(k, PAVING, 0, 0, 0, w, 0.04, d);

  // The ward block: three white storeys banded in teal, ribbon windows, a flat roof with a big red cross on it.
  const bw = w - 1.0, bd = clamp(d * 0.36, 1.3, 1.8), fh = 0.72, H = 3 * fh;
  const bz = -hd + 0.2 + bd / 2, ez = bz + bd / 2;
  bx(k, HOS_WALL, 0, 0, bz, bw, H, bd);
  bx(k, STEEL, 0, 0, bz, bw + 0.04, 0.14, bd + 0.04);
  for (let i = 1; i <= 3; i++) bx(k, TEAL, 0, i * fh - 0.05, bz, bw + 0.03, 0.06, bd + 0.03);
  for (let i = 0; i < 3; i++) {
    bandZ(k, -bw / 2 + 0.15, bw / 2 - 0.15, i * fh + 0.24, i * fh + 0.52, ez, 1, TEAL_PALE, 0.32, low);
    if (!low) for (const s of [-1, 1]) winX(k, 2, bz - bd / 2 + 0.2, bz + bd / 2 - 0.2, i * fh + 0.24, i * fh + 0.52, (s * bw) / 2, s, TEAL_PALE);
  }
  fl(k, HOS_ROOF, -bw / 2 + 0.06, bz - bd / 2 + 0.06, bw / 2 - 0.06, bz + bd / 2 - 0.06, H + 0.012);
  const cx = -bw / 4, cr = Math.min(0.42, bd * 0.3);
  bx(k, LINE, cx, H, bz, cr * 2.2, 0.02, cr * 2.2);
  bx(k, RED, cx, H + 0.02, bz, cr * 1.7, 0.02, cr * 0.55);
  bx(k, RED, cx, H + 0.02, bz, cr * 0.55, 0.02, cr * 1.7);
  // Roof plant: air conditioners and water tanks.
  for (let i = 0; i < (low ? 2 : 4); i++) bx(k, '#e5e7eb', bw / 8 + i * 0.36, H, bz - bd / 4, 0.24, 0.14, 0.2);
  waterTank(k, bw / 2 - 0.35, bz + bd / 5, H, 0);
  if (!low) waterTank(k, bw / 2 - 0.7, bz + bd / 5, H, 0);

  // A two-storey wing forward on the left, on the bigger grounds.
  const parkX0 = -hw + 0.3;
  if (d >= 5) {
    const wx = -bw / 2 + 0.55, wz1 = ez + 1.15;
    bx(k, HOS_WALL, wx, 0, (ez + wz1) / 2, 1.1, 2 * fh, wz1 - ez);
    for (let i = 1; i <= 2; i++) bx(k, TEAL, wx, i * fh - 0.05, (ez + wz1) / 2, 1.13, 0.06, wz1 - ez + 0.03);
    for (let i = 0; i < 2; i++) {
      winZ(k, 2, wx - 0.45, wx + 0.45, i * fh + 0.24, i * fh + 0.52, wz1, 1, TEAL_PALE, low);
      winX(k, 2, ez + 0.1, wz1 - 0.1, i * fh + 0.24, i * fh + 0.52, wx + 0.55, 1, TEAL_PALE);
    }
    fl(k, HOS_ROOF, wx - 0.5, ez + 0.02, wx + 0.5, wz1 - 0.06, 2 * fh + 0.012);
  }

  // The main entrance: a glass hall under a teal canopy, the red cross on the wall above it, the name on the parapet.
  bx(k, HOS_WALL, 0, 0, ez + 0.32, 1.5, 0.8, 0.64);
  bandZ(k, -0.6, 0.6, 0.06, 0.66, ez + 0.64, 1, TEAL, 0.24, low);
  bx(k, TEAL, 0, 0.8, ez + 0.62, 1.8, 0.06, 0.8);
  for (const x of [-0.82, 0.82]) bx(k, LINE, x, 0, ez + 0.98, 0.06, 0.8, 0.06);
  bx(k, LINE, 0, 1.0, ez + 0.02, 0.62, 0.62, 0.04);
  bx(k, RED, 0, 1.24, ez + 0.045, 0.46, 0.14, 0.02);
  bx(k, RED, 0, 1.08, ez + 0.045, 0.14, 0.46, 0.02);
  glowZ(g, -0.31, 1.0, 0.31, 1.62, ez + 0.06, [0.5, 0.12, 0.1]);
  bx(k, TEAL, 0, H + 0.02, ez + 0.03, Math.min(bw - 0.4, 3.2), 0.24, 0.05);
  letters(k, LINE, -Math.min(bw - 0.4, 3.2) / 2 + 0.1, Math.min(bw - 0.4, 3.2) / 2 - 0.1, H + 0.14, 0.13, ez + 0.058);
  glowZ(g, -Math.min(bw - 0.4, 3.2) / 2, H + 0.02, Math.min(bw - 0.4, 3.2) / 2, H + 0.26, ez + 0.065, [0.12, 0.3, 0.27]);
  fl(k, SLAB, -0.9, ez + 0.6, 0.9, hd - 0.05, 0.045);

  // The ambulance bay on the right: a canopy, a red EMERGENCY board, an ambulance or two.
  const ax = bw / 2 - 0.7, az = ez + 0.75;
  for (const [dx, dz] of [[-0.62, -0.4], [0.62, -0.4], [-0.62, 0.4], [0.62, 0.4]]) bx(k, LINE, ax + dx, 0, az + dz, 0.05, 0.72, 0.05);
  bx(k, LINE, ax, 0.72, az, 1.36, 0.05, 0.92);
  bx(k, RED, ax, 0.66, az + 0.46, 1.36, 0.1, 0.02);
  letters(k, LINE, ax - 0.55, ax + 0.55, 0.71, 0.06, az + 0.472);
  glowZ(g, ax - 0.68, 0.66, ax + 0.68, 0.76, az + 0.48, [0.55, 0.1, 0.08]);
  fl(k, '#fde68a', ax - 0.6, az - 0.38, ax + 0.6, az + 0.38, 0.046);
  ambulance(k, F(ax - 0.3, az, 0), );
  if (!low) ambulance(k, F(ax + 0.3, az + 0.05, 0));

  // The car park on the left, trees, people coming and going, lamps.
  const px1 = -1.0;
  if (px1 - parkX0 > 0.6) {
    const pz = hd - 0.55;
    fl(k, ASPHALT, parkX0, pz - 0.5, px1, pz + 0.45, 0.046);
    const n = Math.floor((px1 - parkX0) / 0.6);
    for (let i = 0; i < n; i++) {
      fl(k, LINE, parkX0 + i * 0.6 + 0.02, pz - 0.45, parkX0 + i * 0.6 + 0.04, pz + 0.1, 0.05);
      if ((!low || i % 2 === 0) && rand() < 0.8) car(k, F(parkX0 + 0.32 + i * 0.6, pz - 0.05, Math.PI), CARS[Math.floor(rand() * CARS.length)]);
    }
  }
  // A garden between the A&E bay and the road: lawn, flower beds, a bench, the hospital's board.
  const gz0 = az + 0.55;
  if (hd - gz0 > 0.45) {
    fl(k, LAWN, 1.0, gz0, hw - 0.12, hd - 0.12, 0.046);
    if (!low) for (let x = 1.15; x < hw - 0.3; x += 0.5) k.shape(['#f472b6', '#facc15', '#f97316'][Math.round(x * 2) % 3], BALL(), [x, 0.07, hd - 0.25], [0.12, 0.07, 0.08]);
    bx(k, WOOD, 1.5, 0.08, gz0 + 0.2, 0.4, 0.04, 0.12);
    signboard(k, g, hw - 0.9, hd - 0.2, 0.9, 0.3, 0.5, LINE, TEAL, [0.25, 0.32, 0.32], 0.3);
  }
  tree(k, hw - 0.35, gz0 + 0.25, 0.75, low, 0);
  tree(k, -hw + 0.35, ez + 0.35, 0.8, low, 1);
  if (!low) {
    crowd(k, rand, 6, -0.8, ez + 1.1, 0.8, hd - 0.15);
    for (let i = 0; i < 3; i++) person(k, -0.5 + i * 0.45, ez + 0.85, NURSE, NURSE, SKIN[i % 3]);
  }
  lampPost(k, g, -0.95, hd - 0.15, 0.7, low);
  lampPost(k, g, 0.95, hd - 0.15, 0.7, low, -0.12);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Church: a cathedral, cross-shaped from above, its steeple at the door ---------- */

const CH_WALL = '#f3efe6';
const CH_TRIM = '#d6cfc2';
const CH_ROOF = '#9b2c1f';
const CH_SPIRE = '#7f1d1d';
const WOOD = '#5a371e';

function church(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 19 + d * 41);
  const hw = w / 2, hd = d / 2;
  bx(k, LAWN, 0, 0, 0, w, 0.04, d);

  const nw = clamp(w * 0.32, 1.1, 1.5), apse = nw * 0.45;
  const zBack = -hd + 0.15 + apse;
  const ts = nw * 0.68;
  const zTower = hd - clamp(d * 0.13, 0.4, 0.65);
  const zFront = zTower - ts + 0.05, len = zFront - zBack, nz = (zBack + zFront) / 2;
  const wh = 0.9, rise = nw * 0.45;
  fl(k, PAVING, -hw + 0.15, zTower - 0.2, hw - 0.15, hd - 0.02, 0.045);
  fl(k, PAVING, -0.3, zTower - 0.2, 0.3, hd, 0.046);

  // The nave, the transept across it and the round apse at the east end: a cross of red roofs from the air.
  bx(k, CH_WALL, 0, 0, nz, nw, wh, len);
  bx(k, CH_TRIM, 0, 0, nz, nw + 0.04, 0.1, len + 0.04);
  gableRoof(k, CH_ROOF, CH_WALL, len, nw, wh, rise, F(0, nz, Math.PI / 2), 0.1, 0);
  const zt = zBack + len * 0.32, tw = Math.min(w - 0.4, nw * 2.3), td = nw * 0.8;
  bx(k, CH_WALL, 0, 0, zt, tw, wh, td);
  gableRoof(k, CH_ROOF, CH_WALL, tw, td, wh, (rise * td) / nw, F(0, zt), 0.1, 0);
  halfDrum(k, CH_WALL, CH_ROOF, 0, zBack, apse, wh, rise * 0.75, low ? 5 : 7);
  // Tall pointed windows down the nave, buttresses between them; a rose window in each end of the transept.
  const bays = Math.max(2, Math.floor((zFront - zt - td / 2) / 0.42));
  for (const s of [-1, 1]) {
    for (let i = 0; i < bays; i++) {
      const z0 = zt + td / 2 + 0.1 + i * 0.42, x = (s * nw) / 2;
      // The pointed head takes the pane's own night-light seed, so the window lights as one.
      rx(k, 'glass', z0, 0.25, z0 + 0.18, 0.66, x + s * 0.005, s);
      tri(k, 'glass', [x + s * 0.005, 0.66, z0], [x + s * 0.005, 0.66, z0 + 0.18], [x + s * 0.005, 0.78, z0 + 0.09], [s, 0, 0], undefined, seedAt(x + s * 0.005, 0.455, z0 + 0.09));
      if (!low) bx(k, CH_TRIM, x + s * 0.035, 0, z0 - 0.06, 0.07, 0.7, 0.07);
    }
    k.shape('glass', unitCyl(low ? 8 : 12, 1), [(s * tw) / 2 + s * 0.01, 0.58, zt], [0.2, 0.02, 0.2], [0, 0, Math.PI / 2]);
    k.shape(CH_TRIM, unitCyl(low ? 8 : 12, 1), [(s * tw) / 2 + s * 0.004, 0.58, zt], [0.25, 0.02, 0.25], [0, 0, Math.PI / 2]);
  }

  // The tower: a square belfry with louvred openings and corner pinnacles, an octagonal spire, a gold cross.
  const tz = zTower - ts / 2, th = wh + rise + 0.7, sh = ts * 2.1;
  bx(k, CH_WALL, 0, 0, tz, ts, th, ts);
  bx(k, CH_TRIM, 0, 0, tz, ts + 0.05, 0.12, ts + 0.05);
  bx(k, CH_TRIM, 0, wh + 0.05, tz, ts + 0.04, 0.05, ts + 0.04);
  bx(k, CH_TRIM, 0, th - 0.05, tz, ts + 0.08, 0.07, ts + 0.08);
  const fz = tz + ts / 2;
  for (const [face, s] of [['z', 1], ['x', 1], ['x', -1]] as const) {
    if (face === 'z') {
      rz(k, SHADOW, -ts * 0.2, th - 0.45, ts * 0.2, th - 0.16, fz + 0.004);
      tri(k, SHADOW, [-ts * 0.2, th - 0.16, fz + 0.004], [ts * 0.2, th - 0.16, fz + 0.004], [0, th - 0.08, fz + 0.004], [0, 0, 1]);
    } else {
      rx(k, SHADOW, tz - ts * 0.2, th - 0.45, tz + ts * 0.2, th - 0.16, (s * ts) / 2 + s * 0.004, s);
    }
  }
  k.shape(CH_TRIM, unitCyl(low ? 8 : 14, 1), [0, wh + 0.35, fz + 0.006], [ts * 0.3, 0.02, ts * 0.3], [Math.PI / 2, 0, 0]);
  k.shape('glass', unitCyl(low ? 8 : 14, 1), [0, wh + 0.35, fz + 0.016], [ts * 0.24, 0.02, ts * 0.24], [Math.PI / 2, 0, 0]);
  rz(k, WOOD, -0.14, 0.12, 0.14, 0.52, fz + 0.005);
  tri(k, WOOD, [-0.14, 0.52, fz + 0.005], [0.14, 0.52, fz + 0.005], [0, 0.66, fz + 0.005], [0, 0, 1]);
  bx(k, CH_TRIM, 0, 0, fz + 0.12, 0.6, 0.06, 0.24);
  k.post(CH_SPIRE, [0, th + 0.02, tz], ts * 0.46, sh, 8, 0);
  if (!low) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.post(CH_TRIM, [(dx * ts) / 2 - dx * 0.05, th + 0.02, tz + (dz * ts) / 2 - dz * 0.05], 0.05, 0.28, 4, 0);
  bx(k, GOLD, 0, th + sh, tz, 0.03, 0.24, 0.03);
  bx(k, GOLD, 0, th + sh + 0.14, tz, 0.14, 0.03, 0.03);
  // Floodlit at night: a wash up the tower front, the cross picked out.
  glowZ(g, -ts / 2, 0.1, ts / 2, th, fz + 0.03, scale(WARM, 0.32), undefined, [0, 0, 0]);
  glowZ(g, -0.08, th + sh - 0.02, 0.08, th + sh + 0.26, tz + 0.03, [0.5, 0.42, 0.18]);

  // The churchyard: palms, a statue, people in their Sunday white, cars if there's room.
  palm(k, -hw + 0.35, hd - 0.35, 1.25, low, 0);
  palm(k, hw - 0.35, hd - 0.35, 1.15, low, 1);
  const side = hw - tw / 2;
  if (!low) {
    bx(k, CH_TRIM, -nw / 2 - 0.45, 0, zTower - 0.1, 0.16, 0.14, 0.16);
    bx(k, '#e0f2fe', -nw / 2 - 0.45, 0.14, zTower - 0.1, 0.07, 0.24, 0.07);
    bx(k, '#e0f2fe', -nw / 2 - 0.45, 0.38, zTower - 0.1, 0.05, 0.05, 0.05);
    crowd(k, rand, 8, -0.9, zTower + 0.05, 0.9, hd - 0.1, [WHITE, WHITE, '#fde68a', '#7c3aed', '#db2777', '#2563eb']);
  }
  if (hw - nw / 2 > 1.2) {
    for (const s of [-1, 1]) {
      if (low && s < 0) continue;
      const x = s * (nw / 2 + 0.7);
      fl(k, ASPHALT, x - 0.35, zt + td / 2 + 0.1, x + 0.35, zTower - 0.25, 0.046);
      car(k, F(x, (zt + td / 2 + zTower) / 2 - 0.1, 0), CARS[Math.floor(rand() * CARS.length)]);
    }
  } else if (side > 0.6) tree(k, hw - 0.4, zBack, 0.8, low, 1);
  lampPost(k, g, -0.45, hd - 0.12, 0.65, low);
  lampPost(k, g, 0.45, hd - 0.12, 0.65, low, -0.12);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Mosque: a green dome and two minarets over a white prayer hall ---------- */

const MQ_WALL = '#fbfaf7';
const MQ_GREEN = '#15803d';
const MQ_TRIM = '#ece6d8';
const MQ_POOL = '#38bdf8';

function minaret(k: Kit, x: number, z: number, h: number, low: boolean) {
  const seg = low ? 6 : 8;
  bx(k, MQ_WALL, x, 0, z, 0.32, 0.5, 0.32);
  bx(k, MQ_GREEN, x, 0.46, z, 0.34, 0.05, 0.34);
  k.post(MQ_WALL, [x, 0.5, z], 0.13, h * 0.5, seg, 0.85);
  const b1 = 0.5 + h * 0.5;
  k.post(MQ_GREEN, [x, b1, z], 0.2, 0.06, seg);
  k.post('lamp', [x, b1 + 0.06, z], 0.16, 0.04, seg);
  k.post(MQ_WALL, [x, b1 + 0.06, z], 0.1, h * 0.28, seg, 0.85);
  const b2 = b1 + 0.06 + h * 0.28;
  if (!low) {
    k.post(MQ_GREEN, [x, b2, z], 0.15, 0.05, seg);
    k.post('lamp', [x, b2 + 0.05, z], 0.12, 0.03, seg);
  }
  k.post(MQ_WALL, [x, b2 + 0.05, z], 0.085, 0.16, seg);
  k.post(MQ_GREEN, [x, b2 + 0.21, z], 0.11, 0.34, seg, 0);
  k.post(GOLD, [x, b2 + 0.55, z], 0.012, 0.12, 4);
}

function mosque(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 23 + d * 61);
  const hw = w / 2, hd = d / 2;
  bx(k, SAND, 0, 0, 0, w, 0.04, d);
  compound(k, w, d, MQ_WALL, MQ_GREEN, 0.8, 0.3, low);

  // The prayer hall: white walls, a green band and crenellations along the top.
  const hx = Math.min(w * 0.3, 1.45);
  const hz0 = -hd + 0.2, hz1 = hz0 + Math.min(d * 0.5, 2.1), hz = (hz0 + hz1) / 2, hdz = hz1 - hz0, H = 1.05;
  bx(k, MQ_WALL, 0, 0, hz, hx * 2, H, hdz);
  bx(k, MQ_GREEN, 0, H - 0.12, hz, hx * 2 + 0.02, 0.07, hdz + 0.02);
  fl(k, MQ_TRIM, -hx + 0.06, hz0 + 0.06, hx - 0.06, hz1 - 0.06, H + 0.004);
  if (!low) {
    for (let x = -hx + 0.06; x <= hx - 0.05; x += 0.18) bx(k, MQ_WALL, x, H, hz1 - 0.035, 0.09, 0.09, 0.07);
    for (const s of [-1, 1]) for (let z = hz0 + 0.06; z <= hz1 - 0.1; z += 0.18) bx(k, MQ_WALL, s * (hx - 0.035), H, z, 0.07, 0.09, 0.09);
  }
  // Pointed arched windows down the sides.
  for (const s of [-1, 1]) {
    const n = Math.max(2, Math.floor(hdz / 0.45));
    for (let i = 0; i < n; i++) {
      const z0 = hz0 + 0.2 + i * ((hdz - 0.4) / n), z1 = z0 + 0.16, x = s * hx + s * 0.005;
      rx(k, 'glass', z0, 0.35, z1, 0.68, x, s);
      tri(k, 'glass', [x, 0.68, z0], [x, 0.68, z1], [x, 0.8, (z0 + z1) / 2], [s, 0, 0], undefined, seedAt(x, 0.515, (z0 + z1) / 2));
    }
  }
  // The arcade along the front: piers, pointed arches, shade behind.
  const pz = hz1 + 0.3, n = Math.max(3, Math.floor((hx * 2) / 0.42));
  bx(k, MQ_TRIM, 0, 0, hz1 + 0.16, hx * 2, 0.06, 0.34);
  rz(k, SHADOW, -hx + 0.05, 0.06, hx - 0.05, 0.62, hz1 + 0.004);
  bx(k, MQ_WALL, 0, 0.62, hz1 + 0.16, hx * 2, 0.2, 0.32);
  bx(k, MQ_GREEN, 0, 0.82, hz1 + 0.16, hx * 2 + 0.02, 0.04, 0.34);
  for (let i = 0; i <= n; i++) {
    const x = -hx + 0.045 + (i * (hx * 2 - 0.09)) / n;
    bx(k, MQ_WALL, x, 0.06, pz, 0.09, 0.56, 0.09);
    if (i === n) continue;
    const x1 = -hx + 0.045 + ((i + 1) * (hx * 2 - 0.09)) / n, xm = (x + x1) / 2, z = pz + 0.046;
    tri(k, MQ_WALL, [x, 0.44, z], [x, 0.62, z], [xm, 0.62, z], [0, 0, 1]);
    tri(k, MQ_WALL, [x1, 0.44, z], [xm, 0.62, z], [x1, 0.62, z], [0, 0, 1]);
  }
  rz(k, WOOD, -0.16, 0.06, 0.16, 0.5, hz1 + 0.006);

  // The dome on its drum, a gold crescent on top; small domes on the corners of the roof.
  const dr = Math.min(hx * 0.55, hdz * 0.34);
  k.post(MQ_WALL, [0, H, hz], dr * 1.02, 0.26, low ? 12 : 16);
  k.post(MQ_GREEN, [0, H + 0.2, hz], dr * 1.05, 0.05, low ? 12 : 16);
  if (!low) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    k.box('glass', [Math.cos(a) * dr * 1.03, H + 0.11, hz + Math.sin(a) * dr * 1.03], [0.06, 0.1, 0.06], [0, -a, 0]);
  }
  k.shape(MQ_GREEN, HEMI(low), [0, H + 0.25, hz], [dr, dr * 1.1, dr]);
  const top = H + 0.25 + dr * 1.1;
  k.post(GOLD, [0, top - 0.03, hz], 0.022, 0.2, 5);
  k.shape(GOLD, BALL(), [0, top + 0.1, hz], [0.04, 0.04, 0.04]);
  k.box(GOLD, [-0.02, top + 0.22, hz], [0.025, 0.1, 0.02], [0, 0, 0.4]);
  k.box(GOLD, [0.02, top + 0.22, hz], [0.025, 0.1, 0.02], [0, 0, -0.4]);
  if (!low) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (hx - 0.24), z = hz + sz * (hdz / 2 - 0.24);
    k.post(MQ_WALL, [x, H, z], 0.15, 0.12, 8);
    k.shape(MQ_GREEN, HEMI(true), [x, H + 0.12, z], [0.15, 0.16, 0.15]);
  }
  // A soft green wash over the dome at night.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, b = ((i + 1) / 12) * Math.PI * 2, r = dr * 1.08;
    g.quad([Math.cos(a) * r, H + 0.25, hz + Math.sin(a) * r], [Math.cos(b) * r, H + 0.25, hz + Math.sin(b) * r], [Math.cos(b) * r * 0.6, H + 0.25 + dr * 0.95, hz + Math.sin(b) * r * 0.6], [Math.cos(a) * r * 0.6, H + 0.25 + dr * 0.95, hz + Math.sin(a) * r * 0.6], [0.05, 0.22, 0.1], [0.05, 0.22, 0.1], [0, 0, 0], [0, 0, 0]);
  }

  // Two minarets at the front corners of the hall.
  for (const s of [-1, 1]) minaret(k, s * (hx + 0.24), hz1 + 0.12, 2.9, low);

  // The courtyard: paving, the ablution fountain under its little dome, worshippers in white, date palms.
  fl(k, MQ_TRIM, -hx - 0.1, hz1 + 0.5, hx + 0.1, hd - 0.1, 0.046);
  const fz = (hz1 + 0.5 + hd - 0.1) / 2;
  k.post(MQ_TRIM, [0, 0, fz], 0.34, 0.12, 8);
  k.post(MQ_POOL, [0, 0.12, fz], 0.28, 0.01, 8);
  if (!low) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      bx(k, MQ_WALL, Math.cos(a) * 0.24, 0.12, fz + Math.sin(a) * 0.24, 0.04, 0.4, 0.04);
    }
    k.post(MQ_WALL, [0, 0.52, fz], 0.3, 0.04, 8);
    k.shape(MQ_GREEN, HEMI(true), [0, 0.56, fz], [0.22, 0.2, 0.22]);
    crowd(k, rand, 10, -hx, hz1 + 0.55, hx, hd - 0.2, [WHITE, WHITE, WHITE, '#e7e5e4', '#93c5fd']);
    for (let i = 0; i < 6; i++) person(k, -0.6 + i * 0.24, pz - 0.12, WHITE, WHITE, SKIN[i % 3]);
  }
  palm(k, -hw + 0.4, hd - 0.4, 1.2, low, 0);
  palm(k, hw - 0.4, hd - 0.4, 1.3, low, 2);
  if (!low) {
    palm(k, -hw + 0.4, -hd + 0.5, 1.1, low, 1);
    palm(k, hw - 0.4, -hd + 0.5, 1.2, low, 3);
  }
  lampPost(k, g, -hx - 0.05, fz, 0.6, low);
  lampPost(k, g, hx + 0.05, fz, 0.6, low, -0.12);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Tech hub: a glass co-working block with a cantilevered top ---------- */

const TH_FRAME = '#e5e7eb';
const TH_CORE = '#334155';
const TH_GREEN = '#22c55e';
const SOLAR = '#1e3a8a';
const DECK = '#a16207';

function techhub(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 13 + d * 101);
  const hw = w / 2, hd = d / 2;
  bx(k, '#d1d5db', 0, 0, 0, w, 0.04, d);
  fl(k, LAWN, -hw + 0.1, hd - 0.75, -0.6, hd - 0.1, 0.045);

  // Two floors of glass on a dark core...
  const fh = 0.62, x0 = -hw + 0.3, x1 = hw - 0.6, z0 = -hd + 0.25, z1 = hd - 1.0;
  const block = (a0: number, a1: number, b0: number, b1: number, y: number, fins: boolean) => {
    const cx = (a0 + a1) / 2, cz = (b0 + b1) / 2;
    bx(k, TH_CORE, cx, y, cz, a1 - a0, 2 * fh, b1 - b0);
    for (let i = 0; i < 2; i++) {
      bandZ(k, a0 + 0.04, a1 - 0.04, y + i * fh + 0.06, y + (i + 1) * fh - 0.06, b1, 1, TH_FRAME, 0.26, low);
      bandX(k, b0 + 0.04, b1 - 0.04, y + i * fh + 0.06, y + (i + 1) * fh - 0.06, a1, 1, TH_FRAME, 0.26, low);
      bandX(k, b0 + 0.04, b1 - 0.04, y + i * fh + 0.06, y + (i + 1) * fh - 0.06, a0, -1, TH_FRAME, 0.26, true);
    }
    for (let i = 0; i <= 2; i++) bx(k, TH_FRAME, cx, y + i * fh - (i ? 0.04 : 0), cz, a1 - a0 + 0.05, 0.06, b1 - b0 + 0.05);
    if (fins && !low) for (let x = a0 + 0.12; x < a1 - 0.06; x += 0.22) bx(k, TH_GREEN, x, y + 0.04, b1 + 0.04, 0.035, 2 * fh - 0.08, 0.07);
  };
  block(x0, x1, z0, z1, 0, false);
  // ...and two more on top, slid forward and right over the entrance.
  const ux0 = x0 + 0.85, ux1 = x1 + 0.25, uz0 = z0 + 0.45, uz1 = z1 + 0.4;
  block(ux0, ux1, uz0, uz1, 2 * fh, true);
  const top = 4 * fh + 0.02;
  bx(k, TH_GREEN, (ux0 + ux1) / 2, top - 0.15, (uz0 + uz1) / 2, ux1 - ux0 + 0.07, 0.06, uz1 - uz0 + 0.07);
  // On the roof: solar panels tilted to the south at the back, a garden and a glass rooflight over the atrium at the front.
  const um = (uz0 + uz1) / 2;
  const rows = Math.max(1, Math.floor((um - uz0 - 0.1) / 0.34));
  for (let r = 0; r < rows; r++) {
    const z = uz0 + 0.22 + r * 0.34;
    k.box(SOLAR, [(ux0 + ux1) / 2, top + 0.09, z], [ux1 - ux0 - 0.3, 0.025, 0.26], [-0.35, 0, 0]);
    if (!low) k.box(TH_FRAME, [(ux0 + ux1) / 2, top + 0.04, z - 0.08], [ux1 - ux0 - 0.3, 0.08, 0.02]);
  }
  fl(k, LAWN, ux0 + 0.08, um + 0.05, ux1 - 0.08, uz1 - 0.12, top + 0.012);
  bx(k, TH_FRAME, ux0 + (ux1 - ux0) * 0.62, top, (um + uz1) / 2, 0.6, 0.06, 0.42);
  quad(k, 'glass', [ux0 + (ux1 - ux0) * 0.62 - 0.28, top + 0.06, (um + uz1) / 2 + 0.19], [ux0 + (ux1 - ux0) * 0.62 + 0.28, top + 0.06, (um + uz1) / 2 + 0.19], [ux0 + (ux1 - ux0) * 0.62 + 0.28, top + 0.2, (um + uz1) / 2], [ux0 + (ux1 - ux0) * 0.62 - 0.28, top + 0.2, (um + uz1) / 2], [0, 1, 1]);
  quad(k, 'glass', [ux0 + (ux1 - ux0) * 0.62 + 0.28, top + 0.06, (um + uz1) / 2 - 0.19], [ux0 + (ux1 - ux0) * 0.62 - 0.28, top + 0.06, (um + uz1) / 2 - 0.19], [ux0 + (ux1 - ux0) * 0.62 - 0.28, top + 0.2, (um + uz1) / 2], [ux0 + (ux1 - ux0) * 0.62 + 0.28, top + 0.2, (um + uz1) / 2], [0, 1, -1]);
  if (!low) for (const x of [ux0 + 0.25, ux0 + 0.5]) tree(k, x, (um + uz1) / 2, 0.45, low, 2);
  // The name lit up along the top, a terrace on the lower roof with umbrellas.
  bx(k, TH_CORE, (ux0 + ux1) / 2, top, uz1 - 0.04, ux1 - ux0, 0.2, 0.06);
  letters(k, TH_GREEN, ux0 + 0.15, ux1 - 0.15, top + 0.1, 0.12, uz1 - 0.005);
  glowZ(g, ux0 + 0.1, top + 0.02, ux1 - 0.1, top + 0.18, uz1 + 0.003, [0.1, 0.45, 0.2]);
  // The lower roof left free round the top floors: a timber deck to work out on.
  fl(k, DECK, x0 + 0.04, z0 + 0.04, ux0 - 0.02, z1 - 0.04, 2 * fh + 0.025);
  fl(k, DECK, ux0 - 0.02, z0 + 0.04, x1 - 0.04, uz0 - 0.02, 2 * fh + 0.025);
  if (!low) {
    const y = 2 * fh + 0.025;
    for (const [x, z, c] of [[(x0 + ux0) / 2, z0 + 0.45, '#f97316'], [(x0 + ux0) / 2, z1 - 0.4, TH_GREEN], [(ux0 + x1) / 2, (z0 + uz0) / 2, '#f97316']] as const) {
      k.post('#52525b', [x, y, z], 0.012, 0.4, 4);
      k.post(c, [x, y + 0.32, z], 0.2, 0.12, 8, 0.05);
      bx(k, LINE, x + 0.12, y, z, 0.14, 0.1, 0.14);
    }
  }
  // The way in, under the cantilever: a glass door, a step, the hub's sign out by the road.
  bx(k, TH_FRAME, (ux0 + x1) / 2, 0, z1 + 0.2, ux1 - ux0 - 0.4, 0.04, 0.4);
  signboard(k, g, -0.9, hd - 0.2, 0.9, 0.3, 0.42, TH_CORE, TH_GREEN, [0.08, 0.36, 0.16], 0.2);
  // The generator house and diesel tank round the side: no hub runs on the grid alone.
  const gx = hw - 0.35, gz = hd - 0.4;
  bx(k, '#16a34a', gx, 0, gz, 0.5, 0.3, 0.36);
  bx(k, DARK, gx, 0.3, gz, 0.52, 0.03, 0.38);
  k.post(DARK, [gx - 0.15, 0.3, gz], 0.025, 0.25, 4);
  k.post('#e5e7eb', [gx - 0.5, 0, gz + 0.05], 0.12, 0.3, 8);
  // Outdoor desks, bikes, people with laptops.
  if (!low) {
    for (const [x, z, c] of [[-hw + 0.45, hd - 0.4, '#f97316'], [-hw + 1.05, hd - 0.4, TH_GREEN]] as const) {
      bx(k, LINE, x, 0, z, 0.24, 0.16, 0.24);
      umbrella(k, x, z, 0.5, 0.24, c, low);
    }
    for (let i = 0; i < 4; i++) k.box(DARK, [0.2 + i * 0.12, 0.08, hd - 0.2], [0.02, 0.12, 0.24]);
    crowd(k, rand, 7, -hw + 0.3, hd - 0.8, hw - 0.4, hd - 0.15, ['#0f172a', '#f8fafc', '#2563eb', TH_GREEN, '#f97316']);
  }
  tree(k, -hw + 0.25, -hd + 0.4, 0.7, low, 1);
  lampPost(k, g, 0.35, hd - 0.15, 0.6, low);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Motor park: danfos loading under the shed, coaches, kekes, the touts' kiosks ---------- */

const PARK_GROUND = '#57534e';
const ZINC = '#b8c0c8';
const ZINC_RIB = '#9aa3ad';
const ZINC_UNDER = '#7c858f';
const PARK_RED = '#b91c1c';
const KIOSK = ['#2563eb', '#16a34a', '#dc2626', '#f97316'];

/** A tout's kiosk: a little zinc-roofed box with a hatch, painted loud, its owner's umbrella beside it. */
function kiosk(k: Kit, x: number, z: number, body: string, low: boolean, rand: () => number) {
  bx(k, body, x, 0, z, 0.42, 0.36, 0.34);
  rz(k, SHADOW, x - 0.15, 0.14, x + 0.15, 0.3, z + 0.172);
  bx(k, ZINC, x, 0.36, z, 0.5, 0.03, 0.44);
  bx(k, AMBER, x, 0.3, z + 0.175, 0.42, 0.06, 0.01);
  if (low) return;
  umbrella(k, x + 0.35, z + 0.1, 0.5, 0.22, CLOTHES[Math.floor(rand() * 5)], low);
  person(k, x + 0.3, z + 0.28, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
}

function motorpark(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 7 + d * 77);
  const hw = w / 2, hd = d / 2;
  bx(k, PARK_GROUND, 0, 0, 0, w, 0.04, d);
  fl(k, LATERITE, -hw, hd - 0.42, hw, hd, 0.043);

  // The loading shed along the back: a raised platform, steel columns, a zinc roof falling to a red fascia.
  const sz0 = -hd + 0.12, sz1 = -hd + 0.95, sx0 = -hw + 0.2, sx1 = hw - 0.2, yb = 1.05, yf = 0.9;
  bx(k, CONCRETE, 0, 0, (sz0 + sz1) / 2, sx1 - sx0, 0.08, sz1 - sz0);
  const cols = Math.max(3, Math.round((sx1 - sx0) / 1.3));
  for (let i = 0; i <= cols; i++) {
    const x = sx0 + 0.05 + (i * (sx1 - sx0 - 0.1)) / cols;
    bx(k, STEEL, x, 0, sz1 - 0.05, 0.06, yf, 0.06);
    bx(k, STEEL, x, 0, sz0 + 0.05, 0.06, yb, 0.06);
  }
  const ra: V3 = [sx0 - 0.08, yb + 0.03, sz0 - 0.08], rb: V3 = [sx1 + 0.08, yb + 0.03, sz0 - 0.08], rc: V3 = [sx1 + 0.08, yf, sz1 + 0.18], rd: V3 = [sx0 - 0.08, yf, sz1 + 0.18];
  quad(k, ZINC, rd, rc, rb, ra, [0, 1, 0.15]);
  quad(k, ZINC_UNDER, ra, rb, rc, rd, [0, -1, 0]);
  if (!low) for (let x = sx0; x <= sx1; x += 0.15) quad(k, ZINC_RIB, [x - 0.007, yf + 0.005, sz1 + 0.18], [x + 0.007, yf + 0.005, sz1 + 0.18], [x + 0.007, yb + 0.035, sz0 - 0.08], [x - 0.007, yb + 0.035, sz0 - 0.08], [0, 1, 0.15]);
  bx(k, PARK_RED, 0, yf - 0.1, sz1 + 0.18, sx1 - sx0 + 0.18, 0.12, 0.03);
  // Lamps under the fascia, a strip of light along the platform at night.
  for (let i = 0; i < cols; i++) {
    const x = sx0 + 0.05 + ((i + 0.5) * (sx1 - sx0 - 0.1)) / cols;
    bx(k, 'lamp', x, yf - 0.04, sz1 + 0.05, 0.2, 0.03, 0.05);
    if (!low) pool(g, x, sz1 + 0.3, 0.75, scale(WARM, 0.14));
  }
  // The ticket office, closing off the right end of the shed.
  const ox = sx1 - 0.55;
  bx(k, '#fef3c7', ox, 0.08, (sz0 + sz1) / 2, 1.0, 0.78, sz1 - sz0 - 0.12);
  rz(k, 'glass', ox - 0.35, 0.4, ox - 0.05, 0.62, sz1 - 0.055);
  rz(k, WOOD, ox + 0.1, 0.08, ox + 0.3, 0.6, sz1 - 0.055);
  bx(k, PARK_RED, ox, 0.68, sz1 - 0.05, 0.9, 0.12, 0.02);
  letters(k, LINE, ox - 0.4, ox + 0.4, 0.74, 0.07, sz1 - 0.038);
  if (!low) {
    for (let x = sx0 + 0.3; x < ox - 0.7; x += 0.8) bx(k, WOOD, x, 0.08, sz0 + 0.25, 0.5, 0.1, 0.12);
    crowd(k, rand, 14, sx0 + 0.2, sz0 + 0.3, ox - 0.6, sz1 + 0.1);
  }

  // The danfos in a row in front of the shed, loading up, noses out to the road; bay lines between them.
  const bz = sz1 + 0.74;
  const n = Math.max(3, Math.floor((sx1 - sx0 - 0.2) / 0.78));
  for (let i = 0; i < n; i++) {
    const x = sx0 + 0.45 + i * ((sx1 - sx0 - 0.9) / (n - 1));
    fl(k, AMBER, x + 0.37, bz - 0.6, x + 0.4, bz + 0.6, 0.045);
    if (low && i % 2) continue;
    const body = i % 3 === 2 ? WHITE : '#facc15';
    danfo(k, F(x, bz), low, body, body === WHITE ? GREEN : '#111827', rand);
    if (!low && rand() < 0.6) {
      // Passengers and their loads at the back door.
      for (let j = 0; j < 2; j++) person(k, x + (rand() - 0.5) * 0.4, bz - 0.72 - rand() * 0.1, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
      bx(k, CLOTHES[Math.floor(rand() * 4)], x + 0.2, 0, bz - 0.75, 0.16, 0.12, 0.12);
    }
  }

  // The open lot in front: coaches on the left, the keke rank on the right, kiosks along the road, the gate sign.
  const lz = hd - 0.95;
  coach(k, F(-hw + 1.3, lz, Math.PI / 2), low);
  if (!low || w > 6) coach(k, F(-hw + 3.15, lz, Math.PI / 2), low, PARK_RED);
  const kekes = low ? 3 : 6;
  for (let i = 0; i < kekes; i++) keke(k, F(0.9 + i * (low ? 0.6 : 0.36), lz + (i % 2 ? 0.05 : -0.05), Math.PI));
  if (!low) {
    // Okadas waiting by the road, a roast-corn seller by the gate.
    for (let i = 0; i < 3; i++) {
      const f = F(hw - 0.5 - i * 0.22, hd - 0.75, 0.3);
      k.box(DARK, [0, 0.08, 0], [0.05, 0.1, 0.3], undefined, f);
      k.box(PARK_RED, [0, 0.14, 0.02], [0.08, 0.06, 0.16], undefined, f);
      person(k, 0, -0.02, CLOTHES[i + 1], DARK, SKIN[i], f);
    }
    bx(k, '#52525b', 0.85, 0, hd - 0.28, 0.2, 0.12, 0.2);
    bx(k, '#f97316', 0.85, 0.12, hd - 0.28, 0.16, 0.02, 0.16);
    person(k, 1.0, hd - 0.2, '#db2777', '#db2777', SKIN[0]);
  }
  for (const [x, i] of [[-hw + 0.45, 0], [-hw + 1.2, 1], [hw - 1.1, 2], [hw - 0.4, 3]] as const) kiosk(k, x, hd - 0.28, KIOSK[i], low, rand);

  // The gate: two posts and the park's name across the way in.
  for (const s of [-1, 1]) bx(k, PARK_RED, s * 0.62, 0, hd - 0.12, 0.1, 1.1, 0.1);
  bx(k, AMBER, 0, 0.86, hd - 0.12, 1.5, 0.26, 0.06);
  letters(k, DARK, -0.65, 0.65, 0.99, 0.13, hd - 0.088);
  glowZ(g, -0.75, 0.86, 0.75, 1.12, hd - 0.08, [0.45, 0.36, 0.1]);
  floodMast(k, g, 0.66, lz + 0.25, 1.6, low, 1.5, Math.PI);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Airport: terminal, apron with a plane at the gate, control tower, runway ---------- */

const AIR_GRASS = '#9fae7a';
const RUNWAY = '#3f4249';
const TAXIWAY = '#565b63';
const APRON = '#b4b8bd';
const TERM_WALL = '#e2e8f0';
const TERM_ROOF = '#f1f5f9';
const TERM_RIB = '#cbd5e1';
const HANGAR = '#cbd5e1';

/** Where the runway runs on an airport of this size (the departing plane rolls along it). */
const runwayOf = (w: number, d: number) => ({ z: -d / 2 + 0.85, x0: -w / 2 + 0.3, x1: w / 2 - 0.3 });

function airport(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 3 + d * 211);
  const hw = w / 2, hd = d / 2;
  bx(k, AIR_GRASS, 0, 0, 0, w, 0.04, d);

  // The runway along the back: centre line, threshold piano keys, aiming marks, edge lights.
  const rw = runwayOf(w, d), rz0 = rw.z - 0.6, rz1 = rw.z + 0.6;
  fl(k, '#6b7280', rw.x0 - 0.05, rz0 - 0.08, rw.x1 + 0.05, rz1 + 0.08, 0.044);
  fl(k, RUNWAY, rw.x0, rz0, rw.x1, rz1, 0.046);
  for (let x = rw.x0 + 1.3; x < rw.x1 - 1.3; x += 0.8) fl(k, LINE, x, rw.z - 0.025, x + 0.42, rw.z + 0.025, 0.05);
  for (const s of [-1, 1]) {
    const xe = s < 0 ? rw.x0 + 0.12 : rw.x1 - 0.52;
    for (let i = 0; i < 8; i++) {
      const z = rz0 + 0.12 + (i * (rz1 - rz0 - 0.24)) / 7;
      fl(k, LINE, xe, z - 0.035, xe + 0.4, z + 0.035, 0.05);
    }
    const xa = s < 0 ? rw.x0 + 1.5 : rw.x1 - 2.1;
    for (const dz of [-0.3, 0.3]) fl(k, LINE, xa, rw.z + dz - 0.06, xa + 0.6, rw.z + dz + 0.06, 0.05);
  }
  for (const z of [rz0 - 0.03, rz1 + 0.03]) {
    if (!low) for (let x = rw.x0 + 0.2; x < rw.x1; x += 0.9) bx(k, 'lamp', x, 0.045, z, 0.045, 0.025, 0.045);
    g.quad([rw.x0, 0.06, z - 0.03], [rw.x1, 0.06, z - 0.03], [rw.x1, 0.06, z + 0.03], [rw.x0, 0.06, z + 0.03], [0.3, 0.27, 0.18]);
  }
  for (const x of [rw.x0 - 0.02, rw.x1 + 0.02]) g.quad([x - 0.03, 0.06, rz0], [x + 0.03, 0.06, rz0], [x + 0.03, 0.06, rz1], [x - 0.03, 0.06, rz1], [0.05, 0.4, 0.12]);

  // The apron in the middle, joined to the runway by two taxiways with yellow centre lines.
  const tx0 = -hw + 0.5, tx1 = -2.0, tz0 = -0.55, tz1 = 1.35;
  const ax0 = tx1 + 0.05, ax1 = hw - 2.5, az0 = rz1 + 0.35, az1 = 1.5;
  fl(k, APRON, ax0, az0, ax1, az1, 0.047);
  for (const x of [ax0 + 1.0, ax1 - 0.8]) {
    fl(k, TAXIWAY, x - 0.3, rz1, x + 0.3, az0, 0.046);
    fl(k, AMBER, x - 0.015, rz1, x + 0.015, az0 + 0.6, 0.05);
  }
  // The stands: a yellow lead-in line to each, and a stop bar by the nose.
  const standZ = (az0 + az1) / 2 + 0.05;
  for (const sx of [ax0 + 0.2, ax0 + 3.4]) {
    fl(k, AMBER, sx, standZ - 0.015, sx + 2.6, standZ + 0.015, 0.05);
    fl(k, AMBER, sx + 0.15, standZ - 0.3, sx + 0.19, standZ + 0.3, 0.05);
  }
  airliner(k, F(ax0 + 1.6, standZ, -Math.PI / 2), low);
  if (!low) airliner(k, F(ax0 + 4.8, standZ, -Math.PI / 2), low, '#1d4ed8');
  // The jet bridge from the terminal out to the first plane's door.
  bx(k, '#d1d5db', tx1 + 0.3, 0.3, standZ + 0.42, 0.62, 0.13, 0.16);
  bx(k, '#d1d5db', tx1 + 0.68, 0.3, standZ + 0.3, 0.2, 0.15, 0.28);
  bx(k, DARK, tx1 + 0.6, 0, standZ + 0.42, 0.04, 0.3, 0.04);
  if (!low) {
    // Baggage carts and a tug, a fuel bowser by the second plane.
    for (let i = 0; i < 3; i++) bx(k, i ? '#e5e7eb' : '#facc15', ax0 + 1.3 + i * 0.2, 0, standZ + 0.7, 0.16, 0.1, 0.12);
    lorry(k, F(ax0 + 4.3, standZ + 0.75, Math.PI / 2), '#facc15', '#e5e7eb', 0.2, 1.0);
  }

  // The terminal: glass all along the front under a white wave of a roof, a green fascia with the name.
  const tl = tx1 - tx0, td = tz1 - tz0, tcx = (tx0 + tx1) / 2, tcz = (tz0 + tz1) / 2, th = 0.85;
  bx(k, TERM_WALL, tcx, 0, tcz, tl, th, td);
  bandZ(k, tx0 + 0.1, tx1 - 0.1, 0.06, th - 0.08, tz1, 1, TERM_RIB, 0.3, low);
  bandX(k, tz0 + 0.1, tz1 - 0.1, 0.06, th - 0.08, tx1, 1, TERM_RIB, 0.3, low);
  const steps = low ? 4 : 7, rz0r = tz0 - 0.12, rz1r = tz1 + 0.4;
  const ry = (t: number) => th + 0.06 + 0.26 * Math.sin(Math.PI * t) + 0.05 * t;
  for (let i = 0; i < steps; i++) {
    const ta = i / steps, tb = (i + 1) / steps;
    const za = rz0r + ta * (rz1r - rz0r), zb = rz0r + tb * (rz1r - rz0r);
    quad(k, TERM_ROOF, [tx0 - 0.1, ry(ta), za], [tx0 - 0.1, ry(tb), zb], [tx1 + 0.1, ry(tb), zb], [tx1 + 0.1, ry(ta), za], [0, 1, 0]);
    quad(k, TERM_RIB, [tx0 - 0.1, ry(ta) - 0.03, za], [tx1 + 0.1, ry(ta) - 0.03, za], [tx1 + 0.1, ry(tb) - 0.03, zb], [tx0 - 0.1, ry(tb) - 0.03, zb], [0, -1, 0]);
    for (const x of [tx0 - 0.1, tx1 + 0.1]) quad(k, TERM_RIB, [x, th, za], [x, th, zb], [x, ry(tb), zb], [x, ry(ta), za], [x < tcx ? -1 : 1, 0, 0]);
    if (!low) for (let x = tx0 + 0.3; x < tx1; x += 0.6) quad(k, TERM_RIB, [x - 0.012, ry(ta) + 0.004, za], [x - 0.012, ry(tb) + 0.004, zb], [x + 0.012, ry(tb) + 0.004, zb], [x + 0.012, ry(ta) + 0.004, za], [0, 1, 0]);
  }
  rz(k, GREEN, tx0 - 0.1, ry(1) - 0.14, tx1 + 0.1, ry(1), rz1r);
  letters(k, LINE, tx0 + 0.4, tx1 - 0.4, ry(1) - 0.07, 0.09, rz1r + 0.004);
  glowZ(g, tx0, ry(1) - 0.14, tx1, ry(1), rz1r + 0.01, [0.12, 0.35, 0.18]);
  for (let x = tx0 + 0.2; x < tx1; x += 1.0) bx(k, LINE, x, 0, rz1r - 0.05, 0.05, ry(1) - 0.02, 0.05);
  // Landside: the drop-off kerb, the car park, the flags.
  fl(k, SLAB, tx0 - 0.1, tz1, tx1 + 0.3, tz1 + 0.42, 0.046);
  const px1 = tx1 + 0.3;
  fl(k, ASPHALT, -hw + 0.3, tz1 + 0.42, px1, hd - 0.12, 0.045);
  for (let x = tx0 + 0.15; x < px1 - 0.4; x += 0.6) fl(k, LINE, x, hd - 0.6, x + 0.02, hd - 0.15, 0.05);
  for (let i = 0, x = tx0 + 0.45; x < px1 - 0.4; x += 0.6, i++) if (rand() < (low ? 0.35 : 0.7)) car(k, F(x, hd - 0.38, Math.PI), i % 5 === 2 ? '#facc15' : CARS[Math.floor(rand() * CARS.length)]);
  // The airside fence along the road in front of the apron.
  const fz = hd - 0.22;
  quad(k, '#9ca3af', [px1 + 0.2, 0.05, fz], [hw - 0.25, 0.05, fz], [hw - 0.25, 0.3, fz], [px1 + 0.2, 0.3, fz], [0, 0, 1]);
  quad(k, '#9ca3af', [px1 + 0.2, 0.05, fz], [px1 + 0.2, 0.3, fz], [hw - 0.25, 0.3, fz], [hw - 0.25, 0.05, fz], [0, 0, -1]);
  if (!low) for (let x = px1 + 0.2; x <= hw - 0.2; x += 0.5) bx(k, STEEL, x, 0, fz, 0.025, 0.32, 0.025);
  if (!low) {
    coach(k, F(tx1 - 1.2, tz1 + 0.68, Math.PI / 2), low);
    crowd(k, rand, 10, tx0 + 0.2, tz1 + 0.05, tx1 - 0.2, tz1 + 0.35);
  }
  for (const x of [tx1 + 0.45, tx1 + 0.75, tx1 + 1.05]) flag(k, x, tz1 + 0.2, 1.2);

  // The control tower: a shaft up to a glass cab, a red beacon on top.
  const cx = hw - 1.5, cz = 1.0;
  bx(k, TERM_WALL, cx, 0, cz, 0.7, 0.42, 0.6);
  winZ(k, 2, cx - 0.3, cx + 0.3, 0.18, 0.34, cz + 0.3, 1, LINE, low);
  k.post(TERM_WALL, [cx, 0.42, cz], 0.15, 2.2, 8);
  k.post(DARK, [cx, 2.6, cz], 0.3, 0.06, 8);
  k.post('glass', [cx, 2.66, cz], 0.3, 0.28, 8, 1.15);
  k.post('#475569', [cx, 2.94, cz], 0.38, 0.06, 8, 0.75);
  k.post(STEEL, [cx, 3.0, cz], 0.012, 0.3, 4);
  bx(k, RED, cx, 3.28, cz, 0.05, 0.05, 0.05);
  g.quad([cx - 0.08, 3.22, cz + 0.03], [cx + 0.08, 3.22, cz + 0.03], [cx + 0.08, 3.38, cz + 0.03], [cx - 0.08, 3.38, cz + 0.03], [0.7, 0.05, 0.05]);
  // A hangar beside the apron, its doors to the front; the fuel farm; a windsock by the runway.
  const hx = hw - 1.4, hz = (az0 + cz - 0.5) / 2 - 0.15, hl = 1.2;
  k.shape(HANGAR, unitCyl(low ? 8 : 14, 1), [hx, 0, hz], [0.95, hl, 0.72], [Math.PI / 2, 0, 0]);
  rz(k, '#64748b', hx - 0.65, 0.04, hx + 0.65, 0.5, hz + hl / 2 + 0.004);
  if (!low) for (let i = 1; i < 6; i++) rz(k, TERM_RIB, hx - 0.65 + i * 0.217 - 0.01, 0.04, hx - 0.65 + i * 0.217 + 0.01, 0.5, hz + hl / 2 + 0.008);
  for (const dx of [0.35, 0.75]) {
    k.post('#f8fafc', [hw - dx, 0, hd - 0.4], 0.17, 0.32, 10);
    k.post(GREEN, [hw - dx, 0.32, hd - 0.4], 0.17, 0.02, 10);
  }
  if (!low) {
    k.post(STEEL, [rw.x0 + 2.5, 0, rz1 + 0.3], 0.012, 0.45, 4);
    k.box('#f97316', [rw.x0 + 2.6, 0.43, rz1 + 0.3], [0.2, 0.05, 0.05]);
  }
  floodMast(k, g, ax0 + 3.1, az1 - 0.05, 1.7, low, 1.5, Math.PI);
  floodMast(k, g, ax1 - 0.1, az1 - 0.05, 1.7, low, 1.5, Math.PI);
  lampPost(k, g, tx0 + 1.5, hd - 0.12, 0.7, low);
  lampPost(k, g, tx1 - 0.5, hd - 0.12, 0.7, low);
  return { parts: k.build(), glow: g.build() };
}

/** The plane on the runway: a departure every 16 seconds, rolling, lifting off and climbing away. */
function Departure({ w, d }: { w: number; d: number }) {
  const ref = useRef<Group>(null!);
  const rw = runwayOf(w, d);
  const run = rw.x1 - rw.x0;
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 16) / 16;
    const p = ref.current;
    p.visible = t > 0.1 && t < 0.85;
    const s = Math.max(0, t - 0.1) / 0.75;
    const x = rw.x0 + 0.8 + s * s * (run + 6);
    const lift = Math.max(0, x - (rw.x0 + run * 0.62));
    p.position.set(x, lift * 0.35, rw.z);
    p.rotation.z = Math.min(0.3, lift * 0.12);
  });
  return (
    <group ref={ref} userData={{ dynamic: true }} visible={false}>
      <KitModel build={(low) => {
        const k = new Kit();
        airliner(k, F(0, 0, Math.PI / 2), low);
        return { parts: k.build() };
      }} deps={[]} />
    </group>
  );
}

/* ---------- Jetty: a plank pier out over the water, canoes, a fisherman's stilt hut ---------- */

const PLANK = '#8b5a2b';
const PILE = '#5a3418';
const CANOE = '#7c2d12';
const CANOE_IN = '#a16207';
const NET = '#365314';

/** A dugout canoe, pointed at both ends, along +z in its frame. */
function canoe(k: Kit, f: Matrix4, len: number, wid: number, paint: string) {
  const mid = len - wid;
  k.box(CANOE, [0, 0.07, 0], [wid, 0.1, mid], undefined, f);
  for (const s of [-1, 1]) k.box(CANOE, [0, 0.07, (s * mid) / 2], [wid * 0.71, 0.1, wid * 0.71], [0, Math.PI / 4, 0], f);
  k.box(CANOE_IN, [0, 0.121, 0], [wid * 0.7, 0.01, mid - 0.05], undefined, f);
  k.box(paint, [0, 0.09, 0], [wid + 0.006, 0.025, mid * 0.8], undefined, f);
}

function jetty(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 11 + d * 3);
  const hd = d / 2;
  // The pier, from the bank out past the water's edge, a T-head at the end; piles every few planks.
  const z0 = -hd + 0.15, z1 = hd + 1.45, y = 0.16;
  bx(k, PLANK, 0, y, (z0 + z1) / 2, 0.55, 0.05, z1 - z0);
  bx(k, PLANK, 0, y, z1 - 0.2, 1.5, 0.05, 0.4);
  if (!low) for (let z = z0 + 0.1; z < z1 - 0.4; z += 0.12) fl(k, PILE, -0.27, z, 0.27, z + 0.012, y + 0.052);
  for (let z = z0 + 0.1; z <= z1; z += 0.55) for (const x of [-0.25, 0.25]) bx(k, PILE, x, -0.1, Math.min(z, z1 - 0.05), 0.06, y + 0.17, 0.06);
  for (const x of [-0.7, 0.7]) bx(k, PILE, x, -0.1, z1 - 0.2, 0.06, y + 0.2, 0.06);
  // Canoes tied up either side of the head, one with its fisherman and paddle.
  canoe(k, F(-0.95, hd + 0.75, 0.15), 1.2, 0.28, '#2563eb');
  canoe(k, F(0.95, hd + 0.85, -0.2), 1.1, 0.26, RED);
  if (!low) {
    canoe(k, F(-0.55, hd + 1.95, 1.3), 1.0, 0.26, AMBER);
    person(k, 0.95, hd + 0.75, '#f97316', DARK, SKIN[0], F(0, 0.05));
    k.box(PILE, [1.15, 0.2, hd + 0.9], [0.03, 0.03, 0.55], [0.5, 0, 0]);
    person(k, 0.1, z1 - 0.2, '#16a34a', DARK, SKIN[1], F(0, y));
    k.box(PILE, [0.35, y + 0.35, z1 + 0.2], [0.012, 0.012, 0.9], [-0.7, 0, 0]);
  }
  // On the bank: a fisherman's hut up on stilts under rusty zinc, nets drying on poles, the smoking drum.
  const hx = 1.25, hz = -hd + 0.45;
  for (const [dx, dz] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) bx(k, PILE, hx + dx, 0, hz + dz, 0.05, 0.22, 0.05);
  bx(k, PLANK, hx, 0.22, hz, 0.72, 0.04, 0.58);
  bx(k, '#9a6b3c', hx, 0.26, hz - 0.04, 0.6, 0.4, 0.46);
  rz(k, SHADOW, hx - 0.08, 0.26, hx + 0.1, 0.56, hz + 0.192);
  hipRoof(k, '#9a5b3a', 0.76, 0.64, 0.66, 0.2, F(hx, hz - 0.04), low ? undefined : '#7c4a2e');
  if (!low) {
    for (const x of [-1.6, -0.9]) k.post(PILE, [x, 0, -hd + 0.3], 0.02, 0.5, 4);
    quad(k, NET, [-1.6, 0.48, -hd + 0.3], [-0.9, 0.48, -hd + 0.3], [-0.9, 0.12, -hd + 0.36], [-1.6, 0.12, -hd + 0.36], [0, 0, 1]);
    quad(k, NET, [-1.6, 0.48, -hd + 0.3], [-1.6, 0.12, -hd + 0.36], [-0.9, 0.12, -hd + 0.36], [-0.9, 0.48, -hd + 0.3], [0, 0, -1]);
    k.post('#3f3f46', [hx - 0.75, 0, -hd + 0.75], 0.12, 0.2, 8);
    bx(k, '#a16207', hx - 0.75, 0.2, -hd + 0.75, 0.2, 0.02, 0.2);
    person(k, hx - 0.5, -hd + 0.85, '#db2777', '#db2777', SKIN[2]);
    for (let i = 0; i < 3; i++) k.post('#a16207', [-0.6 + rand() * 0.2, 0, -hd + 0.6 + i * 0.12], 0.06, 0.08, 6, 1.2);
  }
  // A lamp at the pier head, its light on the water.
  k.post(STEEL, [0.55, y + 0.05, z1 - 0.32], 0.014, 0.5, 4);
  bx(k, 'lamp', 0.55, y + 0.53, z1 - 0.32, 0.07, 0.05, 0.07);
  pool(g, 0.55, z1 - 0.2, 0.8, scale(WARM, 0.2));
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Port: container stacks, ship-to-shore cranes, a box ship alongside ---------- */

const QUAY = '#9ca3af';
const CONTAINERS = ['#1e6fb5', '#b91c1c', '#15803d', '#ea580c', '#64748b', '#e5e7eb', '#ca8a04', '#7c3aed', '#0e7490'];
const CRANE = '#c2410c';
const CRANE_WHITE = '#f1f5f9';
const HULL = '#1e3a8a';
const BOOT = '#991b1b';

function port(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 17 + d * 59);
  const hw = w / 2, hd = d / 2;
  bx(k, QUAY, 0, 0, 0, w, 0.08, d);
  // The quay edge: a black fender strip, bollards, the crane rails.
  bx(k, DARK, 0, -0.04, hd - 0.02, w, 0.1, 0.05);
  for (let x = -hw + 0.4; x < hw; x += 1.1) k.post(DARK, [x, 0.08, hd - 0.12], 0.035, 0.07, 6);
  for (const z of [hd - 0.28, -0.12]) fl(k, '#6b7280', -hw, z - 0.015, hw, z + 0.015, 0.082);

  // The container yard at the back: bays of boxes stacked one to three high, lanes between them.
  const cl = 0.62, cw = 0.26, ch = 0.25;
  for (let r = 0; r < 3; r++) {
    const z = -hd + 0.2 + r * (cw + 0.04);
    for (let x = -hw + 0.4; x < hw - 0.4; x += cl + 0.06) {
      if (Math.round((x + hw) / (cl + 0.06)) % 4 === 3) continue;
      const tall = 1 + Math.floor(rand() * 3);
      for (let t = 0; t < tall; t++) {
        const c = CONTAINERS[Math.floor(rand() * CONTAINERS.length)];
        bx(k, c, x, 0.08 + t * ch, z, cl, ch - 0.01, cw);
        if (!low && t === tall - 1) fl(k, c === '#e5e7eb' ? '#cbd5e1' : '#1f2937', x - cl / 2 + 0.03, z - 0.004, x + cl / 2 - 0.03, z + 0.004, 0.08 + (t + 1) * ch - 0.008);
      }
    }
  }
  // A rubber-tyred gantry over one bay of the yard.
  if (!low) {
    const gx = -hw + 2.6, z0 = -hd + 0.08, z1 = -hd + 0.98;
    for (const x of [gx - 0.45, gx + 0.45]) for (const z of [z0, z1]) bx(k, AMBER, x, 0.08, z, 0.06, 0.95, 0.06);
    for (const x of [gx - 0.45, gx + 0.45]) bx(k, AMBER, x, 1.03, (z0 + z1) / 2, 0.08, 0.08, z1 - z0 + 0.06);
    bx(k, AMBER, gx, 1.03, z1, 0.98, 0.08, 0.08);
    bx(k, AMBER, gx, 1.03, z0, 0.98, 0.08, 0.08);
  }

  // Ship-to-shore cranes along the quay, their booms reaching out over the ship.
  const cranes = w >= 9 ? [-hw + 2.2, 0.2, hw - 2.0] : [-hw + 1.6, hw - 1.6];
  const lz0 = 0.0, lz1 = hd - 0.25, H = 1.9, boomY = 2.15;
  for (const [i, cx] of cranes.entries()) {
    if (low && i === 1 && cranes.length === 3) continue;
    for (const x of [cx - 0.45, cx + 0.45]) {
      for (const z of [lz0, lz1]) bx(k, CRANE, x, 0.08, z, 0.09, H, 0.09);
      bx(k, CRANE, x, 0.08 + H - 0.1, (lz0 + lz1) / 2, 0.1, 0.1, lz1 - lz0 + 0.1);
      if (!low) k.bar(CRANE, [x, 0.5, lz0], [x, H - 0.1, lz1], 0.035);
    }
    for (const z of [lz0, lz1]) bx(k, CRANE, cx, 0.08 + H - 0.1, z, 1.0, 0.1, 0.1);
    // The boom from behind the legs out over the water, the machinery house on top, the A-frame and its stays.
    bx(k, CRANE_WHITE, cx, boomY, (lz0 - 0.6 + hd + 2.6) / 2, 0.24, 0.14, hd + 2.6 - lz0 + 0.6);
    bx(k, CRANE_WHITE, cx, boomY + 0.14, lz0 - 0.2, 0.5, 0.3, 0.55);
    bx(k, CRANE, cx, boomY + 0.14, lz0 - 0.2, 0.52, 0.05, 0.57);
    for (const x of [cx - 0.1, cx + 0.1]) k.bar(CRANE, [x, boomY, lz1], [x, boomY + 0.85, (lz0 + lz1) / 2], 0.04);
    if (!low) {
      k.bar(DARK, [cx, boomY + 0.85, (lz0 + lz1) / 2], [cx, boomY + 0.14, hd + 2.5], 0.015);
      k.bar(DARK, [cx, boomY + 0.85, (lz0 + lz1) / 2], [cx, boomY + 0.14, lz0 - 0.55], 0.015);
      // The trolley and spreader, a box on its way to the ship.
      const sz = hd + 0.5 + i * 0.35;
      bx(k, DARK, cx, boomY - 0.08, sz, 0.3, 0.08, 0.2);
      k.bar(DARK, [cx, boomY - 0.08, sz], [cx, 1.05, sz], 0.012);
      bx(k, CONTAINERS[(i * 3 + 1) % CONTAINERS.length], cx, 0.82, sz, cl, ch - 0.01, cw);
    }
    bx(k, 'lamp', cx, boomY - 0.03, hd + 1.6, 0.16, 0.03, 0.1);
    pool(g, cx, hd + 1.3, 1.2, scale(WARM, low ? 0.12 : 0.18), 0.1, 12);
  }

  // The ship alongside: a long blue hull, red below the waterline, boxes all along her deck, the bridge aft.
  const sl = Math.min(w - 1.4, 7.6), sb = 1.0, sz = hd + 0.68, sx = 0.2;
  bx(k, BOOT, sx, -0.04, sz, sl, 0.1, sb - 0.02);
  bx(k, HULL, sx, 0.05, sz, sl, 0.38, sb);
  k.box(HULL, [sx + sl / 2, 0.24, sz], [sb * 0.71, 0.38, sb * 0.71], [0, Math.PI / 4, 0]);
  bx(k, '#7f1d1d', sx, 0.43, sz, sl - 0.1, 0.01, sb - 0.1);
  const bridgeX = sx - sl / 2 + 0.55;
  bx(k, LINE, bridgeX, 0.43, sz, 0.55, 0.62, sb - 0.14);
  bx(k, LINE, bridgeX, 0.95, sz, 0.35, 0.14, sb + 0.1);
  rz(k, 'glass', bridgeX - 0.14, 0.97, bridgeX + 0.14, 1.06, sz + sb / 2 + 0.055);
  rx(k, 'glass', sz - sb / 2 + 0.05, 0.97, sz + sb / 2 - 0.05, 1.06, bridgeX + 0.18, 1);
  for (const y of [0.58, 0.74]) winZ(k, 3, bridgeX - 0.24, bridgeX + 0.24, y, y + 0.08, sz + (sb - 0.14) / 2, 1, LINE, true);
  k.post(DARK, [bridgeX - 0.15, 1.0, sz], 0.09, 0.28, 8);
  k.post(RED, [bridgeX - 0.15, 1.15, sz], 0.095, 0.06, 8);
  for (let x = bridgeX + 0.45; x < sx + sl / 2 - 0.45; x += cl + 0.04) {
    const tall = 1 + Math.floor(rand() * (low ? 2 : 3));
    for (const dz of [-0.27, 0, 0.27]) for (let t = 0; t < tall; t++) {
      if (low && dz !== 0 && t > 0) continue;
      bx(k, CONTAINERS[Math.floor(rand() * CONTAINERS.length)], x, 0.44 + t * ch, sz + dz, cl, ch - 0.01, cw);
    }
  }
  // Trucks on the quay carrying boxes, a tug off the bow, light towers.
  lorry(k, F(-hw + 1.0, 0.25, Math.PI / 2), '#1d4ed8', CONTAINERS[1], 0.24);
  if (!low) {
    lorry(k, F(hw - 3.4, 0.25, -Math.PI / 2), '#f8fafc', CONTAINERS[0], 0.24);
    const tf = F(sx + sl / 2 + 0.7, sz + 0.35, 0.6);
    k.box(DARK, [0, 0.08, 0], [0.36, 0.16, 0.7], undefined, tf);
    k.box('#f97316', [0, 0.2, -0.05], [0.26, 0.2, 0.3], undefined, tf);
    k.box(LINE, [0, 0.33, 0.05], [0.2, 0.08, 0.14], undefined, tf);
  }
  floodMast(k, g, -hw + 0.25, -0.05, 2.0, low, 1.6, 0);
  floodMast(k, g, hw - 0.25, -0.05, 2.0, low, 1.6, 0);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Flyover: a road lifted on hammerhead piers over the junction ---------- */

const DECK_CONC = '#b8b2a8';
const PIER = '#8f8a82';
const BARRIER = '#d6d3d1';

function flyover(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 43 + d);
  // The deck runs along the main road, which is the front two tiles of the footprint.
  const zc = d / 2 - 1, H = 1.15, ramp = Math.min(2.5, w * 0.25), flat = w - ramp * 2, dw = 1.5;
  bx(k, DECK_CONC, 0, H - 0.18, zc, flat, 0.18, dw);
  fl(k, ASPHALT, -flat / 2, zc - dw / 2 + 0.08, flat / 2, zc + dw / 2 - 0.08, H + 0.002);
  for (const s of [-1, 1]) bx(k, BARRIER, 0, H, zc + s * (dw / 2 - 0.04), flat, 0.17, 0.08);
  bx(k, BARRIER, 0, H, zc, flat, 0.09, 0.06);
  for (let x = -flat / 2 + 0.2; x < flat / 2 - 0.2; x += 0.55) for (const dz of [-0.36, 0.36]) fl(k, LINE, x, zc + dz - 0.015, x + 0.28, zc + dz + 0.015, H + 0.006);
  for (const s of [-1, 1]) fl(k, AMBER, -flat / 2, zc + s * (dw / 2 - 0.12) - 0.012, flat / 2, zc + s * (dw / 2 - 0.12) + 0.012, H + 0.006);
  // The ramps down to the road at each end, their barriers sloping with them.
  const slope = Math.atan2(H - 0.05, ramp), rl = Math.hypot(H - 0.05, ramp);
  for (const s of [-1, 1]) {
    const f = frame([s * (flat / 2 + ramp / 2), (H + 0.05) / 2 - 0.09, zc], [0, 0, -s * slope]);
    k.box(DECK_CONC, [0, 0, 0], [rl + 0.02, 0.18, dw], undefined, f);
    k.box(ASPHALT, [0, 0.092, 0], [rl, 0.004, dw - 0.16], undefined, f);
    for (const t of [-1, 1]) k.box(BARRIER, [0, 0.175, t * (dw / 2 - 0.04)], [rl, 0.17, 0.08], undefined, f);
    for (let i = 0; i < 4; i++) for (const dz of [-0.36, 0.36]) k.box(LINE, [-rl / 2 + 0.3 + i * 0.55, 0.096, dz], [0.28, 0.004, 0.03], undefined, f);
  }
  // Hammerhead piers, clear of the cross street at the middle.
  const piers = [-(flat / 2 - 0.5), flat / 2 - 0.5, -(flat / 2 + ramp * 0.35), flat / 2 + ramp * 0.35];
  for (const x of piers) {
    const top = Math.abs(x) <= flat / 2 ? H - 0.18 : H - 0.18 - ((Math.abs(x) - flat / 2) / ramp) * (H - 0.05);
    bx(k, PIER, x, 0, zc, 0.24, top - 0.12, 0.34);
    bx(k, PIER, x, top - 0.14, zc, 0.3, 0.14, dw - 0.1);
  }
  // Street lamps down the middle, both ways.
  for (let x = -flat / 2 + 0.4; x <= flat / 2 - 0.3; x += 1.5) {
    k.post(STEEL, [x, H + 0.09, zc], 0.016, 0.6, 4);
    for (const s of [-1, 1]) {
      k.box(STEEL, [x, H + 0.68, zc + s * 0.15], [0.016, 0.016, 0.3]);
      bx(k, 'lamp', x, H + 0.65, zc + s * 0.3, 0.07, 0.03, 0.1);
      if (!low) pool(g, x, zc + s * 0.3, 0.6, scale(WARM, 0.14), H + 0.02, 8);
    }
  }
  // The name on a green board on the deck's edge, lit at night.
  const fz = zc + dw / 2;
  bx(k, GREEN, 0, H - 0.2, fz + 0.02, 2.4, 0.3, 0.03);
  letters(k, LINE, -1.1, 1.1, H - 0.05, 0.13, fz + 0.037);
  glowZ(g, -1.2, H - 0.2, 1.2, H + 0.1, fz + 0.045, [0.12, 0.36, 0.18]);
  // Traffic up top, and the hawkers who set up in the shade underneath.
  car(k, F(-1.2, zc - 0.36, -Math.PI / 2, H), CARS[4]);
  if (!low) {
    car(k, F(1.6, zc + 0.36, Math.PI / 2, H), CARS[0]);
    // A danfo climbing the west ramp, tilted with it.
    const up = frame([-(flat / 2 + ramp / 2), (H + 0.05) / 2 - 0.09, zc], [0, 0, slope]).multiply(F(0.1, -0.36, Math.PI / 2, 0.094));
    danfo(k, up, low, '#facc15', '#111827', rand);
    const under = zc - dw / 2 - 0.35;
    if (under > -d / 2 + 0.15) for (const x of [-(flat / 2 - 1.1), flat / 2 - 1.1]) {
      umbrella(k, x, under, 0.5, 0.24, x < 0 ? RED : '#2563eb', low);
      bx(k, WOOD, x + 0.2, 0, under, 0.3, 0.16, 0.2);
      person(k, x - 0.15, under + 0.05, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
    }
  }
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Refinery: tanks, columns, pipe racks and the flare ---------- */

const GRAVEL = '#a1a1aa';
const TANK_WHITE = '#eef0f2';
const TANK_ROOF = '#cbd5e1';
const COLUMN = '#d4d4d8';
const PIPES = ['#f59e0b', '#9ca3af', '#64748b'];
const NNPC_YELLOW = '#facc15';

/** Where the flare stands on a refinery of this size, and its height (the flame sits on top). */
const flareOf = (w: number, d: number) => ({ x: w / 2 - 0.55, z: -d / 2 + 0.55, h: 4.6 });

/** A road tanker: a cab and a silver barrel. */
function tanker(k: Kit, f: Matrix4) {
  k.box(GREEN, [0, 0.27, 0.55], [0.48, 0.38, 0.38], undefined, f);
  k.box(CAR_GLASS, [0, 0.38, 0.745], [0.44, 0.12, 0.02], undefined, f);
  k.box(DARK, [0, 0.12, -0.1], [0.44, 0.08, 1.0], undefined, f);
  k.shape('#e5e7eb', unitCyl(8, 1), [0, 0.36, -0.15], [0.24, 0.95, 0.22], [Math.PI / 2, 0, 0], f);
  for (const z of [0.5, -0.2, -0.5]) k.box(DARK, [0, 0.07, z], [0.5, 0.13, 0.15], undefined, f);
}

function refinery(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 29 + d * 13);
  const hw = w / 2, hd = d / 2;
  bx(k, GRAVEL, 0, 0, 0, w, 0.04, d);
  const gateX = 1.2;
  compound(k, w, d, '#cbd5e1', STEEL, 0.9, 0.22, low, gateX);
  fl(k, ASPHALT, gateX - 0.4, 1.35, gateX + 0.4, hd - 0.05, 0.045);
  fl(k, ASPHALT, -hw + 0.3, 1.35, hw - 0.3, 1.75, 0.045);

  // The tank farm: four big storage tanks inside a bund wall, white with NNPC green bands and a ladder up each.
  const seg = low ? 10 : 16, tr = 0.72, th = 0.9;
  const bx0 = -hw + 0.2, bx1 = -0.9, bz0 = -hd + 0.2, bz1 = 1.15;
  for (const [a, b, c, e] of [[bx0, bz0, bx1, bz0], [bx0, bz1, bx1, bz1], [bx0, bz0, bx0, bz1], [bx1, bz0, bx1, bz1]]) bx(k, CONCRETE, (a + c) / 2, 0, (b + e) / 2, Math.abs(c - a) + 0.06, 0.12, Math.abs(e - b) + 0.06);
  for (const x of [bx0 + 0.95, bx1 - 0.85]) for (const z of [bz0 + 0.85, bz1 - 0.85]) {
    k.post(TANK_WHITE, [x, 0, z], tr, th, seg);
    k.post(GREEN, [x, th - 0.22, z], tr + 0.006, 0.12, seg);
    k.post(TANK_ROOF, [x, th, z], tr - 0.03, 0.012, seg);
    if (!low) {
      k.post(STEEL, [x, th + 0.01, z], tr * 0.3, 0.04, 8);
      k.bar(AMBER, [x + Math.cos(0.4) * (tr + 0.04), 0.05, z + Math.sin(0.4) * (tr + 0.04)], [x + Math.cos(1.1) * (tr + 0.04), th, z + Math.sin(1.1) * (tr + 0.04)], 0.03);
    }
  }
  // Gas spheres by the road, a loading gantry with a tanker under it.
  for (const x of [-hw + 0.75, -hw + 1.6]) {
    for (const [dx, dz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) bx(k, STEEL, x + dx, 0, 1.95 + dz, 0.04, 0.42, 0.04);
    k.shape(TANK_WHITE, GLOBE(), [x, 0.68, 1.95], [0.36, 0.36, 0.36]);
    k.post(GREEN, [x, 0.66, 1.95], 0.365, 0.05, 12);
  }
  const lx = -0.15;
  for (const [dx, dz] of [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]]) bx(k, STEEL, lx + dx, 0, 1.95 + dz, 0.05, 0.8, 0.05);
  bx(k, NNPC_YELLOW, lx, 0.8, 1.95, 1.35, 0.05, 0.75);
  tanker(k, F(lx, 1.95, -Math.PI / 2));

  // The pipe racks: along the front of the process area and up the side of the tank farm.
  const rackY = [0.5, 0.6];
  const rack = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.6));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      bx(k, STEEL, x, 0, z, 0.04, 0.68, 0.04);
      k.box(STEEL, [x, 0.66, z], x0 === x1 ? [0.36, 0.03, 0.03] : [0.03, 0.03, 0.36]);
    }
    PIPES.forEach((c, i) => {
      const o = (i - 1) * 0.1, y = rackY[i % 2] + 0.07;
      k.bar(c, [x0 + (x0 === x1 ? o : 0), y, z0 + (x0 === x1 ? 0 : o)], [x1 + (x0 === x1 ? o : 0), y, z1 + (x0 === x1 ? 0 : o)], 0.06);
    });
  };
  rack(-0.6, 1.1, hw - 0.4, 1.1);
  rack(-0.6, -hd + 0.3, -0.6, 1.1);

  // The process area: distillation columns ringed with platforms, a steel structure, the heater and its stacks.
  const columns: [number, number, number, number][] = [[0.3, -1.6, 0.22, 3.0], [0.95, -1.75, 0.16, 2.4], [1.6, -1.55, 0.25, 2.7]];
  for (const [x, z, r, h] of columns) {
    bx(k, CONCRETE, x, 0, z, r * 2.6, 0.1, r * 2.6);
    k.post(COLUMN, [x, 0.1, z], r, h, low ? 8 : 10);
    k.shape(COLUMN, HEMI(true), [x, h + 0.1, z], [r, r * 0.6, r]);
    // Platforms ringed with lamps: a refinery at night is all little lights.
    for (let y = 0.8; y < h; y += 0.75) {
      if (!low) k.post(AMBER, [x, y, z], r + 0.07, 0.03, 8);
      bx(k, 'lamp', x + r + 0.04, y + 0.03, z, 0.04, 0.04, 0.04);
      spark(g, x + r + 0.06, y + 0.05, z, 0.12, [0.7, 0.6, 0.35]);
      spark(g, x - r - 0.06, y + 0.05, z, 0.1, [0.6, 0.5, 0.3]);
    }
    if (!low) k.bar(STEEL, [x + r + 0.04, 0.1, z + 0.05], [x + r + 0.04, h, z + 0.05], 0.025);
  }
  const sx = 1.0, sz = -0.35;
  for (const [dx, dz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) bx(k, STEEL, sx + dx, 0, sz + dz, 0.05, 1.5, 0.05);
  for (const y of [0.5, 1.0, 1.5]) bx(k, '#52525b', sx, y, sz, 1.25, 0.04, 0.85);
  if (!low) {
    for (const [i, x] of [-0.3, 0, 0.3].entries()) k.post(PIPES[i], [sx + x, 0.04, sz], 0.05, 1.5, 6);
    k.post('#e5e7eb', [sx + 0.3, 1.54, sz + 0.15], 0.2, 0.4, 8);
  }
  const hx = 2.75, hz = -0.3;
  bx(k, '#78716c', hx, 0, hz, 1.0, 0.85, 0.8);
  bx(k, DARK, hx, 0.85, hz, 1.04, 0.05, 0.84);
  for (const x of [hx - 0.25, hx + 0.25]) {
    k.post(STEEL, [x, 0.9, hz], 0.09, 1.7, 8);
    k.post(RED, [x, 2.4, hz], 0.095, 0.1, 8);
    k.post(LINE, [x, 2.5, hz], 0.095, 0.1, 8);
  }
  // A bank of air coolers with their fans, between the heater and the flare.
  bx(k, '#9ca3af', 2.6, 0.4, -1.75, 1.2, 0.18, 0.6);
  for (const [dx, dz] of [[-0.4, -0.15], [0.4, -0.15]]) {
    bx(k, STEEL, 2.6 + dx, 0, -1.75 + dz, 0.05, 0.4, 0.05);
    bx(k, STEEL, 2.6 + dx, 0, -1.75 - dz, 0.05, 0.4, 0.05);
  }
  for (const x of [2.2, 2.6, 3.0]) k.post(DARK, [x, 0.58, -1.75], 0.16, 0.02, 8);

  // The flare stack: red and white bands up to the flame (drawn separately so it can flicker), guy wires.
  const fl0 = flareOf(w, d);
  bx(k, CONCRETE, fl0.x, 0, fl0.z, 0.4, 0.12, 0.4);
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const r0 = 0.11 - (i / bands) * 0.04;
    k.post(i % 2 ? LINE : RED, [fl0.x, 0.12 + (i * (fl0.h - 0.12)) / bands, fl0.z], r0, (fl0.h - 0.12) / bands, 6, (r0 - 0.005) / r0);
  }
  k.post(DARK, [fl0.x, fl0.h - 0.02, fl0.z], 0.13, 0.06, 6);
  if (!low) for (const a of [0.8, 2.9, 4.9]) k.bar('#6b7280', [fl0.x, fl0.h * 0.7, fl0.z], [fl0.x + Math.cos(a) * 1.0, 0.05, fl0.z + Math.sin(a) * 0.9], 0.012);
  // Its glow at night: a halo round the flame and an orange wash on the ground under it.
  const fy = fl0.h + 0.35;
  pool(g, fl0.x, fl0.z, 0.9, [0.7, 0.34, 0.06], fy, 12);
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const cx = Math.cos(a) * 0.55, cz = Math.sin(a) * 0.55;
    g.tri([fl0.x - cx, fy - 0.55, fl0.z - cz], [fl0.x + cx, fy - 0.55, fl0.z + cz], [fl0.x, fy, fl0.z], [0, 0, 0], [0, 0, 0], [0.6, 0.28, 0.05]);
    g.tri([fl0.x + cx, fy + 0.6, fl0.z + cz], [fl0.x - cx, fy + 0.6, fl0.z - cz], [fl0.x, fy, fl0.z], [0, 0, 0], [0, 0, 0], [0.6, 0.28, 0.05]);
    g.tri([fl0.x - cx, fy - 0.55, fl0.z - cz], [fl0.x, fy, fl0.z], [fl0.x - cx, fy + 0.6, fl0.z - cz], [0, 0, 0], [0.6, 0.28, 0.05], [0, 0, 0]);
    g.tri([fl0.x + cx, fy + 0.6, fl0.z + cz], [fl0.x, fy, fl0.z], [fl0.x + cx, fy - 0.55, fl0.z + cz], [0, 0, 0], [0.6, 0.28, 0.05], [0, 0, 0]);
  }
  pool(g, fl0.x, fl0.z + 0.3, 2.6, [0.45, 0.2, 0.04], 0.06, 14);
  for (const [x, z] of [[0.9, -1.0], [2.6, -1.0], [1.5, 0.6], [-2.6, -0.6]]) pool(g, x, z, 1.1, scale(WARM, 0.2));

  // The control building by the gate, NNPC's green and yellow on its board.
  const cx = 3.05, cz = 1.95;
  bx(k, '#f5f0e1', cx, 0, cz, 1.6, 0.72, 0.68);
  bx(k, GREEN, cx, 0.56, cz, 1.62, 0.12, 0.7);
  fl(k, '#d6d3d1', cx - 0.76, cz - 0.3, cx + 0.76, cz + 0.3, 0.722);
  winZ(k, 4, cx - 0.72, cx + 0.72, 0.2, 0.46, cz + 0.34, 1, LINE, low);
  bx(k, GREEN, cx, 0.72, cz + 0.3, 1.0, 0.24, 0.04);
  letters(k, NNPC_YELLOW, cx - 0.42, cx + 0.42, 0.84, 0.12, cz + 0.322);
  glowZ(g, cx - 0.5, 0.72, cx + 0.5, 0.96, cz + 0.33, [0.3, 0.32, 0.08]);
  bx(k, '#f5f0e1', gateX + 0.65, 0, hd - 0.35, 0.36, 0.38, 0.32);
  bx(k, GREEN, gateX + 0.65, 0.38, hd - 0.35, 0.42, 0.04, 0.38);
  for (let i = 0; i < 4; i++) bx(k, i % 2 ? LINE : RED, gateX - 0.25 + i * 0.12, 0.28, hd - 0.2, 0.12, 0.035, 0.035);
  if (!low) {
    tanker(k, F(gateX, hd - 0.9, Math.PI));
    crowd(k, rand, 5, 0.2, 1.4, 2.0, 1.7, ['#f97316', '#f97316', '#2563eb']);
  }
  return { parts: k.build(), glow: g.build() };
}

/** The flare's flame: always burning, flickering, brighter than anything else on the map at night. */
function FlareFlame({ w, d }: { w: number; d: number }) {
  const ref = useRef<Group>(null!);
  const f = flareOf(w, d);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current.scale.set(1 + Math.sin(t * 13) * 0.15, 1 + Math.sin(t * 9) * 0.25, 1 + Math.cos(t * 11) * 0.15);
  });
  return (
    <group position={[f.x, f.h + 0.04, f.z]} userData={{ dynamic: true }}>
      <group ref={ref}>
        <mesh position={[0, 0.36, 0]}>
          <coneGeometry args={[0.2, 0.72, 6]} />
          <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <coneGeometry args={[0.1, 0.42, 6]} />
          <meshStandardMaterial color="#fde68a" emissive="#facc15" emissiveIntensity={2.5} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Textile mill: a saw-tooth weaving shed, the chimney, silos, cotton bales ---------- */

const MILL_WALL = '#e8dcc3';
const BRICK = '#a0482e';
const MILL_ROOF = '#8b929e';
const MILL_RIB = '#7a818c';
const CHIMNEY = '#9a3412';
const BALE = '#f5f5f4';
const SILO = '#d4d4d8';

function mill(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 61 + d * 17);
  const hw = w / 2, hd = d / 2;
  bx(k, '#b5b0a5', 0, 0, 0, w, 0.04, d);
  const gateX = hw - 1.0;
  compound(k, w, d, MILL_WALL, BRICK, 1.0, 0.3, low, gateX);

  // The weaving shed: cream walls on a brick plinth, a band of windows, the saw-tooth roof with its glazing to the
  // south (to the camera), so it shines at night like the looms are still running.
  const x0 = -hw + 0.35, x1 = hw - 1.75, z0 = -hd + 0.3, z1 = hd - 1.15, h = 0.95;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  bx(k, MILL_WALL, cx, 0, cz, x1 - x0, h, z1 - z0);
  bx(k, BRICK, cx, 0, cz, x1 - x0 + 0.02, 0.3, z1 - z0 + 0.02);
  bandZ(k, x0 + 0.15, x1 - 0.15, 0.42, 0.72, z1, 1, MILL_WALL, 0.3, low);
  winX(k, Math.max(2, Math.round((z1 - z0) / 0.6)), z0 + 0.1, z1 - 0.1, 0.42, 0.72, x0, -1, LINE);
  const teeth = Math.max(3, Math.round((z1 - z0) / 0.6)), td = (z1 - z0) / teeth, rise = 0.36;
  for (let i = 0; i < teeth; i++) {
    const za = z0 + i * td, zb = za + td;
    quad(k, MILL_ROOF, [x0 - 0.04, h, za], [x1 + 0.04, h, za], [x1 + 0.04, h + rise, zb], [x0 - 0.04, h + rise, zb], [0, td, -rise]);
    for (const [a, b] of bays(x0, x1, 0.6).map((v, j, all) => [v, all[j + 1]]).slice(0, -1)) rz(k, 'glass', a, h, b, h + rise - 0.02, zb, 1);
    for (const x of [x0, x1]) tri(k, MILL_WALL, [x, h, za], [x, h, zb], [x, h + rise, zb], [x === x0 ? -1 : 1, 0, 0]);
    if (!low) for (let x = x0 + 0.1; x < x1; x += 0.2) quad(k, MILL_RIB, [x - 0.008, h + 0.005, za], [x + 0.008, h + 0.005, za], [x + 0.008, h + rise + 0.005, zb], [x - 0.008, h + rise + 0.005, zb], [0, td, -rise]);
  }
  bx(k, MILL_ROOF, cx, h + rise - 0.02, z1, x1 - x0 + 0.08, 0.04, 0.04);
  // The name across the front, the loading door, the yard lamps.
  bx(k, '#1d4ed8', cx, h + 0.04, z1 + 0.04, Math.min(2.6, x1 - x0 - 0.4), 0.3, 0.04);
  letters(k, LINE, cx - Math.min(2.6, x1 - x0 - 0.4) / 2 + 0.1, cx + Math.min(2.6, x1 - x0 - 0.4) / 2 - 0.1, h + 0.19, 0.15, z1 + 0.062);
  glowZ(g, cx - Math.min(2.6, x1 - x0 - 0.4) / 2, h + 0.04, cx + Math.min(2.6, x1 - x0 - 0.4) / 2, h + 0.34, z1 + 0.07, [0.18, 0.24, 0.45]);
  const dx = x1 - 0.7;
  rz(k, '#6b7280', dx - 0.35, 0.04, dx + 0.35, 0.62, z1 + 0.005);
  if (!low) for (let y = 0.1; y < 0.6; y += 0.08) rz(k, '#4b5563', dx - 0.35, y, dx + 0.35, y + 0.012, z1 + 0.008);
  bx(k, SLAB, dx, 0, z1 + 0.25, 0.9, 0.08, 0.5);

  // The old brick chimney behind the shed.
  const chx = x1 - 0.35, chz = z0 - 0.02;
  bx(k, BRICK, chx, 0, chz, 0.5, 0.3, 0.5);
  k.post(CHIMNEY, [chx, 0.3, chz], 0.19, 3.3, 8, 0.65);
  k.post(DARK, [chx, 3.45, chz], 0.13, 0.15, 8);
  k.post(LINE, [chx, 2.6, chz], 0.15, 0.08, 8);

  // Silos down the right-hand side with a catwalk along their tops and an elevator tower.
  const sx = hw - 0.85, sr = 0.36, sh = 2.0;
  const silos: number[] = [];
  for (let z = -hd + 0.65; z <= hd - 1.55; z += 0.8) silos.push(z);
  for (const z of silos) {
    k.post(SILO, [sx, 0, z], sr, sh, low ? 10 : 12);
    k.post(SILO, [sx, sh, z], sr, 0.28, low ? 10 : 12, 0.15);
    if (!low) for (const y of [0.6, 1.3]) k.post('#a1a1aa', [sx, y, z], sr + 0.006, 0.03, 12);
  }
  if (silos.length > 1) {
    bx(k, STEEL, sx, sh + 0.3, (silos[0] + silos[silos.length - 1]) / 2, 0.12, 0.04, silos[silos.length - 1] - silos[0]);
    const ez = silos[0] - 0.05;
    bx(k, '#d6d3d1', sx - 0.5, 0, ez, 0.3, sh + 0.55, 0.3);
    pyramid(k, MILL_ROOF, sx - 0.5, sh + 0.55, ez, 0.17, 0.15);
    k.bar(STEEL, [sx - 0.5, sh + 0.35, ez], [x1, h + 0.2, ez + 0.4], 0.05);
  }

  // The yard out front: a lorry loading cotton bales, more bales stacked by the door, the water tower.
  lorry(k, F(dx + 0.2, hd - 0.55, -Math.PI / 2), '#1d4ed8', BALE, 0.3);
  for (let i = 0; i < (low ? 2 : 6); i++) bx(k, BALE, dx - 0.9 + (i % 3) * 0.24, Math.floor(i / 3) * 0.16, z1 + 0.32, 0.22, 0.15, 0.18);
  const wx = -hw + 0.55, wz = hd - 0.55;
  for (const [a, b] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) bx(k, STEEL, wx + a, 0, wz + b, 0.04, 1.1, 0.04);
  k.post('#64748b', [wx, 1.1, wz], 0.28, 0.4, 10);
  k.post('#64748b', [wx, 1.5, wz], 0.28, 0.12, 10, 0.2);
  if (!low) {
    crowd(k, rand, 6, dx - 1.0, z1 + 0.5, dx + 0.6, hd - 0.2, ['#1d4ed8', '#f97316', '#f8fafc']);
    tree(k, -hw + 1.3, hd - 0.45, 0.8, low, 2);
  }
  lampPost(k, g, -0.2, hd - 0.3, 0.7, low);
  lampPost(k, g, gateX - 0.6, z1 + 0.3, 0.7, low, -0.12);
  return { parts: k.build(), glow: g.build() };
}

/* ---------- Computer Village: phone plazas, signboards everywhere, umbrellas down the lane ---------- */

const PLAZA = '#ece3cf';
const PLAZA_B = '#e2d3b8';
const LANE = '#7c776f';
const SIGNS = ['#facc15', '#dc2626', '#16a34a', '#2563eb', '#f97316', '#7c3aed', '#0ea5e9', '#f8fafc', '#db2777'];

/** A hex colour as glow (its brightness scaled by `k`). */
function rgbOf(hex: string, k: number): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k];
}

/**
 * A plaza of phone shops facing +z in `f`, `len` long, `floors` high: shutters and a painted board on every shop
 * below, windows and hanging banners above, tanks and a dish on the roof. Every board glows in its colour at night.
 */
function plaza(k: Kit, g: Glow, f: Matrix4, len: number, dep: number, floors: number, wall: string, low: boolean, rand: () => number) {
  const fh = 0.6, H = floors * fh, fz = dep / 2;
  k.box(wall, [0, H / 2, 0], [len, H, dep], undefined, f);
  k.box('#a8a29e', [0, H + 0.03, 0], [len + 0.04, 0.06, dep + 0.04], undefined, f);
  const shops = Math.max(2, Math.floor(len / 0.55)), sw = len / shops;
  for (let i = 0; i < shops; i++) {
    const x = -len / 2 + sw * (i + 0.5), c = SIGNS[Math.floor(rand() * SIGNS.length)];
    rz(k, SHADOW, x - sw / 2 + 0.04, 0.02, x + sw / 2 - 0.04, 0.4, fz + 0.004, 1, f);
    if (!low) rz(k, '#9ca3af', x - sw / 2 + 0.04, 0.3, x + sw / 2 - 0.04, 0.4, fz + 0.007, 1, f);
    k.box(c, [x, 0.5, fz + 0.03], [sw - 0.05, 0.14, 0.04], undefined, f);
    if (!low) letters(k, c === '#f8fafc' || c === '#facc15' ? DARK : LINE, x - sw / 2 + 0.06, x + sw / 2 - 0.06, 0.5, 0.06, fz + 0.052, f, i);
    glowZ(g, x - sw / 2 + 0.03, 0.43, x + sw / 2 - 0.03, 0.57, fz + 0.056, rgbOf(c, 0.32), f);
    for (let fl = 1; fl < floors; fl++) {
      winZ(k, 1, x - sw / 2 + 0.06, x + sw / 2 - 0.06, fl * fh + 0.18, fl * fh + 0.46, fz, 1, '#d6d3d1', true, f);
      if (!low && rand() < 0.45) {
        const b = SIGNS[Math.floor(rand() * SIGNS.length)];
        k.box(b, [x + sw / 2 - 0.02, fl * fh + 0.3, fz + 0.05], [0.04, 0.4, 0.08], undefined, f);
      }
    }
  }
  // The roof: water tanks, a satellite dish, a board on legs for whoever paid most this month.
  const tf = (x: number, z: number) => pt(f, [x, H + 0.06, z]);
  for (const x of [-len / 2 + 0.3, len / 2 - 0.35]) {
    const p = tf(x, -dep / 4);
    k.post(WATER_TANK, [p[0], p[1], p[2]], 0.13, 0.24, 8);
  }
  if (!low) {
    const p = tf(-len / 6, -dep / 4);
    k.shape('#e5e7eb', HEMI(true), [p[0], p[1] + 0.12, p[2]], [0.12, 0.05, 0.12], [-1.0, 0, 0]);
  }
  if (len > 2) {
    const c = SIGNS[Math.floor(rand() * 4)];
    for (const s of [-1, 1]) k.box(STEEL, [s * 0.45, H + 0.3, 0], [0.04, 0.5, 0.04], undefined, f);
    k.box(c, [0, H + 0.62, 0], [1.2, 0.42, 0.05], undefined, f);
    letters(k, c === '#facc15' ? DARK : LINE, -0.5, 0.5, H + 0.62, 0.16, 0.027, f, 5);
    glowZ(g, -0.6, H + 0.41, 0.6, H + 0.83, 0.04, rgbOf(c, 0.45), f);
  }
}

function compvillage(w: number, d: number, low: boolean): Built {
  const k = new Kit(), g = new Glow(), rand = rng(w * 83 + d * 37);
  const hw = w / 2, hd = d / 2;
  bx(k, '#9c968c', 0, 0, 0, w, 0.04, d);

  // Plazas round three sides: three floors across the back, two down each side, all facing the lane.
  const bd = 0.9, sd = 0.8;
  plaza(k, g, F(0, -hd + 0.15 + bd / 2), w - 0.3, bd, 3, PLAZA, low, rand);
  const sz0 = -hd + 0.15 + bd + 0.08, sz1 = hd - 0.7, sl = sz1 - sz0;
  plaza(k, g, F(-hw + 0.15 + sd / 2, (sz0 + sz1) / 2, Math.PI / 2), sl, sd, 2, PLAZA_B, low, rand);
  plaza(k, g, F(hw - 0.15 - sd / 2, (sz0 + sz1) / 2, -Math.PI / 2), sl, sd, 2, PLAZA_B, low, rand);
  // The front ends of the side blocks get boards too, the first thing you see from the road.
  for (const s of [-1, 1]) {
    const x = s * (hw - 0.15 - sd / 2), c = SIGNS[(s + 3) % SIGNS.length];
    bx(k, c, x, 0.75, sz1 + 0.03, sd - 0.06, 0.3, 0.04);
    letters(k, c === '#facc15' ? DARK : LINE, x - sd / 2 + 0.08, x + sd / 2 - 0.08, 0.9, 0.12, sz1 + 0.052);
    glowZ(g, x - sd / 2 + 0.03, 0.75, x + sd / 2 - 0.03, 1.05, sz1 + 0.058, rgbOf(c, 0.38));
  }

  // The lane: stalls under umbrellas down both sides, generators humming, the crowd, wires overhead.
  const lx = hw - 0.15 - sd, lz0 = sz0, lz1 = hd;
  fl(k, LANE, -lx, lz0 - 0.05, lx, lz1, 0.045);
  for (const s of [-1, 1]) {
    for (let z = lz0 + 0.3, i = 0; z < lz1 - 0.25; z += 0.5, i++) {
      const x = s * (lx - 0.3);
      bx(k, '#d6d3d1', x, 0, z, 0.3, 0.2, 0.22);
      if (!low) for (let j = 0; j < 3; j++) bx(k, SIGNS[(i + j) % SIGNS.length], x - 0.08 + j * 0.08, 0.2, z, 0.05, 0.02, 0.08);
      if (!low || i % 2 === 0) umbrella(k, x, z, 0.62, 0.26, SIGNS[(i * 2 + (s > 0 ? 1 : 0)) % 6], low);
      if (!low) person(k, x - s * 0.22, z + 0.08, CLOTHES[(i + 3) % CLOTHES.length], DARK, SKIN[i % 3]);
    }
    if (!low) {
      bx(k, '#ca8a04', s * (lx - 0.12), 0, lz0 + 0.05, 0.2, 0.16, 0.14);
      bx(k, DARK, s * (lx - 0.12), 0.16, lz0 + 0.05, 0.21, 0.02, 0.15);
    }
  }
  if (!low) {
    crowd(k, rand, 24, -lx + 0.5, lz0 + 0.1, lx - 0.5, lz1 - 0.1);
    for (const z of [lz0 + 0.5, (lz0 + lz1) / 2, lz1 - 0.6]) k.bar('#111827', [-lx, 1.05, z], [lx, 0.95, z + 0.2], 0.012);
    keke(k, F(lx - 0.75, hd - 0.35, 0.2));
  }
  // Shipping containers turned into shops in front of the side blocks.
  if (!low) for (const s of [-1, 1]) {
    const x = s * (hw - 0.15 - sd / 2), z = (sz1 + hd) / 2 - 0.02, c = SIGNS[(s + 5) % SIGNS.length];
    bx(k, c, x, 0, z, sd - 0.1, 0.34, 0.32);
    rz(k, SHADOW, x - sd / 2 + 0.12, 0.03, x + sd / 2 - 0.12, 0.28, z + 0.162);
    bx(k, '#9ca3af', x, 0.34, z, sd - 0.06, 0.02, 0.4);
    umbrella(k, x - s * (sd / 2 - 0.05), z + 0.25, 0.55, 0.2, SIGNS[(s + 7) % SIGNS.length], low);
  }

  // The arch over the way in, its name lit at night.
  for (const s of [-1, 1]) bx(k, STEEL, s * (lx - 0.05), 0, hd - 0.12, 0.06, 1.15, 0.06);
  bx(k, '#0f172a', 0, 0.95, hd - 0.12, lx * 2 + 0.1, 0.26, 0.05);
  letters(k, AMBER, -lx + 0.1, lx - 0.1, 1.08, 0.13, hd - 0.093);
  glowZ(g, -lx, 0.95, lx, 1.21, hd - 0.088, [0.4, 0.32, 0.08]);
  for (let i = 0; i < 6; i++) {
    const x = -lx + 0.2 + (i * (lx * 2 - 0.4)) / 5;
    bx(k, 'lamp', x, 1.215, hd - 0.12, 0.05, 0.04, 0.05);
  }
  pool(g, 0, (lz0 + lz1) / 2, Math.max(lx, (lz1 - lz0) / 2) * 1.1, scale(WARM, 0.1), 0.06, 12);
  return { parts: k.build(), glow: g.build() };
}


/* ---------- The models ---------- */

export function School({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => school(w, d, low)} deps={[w, d]} />;
}
export function Campus({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => campus(w, d, low)} deps={[w, d]} />;
}
export function Poly({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => poly(w, d, low)} deps={[w, d]} />;
}
export function Nda({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => nda(w, d, low)} deps={[w, d]} />;
}
export function Hospital({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => hospital(w, d, low)} deps={[w, d]} />;
}
export function Church({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => church(w, d, low)} deps={[w, d]} />;
}
export function Mosque({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => mosque(w, d, low)} deps={[w, d]} />;
}
export function TechHub({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => techhub(w, d, low)} deps={[w, d]} />;
}
export function MotorPark({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => motorpark(w, d, low)} deps={[w, d]} />;
}
export function Airport({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <KitModel build={(low) => airport(w, d, low)} deps={[w, d]} />
      <Departure w={w} d={d} />
    </group>
  );
}
export function Jetty({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => jetty(w, d, low)} deps={[w, d]} />;
}
export function Port({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => port(w, d, low)} deps={[w, d]} />;
}
export function Flyover({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => flyover(w, d, low)} deps={[w, d]} />;
}
export function Refinery({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <KitModel build={(low) => refinery(w, d, low)} deps={[w, d]} />
      <FlareFlame w={w} d={d} />
    </group>
  );
}
export function Mill({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => mill(w, d, low)} deps={[w, d]} />;
}
export function CompVillage({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => compvillage(w, d, low)} deps={[w, d]} />;
}
