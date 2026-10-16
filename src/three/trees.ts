// Every tree in the game, from one kit: the trees scattered over the city map (cityModels.tsx CityTree), the trees
// round the place models (places/*.tsx), compounds and the odd prop. Nigerian species, low-poly and stylised but
// built the way the real ones grow, so they read from the map camera looking steeply down from the south:
//
//   neem      a straight trunk forking into a dense, rounded dark-green crown: the street tree of the north
//   mango     a short thick trunk under a big broad dome of dark glossy green that hangs low
//   coconut   a slim ringed trunk curving up to a star of long arching fronds, nuts and a dead frond under them
//   oilpalm   a shorter, rough trunk (old frond bases) and a fuller, more upright crown of darker fronds
//   baobab    a fat grey bottle of a trunk, stubby branches and only a few leaves: bare in the dry season
//   flame     the flamboyant: a wide umbrella of branches under a flat crown blazing red-orange on top
//   acacia    the savanna thorn tree: a thin forked trunk and a flat-topped olive crown
//   shrub     a dwarf ornamental: hedge green, scrub olive, bougainvillea, ixora or croton
//
// A crown is a cluster of jittered lumps, never one ball. Every face is coloured on its own: darker underneath and
// lighter on top where the sun hits, with a little jitter so the leaves look dappled, and dusty in the harmattan.
// Each tree is a single vertex-coloured geometry, built once per species, variant, palette and season and shared. It
// goes into a place model through the kit (`plantTree`, under the 'vc' key placeKit draws with vertex colours) and
// onto the map as one mesh per tree that StaticBatch folds into the houses' buckets: no new draw calls.

import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from 'three';
import type { CityMap } from '../game/city';

export type TreeKind = 'neem' | 'mango' | 'coconut' | 'oilpalm' | 'baobab' | 'flame' | 'acacia' | 'shrub';
type V3 = [number, number, number];

/** The kit key every tree part goes under: placeKit draws 'vc' keys with their own vertex colours. */
export const TREE_KEY = 'vc|tree';

/** Anything trees can be planted into: placeKit's Kit, or a place's own pen that wraps one. */
export interface TreeSink {
  shape(key: string, g: BufferGeometry, p: V3, s: V3, r?: V3): void;
}

/* ---------- Small helpers ---------- */

