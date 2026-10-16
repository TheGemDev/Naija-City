// Heritage, culture and home on the city map: Kano's old city (the mud wall, its gates, the Emir's palace, Dala Hill,
// the Kofar Mata dye pits, the groundnut pyramids), the big cultural landmarks (the National Theatre, Lugard Hall, the
// parade squares, Millennium Tower, the museums, the roundabout fountains), the street football pitch and the
// player's own house.
// Each is centred on its footprint (w along x, d along z), sits on y=0 and has its door on the +z side. Landmarks are
// never turned on the map, so the long ones (wall, gates) turn themselves to run along their longer side.
//
// Built with the stadium's kit (placeKit.tsx): every part is merged into one geometry per colour, so a whole building
// is a handful of plain meshes that StaticBatch folds into the town's own buckets. Windows are 'glass…' parts and
// lanterns 'lamp…' parts, so they light up with the town at night; lit gates and facades are a Glow, drawn only after
// dark. Low performance mode leaves out the people, the horses, the small props and the finer relief.

import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, Matrix4, MeshStandardMaterial, SphereGeometry, Vector3, type Mesh } from 'three';
import { frame, Glow, Kit, KitModel, prep, rng, scale, type Built, type RGB, type V3 } from '../placeKit';
import { useGame } from '../../game/store';
import { paintHex } from '../../game/paint';

/* ---------- Colours ---------- */

// Kano's red earth (laterite plaster), in the shades a wall takes from rain, sun and fresh re-plastering.
const MUD = '#b0673a';
const MUD_B = '#a65f35';
const MUD_DARK = '#8a4a28';
const MUD_LIGHT = '#c8834f';
const MUD_TOP = '#bf7848';
const FOOT = '#94603c';
// Hausa relief: whitewash and painted accents on the mud.
const RELIEF = '#f1e6cf';
const RELIEF_GREEN = '#1f7a4a';
const RELIEF_OCHRE = '#e0a54a';
const RELIEF_MAROON = '#7a2a2a';
const DOORWAY = '#2b1a10';
const WOOD = '#5b3a1e';
const WOOD_LIGHT = '#8a6238';
const DARK = '#1f2937';
const STEEL = '#94a3b8';
const ZINC = '#9aa3ad';
const WHITE = '#f4f6f8';
const NG_GREEN = '#15803d';
const SAND = '#dcc08f';
const DUST = '#c9a46a';
const GRASS = '#8fb35a';
const LAWN = '#7fae4f';
const HEDGE = '#2f6b2a';
const LEAF = ['#3f7d2a', '#4d8a34', '#356b24'];
const TRUNK = '#5b3a1e';
const PAVING = '#d6d0c4';
const PAVING_DARK = '#bdb5a6';
const CONCRETE = '#a8a29e';
const SKIN = ['#5b3a24', '#6b4329', '#4a2e1c'];
const ROBES = ['#f8fafc', '#e0f2fe', '#1d4ed8', '#7c3aed', '#facc15', '#16a34a', '#dc2626', '#f97316'];
const GOLD = '#d4a72c';

const WARM: RGB = [1, 0.78, 0.48];

/* ---------- Shared shapes ---------- */

const shapes = new Map<string, BufferGeometry>();
const cached = (key: string, make: () => BufferGeometry) => {
  let g = shapes.get(key);
  if (!g) shapes.set(key, (g = prep(make())));
  return g;
};
/** A dome of radius 1 on y=0. */
const DOME = (lon: number, lat: number) => cached(`dome${lon}|${lat}`, () => new SphereGeometry(1, lon, lat, 0, Math.PI * 2, 0, Math.PI / 2));
/** A lump of radius 1: rocks, tree crowns, clay heads. */
const LUMP = (detail: number) => cached(`ico${detail}`, () => new IcosahedronGeometry(1, detail));

/* ---------- A pen: the kit, a glow and an optional frame to draw in ---------- */

const _v = new Vector3();

class Pen {
  kit = new Kit();
  glow = new Glow();
  /** Everything drawn goes through this frame when set (a turned wall, a gatehouse's face). */
  f?: Matrix4;

  at(p: V3): V3 {
    if (!this.f) return p;
    _v.set(p[0], p[1], p[2]).applyMatrix4(this.f);
    return [_v.x, _v.y, _v.z];
  }
  dir(p: V3): V3 {
    if (!this.f) return p;
    _v.set(p[0], p[1], p[2]).transformDirection(this.f);
    return [_v.x, _v.y, _v.z];
  }
  box(key: string, p: V3, s: V3, r?: V3) { this.kit.box(key, p, s, r, this.f); }
  post(key: string, p: V3, r: number, h: number, seg = 6, taper = 1) { this.kit.post(key, p, r, h, seg, taper, this.f); }
  shape(key: string, g: BufferGeometry, p: V3, s: V3, r?: V3) { this.kit.shape(key, g, p, s, r, this.f); }
  bar(key: string, a: V3, b: V3, t: number) { this.kit.bar(key, this.at(a), this.at(b), t); }
  tri(key: string, a: V3, b: V3, c: V3, out: V3) { this.kit.tri(key, this.at(a), this.at(b), this.at(c), this.dir(out)); }
  quad(key: string, a: V3, b: V3, c: V3, d: V3, out: V3) {
    this.tri(key, a, b, c, out);
    this.tri(key, a, c, d, out);
  }
  flat(key: string, x0: number, z0: number, x1: number, z1: number, y: number) {
    this.quad(key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]);
  }
  gquad(a: V3, b: V3, c: V3, d: V3, ca: RGB, cb: RGB = ca, cc: RGB = cb, cd: RGB = cc) {
    this.glow.quad(this.at(a), this.at(b), this.at(c), this.at(d), ca, cb, cc, cd);
  }
  done(): Built {
    return { parts: this.kit.build(), glow: this.glow.pos.length ? this.glow.build() : undefined };
  }
}

/** A block whose walls lean in as they rise, the way mud walls are built: `w0`×`d0` at the foot, `w1`×`d1` on top. */
function batter(k: Pen, key: string, cx: number, cz: number, y0: number, h: number, w0: number, d0: number, w1 = w0, d1 = d0, top: string | null = key) {
  const y1 = y0 + h;
  const B = (sx: number, sz: number): V3 => [cx + (sx * w0) / 2, y0, cz + (sz * d0) / 2];
  const T = (sx: number, sz: number): V3 => [cx + (sx * w1) / 2, y1, cz + (sz * d1) / 2];
  k.quad(key, B(-1, 1), B(1, 1), T(1, 1), T(-1, 1), [0, 0, 1]);
  k.quad(key, B(1, -1), B(-1, -1), T(-1, -1), T(1, -1), [0, 0, -1]);
  k.quad(key, B(1, 1), B(1, -1), T(1, -1), T(1, 1), [1, 0, 0]);
  k.quad(key, B(-1, -1), B(-1, 1), T(-1, 1), T(-1, -1), [-1, 0, 0]);
  if (top) k.quad(top, T(-1, -1), T(1, -1), T(1, 1), T(-1, 1), [0, 1, 0]);
}

/** A flat disc or ring on the ground. */
function ring(k: Pen, key: string, cx: number, cz: number, r0: number, r1: number, y: number, seg = 24, keyB?: string) {
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
    const p = (t: number, r: number): V3 => [cx + Math.cos(t) * r, y, cz + Math.sin(t) * r];
    const c = keyB && i % 2 ? keyB : key;
    if (r0 <= 0) k.tri(c, [cx, y, cz], p(a, r1), p(b, r1), [0, 1, 0]);
    else k.quad(c, p(a, r0), p(b, r0), p(b, r1), p(a, r1), [0, 1, 0]);
  }
}

/** Zanko: the horn a Hausa builder raises on the corners of a roof. */
function zanko(k: Pen, x: number, y: number, z: number, h = 0.4, key = MUD_LIGHT) {
  k.post(key, [x, y, z], h * 0.2, h, 4, 0.1);
}

/** A person: robe or shirt, then a head (or a turban). */
function person(k: Pen, x: number, z: number, cloth: string, o: { y?: number; s?: number; head?: string; sit?: boolean; cap?: string } = {}) {
  const s = o.s ?? 1, y = o.y ?? 0, h = (o.sit ? 0.1 : 0.17) * s;
  k.box(cloth, [x, y + h / 2, z], [0.075 * s, h, 0.06 * s]);
  k.box(o.head ?? SKIN[0], [x, y + h + 0.03 * s, z], [0.052 * s, 0.055 * s, 0.052 * s]);
  if (o.cap) k.box(o.cap, [x, y + h + 0.065 * s, z], [0.062 * s, 0.025 * s, 0.062 * s]);
}

/** A tree: a trunk and a crown of a lump or two. */
function tree(k: Pen, x: number, z: number, s: number, low: boolean, leaf = LEAF[0], y = 0) {
  k.post(TRUNK, [x, y, z], 0.05 * s, 0.55 * s, 5, 0.7);
  k.shape(leaf, LUMP(0), [x, y + 0.75 * s, z], [0.42 * s, 0.34 * s, 0.42 * s], [0, x * 3, 0]);
  if (!low) k.shape(LEAF[(Math.round(x * 7 + z * 3) & 1) + 1], LUMP(0), [x + 0.18 * s, y + 0.62 * s, z + 0.1 * s], [0.28 * s, 0.24 * s, 0.28 * s], [0.4, z, 0]);
}

/** A flagpole flying a flag of three upright bands (Nigeria's by default). */
function flag(k: Pen, x: number, z: number, h: number, bands: string[] = [NG_GREEN, WHITE, NG_GREEN], s = 1) {
  k.post(STEEL, [x, 0, z], 0.018 * s, h, 5);
  bands.forEach((c, i) => k.box(c, [x + (0.05 + i * 0.1) * s, h - 0.12 * s, z], [0.1 * s, 0.22 * s, 0.012]));
}

/** A street lamp: a pole and its lamp, a pool of light under it after dark. */
function lampPost(k: Pen, x: number, z: number, h: number, i: number, pool = 0.45) {
  k.post(DARK, [x, 0, z], 0.025, h, 5);
  k.box(DARK, [x, h, z], [0.12, 0.03, 0.12]);
  k.box(`lamp${i % 4}`, [x, h - 0.035, z], [0.1, 0.04, 0.1]);
  groundPool(k, x, z, pool, 0.28);
}

/** A soft pool of warm light on the ground, seen after dark. */
function groundPool(k: Pen, x: number, z: number, r: number, b: number, y = 0.03, c: RGB = WARM) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, e = ((i + 1) / 8) * Math.PI * 2;
    k.glow.tri(k.at([x, y, z]), k.at([x + Math.cos(a) * r, y, z + Math.sin(a) * r]), k.at([x + Math.cos(e) * r, y, z + Math.sin(e) * r]), scale(c, b), [0, 0, 0]);
  }
}

/** A hipped roof over x0..x1 by z0..z1 from eaves height `y`, rising `h`, its ridge along the longer side. */
function hipRoof(k: Pen, key: string, cx: number, cz: number, w: number, d: number, y: number, h: number, fascia?: string) {
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
  if (fascia) {
    // The board along the eaves.
    k.quad(fascia, c(-1, 1), c(1, 1), [cx + hw, y - 0.05, cz + hd], [cx - hw, y - 0.05, cz + hd], [0, 0, 1]);
    k.quad(fascia, c(1, -1), c(-1, -1), [cx - hw, y - 0.05, cz - hd], [cx + hw, y - 0.05, cz - hd], [0, 0, -1]);
    k.quad(fascia, c(1, 1), c(1, -1), [cx + hw, y - 0.05, cz - hd], [cx + hw, y - 0.05, cz + hd], [1, 0, 0]);
    k.quad(fascia, c(-1, -1), c(-1, 1), [cx - hw, y - 0.05, cz + hd], [cx - hw, y - 0.05, cz - hd], [-1, 0, 0]);
  }
}

/* ---------- Relief on a wall face ---------- */

/** A wall face to draw on: `o` its foot in the middle, `u` along it, `n` out of it (up is up). */
interface Face { o: V3; u: V3; n: V3 }
const onFace = (f: Face, a: number, b: number, lift = 0.008): V3 => [f.o[0] + f.u[0] * a + f.n[0] * lift, f.o[1] + b, f.o[2] + f.u[2] * a + f.n[2] * lift];
const fRect = (k: Pen, f: Face, key: string, a0: number, b0: number, a1: number, b1: number, lift = 0.008) =>
  k.quad(key, onFace(f, a0, b0, lift), onFace(f, a1, b0, lift), onFace(f, a1, b1, lift), onFace(f, a0, b1, lift), f.n);
const fDiamond = (k: Pen, f: Face, key: string, a: number, b: number, ra: number, rb: number, lift = 0.01) =>
  k.quad(key, onFace(f, a, b - rb, lift), onFace(f, a + ra, b, lift), onFace(f, a, b + rb, lift), onFace(f, a - ra, b, lift), f.n);
/** Dagi, the Hausa knot: an eight-pointed star of a square over a diamond, with a coloured heart. */
function fKnot(k: Pen, f: Face, key: string, a: number, b: number, r: number, heart = RELIEF_GREEN) {
  fDiamond(k, f, key, a, b, r, r);
  fRect(k, f, key, a - r * 0.7, b - r * 0.7, a + r * 0.7, b + r * 0.7, 0.01);
  fDiamond(k, f, heart, a, b, r * 0.38, r * 0.38, 0.013);
}
/** The pointed arch of a Hausa doorway: half-width `a`, springing at `ys`, its point at `yc`. */
const archY = (t: number, ys: number, yc: number) => ys + (yc - ys) * Math.sqrt(Math.max(0, 1 - Math.abs(t)));
/** A dark doorway in the shape of that arch. */
function fArchDoor(k: Pen, f: Face, key: string, a: number, ys: number, yc: number, n: number, lift = 0.008) {
  for (let i = 0; i < n; i++) {
    const t0 = -1 + (2 * i) / n, t1 = -1 + (2 * (i + 1)) / n;
    k.quad(key, onFace(f, t0 * a, 0, lift), onFace(f, t1 * a, 0, lift), onFace(f, t1 * a, archY(t1, ys, yc), lift), onFace(f, t0 * a, archY(t0, ys, yc), lift), f.n);
  }
}
/** A band of relief following the arch, `wd` wide, outside the opening. */
function fArchBand(k: Pen, f: Face, key: string, a: number, ys: number, yc: number, wd: number, n: number, lift = 0.01) {
  for (let i = 0; i < n; i++) {
    const t0 = -1 + (2 * i) / n, t1 = -1 + (2 * (i + 1)) / n;
    const pin = (t: number) => onFace(f, t * a, archY(t, ys, yc), lift);
    const pout = (t: number) => onFace(f, t * (a + wd), archY(t, ys, yc + wd * 1.4), lift);
    k.quad(key, pin(t0), pin(t1), pout(t1), pout(t0), f.n);
  }
  // Down the jambs to the ground.
  fRect(k, f, key, -a - wd, 0, -a, ys, lift);
  fRect(k, f, key, a, 0, a + wd, ys, lift);
}
/** A row of white teeth: the zigzag frieze under a parapet. */
function fZigzag(k: Pen, f: Face, key: string, a0: number, a1: number, b: number, h: number, n: number, lift = 0.01) {
  const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const x = a0 + i * step;
    k.tri(key, onFace(f, x, b, lift), onFace(f, x + step, b, lift), onFace(f, x + step / 2, b + h, lift), f.n);
  }
}
/** Warm light washing up a lit face after dark, brightest at the foot. */
function fWash(k: Pen, f: Face, a0: number, a1: number, h: number, b: number) {
  k.gquad(onFace(f, a0, 0.02, 0.03), onFace(f, a1, 0.02, 0.03), onFace(f, a1, h, 0.03), onFace(f, a0, h, 0.03), scale(WARM, b), scale(WARM, b), [0, 0, 0], [0, 0, 0]);
}

