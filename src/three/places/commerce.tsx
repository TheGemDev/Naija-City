// Commerce, leisure and hospitality on the city map: the market, the mall, the boutique, the bank, the hotel, the club,
// the buka, the suya spot, the viewing centre, the Glory Dome, the trade fair, the golf course, the polo ground, Arewa
// House, the park and the beach. Built like the stadium (Stadium.tsx) with the shared kit (placeKit.tsx): every part
// is merged into one geometry per colour, so each place is a handful of plain meshes that the map's StaticBatch folds
// into the town's buckets. Glass parts ('glass…') share the window material and lamps ('lamp…') the street lamps',
// so they light up after dark; neon, screens, fires and lit signs go in the night-only Glow.
//
// Every model is centred on its footprint (w along x, d along z), sits on y=0 and has its door on the +z side. The
// map camera looks almost straight down from the south, so rooftops and what stands in the open (stalls, umbrellas,
// pools, cars, people) carry each place; facades get the detail you see when the camera tilts in.
//
// Low performance mode keeps the buildings and their silhouettes and drops the small things: goods on the counters,
// most of the people, the parked cars, spare trees and the light pools.

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, IcosahedronGeometry, Matrix4, MeshStandardMaterial, Object3D, Vector3, type InstancedMesh } from 'three';
import { useLowPerf } from '../../game/quality';
import { clamp, frame, Glow, Kit, KitModel, prep, rng, scale, unitCyl, type RGB, type V3 } from '../placeKit';

/* ---------- Colours ---------- */

const EARTH = '#b98e62';
const EARTH_DARK = '#a37a50';
const CONCRETE = '#b8b2a7';
const PAVING = '#d6d0c4';
const ASPHALT = '#4b5563';
const LINE = '#f8fafc';
const WHITE = '#f8fafc';
const CREAM = '#efe6d2';
const DARK = '#1f2937';
const BLACK = '#111114';
const STEEL = '#94a3b8';
const WOOD = '#7c4a24';
const WOOD_DARK = '#5b3a1e';
const GOLD = '#d4a72c';
const GREEN = '#15803d';
const GREEN_DEEP = '#166534';
const LAWN = '#7fae4f';
const LAWN_DARK = '#6f9e43';
const GRASS = '#5fa043';
const WATER = '#38a9d6';
const TYRE = '#18181b';
const CAR_GLASS = '#273449';
const TANK = '#1c1f24';
const ZINC = ['#a3acb5', '#8f99a3', '#b6bcc2'];
const RUST = ['#9a5b34', '#8a4b2a', '#b06a3b'];
const TARP = ['#2563eb', '#1d4ed8'];
const SKIN = ['#5b3a24', '#6d4329', '#4a2e1c'];
const CLOTHES = ['#dc2626', '#2563eb', '#facc15', '#16a34a', '#f97316', '#f8fafc', '#9333ea', '#0f172a', '#db2777', '#0d9488'];
const CARS = ['#f8fafc', '#111827', '#9ca3af', '#1d4ed8', '#b91c1c', '#e5e7eb', '#334155', '#facc15'];
const NEEM = ['#3f7d2a', '#2f6b25', '#4d8f31'];
const WARM: RGB = [1, 0.82, 0.5];

/** `c` a shade darker (k < 1) or lighter (k > 1). */
const shade = (c: string, k: number) => `#${new Color(c).multiplyScalar(k).getHexString()}`;
const ICO = prep(new IcosahedronGeometry(1, 0));

/* ---------- The kit's little helpers: one set of things every place uses ---------- */

interface Ctx { kit: Kit; glow: Glow; r: () => number; low: boolean }

const start = (w: number, d: number, low: boolean, seed: number): Ctx => ({ kit: new Kit(), glow: new Glow(), r: rng(Math.round(w * 131 + d * 17 + seed * 977)), low });
const done = (c: Ctx) => ({ parts: c.kit.build(), glow: c.glow.pos.length ? c.glow.build() : undefined });
const pick = <T,>(c: Ctx, a: readonly T[]) => a[Math.floor(c.r() * a.length)];
/** A point inside a frame, in the place's own space. */
const tp = (f: Matrix4, p: V3): V3 => {
  const v = new Vector3(...p).applyMatrix4(f);
  return [v.x, v.y, v.z];
};

/** A lit rectangle facing +z (or along the frame's +z): signs, screens, shop windows. */
function glowPanel(c: Ctx, x: number, y: number, z: number, w: number, h: number, col: RGB, f?: Matrix4) {
  const q = (dx: number, dy: number): V3 => (f ? tp(f, [x + dx, y + dy, z]) : [x + dx, y + dy, z]);
  c.glow.quad(q(-w / 2, -h / 2), q(w / 2, -h / 2), q(w / 2, h / 2), q(-w / 2, h / 2), col);
}
/** A pool of light on the ground, brightest in the middle. */
function glowPool(c: Ctx, x: number, z: number, r: number, col: RGB, y = 0.07, rz = r) {
  if (c.low) return;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    c.glow.tri([x, y, z], [x + Math.cos(a) * r, y, z + Math.sin(a) * rz], [x + Math.cos(b) * r, y, z + Math.sin(b) * rz], col, [0, 0, 0]);
  }
}

/** A flat many-sided patch on the ground (a green, a bunker, a pond), its edge wobbling a little. */
function blob(c: Ctx, key: string, x: number, z: number, rx: number, rz: number, y: number, n = 14, wob = 0.15) {
  const k: number[] = [];
  for (let i = 0; i < n; i++) k.push(1 - wob / 2 + c.r() * wob);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    const ka = k[i], kb = k[(i + 1) % n];
    c.kit.tri(key, [x, y, z], [x + Math.cos(a) * rx * ka, y, z + Math.sin(a) * rz * ka], [x + Math.cos(b) * rx * kb, y, z + Math.sin(b) * rz * kb], [0, 1, 0]);
  }
}
/** A flat ring on the ground: a path round a fountain, a running track. */
function ring(c: Ctx, key: string, x: number, z: number, r0: number, r1: number, y: number, n = 24) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    const p = (t: number, r: number): V3 => [x + Math.cos(t) * r, y, z + Math.sin(t) * r];
    c.kit.quad(key, p(a, r0), p(b, r0), p(b, r1), p(a, r1), [0, 1, 0]);
  }
}

/** Someone standing (or sitting, `sit`), a coloured body and a head: dots from the map, people close up. */
function person(c: Ctx, x: number, z: number, y = 0.04, shirt?: string, sit = false, f?: Matrix4) {
  const h = sit ? 0.07 : 0.11;
  c.kit.box(shirt ?? pick(c, CLOTHES), [x, y + h / 2, z], [0.055, h, 0.045], undefined, f);
  c.kit.box(pick(c, SKIN), [x, y + h + 0.022, z], [0.038, 0.04, 0.038], undefined, f);
}
/** `n` people scattered over a rectangle, kept off anything `free` says no to. */
function crowd(c: Ctx, n: number, x0: number, z0: number, x1: number, z1: number, y = 0.04, free?: (x: number, z: number) => boolean, colours?: readonly string[]) {
  for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
    const x = x0 + c.r() * (x1 - x0), z = z0 + c.r() * (z1 - z0);
    if (free && !free(x, z)) continue;
    person(c, x, z, y, colours ? pick(c, colours) : undefined);
    i++;
  }
}

/** A car parked facing `yaw` (0 faces +z): a body, the glasshouse, a roof, wheels; an SUV stands taller. */
function car(c: Ctx, x: number, z: number, yaw: number, col: string, suv = false, y = 0.04) {
  const f = frame([x, y, z], [0, yaw, 0]);
  const k = c.kit;
  const L = suv ? 0.8 : 0.72, W = suv ? 0.38 : 0.34, H = suv ? 0.17 : 0.12;
  k.box(col, [0, 0.05 + H / 2, 0], [W, H, L], undefined, f);
  k.box(CAR_GLASS, [0, 0.05 + H + 0.05, suv ? -0.05 : -0.04], [W - 0.03, 0.1, suv ? 0.52 : 0.4], undefined, f);
  k.box(col, [0, 0.05 + H + 0.105, suv ? -0.05 : -0.04], [W - 0.05, 0.02, suv ? 0.48 : 0.34], undefined, f);
  for (const s of [-1, 1]) k.box(TYRE, [0, 0.05, s * L * 0.3], [W + 0.02, 0.1, 0.13], undefined, f);
  if (!c.low) {
    for (const s of [-1, 1]) {
      k.box('#fef3c7', [s * W * 0.32, 0.05 + H * 0.65, L / 2 + 0.003], [0.07, 0.035, 0.01], undefined, f);
      k.box('#b91c1c', [s * W * 0.32, 0.05 + H * 0.65, -L / 2 - 0.003], [0.07, 0.035, 0.01], undefined, f);
    }
  }
}
/** A yellow keke, facing `yaw`. */
function keke(c: Ctx, x: number, z: number, yaw: number) {
  const f = frame([x, 0.04, z], [0, yaw, 0]);
  const k = c.kit;
  k.box('#facc15', [0, 0.1, 0], [0.18, 0.13, 0.34], undefined, f);
  k.box(GREEN, [0, 0.06, 0], [0.185, 0.03, 0.345], undefined, f);
  k.box('#18181b', [0, 0.27, -0.02], [0.19, 0.025, 0.3], undefined, f);
  for (const s of [-1, 1]) k.box('#18181b', [s * 0.085, 0.21, -0.15], [0.018, 0.12, 0.018], undefined, f);
  k.box('#18181b', [0, 0.21, 0.12], [0.17, 0.12, 0.012], undefined, f);
  k.box(TYRE, [0, 0.035, -0.06], [0.2, 0.07, 0.08], undefined, f);
}
/** An okada on its stand, facing `yaw`. */
function okada(c: Ctx, x: number, z: number, yaw: number, col = '#b91c1c') {
  const f = frame([x, 0.04, z], [0, yaw, 0]);
  const k = c.kit;
  k.box(TYRE, [0, 0.04, 0.12], [0.025, 0.08, 0.08], undefined, f);
  k.box(TYRE, [0, 0.04, -0.12], [0.025, 0.08, 0.08], undefined, f);
  k.box(col, [0, 0.1, 0.01], [0.05, 0.06, 0.2], undefined, f);
  k.box('#18181b', [0, 0.14, -0.05], [0.05, 0.02, 0.12], undefined, f);
  k.box(STEEL, [0, 0.16, 0.11], [0.14, 0.012, 0.012], undefined, f);
}

/** A shade tree: a trunk and a crown or three (one in low mode). */
function tree(c: Ctx, x: number, z: number, s = 1, tone?: string) {
  const col = tone ?? pick(c, NEEM);
  c.kit.post(WOOD_DARK, [x, 0.04, z], 0.045 * s, 0.42 * s, 5, 0.7);
  c.kit.shape(col, ICO, [x, 0.6 * s, z], [0.32 * s, 0.26 * s, 0.32 * s], [0, c.r() * 3, 0]);
  if (!c.low) {
    c.kit.shape(shade(col, 1.12), ICO, [x + 0.14 * s, 0.68 * s, z + 0.08 * s], [0.2 * s, 0.17 * s, 0.2 * s], [0, c.r() * 3, 0]);
    c.kit.shape(shade(col, 0.88), ICO, [x - 0.15 * s, 0.55 * s, z - 0.06 * s], [0.2 * s, 0.17 * s, 0.2 * s], [0, c.r() * 3, 0]);
  }
}
/** A coconut palm: a leaning trunk and a star of drooping fronds. */
function palm(c: Ctx, x: number, z: number, h = 1.1, lean = 0.12) {
  const k = c.kit;
  const yaw = c.r() * Math.PI * 2;
  const lx = Math.cos(yaw) * lean, lz = Math.sin(yaw) * lean;
  const pts: V3[] = [0, 0.4, 0.75, 1].map((t) => [x + lx * t * t, 0.04 + h * t, z + lz * t * t]);
  for (let i = 0; i < pts.length - 1; i++) k.bar('#8b6b4a', pts[i], pts[i + 1], 0.05 - i * 0.008);
  const top = pts[pts.length - 1];
  const n = c.low ? 5 : 7;
  for (let i = 0; i < n; i++) {
    const a = yaw + (i / n) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
    const L = h * 0.42;
    const mid: V3 = [top[0] + ca * L * 0.5, top[1] + 0.05, top[2] + sa * L * 0.5];
    const tip: V3 = [top[0] + ca * L, top[1] - 0.12, top[2] + sa * L];
    const wd = 0.07;
    const key = i % 2 ? '#2f7d32' : '#3d9140';
    k.quad(key, [top[0] + px * 0.02, top[1], top[2] + pz * 0.02], [top[0] - px * 0.02, top[1], top[2] - pz * 0.02], [mid[0] - px * wd, mid[1], mid[2] - pz * wd], [mid[0] + px * wd, mid[1], mid[2] + pz * wd], [0, 1, 0]);
    k.tri(key, [mid[0] + px * wd, mid[1], mid[2] + pz * wd], [mid[0] - px * wd, mid[1], mid[2] - pz * wd], tip, [0, 1, 0]);
  }
  k.box('#5b4a2a', [top[0], top[1] - 0.05, top[2]], [0.08, 0.06, 0.08]);
}
/** A patio umbrella: a pole and a canopy of `cols` panels round it. */
function umbrella(c: Ctx, x: number, z: number, r: number, h: number, cols: readonly string[], seg = 8, y = 0.04) {
  c.kit.box(STEEL, [x, y + h / 2, z], [0.016, h, 0.016]);
  const apex: V3 = [x, y + h + r * 0.32, z];
  const rim = (i: number): V3 => [x + Math.cos((i / seg) * Math.PI * 2) * r, y + h, z + Math.sin((i / seg) * Math.PI * 2) * r];
  for (let i = 0; i < seg; i++) c.kit.tri(cols[i % cols.length], apex, rim(i), rim(i + 1), [0, 1, 0]);
}
/** A lean-to of corrugated zinc: sheets running down the slope from the back edge (z0, y0) to the front (z1, y1). */
function zinc(c: Ctx, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, base: string, sheets: number, rusty = 0) {
  const out: V3 = [0, z1 - z0, -(y1 - y0)];
  const sw = (x1 - x0) / sheets;
  for (let i = 0; i < sheets; i++) {
    const rust = c.r() < rusty;
    const key = rust ? pick(c, RUST) : i % 2 ? base : shade(base, 0.86);
    const a = x0 + i * sw, b = a + sw;
    c.kit.quad(key, [a, y0, z0], [b, y0, z0], [b, y1, z1], [a, y1, z1], out);
  }
  c.kit.quad(shade(base, 0.55), [x0, y0 - 0.01, z0], [x1, y0 - 0.01, z0], [x1, y1 - 0.01, z1], [x0, y1 - 0.01, z1], [0, -1, 0]);
}
/** A black plastic water tank on a roof. */
function tank(c: Ctx, x: number, y: number, z: number, s = 1) {
  c.kit.post(TANK, [x, y, z], 0.1 * s, 0.22 * s, 8);
  c.kit.post('#2d3239', [x, y + 0.22 * s, z], 0.045 * s, 0.025 * s, 6);
}
/** A split air-conditioner's outdoor unit. */
function acUnit(c: Ctx, x: number, y: number, z: number) {
  c.kit.box('#d1d5db', [x, y + 0.06, z], [0.2, 0.12, 0.14]);
  if (!c.low) c.kit.box('#4b5563', [x, y + 0.121, z], [0.1, 0.004, 0.1]);
}
/** A flagpole with a flag of vertical bands. */
function flag(c: Ctx, x: number, z: number, h: number, bands: readonly string[]) {
  c.kit.post(STEEL, [x, 0.04, z], 0.012, h, 5);
  const bw = 0.24 / bands.length;
  bands.forEach((b, i) => c.kit.box(b, [x + 0.02 + bw * (i + 0.5), 0.04 + h - 0.08, z], [bw, 0.15, 0.01]));
}
const NIGERIA = [GREEN, WHITE, GREEN] as const;
/** A row of block letters, the name on a sign: `n` of them centred on `x`. */
function letters(c: Ctx, key: string, x: number, y: number, z: number, n: number, lh: number, f?: Matrix4) {
  const step = lh * 0.78;
  for (let i = 0; i < n; i++) {
    if (n > 6 && i === Math.floor(n / 2) && n % 2 === 0) continue; // a word break
    const lx = x + (i - (n - 1) / 2) * step;
    c.kit.box(key, [lx, y, z], [lh * 0.5, lh, 0.012], undefined, f);
  }
}
/** A signboard: the board, its name, and a glow on it at night. */
function sign(c: Ctx, x: number, y: number, z: number, w: number, h: number, board: string, ink: string, n: number, lit: RGB | null, f?: Matrix4) {
  c.kit.box(board, [x, y, z], [w, h, 0.04], undefined, f);
  letters(c, ink, x, y, z + 0.024, n, Math.min(h * 0.55, (w * 0.85) / (n * 0.78)), f);
  if (lit) glowPanel(c, x, y, z + 0.034, w, h, lit, f);
}
/** A street lamp: a post, an arm, a head on the shared lamp material, and its pool of light. */
function lamp(c: Ctx, x: number, z: number, h: number, i: number, dx = 0, dz = 0.12) {
  c.kit.post(STEEL, [x, 0.04, z], 0.016, h, 5);
  c.kit.box(STEEL, [x + dx / 2, 0.04 + h, z + dz / 2], [Math.abs(dx) + 0.02, 0.02, Math.abs(dz) + 0.02]);
  c.kit.box(`lamp${i}`, [x + dx, 0.03 + h, z + dz], [0.06, 0.025, 0.06]);
  glowPool(c, x + dx, z + dz, 0.45, scale(WARM, 0.22));
}
/** A low fence: posts and two rails from one corner to the other. */
function fence(c: Ctx, x0: number, z0: number, x1: number, z1: number, h: number, key: string, step = 0.3) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    c.kit.box(key, [x0 + (x1 - x0) * t, 0.04 + h / 2, z0 + (z1 - z0) * t], [0.025, h, 0.025]);
  }
  for (const y of c.low ? [h * 0.85] : [h * 0.4, h * 0.85]) c.kit.bar(key, [x0, 0.04 + y, z0], [x1, 0.04 + y, z1], 0.014);
}
/** A parapet round a flat roof at height `y`: four low walls, a cap of `cap` along their tops if given. */
function parapet(c: Ctx, x: number, z: number, w: number, d: number, y: number, h: number, key: string, cap?: string) {
  const t = 0.05;
  for (const s of [-1, 1]) {
    c.kit.box(key, [x, y + h / 2, z + (s * (d - t)) / 2], [w, h, t]);
    c.kit.box(key, [x + (s * (w - t)) / 2, y + h / 2, z], [t, h, d - t * 2]);
    if (cap) {
      c.kit.box(cap, [x, y + h + 0.008, z + (s * (d - t)) / 2], [w + 0.01, 0.016, t + 0.01]);
      c.kit.box(cap, [x + (s * (w - t)) / 2, y + h + 0.008, z], [t + 0.01, 0.016, d - t * 2]);
    }
  }
}
/** A park bench facing `yaw`. */
function bench(c: Ctx, x: number, z: number, yaw: number, col = WOOD) {
  const f = frame([x, 0.04, z], [0, yaw, 0]);
  c.kit.box(col, [0, 0.07, 0], [0.26, 0.02, 0.08], undefined, f);
  c.kit.box(col, [0, 0.11, -0.035], [0.26, 0.06, 0.012], undefined, f);
  if (!c.low) for (const s of [-1, 1]) c.kit.box(DARK, [s * 0.11, 0.035, 0], [0.02, 0.07, 0.07], undefined, f);
}
/** A white (or coloured) plastic chair facing `yaw`, someone in it if `sat`. */
function chair(c: Ctx, x: number, z: number, yaw: number, col: string, sat = false) {
  const f = frame([x, 0.04, z], [0, yaw, 0]);
  c.kit.box(col, [0, 0.07, 0], [0.075, 0.016, 0.075], undefined, f);
  c.kit.box(col, [0, 0.11, -0.034], [0.075, 0.07, 0.01], undefined, f);
  if (!c.low) c.kit.box(shade(col, 0.8), [0, 0.033, 0], [0.06, 0.06, 0.06], undefined, f);
  if (sat) person(c, 0, 0.005, 0.08, undefined, true, f);
}
/** A small table, round-ish from above. */
function table(c: Ctx, x: number, z: number, col: string, r = 0.1) {
  c.kit.post(col, [x, 0.12, z], r, 0.016, 8);
  c.kit.box(shade(col, 0.75), [x, 0.08, z], [0.025, 0.08, 0.025]);
}