/** The same random numbers for the same seed every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A steady number from 0 to 1 for a spot. */
const hash = (x: number, z: number, k = 0) => {
  const h = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const C = (hex: string) => new Color(hex);
/** Dark underside, mid, sunlit top. */
interface Leaf { dark: Color; mid: Color; light: Color }
const leaf = (dark: string, mid: string, light: string): Leaf => ({ dark: C(dark), mid: C(mid), light: C(light) });

/** Harmattan dust: a pale khaki that settles on the tops of the leaves. */
const DUST = C('#a89d74');

/* ---------- Palettes ---------- */

const NEEM = [leaf('#1d461b', '#2d6626', '#4c8c34'), leaf('#214d1d', '#356e2a', '#5a983a'), leaf('#294d1c', '#426e29', '#6b973b')];
const MANGO = [leaf('#143a19', '#1f5427', '#3a7a33'), leaf('#17401c', '#265d2b', '#468839')];
const COCO = [leaf('#2c6423', '#47862d', '#7aab43'), leaf('#376a25', '#57902e', '#8db449')];
const OILPALM = [leaf('#1b4619', '#2b6524', '#4c8a32'), leaf('#20491b', '#336c27', '#558f35')];
const BAOBAB = [leaf('#47722b', '#5b8634', '#7aa044')];
const FLAME_LEAF = [leaf('#2b6224', '#3f7b2c', '#5f9c3a')];
const ACACIA = [leaf('#465f24', '#5d792f', '#7d963d'), leaf('#536828', '#6d8234', '#8e9f4c')];
const SHRUB = [leaf('#21501d', '#316c29', '#4e8b37'), leaf('#475a29', '#5b6d32', '#788a43')];

const FLAME = ['#d4321a', '#ea501c', '#f47320', '#c42819'].map(C);
const BLOOMS = [['#b8175a', '#d23382', '#e25aa2'], ['#cf2b25', '#e44a35', '#f0703e'], ['#d9a21b', '#c9561b', '#93a02c']].map((l) => l.map(C));

const BARK = { trunk: C('#5a4230'), dark: C('#45321f'), light: C('#6e5440') };
const PALM_BARK = [C('#8c7659'), C('#76624a')];
const OIL_BARK = [C('#5f4c39'), C('#47392b')];
const BAOBAB_BARK = [C('#9a8b79'), C('#92826f'), C('#a19280')];
const NUTS = [C('#5f7a29'), C('#7d5b2b')];
const DEAD = C('#8a6c3c');

/* ---------- Building a tree: triangles with a colour each ---------- */

const _ab = new Vector3();
const _ac = new Vector3();
const _n = new Vector3();
const _col = new Color();

class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  tri(a: Vector3, b: Vector3, c: Vector3, ca: Color, cb: Color = ca, cc: Color = cb) {
    _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(c, a)).normalize();
    for (const [p, k] of [[a, ca], [b, cb], [c, cc]] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(k.r, k.g, k.b);
    }
  }
  /** Both faces: the front in `c`, the back a shade darker (fronds, seen from above and below). */
  tri2(a: Vector3, b: Vector3, c: Vector3, col: Color) {
    this.tri(a, b, c, col);
    this.tri(a, c, b, _col.copy(col).multiplyScalar(0.72).clone());
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** A unit icosahedron's corners, three to a face. */
const ICO_CACHE: Vector3[][] = [];
function icoFaces(detail: number) {
  if (!ICO_CACHE[detail]) {
    const p = new IcosahedronGeometry(1, detail).getAttribute('position');
    const out: Vector3[] = [];
    for (let i = 0; i < p.count; i++) out.push(new Vector3(p.getX(i), p.getY(i), p.getZ(i)));
    ICO_CACHE[detail] = out;
  }
  return ICO_CACHE[detail];
}

interface Look {
  rand: () => number;
  low: boolean;
  /** Harmattan dust on the leaves, 0 to 1. */
  dust: number;
}

/** How a leaf face is coloured: dark below, light on top and towards the crown's top, jittered, dusted. */
function leafTone(l: Look, pal: Leaf, ny: number, h: number, out: Color) {
  const t = clamp01(0.38 + 0.42 * ny + 0.32 * (h - 0.5) + (l.rand() - 0.5) * 0.16);
  if (t < 0.5) out.copy(pal.dark).lerp(pal.mid, t * 2);
  else out.copy(pal.mid).lerp(pal.light, (t - 0.5) * 2);
  out.multiplyScalar(0.93 + l.rand() * 0.14);
  if (l.dust > 0) out.lerp(DUST, l.dust * 0.42 * (0.35 + 0.65 * Math.max(0, ny)));
  return out;
}

/**
 * A lump of leaves: a jittered icosahedron squashed to `r`, turned `yaw`. Each face is coloured by `tone` from which
 * way it faces and how high it sits between `y0` and `y1` (the crown's foot and top).
 */
function lump(m: Mesher, l: Look, c: V3, r: V3, tone: (ny: number, h: number, out: Color) => Color, y0: number, y1: number, detail = 0, wob = 0.22) {
  const faces = icoFaces(detail);
  const seed = l.rand() * 100;
  const yaw = l.rand() * Math.PI * 2;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const place = (v: Vector3) => {
    // The same corner gets the same push on every face it touches, so the lump stays closed.
    const j = 1 + wob * (hash(v.x * 3.1 + seed, v.y * 5.3 + v.z * 2.7, seed) - 0.5) * 2;
    const x = v.x * j * r[0], y = v.y * j * r[1], z = v.z * j * r[2];
    return new Vector3(c[0] + x * cs - z * sn, c[1] + y, c[2] + x * sn + z * cs);
  };
  const col = new Color();
  for (let i = 0; i < faces.length; i += 3) {
    const a = place(faces[i]), b = place(faces[i + 1]), d = place(faces[i + 2]);
    _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(d, a)).normalize();
    const h = clamp01(((a.y + b.y + d.y) / 3 - y0) / Math.max(0.01, y1 - y0));
    m.tri(a, b, d, tone(_n.y, h, col).clone());
  }
}