/* ---------- Kano: the city wall ---------- */

// A stretch of the old wall (Ganuwa): a red-earth rampart leaning in as it rises, a walk along its top between two rows
// of rounded merlons, buttresses at its foot, palm-wood spouts to drain the rain, and here and there a breach the rains
// have worn into it. It runs along its footprint's longer side.
function buildCityWall(w: number, d: number, low: boolean) {
  const k = new Pen();
  const len = Math.max(w, d), thick = Math.min(w, d);
  if (d > w) k.f = frame([0, 0, 0], [0, Math.PI / 2, 0]);
  const rand = rng(Math.round(len * 97 + thick * 13 + (d > w ? 5 : 0)));
  const T0 = Math.min(0.92, thick * 0.9), T1 = T0 * 0.5, H = 1.2;
  const half = (y: number, h: number) => T0 / 2 - ((T0 - T1) / 2) * (y / h);
  k.flat(FOOT, -len / 2, -T0 / 2 - 0.05, len / 2, T0 / 2 + 0.05, 0.012);
  const n = Math.max(3, Math.round(len / (low ? 1.2 : 0.6)));
  const sl = len / n;
  const tops: number[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + (i + 0.5) * sl;
    const breach = !low && i > 0 && i < n - 1 && rand() < 0.1;
    const h = breach ? H * 0.62 : H + (rand() - 0.5) * 0.16;
    tops.push(breach ? -1 : h);
    batter(k, rand() < 0.5 ? MUD : MUD_B, cx, 0, 0, h, sl + 0.004, T0, sl + 0.004, breach ? T1 * 1.3 : T1, MUD_TOP);
    if (breach) for (let j = 0; j < 3; j++) k.shape(MUD_DARK, LUMP(0), [cx + (rand() - 0.5) * sl, 0.06, (rand() - 0.5) * T0 * 1.4], [0.1, 0.07, 0.09], [rand(), rand(), 0]);
  }
  const segAt = (x: number) => tops[Math.min(n - 1, Math.max(0, Math.floor((x + len / 2) / sl)))];
  // Merlons along both edges of the walk.
  const gap = low ? 0.42 : 0.3;
  for (let x = -len / 2 + gap / 2; x < len / 2; x += gap) {
    const y = segAt(x);
    if (y < 0) continue;
    for (const s of [-1, 1]) {
      if (rand() < 0.08) continue;
      batter(k, MUD_LIGHT, x, s * (T1 / 2 - 0.05), y, 0.16 + rand() * 0.06, 0.15, 0.1, 0.08, 0.06, MUD_LIGHT);
    }
  }
  // Buttresses either side, every couple of tiles.
  const nb = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i < nb; i++) {
    const x = -len / 2 + (i + 0.5) * (len / nb);
    const y = segAt(x);
    if (y < 0) continue;
    for (const s of [-1, 1]) batter(k, MUD_B, x, s * (T0 / 2 - 0.02), 0, y * 0.72, 0.34, 0.22, 0.2, 0.06, MUD_TOP);
  }
  if (!low) {
    // Palm-wood spouts (toron giginya) poking out under the walk, and grass at the foot.
    for (let x = -len / 2 + 0.45; x < len / 2; x += 0.9) {
      const y = segAt(x);
      if (y < 0) continue;
      for (const s of [-1, 1]) k.box(WOOD, [x, y - 0.14, s * (half(y - 0.14, y) + 0.05)], [0.04, 0.04, 0.14]);
    }
    for (let i = 0; i < Math.round(len * 1.5); i++) {
      const s = rand() < 0.5 ? -1 : 1;
      k.box(rand() < 0.5 ? '#7d8f45' : '#6f8a3c', [(rand() - 0.5) * len * 0.96, 0.03, s * (T0 / 2 + 0.03 + rand() * 0.04)], [0.1, 0.06, 0.06], [0, rand() * 3, 0]);
    }
  }
  return k.done();
}

/* ---------- Kano: a city gate (kofar) ---------- */

// A gate of the old city, after Kofar Mata and Kofar Nassarawa: two red-earth towers either side of the road, a
// pointed Hausa arch between them, the whole crowned with a parapet of zanko horns. Both faces carry whitewashed
// relief: a band round the arch, dagi knots in the spandrels, a zigzag frieze and panels of diamonds on the towers.
// The great studded doors stand open against the towers, and lanterns either side light the arch at night.
// The road runs through along the footprint's shorter side.
function buildKofar(w: number, d: number, low: boolean) {
  const k = new Pen();
  const span = Math.max(w, d), thick = Math.min(w, d);
  if (w > d) k.f = frame([0, 0, 0], [0, Math.PI / 2, 0]);
  const rand = rng(Math.round(span * 31 + thick * 7));
  // Local: the road runs along x, the opening is z in -a..a, the towers either side of it.
  const a = Math.min(1.02, span * 0.26);
  const tw = span / 2 - a;
  const tx = thick / 2 + 0.12;
  const hx = tx - 0.07;
  const H = 2.15, ys = 1.0, yc = 1.66;
  const N = low ? 8 : 14;
  for (const s of [-1, 1]) {
    const zc = s * (a + tw / 2);
    batter(k, MUD_DARK, 0, zc, 0, 0.3, tx * 2 + 0.18, tw + 0.12, tx * 2 + 0.06, tw + 0.02, MUD_DARK);
    k.box(MUD, [0, H / 2, zc], [tx * 2, H, tw]);
    k.box(MUD_DARK, [0, H + 0.03, zc], [tx * 2 + 0.08, 0.06, tw + 0.06]);
  }
  // The arch block between the towers: two faces down to the arch, its soffit over the road.
  for (let i = 0; i < N; i++) {
    const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
    const z0 = t0 * a, z1 = t1 * a, y0 = archY(t0, ys, yc), y1 = archY(t1, ys, yc);
    for (const s of [-1, 1]) k.quad(MUD, [s * hx, y0, z0], [s * hx, y1, z1], [s * hx, H, z1], [s * hx, H, z0], [s, 0, 0]);
    k.quad(MUD_DARK, [-hx, y0, z0], [hx, y0, z0], [hx, y1, z1], [-hx, y1, z1], [0, -0.3, -(z0 + z1) / 2]);
  }
  // The crown: a parapet across the whole gate, bristling with zanko horns.
  batter(k, MUD_LIGHT, 0, 0, H + 0.06, 0.3, tx * 2 + 0.02, span - 0.04, tx * 2 - 0.08, span - 0.12, MUD_TOP);
  const yt = H + 0.36;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) zanko(k, sx * (tx - 0.09), yt, sz * (span / 2 - 0.1), 0.55);
  const horns = low ? 3 : 7;
  for (let i = 0; i < horns; i++) {
    const z = -span / 2 + 0.1 + ((i + 1) / (horns + 1)) * (span - 0.2);
    for (const sx of [-1, 1]) zanko(k, sx * (tx - 0.09), yt, z, i === (horns - 1) / 2 ? 0.48 : 0.32);
  }
  // Relief on both faces, where everyone coming through sees it.
  for (const s of [-1, 1]) {
    const face: Face = { o: [s * hx, 0, 0], u: [0, 0, 1], n: [s, 0, 0] };
    fArchBand(k, face, RELIEF, a, ys, yc, 0.07, N);
    fArchBand(k, face, RELIEF_GREEN, a + 0.1, ys, yc + 0.12, 0.035, N);
    fKnot(k, face, RELIEF, -a * 0.6, 1.84, 0.12);
    fKnot(k, face, RELIEF, a * 0.6, 1.84, 0.12);
    fDiamond(k, face, RELIEF_OCHRE, 0, 1.98, 0.07, 0.09);
    fZigzag(k, face, RELIEF, -a, a, H - 0.1, 0.08, low ? 8 : 12);
    for (const sz of [-1, 1]) {
      const zc = sz * (a + tw / 2);
      const tf: Face = { o: [s * tx, 0, zc], u: [0, 0, 1], n: [s, 0, 0] };
      fRect(k, tf, MUD_LIGHT, -tw / 2 + 0.12, 0.45, tw / 2 - 0.12, H - 0.2, 0.006);
      fRect(k, tf, RELIEF, -tw / 2 + 0.12, H - 0.26, tw / 2 - 0.12, H - 0.2);
      fRect(k, tf, RELIEF, -tw / 2 + 0.12, 0.45, tw / 2 - 0.12, 0.5);
      for (let j = 0; j < 3; j++) fDiamond(k, tf, j === 1 ? RELIEF_GREEN : RELIEF, 0, 0.78 + j * 0.36, 0.12, 0.15);
      if (!low) {
        fRect(k, tf, RELIEF, -tw / 2 + 0.17, 0.55, -tw / 2 + 0.2, H - 0.31);
        fRect(k, tf, RELIEF, tw / 2 - 0.2, 0.55, tw / 2 - 0.17, H - 0.31);
      }
      // A lantern on a bracket either side of the arch.
      k.box(DARK, [s * (tx + 0.05), 1.38, zc - sz * (tw / 2 - 0.2)], [0.1, 0.03, 0.03]);
      k.box(`lamp${(s + 1) / 2 + sz + 1}`, [s * (tx + 0.09), 1.3, zc - sz * (tw / 2 - 0.2)], [0.07, 0.11, 0.07]);
    }
    fWash(k, face, -a, a, ys + 0.5, 0.32);
  }
  // The doors, swung open against the towers: planks of dark wood bound with iron straps.
  for (const s of [-1, 1]) {
    const dw = Math.min(a * 1.15, hx * 2 - 0.1);
    k.box(WOOD, [0, ys * 0.47, s * (a - 0.03)], [dw, ys * 0.94, 0.05]);
    for (const y of [0.2, 0.5, 0.8]) k.box(DARK, [0, y * ys, s * (a - 0.06)], [dw, 0.035, 0.012]);
  }
  // Light pooled under the arch.
  k.gquad([-tx - 0.4, 0.03, -a], [tx + 0.4, 0.03, -a], [tx + 0.4, 0.03, a], [-tx - 0.4, 0.03, a], scale(WARM, 0.18));
  if (!low) {
    // Old men on the benches at the towers' feet, and a trader passing through with a load on her head.
    for (const s of [-1, 1]) person(k, s * (tx + 0.1), s * (a + tw * 0.6), ROBES[Math.floor(rand() * 3)], { sit: true, y: 0.22, cap: RELIEF });
    person(k, 0.25, 0.3, '#be185d', { head: SKIN[1] });
    k.box('#e0a54a', [0.25, 0.26, 0.3], [0.1, 0.04, 0.1]);
  }
  return k.done();
}

/* ---------- Kano: the Emir's palace (Gidan Rumfa) ---------- */