/* ---------- Street food: smoke over the fire ---------- */

const smokeMat = new MeshStandardMaterial({ color: '#e4e4e7', transparent: true, opacity: 0.3, depthWrite: false, roughness: 1, side: DoubleSide, flatShading: false });
const _o = new Object3D();
const PUFF = new IcosahedronGeometry(1, 1);

/** Smoke rising off a fire: a few puffs in one instanced mesh (one draw), each growing and thinning as it climbs. */
function Smoke({ at, n = 6, h = 1.2 }: { at: V3; n?: number; h?: number }) {
  const lowNow = useLowPerf();
  const [low] = useState(lowNow);
  const count = low ? Math.max(2, n >> 1) : n;
  const ref = useRef<InstancedMesh>(null!);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      const t = (clock.elapsedTime * 0.28 + i / count) % 1;
      _o.position.set(at[0] + Math.sin(t * 5 + i * 1.7) * 0.07 + t * 0.12, at[1] + t * h, at[2] - t * 0.05);
      _o.scale.setScalar((0.05 + t * 0.2) * Math.min(1, (1 - t) * 3.5));
      _o.rotation.set(i, t * 2, 0);
      _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group userData={{ dynamic: true }}>
      <instancedMesh ref={ref} args={[PUFF, smokeMat, count]} frustumCulled={false} raycast={() => null} />
    </group>
  );
}

/* ---------- The market ---------- */

const GOODS = ['#dc2626', '#ef4444', '#f97316', '#facc15', '#16a34a', '#7c2d12', '#a16207', '#9333ea', '#2563eb', '#f5f5f4', '#db2777', '#0d9488'];
const SHOP_SIGNS = ['#facc15', '#16a34a', '#dc2626', '#1d4ed8', '#f97316', '#0f766e', '#7c3aed', '#be123c'];

/**
 * The central market: a two-storey market plaza across the back (lock-up shops below, a gallery above, black water
 * tanks and the market's name on its roof), rows of stalls in front under a patchwork of zinc, rust and blue tarp
 * with the goods out on the counters, and along the street the women under their umbrellas with tomatoes, pepper and
 * onions, a truck pusher's barrow, a keke and an okada waiting for a load.
 */
function buildMarket(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 1);
  const { kit } = c;
  kit.box(EARTH, [0, 0.02, 0], [w, 0.04, d]);

  // The plaza block.
  const x0 = -w / 2 + 0.2, x1 = w / 2 - 0.2, z0 = -d / 2 + 0.12;
  const bd = clamp(d * 0.24, 0.9, 1.25), z1 = z0 + bd, bh = 1.45, fl = 0.72;
  const bw = x1 - x0;
  kit.box(CREAM, [0, bh / 2, (z0 + z1) / 2], [bw, bh, bd]);
  kit.box(CONCRETE, [0, 0.06, (z0 + z1) / 2], [bw + 0.03, 0.12, bd + 0.03]);
  kit.box('#9ca3af', [0, bh + 0.02, (z0 + z1) / 2], [bw + 0.06, 0.05, bd + 0.06]);
  kit.box(GREEN, [0, bh + 0.08, z1 + 0.02], [bw + 0.06, 0.1, 0.03]);
  const shops = Math.max(4, Math.floor(bw / 0.5));
  const sw = bw / shops;
  for (let i = 0; i < shops; i++) {
    const x = x0 + sw * (i + 0.5);
    kit.box('#3b342e', [x, 0.32, z1 + 0.004], [sw - 0.08, 0.5, 0.01]);
    // Shutters part-way down, the shop's own signboard over each.
    const down = c.r() * 0.3;
    if (down > 0.05) kit.box('#9ca3af', [x, 0.57 - down / 2, z1 + 0.008], [sw - 0.08, down, 0.01]);
    kit.box(SHOP_SIGNS[i % SHOP_SIGNS.length], [x, 0.64, z1 + 0.012], [sw - 0.06, 0.1, 0.02]);
    if (!low) {
      kit.box('#f8fafc', [x, 0.64, z1 + 0.024], [sw * 0.5, 0.025, 0.004]);
      // Wares spilled out on the walk.
      kit.box(pick(c, GOODS), [x - 0.08, 0.09, z1 + 0.1], [0.12, 0.1, 0.1]);
      kit.box(pick(c, GOODS), [x + 0.07, 0.07, z1 + 0.12], [0.1, 0.06, 0.1]);
    }
  }
  // The gallery upstairs: a walkway slab, a railing and the windows of the offices behind it.
  kit.box(CONCRETE, [0, fl, z1 + 0.09], [bw, 0.04, 0.18]);
  kit.bar(STEEL, [x0, fl + 0.17, z1 + 0.17], [x1, fl + 0.17, z1 + 0.17], 0.018);
  for (let i = 0; i <= shops; i += low ? 2 : 1) kit.box(STEEL, [x0 + sw * i, fl + 0.09, z1 + 0.17], [0.015, 0.16, 0.015]);
  for (let i = 0; i < shops; i++) kit.box(`glass${i % 3}`, [x0 + sw * (i + 0.5), fl + 0.36, z1 + 0.004], [sw * 0.55, 0.26, 0.01]);
  // On the roof: tanks, a stair hut, and the market's name on a frame facing the street.
  for (let i = 0; i < Math.max(2, Math.floor(bw / 1.6)); i++) tank(c, x0 + 0.45 + i * 1.6, bh + 0.045, z0 + 0.3);
  kit.box(CREAM, [x1 - 0.45, bh + 0.2, z0 + 0.35], [0.5, 0.36, 0.4]);
  kit.box('#9ca3af', [x1 - 0.45, bh + 0.4, z0 + 0.35], [0.56, 0.04, 0.46]);
  const sgw = Math.min(3.2, bw * 0.55);
  for (const s of [-1, 1]) kit.box(STEEL, [s * sgw * 0.4, bh + 0.2, z1 - 0.18], [0.03, 0.36, 0.03]);
  sign(c, 0, bh + 0.48, z1 - 0.18, sgw, 0.32, WHITE, GREEN_DEEP, 12, [0.5, 0.55, 0.45]);

  // The stalls: rows across the yard, each stall a counter under its own sheet of roofing.
  const front = d / 2 - 0.78;
  const rowD = 0.5, aisle = 0.34;
  const rows = clamp(Math.floor((front - (z1 + 0.42) + aisle) / (rowD + aisle)), 1, 3);
  const top = z1 + 0.42 + (front - (z1 + 0.42) - (rows * rowD + (rows - 1) * aisle)) / 2;
  const stallW = 0.46;
  const per = Math.floor((w - 0.5) / stallW);
  const sx0 = -(per * stallW) / 2;
  const mid = Math.floor(per / 2);
  let lampI = 0;
  for (let r = 0; r < rows; r++) {
    const za = top + r * (rowD + aisle), zb = za + rowD;
    for (let i = 0; i < per; i++) {
      if (i === mid) continue; // the cross aisle, in line with the gate
      const xa = sx0 + i * stallW, xb = xa + stallW, x = (xa + xb) / 2;
      kit.box(WOOD, [x, 0.14, zb - 0.12], [stallW - 0.06, 0.2, 0.2]);
      // Posts at the stall boundaries (shared with the next stall), just under the roof's front edge.
      kit.box(WOOD_DARK, [xa + 0.02, 0.26, zb + 0.02], [0.022, 0.44, 0.022]);
      if (i === per - 1 || i === mid - 1) kit.box(WOOD_DARK, [xb - 0.02, 0.26, zb + 0.02], [0.022, 0.44, 0.022]);
      if (!low) {
        // Goods heaped on the front of the counter: tomatoes, peppers, yams, cloth, buckets.
        kit.box(pick(c, GOODS), [x - 0.08, 0.27, zb - 0.07], [0.12, 0.06, 0.1]);
        kit.box(pick(c, GOODS), [x + 0.09, 0.27, zb - 0.07], [0.1, 0.07, 0.1]);
      }
      const roll = c.r();
      const base = roll < 0.16 ? pick(c, TARP) : roll < 0.22 ? '#c2410c' : pick(c, ZINC);
      // Every trader roofed their own stall: the heights never quite line up.
      const lift = (r % 2) * 0.04 + c.r() * 0.05;
      zinc(c, xa - 0.005, xb + 0.005, za - 0.04, zb + 0.12, 0.6 + lift, 0.5 + lift, base, 3, 0.3);
      // A bulb under every few roofs, lit at night.
      if (i % 3 === 1 && lampI < 12) {
        kit.box(`lamp${lampI++ % 4}`, [x, 0.46, zb + 0.06], [0.03, 0.03, 0.03]);
        glowPool(c, x, zb + 0.15, 0.24, scale(WARM, 0.2));
      }
    }
  }
  // Shoppers in the aisles.
  const aisleFree = (x: number, z: number) => {
    for (let r = 0; r < rows; r++) {
      const za = top + r * (rowD + aisle);
      if (z > za - 0.06 && z < za + rowD + 0.14 && Math.abs(x - (sx0 + (mid + 0.5) * stallW)) > stallW / 2 - 0.04) return false;
    }
    return true;
  };
  crowd(c, low ? 10 : 26, -w / 2 + 0.3, z1 + 0.25, w / 2 - 0.3, front + 0.1, 0.04, aisleFree);

  // Along the street: umbrellas over the women's tables, a barrow, a keke and an okada.
  const uz = d / 2 - 0.42;
  const nU = Math.floor((w - 1.6) / 0.62);
  const UMB = [['#dc2626', '#f8fafc'], ['#facc15', '#1d4ed8'], ['#16a34a', '#f8fafc'], ['#f97316', '#fde68a'], ['#1d4ed8', '#f8fafc'], ['#be123c', '#facc15']] as const;
  for (let i = 0; i < nU; i++) {
    const x = -((nU - 1) * 0.62) / 2 + i * 0.62;
    if (Math.abs(x) < 0.3) continue;
    umbrella(c, x, uz, 0.3, 0.5, UMB[i % UMB.length], 8);
    kit.box(WOOD, [x, 0.13, uz], [0.32, 0.03, 0.2]);
    if (!low) {
      // Basins of tomatoes and heaps of pepper on the table, the seller beside it.
      kit.post(pick(c, ['#dc2626', '#f97316', '#b91c1c', '#facc15']), [x - 0.07, 0.145, uz], 0.05, 0.035, 6);
      kit.post(pick(c, ['#16a34a', '#dc2626', '#a16207', '#f5f5f4']), [x + 0.08, 0.145, uz], 0.045, 0.035, 6);
      person(c, x + 0.05, uz - 0.17, 0.04, pick(c, ['#db2777', '#9333ea', '#16a34a', '#f97316']), true);
    }
  }
  if (!low) {
    // The truck pusher's barrow (an omolanke) loaded with sacks.
    const bx = 0.32, bz = d / 2 - 0.2;
    kit.box('#2563eb', [bx, 0.13, bz], [0.18, 0.08, 0.32]);
    kit.box('#e7d3b1', [bx, 0.2, bz], [0.15, 0.08, 0.26]);
    kit.bar(STEEL, [bx - 0.07, 0.12, bz + 0.15], [bx - 0.07, 0.08, bz + 0.32], 0.014);
    kit.bar(STEEL, [bx + 0.07, 0.12, bz + 0.15], [bx + 0.07, 0.08, bz + 0.32], 0.014);
    kit.box(TYRE, [bx, 0.07, bz - 0.06], [0.2, 0.07, 0.07]);
    keke(c, -w / 2 + 0.35, d / 2 - 0.25, 0.3);
    okada(c, w / 2 - 0.3, d / 2 - 0.2, -0.4);
    okada(c, w / 2 - 0.5, d / 2 - 0.22, -0.2, '#1f2937');
  }
  return done(c);
}

/* ---------- The mall ---------- */

/**
 * The shopping mall and cinema: a long low box clad in white with a glass shopfront the whole way along, a taller
 * glass atrium at the middle under the mall's red sign, a cinema's blade sign and film posters at one end, a skylight
 * down the roof among the air-conditioning plant, and in front a car park of bays, cars, a taxi, a keke dropping off,
 * a trolley bay, palms and flags.
 */
function buildMall(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 2);
  const { kit } = c;
  kit.box(PAVING, [0, 0.02, 0], [w, 0.04, d]);
  const lotD = d >= 5 ? 1.55 : 1.3;
  const x0 = -w / 2 + 0.18, x1 = w / 2 - 0.18, z0 = -d / 2 + 0.15, z1 = d / 2 - lotD - 0.3;
  const bw = x1 - x0, bd = z1 - z0, zc = (z0 + z1) / 2, H = 1.55;
  kit.box('#e5e7eb', [0, H / 2, zc], [bw, H, bd]);
  kit.box('#6b7280', [0, 0.05, zc], [bw + 0.03, 0.1, bd + 0.03]);
  // Cladding bands, and the glass shopfront along the whole front.
  kit.box(WHITE, [0, H - 0.18, zc], [bw + 0.04, 0.36, bd + 0.04]);
  kit.box('#d4d8de', [0, H + 0.01, zc], [bw + 0.04, 0.03, bd + 0.04]);
  parapet(c, 0, zc, bw + 0.08, bd + 0.08, H, 0.08, '#475569');
  kit.box('glass0', [0, 0.62, z1 + 0.006], [bw - 0.3, 1.0, 0.012]);
  const panes = Math.round((bw - 0.3) / 0.3);
  for (let i = 0; i <= panes; i++) kit.box('#334155', [-(bw - 0.3) / 2 + ((bw - 0.3) / panes) * i, 0.62, z1 + 0.016], [0.025, 1.0, 0.012]);
  kit.box('#334155', [0, 0.82, z1 + 0.016], [bw - 0.3, 0.025, 0.012]);
  kit.box('#334155', [0, 1.13, z1 + 0.016], [bw - 0.3, 0.03, 0.012]);
  // The glass sides, round the corners.
  for (const s of [-1, 1]) kit.box('glass1', [s * (bw / 2 + 0.006), 0.62, zc + bd * 0.15], [0.012, 1.0, bd * 0.6]);
  // The atrium at the middle: taller, glazed, standing proud of the front under the mall's sign.
  const aw = Math.min(1.5, bw * 0.34), ad = 0.35, ah = 2.1, az = z1 + ad / 2 - 0.1;
  kit.box('#cbd5e1', [0, ah / 2, az - 0.15], [aw, ah, ad + 0.3]);
  kit.box('glass2', [0, 0.95, az + ad / 2 + 0.006], [aw - 0.1, 1.6, 0.012]);
  for (const s of [-1, 1]) kit.box('glass2', [s * (aw / 2 + 0.006), 0.95, az], [0.012, 1.6, ad - 0.06]);
  for (let i = 1; i < 4; i++) kit.box('#475569', [-aw / 2 + (aw / 4) * i, 0.95, az + ad / 2 + 0.016], [0.025, 1.6, 0.012]);
  kit.box('#e2e8f0', [0, ah + 0.03, az - 0.15], [aw + 0.08, 0.06, ad + 0.38]);
  kit.box('#dc2626', [0, ah + 0.065, az - 0.15], [aw + 0.1, 0.012, ad + 0.4]);
  sign(c, 0, ah - 0.22, az + ad / 2 + 0.03, aw * 0.9, 0.3, '#dc2626', WHITE, 6, [0.75, 0.2, 0.18]);
  kit.box('#334155', [0, 0.62, az + ad / 2 + 0.25], [aw + 0.2, 0.05, 0.5]);
  // The cinema end: a blade sign up the corner and the films showing.
  const cx = x0 + 0.3;
  kit.box('#111827', [cx, 1.25, z1 + 0.12], [0.1, 1.1, 0.28]);
  for (let i = 0; i < 6; i++) kit.box('#facc15', [cx + 0.055, 1.62 - i * 0.16, z1 + 0.12], [0.012, 0.11, 0.16]);
  {
    const f = frame([cx + 0.062, 1.25, z1 + 0.12], [0, Math.PI / 2, 0]);
    glowPanel(c, 0, 0, 0, 0.24, 1.05, [0.75, 0.6, 0.15], f);
  }
  const posters = ['#7c3aed', '#dc2626', '#0ea5e9', '#f97316'];
  const px0 = x0 + 0.6;
  posters.forEach((p, i) => {
    const x = px0 + i * 0.28;
    if (x > -aw / 2 - 0.2) return;
    kit.box('#111827', [x, 1.35, z1 + 0.012], [0.22, 0.3, 0.012]);
    kit.box(p, [x, 1.35, z1 + 0.02], [0.18, 0.26, 0.006]);
    glowPanel(c, x, 1.35, z1 + 0.026, 0.18, 0.26, scale([0.9, 0.9, 0.9], 0.5));
  });
  // The roof: a skylight down the middle, the air-conditioning plant and a tank.
  const sk = Math.max(0.6, bw - 1.6);
  kit.quad('glass3', [-sk / 2, H + 0.05, zc - 0.22], [sk / 2, H + 0.05, zc - 0.22], [sk / 2, H + 0.22, zc], [-sk / 2, H + 0.22, zc], [0, 1, -1]);
  kit.quad('glass3', [-sk / 2, H + 0.22, zc], [sk / 2, H + 0.22, zc], [sk / 2, H + 0.05, zc + 0.22], [-sk / 2, H + 0.05, zc + 0.22], [0, 1, 1]);
  for (let i = 0; i < (low ? 3 : 6); i++) acUnit(c, x0 + 0.35 + (i % 3) * 0.3, H + 0.045, z0 + 0.25 + Math.floor(i / 3) * 0.25);
  tank(c, x1 - 0.35, H + 0.045, z0 + 0.3);
  tank(c, x1 - 0.6, H + 0.045, z0 + 0.3);
  if (bd > 1.5) kit.box('#cbd5e1', [x1 - 0.5, H + 0.12, z1 - 0.35], [0.5, 0.16, 0.3]);

  // The car park: tarmac, bays, cars nose-in, a taxi, a keke dropping off, a trolley bay.
  const lz0 = d / 2 - lotD, lz1 = d / 2 - 0.05;
  kit.flat(ASPHALT, -w / 2 + 0.1, lz0, w / 2 - 0.1, lz1, 0.045);
  kit.flat('#9ca3af', -w / 2 + 0.1, z1, w / 2 - 0.1, lz0, 0.046);
  const bayW = 0.46;
  const bays = Math.floor((w - 0.4) / bayW);
  const bx0 = -(bays * bayW) / 2;
  const rowZ = lz0 + 0.42;
  for (let i = 0; i <= bays; i++) kit.flat(LINE, bx0 + i * bayW - 0.008, lz0 + 0.04, bx0 + i * bayW + 0.008, lz0 + 0.8, 0.05);
  // Arrows and the drive lane along the front.
  kit.flat('#facc15', -w / 2 + 0.2, lz1 - 0.2, w / 2 - 0.2, lz1 - 0.18, 0.05);
  for (let i = 0; i < bays; i++) {
    if (c.r() < (low ? 0.6 : 0.3)) continue;
    car(c, bx0 + (i + 0.5) * bayW, rowZ, Math.PI, i === 2 ? '#facc15' : pick(c, CARS.slice(0, 7)), c.r() < 0.3);
  }
  if (!low) {
    keke(c, aw / 2 + 0.35, lz1 - 0.35, Math.PI / 2);
    for (let i = 0; i < 4; i++) kit.box('#94a3b8', [-aw / 2 - 0.4, 0.1, z1 + 0.12 + i * 0.05], [0.12, 0.1, 0.04]);
    crowd(c, 14, -aw, z1 + 0.05, aw, lz0 - 0.02);
  }
  for (const s of [-1, 1]) {
    palm(c, s * (aw / 2 + 0.25), z1 + 0.15, 1.0);
    if (!low) palm(c, s * (w / 2 - 0.3), z1 + 0.15, 0.95);
  }
  flag(c, -w / 2 + 0.2, lz0 - 0.08, 1.0, NIGERIA);
  flag(c, -w / 2 + 0.5, lz0 - 0.08, 1.0, ['#dc2626', WHITE, '#dc2626']);
  lamp(c, -w / 2 + 0.25, lz1 - 0.12, 0.8, 0, 0.12, -0.05);
  lamp(c, w / 2 - 0.25, lz1 - 0.12, 0.8, 1, -0.12, -0.05);
  return done(c);
}