/**
 * A tube through `pts`, `r[i]` thick at each, `seg` sided: trunks and branches. `ring(i)` colours the band from point
 * i to the next (palm rings). A cap closes the top when asked (a baobab's flat top shows from above).
 */
function tube(m: Mesher, pts: Vector3[], r: number[], seg: number, ring: (i: number) => Color, cap = false) {
  const rings: Vector3[][] = [];
  const t = new Vector3(), u = new Vector3(), v = new Vector3();
  const ref = new Vector3(0, 0, 1);
  for (let i = 0; i < pts.length; i++) {
    t.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    u.crossVectors(t, Math.abs(t.z) > 0.9 ? new Vector3(1, 0, 0) : ref).normalize();
    v.crossVectors(t, u);
    const out: Vector3[] = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      out.push(pts[i].clone().addScaledVector(u, Math.cos(a) * r[i]).addScaledVector(v, Math.sin(a) * r[i]));
    }
    rings.push(out);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const col = ring(i);
    for (let k = 0; k < seg; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % seg], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % seg];
      m.tri(a, b, c, col);
      m.tri(b, d, c, col);
    }
  }
  if (cap) {
    const top = rings[rings.length - 1];
    const mid = pts[pts.length - 1];
    const col = ring(rings.length - 2).clone().multiplyScalar(1.12);
    for (let k = 0; k < seg; k++) m.tri(top[k], top[(k + 1) % seg], mid, col);
  }
}

const P = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** A branch from `a` towards `b`, thinning from `r0` to `r1`. */
function branch(m: Mesher, a: Vector3, b: Vector3, r0: number, r1: number, seg: number, col: Color) {
  tube(m, [a, b], [r0, r1], seg, () => col);
}

/**
 * A trunk rising from the ground through `pts`, flared at the root. `r0` at the foot, `r1` at the top; `bands`
 * alternate per segment (palm rings), `bump` swells every other ring (an oil palm's old frond bases).
 */
function trunk(m: Mesher, pts: Vector3[], r0: number, r1: number, seg: number, bands: Color[], flare = 1.7, bump = 0) {
  const all = [P(pts[0].x, -0.02, pts[0].z), ...pts];
  const n = all.length - 1;
  const r = all.map((_, i) => {
    const t = i / n;
    const base = r0 + (r1 - r0) * t;
    if (i === 0) return r0 * flare;
    return base * (bump && i % 2 ? 1 + bump : 1);
  });
  tube(m, all, r, seg, (i) => bands[i % bands.length]);
}

/**
 * A palm frond from `base`, heading out along `a` (radians round the trunk): it rises at `rise`, arches over and droops
 * by `droop`, `len` long and `w` wide at its widest, folded along the midrib so it reads as a leaf from any side.
 */
function frond(m: Mesher, l: Look, base: Vector3, a: number, len: number, w: number, rise: number, droop: number, pal: Leaf | Color, stations: number) {
  const dx = Math.cos(a), dz = Math.sin(a);
  const sx = -dz, sz = dx;
  const at = (t: number) => P(base.x + dx * len * t * Math.cos(rise * 0.6), base.y + len * (Math.sin(rise) * t - droop * t * t), base.z + dz * len * t * Math.cos(rise * 0.6));
  const width = (t: number) => w * (t < 0.35 ? 0.35 + t * 1.85 : (1 - t) / 0.65) * (l.low ? 1 : 0.85 + 0.3 * ((Math.round(t * stations * 2) & 1)));
  const tone = (t: number) => {
    if (pal instanceof Color) return pal.clone().multiplyScalar(0.92 + l.rand() * 0.16);
    // Fronds are lighter towards the tips and on the top of the arch, where the sun gets them.
    const c = new Color().copy(pal.mid).lerp(pal.light, clamp01(0.25 + t * 0.6 + (l.rand() - 0.5) * 0.2));
    if (l.dust > 0) c.lerp(DUST, l.dust * 0.35);
    return c;
  };
  let prev = at(0);
  let pl = prev.clone(), pr = prev.clone();
  for (let k = 1; k <= stations; k++) {
    const t = k / stations;
    const p = at(t);
    const hw = width(t);
    // The leaflets hang either side of the midrib, a little below it.
    const lft = P(p.x + sx * hw, p.y - hw * 0.35, p.z + sz * hw);
    const rgt = P(p.x - sx * hw, p.y - hw * 0.35, p.z - sz * hw);
    const col = tone(t);
    m.tri2(prev, p, lft, col);
    m.tri2(prev, lft, pl, col);
    m.tri2(prev, rgt, p, col);
    m.tri2(prev, pr, rgt, col);
    prev = p;
    pl = lft;
    pr = rgt;
  }
}