// Gidan Rumfa: a red-earth wall round the compound with horned corner towers, and in its south side the great
// gatehouse (Kofar Fada), its tall face covered in whitewashed and painted relief round a pointed doorway, a crown of
// zanko horns along its top. Inside: a sandy courtyard, the audience hall (Soron Giwa) under a green dome, the
// council chamber and living quarters with flat roofs and horns, the stables with the Emir's horses, neem trees, and
// the palace guards (dogarai) in red and green at the gate.
function buildEmirPalace(w: number, d: number, low: boolean) {
  const k = new Pen();
  const rand = rng(Math.round(w * 53 + d * 11));
  const hw = w / 2 - 0.14, hd = d / 2 - 0.14;
  const WALL_H = 0.85, T = 0.2;
  k.flat(SAND, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  // The path from the gate to the hall, and the forecourt by the gate.
  k.flat('#e8d5ad', -0.32, -hd + 1.4, 0.32, hd - 0.4, 0.016);
  const gw = 1.9, gd = 0.72, gH = 1.75, gz = hd - gd / 2 + 0.1;
  // The compound wall: back, sides, and the front either side of the gatehouse.
  const wall = (cx: number, cz: number, lx: number, lz: number) => batter(k, MUD, cx, cz, 0, WALL_H, lx, lz, lx - (lx > lz ? 0 : 0.08), lz - (lz > lx ? 0 : 0.08), MUD_TOP);
  wall(0, -hd, w - 0.28, T);
  wall(-hw, 0, T, d - 0.28);
  wall(hw, 0, T, d - 0.28);
  const fl = hw - gw / 2;
  wall(-(gw / 2 + fl / 2), hd, fl, T);
  wall(gw / 2 + fl / 2, hd, fl, T);
  // Rounded merlons along the top of the wall.
  const gap = low ? 0.55 : 0.3;
  const merlon = (x: number, z: number) => batter(k, MUD_LIGHT, x, z, WALL_H, 0.13, 0.12, 0.1, 0.07, 0.06, MUD_LIGHT);
  for (let x = -hw + 0.3; x <= hw - 0.3; x += gap) {
    merlon(x, -hd);
    if (Math.abs(x) > gw / 2 + 0.1) merlon(x, hd);
  }
  for (let z = -hd + 0.3; z <= hd - 0.3; z += gap) {
    merlon(-hw, z);
    merlon(hw, z);
  }
  // Corner towers with their horns.
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    batter(k, MUD_DARK, x, z, 0, 1.15, 0.46, 0.46, 0.36, 0.36, MUD_TOP);
    if (low) zanko(k, x, 1.15, z, 0.36);
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) zanko(k, x + sx * 0.13, 1.15, z + sz * 0.13, 0.26);
  }

  // The gatehouse: a tall decorated face round a pointed doorway, a crown of horns.
  batter(k, MUD_LIGHT, 0, gz, 0, gH, gw, gd, gw - 0.1, gd - 0.08, MUD_TOP);
  batter(k, MUD_DARK, 0, gz, gH, 0.08, gw + 0.02, gd + 0.02, gw - 0.04, gd - 0.04, MUD_DARK);
  // The face leans back a little: draw the relief on a plane just in front of its foot.
  const face: Face = { o: [0, 0, gz + gd / 2 - 0.02], u: [1, 0, 0], n: [0, 0, 1] };
  fRect(k, face, MUD, -gw / 2 + 0.12, 0.05, gw / 2 - 0.12, gH - 0.1, 0.02);
  const N = low ? 8 : 12;
  fArchDoor(k, face, DOORWAY, 0.26, 0.62, 1.02, N, 0.03);
  fArchBand(k, face, RELIEF, 0.26, 0.62, 1.02, 0.06, N, 0.032);
  fArchBand(k, face, RELIEF_MAROON, 0.35, 0.62, 1.13, 0.035, N, 0.032);
  // Two columns of knots either side of the door, a frieze along the top, and the bands that frame the face.
  for (const s of [-1, 1]) {
    for (let j = 0; j < 3; j++) fKnot(k, face, RELIEF, s * 0.62, 0.42 + j * 0.42, 0.12, j === 1 ? RELIEF_MAROON : RELIEF_GREEN);
    fRect(k, face, RELIEF, s * 0.42 - 0.02, 0.1, s * 0.42 + 0.02, gH - 0.35, 0.03);
    fRect(k, face, RELIEF_GREEN, s * (gw / 2 - 0.16) - 0.025, 0.1, s * (gw / 2 - 0.16) + 0.025, gH - 0.2, 0.03);
  }
  fZigzag(k, face, RELIEF, -gw / 2 + 0.14, gw / 2 - 0.14, gH - 0.32, 0.1, low ? 10 : 16, 0.03);
  fRect(k, face, RELIEF, -gw / 2 + 0.14, gH - 0.36, gw / 2 - 0.14, gH - 0.32, 0.03);
  fKnot(k, face, RELIEF_OCHRE, 0, 1.3, 0.1, RELIEF_MAROON);
  fRect(k, face, RELIEF_OCHRE, -0.5, gH - 0.2, 0.5, gH - 0.14, 0.03);
  const yt = gH + 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) zanko(k, sx * (gw / 2 - 0.12), yt, gz + sz * (gd / 2 - 0.1), 0.5);
  for (let i = 0; i < (low ? 1 : 3); i++) {
    const x = low ? 0 : (i - 1) * 0.42;
    zanko(k, x, yt, gz + gd / 2 - 0.1, i === 1 || low ? 0.44 : 0.32);
  }
  // Lanterns either side of the door, the face washed in light after dark.
  for (const s of [-1, 1]) k.box(`lamp${s > 0 ? 1 : 0}`, [s * 0.46, 0.95, gz + gd / 2 + 0.03], [0.07, 0.1, 0.06]);
  fWash(k, face, -gw / 2, gw / 2, gH, 0.3);
  groundPool(k, 0, hd + 0.1, 0.6, 0.25);

  // Soron Giwa, the audience hall, under its green dome; inner rooms either side.
  const hz = -hd + 0.95;
  batter(k, MUD_LIGHT, 0, hz, 0, 1.15, 2.0, 1.3, 1.92, 1.22, MUD_TOP);
  k.post('#e9dcc0', [0, 1.15, hz], 0.56, 0.12, 16);
  k.shape('#2f7d55', DOME(16, low ? 4 : 6), [0, 1.27, hz], [0.52, 0.5, 0.52]);
  k.post(GOLD, [0, 1.75, hz], 0.03, 0.18, 6, 0.3);
  const hf: Face = { o: [0, 0, hz + 0.63], u: [1, 0, 0], n: [0, 0, 1] };
  fArchDoor(k, hf, DOORWAY, 0.17, 0.45, 0.72, N, 0.01);
  fArchBand(k, hf, RELIEF, 0.17, 0.45, 0.72, 0.045, N, 0.012);
  for (const s of [-1, 1]) {
    fKnot(k, hf, RELIEF, s * 0.55, 0.75, 0.1);
    k.box(`glass${s > 0 ? 1 : 0}`, [s * 0.8, 0.62, hz + 0.635], [0.1, 0.18, 0.02]);
    for (const sz of [-1, 1]) zanko(k, s * 0.88, 1.15, hz + sz * 0.53, 0.32);
  }
  // West: the council chamber; east: the stables.
  batter(k, MUD, -hw + 0.75, -0.25, 0, 0.9, 1.15, 1.6, 1.1, 1.55, MUD_TOP);
  for (const sz of [-1, 1]) zanko(k, -hw + 1.25, 0.9, -0.25 + sz * 0.7, 0.28);
  for (let j = 0; j < 3; j++) k.box(`glass${j % 2}`, [-hw + 1.335, 0.55, -0.85 + j * 0.45], [0.02, 0.16, 0.09]);
  const sx0 = hw - 0.62;
  k.box(MUD_B, [sx0 + 0.25, 0.32, -0.3], [0.32, 0.64, 1.7]);
  k.box(ZINC, [sx0, 0.68, -0.3], [0.85, 0.04, 1.8], [0, 0, 0.12]);
  for (const z of [-1.05, -0.3, 0.45]) k.post(WOOD, [sx0 - 0.36, 0, z], 0.025, 0.62, 5);
  // Neem trees in the courtyard.
  tree(k, -hw + 0.55, hd - 0.75, 0.75, low, LEAF[1]);
  if (!low) tree(k, hw - 0.6, hd - 0.75, 0.6, low, LEAF[2]);
  // The Emir's flag over the gatehouse.
  flag(k, 0.75, gz - 0.2, 2.55, [RELIEF_GREEN, RELIEF_GREEN, RELIEF_GREEN]);

  if (!low) {
    // Horses in their caparisons, two by the stables and two ridden up the path with their riders in white.
    const horse = (x: number, z: number, yaw: number, coat: string, cloth: string, rider?: string) => {
      const f = frame([x, 0, z], [0, yaw, 0]);
      const old = k.f;
      k.f = f;
      k.box(coat, [0, 0.19, 0], [0.09, 0.09, 0.26]);
      k.box(cloth, [0, 0.2, -0.01], [0.1, 0.07, 0.17]);
      k.box(coat, [0, 0.27, 0.12], [0.06, 0.12, 0.06], [-0.5, 0, 0]);
      k.box(coat, [0, 0.33, 0.17], [0.05, 0.05, 0.1]);
      for (const lx of [-0.03, 0.03]) for (const lz of [-0.1, 0.1]) k.box(coat, [lx, 0.075, lz], [0.025, 0.15, 0.025]);
      k.box(DARK, [0, 0.19, -0.14], [0.02, 0.1, 0.03], [0.4, 0, 0]);
      if (rider) {
        k.box(rider, [0, 0.31, -0.02], [0.08, 0.13, 0.07]);
        k.box(SKIN[0], [0, 0.4, -0.02], [0.05, 0.05, 0.05]);
        k.box(WHITE, [0, 0.44, -0.02], [0.065, 0.04, 0.065]);
      }
      k.f = old;
    };
    horse(-0.55, 1.0, 0.1, '#7c2d12', '#dc2626', WHITE);
    horse(0.55, 0.75, -0.2, '#e7e5e4', NG_GREEN, '#fde68a');
    horse(sx0 - 0.05, -0.75, Math.PI / 2, '#3f2a1c', '#facc15');
    horse(sx0 - 0.05, 0.05, Math.PI / 2, '#a16207', '#2563eb');
    // Dogarai: the guards in red and green, at the gate and the hall door.
    for (const s of [-1, 1]) {
      person(k, s * 0.42, hd + 0.3, '#b91c1c', { cap: NG_GREEN });
      person(k, s * 0.32, hz + 0.78, '#b91c1c', { cap: NG_GREEN });
    }
    for (let i = 0; i < 4; i++) person(k, (rand() - 0.5) * 1.6, -0.2 + rand() * 0.6, ROBES[Math.floor(rand() * ROBES.length)], { cap: RELIEF });
  }
  return k.done();
}

/* ---------- Kano: Dala Hill ---------- */

// Dala Hill, where Kano began: a rocky laterite hill, rust red and scrubby green, granite boulders on its flanks, the
// long stair winding up its face to the lookout on top with its shelter, mast and flag.
function buildDala(w: number, d: number, low: boolean) {
  const k = new Pen();
  const rand = rng(Math.round(w * 71 + d * 29));
  k.flat('#cdaa76', -w / 2, -d / 2, w / 2, d / 2, 0.012);
  const wob = (th: number) => 1 + 0.07 * Math.sin(3 * th + 1.3) + 0.05 * Math.sin(5 * th + 0.4) + 0.03 * Math.sin(8 * th + 2);
  const cz = -0.15;
  const A = (w / 2 - 0.06) / 1.15, Bz = (d / 2 - 0.06 - Math.abs(cz)) / 1.15;
  const Hh = 2.5, rTop = 0.2;
  const prof = (r: number) => (r >= 1 ? 0 : Hh * Math.pow(1 - r * r, 0.8));
  const yTop = prof(rTop);
  const pt = (th: number, r: number): V3 => [Math.cos(th) * A * wob(th) * r, r <= rTop + 1e-6 ? yTop : prof(r), cz + Math.sin(th) * Bz * wob(th) * r];
  const heightAt = (x: number, z: number) => {
    const th = Math.atan2((z - cz) / Bz, x / A);
    const r = Math.hypot(x / A, (z - cz) / Bz) / wob(th);
    return r <= rTop ? yTop : prof(r);
  };
  const S = low ? 14 : 24, L = low ? 4 : 6;
  const rings: V3[][] = [];
  for (let j = 0; j <= L; j++) {
    const r = 1 - (j * (1 - rTop)) / L;
    rings.push(Array.from({ length: S }, (_, i) => {
      const p = pt((i / S) * Math.PI * 2, r);
      if (j > 0 && j < L) p[1] += (rand() - 0.5) * 0.12;
      return p;
    }));
  }
  // Scrub at the foot, red laterite up the flanks, bare grey-brown rock near the top.
  const BANDS = [['#7d8f45', '#8a8048', '#7d8f45'], ['#9c6a3e', '#7d8f45', '#a8623a'], ['#a8623a', '#b56d42', '#a8623a'], ['#b56d42', '#a8623a', '#9c5a36'], ['#9c5a36', '#8c6a52', '#a8623a'], ['#8c6a52', '#9c7a5e', '#8c6a52']];
  for (let j = 0; j < L; j++) {
    const band = BANDS[Math.min(BANDS.length - 1, Math.floor((j / L) * BANDS.length))];
    for (let i = 0; i < S; i++) {
      const a0 = rings[j][i], a1 = rings[j][(i + 1) % S], b1 = rings[j + 1][(i + 1) % S], b0 = rings[j + 1][i];
      const r = rand();
      const key = band[r < 0.6 ? 0 : r < 0.85 ? 1 : 2];
      k.quad(key, a0, a1, b1, b0, [a0[0], 0.6, a0[2] - cz]);
    }
  }
  for (let i = 0; i < S; i++) k.tri('#b8875a', [0, yTop, cz], rings[L][i], rings[L][(i + 1) % S], [0, 1, 0]);
  // Granite boulders on the flanks, kept off the stair.
  const nb = low ? 5 : 12;
  for (let i = 0; i < nb; i++) {
    const th = rand() * Math.PI * 2;
    if (Math.abs(Math.sin(th) - 1) < 0.25) continue;
    const r = 0.35 + rand() * 0.55;
    const p = pt(th, r);
    const s = 0.14 + rand() * 0.22;
    k.shape(rand() < 0.5 ? '#8f7a68' : '#9c6b4f', LUMP(0), [p[0], p[1] + s * 0.25, p[2]], [s, s * 0.7, s * 0.85], [rand(), rand() * 3, 0]);
  }
  // The stair: up the face from the street, doubling back twice to the top.
  const way = [[Math.PI / 2 + 0.12, 1.02], [Math.PI / 2 + 0.55, 0.7], [Math.PI / 2 - 0.4, 0.44], [Math.PI / 2 + 0.05, rTop + 0.02]].map(([th, r]) => {
    const p = pt(th, r);
    return [p[0], p[2]];
  });
  const stepGap = low ? 0.2 : 0.13;
  const stairPts: V3[] = [];
  for (let s = 0; s < way.length - 1; s++) {
    const [x0, z0] = way[s], [x1, z1] = way[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / stepGap));
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const y = heightAt(x, z);
      k.box(i % 2 ? '#e2d3b0' : '#d5c39c', [x, y - 0.06, z], [0.3, 0.2, stepGap + 0.01], [0, yaw, 0]);
      stairPts.push([x, y + 0.04, z]);
    }
  }
  // The lookout: a paved top with a low wall, a shelter, a mast and the flag.
  k.post(PAVING, [0, yTop, cz], 0.5, 0.05, 10);
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    if (Math.abs(t - Math.PI / 2) < 0.4) continue;
    k.box(PAVING_DARK, [Math.cos(t) * 0.48, yTop + 0.1, cz + Math.sin(t) * 0.48], [0.2, 0.12, 0.05], [0, -t + Math.PI / 2, 0]);
  }
  const sx = -0.18, sz = cz - 0.15;
  for (const ox of [-0.16, 0.16]) for (const oz of [-0.14, 0.14]) k.post(WOOD, [sx + ox, yTop + 0.05, sz + oz], 0.018, 0.34, 4);
  k.post(ZINC, [sx, yTop + 0.39, sz], 0.32, 0.12, 4, 0.05);
  k.post(STEEL, [0.25, yTop + 0.05, cz - 0.2], 0.02, 1.0, 4, 0.5);
  k.box('lamp2', [0.25, yTop + 1.06, cz - 0.2], [0.05, 0.05, 0.05]);
  flag(k, 0.2, cz + 0.25, yTop + 0.75);
  groundPool(k, 0, cz, 0.55, 0.3, yTop + 0.08);
  k.glow.tri([0.22, yTop + 1.1, cz - 0.2], [0.28, yTop + 1.1, cz - 0.2], [0.25, yTop + 1.15, cz - 0.2], [1, 0.1, 0.05]);
  // Scrub and trees round the foot.
  for (let i = 0; i < (low ? 3 : 7); i++) {
    const th = (i / 7) * Math.PI * 2 + 0.6;
    if (Math.abs(Math.sin(th) - 1) < 0.15) continue;
    const p = pt(th, 0.93);
    tree(k, p[0], p[2], 0.45 + rand() * 0.2, low, '#6f8a3c', p[1] - 0.05);
  }
  if (!low) {
    // Climbers on the stair and sightseers at the top.
    for (const i of [3, 11, 19, 26]) {
      const p = stairPts[Math.min(stairPts.length - 1, i)];
      if (p) person(k, p[0] + 0.05, p[2], ROBES[i % ROBES.length], { y: p[1] - 0.04 });
    }
    person(k, -0.3, cz + 0.32, '#1d4ed8', { y: yTop + 0.05 });
    person(k, 0.05, cz + 0.36, '#f8fafc', { y: yTop + 0.05, cap: RELIEF });
  }
  return k.done();
}

/* ---------- Kano: the Kofar Mata dye pits ---------- */