/* ---------- The boutique ---------- */

/**
 * The boutique: a smart two-storey shopfront in white, black and gold, mannequins in agbada and lace in the windows
 * under a striped awning, tall windows and gold balconies upstairs, the name in gold on the parapet, a red carpet to
 * the door with a guard beside it, topiary in pots, and a black SUV on the forecourt.
 */
function buildBoutique(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 3);
  const { kit } = c;
  kit.box('#e7e2d8', [0, 0.02, 0], [w, 0.04, d]);
  const x0 = -w / 2 + 0.25, x1 = w / 2 - 0.25, z0 = -d / 2 + 0.15, z1 = d / 2 - 0.9;
  const bw = x1 - x0, bd = z1 - z0, zc = (z0 + z1) / 2, H = 1.7;
  kit.box('#faf7f2', [0, H / 2, zc], [bw, H, bd]);
  kit.box(BLACK, [0, 0.45, z1 - 0.02], [bw + 0.02, 0.9, 0.06]);
  kit.box(GOLD, [0, 0.91, z1 + 0.01], [bw + 0.04, 0.035, 0.05]);
  kit.box('#d9d4ca', [0, H + 0.01, zc], [bw, 0.02, bd]);
  parapet(c, 0, zc, bw + 0.06, bd + 0.06, H - 0.04, 0.12, BLACK, GOLD);
  kit.box(BLACK, [0, H + 0.2, z1 - 0.02], [bw * 0.8, 0.26, 0.06]);
  kit.box(GOLD, [0, H + 0.34, z1 - 0.02], [bw * 0.8 + 0.02, 0.02, 0.07]);
  sign(c, 0, H + 0.2, z1 + 0.02, Math.min(2.4, bw * 0.75), 0.17, BLACK, GOLD, 7, [0.6, 0.48, 0.2]);
  // The display windows either side of the door, with the mannequins in them.
  const ww = (bw - 0.6) / 2;
  const AGBADA = ['#1e3a8a', '#065f46', '#7f1d1d', '#f8fafc', '#a16207', '#6d28d9'];
  for (const s of [-1, 1]) {
    const wx = s * (0.3 + ww / 2);
    kit.box('glass0', [wx, 0.45, z1 + 0.012], [ww - 0.08, 0.66, 0.012]);
    glowPanel(c, wx, 0.45, z1 + 0.06, ww - 0.08, 0.66, [0.55, 0.45, 0.3]);
    const n = Math.max(2, Math.floor(ww / 0.3));
    for (let i = 0; i < n; i++) {
      const mx = wx - ww / 2 + 0.15 + (i * (ww - 0.3)) / Math.max(1, n - 1);
      const col = AGBADA[(i + (s > 0 ? 3 : 0)) % AGBADA.length];
      kit.box(col, [mx, 0.32, z1 + 0.05], [0.12, 0.42, 0.05]);
      kit.box(SKIN[1], [mx, 0.57, z1 + 0.05], [0.05, 0.06, 0.05]);
      kit.box(i % 2 ? '#7f1d1d' : col, [mx, 0.62, z1 + 0.05], [0.06, 0.04, 0.055]);
    }
  }
  kit.box('#111827', [0, 0.38, z1 + 0.012], [0.46, 0.72, 0.012]);
  for (const s of [-1, 1]) kit.box(GOLD, [s * 0.04, 0.38, z1 + 0.024], [0.012, 0.2, 0.012]);
  // The striped awning over the shopfront.
  const stripes = Math.round(bw / 0.16);
  for (let i = 0; i < stripes; i++) {
    const a = x0 + (bw / stripes) * i, b = a + bw / stripes;
    kit.quad(i % 2 ? BLACK : GOLD, [a, 0.98, z1 + 0.02], [b, 0.98, z1 + 0.02], [b, 0.86, z1 + 0.36], [a, 0.86, z1 + 0.36], [0, 0.34, 0.12]);
  }
  kit.box(BLACK, [0, 0.83, z1 + 0.36], [bw, 0.06, 0.01]);
  // Upstairs: tall windows with gold Juliet balconies.
  const nw = Math.max(3, Math.floor(bw / 0.6));
  for (let i = 0; i < nw; i++) {
    const x = x0 + (bw / nw) * (i + 0.5);
    kit.box(BLACK, [x, 1.3, z1 + 0.006], [0.3, 0.5, 0.012]);
    kit.box(`glass${1 + (i % 2)}`, [x, 1.3, z1 + 0.014], [0.24, 0.44, 0.01]);
    kit.box(GOLD, [x, 1.11, z1 + 0.08], [0.34, 0.015, 0.012]);
    kit.box(GOLD, [x, 1.06, z1 + 0.05], [0.36, 0.02, 0.07]);
  }
  for (const s of [-1, 1]) kit.box('glass1', [s * (bw / 2 + 0.006), 1.3, zc], [0.012, 0.44, bd * 0.5]);
  // Roof: a tank, the air-conditioning, and a little roof garden.
  tank(c, x0 + 0.35, H + 0.08, z0 + 0.3);
  acUnit(c, x1 - 0.35, H + 0.08, z0 + 0.25);
  acUnit(c, x1 - 0.65, H + 0.08, z0 + 0.25);
  // A roof terrace for the fittings and the photos: decking, gold umbrellas, loungers and plants in pots.
  kit.flat('#9a7552', x0 + 0.15, zc - 0.1, x1 - 0.15, z1 - 0.12, H + 0.025);
  for (const s of [-1, 1]) {
    umbrella(c, s * bw * 0.22, zc + bd * 0.18, 0.24, 0.3, [GOLD, WHITE], 8, H + 0.02);
    kit.box(WHITE, [s * bw * 0.22 + 0.18, H + 0.06, zc + bd * 0.18], [0.1, 0.03, 0.22]);
    if (!low) kit.shape('#3f8f3a', ICO, [s * (bw / 2 - 0.25), H + 0.12, z1 - 0.25], [0.1, 0.1, 0.1]);
  }

  // The forecourt: a red carpet, potted topiary, the guard, wall lanterns and the madam's SUV.
  kit.flat('#f1ece2', x0, z1, x1, d / 2 - 0.04, 0.045);
  kit.flat('#b91c1c', -0.17, z1, 0.17, d / 2 - 0.1, 0.05);
  for (const s of [-1, 1]) {
    kit.post('#1f2937', [s * 0.38, 0.04, z1 + 0.2], 0.06, 0.12, 8, 1.2);
    kit.shape('#2f7d32', ICO, [s * 0.38, 0.27, z1 + 0.2], [0.09, 0.12, 0.09]);
    kit.box(`lamp${s > 0 ? 1 : 0}`, [s * 0.3, 0.72, z1 + 0.03], [0.04, 0.07, 0.04]);
    glowPool(c, s * 0.3, z1 + 0.2, 0.3, scale(WARM, 0.25));
  }
  person(c, 0.28, z1 + 0.42, 0.04, BLACK);
  if (!low) {
    car(c, x1 - 0.32, d / 2 - 0.35, Math.PI / 2 + 0.1, BLACK, true);
    person(c, -0.6, z1 + 0.55, 0.04, '#db2777');
    person(c, -0.5, z1 + 0.6, 0.04, '#f8fafc');
  }
  // The guard's post at the corner.
  kit.box(WHITE, [x0 + 0.2, 0.22, d / 2 - 0.3], [0.28, 0.36, 0.26]);
  kit.box(BLACK, [x0 + 0.2, 0.42, d / 2 - 0.3], [0.34, 0.04, 0.32]);
  kit.box('glass3', [x0 + 0.2, 0.26, d / 2 - 0.169], [0.18, 0.12, 0.01]);
  return done(c);
}

/* ---------- The bank ---------- */

/**
 * The bank branch: a two-storey hall in white and the bank's green, glass along the ground floor and a band of blue
 * glass above, the gold logo and name over a green entrance portal, an ATM gallery to one side with its queue, a
 * railing along the street with the guard's gatehouse at the gate, the bullion van in the yard, and on the roof the
 * tanks, the VSAT dish and the mast; the generator house behind.
 */
function buildBank(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 4);
  const { kit } = c;
  kit.box('#d6d3d1', [0, 0.02, 0], [w, 0.04, d]);
  const yardD = d >= 4 ? 1.05 : 0.85;
  const x0 = -w / 2 + 0.2, x1 = w / 2 - 0.78, z0 = -d / 2 + 0.2, z1 = d / 2 - yardD;
  const bw = x1 - x0, bd = z1 - z0, zc = (z0 + z1) / 2, xc = (x0 + x1) / 2, H = 1.55;
  kit.box(WHITE, [xc, H / 2, zc], [bw, H, bd]);
  kit.box('#9ca3af', [xc, 0.06, zc], [bw + 0.03, 0.12, bd + 0.03]);
  kit.box('#d9dde0', [xc, H + 0.01, zc], [bw, 0.02, bd]);
  parapet(c, xc, zc, bw + 0.08, bd + 0.08, H - 0.02, 0.14, GREEN_DEEP, GOLD);
  // The plant room on the roof, painted in the bank's green with its logo on top for the map to see.
  const prw = Math.min(1.1, bw * 0.4), prd = Math.min(0.7, bd * 0.4);
  kit.box(GREEN_DEEP, [xc, H + 0.17, zc + 0.05], [prw, 0.32, prd]);
  kit.box(GREEN, [xc, H + 0.34, zc + 0.05], [prw + 0.04, 0.03, prd + 0.04]);
  kit.post(GOLD, [xc, H + 0.355, zc + 0.05], Math.min(prw, prd) * 0.36, 0.015, 16);
  kit.post(GREEN_DEEP, [xc, H + 0.36, zc + 0.05], Math.min(prw, prd) * 0.2, 0.015, 8);
  if (!low) for (let i = 0; i < 4; i++) kit.box('#0f3d24', [xc - prw / 2 + 0.15 + i * ((prw - 0.3) / 3), H + 0.17, zc + 0.05 + prd / 2 + 0.004], [0.12, 0.16, 0.01]);
  // The ground floor's glass with green mullions, the blue band upstairs.
  kit.box('glass0', [xc, 0.42, z1 + 0.006], [bw - 0.2, 0.56, 0.012]);
  for (let i = 0; i <= 6; i++) kit.box(GREEN_DEEP, [x0 + 0.1 + ((bw - 0.2) / 6) * i, 0.42, z1 + 0.016], [0.03, 0.56, 0.012]);
  kit.box('#1e3a8a', [xc, 1.08, z1 + 0.006], [bw - 0.1, 0.44, 0.012]);
  kit.box('glass1', [xc, 1.08, z1 + 0.014], [bw - 0.2, 0.36, 0.01]);
  for (const s of [-1, 1]) kit.box('glass1', [xc + s * (bw / 2 + 0.006), 0.75, zc], [0.012, 0.7, bd * 0.7]);
  // The entrance portal: a green frame standing proud, the logo and the name over it.
  kit.box(GREEN_DEEP, [xc, 0.72, z1 + 0.12], [0.8, 1.44, 0.22]);
  kit.box('glass2', [xc, 0.38, z1 + 0.235], [0.5, 0.62, 0.012]);
  kit.box(GREEN, [xc, 0.04 + 0.03, z1 + 0.4], [0.9, 0.06, 0.4]);
  kit.shape(GOLD, unitCyl(16, 1), [xc, 1.1, z1 + 0.235], [0.16, 0.02, 0.16], [Math.PI / 2, 0, 0]);
  kit.shape(GREEN_DEEP, unitCyl(8, 1), [xc, 1.1, z1 + 0.247], [0.08, 0.01, 0.08], [Math.PI / 2, 0, 0]);
  glowPanel(c, xc, 1.1, z1 + 0.26, 0.34, 0.34, [0.55, 0.45, 0.15]);
  sign(c, xc, H + 0.24, z1 + 0.02, Math.min(2.2, bw * 0.8), 0.2, GREEN_DEEP, GOLD, 10, [0.15, 0.4, 0.2]);
  // The ATM gallery: two machines under a canopy, their screens lit, and the queue.
  const ax = w / 2 - 0.42;
  kit.box(WHITE, [ax, 0.4, z1 - 0.35], [0.56, 0.8, 0.7]);
  kit.box(GREEN_DEEP, [ax, 0.84, z1 - 0.25], [0.64, 0.08, 0.9]);
  sign(c, ax, 0.68, z1 + 0.012, 0.44, 0.1, GOLD, GREEN_DEEP, 3, [0.4, 0.35, 0.1]);
  for (const s of [-1, 1]) {
    kit.box('#374151', [ax + s * 0.13, 0.3, z1 + 0.02], [0.18, 0.46, 0.06]);
    kit.box('#38bdf8', [ax + s * 0.13, 0.4, z1 + 0.052], [0.11, 0.08, 0.006]);
    glowPanel(c, ax + s * 0.13, 0.4, z1 + 0.058, 0.11, 0.08, [0.2, 0.55, 0.85]);
  }
  for (let i = 0; i < (low ? 3 : 7); i++) person(c, ax + (i % 2 ? 0.03 : -0.03), z1 + 0.18 + i * 0.1);
  // The railing along the street, its gate and the guard's house.
  const fz = d / 2 - 0.1;
  kit.box(WHITE, [-w / 4 - 0.25, 0.09, fz], [w / 2 - 0.6, 0.1, 0.06]);
  kit.box(WHITE, [w / 4 + 0.25, 0.09, fz], [w / 2 - 0.6, 0.1, 0.06]);
  fence(c, -w / 2 + 0.1, fz, -0.55, fz, 0.32, GREEN_DEEP, 0.18);
  fence(c, 0.55, fz, w / 2 - 0.1, fz, 0.32, GREEN_DEEP, 0.18);
  for (const s of [-1, 1]) kit.box(WHITE, [s * 0.55, 0.22, fz], [0.1, 0.4, 0.1]);
  const gx = -0.85, gz = fz - 0.3;
  kit.box(WHITE, [gx, 0.22, gz], [0.32, 0.36, 0.3]);
  kit.box(GREEN_DEEP, [gx, 0.42, gz], [0.4, 0.04, 0.38]);
  kit.box('glass3', [gx + 0.05, 0.28, gz + 0.152], [0.18, 0.12, 0.01]);
  kit.box('#facc15', [0, 0.2, fz], [1.0, 0.025, 0.025]);
  person(c, gx + 0.25, gz + 0.12, 0.04, '#1f2937');
  // The yard: the bullion van and a manager's car.
  if (!low) {
    const vx = x0 + 0.35, vz = z1 + 0.42;
    const f = frame([vx, 0.04, vz], [0, Math.PI / 2, 0]);
    kit.box(WHITE, [0, 0.17, 0], [0.36, 0.26, 0.78], undefined, f);
    kit.box(GREEN, [0, 0.12, 0], [0.365, 0.04, 0.78], undefined, f);
    kit.box(CAR_GLASS, [0, 0.24, 0.3], [0.33, 0.08, 0.18], undefined, f);
    for (const s of [-1, 1]) kit.box(TYRE, [0, 0.05, s * 0.26], [0.38, 0.1, 0.13], undefined, f);
    lamp(c, xc + 0.6, z1 + 0.5, 0.7, 2, 0, -0.1);
  }
  // On the roof: tanks, the VSAT dish, a mast with its red light; behind, the generator house.
  tank(c, x0 + 0.3, H + 0.02, z0 + 0.3);
  tank(c, x0 + 0.58, H + 0.02, z0 + 0.3);
  kit.shape(WHITE, unitCyl(12, 1), [x1 - 0.4, H + 0.3, z0 + 0.4], [0.18, 0.02, 0.18], [0.9, 0, 0]);
  kit.box(STEEL, [x1 - 0.4, H + 0.18, z0 + 0.35], [0.03, 0.16, 0.03]);
  kit.box(STEEL, [xc - 0.2, H + 0.5, z0 + 0.25], [0.035, 1.0, 0.035]);
  kit.box('#dc2626', [xc - 0.2, H + 1.02, z0 + 0.25], [0.05, 0.04, 0.05]);
  acUnit(c, x1 - 0.3, H + 0.02, z1 - 0.3);
  acUnit(c, x0 + 0.3, H + 0.02, z1 - 0.3);
  const gnx = w / 2 - 0.42, gnz = z0 + 0.3;
  kit.box('#4d7c0f', [gnx, 0.22, gnz], [0.5, 0.36, 0.4]);
  kit.box('#365314', [gnx, 0.41, gnz], [0.54, 0.03, 0.44]);
  kit.post(DARK, [gnx + 0.15, 0.42, gnz - 0.1], 0.02, 0.18, 5);
  return done(c);
}

/* ---------- The hotel ---------- */

/**
 * The grand hotel: a tower of glass bands between white floors and fins, its crown carrying the hotel's name and a
 * helipad on the roof, a glazed lobby podium with a porte-cochère over the drive and a fountain in the loop, and to
 * the side the pool deck: blue water lit at night, loungers, striped umbrellas, palms and a pool bar; convoys of black
 * SUVs at the door, flags and a name wall along the street.
 */