/* ---------- The species ---------- */

type Build = (m: Mesher, l: Look, pal: number) => void;

/** A leafy crown: lumps scattered over an ellipsoid shell, the biggest in the middle. */
function crown(m: Mesher, l: Look, pal: Leaf, c: V3, size: V3, n: number, lumpR: number, detail: number, flat = 1) {
  const y0 = c[1] - size[1], y1 = c[1] + size[1];
  const tone = (ny: number, h: number, out: Color) => leafTone(l, pal, ny, h, out);
  // The core fills the middle so there are no holes from above.
  lump(m, l, [c[0], c[1], c[2]], [size[0] * 0.78, size[1] * 0.8, size[2] * 0.78], tone, y0, y1, l.low ? 0 : detail);
  const a0 = l.rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (l.rand() - 0.5) * 0.6;
    const up = (l.rand() - 0.35) * 0.9 * flat;
    const ring = Math.sqrt(Math.max(0, 1 - up * up));
    const k = lumpR * (0.8 + l.rand() * 0.4);
    lump(m, l, [c[0] + Math.cos(a) * size[0] * 0.62 * ring, c[1] + up * size[1] * 0.65, c[2] + Math.sin(a) * size[2] * 0.62 * ring], [k, k * (0.75 + 0.2 * flat), k], tone, y0, y1, 0);
  }
}

const neem: Build = (m, l, pi) => {
  const pal = NEEM[pi % NEEM.length];
  const lean = (l.rand() - 0.5) * 0.05;
  const top = P(lean, 0.42, lean * 0.5);
  trunk(m, [P(0, 0.2, 0), top], 0.05, 0.036, l.low ? 4 : 6, [BARK.trunk], 1.8);
  // Two or three limbs fork out of the trunk into the crown; the lower ones show under it.
  const limbs = l.low ? 2 : 3;
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + l.rand();
    branch(m, top, P(top.x + Math.cos(a) * 0.2, 0.68, top.z + Math.sin(a) * 0.2), 0.03, 0.015, 4, BARK.dark);
  }
  crown(m, l, pal, [lean, 0.68, lean * 0.5], [0.38, 0.3, 0.38], l.low ? 3 : 7, 0.19, 1);
  if (!l.low) lump(m, l, [lean * 1.2 + 0.03, 0.9, 0.02], [0.16, 0.12, 0.16], (ny, h, o) => leafTone(l, pal, ny, h, o), 0.43, 0.97, 0);
};

const mango: Build = (m, l, pi) => {
  const pal = MANGO[pi % MANGO.length];
  const top = P(0, 0.26, 0);
  trunk(m, [P(0, 0.12, 0), top], 0.085, 0.065, l.low ? 5 : 7, [BARK.trunk, BARK.dark], 1.7);
  for (let i = 0; i < (l.low ? 2 : 4); i++) {
    const a = (i / 4) * Math.PI * 2 + l.rand() * 0.8;
    branch(m, top, P(Math.cos(a) * 0.3, 0.44, Math.sin(a) * 0.3), 0.045, 0.02, 4, BARK.dark);
  }
  // A big low dome, wider than it is tall, with its skirt hanging down to head height.
  crown(m, l, pal, [0, 0.58, 0], [0.52, 0.34, 0.52], l.low ? 4 : 8, 0.24, 1, 0.7);
  if (!l.low) {
    const tone = (ny: number, h: number, o: Color) => leafTone(l, pal, ny, h, o);
    lump(m, l, [0.05, 0.84, -0.04], [0.3, 0.16, 0.3], tone, 0.24, 0.94, 0);
  }
};