// The dye pits at Kofar Mata, five hundred years old: rows of round pits sunk in a sandy yard, each a cement rim round
// a well of indigo (some frothing coppery blue), dyers kneeling at them; behind, lines of fresh cloth drying in every
// shade of indigo, more spread on the ground, and a mat shade where the cloth is beaten to a shine beside the clay pots.
function buildDyePits(w: number, d: number, low: boolean) {
  const k = new Pen();
  const rand = rng(Math.round(w * 37 + d * 19));
  k.flat(SAND, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  // A low mud wall along the back and the west side.
  batter(k, MUD, 0, -d / 2 + 0.1, 0, 0.42, w - 0.04, 0.16, w - 0.04, 0.1, MUD_TOP);
  batter(k, MUD, -w / 2 + 0.1, 0, 0, 0.42, 0.16, d - 0.04, 0.1, d - 0.04, MUD_TOP);
  const INDIGO = ['#1e2a6e', '#16205a', '#24357f', '#1a1f4f'];
  // The pits.
  const shadeW = 1.2;
  const px0 = -w / 2 + 0.55, px1 = w / 2 - shadeW - 0.35;
  const cols = low ? 4 : 5, rows = low ? 2 : 3;
  const pz0 = -0.35, pz1 = d / 2 - 0.4;
  const pits: V3[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = px0 + ((px1 - px0) * c) / (cols - 1) + (r % 2 ? 0.12 : 0);
      const z = pz0 + ((pz1 - pz0) * r) / Math.max(1, rows - 1);
      pits.push([x, 0, z]);
      k.post('#8d8577', [x, 0, z], 0.24, 0.07, low ? 8 : 12);
      k.post(INDIGO[Math.floor(rand() * INDIGO.length)], [x, 0, z], 0.18, 0.075, low ? 8 : 12);
      if (!low && rand() < 0.4) k.post('#5f72b8', [x + 0.04, 0, z - 0.03], 0.07, 0.078, 6);
    }
  }
  // Drying lines along the back, hung with cloth.
  const CLOTH = ['#1e3a8a', '#172554', '#2b3a9a', '#3b5bc4', '#1e1b4b', '#4c1d95', '#0f172a'];
  const lines = low ? [-d / 2 + 0.45] : [-d / 2 + 0.42, -d / 2 + 0.85];
  for (const lz of lines) {
    const x0 = -w / 2 + 0.3, x1 = w / 2 - 0.3;
    for (const x of [x0, x1]) k.post(WOOD, [x, 0, lz], 0.03, 1.0, 5);
    k.box(DARK, [(x0 + x1) / 2, 0.98, lz], [x1 - x0, 0.012, 0.012]);
    const n = Math.floor((x1 - x0 - 0.1) / 0.36);
    for (let i = 0; i < n; i++) {
      const x = x0 + 0.2 + i * 0.36;
      const h = 0.4 + rand() * 0.28;
      const c = CLOTH[Math.floor(rand() * CLOTH.length)];
      k.box(c, [x, 0.98 - h / 2, lz], [0.3, h, 0.015]);
      // Some are striped: white bands left by the tie.
      if (!low && rand() < 0.35) for (const f of [0.3, 0.65]) k.box('#dbeafe', [x, 0.98 - h * f, lz], [0.3, 0.025, 0.02]);
    }
  }
  // Cloth spread on the ground to dry, by the pits.
  if (!low) {
    for (let i = 0; i < 4; i++) {
      const x = px0 + i * 0.55 - 0.1, z = d / 2 - 0.15;
      k.flat(CLOTH[(i * 3) % CLOTH.length], x - 0.2, z - 0.1, x + 0.2, z + 0.1, 0.016 + i * 0.001);
    }
  }
  // The mat shade, the clay pots under it and the log where cloth is beaten.
  const sx = w / 2 - shadeW / 2 - 0.15, sz = 0.1;
  for (const ox of [-1, 1]) for (const oz of [-1, 1]) k.post(WOOD, [sx + ox * (shadeW / 2 - 0.1), 0, sz + oz * 0.55], 0.03, 0.62, 5);
  k.box('#b09252', [sx, 0.64, sz], [shadeW, 0.05, 1.3], [0.06, 0, 0]);
  if (!low) for (let i = 0; i < 6; i++) k.box(i % 2 ? '#9a7c40' : '#c2a462', [sx - shadeW / 2 + 0.1 + i * 0.2, 0.675, sz], [0.1, 0.012, 1.3], [0.06, 0, 0]);
  for (let i = 0; i < (low ? 2 : 5); i++) {
    const x = sx - 0.4 + (i % 3) * 0.28, z = sz - 0.35 + Math.floor(i / 3) * 0.3;
    k.post('#9a4f2a', [x, 0, z], 0.1, 0.12, 8, 1.2);
    k.post('#9a4f2a', [x, 0.12, z], 0.12, 0.08, 8, 0.6);
  }
  k.box(WOOD_LIGHT, [sx + 0.15, 0.06, sz + 0.35], [0.7, 0.1, 0.12]);
  k.box('lamp1', [sx, 0.6, sz], [0.06, 0.05, 0.06]);
  groundPool(k, sx, sz, 0.7, 0.25);
  if (!low) {
    // Dyers at the pits, cloth in hand, and two beating cloth at the log.
    for (let i = 0; i < pits.length; i += 3) {
      const p = pits[i];
      person(k, p[0] + 0.28, p[2], ROBES[(i + 2) % ROBES.length], { sit: true, head: SKIN[i % 3], cap: RELIEF });
      k.bar('#1e3a8a', [p[0] + 0.22, 0.12, p[2]], [p[0] + 0.05, 0.05, p[2]], 0.04);
    }
    for (const ox of [-0.12, 0.35]) person(k, sx + ox, sz + 0.55, ox < 0 ? '#f8fafc' : '#0f766e', { sit: true, cap: RELIEF });
    person(k, px0 + 0.3, -d / 2 + 0.62, '#7c3aed', { head: SKIN[1] });
  }
  return k.done();
}

/* ---------- Kano: the groundnut pyramids ---------- */

// The groundnut pyramids of the 1960s: sacks of nuts stacked into stepped pyramids taller than the houses, waiting on
// the railway siding for the goods train south. Each course of sacks shows as a row of bulging sacks on its riser;
// a lorry is unloading, porters climb with sacks on their heads, a weighing shed keeps the count.
function buildPyramids(w: number, d: number, low: boolean) {
  const k = new Pen();
  const rand = rng(Math.round(w * 43 + d * 23));
  k.flat('#d6ba8a', -w / 2, -d / 2, w / 2, d / 2, 0.012);
  const SACK = ['#d9bd86', '#cbaa70', '#e2c995', '#c49d63'];
  const SEAM = '#a8834f';
  // The railway siding along the back, a goods wagon on it.
  const rz = -d / 2 + 0.28;
  k.flat('#8b8378', -w / 2, rz - 0.2, w / 2, rz + 0.2, 0.016);
  if (!low) for (let x = -w / 2 + 0.1; x < w / 2; x += 0.22) k.box(WOOD, [x, 0.03, rz], [0.06, 0.03, 0.34]);
  for (const s of [-1, 1]) k.box(STEEL, [0, 0.055, rz + s * 0.11], [w, 0.03, 0.025]);
  k.box('#7f1d1d', [w / 2 - 0.9, 0.3, rz], [1.2, 0.4, 0.42]);
  k.box(DARK, [w / 2 - 0.9, 0.08, rz], [1.0, 0.1, 0.3]);
  k.box(SACK[0], [w / 2 - 0.9, 0.52, rz], [1.1, 0.06, 0.36]);
  const spots: [number, number, number, number][] = [[-w * 0.31, 0.12, 0.8, 1.7], [0, 0.32, 0.95, 2.1], [w * 0.31, 0.08, 0.75, 1.55]];
  for (const [cx, cz, b, H] of spots) {
    const n = low ? 6 : 10;
    const lh = H / n;
    const top = 0.14;
    for (let i = 0; i < n; i++) {
      const s = b - ((b - top) * i) / n;
      const y0 = i * lh, y1 = y0 + lh;
      // The course's top, then its four risers made of sacks.
      k.flat(SACK[i % 2 ? 1 : 2], cx - s, cz - s, cx + s, cz + s, y1);
      const sides: [V3, V3, V3][] = [
        [[cx - s, 0, cz + s], [cx + s, 0, cz + s], [0, 0, 1]],
        [[cx + s, 0, cz - s], [cx - s, 0, cz - s], [0, 0, -1]],
        [[cx + s, 0, cz + s], [cx + s, 0, cz - s], [1, 0, 0]],
        [[cx - s, 0, cz - s], [cx - s, 0, cz + s], [-1, 0, 0]],
      ];
      for (const [p, q, out] of sides) {
        const m = low ? 1 : Math.max(2, Math.round((s * 2) / 0.17));
        for (let j = 0; j < m; j++) {
          const f0 = j / m, f1 = (j + 1) / m;
          const lerp = (f: number, y: number): V3 => [p[0] + (q[0] - p[0]) * f, y, p[2] + (q[2] - p[2]) * f];
          const key = low ? SACK[i % 4] : SACK[Math.floor(rand() * 4)];
          // A sack bulges: its middle stands proud of the course.
          const bulge = low ? 0 : 0.025;
          const mid = (f: number): V3 => {
            const v = lerp(f, (y0 + y1) / 2);
            return [v[0] + out[0] * bulge, v[1], v[2] + out[2] * bulge];
          };
          k.quad(key, lerp(f0, y0), lerp(f1, y0), mid(f1), mid(f0), out);
          k.quad(key, mid(f0), mid(f1), lerp(f1, y1), lerp(f0, y1), out);
        }
        if (!low) k.quad(SEAM, lerp0(p, q, 0, y0 + 0.004, out), lerp0(p, q, 1, y0 + 0.004, out), lerp0(p, q, 1, y0 + 0.016, out), lerp0(p, q, 0, y0 + 0.016, out), out);
      }
    }
    // A tarpaulin over the top course, weighted with a sack.
    k.box('#1d4ed8', [cx, H + 0.02, cz], [top * 2 + 0.06, 0.04, top * 2 + 0.06]);
  }
  // The weighing shed at the front corner: a zinc roof on posts, the scale and the clerk's table.
  const wx = -w / 2 + 0.55, wz = d / 2 - 0.45;
  for (const ox of [-0.35, 0.35]) for (const oz of [-0.25, 0.25]) k.post(WOOD, [wx + ox, 0, wz + oz], 0.025, 0.55, 5);
  k.box(ZINC, [wx, 0.58, wz], [0.86, 0.04, 0.66], [0.08, 0, 0]);
  k.box(DARK, [wx - 0.12, 0.1, wz], [0.22, 0.2, 0.18]);
  k.box(WOOD_LIGHT, [wx + 0.18, 0.16, wz], [0.26, 0.04, 0.2]);
  k.box('lamp0', [wx, 0.54, wz], [0.06, 0.04, 0.06]);
  groundPool(k, wx, wz, 0.55, 0.22);
  // Loose sacks waiting to be stacked.
  for (let i = 0; i < (low ? 2 : 6); i++) k.box(SACK[i % 4], [0.4 + (i % 3) * 0.3, 0.08 + Math.floor(i / 3) * 0.13, d / 2 - 0.3], [0.26, 0.13, 0.17]);
  if (!low) {
    // The lorry being unloaded, and porters carrying sacks on their heads.
    const lx = w / 2 - 0.6, lz = d / 2 - 0.55;
    k.box('#1d4ed8', [lx, 0.2, lz + 0.42], [0.36, 0.3, 0.26]);
    k.box(DARK, [lx, 0.27, lz + 0.555], [0.3, 0.1, 0.01]);
    k.box(WOOD_LIGHT, [lx, 0.22, lz - 0.1], [0.4, 0.2, 0.8]);
    k.box(SACK[1], [lx, 0.36, lz - 0.1], [0.36, 0.1, 0.74]);
    for (const dz of [-0.35, 0.05, 0.42]) k.box(DARK, [lx, 0.06, lz + dz], [0.42, 0.11, 0.11]);
    const porters: [number, number, number][] = [[w * 0.18, d / 2 - 0.55, 0], [w * 0.1, d / 2 - 0.85, 0], [-0.4, 0.32 + 0.95 + 0.1, 0.42], [w * 0.31 - 0.2, 0.9, 0.31]];
    porters.forEach(([x, z, y], i) => {
      person(k, x, z, ROBES[(i * 3) % ROBES.length], { y, head: SKIN[i % 3] });
      k.box(SACK[0], [x, y + 0.27, z], [0.13, 0.06, 0.09]);
    });
  }
  return k.done();
}
/** A point along the foot of one riser, `f` of the way from p to q, lifted a hair off it. */
function lerp0(p: V3, q: V3, f: number, y: number, out: V3): V3 {
  return [p[0] + (q[0] - p[0]) * f + out[0] * 0.003, y, p[2] + (q[2] - p[2]) * f + out[2] * 0.003];
}

/* ---------- Lagos: the National Theatre, Iganmu ---------- */