function buildHotel(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 5);
  const { kit } = c;
  kit.box('#d6d3d1', [0, 0.02, 0], [w, 0.04, d]);
  const tw = w >= 5 ? 2.7 : 2.2, td = 1.05, floors = 7, fh = 0.52, H = 0.62 + floors * fh;
  const tx = -w / 2 + 0.3 + tw / 2, tz = -d / 2 + 0.3 + td / 2;
  const tf = tz + td / 2;
  kit.box('#f5f5f4', [tx, H / 2, tz], [tw, H, td]);
  // Each floor: a band of glass across the front and down the ends, a white slab between.
  for (let f = 0; f < floors; f++) {
    const y = 0.62 + f * fh + fh * 0.5;
    kit.box(`glass${f % 4}`, [tx, y, tf + 0.006], [tw - 0.14, fh * 0.62, 0.012]);
    for (const s of [-1, 1]) kit.box(`glass${(f + 2) % 4}`, [tx + s * (tw / 2 + 0.006), y, tz], [0.012, fh * 0.62, td - 0.2]);
    kit.box('#e7e5e4', [tx, 0.62 + f * fh, tf + 0.02], [tw + 0.02, 0.05, 0.05]);
  }
  const fins = Math.round(tw / 0.34);
  for (let i = 0; i <= fins; i++) kit.box(WHITE, [tx - tw / 2 + (tw / fins) * i, 0.62 + (floors * fh) / 2, tf + 0.03], [0.04, floors * fh, 0.05]);
  // The crown: a deep band in the hotel's blue with the name in gold, lit at night; a helipad on top.
  kit.box('#1e3a8a', [tx, H + 0.17, tz], [tw + 0.06, 0.34, td + 0.06]);
  sign(c, tx, H + 0.17, tz + td / 2 + 0.04, tw * 0.8, 0.24, '#1e3a8a', GOLD, 9, [0.65, 0.5, 0.18]);
  kit.box('#cbd5e1', [tx, H + 0.35, tz], [tw + 0.06, 0.03, td + 0.06]);
  kit.post('#4b5563', [tx + tw * 0.15, H + 0.36, tz], 0.44, 0.02, 20);
  ring(c, '#facc15', tx + tw * 0.15, tz, 0.36, 0.4, H + 0.385, 20);
  for (const [bx, bz, sx, sz] of [[-0.11, 0, 0.05, 0.36], [0.11, 0, 0.05, 0.36], [0, 0, 0.2, 0.05]] as const) kit.box(WHITE, [tx + tw * 0.15 + bx, H + 0.386, tz + bz], [sx, 0.005, sz]);
  kit.box('#9ca3af', [tx - tw * 0.3, H + 0.5, tz], [0.5, 0.3, 0.5]);
  for (let i = 0; i < 4; i++) kit.box(`lamp${i}`, [tx + tw * 0.15 + Math.cos(i * 1.57 + 0.78) * 0.42, H + 0.4, tz + Math.sin(i * 1.57 + 0.78) * 0.42], [0.03, 0.02, 0.03]);
  // The lobby podium and the porte-cochère out over the drive.
  const px1 = tx + tw / 2 + 0.15, px0 = -w / 2 + 0.2;
  const pz1 = tf + 0.5;
  kit.box(CREAM, [(px0 + px1) / 2, 0.3, (tf - 0.1 + pz1) / 2], [px1 - px0, 0.6, pz1 - tf + 0.1]);
  kit.box('glass4', [(px0 + px1) / 2, 0.3, pz1 + 0.006], [px1 - px0 - 0.2, 0.44, 0.012]);
  kit.box('#b45309', [(px0 + px1) / 2, 0.62, (tf - 0.1 + pz1) / 2], [px1 - px0 + 0.04, 0.04, pz1 - tf + 0.14]);
  if (!low) for (let i = 0; i < 4; i++) kit.shape('#3f8f3a', ICO, [px0 + 0.3 + i * ((px1 - px0 - 0.6) / 3), 0.7, tf + 0.25], [0.1, 0.07, 0.1]);
  const cw = 1.1, cd = 0.6;
  kit.box(WHITE, [tx, 0.55, pz1 + cd / 2], [cw, 0.06, cd]);
  kit.box(GOLD, [tx, 0.545, pz1 + cd + 0.005], [cw + 0.02, 0.07, 0.012]);
  for (const s of [-1, 1]) kit.box(WHITE, [tx + s * (cw / 2 - 0.08), 0.29, pz1 + cd - 0.08], [0.06, 0.5, 0.06]);
  glowPool(c, tx, pz1 + cd / 2, 0.55, scale(WARM, 0.3));
  // The drive: a loop of tarmac round a fountain.
  const dz = pz1 + cd + (d / 2 - pz1 - cd) / 2;
  const dr = Math.min(0.62, (d / 2 - pz1 - 0.1) / 2);
  kit.flat(ASPHALT, tx - cw / 2 - 0.2, pz1, tx + cw / 2 + 0.2, pz1 + cd, 0.045);
  ring(c, ASPHALT, tx, dz, dr * 0.45, dr + 0.2, 0.046, 20);
  kit.post('#d6d3d1', [tx, 0.04, dz], dr * 0.42, 0.08, 12);
  kit.post(WATER, [tx, 0.04, dz], dr * 0.34, 0.085, 12);
  kit.post(WHITE, [tx, 0.04, dz], 0.04, 0.22, 6);
  glowPool(c, tx, dz, dr * 0.4, [0.1, 0.3, 0.45], 0.13);
  if (!low) {
    car(c, tx - 0.25, pz1 + cd / 2, Math.PI / 2, BLACK, true);
    car(c, tx + dr + 0.05, dz + 0.1, Math.PI, BLACK, true);
    person(c, tx + 0.35, pz1 + 0.12, 0.04, '#7f1d1d');
  }
  // The pool deck to the side.
  const qx0 = px1 + 0.1, qx1 = w / 2 - 0.15, qz0 = -d / 2 + 0.3, qz1 = d / 2 - 0.45;
  const qw = qx1 - qx0, qc = (qx0 + qx1) / 2;
  kit.flat('#ece6da', qx0, qz0, qx1, qz1, 0.05);
  const pw = Math.min(0.85, qw * 0.55), pd = (qz1 - qz0) * 0.62;
  const pzc = qz0 + 0.2 + pd / 2;
  kit.box(WHITE, [qc, 0.06, pzc], [pw + 0.1, 0.04, pd + 0.1]);
  kit.box('#22a7d8', [qc, 0.075, pzc], [pw, 0.02, pd]);
  if (!low) for (let i = 1; i < 3; i++) kit.flat('#1b8fbd', qc - pw / 2 + (pw / 3) * i - 0.01, pzc - pd / 2 + 0.05, qc - pw / 2 + (pw / 3) * i + 0.01, pzc + pd / 2 - 0.05, 0.087);
  glowPool(c, qc, pzc, pw * 0.6, [0.05, 0.35, 0.5], 0.09, pd * 0.6);
  c.glow.quad([qc - pw / 2, 0.088, pzc - pd / 2], [qc + pw / 2, 0.088, pzc - pd / 2], [qc + pw / 2, 0.088, pzc + pd / 2], [qc - pw / 2, 0.088, pzc + pd / 2], [0.05, 0.3, 0.42]);
  // Loungers both sides, striped umbrellas, palms, and the pool bar at the end.
  const nl = Math.max(2, Math.floor(pd / 0.32));
  for (let i = 0; i < nl; i++) {
    const z = pzc - pd / 2 + 0.15 + i * ((pd - 0.3) / Math.max(1, nl - 1));
    for (const s of [-1, 1]) {
      const lx = qc + s * (pw / 2 + 0.17);
      if (Math.abs(lx - qc) > qw / 2 - 0.05) continue;
      kit.box(WHITE, [lx, 0.09, z], [0.12, 0.03, 0.26]);
      if (!low && i % 2 === 0) umbrella(c, lx + s * 0.04, z - 0.12, 0.17, 0.32, ['#f8fafc', s > 0 ? '#1e3a8a' : '#dc2626'], 8);
      if (!low && c.r() < 0.4) person(c, lx, z, 0.1, undefined, true);
    }
  }
  kit.box(WOOD, [qc, 0.18, qz1 - 0.2], [Math.min(0.7, qw - 0.2), 0.28, 0.22]);
  zinc(c, qc - Math.min(0.42, qw / 2 - 0.05), qc + Math.min(0.42, qw / 2 - 0.05), qz1 - 0.38, qz1 - 0.02, 0.48, 0.4, '#c8a25a', 4);
  for (const s of [-1, 1]) palm(c, qx1 - 0.1, qz0 + 0.1 + (s > 0 ? pd * 0.5 : 0), 1.15);
  // The front: a lawn, the name on a low wall, flags, palms along the street.
  kit.flat(LAWN, px0, pz1 + 0.1, tx - cw / 2 - 0.25, d / 2 - 0.05, 0.047);
  if (!low) palm(c, px0 + 0.25, pz1 + 0.35, 1.05);
  const nx = px0 + 0.75;
  kit.box(CREAM, [nx, 0.14, d / 2 - 0.2], [1.1, 0.2, 0.12]);
  letters(c, GOLD, nx, 0.14, d / 2 - 0.135, 8, 0.1);
  glowPanel(c, nx, 0.14, d / 2 - 0.12, 1.0, 0.16, [0.4, 0.32, 0.12]);
  flag(c, px0 + 0.2, d / 2 - 0.55, 1.0, NIGERIA);
  if (!low) flag(c, px0 + 0.45, d / 2 - 0.55, 1.0, ['#1e3a8a', GOLD, '#1e3a8a']);
  palm(c, tx + cw / 2 + 0.45, d / 2 - 0.25, 1.0);
  lamp(c, tx - cw / 2 - 0.3, d / 2 - 0.2, 0.75, 1, 0.1, 0);
  return done(c);
}

/* ---------- The nightclub ---------- */

const PINK: RGB = [1, 0.15, 0.6];
const CYAN: RGB = [0.1, 0.85, 1];

/**
 * The nightclub, a castle: a black keep with battlements and four round corner towers, a gold-framed arch over the
 * door, neon fins and a marquee in pink and cyan, a video wall, a rooftop lounge with a plunge pool and string
 * lights, searchlights sweeping up after dark; and out front the red carpet between gold posts and ropes, the queue,
 * the bouncers and the big men's cars.
 */
function buildClub(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 6);
  const { kit, glow } = c;
  kit.box('#3a3a42', [0, 0.02, 0], [w, 0.04, d]);
  kit.flat('#2a2a31', -w / 2 + 0.1, d / 2 - 1.3, w / 2 - 0.1, d / 2 - 0.05, 0.045);
  const x0 = -w / 2 + 0.45, x1 = w / 2 - 0.45, z0 = -d / 2 + 0.4, z1 = d / 2 - 1.3;
  const bw = x1 - x0, bd = z1 - z0, zc = (z0 + z1) / 2, H = 1.7;
  kit.box(BLACK, [0, H / 2, zc], [bw, H, bd]);
  kit.box('#2a2a30', [0, 0.06, zc], [bw + 0.03, 0.12, bd + 0.03]);
  // Battlements round the roof, the merlons capped in gold.
  const merlon = (x: number, z: number, along: boolean) => {
    kit.box('#1b1b20', [x, H + 0.1, z], along ? [0.14, 0.2, 0.08] : [0.08, 0.2, 0.14]);
    if (!low) kit.box(GOLD, [x, H + 0.205, z], along ? [0.15, 0.012, 0.09] : [0.09, 0.012, 0.15]);
  };
  for (let x = x0 + 0.35; x <= x1 - 0.3; x += 0.28) { merlon(x, z0 + 0.04, true); merlon(x, z1 - 0.04, true); }
  for (let z = z0 + 0.35; z <= z1 - 0.3; z += 0.28) { merlon(x0 + 0.04, z, false); merlon(x1 - 0.04, z, false); }
  // Corner towers, each with a ring of neon round the top.
  const tr = 0.32, th = H + 0.55;
  [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([x, z], i) => {
    kit.post('#26262c', [x, 0.04, z], tr, th, 12);
    kit.post('#1b1b20', [x, 0.04 + th, z], tr + 0.04, 0.12, 12);
    kit.post(i % 2 ? '#db2777' : '#06b6d4', [x, 0.04 + th - 0.12, z], tr + 0.012, 0.04, 12);
    for (let k = 0; k < (low ? 4 : 8); k++) {
      const a = (k / (low ? 4 : 8)) * Math.PI * 2;
      kit.box('#1b1b20', [x + Math.cos(a) * (tr - 0.02), th + 0.24, z + Math.sin(a) * (tr - 0.02)], [0.09, 0.14, 0.09], [0, -a, 0]);
    }
    const col = i % 2 ? PINK : CYAN;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, b = ((k + 1) / 12) * Math.PI * 2;
      const r = tr + 0.02, y0 = 0.04 + th - 0.13, y1 = y0 + 0.06;
      glow.quad([x + Math.cos(a) * r, y0, z + Math.sin(a) * r], [x + Math.cos(b) * r, y0, z + Math.sin(b) * r], [x + Math.cos(b) * r, y1, z + Math.sin(b) * r], [x + Math.cos(a) * r, y1, z + Math.sin(a) * r], scale(col, 0.9));
    }
  });
  // Neon round the top of the keep.
  for (const z of [z0, z1]) glow.quad([x0, H + 0.005, z], [x1, H + 0.005, z], [x1, H + 0.045, z], [x0, H + 0.045, z], scale(PINK, 0.8));
  for (const x of [x0, x1]) glow.quad([x, H + 0.005, z0], [x, H + 0.005, z1], [x, H + 0.045, z1], [x, H + 0.045, z0], scale(PINK, 0.8));
  kit.box('#db2777', [0, H - 0.02, z1 + 0.005], [bw, 0.03, 0.012]);
  // The front: a gold arch over the door, neon fins either side, the marquee and the video wall.
  kit.box(GOLD, [0, 0.62, z1 + 0.02], [0.78, 1.16, 0.04]);
  kit.box('#0b0b0e', [0, 0.56, z1 + 0.042], [0.62, 1.0, 0.012]);
  kit.box('#3b0a1e', [0, 0.45, z1 + 0.05], [0.5, 0.8, 0.01]);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const x = s * (0.6 + i * 0.32);
      if (Math.abs(x) > bw / 2 - 0.4) continue;
      const neon = (i + (s > 0 ? 1 : 0)) % 2 ? '#db2777' : '#06b6d4';
      kit.box(neon, [x, 0.75, z1 + 0.012], [0.05, 1.2, 0.02]);
      glowPanel(c, x, 0.75, z1 + 0.026, 0.06, 1.2, scale((i + (s > 0 ? 1 : 0)) % 2 ? PINK : CYAN, 0.95));
    }
  }
  kit.box('#0b0b0e', [0, 1.38, z1 + 0.08], [Math.min(2.6, bw * 0.55), 0.38, 0.1]);
  kit.box(GOLD, [0, 1.38, z1 + 0.075], [Math.min(2.66, bw * 0.55 + 0.06), 0.44, 0.08]);
  letters(c, '#f472b6', 0, 1.4, z1 + 0.135, 9, 0.2);
  glowPanel(c, 0, 1.4, z1 + 0.15, Math.min(2.4, bw * 0.5), 0.26, scale(PINK, 0.85));
  if (bw > 4) {
    const vx = x0 + 0.65;
    kit.box('#0b0b0e', [vx, 0.95, z1 + 0.02], [0.8, 0.5, 0.04]);
    const VID = ['#7c3aed', '#db2777', '#f59e0b', '#06b6d4'];
    for (let i = 0; i < 4; i++) kit.box(VID[i], [vx - 0.27 + i * 0.18, 0.95, z1 + 0.045], [0.17, 0.42, 0.006]);
    glowPanel(c, vx, 0.95, z1 + 0.05, 0.74, 0.44, [0.45, 0.2, 0.6]);
  }
  // The rooftop lounge: a deck, a plunge pool, cabanas, the DJ's booth and lights strung across.
  const dx0 = x0 + 0.5, dx1 = x1 - 0.5, dz0 = z0 + 0.45, dz1 = zc + 0.3;
  kit.flat('#6b4f36', dx0, dz0, dx1, dz1, H + 0.005);
  kit.box('#22d3ee', [dx1 - 0.55, H + 0.02, (dz0 + dz1) / 2], [0.7, 0.03, (dz1 - dz0) * 0.6]);
  glowPool(c, dx1 - 0.55, (dz0 + dz1) / 2, 0.42, [0.05, 0.35, 0.5], H + 0.04, (dz1 - dz0) * 0.36);
  for (let i = 0; i < 3; i++) {
    const x = dx0 + 0.3 + i * 0.5;
    if (x > dx1 - 1.0) break;
    kit.box(WHITE, [x, H + 0.06, dz0 + 0.2], [0.3, 0.1, 0.2]);
    kit.box('#f5f5f4', [x, H + 0.32, dz0 + 0.2], [0.36, 0.03, 0.26]);
    if (!low) for (const s of [-1, 1]) kit.box(GOLD, [x + s * 0.16, H + 0.18, dz0 + 0.2], [0.02, 0.28, 0.02]);
  }
  kit.box('#18181b', [0, H + 0.12, dz1 + 0.15], [0.5, 0.22, 0.2]);
  glowPanel(c, 0, H + 0.14, dz1 + 0.252, 0.44, 0.1, scale(CYAN, 0.8));
  if (!low) {
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      kit.box(`lamp${i % 3}`, [dx0 + (dx1 - dx0) * t, H + 0.45 - Math.sin(t * Math.PI * 3) ** 2 * 0.08, (dz0 + dz1) / 2], [0.03, 0.03, 0.03]);
    }
    kit.bar(DARK, [dx0, H + 0.47, (dz0 + dz1) / 2], [dx1, H + 0.47, (dz0 + dz1) / 2], 0.006);
    crowd(c, 10, dx0, dz0, dx1 - 1.0, dz1, H + 0.005);
  }
  // Searchlights on the front corners, their beams standing up into the night.
  for (const s of [-1, 1]) {
    const lx = s * (bw / 2 - 0.55), lz = z1 - 0.35;
    kit.post('#27272a', [lx, H, lz], 0.08, 0.14, 8);
    kit.box(`lamp${s > 0 ? 3 : 4}`, [lx, H + 0.16, lz], [0.1, 0.03, 0.1]);
    if (!low) {
      const top: V3 = [lx + s * 1.2, H + 4.5, lz - 0.8];
      const col = s > 0 ? PINK : CYAN;
      glow.tri([lx - 0.06, H + 0.17, lz], [lx + 0.06, H + 0.17, lz], [top[0] + 0.3, top[1], top[2]], scale(col, 0.32), scale(col, 0.32), [0, 0, 0]);
      glow.tri([lx - 0.06, H + 0.17, lz], [top[0] - 0.3, top[1], top[2]], [top[0] + 0.3, top[1], top[2]], scale(col, 0.32), [0, 0, 0], [0, 0, 0]);
    }
  }
  // Out front: the red carpet, the posts and ropes, the queue and the bouncers.
  const cz1 = d / 2 - 0.08;
  kit.flat('#991b1b', -0.3, z1, 0.3, cz1, 0.05);
  for (const s of [-1, 1]) {
    for (let z = z1 + 0.25; z < cz1 - 0.05; z += 0.3) {
      kit.post(GOLD, [s * 0.36, 0.05, z], 0.015, 0.16, 6);
      if (z + 0.3 < cz1) kit.bar('#7f1d1d', [s * 0.36, 0.17, z], [s * 0.36, 0.17, z + 0.3], 0.014);
    }
  }
  for (const s of [-1, 1]) person(c, s * 0.24, z1 + 0.14, 0.05, BLACK);
  const q = low ? 4 : 10;
  for (let i = 0; i < q; i++) person(c, -0.5 - (i % 2) * 0.06, z1 + 0.2 + i * 0.09, 0.04, pick(c, ['#db2777', '#f8fafc', '#111827', '#facc15', '#7c3aed', '#dc2626']));
  // The cars: a black SUV, a red sports car and a white jeep, lined up at the kerb.
  if (!low) {
    car(c, 0.95, z1 + 0.55, 0.15, BLACK, true);
    car(c, 1.5, z1 + 0.55, -0.1, '#dc2626');
    if (w > 5.5) car(c, 2.05, z1 + 0.55, 0.05, WHITE, true);
  }
  for (const s of [-1, 1]) {
    kit.box('#18181b', [s * (w / 2 - 0.22), 0.14, d / 2 - 0.3], [0.26, 0.2, 0.26]);
    palm(c, s * (w / 2 - 0.22), d / 2 - 0.3, 0.95);
  }
  lamp(c, -w / 2 + 0.22, z1 + 0.25, 0.8, 5, 0.12, 0);
  return done(c);
}

/* ---------- The buka ---------- */

/**
 * The buka and mai shayi: a zinc shed on wooden posts with long tables and benches under it and its name painted on
 * the fascia, Mama's kitchen beside it (black pots on firewood, smoke going up, coolers of food on the serving
 * table), the mai shayi's blue kiosk with its kettle and lantern at the front, plastic chairs out on the sand, the
 * signboard on its posts, a blue water drum and an okada.
 */