const coconut: Build = (m, l, pi) => {
  const pal = COCO[pi % COCO.length];
  // A slim trunk that curves as it climbs: a lean that grows towards the top.
  const lean = 0.12 + l.rand() * 0.16;
  const n = l.low ? 3 : 6;
  const pts: Vector3[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push(P(lean * Math.pow(t, 1.7), 1.3 * t, 0));
  }
  trunk(m, pts, 0.05, 0.034, l.low ? 4 : 5, PALM_BARK, 1.6);
  const top = pts[pts.length - 1];
  const head = P(top.x, top.y + 0.02, top.z);
  const fronds = l.low ? 6 : 10;
  const a0 = l.rand() * Math.PI * 2;
  for (let i = 0; i < fronds; i++) {
    const a = a0 + (i / fronds) * Math.PI * 2 + (l.rand() - 0.5) * 0.4;
    // Young fronds stand up in the middle; the old ones arch right over.
    const young = i % 3 === 0;
    frond(m, l, head, a, young ? 0.46 : 0.6 + l.rand() * 0.1, 0.1, young ? 0.95 : 0.45, young ? 0.5 : 1.2, pal, l.low ? 2 : 3);
  }
  if (!l.low) {
    // A dead frond hanging down the trunk, and a bunch of nuts under the crown.
    frond(m, l, P(head.x, head.y - 0.04, head.z), a0 + 0.3, 0.38, 0.05, -0.6, 0.6, DEAD, 3);
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 2.1;
      lump(m, l, [head.x + Math.cos(a) * 0.05, head.y - 0.06 - (i & 1) * 0.03, head.z + Math.sin(a) * 0.05], [0.035, 0.04, 0.035], (_ny, _h, o) => o.copy(NUTS[i & 1]), 0, 1, 0, 0.1);
    }
  }
};

const oilpalm: Build = (m, l, pi) => {
  const pal = OILPALM[pi % OILPALM.length];
  const lean = (l.rand() - 0.5) * 0.08;
  const n = l.low ? 2 : 5;
  const pts: Vector3[] = [];
  for (let i = 1; i <= n; i++) pts.push(P(lean * (i / n), 0.72 * (i / n), 0));
  // Rough with the stubs of old fronds: every other ring swells.
  trunk(m, pts, 0.075, 0.07, l.low ? 4 : 5, OIL_BARK, 1.45, l.low ? 0 : 0.28);
  const top = pts[pts.length - 1];
  const head = P(top.x, top.y + 0.02, top.z);
  const fronds = l.low ? 7 : 13;
  const a0 = l.rand() * Math.PI * 2;
  for (let i = 0; i < fronds; i++) {
    const a = a0 + i * 2.399 + (l.rand() - 0.5) * 0.3;
    // A full crown: an upright inner ring and a skirt of fronds arching out and down.
    const inner = i % 2 === 0;
    frond(m, l, head, a, inner ? 0.5 : 0.6, 0.11, inner ? 1.05 : 0.6, inner ? 0.75 : 1.15, pal, l.low ? 2 : 3);
  }
  if (!l.low) lump(m, l, [head.x, head.y - 0.03, head.z], [0.08, 0.06, 0.08], (ny, h, o) => leafTone(l, pal, ny, h, o).multiplyScalar(0.8), 0, 1, 0);
};

const baobab: Build = (m, l, pi) => {
  const pal = BAOBAB[pi % BAOBAB.length];
  const seg = l.low ? 6 : 8;
  // The bottle: swelling out above the root and narrowing to a flat top.
  const ys = [0, 0.14, 0.32, 0.5, 0.6];
  const rs = [0.3, 0.25, 0.27, 0.21, 0.16];
  tube(m, ys.map((y) => P(0, y, 0)), rs, seg, (i) => BAOBAB_BARK[i % BAOBAB_BARK.length], true);
  const bare = l.dust > 0.45;
  const limbs = l.low ? 4 : 6;
  const tone = (ny: number, h: number, o: Color) => leafTone(l, pal, ny, h, o);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + l.rand() * 0.6;
    const from = P(Math.cos(a) * 0.08, 0.58, Math.sin(a) * 0.08);
    const reach = 0.3 + l.rand() * 0.14;
    const mid = P(Math.cos(a) * reach * 0.6, 0.78 + l.rand() * 0.08, Math.sin(a) * reach * 0.6);
    const tip = P(Math.cos(a + 0.25) * reach, 0.9 + l.rand() * 0.12, Math.sin(a + 0.25) * reach);
    tube(m, [from, mid, tip], [0.06, 0.035, 0.012], l.low ? 4 : 5, () => BAOBAB_BARK[1]);
    if (!l.low) branch(m, mid, P(mid.x * 1.5, mid.y + 0.16, mid.z * 1.5 + 0.04), 0.022, 0.008, 4, BAOBAB_BARK[0]);
    // Only a few leaves, in tufts at the ends: none at all in the dry season.
    if (!bare) lump(m, l, [tip.x, tip.y + 0.03, tip.z], [0.1, 0.07, 0.1], tone, 0.6, 1.05, 0, 0.3);
  }
};