// The National Theatre: a round drum ringed with white fins and a band of glass, under the famous roof shaped like a
// general's cap, its wide brim and its crown folded into pleats. A canopied entrance with the name over it faces the
// plaza, flags along the approach, lamps round the forecourt, and the facade washed in light after dark.
function buildNationalTheatre(w: number, d: number, low: boolean) {
  const k = new Pen();
  const rand = rng(Math.round(w * 19 + d * 5));
  const R = Math.min(w, d) / 2 - 0.12;
  const rd = R * 0.68, rc = rd * 0.62;
  const N = low ? 16 : 24;
  k.flat(LAWN, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  ring(k, PAVING, 0, 0, 0, R + 0.05, 0.02, N);
  ring(k, PAVING_DARK, 0, 0, R - 0.08, R + 0.05, 0.022, N);
  k.flat(PAVING, -0.6, R - 0.2, 0.6, d / 2, 0.021);
  k.post(CONCRETE, [0, 0, 0], rd + 0.22, 0.1, N);
  // The drum: a plinth, the glass band between white fins, a concrete band to the brim.
  const at = (t: number, r: number, y: number): V3 => [Math.cos(t) * r, y, Math.sin(t) * r];
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
    const out = at((t0 + t1) / 2, 1, 0);
    k.quad('#d9d6cf', at(t0, rd, 0.1), at(t1, rd, 0.1), at(t1, rd, 0.32), at(t0, rd, 0.32), out);
    k.quad(`glass${i % 4}`, at(t0, rd, 0.32), at(t1, rd, 0.32), at(t1, rd, 0.8), at(t0, rd, 0.8), out);
    k.quad('#ecebe6', at(t0, rd, 0.8), at(t1, rd, 0.8), at(t1, rd, 1.12), at(t0, rd, 1.12), out);
    if (!low || i % 2 === 0) {
      const p = at(t0, rd + 0.04, 0);
      k.box(WHITE, [p[0], 0.62, p[2]], [0.06, 1.04, 0.1], [0, -t0, 0]);
    }
  }
  // The brim: pleated, sloping down and out from the drum, its folds alternately catching the light.
  const P = N * 2;
  const brim = (i: number): V3 => {
    const t = (i / P) * Math.PI * 2;
    // The front of the brim reaches a little further, like a cap's peak.
    const peak = 1 + 0.1 * Math.max(0, Math.sin(t)) ** 3;
    return at(t, (i % 2 ? R - 0.2 : R) * peak, i % 2 ? 1.06 : 0.98);
  };
  const inner = (i: number, r: number, y: number) => at((i / P) * Math.PI * 2, r, y);
  for (let i = 0; i < P; i++) {
    const o0 = brim(i), o1 = brim(i + 1);
    const i0 = inner(i, rd - 0.02, 1.24), i1 = inner(i + 1, rd - 0.02, 1.24);
    k.quad(i % 2 ? '#d7dbe0' : '#f1f3f5', i0, i1, o1, o0, [0, 1, 0]);
    k.quad('#8f98a3', [o0[0], o0[1] - 0.07, o0[2]], [o1[0], o1[1] - 0.07, o1[2]], o1, o0, [o0[0], 0, o0[2]]);
    k.quad('#b8c0c9', inner(i, rd, 1.1), inner(i + 1, rd, 1.1), [o1[0], o1[1] - 0.07, o1[2]], [o0[0], o0[1] - 0.07, o0[2]], [0, -1, 0]);
    // The crown: pleated too, rising to the flat top.
    const c0 = inner(i, i % 2 ? rc - 0.08 : rc, 1.82), c1 = inner(i + 1, (i + 1) % 2 ? rc - 0.08 : rc, 1.82);
    k.quad(i % 2 ? '#c6ccd3' : '#e6e9ec', i0, i1, c1, c0, [i0[0], 0.6, i0[2]]);
    k.tri('#dfe3e7', [0, 1.82, 0], c0, c1, [0, 1, 0]);
  }
  k.post('#9aa3ad', [0, 1.82, 0], rc * 0.42, 0.14, N);
  k.post('#7b8590', [0, 1.96, 0], rc * 0.44, 0.03, N);
  // The entrance: a canopy on columns, the glass doors, the name over it, steps down to the plaza.
  const ez = rd + 0.2;
  k.box('#ecebe6', [0, 0.45, ez - 0.05], [1.2, 0.7, 0.4]);
  k.box('glass0', [0, 0.36, ez + 0.16], [0.9, 0.42, 0.02]);
  k.box(WHITE, [0, 0.86, ez + 0.12], [1.5, 0.06, 0.6]);
  for (const x of [-0.65, -0.22, 0.22, 0.65]) k.post(WHITE, [x, 0.1, ez + 0.36], 0.03, 0.73, 8);
  k.box(DARK, [0, 0.98, ez + 0.4], [1.3, 0.16, 0.03]);
  for (let i = 0; i < 9; i++) k.box('#facc15', [-0.56 + i * 0.14, 0.98, ez + 0.418], [0.08, 0.09, 0.01]);
  k.gquad([-0.62, 0.92, ez + 0.43], [0.62, 0.92, ez + 0.43], [0.62, 1.04, ez + 0.43], [-0.62, 1.04, ez + 0.43], [0.6, 0.5, 0.15]);
  for (let s = 0; s < 3; s++) k.box(CONCRETE, [0, 0.03 + s * 0.03, ez + 0.48 + (2 - s) * 0.08], [1.4 - s * 0.1, 0.06, 0.1]);
  // Flags along the approach, lamps round the plaza.
  for (const s of [-1, 1]) for (let i = 0; i < (low ? 1 : 3); i++) flag(k, s * (0.85 + i * 0.32), d / 2 - 0.3 - i * 0.12, 1.25);
  const lamps = low ? 4 : 8;
  for (let i = 0; i < lamps; i++) {
    const t = ((i + 0.5) / lamps) * Math.PI * 2;
    if (Math.abs(Math.sin(t) - 1) < 0.15) continue;
    const p = at(t, R - 0.02, 0);
    lampPost(k, p[0], p[2], 0.7, i);
  }
  // The facade washed in light under the brim after dark.
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
    k.gquad(at(t0, rd + 0.05, 0.1), at(t1, rd + 0.05, 0.1), at(t1, rd + 0.05, 1.05), at(t0, rd + 0.05, 1.05), scale(WARM, 0.3), scale(WARM, 0.3), [0, 0, 0], [0, 0, 0]);
  }
  if (!low) for (let i = 0; i < 12; i++) person(k, (rand() - 0.5) * 2.2, R - 0.25 + rand() * (d / 2 - R + 0.1), ROBES[Math.floor(rand() * ROBES.length)], { head: SKIN[i % 3] });
  return k.done();
}

/* ---------- Lugard Hall and the Houses of Assembly ---------- */

// Lugard Hall, Kaduna: the colonial assembly hall of the old Northern Region. A cream rotunda under a green copper dome
// with its lantern, wings either side under red tiled hipped roofs with arcaded verandahs, a pedimented portico on
// white columns at the top of the steps, and a lawn with a hedged path, flagpoles and lamps out front.
function buildLugard(w: number, d: number, low: boolean) {
  const k = new Pen();
  const WALL = '#efe4cc', TRIM = '#fbf8f1', TILE = '#a4452c', TILE_D = '#7f3220';
  k.flat(LAWN, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  const z0 = -d / 2 + 0.3, z1 = d / 2 - 1.25;
  const bd = z1 - z0, bz = (z0 + z1) / 2;
  const ww = w / 2 - 0.3;
  // The path up to the portico, edged with hedges and lamps; flower beds.
  k.flat(PAVING, -0.45, z1, 0.45, d / 2, 0.016);
  k.flat(PAVING_DARK, -ww, z1 + 0.05, ww, z1 + 0.3, 0.015);
  for (const s of [-1, 1]) {
    k.box(HEDGE, [s * 0.6, 0.08, (z1 + 0.3 + d / 2) / 2], [0.14, 0.16, d / 2 - z1 - 0.35]);
    k.box(HEDGE, [s * (ww - 0.05), 0.08, (z1 + 0.3 + d / 2) / 2], [0.14, 0.16, d / 2 - z1 - 0.35]);
    if (!low) for (let i = 0; i < 4; i++) k.box(i % 2 ? '#dc2626' : '#facc15', [s * (1.0 + i * 0.35), 0.05, d / 2 - 0.55], [0.18, 0.08, 0.18]);
    lampPost(k, s * 0.55, d / 2 - 0.2, 0.75, s > 0 ? 1 : 0);
    if (!low) lampPost(k, s * 0.55, z1 + 0.55, 0.75, s > 0 ? 3 : 2);
  }
  // The wings.
  const wingW = ww - 0.95;
  for (const s of [-1, 1]) {
    const cx = s * (0.95 + wingW / 2);
    k.box(WALL, [cx, 0.55, bz], [wingW, 1.1, bd]);
    k.box(TRIM, [cx, 1.12, bz], [wingW + 0.08, 0.06, bd + 0.08]);
    hipRoof(k, TILE, cx, bz, wingW + 0.24, bd + 0.24, 1.15, 0.5, TILE_D);
    // The verandah: an arcade of arches along the front.
    const nA = Math.max(3, Math.round(wingW / 0.38));
    const zf = z1 + 0.22;
    k.box(TRIM, [cx, 0.86, zf], [wingW, 0.12, 0.06]);
    k.box('#d6c9ad', [cx, 0.03, z1 + 0.11], [wingW, 0.06, 0.24]);
    k.box(TILE, [cx, 0.95, z1 + 0.12], [wingW + 0.06, 0.04, 0.3], [0.25, 0, 0]);
    for (let i = 0; i <= nA; i++) {
      const x = cx - wingW / 2 + (i * wingW) / nA;
      k.box(TRIM, [x, 0.42, zf], [0.07, 0.84, 0.07]);
      if (i < nA) {
        const xm = x + wingW / nA / 2;
        k.box(`glass${i % 3}`, [xm, 0.42, z1 + 0.005], [wingW / nA - 0.16, 0.5, 0.02]);
        k.box(TRIM, [xm, 0.7, z1 + 0.012], [wingW / nA - 0.1, 0.05, 0.02]);
      }
    }
    // Windows down the sides.
    for (let i = 0; i < 3; i++) k.box(`glass${i}`, [s * ww + s * 0.005, 0.55, z0 + 0.4 + i * (bd - 0.8) / 2], [0.02, 0.42, 0.22]);
  }
  // The rotunda: a square hall rising to a drum of windows, the dome, its lantern and finial.
  const rz = bz - 0.1;
  k.box(WALL, [0, 0.75, rz], [1.9, 1.5, bd + 0.1]);
  k.box(TRIM, [0, 1.52, rz], [2.0, 0.07, bd + 0.2]);
  hipRoof(k, TILE, 0, rz, 2.1, bd + 0.3, 1.55, 0.4, TILE_D);
  const rr = 0.78;
  const seg = low ? 12 : 16;
  k.post(WALL, [0, 1.55, rz], rr, 0.68, seg);
  k.post(TRIM, [0, 2.2, rz], rr + 0.05, 0.06, seg);
  for (let i = 0; i < seg; i += 2) {
    const t = (i / seg) * Math.PI * 2 + Math.PI / seg;
    k.box(`glass${i % 4}`, [Math.cos(t) * (rr + 0.005), 2.0, rz + Math.sin(t) * (rr + 0.005)], [0.02, 0.22, 0.14], [0, -t, 0]);
  }
  k.shape('#3f7f6a', DOME(seg, low ? 5 : 7), [0, 2.26, rz], [rr, rr * 0.92, rr]);
  k.post(TRIM, [0, 2.93, rz], 0.14, 0.2, 8);
  k.shape('#3f7f6a', DOME(8, 3), [0, 3.13, rz], [0.15, 0.12, 0.15]);
  k.post(GOLD, [0, 3.23, rz], 0.025, 0.22, 5, 0.3);
  // The portico: white columns, the entablature and a pediment with the arms in it, the steps.
  const pz = z1 + 0.3;
  const cols = [-0.7, -0.42, -0.14, 0.14, 0.42, 0.7];
  k.box('#e2d8c2', [0, 0.08, pz - 0.1], [1.75, 0.16, 0.7]);
  for (let s = 0; s < 3; s++) k.box('#d6c9ad', [0, 0.025 + s * 0.05, pz + 0.38 - s * 0.08], [1.6, 0.05, 0.12]);
  for (const x of low ? [-0.7, -0.24, 0.24, 0.7] : cols) k.post(WHITE, [x, 0.16, pz + 0.05], 0.055, 1.06, 10);
  k.box(TRIM, [0, 1.28, pz - 0.05], [1.75, 0.16, 0.58]);
  const py = 1.36;
  k.tri(TRIM, [-0.92, py, pz + 0.24], [0.92, py, pz + 0.24], [0, py + 0.42, pz + 0.24], [0, 0, 1]);
  k.quad(TILE, [-0.98, py, pz + 0.27], [0, py + 0.45, pz + 0.27], [0, py + 0.45, pz - 0.34], [-0.98, py, pz - 0.34], [-1, 2, 0]);
  k.quad(TILE, [0.98, py, pz + 0.27], [0.98, py, pz - 0.34], [0, py + 0.45, pz - 0.34], [0, py + 0.45, pz + 0.27], [1, 2, 0]);
  k.box(NG_GREEN, [0, py + 0.15, pz + 0.25], [0.12, 0.14, 0.01]);
  k.box('#b91c1c', [0, py + 0.25, pz + 0.25], [0.08, 0.05, 0.01]);
  k.box(DOORWAY, [0, 0.55, z1 + 0.005], [0.36, 0.78, 0.02]);
  k.box('glass1', [0, 1.05, z1 + 0.01], [0.3, 0.14, 0.02]);
  // Flags either side of the path.
  flag(k, -1.25, d / 2 - 0.85, 1.6);
  flag(k, 1.25, d / 2 - 0.85, 1.6, [NG_GREEN, '#facc15', '#dc2626']);
  const face: Face = { o: [0, 0, pz + 0.3], u: [1, 0, 0], n: [0, 0, 1] };
  fWash(k, face, -0.9, 0.9, 1.7, 0.28);
  if (!low) {
    tree(k, -w / 2 + 0.35, d / 2 - 0.35, 0.6, low);
    tree(k, w / 2 - 0.35, d / 2 - 0.35, 0.6, low, LEAF[2]);
    for (let i = 0; i < 5; i++) person(k, -0.3 + i * 0.16, d / 2 - 0.4 - (i % 2) * 0.4, ROBES[(i * 3 + 1) % ROBES.length], { head: SKIN[i % 3] });
  }
  return k.done();
}

/* ---------- Parade squares: Murtala, Eagle, Tafawa Balewa, the Kofar Kudu durbar ground ---------- */

// A parade ground in the style of Eagle Square: a paved field marked into bays, and along the back the covered
// grandstand in green and white, the coat of arms on its fascia, the VIP box in the middle and the saluting dais in
// front with its red carpet. Tall flagpoles either side, floodlights at the front corners, and contingents drawn up in
// ranks with a band in white.
function buildSquare(w: number, d: number, low: boolean) {
  const k = new Pen();
  const rand = rng(Math.round(w * 29 + d * 13));
  k.flat(GRASS, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  const gx = w / 2 - 0.3, gz0 = -d / 2 + 1.55, gz1 = d / 2 - 0.25;
  k.flat('#d3cdbf', -gx, gz0, gx, gz1, 0.016);
  if (!low) {
    for (let x = -gx + 0.7; x < gx - 0.1; x += 0.7) k.flat('#bfb8a8', x - 0.008, gz0, x + 0.008, gz1, 0.018);
    for (let z = gz0 + 0.7; z < gz1 - 0.1; z += 0.7) k.flat('#bfb8a8', -gx, z - 0.008, gx, z + 0.008, 0.018);
  }
  // The white border line.
  k.flat(WHITE, -gx, gz0, gx, gz0 + 0.03, 0.019);
  k.flat(WHITE, -gx, gz1 - 0.03, gx, gz1, 0.019);
  k.flat(WHITE, -gx, gz0, -gx + 0.03, gz1, 0.019);
  k.flat(WHITE, gx - 0.03, gz0, gx, gz1, 0.019);
  // The grandstand: rows rising to the back, a roof cantilevered over them.
  const sw = w - 1.7;
  const sz0 = -d / 2 + 0.15, sz1 = -d / 2 + 1.3;
  const R = 4;
  const rowD = (sz1 - sz0) / R;
  for (let r = 0; r < R; r++) {
    const z = sz1 - (r + 0.5) * rowD;
    const y = 0.12 + r * 0.14;
    k.box(r % 2 ? WHITE : NG_GREEN, [0, y / 2, z], [sw, y, rowD]);
    k.box(r % 2 ? '#c9ced6' : '#0f5f2d', [0, y - 0.03, z + rowD / 2 + 0.002], [sw, 0.03, 0.005]);
  }
  k.box('#e5e7eb', [0, 0.55, sz0 + 0.03], [sw, 1.1, 0.06]);
  // The VIP box in the middle, glazed.
  k.box('#e5e7eb', [0, 0.45, sz0 + 0.45], [1.0, 0.7, 0.55]);
  k.box('glass0', [0, 0.52, sz0 + 0.73], [0.9, 0.3, 0.02]);
  // The roof: a curved canopy, white over, green under.
  const roofN = low ? 4 : 7;
  const ry = (f: number) => 1.32 + 0.22 * Math.sin(f * Math.PI * 0.8);
  const rz = (f: number) => sz0 - 0.05 + f * (sz1 - sz0 + 0.35);
  for (let i = 0; i < roofN; i++) {
    const f0 = i / roofN, f1 = (i + 1) / roofN;
    k.quad(WHITE, [-sw / 2 - 0.1, ry(f0) + 0.04, rz(f0)], [sw / 2 + 0.1, ry(f0) + 0.04, rz(f0)], [sw / 2 + 0.1, ry(f1) + 0.04, rz(f1)], [-sw / 2 - 0.1, ry(f1) + 0.04, rz(f1)], [0, 1, 0]);
    k.quad(NG_GREEN, [-sw / 2 - 0.1, ry(f0), rz(f0)], [sw / 2 + 0.1, ry(f0), rz(f0)], [sw / 2 + 0.1, ry(f1), rz(f1)], [-sw / 2 - 0.1, ry(f1), rz(f1)], [0, -1, 0]);
  }
  const fz = rz(1);
  k.box(NG_GREEN, [0, ry(1) - 0.02, fz], [sw + 0.22, 0.14, 0.05]);
  // The arms on the fascia: the black shield with its white Y, the red eagle above.
  k.box(DARK, [0, ry(1) - 0.02, fz + 0.03], [0.16, 0.2, 0.02]);
  k.bar(WHITE, [-0.05, ry(1) + 0.05, fz + 0.042], [0, ry(1) - 0.0, fz + 0.042], 0.022);
  k.bar(WHITE, [0.05, ry(1) + 0.05, fz + 0.042], [0, ry(1) - 0.0, fz + 0.042], 0.022);
  k.bar(WHITE, [0, ry(1) - 0.0, fz + 0.042], [0, ry(1) - 0.09, fz + 0.042], 0.022);
  k.box('#b91c1c', [0, ry(1) + 0.13, fz + 0.03], [0.14, 0.06, 0.02]);
  for (const s of [-1, 1]) for (const x of [0.25, 0.5, 0.75, 1]) k.post(STEEL, [s * (sw / 2) * x, 0, sz0 + 0.05], 0.025, ry(0), 5);
  // The saluting dais and its carpet.
  const dz = sz1 + 0.32;
  k.box('#e5e7eb', [0, 0.06, dz], [0.7, 0.12, 0.4]);
  k.box('#b91c1c', [0, 0.125, dz], [0.5, 0.01, 0.3]);
  k.flat('#b91c1c', -0.12, dz + 0.2, 0.12, dz + 0.75, 0.02);
  for (const x of [-0.3, 0.3]) for (const z of [-0.16, 0.16]) k.post(WHITE, [x, 0.12, dz + z], 0.015, 0.45, 5);
  k.box(NG_GREEN, [0, 0.58, dz], [0.72, 0.04, 0.44]);
  // Flagpoles and floodlights.
  for (const s of [-1, 1]) {
    for (let i = 0; i < (low ? 1 : 3); i++) flag(k, s * (sw / 2 + 0.25 + i * 0.22), -d / 2 + 0.3 + i * 0.35, 2.1 - i * 0.2);
    const lx = s * (w / 2 - 0.15), lz = d / 2 - 0.15;
    k.post(STEEL, [lx, 0, lz], 0.03, 1.8, 5, 0.6);
    k.box(DARK, [lx - s * 0.04, 1.8, lz - 0.04], [0.3, 0.16, 0.05], [0.5, -s * 0.7, 0]);
    k.box(`lamp${s > 0 ? 1 : 0}`, [lx - s * 0.06, 1.79, lz - 0.06], [0.26, 0.12, 0.02], [0.5, -s * 0.7, 0]);
  }
  // Floodlight on the parade ground after dark.
  k.gquad([-gx, 0.03, gz0], [gx, 0.03, gz0], [gx, 0.03, gz1], [-gx, 0.03, gz1], scale(WARM, 0.08), scale(WARM, 0.08), scale(WARM, 0.2), scale(WARM, 0.2));
  {
    // Contingents in ranks: army green, police black, navy white, and the band (two small ones in low mode).
    const units = [NG_GREEN, '#111827', WHITE, '#b45309'];
    const n = low ? 2 : Math.min(units.length, Math.max(2, Math.floor((gx * 2 - 0.4) / 1.1)));
    const g = low ? 3 : 4;
    for (let u = 0; u < n; u++) {
      const ux = low ? (u ? 1 : -1) * gx * 0.45 : -gx + 0.55 + u * ((gx * 2 - 1.1) / Math.max(1, n - 1));
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        person(k, ux - ((g - 1) / 2) * 0.16 + c * 0.16, gz0 + 1.0 + r * 0.2, units[u], { cap: units[u] === WHITE ? WHITE : '#7f1d1d', head: SKIN[(r + c) % 3] });
      }
      // The officer in front.
      person(k, ux, gz0 + 0.75, units[u], { cap: '#7f1d1d' });
    }
  }
  if (!low) {
    // Dignitaries in the stand.
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(rand() * R);
      const x = (rand() - 0.5) * (sw - 0.3);
      if (Math.abs(x) < 0.55) continue;
      person(k, x, sz1 - (r + 0.5) * rowD, ROBES[Math.floor(rand() * ROBES.length)], { y: 0.12 + r * 0.14, sit: true });
    }
  }
  return k.done();
}