function buildBuka(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 7);
  const { kit, glow } = c;
  kit.box(EARTH, [0, 0.02, 0], [w, 0.04, d]);
  const x0 = -w / 2 + 0.15, x1 = w / 2 - 0.85, z0 = -d / 2 + 0.15, z1 = 0.35;
  kit.flat(CONCRETE, x0, z0, x1, z1, 0.045);
  // The back wall, half height, painted blue below and white above.
  kit.box('#2563eb', [(x0 + x1) / 2, 0.16, z0 + 0.04], [x1 - x0, 0.24, 0.07]);
  kit.box(WHITE, [(x0 + x1) / 2, 0.36, z0 + 0.04], [x1 - x0, 0.16, 0.07]);
  for (const x of [x0 + 0.04, (x0 + x1) / 2, x1 - 0.04]) {
    kit.box(WOOD_DARK, [x, 0.35, z1 - 0.02], [0.045, 0.62, 0.045]);
    kit.box(WOOD_DARK, [x, 0.4, z0 + 0.04], [0.045, 0.72, 0.045]);
  }
  zinc(c, x0 - 0.08, x1 + 0.08, z0 - 0.06, z1 + 0.14, 0.8, 0.68, pick(c, ZINC), 8, 0.5);
  // The name on the fascia, facing the street.
  sign(c, (x0 + x1) / 2, 0.62, z1 + 0.15, x1 - x0 - 0.1, 0.12, '#facc15', '#b91c1c', 10, [0.45, 0.35, 0.1]);
  // Long tables and benches, and the people eating at them.
  for (const tz of [z0 + 0.55, z0 + 1.15]) {
    if (tz > z1 - 0.15) continue;
    kit.box(WOOD, [(x0 + x1) / 2, 0.2, tz], [x1 - x0 - 0.3, 0.03, 0.22]);
    kit.box(WOOD_DARK, [(x0 + x1) / 2, 0.1, tz], [x1 - x0 - 0.45, 0.16, 0.04]);
    for (const s of [-1, 1]) kit.box(WOOD, [(x0 + x1) / 2, 0.12, tz + s * 0.2], [x1 - x0 - 0.3, 0.025, 0.07]);
    if (!low) for (let i = 0; i < 4; i++) person(c, x0 + 0.3 + i * 0.35 + c.r() * 0.1, tz + (i % 2 ? 0.2 : -0.2), 0.13, undefined, true);
  }
  // Serving table with the coolers of food, along the front of the shed.
  kit.box(WOOD, [x0 + 0.55, 0.17, z1 + 0.06], [0.8, 0.03, 0.2]);
  [['#dc2626', -0.25], ['#2563eb', 0], ['#16a34a', 0.25]].forEach(([col, dx]) => kit.post(col as string, [x0 + 0.55 + (dx as number), 0.185, z1 + 0.06], 0.07, 0.1, 8));
  // Mama's kitchen: pots on firewood, the fire's glow, the smoke drawn separately.
  const kx = x1 + 0.45, kz = z0 + 0.4;
  kit.flat(EARTH_DARK, kx - 0.35, kz - 0.3, kx + 0.35, kz + 0.3, 0.046);
  for (const [dx, dz, r] of [[-0.16, -0.08, 0.12], [0.15, -0.1, 0.1], [0, 0.15, 0.11]] as const) {
    kit.box('#f97316', [kx + dx, 0.07, kz + dz], [r * 1.4, 0.04, r * 1.4]);
    for (const a of [0, 2.1, 4.2]) kit.box('#6b7280', [kx + dx + Math.cos(a) * r * 0.9, 0.08, kz + dz + Math.sin(a) * r * 0.9], [0.05, 0.06, 0.05]);
    kit.post(TANK, [kx + dx, 0.1, kz + dz], r, 0.13, 8, 1.1);
    kit.post('#3f3f46', [kx + dx, 0.23, kz + dz], r * 1.05, 0.01, 8);
    glowPool(c, kx + dx, kz + dz, r * 2, [0.6, 0.25, 0.05], 0.06);
  }
  for (const a of [0.3, 1.2]) kit.bar(WOOD_DARK, [kx - 0.3, 0.06, kz + 0.25], [kx - 0.3 + Math.cos(a) * 0.3, 0.06, kz + 0.25 - Math.sin(a) * 0.1], 0.035);
  person(c, kx - 0.05, kz + 0.33, 0.04, '#9333ea');
  glow.quad([kx - 0.3, 0.12, kz - 0.25], [kx + 0.3, 0.12, kz - 0.25], [kx + 0.3, 0.12, kz + 0.28], [kx - 0.3, 0.12, kz + 0.28], [0.25, 0.08, 0.01]);
  // The mai shayi's kiosk at the front corner.
  const sx = w / 2 - 0.45, sz = d / 2 - 0.6;
  kit.box('#0e7490', [sx, 0.3, sz - 0.08], [0.6, 0.5, 0.4]);
  kit.box('#facc15', [sx, 0.47, sz + 0.125], [0.6, 0.1, 0.01]);
  kit.box('#3b342e', [sx, 0.28, sz + 0.122], [0.42, 0.2, 0.01]);
  kit.box(WOOD, [sx, 0.22, sz + 0.2], [0.62, 0.03, 0.14]);
  zinc(c, sx - 0.36, sx + 0.36, sz - 0.32, sz + 0.32, 0.62, 0.55, '#a3acb5', 4, 0.3);
  kit.post('#d4d4d8', [sx - 0.15, 0.235, sz + 0.2], 0.04, 0.08, 6, 0.6);
  if (!low) for (let i = 0; i < 4; i++) kit.box(['#facc15', '#1d4ed8', '#16a34a', '#dc2626'][i], [sx + 0.05 + i * 0.06, 0.26, sz + 0.2], [0.04, 0.05, 0.04]);
  kit.box('lamp0', [sx, 0.5, sz + 0.24], [0.04, 0.05, 0.04]);
  glowPool(c, sx, sz + 0.35, 0.4, scale(WARM, 0.3));
  bench(c, sx, sz + 0.45, Math.PI);
  person(c, sx + 0.08, sz - 0.0, 0.04, WHITE);
  if (!low) { person(c, sx - 0.1, sz + 0.45, 0.08, undefined, true); person(c, sx + 0.08, sz + 0.45, 0.08, undefined, true); }
  // Out front: plastic chairs, the signboard, a drum of water and an okada.
  const fx = x0 + 0.45, fz = d / 2 - 0.5;
  table(c, fx, fz, WHITE, 0.12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    chair(c, fx + Math.cos(a) * 0.17, fz + Math.sin(a) * 0.17, -a - Math.PI / 2, i % 2 ? '#dc2626' : '#2563eb', !low && i < 2);
  }
  for (const s of [-1, 1]) kit.box(WOOD_DARK, [0.05 + s * 0.28, 0.3, d / 2 - 0.15], [0.03, 0.52, 0.03]);
  sign(c, 0.05, 0.48, d / 2 - 0.13, 0.66, 0.2, WHITE, '#b91c1c', 6, null);
  kit.post('#1d4ed8', [x0 + 0.08, 0.04, z1 + 0.35], 0.08, 0.22, 8);
  if (!low) okada(c, 0.1, d / 2 - 0.45, 1.2);
  return done(c);
}

/* ---------- The suya spot ---------- */

/**
 * The suya spot: a red and yellow kiosk with SUYA over its window, the long charcoal grill out front glowing orange
 * with skewers across it and smoke pouring off, the mai suya behind it in his cap with the yaji tray and paper wraps
 * beside him, a green and white umbrella and a bare bulb on a pole over the fire, plastic tables and chairs, a cooler
 * and a crate of drinks, an okada, and a big boy's car double-parked at the kerb.
 */
function buildSuya(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 8);
  const { kit, glow } = c;
  kit.box('#a98a66', [0, 0.02, 0], [w, 0.04, d]);
  kit.flat(CONCRETE, -w / 2 + 0.1, -d / 2 + 0.1, w / 2 - 0.1, 0.2, 0.045);
  // The kiosk.
  const kx = -w / 2 + 0.75, kz = -d / 2 + 0.5;
  kit.box('#dc2626', [kx, 0.2, kz], [1.2, 0.32, 0.65]);
  kit.box('#facc15', [kx, 0.5, kz], [1.2, 0.28, 0.65]);
  kit.box('#3b342e', [kx, 0.42, kz + 0.327], [0.6, 0.22, 0.01]);
  kit.box(WOOD, [kx, 0.31, kz + 0.38], [0.66, 0.03, 0.12]);
  zinc(c, kx - 0.7, kx + 0.7, kz - 0.42, kz + 0.48, 0.76, 0.66, pick(c, ZINC), 6, 0.3);
  sign(c, kx, 0.58, kz + 0.33, 0.8, 0.12, '#b91c1c', '#facc15', 4, [0.5, 0.25, 0.05]);
  // The grill: a long black trough on legs, coals glowing, skewers laid across.
  const gx = 0.45, gz = -0.05, gl = 1.0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(DARK, [gx + sx * (gl / 2 - 0.05), 0.15, gz + sz * 0.1], [0.025, 0.22, 0.025]);
  kit.box('#18181b', [gx, 0.3, gz], [gl, 0.1, 0.27]);
  kit.box('#f97316', [gx, 0.353, gz], [gl - 0.08, 0.008, 0.2]);
  if (!low) for (let i = 0; i < 6; i++) kit.box('#b91c1c', [gx - gl / 2 + 0.12 + i * 0.15, 0.358, gz + (i % 2 ? 0.04 : -0.04)], [0.08, 0.004, 0.06]);
  for (let i = 0; i < (low ? 6 : 14); i++) kit.box('#7c2d12', [gx - gl / 2 + 0.08 + i * ((gl - 0.16) / (low ? 5 : 13)), 0.37, gz], [0.025, 0.018, 0.3]);
  glow.quad([gx - gl / 2 + 0.04, 0.362, gz - 0.1], [gx + gl / 2 - 0.04, 0.362, gz - 0.1], [gx + gl / 2 - 0.04, 0.362, gz + 0.1], [gx - gl / 2 + 0.04, 0.362, gz + 0.1], [0.9, 0.35, 0.05]);
  glowPool(c, gx, gz, 0.75, [0.4, 0.16, 0.03], 0.06, 0.55);
  // The mai suya, his tray and wraps; the umbrella and the bulb on its pole.
  person(c, gx - 0.1, gz - 0.25, 0.04, WHITE);
  kit.box('#b91c1c', [gx - 0.1, 0.205, gz - 0.25], [0.045, 0.02, 0.045]);
  kit.box(WOOD, [gx + gl / 2 + 0.2, 0.22, gz], [0.28, 0.03, 0.3]);
  kit.box('#f5f5f4', [gx + gl / 2 + 0.16, 0.245, gz + 0.04], [0.1, 0.02, 0.14]);
  kit.box('#c2410c', [gx + gl / 2 + 0.26, 0.245, gz - 0.06], [0.1, 0.02, 0.1]);
  umbrella(c, gx + 0.55, gz - 0.6, 0.45, 0.7, ['#15803d', '#f8fafc'], 10);
  kit.box(STEEL, [gx - gl / 2 - 0.08, 0.38, gz + 0.18], [0.02, 0.68, 0.02]);
  kit.box(STEEL, [gx - gl / 2 + 0.05, 0.72, gz + 0.18], [0.28, 0.015, 0.015]);
  kit.box('lamp0', [gx - gl / 2 + 0.18, 0.68, gz + 0.18], [0.04, 0.05, 0.04]);
  glowPool(c, gx - gl / 2 + 0.18, gz + 0.3, 0.6, scale(WARM, 0.3));
  // Tables, chairs and the drinks.
  const tables: [number, number][] = [[-0.75, 0.55], [-0.15, 0.85]];
  if (w > 3.2) tables.push([0.5, 0.9]);
  tables.forEach(([tx, tz], j) => {
    table(c, tx, tz, WHITE, 0.11);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + j;
      if (low && i % 2) continue;
      chair(c, tx + Math.cos(a) * 0.17, tz + Math.sin(a) * 0.17, -a - Math.PI / 2, j % 2 ? '#dc2626' : WHITE, !low && (i + j) % 3 !== 0);
    }
  });
  kit.box('#dc2626', [kx + 0.75, 0.15, kz + 0.1], [0.24, 0.22, 0.18]);
  kit.box(WHITE, [kx + 0.75, 0.27, kz + 0.1], [0.25, 0.02, 0.19]);
  kit.box('#15803d', [kx + 0.75, 0.1, kz + 0.38], [0.16, 0.1, 0.12]);
  if (!low) {
    for (let i = 0; i < 6; i++) kit.box('#78350f', [kx + 0.7 + (i % 3) * 0.05, 0.18, kz + 0.35 + Math.floor(i / 3) * 0.05], [0.02, 0.06, 0.02]);
    okada(c, -w / 2 + 0.3, d / 2 - 0.3, 0.4);
    car(c, w / 2 - 0.4, d / 2 - 0.35, Math.PI / 2 + 0.15, pick(c, ['#111827', '#e5e7eb', '#7f1d1d']));
  }
  return done(c);
}

/* ---------- The viewing centre ---------- */

/**
 * The football viewing centre: a block hall at the back painted in two clubs' colours with the big screen on its
 * front (a pitch on it, lit at night), a DStv dish and the signboard on the roof, rows of plastic chairs and benches
 * full of fans out in front under a striped tarp, zinc sheets fencing the sides, the gateman's table with the day's
 * fixtures on a chalkboard, and the generator rattling away in its corner.
 */
function buildViewing(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 9);
  const { kit, glow } = c;
  kit.box(EARTH, [0, 0.02, 0], [w, 0.04, d]);
  const x0 = -w / 2 + 0.15, x1 = w / 2 - 0.15, z0 = -d / 2 + 0.12;
  const hd = 0.62, H = 0.95, hz1 = z0 + hd;
  const hw = x1 - x0;
  kit.box('#1d4ed8', [0, H / 2, z0 + hd / 2], [hw, H, hd]);
  kit.box('#dc2626', [-hw / 4, 0.3, hz1 + 0.004], [hw / 2, 0.5, 0.01]);
  kit.box('#1d4ed8', [hw / 4, 0.3, hz1 + 0.004], [hw / 2, 0.5, 0.01]);
  zinc(c, x0 - 0.06, x1 + 0.06, z0 - 0.06, hz1 + 0.06, H + 0.1, H + 0.02, pick(c, ZINC), 10, 0.3);
  // The screen.
  const sw = Math.min(1.7, hw * 0.48), sh = 0.6;
  kit.box('#0b0b0e', [0, 0.5, hz1 + 0.03], [sw + 0.08, sh + 0.08, 0.05]);
  kit.box('#2f9e44', [0, 0.5, hz1 + 0.058], [sw, sh, 0.006]);
  if (!low) {
    for (let i = 0; i < 4; i++) kit.box(i % 2 ? '#37b24d' : '#2f9e44', [-sw / 2 + sw / 8 + (i * sw) / 4, 0.5, hz1 + 0.06], [sw / 8, sh, 0.004]);
    kit.box(WHITE, [0, 0.5, hz1 + 0.064], [0.012, sh, 0.003]);
    kit.box(WHITE, [0, 0.5, hz1 + 0.064], [0.12, 0.012, 0.003]);
    kit.box('#0b0b0e', [-sw / 2 + 0.16, 0.5 + sh / 2 - 0.05, hz1 + 0.066], [0.26, 0.06, 0.003]);
    // Two players on the pitch.
    kit.box('#dc2626', [-0.2, 0.46, hz1 + 0.066], [0.03, 0.08, 0.003]);
    kit.box('#93c5fd', [0.25, 0.53, hz1 + 0.066], [0.03, 0.08, 0.003]);
  }
  glowPanel(c, 0, 0.5, hz1 + 0.07, sw, sh, [0.25, 0.75, 0.35]);
  glowPool(c, 0, hz1 + 0.6, sw * 0.6, [0.08, 0.25, 0.12], 0.06, 0.6);
  // On the roof: the dish and the signboard.
  kit.shape(WHITE, unitCyl(12, 1), [x1 - 0.4, H + 0.28, z0 + 0.25], [0.17, 0.02, 0.17], [0.8, 0.4, 0]);
  kit.box(STEEL, [x1 - 0.4, H + 0.15, z0 + 0.2], [0.03, 0.14, 0.03]);
  for (const s of [-1, 1]) kit.box(STEEL, [s * 0.5 - 0.3, H + 0.2, hz1 - 0.05], [0.03, 0.3, 0.03]);
  sign(c, -0.3, H + 0.4, hz1 - 0.05, 1.5, 0.26, '#1d4ed8', WHITE, 9, [0.2, 0.3, 0.6]);
  // The seats: rows of plastic chairs in front, benches under the tarp, fans in nearly all of them.
  const rz0 = hz1 + 0.3, rz1 = d / 2 - 0.45;
  const rows = Math.max(2, Math.floor((rz1 - rz0) / 0.22) + 1);
  const per = Math.floor((hw - 0.5) / 0.15);
  const tz0 = rz0 + 0.12, tz1 = Math.min(rz1 - 0.25, tz0 + 0.55);
  const CH = ['#2563eb', '#dc2626', WHITE];
  for (let r = 0; r < rows; r++) {
    const z = rz0 + r * 0.22;
    if (z > tz0 && z < tz1) {
      // Under the tarp, out of sight from above: long benches, cheaper than chairs.
      for (const s of [-1, 1]) {
        kit.box(WOOD, [s * (hw / 4 + 0.06), 0.11, z], [hw / 2 - 0.4, 0.025, 0.08]);
        if (!low) for (let i = 0; i < Math.floor((hw / 2 - 0.45) / 0.15); i += 1) if (c.r() < 0.6) person(c, s * (0.2 + i * 0.15), z, 0.12, undefined, true);
      }
      continue;
    }
    for (let i = 0; i < per; i++) {
      const x = -((per - 1) * 0.15) / 2 + i * 0.15;
      if (Math.abs(x) < 0.14) continue; // the aisle
      if (low && i % 2) continue;
      chair(c, x, z, Math.PI, CH[(r + (x > 0 ? 1 : 0)) % 3], c.r() < 0.7);
    }
  }
  // A striped tarp on poles over the middle rows (the front rows and the screen still show from the street).
  if (tz1 > tz0 + 0.2) {
    const strips = 10;
    for (let i = 0; i < strips; i++) {
      const a = x0 + 0.15 + ((hw - 0.3) / strips) * i, b = a + (hw - 0.3) / strips;
      kit.quad(i % 2 ? '#1d4ed8' : '#f8fafc', [a, 0.72, tz0 - 0.08], [b, 0.72, tz0 - 0.08], [b, 0.68, tz1 + 0.08], [a, 0.68, tz1 + 0.08], [0, 1, 0.1]);
    }
    for (const x of [x0 + 0.15, x1 - 0.15]) for (const z of [tz0 - 0.08, tz1 + 0.08]) kit.box(STEEL, [x, 0.37, z], [0.02, 0.68, 0.02]);
  }
  // Zinc fencing down the sides, the gate at the front.
  for (const s of [-1, 1]) {
    const fx = s * (w / 2 - 0.05);
    for (let z = hz1; z < d / 2 - 0.1; z += 0.22) kit.box(c.r() < 0.3 ? pick(c, RUST) : pick(c, ZINC), [fx, 0.26, z + 0.11], [0.02, 0.44, 0.22]);
    kit.box(pick(c, ZINC), [s * (w / 2 - 0.55), 0.26, d / 2 - 0.05], [0.92, 0.44, 0.02]);
  }
  // The gateman, his table and the chalkboard of fixtures.
  kit.box(WOOD, [0.45, 0.14, d / 2 - 0.2], [0.3, 0.03, 0.16]);
  kit.box('#facc15', [0.45, 0.17, d / 2 - 0.2], [0.08, 0.04, 0.06]);
  person(c, 0.45, d / 2 - 0.32, 0.08, '#16a34a', true);
  kit.box('#1f2937', [-0.45, 0.28, d / 2 - 0.15], [0.32, 0.26, 0.02], [-0.2, 0, 0]);
  if (!low) for (let i = 0; i < 3; i++) kit.box(WHITE, [-0.45, 0.34 - i * 0.07, d / 2 - 0.137], [0.22, 0.015, 0.004], [-0.2, 0, 0]);
  // The generator, in its corner.
  const gx = x1 - 0.25, gz = hz1 + 0.18;
  kit.box('#facc15', [gx, 0.16, gz], [0.34, 0.24, 0.22]);
  kit.box(DARK, [gx, 0.29, gz], [0.36, 0.02, 0.24]);
  kit.post(DARK, [gx + 0.12, 0.3, gz - 0.06], 0.015, 0.12, 5);
  glow.quad([gx - 0.17, 0.2, gz + 0.112], [gx + 0.17, 0.2, gz + 0.112], [gx + 0.17, 0.26, gz + 0.112], [gx - 0.17, 0.26, gz + 0.112], [0.3, 0.25, 0.05]);
  kit.box('lamp0', [-hw / 2 + 0.3, 0.8, hz1 + 0.05], [0.04, 0.04, 0.04]);
  kit.box('lamp1', [hw / 2 - 0.3, 0.8, hz1 + 0.05], [0.04, 0.04, 0.04]);
  return done(c);
}

/* ---------- The Glory Dome ---------- */

/**
 * The great dome auditorium: a broad, low dome ribbed in white and silver on a drum with a band of glass all round,
 * a gold crown at the top, a pillared portico on the front with the name in gold on blue, steps down to a plaza of
 * flags and palms, and car parks either side filled for the service, lit by tall lamps.
 */