const flame: Build = (m, l, pi) => {
  const pal = FLAME_LEAF[pi % FLAME_LEAF.length];
  const top = P(0, 0.34, 0);
  trunk(m, [P(0, 0.16, 0), top], 0.055, 0.045, l.low ? 4 : 6, [BARK.light, BARK.trunk], 1.9);
  // The limbs spread wide and nearly flat: the umbrella frame shows under the crown.
  const limbs = l.low ? 3 : 5;
  const ends: Vector3[] = [];
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + l.rand() * 0.5;
    const end = P(Math.cos(a) * 0.42, 0.56 + l.rand() * 0.05, Math.sin(a) * 0.42);
    branch(m, top, end, 0.032, 0.012, 4, BARK.light);
    ends.push(end);
  }
  // A wide flat crown, ablaze on top, green underneath.
  const y0 = 0.5, y1 = 0.82;
  const tone = (ny: number, h: number, o: Color) => {
    if (ny > 0.15 && l.rand() < 0.8) {
      o.copy(FLAME[Math.floor(l.rand() * FLAME.length)]).multiplyScalar(0.9 + l.rand() * 0.2);
      return l.dust > 0 ? o.lerp(DUST, l.dust * 0.25) : o;
    }
    return leafTone(l, pal, ny, h, o);
  };
  lump(m, l, [0, 0.66, 0], [0.46, 0.13, 0.46], tone, y0, y1, l.low ? 0 : 1);
  const n = l.low ? 3 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + l.rand() * 0.6;
    const r = 0.36 + l.rand() * 0.1;
    lump(m, l, [Math.cos(a) * r, 0.64 + l.rand() * 0.06, Math.sin(a) * r], [0.2, 0.09, 0.2], tone, y0, y1, 0);
  }
};

const acacia: Build = (m, l, pi) => {
  const pal = ACACIA[pi % ACACIA.length];
  const lean = (l.rand() - 0.5) * 0.12;
  const fork = P(lean, 0.3, 0);
  trunk(m, [P(lean * 0.5, 0.15, 0), fork], 0.04, 0.03, l.low ? 4 : 5, [BARK.dark], 1.8);
  // The trunk forks into a vase of thin limbs holding up the flat top.
  const limbs = l.low ? 2 : 4;
  const tone = (ny: number, h: number, o: Color) => leafTone(l, pal, ny, h, o);
  const a0 = l.rand() * Math.PI * 2;
  for (let i = 0; i < limbs; i++) {
    const a = a0 + (i / limbs) * Math.PI * 2;
    const end = P(lean + Math.cos(a) * 0.32, 0.6 + l.rand() * 0.04, Math.sin(a) * 0.32);
    branch(m, fork, end, 0.022, 0.01, 4, BARK.dark);
    lump(m, l, [end.x, 0.68, end.z], [0.24, 0.065, 0.24], tone, 0.6, 0.76, 0, 0.3);
  }
  lump(m, l, [lean, 0.7, 0], [0.3, 0.07, 0.3], tone, 0.6, 0.76, 0, 0.3);
};

const shrub: Build = (m, l, pi) => {
  // 0 hedge green, 1 scrub olive, then flowering: 2 bougainvillea, 3 ixora, 4 croton.
  const pal = SHRUB[pi === 1 ? 1 : 0];
  const bloom = pi >= 2 ? BLOOMS[(pi - 2) % BLOOMS.length] : null;
  const tone = (ny: number, h: number, o: Color) => {
    if (bloom && ny > 0.1 && l.rand() < (pi === 4 ? 0.8 : 0.55)) return o.copy(bloom[Math.floor(l.rand() * bloom.length)]).multiplyScalar(0.9 + l.rand() * 0.2);
    return leafTone(l, pal, ny, h, o);
  };
  const n = l.low ? 2 : 4;
  lump(m, l, [0, 0.13, 0], [0.16, 0.12, 0.16], tone, 0, 0.28, l.low ? 0 : 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + l.rand();
    lump(m, l, [Math.cos(a) * 0.12, 0.1 + l.rand() * 0.05, Math.sin(a) * 0.12], [0.1, 0.085, 0.1], tone, 0, 0.28, 0);
  }
};