/* ---------- Abuja: Millennium Tower ---------- */

// Millennium Tower: the needle on Abuja's skyline. A slender white shaft held by three curving spines that spring from
// the plaza and meet it high up, the glass viewing pod near the top, a spire with its red light, the cultural centre's
// low pavilion round the foot, and a paved plaza with radiating paths. Uplit at night.
function buildMillTower(w: number, d: number, low: boolean) {
  const k = new Pen();
  const R = Math.min(w, d) / 2;
  k.flat(LAWN, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  ring(k, PAVING, 0, 0, 0, R - 0.08, 0.02, 24);
  ring(k, PAVING_DARK, 0, 0, R * 0.55, R * 0.62, 0.022, 24);
  k.flat(PAVING, -0.18, 0, 0.18, d / 2, 0.021);
  // The pavilion: three low lobes with a glass band, between the spines.
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2 + Math.PI / 3 + Math.PI / 2;
    const x = Math.cos(t) * 0.55, z = Math.sin(t) * 0.55;
    k.post(WHITE, [x, 0, z], 0.32, 0.12, 10);
    k.post(`glass${i}`, [x, 0.12, z], 0.29, 0.14, 10);
    k.post('#e5e7eb', [x, 0.26, z], 0.34, 0.05, 10);
  }
  const H = 6.0;
  k.post('#f5f5f4', [0, 0, 0], 0.17, H, 6, 0.45);
  // The spines.
  const segs = low ? 4 : 7;
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const p = (f: number): V3 => {
      const r = 0.95 * (1 - f) ** 1.5 + 0.1;
      return [Math.cos(t) * r, f * 4.7, Math.sin(t) * r];
    };
    for (let s = 0; s < segs; s++) k.bar(WHITE, p(s / segs), p((s + 1) / segs), 0.08 - s * 0.006);
    k.box(CONCRETE, [Math.cos(t) * 1.05, 0.06, Math.sin(t) * 1.05], [0.2, 0.12, 0.2]);
    if (!low) {
      // Stays from the shaft out to the spine.
      for (const f of [0.3, 0.55]) k.bar(STEEL, [0, p(f)[1] + 0.6, 0], p(f), 0.012);
    }
  }
  // The pod: a glass drum between two white discs.
  const py = 4.55;
  k.post('#e5e7eb', [0, py - 0.25, 0], 0.5, 0.25, 16, 1.25);
  k.post('glass2', [0, py, 0], 0.6, 0.22, 16);
  k.post(WHITE, [0, py + 0.22, 0], 0.68, 0.06, 16);
  k.post('#cbd5e1', [0, py + 0.28, 0], 0.4, 0.1, 16, 0.6);
  // The spire and its light.
  k.post('#cbd5e1', [0, H, 0], 0.05, 1.3, 6, 0.3);
  k.box('lamp1', [0, H + 1.32, 0], [0.05, 0.05, 0.05]);
  k.glow.quad([-0.08, H + 1.28, 0], [0.08, H + 1.28, 0], [0.08, H + 1.38, 0], [-0.08, H + 1.38, 0], [1, 0.12, 0.08]);
  // Uplight on the shaft and the pod's glow after dark.
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const a: V3 = [Math.cos(t - 0.9) * 0.2, 0.3, Math.sin(t - 0.9) * 0.2], b: V3 = [Math.cos(t + 0.9) * 0.2, 0.3, Math.sin(t + 0.9) * 0.2];
    k.gquad(a, b, [b[0] * 0.5, 4.2, b[2] * 0.5], [a[0] * 0.5, 4.2, a[2] * 0.5], scale([0.8, 0.85, 1], 0.35), scale([0.8, 0.85, 1], 0.35), [0, 0, 0], [0, 0, 0]);
  }
  for (let i = 0; i < 16; i++) {
    const t0 = (i / 16) * Math.PI * 2, t1 = ((i + 1) / 16) * Math.PI * 2;
    const p = (t: number, y: number): V3 => [Math.cos(t) * 0.63, y, Math.sin(t) * 0.63];
    k.gquad(p(t0, py), p(t1, py), p(t1, py + 0.22), p(t0, py + 0.22), scale(WARM, 0.35));
  }
  for (const [x, z] of [[-R + 0.3, R - 0.3], [R - 0.3, R - 0.3], [-R + 0.3, -R + 0.3], [R - 0.3, -R + 0.3]]) {
    if (low) lampPost(k, x, z, 0.6, Math.round(x + z + 4));
    else tree(k, x * 0.95, z * 0.95, 0.5, low);
  }
  return k.done();
}

/* ---------- Museums ---------- */