function buildGloryDome(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 10);
  const { kit } = c;
  kit.box(PAVING, [0, 0.02, 0], [w, 0.04, d]);
  const z0 = -0.25;
  const rz = d / 2 - 0.5, rx = Math.min(w / 2 - 0.35, rz * 1.45);
  const drum = 0.3, band = 0.22, dh = Math.min(1.25, rz * 0.62);
  const n = low ? 24 : 40, lat = low ? 4 : 6;
  const p = (t: number, k: number, y: number): V3 => [Math.cos(t) * rx * k, y, z0 + Math.sin(t) * rz * k];
  // The car parks either side, and the forecourt.
  kit.flat(ASPHALT, -w / 2 + 0.1, -d / 2 + 0.1, w / 2 - 0.1, d / 2 - 0.1, 0.044);
  blob(c, PAVING, 0, z0, rx + 0.28, rz + 0.22, 0.046, 32, 0);
  kit.flat(PAVING, -0.9, z0 + rz, 0.9, d / 2 - 0.05, 0.046);
  // The drum, its glass band and the dome above, ribbed.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    const out = p((a + b) / 2, 1, 0);
    out[1] = 0; out[2] -= z0;
    kit.quad('#e7e2d8', p(a, 1, 0.04), p(b, 1, 0.04), p(b, 1, drum), p(a, 1, drum), out);
    kit.quad(`glass${i % 4}`, p(a, 1.003, drum), p(b, 1.003, drum), p(b, 1.003, drum + band), p(a, 1.003, drum + band), out);
    for (let j = 0; j < lat; j++) {
      const f0 = (j / lat) * (Math.PI / 2), f1 = ((j + 1) / lat) * (Math.PI / 2);
      const y0 = drum + band + Math.sin(f0) * dh, y1 = drum + band + Math.sin(f1) * dh;
      const k0 = Math.cos(f0), k1 = Math.cos(f1);
      const key = i % 2 ? '#eef2f6' : '#cfd8e3';
      const up: V3 = [out[0] * k0, Math.sin(f0) + 0.2, out[2] * k0];
      if (j === lat - 1) kit.tri(key, p(a, k0, y0), p(b, k0, y0), [0, y1, z0], up);
      else kit.quad(key, p(a, k0, y0), p(b, k0, y0), p(b, k1, y1), p(a, k1, y1), up);
      // Floodlights wash the dome from below after dark, fading up towards the crown.
      if (j < 3) {
        const g = (k: number): RGB => scale([0.55, 0.6, 0.75], k);
        const lift = (q: V3, k: number): V3 => [q[0] + out[0] * 0.012 * k, q[1] + 0.004, q[2] + out[2] * 0.012 * k];
        c.glow.quad(lift(p(a, k0, y0), k0), lift(p(b, k0, y0), k0), lift(p(b, k1, y1), k1), lift(p(a, k1, y1), k1), g(0.3 - j * 0.1), g(0.3 - j * 0.1), g(0.2 - j * 0.1), g(0.2 - j * 0.1));
      }
    }
  }
  kit.post(GOLD, [0, drum + band + dh - 0.06, z0], 0.2, 0.08, 12, 0.7);
  kit.post(GOLD, [0, drum + band + dh, z0], 0.1, 0.1, 10);
  kit.post(GOLD, [0, drum + band + dh + 0.12, z0], 0.025, 0.2, 5);
  // The portico: a slab on columns over the doors, the name on its front.
  const pz = z0 + rz, pw = Math.min(2.2, rx * 1.1), pd = 0.42;
  kit.box(WHITE, [0, drum + 0.2, pz + pd / 2 - 0.05], [pw, 0.08, pd + 0.1]);
  for (let i = 0; i < 6; i++) kit.post(WHITE, [-pw / 2 + 0.1 + i * ((pw - 0.2) / 5), 0.04, pz + pd - 0.06], 0.035, drum + 0.12, 8);
  sign(c, 0, drum + 0.36, pz + pd - 0.02, pw * 0.8, 0.2, '#1e3a8a', GOLD, 9, [0.45, 0.4, 0.2]);
  kit.box('#0b1324', [0, 0.2, pz + 0.01], [0.8, 0.32, 0.04]);
  for (let i = 0; i < 3; i++) kit.box(i % 2 ? '#e7e5e4' : '#d6d3d1', [0, 0.05 + i * 0.012, pz + pd + 0.06 + (2 - i) * 0.06], [pw * 0.8, 0.012 + i * 0.012, 0.12]);
  // Flags and palms on the plaza, lamps and cars in the car parks.
  for (const s of [-1, 1]) {
    flag(c, s * 0.75, d / 2 - 0.3, 0.95, s > 0 ? ['#1e3a8a', GOLD, '#1e3a8a'] : NIGERIA);
    palm(c, s * 1.15, d / 2 - 0.35, 1.0);
    lamp(c, s * (w / 2 - 0.3), d / 2 - 0.3, 0.9, s > 0 ? 0 : 1, s * -0.12, 0);
    if (!low) lamp(c, s * (w / 2 - 0.3), -d / 2 + 0.3, 0.9, 2, s * -0.12, 0);
  }
  if (!low) {
    // Cars nose to tail down the sides wherever the dome leaves room, and in bays along the front.
    const spots: [number, number, number][] = [];
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.3);
      for (let z = -d / 2 + 0.5; z < d / 2 - 0.75; z += 0.82) {
        const near = Math.min(Math.abs(z - 0.36 - z0), Math.abs(z + 0.36 - z0));
        if (Math.hypot((Math.abs(x) - 0.2) / (rx + 0.3), near / (rz + 0.25)) > 1) spots.push([x, z, 0]);
      }
      for (let i = 0; i < 3; i++) {
        const fx = s * (1.35 + i * 0.42);
        if (Math.abs(fx) < w / 2 - 0.55) spots.push([fx, d / 2 - 0.42, Math.PI]);
      }
    }
    for (const [x, z, yaw] of spots) if (Math.abs(x) < w / 2 - 0.15 && c.r() < 0.8) car(c, x, z, yaw, pick(c, CARS), c.r() < 0.3);
    crowd(c, 18, -0.85, pz + pd + 0.1, 0.85, d / 2 - 0.05, 0.046, undefined, [WHITE, WHITE, '#1e3a8a', '#facc15', '#db2777', '#16a34a']);
  }
  return done(c);
}

/* ---------- The trade fair ---------- */

const FLAGS: readonly (readonly string[])[] = [
  NIGERIA, ['#16a34a', '#facc15', '#dc2626'], ['#f97316', WHITE, '#16a34a'], ['#1d4ed8', WHITE, '#dc2626'],
  ['#dc2626', '#facc15', '#16a34a'], ['#1d4ed8', '#facc15', '#1d4ed8'], ['#dc2626', WHITE, '#dc2626'], ['#16a34a', WHITE, '#f97316'],
];

/** An exhibition hall: white walls under a vaulted roof in `roof`, banners down its front, its doors open. */
function hall(c: Ctx, x: number, z: number, hw: number, hd: number, roof: string) {
  const { kit } = c;
  const H = 0.55, rise = Math.min(0.42, hd * 0.3);
  kit.box('#f1f5f9', [x, H / 2, z], [hw, H, hd]);
  const segs = c.low ? 4 : 8;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI, b = ((i + 1) / segs) * Math.PI;
    const za = z - (Math.cos(a) * hd) / 2, zb = z - (Math.cos(b) * hd) / 2;
    const ya = H + Math.sin(a) * rise, yb = H + Math.sin(b) * rise;
    const key = i % 2 ? roof : shade(roof, 0.88);
    kit.quad(key, [x - hw / 2 - 0.04, ya, za], [x + hw / 2 + 0.04, ya, za], [x + hw / 2 + 0.04, yb, zb], [x - hw / 2 - 0.04, yb, zb], [0, Math.sin((a + b) / 2), -Math.cos((a + b) / 2)]);
    // The gable ends, filled in white.
    for (const s of [-1, 1]) kit.tri('#e2e8f0', [x + (s * hw) / 2, H, z], [x + (s * hw) / 2, ya, za], [x + (s * hw) / 2, yb, zb], [s, 0, 0]);
  }
  kit.box('#334155', [x, 0.2, z + hd / 2 + 0.005], [Math.min(0.6, hw * 0.3), 0.32, 0.01]);
  kit.box('glass0', [x, 0.46, z + hd / 2 + 0.005], [hw - 0.2, 0.1, 0.01]);
  if (!c.low) {
    for (const s of [-1, 1]) kit.box(pick(c, ['#dc2626', '#facc15', '#2563eb', '#16a34a']), [x + s * (hw / 2 - 0.2), 0.32, z + hd / 2 + 0.012], [0.12, 0.4, 0.01]);
  }
}

/** A ferris wheel standing across x, seen face on from the street: rim, spokes, gondolas, A-frame legs, lit at night. */
function wheel(c: Ctx, x: number, z: number, R: number) {
  const { kit, glow } = c;
  const hy = R + 0.25;
  const n = c.low ? 12 : 20;
  const rim = (i: number, r = R): V3 => [x + Math.cos((i / n) * Math.PI * 2) * r, hy + Math.sin((i / n) * Math.PI * 2) * r, z];
  for (let i = 0; i < n; i++) kit.bar('#f59e0b', rim(i), rim(i + 1), 0.035);
  for (let i = 0; i < n; i += 2) kit.bar('#e2e8f0', [x, hy, z], rim(i), 0.015);
  const COL = ['#dc2626', '#2563eb', '#16a34a', '#facc15', '#9333ea'];
  for (let i = 0; i < n; i += c.low ? 3 : 2) {
    const g = rim(i);
    kit.box(COL[Math.floor(i / 2) % COL.length], [g[0], g[1] - 0.09, g[2]], [0.12, 0.1, 0.12]);
  }
  for (const s of [-1, 1]) for (const k of [-1, 1]) kit.bar('#64748b', [x + s * R * 0.55, 0.04, z + k * 0.2], [x, hy, z + k * 0.05], 0.05);
  kit.post('#475569', [x, hy - 0.05, z - 0.08], 0.08, 0.16, 8);
  kit.box('#cbd5e1', [x, 0.12, z + 0.35], [0.5, 0.16, 0.2]);
  // A light at every spoke's end, and a faint wash on the rim.
  for (let i = 0; i < n; i++) {
    const [px, py] = rim(i);
    const col: RGB = i % 2 ? [0.95, 0.35, 0.6] : [1, 0.8, 0.3];
    glow.quad([px - 0.04, py - 0.04, z + 0.03], [px + 0.04, py - 0.04, z + 0.03], [px + 0.04, py + 0.04, z + 0.03], [px - 0.04, py + 0.04, z + 0.03], col);
  }
}

/**
 * The trade fair: vaulted exhibition halls in strong colours with banners at their doors, an entrance arch on two
 * pylons, an avenue of flags of the nations, stalls in white tents, crowds, and (the funfair's turn) a ferris wheel
 * lit up after dark.
 */
function buildTradeFair(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 11);
  const { kit, glow } = c;
  kit.box('#d6c4a1', [0, 0.02, 0], [w, 0.04, d]);
  const wide = w >= 5.5;
  // The halls across the back.
  const hd = clamp(d * 0.3, 1.0, 1.7);
  const halls = wide ? 2 : 1;
  const hw = wide ? (w - 0.8) / 2 - 0.15 : w - 0.6;
  const hz = -d / 2 + 0.2 + hd / 2;
  const ROOFS = ['#1d4ed8', '#dc2626', '#16a34a'];
  for (let i = 0; i < halls; i++) hall(c, halls === 1 ? 0 : (i ? 1 : -1) * (hw / 2 + 0.15), hz, hw, hd, ROOFS[i]);
  // The paved avenue from the gate, flags down both sides.
  const az0 = hz + hd / 2 + 0.1, az1 = d / 2 - 0.05;
  kit.flat(PAVING, -0.45, az0, 0.45, az1, 0.046);
  const nf = Math.max(2, Math.floor((az1 - az0 - 0.5) / 0.32));
  for (let i = 0; i < nf; i++) {
    const z = az0 + 0.15 + i * 0.32;
    for (const s of [-1, 1]) flag(c, s * 0.5, z, 0.85, FLAGS[(i * 2 + (s > 0 ? 1 : 0)) % FLAGS.length]);
  }
  // The gate: two pylons and the name across them.
  const gz = d / 2 - 0.2;
  for (const s of [-1, 1]) {
    kit.box('#16a34a', [s * 0.62, 0.45, gz], [0.16, 0.9, 0.16]);
    kit.box(WHITE, [s * 0.62, 0.92, gz], [0.2, 0.04, 0.2]);
  }
  sign(c, 0, 0.78, gz, 1.4, 0.2, WHITE, '#16a34a', 10, [0.4, 0.45, 0.35]);
  // The ferris wheel on one side of the avenue (the funfair's side), tents on the other.
  const side = (w / 2 - 0.55) / 2 + 0.3;
  const R = clamp(Math.min(side - 0.25, (az1 - az0) * 0.42), 0.55, 1.15);
  const wz = (az0 + az1) / 2 - 0.05;
  wheel(c, side + 0.15, wz, R);
  const tx0 = -w / 2 + 0.3, tx1 = -0.75;
  const TENT = ['#dc2626', '#facc15', '#2563eb', '#16a34a', '#f97316'];
  for (let z = az0 + 0.25; z < az1 - 0.2; z += 0.52) {
    for (let x = tx0 + 0.22; x < tx1 - 0.15; x += 0.52) {
      if (c.r() < 0.2) continue;
      kit.box(WHITE, [x, 0.13, z], [0.36, 0.18, 0.36]);
      const top: V3 = [x, 0.42, z];
      const col = pick(c, TENT);
      const cs: V3[] = [[x - 0.21, 0.22, z - 0.21], [x + 0.21, 0.22, z - 0.21], [x + 0.21, 0.22, z + 0.21], [x - 0.21, 0.22, z + 0.21]];
      for (let i = 0; i < 4; i++) kit.tri(i % 2 ? col : WHITE, top, cs[i], cs[(i + 1) % 4], [cs[i][0] + cs[(i + 1) % 4][0] - 2 * x, 1, cs[i][2] + cs[(i + 1) % 4][2] - 2 * z]);
      if (!low) kit.box('lamp0', [x, 0.2, z + 0.19], [0.03, 0.03, 0.03]);
    }
  }
  // A carousel in front of the wheel: a striped top over painted horses going round.
  {
    const cx = side + 0.15, cz = az1 - 0.38, cr = clamp(Math.min(w / 2 - cx - 0.1, 0.42), 0.28, 0.42);
    kit.post('#e5e7eb', [cx, 0.04, cz], cr, 0.06, 12);
    kit.post(GOLD, [cx, 0.1, cz], 0.04, 0.34, 6);
    for (let i = 0; i < (low ? 4 : 8); i++) {
      const a = (i / (low ? 4 : 8)) * Math.PI * 2;
      const hx = cx + Math.cos(a) * cr * 0.7, hz = cz + Math.sin(a) * cr * 0.7;
      kit.box(STEEL, [hx, 0.25, hz], [0.012, 0.3, 0.012]);
      kit.box(TENT[i % TENT.length], [hx, 0.18, hz], [0.05, 0.06, 0.12], [0, -a, 0]);
    }
    umbrella(c, cx, cz, cr + 0.06, 0.4, ['#dc2626', '#facc15'], 12);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lx = cx + Math.cos(a) * (cr + 0.06), lz = cz + Math.sin(a) * (cr + 0.06);
      glow.quad([lx - 0.03, 0.42, lz], [lx + 0.03, 0.42, lz], [lx + 0.03, 0.48, lz], [lx - 0.03, 0.48, lz], [1, 0.75, 0.3]);
    }
  }
  if (!low) {
    crowd(c, 30, -0.45, az0, 0.45, az1 - 0.25);
    crowd(c, 16, tx0, az0, tx1, az1 - 0.1, 0.04, (x, z) => Math.abs(((x - tx0 - 0.22) % 0.5) - 0.25) > 0.2 || Math.abs(((z - az0 - 0.25) % 0.5) - 0.25) > 0.2);
  }
  glow.quad([-0.45, 0.07, az0], [0.45, 0.07, az0], [0.45, 0.07, az1], [-0.45, 0.07, az1], [0.08, 0.07, 0.05]);
  lamp(c, -0.3, az1 - 0.6, 0.8, 1, 0, 0);
  lamp(c, 0.3, az0 + 0.4, 0.8, 2, 0, 0);
  return done(c);
}

/* ---------- The golf course ---------- */

/** A fairway from tee to green: a mown ribbon in two stripes of green, widest in the middle. */
function fairway(c: Ctx, a: [number, number], b: [number, number], W: number) {
  const n = c.low ? 6 : 10;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const px = -dz / L, pz = dx / L;
  const at = (t: number, s: number): V3 => {
    const hw = W * (0.55 + 0.45 * Math.sin(Math.PI * t));
    return [a[0] + dx * t + px * hw * s, 0.046, a[1] + dz * t + pz * hw * s];
  };
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    c.kit.quad(i % 2 ? '#86c95f' : '#79bd55', at(t0, -1), at(t0, 1), at(t1, 1), at(t1, -1), [0, 1, 0]);
  }
}
/** A green with its flag. */
function green(c: Ctx, x: number, z: number, r: number) {
  blob(c, '#9be07a', x, z, r, r * 0.85, 0.05, 12, 0.18);
  c.kit.box('#0f172a', [x + r * 0.2, 0.052, z], [0.03, 0.002, 0.03]);
  c.kit.box(WHITE, [x + r * 0.2, 0.26, z], [0.015, 0.42, 0.015]);
  c.kit.box('#dc2626', [x + r * 0.2 + 0.06, 0.42, z], [0.11, 0.08, 0.008]);
}

/**
 * The golf course: rough cut in two greens, mown fairways running to flagged greens, sand bunkers, a pond, cart paths,
 * clumps of trees round the edge, and at the front the clubhouse with its green roof and verandah, golf carts and a
 * few golfers.
 */