const BUILD: Record<TreeKind, Build> = { neem, mango, coconut, oilpalm, baobab, flame, acacia, shrub };
const PALETTES: Record<TreeKind, number> = { neem: 3, mango: 2, coconut: 2, oilpalm: 2, baobab: 1, flame: 1, acacia: 2, shrub: 5 };
/** Different shapes of each species. */
const VARIANTS = 3;

const cache = new Map<string, BufferGeometry>();

/**
 * The geometry of one tree, built once and shared: unit size (a neem stands about 1 tall), its foot at the origin,
 * coloured per vertex. `variant` picks the shape, `palette` the colours, `dust` (0 to 1) the harmattan on its leaves.
 */
export function treeGeometry(kind: TreeKind, variant = 0, palette = 0, low = false, dust = 0) {
  const d = Math.round(clamp01(dust) * 4) / 4;
  const v = variant % VARIANTS, p = palette % PALETTES[kind];
  const key = `${kind}|${v}|${p}|${low ? 1 : 0}|${d}`;
  let g = cache.get(key);
  if (!g) {
    const m = new Mesher();
    BUILD[kind](m, { rand: rng(kind.length * 7919 + v * 104729 + p * 31 + 17), low, dust: d }, p);
    cache.set(key, (g = m.geometry()));
  }
  return g;
}

/** How tall each species stands at size 1, and how wide its crown spreads (radius), for anything that needs to know. */
export const TREE_SIZE: Record<TreeKind, { h: number; r: number; crown: number }> = {
  neem: { h: 1.0, r: 0.42, crown: 0.72 },
  mango: { h: 0.96, r: 0.62, crown: 0.6 },
  coconut: { h: 1.45, r: 0.55, crown: 1.32 },
  oilpalm: { h: 1.15, r: 0.55, crown: 0.82 },
  baobab: { h: 1.05, r: 0.45, crown: 0.8 },
  flame: { h: 0.84, r: 0.6, crown: 0.68 },
  acacia: { h: 0.78, r: 0.55, crown: 0.7 },
  shrub: { h: 0.28, r: 0.25, crown: 0.14 },
};

/** The steady per-tree choices from where it stands: shape, colours, turn, size and lean. */
export function treePick(kind: TreeKind, x: number, z: number, seed = 0) {
  const r = rng(Math.floor(hash(x, z, seed) * 1e9));
  const variant = Math.floor(r() * VARIANTS);
  const palette = Math.floor(r() * PALETTES[kind]);
  const yaw = r() * Math.PI * 2;
  const scale = 0.88 + r() * 0.24;
  // Palms lean and curve on their own; the rest lean only a touch.
  const tilt = kind === 'coconut' || kind === 'oilpalm' ? 0.05 : kind === 'shrub' ? 0 : 0.06;
  const lx = (r() - 0.5) * tilt, lz = (r() - 0.5) * tilt;
  return { variant, palette, yaw, scale, lx, lz };
}

/**
 * The harmattan on the leaves of the city on show (game/weather.ts seasonDust), set by the map as it loads so every
 * tree drawn with it, place models included, gets the same dusting. 0 in the rains.
 */
let season = 0;
export const setTreeDust = (dust: number) => {
  season = clamp01(dust);
};
export const treeDust = () => season;

export interface PlantOpts {
  low?: boolean;
  /** Ground height. */
  y?: number;
  /** Harmattan dust on the leaves, 0 to 1. */
  dust?: number;
  /** A fixed palette (shrubs: 0 hedge, 1 scrub, 2 bougainvillea, 3 ixora, 4 croton). */
  palette?: number;
  /** Mixed into the position seed, so two trees on one spot can differ. */
  seed?: number;
}