// A national museum: a sandstone hall with a terracotta frieze (after the Nok figures inside), a portico of columns
// under its name, a glazed lantern lighting the galleries, banners on the wings, and in the forecourt the sculptures:
// a Nok terracotta head, a bronze head in its crown and a standing figure, each on its plinth and spotlit at night.
function buildMuseum(w: number, d: number, low: boolean) {
  const k = new Pen();
  const STONE = '#d8c3a0', STONE_D = '#bfa680', NOK = '#b5562b';
  k.flat(PAVING, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  const bw = w - 0.6, bd = Math.max(1.4, d - 1.45);
  const z0 = -d / 2 + 0.2, zf = z0 + bd, cz = (z0 + zf) / 2;
  const H = 1.25;
  k.box(STONE_D, [0, 0.07, cz], [bw + 0.08, 0.14, bd + 0.08]);
  k.box(STONE, [0, H / 2, cz], [bw, H, bd]);
  // The frieze: a terracotta band with a row of little faces in it.
  k.box(NOK, [0, H - 0.17, cz], [bw + 0.02, 0.14, bd + 0.02]);
  const nm = Math.floor(bw / 0.3);
  if (!low) for (let i = 0; i < nm; i++) k.box('#e9b98b', [-bw / 2 + 0.15 + i * (bw / nm), H - 0.17, zf + 0.012], [0.06, 0.07, 0.01]);
  k.box('#efe6d4', [0, H + 0.03, cz], [bw + 0.12, 0.06, bd + 0.12]);
  // A hipped roof of clay tiles, a glazed strip along its front slope lighting the galleries.
  const rw = bw + 0.2, rdp = bd + 0.2, rh = Math.min(0.5, rdp * 0.22), ry = H + 0.06;
  hipRoof(k, '#9a4a2a', 0, cz, rw, rdp, ry, rh, '#6e3219');
  const ridge = rw - rdp;
  const slope = (x: number, f: number): V3 => [x, ry + rh * f + 0.012, cz + (rdp / 2) * (1 - f)];
  const gl = Math.max(0.6, ridge * 0.8);
  k.quad('glass1', slope(-gl / 2, 0.35), slope(gl / 2, 0.35), slope(gl / 2, 0.78), slope(-gl / 2, 0.78), [0, 1, 1]);
  for (let i = 1; i < 5; i++) {
    const x = -gl / 2 + (i * gl) / 5;
    k.quad('#e5e7eb', slope(x - 0.012, 0.35), slope(x + 0.012, 0.35), slope(x + 0.012, 0.78), slope(x - 0.012, 0.78), [0, 1, 1]);
  }
  // Wings: tall windows and banners.
  const pw = Math.min(1.7, bw * 0.48);
  const wingW = (bw - pw) / 2;
  for (const s of [-1, 1]) {
    const cx = s * (pw / 2 + wingW / 2);
    const nW = Math.max(1, Math.round(wingW / 0.42));
    for (let i = 0; i < nW; i++) {
      const x = cx - wingW / 2 + (i + 0.5) * (wingW / nW);
      k.box(`glass${i % 3}`, [x, 0.6, zf + 0.005], [0.16, 0.55, 0.02]);
      k.box('#efe6d4', [x, 0.31, zf + 0.02], [0.22, 0.04, 0.04]);
    }
    k.box(s > 0 ? '#facc15' : '#b91c1c', [s * (pw / 2 + 0.12), 0.75, zf + 0.03], [0.12, 0.42, 0.01]);
    k.box(DARK, [s * (pw / 2 + 0.12), 0.97, zf + 0.03], [0.16, 0.02, 0.03]);
  }
  // The portico: columns, a deep entablature with the name, the doors, the steps.
  const pd = 0.42, pz = zf + pd / 2;
  k.box(STONE_D, [0, 0.1, pz], [pw + 0.1, 0.2, pd + 0.06]);
  const nc = low ? 4 : pw > 1.4 ? 6 : 4;
  for (let i = 0; i < nc; i++) k.post(WHITE, [-pw / 2 + 0.1 + (i * (pw - 0.2)) / (nc - 1), 0.2, zf + pd - 0.07], 0.045, 0.86, 10);
  k.box('#efe6d4', [0, 1.13, pz], [pw + 0.12, 0.2, pd + 0.06]);
  k.box(DARK, [0, 1.13, zf + pd + 0.04], [pw * 0.8, 0.1, 0.01]);
  const letters = Math.round(pw * 6);
  for (let i = 0; i < letters; i++) k.box(GOLD, [-pw * 0.36 + (i * pw * 0.72) / Math.max(1, letters - 1), 1.13, zf + pd + 0.047], [0.05, 0.07, 0.008]);
  k.box('glass0', [0, 0.52, zf + 0.008], [0.5, 0.62, 0.02]);
  for (let s = 0; s < 2; s++) k.box(STONE_D, [0, 0.03 + s * 0.06, pz + pd / 2 + 0.06 + (1 - s) * 0.08], [pw - 0.1, 0.06, 0.12]);
  // The forecourt and its sculptures.
  const fz = zf + pd + 0.35, fz1 = d / 2 - 0.12;
  const sz = (fz + fz1) / 2 + 0.05;
  k.flat(LAWN, -w / 2 + 0.1, fz - 0.05, -0.4, fz1, 0.014);
  k.flat(LAWN, 0.4, fz - 0.05, w / 2 - 0.1, fz1, 0.014);
  const plinth = (x: number) => {
    k.box('#e7e5e4', [x, 0.16, sz], [0.24, 0.32, 0.24]);
    groundPool(k, x, sz, 0.3, 0.3, 0.02, [1, 0.9, 0.7]);
  };
  // The Nok head: elongated, with the swept-back crest of hair.
  const nx = -Math.min(1.0, w / 2 - 0.45);
  plinth(nx);
  k.shape(NOK, LUMP(1), [nx, 0.47, sz], [0.11, 0.15, 0.1]);
  k.shape('#9a4a24', LUMP(0), [nx, 0.6, sz - 0.03], [0.09, 0.06, 0.09], [0.5, 0, 0]);
  k.box('#5a2a14', [nx, 0.49, sz + 0.095], [0.1, 0.02, 0.01]);
  if (!low) {
    // A bronze head in its beaded crown.
    const bx = -nx;
    plinth(bx);
    k.shape('#6b4f2a', LUMP(1), [bx, 0.46, sz], [0.1, 0.13, 0.1]);
    k.post('#5a4122', [bx, 0.52, sz], 0.09, 0.13, 8, 0.8);
    k.post('#8a6a3a', [bx, 0.3, sz], 0.11, 0.08, 8);
    // A standing figure between them, on a low base by the path.
    const tx = nx * 0.45;
    k.box('#e7e5e4', [tx, 0.04, sz + 0.05], [0.16, 0.08, 0.16]);
    k.post('#57534e', [tx, 0.08, sz + 0.05], 0.035, 0.36, 6, 0.6);
    k.shape('#57534e', LUMP(0), [tx, 0.49, sz + 0.05], [0.045, 0.06, 0.045]);
    for (let i = 0; i < 4; i++) person(k, -0.3 + i * 0.22, fz + (i % 2) * 0.2, ROBES[(i * 2 + 1) % ROBES.length], { head: SKIN[i % 3] });
  }
  for (const s of [-1, 1]) k.box(HEDGE, [s * (w / 2 - 0.12), 0.08, (fz + fz1) / 2], [0.12, 0.16, fz1 - fz]);
  const face: Face = { o: [0, 0, zf + pd + 0.02], u: [1, 0, 0], n: [0, 0, 1] };
  fWash(k, face, -pw / 2, pw / 2, 1.2, 0.25);
  return k.done();
}

/* ---------- The street football pitch ---------- */

// A neighbourhood pitch: red-brown dust worn bare down the middle, tufts of grass holding on at the edges, whitewash
// lines that have seen better days, wooden goalposts with a torn net, and an evening match on: shirts against skins,
// the goalkeepers, the ball, the old men on the bench under the mango tree, and the pure-water seller.
function buildPitch(w: number, d: number, low: boolean) {
  const k = new Pen();
  const rand = rng(Math.round(w * 61 + d * 7));
  k.flat(DUST, -w / 2, -d / 2, w / 2, d / 2, 0.012);
  const px = w / 2 - 0.35, pz = d / 2 - 0.35;
  k.flat('#c39255', -px, -pz, px, pz, 0.014);
  // Grass holding on at the edges, bare down the middle and in the goalmouths.
  const tufts = low ? 10 : 34;
  for (let i = 0; i < tufts; i++) {
    const edge = rand() < 0.5;
    const x = (rand() - 0.5) * 2 * px;
    const z = edge ? (rand() < 0.5 ? -1 : 1) * (pz - rand() * 0.5) : (rand() - 0.5) * 2 * pz;
    if (Math.abs(x) < px * 0.6 && Math.abs(z) < pz * 0.55) continue;
    if (Math.abs(x) > px - 0.5 && Math.abs(z) < 0.5) continue;
    const s = 0.12 + rand() * 0.22;
    k.flat(rand() < 0.5 ? '#8a9a4e' : '#7c8f45', x - s, z - s * 0.6, x + s, z + s * 0.6, 0.016 + rand() * 0.002);
  }
  for (const s of [-1, 1]) k.flat('#ad7d45', s * px - (s > 0 ? 0.6 : -0.0), -0.4, s * px + (s > 0 ? 0 : 0.6), 0.4, 0.017);
  // Lime lines, broken where feet have scuffed them.
  const t = 0.03, ly = 0.019;
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.4));
    for (let i = 0; i < n; i++) {
      if (!low && rand() < 0.12) continue;
      const a = i / n, b = (i + 0.85) / n;
      const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      k.flat('#efe9da', Math.min(ax, bx) - t / 2, Math.min(az, bz) - t / 2, Math.max(ax, bx) + t / 2, Math.max(az, bz) + t / 2, ly);
    }
  };
  line(-px, -pz, px, -pz);
  line(-px, pz, px, pz);
  line(-px, -pz, -px, pz);
  line(px, -pz, px, pz);
  line(0, -pz, 0, pz);
  const cr = Math.min(0.55, pz * 0.4);
  for (let i = 0; i < 16; i++) {
    if (!low && i % 5 === 3) continue;
    const a = (i / 16) * Math.PI * 2, b = ((i + 0.8) / 16) * Math.PI * 2;
    k.quad('#efe9da', [Math.cos(a) * (cr - t / 2), ly, Math.sin(a) * (cr - t / 2)], [Math.cos(b) * (cr - t / 2), ly, Math.sin(b) * (cr - t / 2)], [Math.cos(b) * (cr + t / 2), ly, Math.sin(b) * (cr + t / 2)], [Math.cos(a) * (cr + t / 2), ly, Math.sin(a) * (cr + t / 2)], [0, 1, 0]);
  }
  for (const s of [-1, 1]) {
    const bx = s * (px - Math.min(0.8, px * 0.3)), bz = Math.min(0.9, pz * 0.55);
    line(bx, -bz, bx, bz);
    line(s * px, -bz, bx, -bz);
    line(s * px, bz, bx, bz);
    // The goal: rough wooden posts, a sagging bar and what is left of the net.
    const gw = Math.min(0.45, pz * 0.35), gh = 0.42, gx = s * (px + 0.02);
    for (const z of [-gw, gw]) k.post(WOOD_LIGHT, [gx, 0, z], 0.022, gh, 5);
    k.bar(WOOD_LIGHT, [gx, gh, -gw], [gx, gh - 0.025, 0], 0.035);
    k.bar(WOOD_LIGHT, [gx, gh - 0.025, 0], [gx, gh, gw], 0.035);
    if (!low) k.box('#d4d4d4', [gx + s * 0.12, gh * 0.45, 0], [0.01, gh * 0.85, gw * 1.6], [0, 0, s * 0.45]);
    // Corner flags.
    for (const z of [-pz, pz]) {
      k.post(WOOD, [s * px, 0, z], 0.008, 0.3, 4);
      k.box('#dc2626', [s * px + 0.03, 0.27, z], [0.06, 0.05, 0.005]);
    }
  }
  // The mango tree, the bench under it and the spectators.
  const tx = -w / 2 + 0.25, tz = -d / 2 + 0.2;
  tree(k, tx, tz, 0.9, low, LEAF[2]);
  k.box(WOOD_LIGHT, [tx + 0.75, 0.09, tz + 0.02], [0.9, 0.03, 0.12]);
  for (const x of [0.4, 1.1]) k.box(CONCRETE, [tx + x, 0.04, tz + 0.02], [0.1, 0.08, 0.1]);
  // A street lamp at the corner: the only light for evening matches.
  lampPost(k, w / 2 - 0.15, -d / 2 + 0.15, 1.1, 2, 0.9);
  if (!low) {
    for (let i = 0; i < 4; i++) person(k, tx + 0.42 + i * 0.2, tz + 0.02, ROBES[(i * 3) % ROBES.length], { sit: true, y: 0.1, head: SKIN[i % 3], cap: i % 2 ? RELIEF : undefined });
    // Shirts against skins, a goalkeeper each, the ball.
    const players = d < 3.5 ? 4 : 5;
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < players; i++) {
        const x = (team ? 1 : -1) * (0.15 + rand() * px * 0.75);
        const z = (rand() - 0.5) * pz * 1.6;
        person(k, x, z, team ? '#dc2626' : SKIN[(i + 1) % 3], { head: SKIN[i % 3] });
      }
      person(k, (team ? 1 : -1) * (px - 0.12), (rand() - 0.5) * 0.3, team ? '#facc15' : '#2563eb', { head: SKIN[team] });
    }
    k.box(WHITE, [0.2, 0.03, 0.1], [0.05, 0.05, 0.05]);
    // The pure-water seller with her basin.
    person(k, w / 2 - 0.25, d / 2 - 0.15, '#db2777', { head: SKIN[1] });
    k.post('#2563eb', [w / 2 - 0.25, 0.26, d / 2 - 0.15], 0.07, 0.04, 8);
  }
  return k.done();
}

/* ---------- Roundabout fountains ---------- */

// A city roundabout fountain (Unity Fountain, Tinubu Square, Silver Jubilee): kerbs painted black and white round a
// ring of grass and flowers, a round basin of blue water, a tiered fountain in the middle, lamps at the corners and
// underwater lights at night. The water itself moves: see FountainJets.
function buildFountain(w: number, d: number, low: boolean) {
  const k = new Pen();
  const R = Math.min(w, d) / 2;
  const N = low ? 16 : 24;
  ring(k, GRASS, 0, 0, 0, R - 0.06, 0.015, N);
  // The kerb: painted black and white, the way every roundabout is.
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    const p = (t: number, r: number, y: number): V3 => [Math.cos(t) * r, y, Math.sin(t) * r];
    const c = i % 2 ? '#111827' : '#f8fafc';
    k.quad(c, p(a, R - 0.08, 0.08), p(b, R - 0.08, 0.08), p(b, R, 0.08), p(a, R, 0.08), [0, 1, 0]);
    k.quad(c, p(a, R, 0), p(b, R, 0), p(b, R, 0.08), p(a, R, 0.08), p((a + b) / 2, 1, 0));
  }
  // Flowers round the basin.
  if (!low) for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    k.box(['#dc2626', '#facc15', '#ec4899', '#f97316'][i % 4], [Math.cos(t) * (R * 0.8), 0.04, Math.sin(t) * (R * 0.8)], [0.1, 0.06, 0.1], [0, t, 0]);
  }
  // The basin, the water, the tiers.
  const br = R * 0.66;
  k.post('#e7e5e4', [0, 0, 0], br, 0.18, N);
  k.post('#d6d3d1', [0, 0.18, 0], br + 0.02, 0.03, N);
  k.post('#4fa7d1', [0, 0, 0], br - 0.06, 0.185, N);
  k.post('#e7e5e4', [0, 0.18, 0], 0.07, 0.32, 8);
  k.post('#e7e5e4', [0, 0.46, 0], 0.26, 0.08, 12, 1.6);
  k.post('#7cc4e4', [0, 0.47, 0], 0.37, 0.075, 12);
  k.post('#e7e5e4', [0, 0.54, 0], 0.04, 0.18, 6);
  k.post('#e7e5e4', [0, 0.7, 0], 0.08, 0.05, 8, 1.8);
  // Lamps at the four corners of the island.
  if (!low) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const r = R * 0.72;
    k.post(DARK, [x * r * 0.7071, 0, z * r * 0.7071], 0.015, 0.45, 5);
    k.box(`lamp${(x + 1) / 2 + z + 1}`, [x * r * 0.7071, 0.47, z * r * 0.7071], [0.06, 0.05, 0.06]);
  }
  // Underwater lights: the basin glows blue-white after dark.
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    k.glow.tri([0, 0.2, 0], [Math.cos(a) * br, 0.2, Math.sin(a) * br], [Math.cos(b) * br, 0.2, Math.sin(b) * br], [0.25, 0.55, 0.75], [0.05, 0.15, 0.25]);
  }
  return k.done();
}

// The water: one small mesh of jets arching from the top bowl into the basin and a sheet falling off the lower bowl,
// turned and swelled a little every frame. Under a dynamic group, so StaticBatch leaves it moving.
const waterMat = new MeshStandardMaterial({ color: '#d4f1fc', emissive: '#7cc4e4', emissiveIntensity: 0.25, transparent: true, opacity: 0.75, side: DoubleSide, depthWrite: false });
function jetsGeometry(R: number) {
  const pos: number[] = [];
  const br = R * 0.66 - 0.1;
  const arcs = 8, seg = 6;
  for (let j = 0; j < arcs; j++) {
    const t = (j / arcs) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t), px = -s * 0.012, pz = c * 0.012;
    const at = (f: number): V3 => {
      const r = 0.06 + f * (br - 0.06);
      return [c * r, 0.78 + 0.28 * f - 0.88 * f * f + 0.0, s * r];
    };
    for (let i = 0; i < seg; i++) {
      const a = at(i / seg), b = at((i + 1) / seg);
      pos.push(a[0] - px, a[1], a[2] - pz, a[0] + px, a[1], a[2] + pz, b[0] + px, b[1], b[2] + pz);
      pos.push(a[0] - px, a[1], a[2] - pz, b[0] + px, b[1], b[2] + pz, b[0] - px, b[1], b[2] - pz);
    }
  }
  // The middle jet, and the sheet off the lower bowl's rim.
  const ring = 12;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2, b = ((i + 1) / ring) * Math.PI * 2;
    const p = (t: number, r: number, y: number) => [Math.cos(t) * r, y, Math.sin(t) * r];
    pos.push(...p(a, 0.37, 0.53), ...p(b, 0.37, 0.53), ...p(b, 0.42, 0.2));
    pos.push(...p(a, 0.37, 0.53), ...p(b, 0.42, 0.2), ...p(a, 0.42, 0.2));
    pos.push(...p(a, 0.02, 0.75), ...p(b, 0.02, 0.75), ...p(b, 0.008, 1.05));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function FountainJets({ R }: { R: number }) {
  const ref = useRef<Mesh>(null!);
  const g = useMemo(() => jetsGeometry(R), [R]);
  useFrame(({ clock }, dt) => {
    const m = ref.current;
    m.rotation.y += dt * 0.5;
    const t = clock.elapsedTime;
    m.scale.set(1 + 0.04 * Math.sin(t * 2.3), 1 + 0.08 * Math.sin(t * 3.1), 1 + 0.04 * Math.sin(t * 2.3));
  });
  return (
    <group userData={{ dynamic: true }}>
      <mesh ref={ref} geometry={g} material={waterMat} renderOrder={1} raycast={() => null} />
    </group>
  );
}

/* ---------- The player's house ---------- */