function buildGolf(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 12);
  const { kit } = c;
  kit.box(GRASS, [0, 0.02, 0], [w, 0.04, d]);
  if (!low) {
    blob(c, '#579a3d', -w * 0.2, -d * 0.1, w * 0.3, d * 0.25, 0.042, 12, 0.3);
    blob(c, '#68a94b', w * 0.25, d * 0.05, w * 0.22, d * 0.3, 0.042, 12, 0.3);
  }
  // Two holes: tee boxes, fairways and greens, bunkers and a pond in the way.
  const holes: [[number, number], [number, number]][] = [
    [[-w / 2 + 0.7, d / 2 - 1.3], [w / 2 - 1.0, -d / 2 + 0.75]],
    [[w / 2 - 0.6, d / 2 - 0.7], [-w / 2 + 1.0, -d / 2 + 0.7]],
  ];
  const fw = clamp(d * 0.11, 0.35, 0.55);
  holes.forEach(([a, b], i) => {
    if (i === 1 && d < 4.5) {
      // A short hole across the back on a narrow course.
      a = [w / 2 - 0.7, -d / 2 + 0.75];
      b = [-w / 2 + 1.0, -d / 2 + 0.6];
    }
    fairway(c, a, b, i ? fw * 0.85 : fw);
    kit.flat('#9bd57a', a[0] - 0.15, a[1] - 0.1, a[0] + 0.15, a[1] + 0.1, 0.05);
    green(c, b[0], b[1], 0.42);
    blob(c, '#ead9a6', b[0] - 0.55 * Math.sign(b[0] || 1), b[1] + 0.3, 0.3, 0.18, 0.051, 10, 0.3);
    if (!low) blob(c, '#ead9a6', (a[0] + b[0]) / 2 + 0.35, (a[1] + b[1]) / 2 - 0.35, 0.24, 0.15, 0.051, 10, 0.3);
  });
  // The pond.
  const pondX = -w * 0.08, pondZ = d * 0.08;
  blob(c, '#2f7f9e', pondX, pondZ, 0.5, 0.32, 0.048, 14, 0.25);
  blob(c, '#3b9cc9', pondX, pondZ, 0.42, 0.26, 0.052, 14, 0.2);
  // The cart path, from the clubhouse out round the course.
  const path: [number, number][] = [[-w / 2 + 1.0, d / 2 - 0.35], [-w / 2 + 1.5, d / 2 - 1.0], [-0.3, d / 2 - 1.2], [w * 0.15, -0.1], [w / 2 - 0.7, -d / 2 + 1.4]];
  for (let i = 0; i < path.length - 1; i++) kit.bar('#cfc8b8', [path[i][0], 0.045, path[i][1]], [path[i + 1][0], 0.045, path[i + 1][1]], 0.07);
  // Trees in the rough, kept off the fairways, the greens, the pond and the clubhouse.
  const segDist = (x: number, z: number, [a, b]: [[number, number], [number, number]]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  const trees: [number, number][] = [];
  const nt = low ? 7 : 16;
  for (let tries = 0; trees.length < nt && tries < 400; tries++) {
    const x = -w / 2 + 0.22 + c.r() * (w - 0.44), z = -d / 2 + 0.22 + c.r() * (d - 0.9);
    if (holes.some((h) => segDist(x, z, h) < fw + 0.3 || Math.hypot(x - h[1][0], z - h[1][1]) < 0.75)) continue;
    if (Math.hypot(x - pondX, z - pondZ) < 0.7 || (x < -w / 2 + 2.4 && z > d / 2 - 1.0)) continue;
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 0.4)) continue;
    trees.push([x, z]);
    tree(c, x, z, 0.85 + c.r() * 0.3, pick(c, ['#2f6b25', '#3f7d2a', '#255a20']));
  }
  // The clubhouse at the front, its carts and golfers.
  const cx = -w / 2 + 0.85, cz = d / 2 - 0.42, cw = 1.3, cd = 0.6;
  kit.box(WHITE, [cx, 0.22, cz], [cw, 0.36, cd]);
  const ry = 0.4, rt = 0.68;
  const e = 0.08;
  const corners: V3[] = [[cx - cw / 2 - e, ry, cz - cd / 2 - e], [cx + cw / 2 + e, ry, cz - cd / 2 - e], [cx + cw / 2 + e, ry, cz + cd / 2 + e], [cx - cw / 2 - e, ry, cz + cd / 2 + e]];
  const ridge: V3[] = [[cx - cw * 0.25, rt, cz], [cx + cw * 0.25, rt, cz]];
  kit.quad(GREEN_DEEP, corners[0], corners[1], ridge[1], ridge[0], [0, 1, -1]);
  kit.quad(GREEN, corners[3], corners[2], ridge[1], ridge[0], [0, 1, 1]);
  kit.tri(GREEN_DEEP, corners[0], corners[3], ridge[0], [-1, 1, 0]);
  kit.tri(GREEN_DEEP, corners[1], corners[2], ridge[1], [1, 1, 0]);
  for (let i = 0; i < 5; i++) kit.box(WHITE, [cx - cw / 2 + 0.1 + i * ((cw - 0.2) / 4), 0.22, cz + cd / 2 + 0.05], [0.04, 0.36, 0.04]);
  for (let i = 0; i < 4; i++) kit.box(`glass${i}`, [cx - cw / 2 + 0.22 + i * ((cw - 0.44) / 3), 0.24, cz + cd / 2 + 0.004], [0.16, 0.16, 0.01]);
  flag(c, cx + cw / 2 + 0.2, cz + 0.2, 0.9, NIGERIA);
  for (let i = 0; i < (low ? 1 : 3); i++) {
    const f = frame([cx + cw / 2 + 0.35 + i * 0.2, 0.04, cz - 0.05], [0, 0, 0]);
    kit.box(WHITE, [0, 0.07, 0], [0.12, 0.06, 0.22], undefined, f);
    kit.box('#16a34a', [0, 0.19, -0.02], [0.13, 0.015, 0.16], undefined, f);
    for (const s of [-1, 1]) kit.box(STEEL, [s * 0.05, 0.13, -0.08], [0.01, 0.12, 0.01], undefined, f);
  }
  lamp(c, cx + cw / 2 + 0.1, d / 2 - 0.12, 0.7, 0, 0, -0.1);
  if (!low) {
    const GOLFER = [WHITE, '#fde68a', '#bfdbfe', '#fecaca', '#bbf7d0'];
    for (const [a, b] of holes) {
      person(c, a[0] + 0.1, a[1] - 0.05, 0.04, pick(c, GOLFER));
      person(c, b[0] - 0.25, b[1] + 0.1, 0.04, pick(c, GOLFER));
    }
    kit.flat('#cfc8b8', cx + cw / 2 + 0.95, d / 2 - 0.62, cx + cw / 2 + 1.95, d / 2 - 0.1, 0.046);
    car(c, cx + cw / 2 + 1.2, d / 2 - 0.36, Math.PI / 2, BLACK, true);
    car(c, cx + cw / 2 + 1.7, d / 2 - 0.36, Math.PI / 2, pick(c, CARS));
  }
  return done(c);
}

/* ---------- The polo ground ---------- */

/** A polo pony at the gallop with its rider in team colours, mallet raised; facing `yaw`. */
function horse(c: Ctx, x: number, z: number, yaw: number, coat: string, shirt: string, s = 1.5) {
  const f = frame([x, 0.04, z], [0, yaw, 0]).multiply(new Matrix4().makeScale(s, s, s));
  const k = c.kit;
  k.box(coat, [0, 0.17, 0], [0.09, 0.09, 0.26], undefined, f);
  k.box(coat, [0, 0.24, 0.14], [0.06, 0.12, 0.06], [-0.6, 0, 0], f);
  k.box(coat, [0, 0.29, 0.2], [0.05, 0.05, 0.1], [0.4, 0, 0], f);
  for (const [lx, lz, a] of [[-0.03, 0.1, 0.35], [0.03, 0.1, -0.2], [-0.03, -0.1, -0.35], [0.03, -0.1, 0.2]] as const) k.box('#3f1d0b', [lx, 0.07, lz], [0.025, 0.13, 0.025], [a, 0, 0], f);
  k.box('#1c1917', [0, 0.18, -0.15], [0.02, 0.08, 0.05], [0.6, 0, 0], f);
  if (c.low) return;
  k.box(shirt, [0, 0.27, -0.01], [0.06, 0.09, 0.05], undefined, f);
  k.box(WHITE, [0, 0.34, -0.01], [0.045, 0.04, 0.045], undefined, f);
  k.box(WHITE, [0, 0.19, -0.01], [0.1, 0.035, 0.06], undefined, f);
  k.box('#d6c49a', [0.06, 0.32, 0.08], [0.008, 0.008, 0.26], [0.5, 0, 0], f);
}

/**
 * The polo ground: a long pitch mown in stripes inside low white boards, tall goal posts at each end, the ponies and
 * their riders in two teams' colours mid-chukka, a grandstand down the side under a striped canopy full of hats, the
 * clubhouse with its verandah and flag, a row of stables at the back, and the big men's SUVs parked at the front.
 */
function buildPolo(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 13);
  const { kit } = c;
  kit.box('#6fa64a', [0, 0.02, 0], [w, 0.04, d]);
  const fx0 = -w / 2 + 0.2, fx1 = w / 2 - 1.15, fz0 = -d / 2 + 0.3, fz1 = d / 2 - 0.95;
  const fw = fx1 - fx0, fd = fz1 - fz0, fxc = (fx0 + fx1) / 2, fzc = (fz0 + fz1) / 2;
  const stripes = low ? 6 : 10;
  for (let i = 0; i < stripes; i++) kit.flat(i % 2 ? '#86c95f' : '#79bd55', fx0, fz0 + (fd / stripes) * i, fx1, fz0 + (fd / stripes) * (i + 1), 0.045);
  // Boards down the long sides, lines across the middle and at the ends.
  for (const x of [fx0, fx1]) kit.box(WHITE, [x, 0.08, fzc], [0.04, 0.08, fd]);
  kit.flat(LINE, fx0, fzc - 0.01, fx1, fzc + 0.01, 0.05);
  for (const z of [fz0 + fd * 0.2, fz1 - fd * 0.2]) for (let x = fx0 + 0.1; x < fx1 - 0.05; x += 0.2) kit.flat(LINE, x, z - 0.008, x + 0.1, z + 0.008, 0.05);
  // Goal posts at each end.
  for (const z of [fz0 + 0.05, fz1 - 0.05]) {
    for (const s of [-1, 1]) {
      kit.post(WHITE, [fxc + s * 0.35, 0.04, z], 0.025, 0.55, 6);
      kit.post('#dc2626', [fxc + s * 0.35, 0.25, z], 0.027, 0.08, 6);
    }
  }
  // The play: ponies in two teams and the ball.
  const plays: [number, number, number, string][] = [
    [fxc - 0.3, fzc - 0.4, 0.3, '#dc2626'], [fxc + 0.1, fzc - 0.2, 0.1, '#1d4ed8'], [fxc + 0.45, fzc + 0.3, -2.8, '#dc2626'],
    [fxc - 0.5, fzc + 0.7, 2.9, '#1d4ed8'], [fxc + 0.2, fzc - 1.1, 0.6, '#dc2626'], [fxc - 0.15, fzc + 1.3, 3.0, '#1d4ed8'],
  ];
  const coats = ['#7c2d12', '#1f2937', '#a16207', '#57534e', '#78350f', '#292524'];
  plays.slice(0, low ? 3 : 6).forEach(([x, z, yaw, shirt], i) => horse(c, x, z, yaw, coats[i], shirt));
  kit.box(WHITE, [fxc - 0.05, 0.065, fzc - 0.05], [0.035, 0.035, 0.035]);
  // The grandstand down the side, under a striped canopy, full of hats.
  const sx0 = fx1 + 0.12, sx1 = w / 2 - 0.12, sz0 = fz0 + 0.3, sz1 = Math.min(fz1 - 0.2, sz0 + Math.max(1.6, fd * 0.55));
  for (let r = 0; r < 3; r++) {
    const x = sx0 + 0.12 + r * 0.17;
    kit.box(r % 2 ? '#e7e5e4' : '#d6d3d1', [x, 0.06 + r * 0.06, (sz0 + sz1) / 2], [0.17, 0.12 + r * 0.12, sz1 - sz0]);
    if (!low) for (let z = sz0 + 0.1; z < sz1 - 0.05; z += 0.11) if (c.r() < 0.7) person(c, x, z, 0.12 + r * 0.12, pick(c, ['#f8fafc', '#fde68a', '#fbcfe8', '#bfdbfe', '#a7f3d0', '#dc2626', '#7c3aed']), true);
  }
  const strips = Math.round((sz1 - sz0) / 0.2);
  for (let i = 0; i < strips; i++) {
    const za = sz0 + ((sz1 - sz0) / strips) * i, zb = za + (sz1 - sz0) / strips;
    kit.quad(i % 2 ? GREEN : WHITE, [sx0 - 0.05, 0.62, za], [sx0 - 0.05, 0.62, zb], [sx1 + 0.02, 0.74, zb], [sx1 + 0.02, 0.74, za], [-0.12, 1, 0]);
  }
  for (const z of [sz0, sz1]) for (const x of [sx0, sx1]) kit.box(WHITE, [x, 0.36, z], [0.03, 0.66, 0.03]);
  // The clubhouse at the front corner, its verandah and flag.
  const cx = (sx0 + sx1) / 2, cz = d / 2 - 0.62, cw = sx1 - sx0 + 0.05, cd = 0.7;
  kit.box(CREAM, [cx, 0.22, cz], [cw, 0.36, cd]);
  kit.box('#b45309', [cx, 0.43, cz], [cw + 0.12, 0.06, cd + 0.12]);
  kit.box('#9a3412', [cx, 0.5, cz], [cw - 0.2, 0.08, cd - 0.25]);
  for (let i = 0; i < 4; i++) kit.box(`glass${i}`, [cx - 0.08, 0.24, cz - cd / 2 + 0.12 + i * 0.16], [cw + 0.006 - 0.15, 0.13, 0.1]);
  flag(c, cx - cw / 2 - 0.1, cz + 0.35, 0.95, NIGERIA);
  // Stables along the back.
  if (sz0 > -d / 2 + 0.25 || fz0 > -d / 2 + 0.25) {
    kit.box(CREAM, [cx, 0.14, -d / 2 + 0.2], [cw, 0.2, 0.25]);
    kit.box('#9a3412', [cx, 0.27, -d / 2 + 0.2], [cw + 0.06, 0.04, 0.32]);
  }
  // Parking along the front, the pitch's lamps.
  const pz = d / 2 - 0.42;
  kit.flat('#b8a98a', fx0, fz1 + 0.12, fx1, d / 2 - 0.08, 0.046);
  if (!low) for (let i = 0; i < Math.floor(fw / 0.55); i++) if (c.r() < 0.6) car(c, fx0 + 0.32 + i * 0.55, pz, Math.PI, i % 3 === 0 ? WHITE : BLACK, true);
  lamp(c, fx0 + 0.1, fz1 + 0.15, 0.9, 0, 0.12, 0);
  lamp(c, fx1 - 0.1, fz0 - 0.15, 0.9, 1, -0.12, 0);
  return done(c);
}

/* ---------- Arewa House ---------- */

/** The Arewa knot (dagin Arewa): a square ring turned on its corner with a loop at each point, in relief on a wall facing +z. */
function knot(c: Ctx, key: string, x: number, y: number, z: number, s: number) {
  const k = c.kit;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.box(key, [x + Math.cos(a) * s * 0.35, y + Math.sin(a) * s * 0.35, z], [s * 0.7, s * 0.09, 0.012], [0, 0, a + Math.PI / 2]);
    const b = (i / 4) * Math.PI * 2;
    k.shape(key, unitCyl(8, 1), [x + Math.cos(b) * s * 0.62, y + Math.sin(b) * s * 0.62, z], [s * 0.16, 0.012, s * 0.16], [Math.PI / 2, 0, 0]);
  }
}

/**
 * Arewa House: the old residence in white with the North's green, a two-storey middle block under a green hipped roof
 * with the Arewa knot over its arched porch, single-storey wings either side with battlemented parapets and the
 * pointed zanko pinnacles of Hausa building at their corners, an arcade of pointed arches along the front, and a lawn
 * with a path, flags, the Sardauna's statue, neem trees and a white wall with green-capped piers.
 */
function buildArewa(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 14);
  const { kit } = c;
  kit.box(LAWN, [0, 0.02, 0], [w, 0.04, d]);
  const WALL = '#f7f3ea';
  const deep = d >= 4;
  const z0 = -d / 2 + 0.2, bd = deep ? 1.5 : 1.15, z1 = z0 + bd, zc = (z0 + z1) / 2;
  // Wings either side, battlemented, zanko at the corners.
  const cw = Math.min(1.5, w * 0.32), ww = (w - 0.5 - cw) / 2, wh = 0.62;
  for (const s of [-1, 1]) {
    const x = s * (cw / 2 + ww / 2);
    kit.box(WALL, [x, wh / 2, zc + 0.05], [ww, wh, bd - 0.1]);
    kit.box('#e7e0cf', [x, wh + 0.01, zc + 0.05], [ww + 0.04, 0.03, bd - 0.06]);
    for (let i = 0; i < Math.floor(ww / 0.16); i++) kit.box(WALL, [x - ww / 2 + 0.08 + i * 0.16, wh + 0.06, z1 - 0.03], [0.08, 0.08, 0.04]);
    for (const zz of [z0 + 0.05, z1 - 0.05]) {
      for (const xx of [x - ww / 2 + 0.03, x + ww / 2 - 0.03]) {
        kit.post(WALL, [xx, wh, zz], 0.05, 0.16, 4, 0.2);
      }
    }
    // Windows with green shutters along the wing's front.
    for (let i = 0; i < Math.max(2, Math.floor(ww / 0.38)); i++) {
      const wx = x - ww / 2 + 0.22 + i * 0.38;
      if (wx > x + ww / 2 - 0.15) break;
      kit.box(`glass${i % 3}`, [wx, 0.32, z1 - 0.044], [0.14, 0.22, 0.01]);
      for (const k of [-1, 1]) kit.box(GREEN, [wx + k * 0.1, 0.32, z1 - 0.042], [0.05, 0.24, 0.01]);
    }
    kit.box(GREEN, [x, 0.06, z1 - 0.05], [ww, 0.04, 0.01]);
  }
  // The middle block, two storeys, under a green hipped roof.
  const ch = 1.2;
  kit.box(WALL, [0, ch / 2, zc], [cw, ch, bd]);
  const e = 0.1, ry = ch, rt = ch + 0.5;
  const q: V3[] = [[-cw / 2 - e, ry, z0 - e], [cw / 2 + e, ry, z0 - e], [cw / 2 + e, ry, z1 + e], [-cw / 2 - e, ry, z1 + e]];
  const r0: V3 = [-cw * 0.15, rt, zc], r1: V3 = [cw * 0.15, rt, zc];
  kit.quad(GREEN_DEEP, q[0], q[1], r1, r0, [0, 1, -1]);
  kit.quad(GREEN, q[3], q[2], r1, r0, [0, 1, 1]);
  kit.tri(GREEN_DEEP, q[0], q[3], r0, [-1, 1, 0]);
  kit.tri(GREEN, q[1], q[2], r1, [1, 1, 0]);
  kit.box('#d4c9ac', [0, rt + 0.02, zc], [cw * 0.32, 0.04, 0.05]);
  // Upstairs windows and the knot over the porch.
  for (const s of [-1, 1]) {
    kit.box('glass3', [s * cw * 0.3, 0.9, z1 + 0.005], [0.18, 0.28, 0.01]);
    for (const k of [-1, 1]) kit.box(GREEN, [s * cw * 0.3 + k * 0.12, 0.9, z1 + 0.008], [0.05, 0.3, 0.01]);
  }
  knot(c, GREEN, 0, 0.92, z1 + 0.01, 0.34);
  // The arcade across the front: piers, pointed arches, the shade behind them.
  const az = z1 + 0.22;
  const span = w - 0.6;
  const n = Math.max(5, Math.round(span / 0.4));
  kit.flat('#e7e0cf', -span / 2, z1, span / 2, az + 0.06, 0.05);
  kit.box('#3f3a33', [0, 0.25, z1 + 0.004], [span, 0.42, 0.01]);
  for (let i = 0; i <= n; i++) kit.box(WALL, [-span / 2 + (span / n) * i, 0.25, az], [0.08, 0.42, 0.08]);
  for (let i = 0; i < n; i++) {
    const xa = -span / 2 + (span / n) * i + 0.04, xb = xa + span / n - 0.08, xm = (xa + xb) / 2;
    kit.quad(WALL, [xa, 0.4, az + 0.04], [xb, 0.4, az + 0.04], [xb, 0.52, az + 0.04], [xa, 0.52, az + 0.04], [0, 0, 1]);
    kit.tri('#3f3a33', [xa, 0.4, az + 0.042], [xb, 0.4, az + 0.042], [xm, 0.49, az + 0.042], [0, 0, 1]);
    kit.quad(WALL, [xa - 0.04, 0.4, az - 0.04], [xb + 0.04, 0.4, az - 0.04], [xb + 0.04, 0.4, az + 0.04], [xa - 0.04, 0.4, az + 0.04], [0, -1, 0]);
  }
  kit.box(WALL, [0, 0.55, az - 0.06], [span + 0.08, 0.06, 0.28]);
  kit.box(GREEN, [0, 0.59, az + 0.08], [span + 0.08, 0.025, 0.01]);
  // The lawn: path, statue, flags, trees, and the wall with its gate.
  const fz = d / 2 - 0.08;
  kit.flat('#d8c7a3', -0.22, az + 0.1, 0.22, fz, 0.048);
  const sz = (az + fz) / 2 + 0.05;
  if (fz - az > 0.7) {
    kit.post('#d6d3d1', [0, 0.04, sz], 0.2, 0.06, 12);
    kit.box('#a8a29e', [0, 0.17, sz], [0.16, 0.2, 0.16]);
    kit.box(WHITE, [0, 0.36, sz], [0.1, 0.18, 0.07]);
    kit.box('#8b5a3c', [0, 0.47, sz], [0.05, 0.05, 0.05]);
    kit.box('#b91c1c', [0, 0.51, sz], [0.055, 0.03, 0.055]);
  }
  flag(c, -0.6, fz - 0.25, 1.0, NIGERIA);
  if (!low) flag(c, -0.9, fz - 0.25, 1.0, [GREEN, GREEN, GREEN]);
  for (const s of [-1, 1]) {
    tree(c, s * (w / 2 - 0.4), fz - 0.4, 1.0);
    if (!low && deep) tree(c, s * (w / 2 - 0.3), z0 + 0.3, 0.9);
  }
  for (const s of [-1, 1]) {
    kit.box(WALL, [s * (w / 4 + 0.15), 0.12, fz], [w / 2 - 0.4, 0.16, 0.06]);
    for (let x = 0.3; x < w / 2 - 0.05; x += 0.6) {
      kit.box(WALL, [s * x, 0.16, fz], [0.08, 0.24, 0.08]);
      kit.box(GREEN, [s * x, 0.29, fz], [0.1, 0.03, 0.1]);
    }
  }
  lamp(c, 0.4, fz - 0.15, 0.7, 0, -0.1, 0);
  lamp(c, -0.4, fz - 0.15, 0.7, 1, 0.1, 0);
  if (!low) crowd(c, 5, -0.3, az + 0.15, 0.3, fz - 0.1, 0.048);
  return done(c);
}