/** Plants a tree `size` times its usual size at (x, z) into a kit (placeKit's Kit or a place's pen). */
export function plantTree(sink: TreeSink, kind: TreeKind, x: number, z: number, size = 1, o: PlantOpts = {}) {
  const pick = treePick(kind, x, z, o.seed);
  const g = treeGeometry(kind, pick.variant, o.palette ?? pick.palette, !!o.low, o.dust ?? season);
  const s = size * pick.scale;
  sink.shape(TREE_KEY, g, [x, o.y ?? 0, z], [s, s, s], [pick.lx, pick.yaw, pick.lz]);
}

/* ---------- Which trees grow where ---------- */

/** The mix of trees in each city: palms in Lagos, neem, baobab and acacia up in Kano, neem and mango in between. */
const MIX: Record<string, [TreeKind, number][]> = {
  lagos: [['coconut', 40], ['oilpalm', 16], ['mango', 16], ['flame', 12], ['neem', 6]],
  abuja: [['neem', 32], ['mango', 26], ['flame', 18], ['oilpalm', 10], ['coconut', 6], ['acacia', 8]],
  kaduna: [['neem', 40], ['mango', 30], ['flame', 10], ['oilpalm', 8], ['acacia', 7], ['baobab', 5]],
  kano: [['neem', 44], ['acacia', 24], ['baobab', 16], ['mango', 10], ['flame', 6]],
};

/** A tree for a spot on a city's map, from the city's own mix. Palms crowd the water's edge in the south. */
export function cityTreeKind(city: string, x: number, z: number, byWater = false): TreeKind {
  const mix = MIX[city] ?? MIX.kaduna;
  if (byWater && (city === 'lagos' || city === 'abuja') && hash(x, z, 5) < 0.75) return 'coconut';
  const total = mix.reduce((a, [, w]) => a + w, 0);
  let roll = hash(x, z, 11) * total;
  for (const [kind, w] of mix) if ((roll -= w) < 0) return kind;
  return mix[0][0];
}

/** A shade tree for a place's grounds: mostly neem, often mango, now and then a flame tree. */
export function shadeKind(x: number, z: number): TreeKind {
  const r = hash(x, z, 3);
  return r < 0.5 ? 'neem' : r < 0.85 ? 'mango' : 'flame';
}

/** A tree out in the bush round a rock or a village: acacia and neem, the odd baobab. */
export function savannaKind(x: number, z: number): TreeKind {
  const r = hash(x, z, 9);
  return r < 0.45 ? 'acacia' : r < 0.85 ? 'neem' : 'baobab';
}

/** A tree in a scene of its own (the kidnappers' bush, a yard): the usual shade trees and the odd oil palm. */
export function bushKind(x: number, z: number): TreeKind {
  const r = hash(x, z, 7);
  return r < 0.45 ? 'neem' : r < 0.8 ? 'mango' : 'oilpalm';
}

/**
 * The size a map tree is drawn at, from its `s` (the old city tree's scale: about a third of its height). Wide crowns
 * are brought in a little, so a mango does not swallow the road beside it.
 */
export const mapTreeSize = (kind: TreeKind, s: number) => 3.4 * s * Math.min(1, 0.5 / TREE_SIZE[kind].r);

const mapped = new WeakMap<CityMap, { x: number; z: number; s: number; kind: TreeKind }[]>();
/** The map's trees with their species: the city's mix, palms along the water in the south. Worked out once per map. */
export function mapTrees(map: CityMap) {
  let list = mapped.get(map);
  if (!list) {
    list = map.trees.map((t) => {
      const byWater = [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2]].some(([a, b]) => map.isWater(t.x + a, t.z + b));
      return { ...t, kind: cityTreeKind(map.id, t.x, t.z, byWater) };
    });
    mapped.set(map, list);
  }
  return list;
}

/** A species' everyday leaf colour, for anything drawn over it (a windstorm's bending crowns). */
export const treeTint = (kind: TreeKind) =>
  `#${(kind === 'flame' ? FLAME[1] : ({ neem: NEEM, mango: MANGO, coconut: COCO, oilpalm: OILPALM, baobab: BAOBAB, acacia: ACACIA, shrub: SHRUB, flame: FLAME_LEAF } as const)[kind][0].mid).getHexString()}`;