// Your house: a walled compound with a black steel gate between capped pillars (lamps on top), interlocking paving,
// the house under a long-span roof with barred windows and a porch, a GP tank up on its stand, the generator in its
// little house by the gate, the DSTV dish, a car under the carport for the bigger houses, a mango tree and the
// washing line. It follows the house you live in: a Gida build is drawn as its design (a self-con, a bungalow, an
// executive house, a block of flats, a two-storey mansion), the starter home as a small bungalow, its outside walls in
// the paint you chose. Read when the map loads, like the rest of the town.
interface HomeLook { design: string | null; wall: string | null }
const HOUSES: Record<string, { w: number; d: number; floors: number; roof: string; porch: boolean; car: boolean }> = {
  starter: { w: 2.4, d: 1.7, floors: 1, roof: '#1f4e3d', porch: false, car: false },
  selfcon: { w: 2.3, d: 1.6, floors: 1, roof: '#7c2d12', porch: false, car: false },
  bungalow: { w: 2.8, d: 1.9, floors: 1, roof: '#1f4e3d', porch: true, car: false },
  duplex: { w: 2.8, d: 2.0, floors: 1, roof: '#1e3a5f', porch: true, car: true },
  flats: { w: 3.0, d: 1.8, floors: 2, roof: '#7c2d12', porch: false, car: false },
  mansion: { w: 2.9, d: 2.0, floors: 2, roof: '#3f3f46', porch: true, car: true },
};
function buildHome(w: number, d: number, low: boolean, look: HomeLook) {
  const k = new Pen();
  const H = HOUSES[look.design ?? 'starter'] ?? HOUSES.starter;
  const WALL = look.wall ?? '#f3ead8';
  const FENCE = '#e6dcc6', COPING = '#a8a29e';
  const hw = w / 2 - 0.06, hd = d / 2 - 0.06;
  // The yard: interlocking paving, a strip of lawn, the driveway.
  k.flat('#b9b2a6', -hw, -hd, hw, hd, 0.012);
  if (!low) for (let z = -hd + 0.25; z < hd; z += 0.25) k.flat('#a39b8e', -hw, z - 0.006, hw, z + 0.006, 0.014);
  k.flat(LAWN, -hw + 0.1, -hd + 0.1, -hw + 0.75, hd - 0.9, 0.016);
  // The drive from the gate, a front lawn with a flower bed beside it.
  k.flat('#8f887c', -0.45, 0.2, 0.45, hd, 0.015);
  k.flat(LAWN, 0.62, 0.45, hw - 0.1, hd - 0.12, 0.016);
  if (!low) for (let i = 0; i < 5; i++) k.box(['#dc2626', '#facc15', '#ec4899'][i % 3], [0.75 + i * 0.22, 0.04, hd - 0.22], [0.12, 0.06, 0.1]);
  // The fence: a block wall with pillars and coping, a rail of spikes on top.
  const FH = 0.55;
  const wall = (cx: number, cz: number, lx: number, lz: number) => {
    k.box(FENCE, [cx, FH / 2, cz], [lx, FH, lz]);
    k.box(COPING, [cx, FH + 0.02, cz], [lx + 0.03, 0.04, lz + 0.03]);
    if (!low) k.box(DARK, [cx, FH + 0.09, cz], [lx > lz ? lx : 0.012, 0.1, lz > lx ? lz : 0.012]);
  };
  const T = 0.08;
  const gate = 1.0;
  wall(0, -hd, w - 0.12, T);
  wall(-hw, 0, T, d - 0.12);
  wall(hw, 0, T, d - 0.12);
  const fl = hw - gate / 2 - 0.08;
  wall(-(gate / 2 + 0.08 + fl / 2), hd, fl, T);
  wall(gate / 2 + 0.08 + fl / 2, hd, fl, T);
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [-hw, 0], [hw, 0], [0, -hd]]) k.box(FENCE, [x, 0.31, z], [0.14, 0.62, 0.14]);
  // The gate: capped pillars with lamps, the black steel leaves with their bars and a gold band.
  for (const s of [-1, 1]) {
    k.box('#d6cdb8', [s * (gate / 2 + 0.04), 0.36, hd], [0.16, 0.72, 0.16]);
    k.box(COPING, [s * (gate / 2 + 0.04), 0.74, hd], [0.2, 0.04, 0.2]);
    k.box(`lamp${s > 0 ? 1 : 0}`, [s * (gate / 2 + 0.04), 0.81, hd], [0.08, 0.1, 0.08]);
    groundPool(k, s * (gate / 2 + 0.04), hd + 0.15, 0.4, 0.3);
  }
  k.box(DARK, [0, 0.32, hd], [gate - 0.04, 0.6, 0.04]);
  if (!low) for (let i = 0; i < 9; i++) k.box('#111827', [-gate / 2 + 0.07 + i * ((gate - 0.14) / 8), 0.32, hd + 0.025], [0.02, 0.56, 0.01]);
  k.box(GOLD, [0, 0.5, hd + 0.026], [gate - 0.08, 0.03, 0.012]);
  // The house.
  const hz = -hd + 0.25 + H.d / 2;
  const hx = 0.3;
  const fh = 0.72;
  const top = fh * H.floors;
  k.box('#9c958a', [hx, 0.05, hz], [H.w + 0.08, 0.1, H.d + 0.08]);
  k.box(WALL, [hx, top / 2 + 0.05, hz], [H.w, top, H.d]);
  if (H.floors > 1) k.box('#d6cdb8', [hx, fh + 0.05, hz], [H.w + 0.04, 0.05, H.d + 0.04]);
  const ey = top + 0.05;
  if (look.design === 'flats') {
    // A block of flats: a flat roof behind a parapet, the stair tower poking up.
    k.box('#d6cdb8', [hx, ey + 0.08, hz], [H.w + 0.06, 0.16, H.d + 0.06]);
    k.box('#9ca3af', [hx, ey + 0.165, hz], [H.w - 0.08, 0.01, H.d - 0.08]);
    k.box(WALL, [hx - H.w / 2 + 0.3, ey + 0.3, hz - 0.2], [0.4, 0.5, 0.5]);
    hipRoof(k, H.roof, hx - H.w / 2 + 0.3, hz - 0.2, 0.5, 0.6, ey + 0.55, 0.12);
  } else {
    hipRoof(k, H.roof, hx, hz, H.w + 0.3, H.d + 0.3, ey, Math.min(0.7, H.d * 0.38), '#1c1917');
  }
  // Windows with burglary-proof bars, front and sides.
  const zf = hz + H.d / 2;
  const nW = Math.max(2, Math.round(H.w / 0.55));
  for (let f = 0; f < H.floors; f++) {
    const wy = 0.05 + f * fh + fh * 0.55;
    for (let i = 0; i < nW; i++) {
      const x = hx - H.w / 2 + (i + 0.5) * (H.w / nW);
      if (f === 0 && i === Math.floor(nW / 2)) continue;
      k.box(`glass${(i + f) % 4}`, [x, wy, zf + 0.005], [0.26, 0.26, 0.02]);
      k.box('#f8fafc', [x, wy - 0.15, zf + 0.02], [0.32, 0.03, 0.04]);
      if (!low) for (const dx of [-0.07, 0, 0.07]) k.box(DARK, [x + dx, wy, zf + 0.018], [0.012, 0.26, 0.008]);
    }
    for (const s of [-1, 1]) k.box(`glass${f + 1}`, [hx + s * (H.w / 2 + 0.005), wy, hz], [0.02, 0.26, 0.3]);
  }
  // The front door (a steel security door) and the porch over it.
  const dx = hx - H.w / 2 + (Math.floor(nW / 2) + 0.5) * (H.w / nW);
  k.box('#3b2a1a', [dx, 0.33, zf + 0.008], [0.24, 0.48, 0.02]);
  k.box('#7c4a1e', [dx, 0.33, zf + 0.018], [0.18, 0.42, 0.01]);
  if (H.porch) {
    k.box(WALL, [dx, fh + 0.02, zf + 0.25], [0.7, 0.06, 0.5]);
    for (const s of [-1, 1]) k.post(WHITE, [dx + s * 0.3, 0.1, zf + 0.45], 0.03, fh - 0.08, 8);
    k.box('#9c958a', [dx, 0.04, zf + 0.25], [0.7, 0.08, 0.5]);
    if (H.floors > 1) {
      // The balcony over the porch.
      k.box('#e5e7eb', [dx, fh + 0.12, zf + 0.47], [0.7, 0.14, 0.03]);
      k.box('glass2', [dx, fh + 0.35, zf + 0.008], [0.3, 0.36, 0.02]);
    }
  } else {
    k.box(H.roof, [dx, 0.62, zf + 0.12], [0.45, 0.03, 0.24], [0.2, 0, 0]);
  }
  // A security light over the door.
  k.box('lamp2', [dx, 0.6, zf + 0.03], [0.06, 0.04, 0.04]);
  groundPool(k, dx, zf + 0.35, 0.5, 0.25);
  // The GP tank on its stand at the back corner.
  const tx = -hw + 0.35, tz = -hd + 0.35;
  for (const ox of [-0.16, 0.16]) for (const oz of [-0.16, 0.16]) k.post('#64748b', [tx + ox, 0, tz + oz], 0.018, 1.25, 4);
  k.box('#64748b', [tx, 1.25, tz], [0.42, 0.04, 0.42]);
  k.post('#2563eb', [tx, 1.27, tz], 0.24, 0.4, 10);
  k.post('#1d4ed8', [tx, 1.67, tz], 0.24, 0.05, 10, 0.5);
  if (!low) for (let y = 0.35; y < 1.2; y += 0.3) k.box('#64748b', [tx, y, tz - 0.16], [0.32, 0.015, 0.015]);
  // The generator in its house by the gate.
  const gx = -hw + 0.45, gz = hd - 0.35;
  k.box(FENCE, [gx, 0.22, gz - 0.1], [0.55, 0.44, 0.04]);
  k.box(ZINC, [gx, 0.46, gz], [0.6, 0.03, 0.36], [-0.12, 0, 0]);
  k.post(WOOD, [gx - 0.26, 0, gz + 0.15], 0.015, 0.45, 4);
  k.post(WOOD, [gx + 0.26, 0, gz + 0.15], 0.015, 0.45, 4);
  const big = look.design === 'mansion' || look.design === 'flats';
  k.box(big ? '#15803d' : '#dc2626', [gx, 0.1, gz], big ? [0.42, 0.2, 0.22] : [0.26, 0.17, 0.18]);
  k.box(DARK, [gx, 0.02, gz], big ? [0.44, 0.04, 0.24] : [0.28, 0.04, 0.2]);
  k.box(DARK, [gx + 0.1, 0.22, gz - 0.04], [0.025, 0.08, 0.025]);
  // Trees and the extras.
  tree(k, hw - 0.35, -hd + 0.35, 0.7, low, LEAF[1]);
  if (!low) {
    // The DSTV dish on the roof edge.
    k.post('#e5e7eb', [hx + H.w / 2 - 0.25, ey, hz + H.d / 2 - 0.05], 0.12, 0.05, 8, 1.4);
    k.box(DARK, [hx + H.w / 2 - 0.25, ey + 0.08, hz + H.d / 2 - 0.02], [0.02, 0.1, 0.02]);
    // The washing line behind the house.
    k.box(DARK, [hx, 0.5, -hd + 0.12], [H.w * 0.8, 0.008, 0.008]);
    for (let i = 0; i < 4; i++) k.box(ROBES[(i * 3 + 2) % ROBES.length], [hx - H.w * 0.3 + i * (H.w * 0.2), 0.42, -hd + 0.12], [0.14, 0.16, 0.01]);
    // Flower pots by the door.
    for (const s of [-1, 1]) {
      k.post('#9a4f2a', [dx + s * 0.4, 0, zf + 0.12], 0.05, 0.08, 6, 1.3);
      k.shape(LEAF[1], LUMP(0), [dx + s * 0.4, 0.12, zf + 0.12], [0.07, 0.06, 0.07]);
    }
    if (H.car) {
      // The car on the driveway, nose to the gate.
      const cx = 0.6, cz = hd - 0.45;
      k.box('#0f172a', [cx, 0.11, cz], [0.32, 0.12, 0.6]);
      k.box('#0f172a', [cx, 0.21, cz - 0.04], [0.28, 0.1, 0.32]);
      k.box('glass3', [cx, 0.215, cz + 0.125], [0.26, 0.07, 0.01]);
      for (const ox of [-0.16, 0.16]) for (const oz of [-0.19, 0.19]) k.box(DARK, [cx + ox, 0.05, cz + oz], [0.04, 0.1, 0.1]);
    }
  }
  return k.done();
}

function homeLook(): HomeLook {
  const s = useGame.getState();
  const id = s.homePropertyId;
  const design = id ? s.properties.find((p) => p.id === id)?.design ?? null : null;
  return { design, wall: paintHex(s.housePaint[id ?? 'starter']?.outer) };
}

/* ---------- The models ---------- */

type Size = { w: number; d: number };
export const CityWall = ({ w, d }: Size) => <KitModel build={(low) => buildCityWall(w, d, low)} deps={[w, d]} />;
export const Kofar = ({ w, d }: Size) => <KitModel build={(low) => buildKofar(w, d, low)} deps={[w, d]} />;
export const EmirPalace = ({ w, d }: Size) => <KitModel build={(low) => buildEmirPalace(w, d, low)} deps={[w, d]} />;
export const DalaHill = ({ w, d }: Size) => <KitModel build={(low) => buildDala(w, d, low)} deps={[w, d]} />;
export const DyePits = ({ w, d }: Size) => <KitModel build={(low) => buildDyePits(w, d, low)} deps={[w, d]} />;
export const Pyramids = ({ w, d }: Size) => <KitModel build={(low) => buildPyramids(w, d, low)} deps={[w, d]} />;
export const NationalTheatre = ({ w, d }: Size) => <KitModel build={(low) => buildNationalTheatre(w, d, low)} deps={[w, d]} />;
export const Lugard = ({ w, d }: Size) => <KitModel build={(low) => buildLugard(w, d, low)} deps={[w, d]} />;
export const Square = ({ w, d }: Size) => <KitModel build={(low) => buildSquare(w, d, low)} deps={[w, d]} />;
export const MillenniumTower = ({ w, d }: Size) => <KitModel build={(low) => buildMillTower(w, d, low)} deps={[w, d]} />;
export const Museum = ({ w, d }: Size) => <KitModel build={(low) => buildMuseum(w, d, low)} deps={[w, d]} />;
export const Pitch = ({ w, d }: Size) => <KitModel build={(low) => buildPitch(w, d, low)} deps={[w, d]} />;
export function Fountain({ w, d }: Size) {
  return (
    <group>
      <KitModel build={(low) => buildFountain(w, d, low)} deps={[w, d]} />
      <FountainJets R={Math.min(w, d) / 2} />
    </group>
  );
}
export function Home({ w, d }: Size) {
  const [look] = useState(homeLook);
  return <KitModel build={(low) => buildHome(w, d, low, look)} deps={[w, d, look.design, look.wall]} />;
}