/* ---------- The park ---------- */

/**
 * The park: lawns cut by paths, a ring round the fountain in the middle (its basin, tiers and jet lit at night),
 * flower beds, neem trees and a few palms, benches round the ring and lamps along it, a red-roofed gazebo, a swing and
 * slide for the children, a drinks kiosk by the gate, picnic mats with families on them, and an iron railing with the
 * park's name over the gate.
 */
function buildPark(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 15);
  const { kit, glow } = c;
  kit.box(LAWN, [0, 0.02, 0], [w, 0.04, d]);
  if (!low) for (let i = 0; i < 4; i++) blob(c, LAWN_DARK, (i % 2 ? 1 : -1) * w * 0.25, (i < 2 ? -1 : 1) * d * 0.22, w * 0.16, d * 0.14, 0.042, 10, 0.3);
  const fz = -0.1;
  const R = Math.min(w, d) * 0.2;
  // Paths: a ring round the fountain, spokes to the gate and the sides.
  const PATH = '#d8c7a3';
  ring(c, PATH, 0, fz, R, R + 0.22, 0.046, low ? 16 : 28);
  kit.flat(PATH, -0.13, fz + R + 0.15, 0.13, d / 2, 0.046);
  kit.flat(PATH, -w / 2, fz - 0.11, -R - 0.15, fz + 0.11, 0.046);
  kit.flat(PATH, R + 0.15, fz - 0.11, w / 2, fz + 0.11, 0.046);
  kit.flat(PATH, -0.11, -d / 2 + 0.25, 0.11, fz - R - 0.15, 0.046);
  ring(c, '#e2d6b8', 0, fz, R * 0.58, R, 0.047, low ? 16 : 24);
  // The fountain: a basin, water, two tiers and the jet.
  const br = R * 0.55;
  kit.post('#d6d3d1', [0, 0.04, fz], br, 0.1, 16);
  kit.post('#4fb3d9', [0, 0.04, fz], br - 0.05, 0.105, 16);
  kit.post('#d6d3d1', [0, 0.04, fz], 0.08, 0.22, 8);
  kit.post('#d6d3d1', [0, 0.26, fz], 0.18, 0.03, 10);
  kit.post('#4fb3d9', [0, 0.26, fz], 0.15, 0.035, 10);
  kit.post('#bfe6f5', [0, 0.29, fz], 0.025, 0.3, 6);
  kit.post('#bfe6f5', [0, 0.52, fz], 0.08, 0.1, 6, 0.2);
  glowPool(c, 0, fz, br - 0.05, [0.1, 0.35, 0.5], 0.15);
  glow.tri([-0.03, 0.29, fz + 0.03], [0.03, 0.29, fz + 0.03], [0, 0.62, fz + 0.03], [0.3, 0.55, 0.7]);
  // Flower beds round the basin.
  const BLOOM = ['#dc2626', '#facc15', '#db2777', '#f97316', '#a855f7'];
  for (let i = 0; i < (low ? 4 : 8); i++) {
    const a = (i / (low ? 4 : 8)) * Math.PI * 2 + Math.PI / 8;
    const r = R * 0.79;
    kit.post('#5b3a1e', [Math.cos(a) * r, 0.04, fz + Math.sin(a) * r], 0.12, 0.02, 8);
    kit.post(BLOOM[i % BLOOM.length], [Math.cos(a) * r, 0.04, fz + Math.sin(a) * r], 0.1, 0.035, 8);
  }
  // Benches round the ring and lamps beside them.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = R + 0.32;
    bench(c, Math.cos(a) * r, fz + Math.sin(a) * r, Math.PI / 2 - a + Math.PI);
    if (i % 2 === 0) lamp(c, Math.cos(a + 0.3) * r, fz + Math.sin(a + 0.3) * r, 0.65, i / 2, 0, 0);
  }
  // Trees all round, a few palms.
  const spots: [number, number][] = [];
  const nt = low ? 8 : 16;
  for (let i = 0, tries = 0; i < nt && tries < 200; tries++) {
    const x = -w / 2 + 0.3 + c.r() * (w - 0.6), z = -d / 2 + 0.3 + c.r() * (d - 0.8);
    if (Math.hypot(x, z - fz) < R + 0.6) continue;
    if (Math.abs(x) < 0.35 || Math.abs(z - fz) < 0.35) continue;
    if (Math.hypot(x - (-w / 2 + 0.75), z - (-d / 2 + 0.7)) < 0.6 || Math.hypot(x - (w / 2 - 0.8), z - (-d / 2 + 0.65)) < 0.65) continue;
    if (z > d / 2 - 1.05 && Math.abs(x) < w * 0.4) continue;
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.55)) continue;
    spots.push([x, z]);
    i++;
  }
  spots.forEach(([x, z], i) => (i % 5 === 4 ? palm(c, x, z, 1.0) : tree(c, x, z, 0.9 + c.r() * 0.35)));
  // The gazebo in one corner, the swings and slide in another.
  const gx = -w / 2 + 0.75, gz = -d / 2 + 0.7;
  if (!spots.some(([x, z]) => Math.hypot(x - gx, z - gz) < 0.5)) {
    kit.post('#e5e7eb', [gx, 0.04, gz], 0.38, 0.06, 6);
    for (let i = 0; i < 6; i++) kit.box(WHITE, [gx + Math.cos((i * Math.PI) / 3) * 0.3, 0.32, gz + Math.sin((i * Math.PI) / 3) * 0.3], [0.04, 0.5, 0.04]);
    kit.post('#b91c1c', [gx, 0.56, gz], 0.46, 0.26, 6, 0);
  }
  const px = w / 2 - 0.8, pz = -d / 2 + 0.65;
  kit.flat('#e9d8a6', px - 0.4, pz - 0.3, px + 0.4, pz + 0.3, 0.046);
  for (const s of [-1, 1]) kit.bar('#dc2626', [px - 0.3 + s * 0.12, 0.04, pz - 0.15], [px - 0.3, 0.4, pz - 0.15], 0.025);
  for (const s of [-1, 1]) kit.bar('#dc2626', [px + 0.1 + s * 0.12, 0.04, pz - 0.15], [px + 0.1, 0.4, pz - 0.15], 0.025);
  kit.bar('#dc2626', [px - 0.3, 0.4, pz - 0.15], [px + 0.1, 0.4, pz - 0.15], 0.025);
  kit.box('#facc15', [px - 0.2, 0.15, pz - 0.15], [0.08, 0.02, 0.05]);
  kit.box('#2563eb', [px, 0.15, pz - 0.15], [0.08, 0.02, 0.05]);
  kit.bar('#facc15', [px + 0.05, 0.3, pz + 0.12], [px + 0.35, 0.05, pz + 0.12], 0.08);
  kit.box('#2563eb', [px - 0.0, 0.17, pz + 0.12], [0.06, 0.26, 0.06]);
  // Picnic mats, families, strollers.
  if (!low) {
    const MATS = ['#dc2626', '#2563eb', '#f59e0b', '#16a34a'];
    for (let i = 0; i < 3; i++) {
      const x = [-0.3, -0.14, 0.3][i] * w, z = d / 2 - 0.85 - (i % 2) * 0.3;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.35)) continue;
      kit.flat(MATS[i], x - 0.17, z - 0.12, x + 0.17, z + 0.12, 0.047);
      person(c, x - 0.07, z, 0.047, undefined, true);
      person(c, x + 0.08, z + 0.03, 0.047, undefined, true);
    }
    crowd(c, 14, -w / 2 + 0.3, -d / 2 + 0.3, w / 2 - 0.3, d / 2 - 0.3, 0.046, (x, z) => {
      const r = Math.hypot(x, z - fz);
      return (r > R && r < R + 0.22) || Math.abs(x) < 0.12 || Math.abs(z - fz) < 0.1;
    });
  }
  // The drinks kiosk by the gate.
  const kx = 0.65, kz = d / 2 - 0.4;
  kit.box('#f97316', [kx, 0.18, kz], [0.36, 0.28, 0.26]);
  kit.box(WHITE, [kx, 0.34, kz], [0.42, 0.04, 0.32]);
  kit.box('#3b342e', [kx, 0.2, kz + 0.132], [0.24, 0.1, 0.01]);
  umbrella(c, kx + 0.38, kz, 0.2, 0.35, ['#dc2626', WHITE], 8);
  // The railing round the front and sides, the gate with the park's name over it.
  const ez = d / 2 - 0.06;
  fence(c, -w / 2 + 0.06, ez, -0.3, ez, 0.22, '#1f2937', 0.2);
  fence(c, 0.3, ez, w / 2 - 0.06, ez, 0.22, '#1f2937', 0.2);
  for (const s of [-1, 1]) {
    fence(c, s * (w / 2 - 0.06), -d / 2 + 0.06, s * (w / 2 - 0.06), ez, 0.22, '#1f2937', 0.4);
    kit.box(CREAM, [s * 0.3, 0.3, ez], [0.12, 0.52, 0.12]);
    kit.box(GREEN, [s * 0.3, 0.58, ez], [0.15, 0.04, 0.15]);
  }
  sign(c, 0, 0.62, ez, 0.62, 0.14, GREEN, WHITE, 6, [0.2, 0.35, 0.2]);
  return done(c);
}

/* ---------- The beach ---------- */

/**
 * The beach: a long strip of sand from the palms at the back down to the surf, a boardwalk and a thatched bar shack
 * strung with lights, coloured cabanas, rows of striped umbrellas and loungers, a volleyball net, a horse for rides,
 * people on the sand and in the water, foam lines and the Atlantic going from turquoise to deep blue.
 */
function buildBeach(w: number, d: number, low: boolean) {
  const c = start(w, d, low, 16);
  const { kit, glow } = c;
  const zb = -d / 2, zw = zb + d * 0.68, zf = d / 2;
  kit.box('#f0dca8', [0, 0.02, 0], [w, 0.04, d]);
  // Wet sand, foam and the sea, running a little past the footprint.
  const wave = (z: number, amp: number, k: number) => (x: number) => z + Math.sin(x * k + z * 3) * amp;
  const strip = (key: string, za: (x: number) => number, zz: (x: number) => number, y: number) => {
    const n = low ? 12 : 24;
    for (let i = 0; i < n; i++) {
      const xa = -w / 2 + (w / n) * i, xb = xa + w / n;
      kit.quad(key, [xa, y, za(xa)], [xb, y, za(xb)], [xb, y, zz(xb)], [xa, y, zz(xa)], [0, 1, 0]);
    }
  };
  strip('#d9c088', wave(zw - 0.25, 0.05, 1.3), wave(zw, 0.06, 1.1), 0.045);
  strip('#f8fafc', wave(zw, 0.06, 1.1), wave(zw + 0.1, 0.07, 1.2), 0.047);
  strip('#5ec4d6', wave(zw + 0.1, 0.07, 1.2), () => zf - 0.15, 0.046);
  strip('#f1f5f9', wave(zw + 0.42, 0.05, 0.9), wave(zw + 0.48, 0.05, 0.9), 0.049);
  strip('#2b8fb8', () => zf - 0.15, () => zf + 0.3, 0.044);
  if (!low) strip('#e0f2fe', wave(zf + 0.05, 0.04, 0.7), wave(zf + 0.1, 0.04, 0.7), 0.047);
  // The boardwalk along the back.
  kit.flat('#a47a52', -w / 2 + 0.1, zb + 0.08, w / 2 - 0.1, zb + 0.3, 0.05);
  if (!low) for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.2) kit.flat('#8b6542', x, zb + 0.08, x + 0.012, zb + 0.3, 0.052);
  // The bar shack with its thatch and string of lights.
  const bx = -w / 2 + 1.0, bz = zb + 0.65;
  kit.box('#b88b49', [bx, 0.2, bz], [0.9, 0.32, 0.5]);
  kit.box(WOOD, [bx, 0.3, bz + 0.3], [0.9, 0.04, 0.12]);
  const thatch = (x: number, z: number, hw: number, hd: number, y: number, top: number) => {
    const cs: V3[] = [[x - hw, y, z - hd], [x + hw, y, z - hd], [x + hw, y, z + hd], [x - hw, y, z + hd]];
    const t: V3 = [x, top, z];
    for (let i = 0; i < 4; i++) kit.tri(i % 2 ? '#c8a25a' : '#b48d48', t, cs[i], cs[(i + 1) % 4], [cs[i][0] + cs[(i + 1) % 4][0] - 2 * x, 1, cs[i][2] + cs[(i + 1) % 4][2] - 2 * z]);
  };
  thatch(bx, bz + 0.05, 0.6, 0.42, 0.42, 0.8);
  for (let i = 0; i < 4; i++) kit.box(`lamp${i}`, [bx - 0.45 + i * 0.3, 0.4, bz + 0.48], [0.03, 0.03, 0.03]);
  glowPool(c, bx, bz + 0.55, 0.65, scale(WARM, 0.3), 0.06, 0.4);
  for (let i = 0; i < 3; i++) {
    kit.box('#a47a52', [bx - 0.3 + i * 0.3, 0.12, bz + 0.48], [0.06, 0.14, 0.06]);
    if (!low) person(c, bx - 0.3 + i * 0.3, bz + 0.48, 0.19, undefined, true);
  }
  // Cabanas in a row, palms behind and between.
  const CAB = ['#ef4444', '#0ea5e9', '#facc15', '#22c55e', '#f97316'];
  const nc = Math.floor((w - 3) / 1.1);
  for (let i = 0; i < nc; i++) {
    const x = bx + 1.0 + i * 1.1;
    kit.box(WHITE, [x, 0.17, zb + 0.55], [0.32, 0.26, 0.28]);
    kit.box(CAB[i % CAB.length], [x, 0.32, zb + 0.55], [0.38, 0.04, 0.34]);
    kit.box(CAB[i % CAB.length], [x, 0.17, zb + 0.7], [0.32, 0.26, 0.012]);
  }
  for (let x = -w / 2 + 0.35; x < w / 2 - 0.2; x += low ? 1.3 : 0.75) palm(c, x + c.r() * 0.2, zb + 0.2 + c.r() * 0.15, 1.0 + c.r() * 0.3, 0.2);
  // Umbrellas and loungers across the sand.
  const UMB = [['#ef4444', WHITE], ['#0ea5e9', WHITE], ['#facc15', '#f97316'], ['#22c55e', '#facc15'], ['#a855f7', WHITE]] as const;
  const uz0 = zb + 1.05, uz1 = zw - 0.35;
  let k = 0;
  for (let x = -w / 2 + 2.2; x < w / 2 - 0.4; x += 0.75) {
    for (let z = uz0; z <= uz1 + 0.01; z += 0.55) {
      const ux = x + (Math.round(z * 10) % 2 ? 0.3 : 0);
      if (ux > w / 2 - 0.3) continue;
      umbrella(c, ux, z, 0.28, 0.4, UMB[k++ % UMB.length], 8);
      kit.box(WHITE, [ux + 0.16, 0.08, z + 0.05], [0.1, 0.03, 0.24], [0.15, 0, 0]);
      if (!low) {
        kit.box(WHITE, [ux - 0.16, 0.08, z + 0.05], [0.1, 0.03, 0.24], [0.15, 0, 0]);
        if (c.r() < 0.5) person(c, ux + 0.16, z + 0.05, 0.08, undefined, true);
        if (c.r() < 0.3) kit.flat(pick(c, CAB), ux - 0.1, z + 0.25, ux + 0.1, z + 0.38, 0.046);
      }
    }
  }
  // A volleyball net, the horse for rides, people on the sand and in the shallows.
  const vx = -w / 2 + 0.9, vz = zb + 1.45;
  for (const s of [-1, 1]) kit.box(WHITE, [vx + s * 0.4, 0.2, vz], [0.025, 0.36, 0.025]);
  kit.box('#e5e7eb', [vx, 0.31, vz], [0.8, 0.12, 0.008]);
  if (!low) {
    horse(c, w / 2 - 1.2, zw - 0.15, 1.4, WHITE, '#dc2626');
    crowd(c, 26, -w / 2 + 0.3, zb + 1.0, w / 2 - 0.3, zw + 0.05, 0.045);
    crowd(c, 10, -w / 2 + 0.5, zw + 0.15, w / 2 - 0.5, zw + 0.55, 0.0);
  }
  // A bonfire on the sand, lit at night.
  const fx = -w / 2 + 1.9, fzz = zw - 0.4;
  for (let i = 0; i < 3; i++) kit.bar(WOOD_DARK, [fx - 0.1, 0.05, fzz + (i - 1) * 0.04], [fx + 0.1, 0.12, fzz - (i - 1) * 0.04], 0.03);
  kit.box('#f97316', [fx, 0.1, fzz], [0.08, 0.06, 0.08]);
  glowPool(c, fx, fzz, 0.5, [0.55, 0.22, 0.04], 0.06);
  glow.tri([fx - 0.06, 0.08, fzz + 0.02], [fx + 0.06, 0.08, fzz + 0.02], [fx, 0.3, fzz + 0.02], [1, 0.5, 0.1], [1, 0.5, 0.1], [0.4, 0.1, 0]);
  return done(c);
}

/* ---------- The models ---------- */

type Size = { w: number; d: number };

export function Market({ w, d }: Size) {
  return <KitModel build={(low) => buildMarket(w, d, low)} deps={[w, d]} />;
}
export function Mall({ w, d }: Size) {
  return <KitModel build={(low) => buildMall(w, d, low)} deps={[w, d]} />;
}
export function Boutique({ w, d }: Size) {
  return <KitModel build={(low) => buildBoutique(w, d, low)} deps={[w, d]} />;
}
export function Bank({ w, d }: Size) {
  return <KitModel build={(low) => buildBank(w, d, low)} deps={[w, d]} />;
}
export function Hotel({ w, d }: Size) {
  return <KitModel build={(low) => buildHotel(w, d, low)} deps={[w, d]} />;
}
export function Club({ w, d }: Size) {
  return <KitModel build={(low) => buildClub(w, d, low)} deps={[w, d]} />;
}
export function Buka({ w, d }: Size) {
  return (
    <group>
      <KitModel build={(low) => buildBuka(w, d, low)} deps={[w, d]} />
      <Smoke at={[w / 2 - 0.4, 0.25, -d / 2 + 0.55]} n={6} h={1.2} />
    </group>
  );
}
export function Suya({ w, d }: Size) {
  return (
    <group>
      <KitModel build={(low) => buildSuya(w, d, low)} deps={[w, d]} />
      <Smoke at={[0.45, 0.4, -0.05]} n={7} h={1.4} />
    </group>
  );
}
export function Viewing({ w, d }: Size) {
  return <KitModel build={(low) => buildViewing(w, d, low)} deps={[w, d]} />;
}
export function GloryDome({ w, d }: Size) {
  return <KitModel build={(low) => buildGloryDome(w, d, low)} deps={[w, d]} />;
}
export function TradeFair({ w, d }: Size) {
  return <KitModel build={(low) => buildTradeFair(w, d, low)} deps={[w, d]} />;
}
export function Golf({ w, d }: Size) {
  return <KitModel build={(low) => buildGolf(w, d, low)} deps={[w, d]} />;
}
export function Polo({ w, d }: Size) {
  return <KitModel build={(low) => buildPolo(w, d, low)} deps={[w, d]} />;
}
export function Arewa({ w, d }: Size) {
  return <KitModel build={(low) => buildArewa(w, d, low)} deps={[w, d]} />;
}
export function Park({ w, d }: Size) {
  return <KitModel build={(low) => buildPark(w, d, low)} deps={[w, d]} />;
}
export function Beach({ w, d }: Size) {
  return <KitModel build={(low) => buildBeach(w, d, low)} deps={[w, d]} />;
}
