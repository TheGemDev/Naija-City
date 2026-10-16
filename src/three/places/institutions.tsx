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
import { IcosahedronGeometry, Matrix4, SphereGeometry, Vector3, type BufferGeometry, type Group, type Mesh } from 'three';
import { clamp, frame, Glow, Kit, KitModel, prep, rng, scale, unitCyl, type Built, type RGB, type V3 } from '../placeKit';

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
const TRUNK = '#6b4a2b';
const LEAF = ['#3f7d2a', '#4d8a32', '#356b24'];
const FROND = '#4f8a2b';
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
/** A rough ball of radius 1 (20 faces): tree crowns, bundles. */
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
function tri(k: Kit, key: string, a: V3, b: V3, c: V3, out: V3, f?: Matrix4) {
  k.tri(key, pt(f, a), pt(f, b), pt(f, c), nd(f, out));
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
function glowX(g: Glow, z0: number, y0: number, z1: number, y1: number, x: number, c: RGB, f?: Matrix4) {
  g.quad(pt(f, [x, y0, z0]), pt(f, [x, y0, z1]), pt(f, [x, y1, z1]), pt(f, [x, y1, z0]), c);
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
/** A run of glass (a ribbon window or a curtain wall) on a ±z face, mullions every `every` in full detail. */
function bandZ(k: Kit, a0: number, a1: number, y0: number, y1: number, z: number, s: number, mull: string, every: number, low: boolean, f?: Matrix4) {
  rz(k, 'glass', a0, y0, a1, y1, z + 0.005 * s, s, f);
  if (!low) for (let x = a0 + every; x < a1 - every / 2; x += every) rz(k, mull, x - 0.012, y0, x + 0.012, y1, z + 0.009 * s, s, f);
}
function bandX(k: Kit, a0: number, a1: number, y0: number, y1: number, x: number, s: number, mull: string, every: number, low: boolean, f?: Matrix4) {
  rx(k, 'glass', a0, y0, a1, y1, x + 0.005 * s, s, f);
  if (!low) for (let z = a0 + every; z < a1 - every / 2; z += every) rx(k, mull, z - 0.012, y0, z + 0.012, y1, x + 0.009 * s, s, f);
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
/** A shade tree (mango, neem): a short trunk and a lumpy crown. */
function tree(k: Kit, x: number, z: number, s: number, low: boolean, i = 0) {
  k.post(TRUNK, [x, 0, z], 0.045 * s, 0.42 * s, 4);
  k.shape(LEAF[i % 3], BALL(), [x, 0.62 * s, z], [0.42 * s, 0.3 * s, 0.42 * s], [0, i, 0]);
  if (!low) k.shape(LEAF[(i + 1) % 3], BALL(), [x + 0.13 * s, 0.76 * s, z - 0.06 * s], [0.26 * s, 0.2 * s, 0.26 * s], [0, i * 2, 0]);
}
/** A palm: a slim trunk and a ring of drooping fronds. */
function palm(k: Kit, x: number, z: number, h: number, low: boolean, i = 0) {
  k.post('#8a6a45', [x, 0, z], 0.035, h, 5, 0.7);
  const n = low ? 4 : 6;
  for (let j = 0; j < n; j++) {
    const f = frame([x, h, z], [0, (j / n) * Math.PI * 2 + i, 0]);
    k.box(FROND, [0.19, -0.05, 0], [0.4, 0.02, 0.1], [0, 0, -0.42], f);
  }
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
  k.box(DARK, [0, 0.625, -0.05], [W - 0.08, 0.015, L - 0.35], undefined, f);
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
function rowBlock(k: Kit, b: Row, f: Matrix4, low: boolean) {
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
  rowBlock(k, { ...blk, len: w - 0.5 }, F(0, backZ), low);
  const wz0 = backZ + dep / 2 + ver + 0.04, wz1 = hd - 0.85;
  for (const s of [-1, 1]) rowBlock(k, { ...blk, len: wz1 - wz0 }, F(s * (hw - 0.25 - dep / 2), (wz0 + wz1) / 2, (-s * Math.PI) / 2), low);

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
  rowBlock(k, { ...blk, len: w - 0.5 }, F(0, backZ), low);
  const pz0 = backZ + dep / 2 + ver + 0.2;
  let px0 = -hw + 0.4;
  if (d >= 5) {
    const z0 = pz0 - 0.16, z1 = hd - 1.0;
    rowBlock(k, { ...blk, len: z1 - z0 }, F(-hw + 0.25 + dep / 2, (z0 + z1) / 2, Math.PI / 2), low);
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
      rx(k, 'glass', z0, 0.25, z0 + 0.18, 0.66, x + s * 0.005, s);
      tri(k, 'glass', [x + s * 0.005, 0.66, z0], [x + s * 0.005, 0.66, z0 + 0.18], [x + s * 0.005, 0.78, z0 + 0.09], [s, 0, 0]);
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
      tri(k, 'glass', [x, 0.68, z0], [x, 0.68, z1], [x, 0.8, (z0 + z1) / 2], [s, 0, 0]);
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

/* PLACEHOLDER_REST */

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
