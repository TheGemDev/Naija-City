// The stadium on the city map: a rounded bowl of raked stands in green and white round a red running track and a
// striped pitch, a cantilevered roof over the main stand hung from a tall white arch (a nod to the national stadium
// in Abuja), floodlight masts at the four corners, a ribbed facade over a glazed concourse, and out front the main
// gate with its sign, turnstiles, ticket booths, flags, and the buses and kekes that brought the fans.
// Centred on its footprint (w along x, d along z), sits on y=0, gate on the +z side (the place's door).
//
// Built for phones. Everything that repeats (seat rows, ribs, fans, arch segments) is merged into one geometry per
// colour, so the whole stadium is a handful of plain meshes that the map's StaticBatch folds into the town's own
// buckets: no new draw calls for them. The floodlight lamps share lampMat and the concourse glass shares windowMat,
// so they come on with the street lamps and windows. The floodlit glow on the pitch is one more mesh, drawn only
// after dark. Low performance mode keeps fewer rows and segments and leaves out the fans, the vehicles, the light
// beams and the roof's rafters.

import { Vector3 } from 'three';
import { clamp, frame, Glow, Kit, KitModel, rng, scale, unitCyl, type RGB, type V3 } from './placeKit';

/* ---------- Colours ---------- */

const GREEN = '#15803d';
const GREEN_DEEP = '#166534';
const WHITE = '#f4f6f8';
const SEAT_SHADE = { [GREEN]: '#0f5f2d', [WHITE]: '#c9ced6', [GREEN_DEEP]: '#0d4a24' } as Record<string, string>;
const AISLE = '#b9b4ab';
const AISLE_RISER = '#8f8a82';
const TUNNEL = '#1c1917';
const FACADE = '#dcd8d0';
const RIB = '#ffffff';
const ROOF = '#f8fafc';
const ROOF_UNDER = '#b8c2cf';
const STEEL = '#94a3b8';
const DARK = '#1f2937';
const TRACK = '#b4532a';
const INFIELD = '#3f8f4a';
const STRIPE_A = '#4caf5a';
const STRIPE_B = '#3e9d4c';
const LINE = '#f8fafc';
const PAVING = '#d6d0c4';
const LOT = '#a7b98a';
const ASPHALT = '#4b5563';
const CONCRETE = '#a8a29e';
const ADS = ['#dc2626', '#2563eb', '#facc15', GREEN, '#f97316', WHITE];
const FANS = [GREEN, GREEN, WHITE, WHITE, '#facc15', '#dc2626', '#1d4ed8', '#f97316', '#0f172a'];

/* ---------- The shape of the bowl ---------- */

/** The bowl is a superellipse: rounder than a rectangle, squarer than an oval. */
const EXP = 2 / 2.6;
const sp = (v: number) => Math.sign(v) * Math.abs(v) ** EXP;

interface Bowl {
  /** The outside of the stands: half-widths along x and z, and where its middle sits on z. */
  A: number; B: number; z0: number;
  /** How deep the stands are, and the half-widths of their inside edge (the track's edge). */
  depth: number; ai: number; bi: number;
  /** Height of the stands at their lowest, the pitch wall's height, and how many rows of seats. */
  H: number; y0: number; R: number;
}

function bowlOf(w: number, d: number, low: boolean): Bowl {
  const A = w / 2 - 0.3;
  const B = d / 2 - 0.55;
  const depth = clamp(Math.min(A, B) * 0.45, 0.85, 1.3);
  return { A, B, z0: -0.25, depth, ai: A - depth, bi: B - depth, H: clamp(Math.min(A, B) * 0.36, 0.8, 1.1), y0: 0.16, R: low ? 4 : 6 };
}

/** A point on the bowl: `th` round it (+z, the front, at π/2), `k` from the inside edge (0) to the outside (1). */
function at(o: Bowl, th: number, k: number, y: number): V3 {
  return [(o.ai + k * o.depth) * sp(Math.cos(th)), y, o.z0 + (o.bi + k * o.depth) * sp(Math.sin(th))];
}
/** The rise of one row: the main stand at the back is the tallest, the end behind the gate the lowest, so the pitch shows from the map. */
const rise = (o: Bowl, th: number) => (o.H / o.R) * (0.72 + 0.6 * ((1 - Math.sin(th)) / 2) ** 1.6);
const topOf = (o: Bowl, th: number) => o.y0 + o.R * rise(o, th);
/** Pointing away from the middle of the bowl, flat. */
const outward = (o: Bowl, p: V3): V3 => [p[0], 0, p[2] - o.z0];
const inward = (o: Bowl, p: V3): V3 => [-p[0], 0, o.z0 - p[2]];

/** `n` angles round the bowl, evenly spaced along its middle line, the first segment centred on the front. */
function spacing(o: Bowl, n: number) {
  const M = 720;
  const th: number[] = [];
  const len: number[] = [0];
  for (let i = 0; i <= M; i++) th.push(Math.PI / 2 + (i / M) * Math.PI * 2);
  for (let i = 1; i <= M; i++) {
    const a = at(o, th[i - 1], 0.5, 0), b = at(o, th[i], 0.5, 0);
    len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const total = len[M];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const target = (((i - 0.5) / n) * total + total) % total;
    let j = 1;
    while (j < M && len[j] < target) j++;
    const f = (target - len[j - 1]) / (len[j] - len[j - 1] || 1);
    const v = th[j - 1] + (th[j] - th[j - 1]) * f;
    // The first point sits just before the front: keep the angles rising all the way round.
    out.push(i === 0 && v > Math.PI ? v - Math.PI * 2 : v);
  }
  return out;
}

/* ---------- Building it ---------- */

function build(w: number, d: number, low: boolean) {
  const o = bowlOf(w, d, low);
  const kit = new Kit();
  const glow = new Glow();
  const rand = rng(Math.round(w * 131 + d * 17));
  const n = low ? 64 : 96;
  const per = n / 16;
  const ths = spacing(o, n);
  const thAt = (i: number) => ths[((i % n) + n) % n] + (i >= n ? Math.PI * 2 : 0);
  const { R, y0, z0 } = o;
  const vom = Math.floor(R / 2);

  /* The ground: a green lot, the paved concourse ring round the bowl and the plaza in front of the gate. */
  kit.box(LOT, [0, 0.02, 0], [w, 0.04, d]);
  const ring = (key: string, k0: number, k1: number, y: number, steps = n) => {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2, b = ((i + 1) / steps) * Math.PI * 2;
      kit.quad(key, at(o, a, k0, y), at(o, b, k0, y), at(o, b, k1, y), at(o, a, k1, y), [0, 1, 0]);
    }
  };
  const disc = (key: string, a: number, b: number, y: number, steps = 48) => {
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * Math.PI * 2, t1 = ((i + 1) / steps) * Math.PI * 2;
      kit.tri(key, [0, y, z0], [a * sp(Math.cos(t0)), y, z0 + b * sp(Math.sin(t0))], [a * sp(Math.cos(t1)), y, z0 + b * sp(Math.sin(t1))], [0, 1, 0]);
    }
  };
  ring(PAVING, 1, 1 + 0.28 / o.depth, 0.045, 64);
  const front = z0 + o.B;
  kit.flat(PAVING, -1.45, front - 0.3, 1.45, d / 2 - 0.02, 0.046);

  /* The field: a red track round a grass infield, the pitch striped by the mower, its lines and goals. */
  const tw = clamp(Math.min(o.ai, o.bi) * 0.17, 0.22, 0.4);
  const ia = o.ai - tw, ib = o.bi - tw;
  disc(TRACK, o.ai + 0.03, o.bi + 0.03, 0.05);
  disc(INFIELD, ia, ib, 0.058);
  for (const f of [0.33, 0.66]) {
    const la = ia + tw * f, lb = ib + tw * f;
    for (let i = 0; i < 48; i++) {
      const t0 = (i / 48) * Math.PI * 2, t1 = ((i + 1) / 48) * Math.PI * 2;
      const p = (t: number, e: number): V3 => [(la + e) * sp(Math.cos(t)), 0.054, z0 + (lb + e) * sp(Math.sin(t))];
      kit.quad(LINE, p(t0, -0.008), p(t1, -0.008), p(t1, 0.008), p(t0, 0.008), [0, 1, 0]);
    }
  }
  const px = ia * 0.74;
  const pz = Math.min(ib * 0.74, px / 1.45);
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const x0 = -px + (i / stripes) * px * 2, x1 = -px + ((i + 1) / stripes) * px * 2;
    kit.flat(i % 2 ? STRIPE_A : STRIPE_B, x0, z0 - pz, x1, z0 + pz, 0.064);
  }
  const t = 0.022;
  const ly = 0.07;
  const line = (x0: number, za: number, x1: number, zb: number) => kit.flat(LINE, x0, z0 + za, x1, z0 + zb, ly);
  line(-px, -pz, px, -pz + t);
  line(-px, pz - t, px, pz);
  line(-px, -pz, -px + t, pz);
  line(px - t, -pz, px, pz);
  line(-t / 2, -pz, t / 2, pz);
  const cr = pz * 0.3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, b = ((i + 1) / 24) * Math.PI * 2;
    const p = (q: number, r: number): V3 => [Math.cos(q) * r, ly, z0 + Math.sin(q) * r];
    kit.quad(LINE, p(a, cr - t / 2), p(b, cr - t / 2), p(b, cr + t / 2), p(a, cr + t / 2), [0, 1, 0]);
  }
  for (const s of [-1, 1]) {
    const box = (deep: number, half: number) => {
      const xi = s * (px - deep);
      line(Math.min(xi, xi + s * t), -half, Math.max(xi, xi + s * t), half);
      line(Math.min(s * px, xi), -half, Math.max(s * px, xi), -half + t);
      line(Math.min(s * px, xi), half - t, Math.max(s * px, xi), half);
    };
    box(px * 0.31, pz * 0.6);
    box(px * 0.11, pz * 0.28);
    // The goal: posts and crossbar, the net slung behind.
    const gw = Math.max(0.14, pz * 0.16), gh = 0.11, gx = s * px;
    kit.box(LINE, [gx, gh / 2 + 0.06, z0 - gw], [0.022, gh, 0.022]);
    kit.box(LINE, [gx, gh / 2 + 0.06, z0 + gw], [0.022, gh, 0.022]);
    kit.box(LINE, [gx, gh + 0.06, z0], [0.022, 0.022, gw * 2 + 0.022]);
    kit.box('#d4d8de', [gx + s * 0.06, 0.06 + gh * 0.55, z0], [0.01, gh * 0.9, gw * 2], [0, 0, s * 0.5]);
  }

  /* The stands: rows of seats stepping up from the pitch wall, green, white and green like the flag, with concrete aisles. */
  const band = (r: number) => ((r + 0.5) / R < 1 / 3 ? GREEN : (r + 0.5) / R < 2 / 3 ? WHITE : GREEN_DEEP);
  for (let j = 0; j < n; j++) {
    const ta = thAt(j), tb = thAt(j + 1);
    const local = j % per;
    const aisle = local === 0;
    const sector = Math.floor(j / per);
    // The pitch wall, painted with sponsors' boards.
    const wa = at(o, ta, 0, 0), wb = at(o, tb, 0, 0);
    kit.quad(ADS[sector % ADS.length], wa, wb, at(o, tb, 0, y0), at(o, ta, 0, y0), inward(o, wa));
    for (let r = 0; r < R; r++) {
      const ka = r / R, kb = (r + 1) / R;
      const ya = (th: number) => y0 + r * rise(o, th);
      const yb = (th: number) => y0 + (r + 1) * rise(o, th);
      const seat = aisle ? AISLE : band(r);
      const riser = aisle ? AISLE_RISER : r === vom && local === Math.floor(per / 2) ? TUNNEL : SEAT_SHADE[band(r)];
      kit.quad(seat, at(o, ta, ka, yb(ta)), at(o, tb, ka, yb(tb)), at(o, tb, kb, yb(tb)), at(o, ta, kb, yb(ta)), [0, 1, 0]);
      const ra = at(o, ta, ka, ya(ta));
      kit.quad(riser, ra, at(o, tb, ka, ya(tb)), at(o, tb, ka, yb(tb)), at(o, ta, ka, yb(ta)), inward(o, ra));
    }
    // The parapet round the top and the facade down to the ground.
    const kp = 1 - 0.035 / o.depth;
    const ha = topOf(o, ta), hb = topOf(o, tb);
    kit.quad(GREEN, at(o, ta, kp, ha + 0.08), at(o, tb, kp, hb + 0.08), at(o, tb, 1, hb + 0.08), at(o, ta, 1, ha + 0.08), [0, 1, 0]);
    const pa = at(o, ta, kp, ha);
    kit.quad(GREEN, pa, at(o, tb, kp, hb), at(o, tb, kp, hb + 0.08), at(o, ta, kp, ha + 0.08), inward(o, pa));
    const fa = at(o, ta, 1, 0);
    kit.quad(FACADE, fa, at(o, tb, 1, 0), at(o, tb, 1, hb + 0.08), at(o, ta, 1, ha + 0.08), outward(o, fa));
    kit.quad(GREEN, at(o, ta, 1.004, ha - 0.04), at(o, tb, 1.004, hb - 0.04), at(o, tb, 1.004, hb + 0.08), at(o, ta, 1.004, ha + 0.08), outward(o, fa));
    // A glazed concourse along the foot of the facade, lit at night; the main entrance tunnel at the front.
    const kg = 1 + 0.012 / o.depth;
    const entrance = j === 0 || j === n - 1 || j === 1;
    const key = entrance ? TUNNEL : `glass${Math.floor(j / (n / 8))}`;
    kit.quad(key, at(o, ta, kg, entrance ? 0.04 : 0.12), at(o, tb, kg, entrance ? 0.04 : 0.12), at(o, tb, kg, 0.46), at(o, ta, kg, 0.46), outward(o, fa));
  }
  // Ribs up the facade, a white fin at every other seam.
  for (let i = 0; i < n; i += low ? 2 : 1) {
    if (i === 0 || i === 1 || i === n - 1) continue;
    const th = thAt(i);
    const p = at(o, th, 1, 0);
    const prev = at(o, thAt(i - 1), 1, 0), next = at(o, thAt(i + 1), 1, 0);
    let nx = next[2] - prev[2], nz = -(next[0] - prev[0]);
    const out = outward(o, p);
    if (nx * out[0] + nz * out[2] < 0) { nx = -nx; nz = -nz; }
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    const h = topOf(o, th) + 0.14;
    kit.box(RIB, [p[0] + nx * 0.035, h / 2, p[2] + nz * 0.035], [0.1, h, 0.035], [0, Math.atan2(-nz, nx), 0]);
  }

  /* Fans dotted along the rows, most of them in the home colours. */
  if (!low) {
    const fans = Math.round(n * R * 0.36);
    for (let f = 0; f < fans; f++) {
      const j = Math.floor(rand() * n);
      if (j % per === 0) continue;
      const r = Math.floor(rand() * R);
      const th = thAt(j) + (thAt(j + 1) - thAt(j)) * (0.2 + rand() * 0.6);
      const k = (r + 0.25 + rand() * 0.5) / R;
      const y = y0 + (r + 1) * rise(o, th);
      kit.box(FANS[Math.floor(rand() * FANS.length)], at(o, th, k, y + 0.04), [0.06, 0.08, 0.06]);
    }
  }

  /* The main stand's roof: a cantilevered canopy over the back stand, deepest in the middle, tapering round the corners. */
  const mid = -Math.PI / 2;
  const span = 1.05;
  const steps = low ? 20 : 36;
  const T = 0.05;
  const kOut = 1 + 0.06 / o.depth;
  const roofAt = (i: number) => {
    const th = mid - span + (i / steps) * span * 2;
    const e = Math.abs((th - mid) / span);
    const kIn = 1 - 0.8 * (1 - e ** 2.5);
    const yo = topOf(o, th) + 0.42;
    const yi = yo + 0.16 * (1 - e ** 2.5);
    return { th, kIn, yo, yi };
  };
  for (let i = 0; i < steps; i++) {
    const a = roofAt(i), b = roofAt(i + 1);
    const ai = at(o, a.th, a.kIn, a.yi), bi = at(o, b.th, b.kIn, b.yi);
    const ao = at(o, a.th, kOut, a.yo), bo = at(o, b.th, kOut, b.yo);
    const up = (p: V3, dy: number): V3 => [p[0], p[1] + dy, p[2]];
    kit.quad(ROOF, up(ai, T), up(bi, T), up(bo, T), up(ao, T), [0, 1, 0]);
    kit.quad(ROOF_UNDER, ai, bi, bo, ao, [0, -1, 0]);
    kit.quad(GREEN, up(ai, -0.04), up(bi, -0.04), up(bi, T), up(ai, T), inward(o, ai));
    kit.quad(ROOF_UNDER, ao, bo, up(bo, T), up(ao, T), outward(o, ao));
  }
  for (let i = 0; i <= steps; i += 3) {
    const r = roofAt(i);
    const foot = at(o, r.th, 1 - 0.02 / o.depth, topOf(o, r.th));
    kit.box(RIB, [foot[0], (foot[1] + r.yo) / 2, foot[2]], [0.045, r.yo - foot[1], 0.045]);
    if (!low && i > 0 && i < steps) {
      // A rafter along the top of the canopy, from the back edge to the front.
      const a = at(o, r.th, r.kIn, r.yi + T + 0.012), b = at(o, r.th, kOut, r.yo + T + 0.012);
      const tx = Math.cos(r.th + Math.PI / 2) * 0.013, tz = Math.sin(r.th + Math.PI / 2) * 0.013;
      kit.quad(STEEL, [a[0] - tx, a[1], a[2] - tz], [a[0] + tx, a[1], a[2] + tz], [b[0] + tx, b[1], b[2] + tz], [b[0] - tx, b[1], b[2] - tz], [0, 1, 0]);
    }
  }

  /* The arch the roof hangs from, standing on two plinths beyond the ends of the main stand. */
  const za = z0 - (o.bi + o.depth * 0.62);
  const xa = o.A * 0.93;
  const ya = topOf(o, mid) + 0.42 + 1.5;
  const archY = (x: number) => ya * (1 - Math.abs(x / xa) ** 3);
  const segs = low ? 12 : 22;
  for (let i = 0; i < segs; i++) {
    const x0 = -xa + (i / segs) * xa * 2, x1 = -xa + ((i + 1) / segs) * xa * 2;
    kit.bar(WHITE, [x0, archY(x0), za], [x1, archY(x1), za], 0.09);
  }
  for (const s of [-1, 1]) kit.box(CONCRETE, [s * xa, 0.07, za], [0.24, 0.14, 0.24]);
  const hangers = low ? 3 : 7;
  for (let i = 0; i < hangers; i++) {
    const x = (i / (hangers - 1) - 0.5) * xa * 1.1;
    // Where the canopy is under this point of the arch.
    const k = 0.62;
    const c = clamp(x / (o.ai + k * o.depth), -1, 1);
    const th = -Math.acos(Math.sign(c) * Math.abs(c) ** (1 / EXP));
    const roofY = topOf(o, th) + 0.42 + 0.12;
    kit.bar(STEEL, [x, archY(x), za], [x, roofY, za], 0.018);
  }

  /* Floodlight masts at the four corners, their lamp banks aimed at the pitch. */
  const masts: V3[] = [[-(w / 2 - 0.3), 0, -(d / 2 - 0.3)], [w / 2 - 0.3, 0, -(d / 2 - 0.3)], [-(w / 2 - 0.3), 0, d / 2 - 0.35], [w / 2 - 0.3, 0, d / 2 - 0.35]];
  const mh = 2.9 + Math.min(w, d) * 0.1;
  const glowWarm: RGB = [1, 0.93, 0.74];
  masts.forEach((m, i) => {
    kit.box(CONCRETE, [m[0], 0.08, m[2]], [0.3, 0.16, 0.3]);
    kit.post(STEEL, [m[0], 0.16, m[2]], 0.085, mh - 0.16, 4, 0.55);
    const yaw = Math.atan2(-m[0], z0 - m[2]);
    const f = frame([m[0], mh + 0.12, m[2]], [0.55, yaw, 0], 'YXZ');
    kit.box(DARK, [0, 0, 0], [0.82, 0.46, 0.07], [0, 0, 0], f);
    kit.box(`lamp${i}`, [0, 0, 0.045], [0.74, 0.38, 0.02], [0, 0, 0], f);
    for (const y of [-0.063, 0.063]) kit.box(DARK, [0, y, 0.058], [0.74, 0.018, 0.01], [0, 0, 0], f);
    for (const x of [-0.185, 0, 0.185]) kit.box(DARK, [x, 0, 0.058], [0.018, 0.38, 0.01], [0, 0, 0], f);
    kit.box(STEEL, [0, -0.3, -0.06], [0.7, 0.03, 0.2], [-0.55, 0, 0], f);
    // A beam of light from the lamps down onto the pitch, seen after dark.
    if (!low) {
      const head = new Vector3(0, 0, 0.06).applyMatrix4(f);
      const tx = m[0] * 0.22, tz = z0 + (m[2] - z0) * 0.22;
      const rad = Math.min(px, pz) * 0.9;
      const apex: V3 = [head.x, head.y, head.z];
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2, b = ((s + 1) / 6) * Math.PI * 2;
        glow.tri(apex, [tx + Math.cos(a) * rad, 0.08, tz + Math.sin(a) * rad], [tx + Math.cos(b) * rad, 0.08, tz + Math.sin(b) * rad], scale(glowWarm, 0.028), [0, 0, 0]);
      }
    }
  });

  /* The floodlit pitch: a wash of light over the field, fading out up the stands. */
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, b = ((i + 1) / 48) * Math.PI * 2;
    const p = (q: number, k: number, y: number): V3 => at(o, q, k, y);
    glow.tri([0, 0.09, z0], p(a, -tw / o.depth, 0.09), p(b, -tw / o.depth, 0.09), scale(glowWarm, 0.22), scale(glowWarm, 0.15));
    glow.quad(p(a, -tw / o.depth, 0.09), p(b, -tw / o.depth, 0.09), p(b, 0, 0.09), p(a, 0, 0.09), scale(glowWarm, 0.15), scale(glowWarm, 0.15), scale(glowWarm, 0.1), scale(glowWarm, 0.1));
    glow.quad(p(a, 0, y0 + rise(o, a) + 0.03), p(b, 0, y0 + rise(o, b) + 0.03), p(b, 1, topOf(o, b) + 0.03), p(a, 1, topOf(o, a) + 0.03), scale(glowWarm, 0.06), scale(glowWarm, 0.06), [0, 0, 0], [0, 0, 0]);
  }

  /* The scoreboard on legs above the east end, turned to face the pitch and the street. */
  {
    const yaw = Math.atan2(-0.82, 0.57);
    const top0 = topOf(o, 0);
    const cy = top0 + 0.5;
    const f = frame([o.A - 0.05, cy, z0], [0, yaw, 0]);
    for (const x of [-0.38, 0.38]) {
      const leg = new Vector3(x, 0, -0.06).applyMatrix4(f);
      kit.box(STEEL, [leg.x, (cy - 0.2) / 2, leg.z], [0.05, cy - 0.2, 0.05]);
    }
    kit.box(DARK, [0, 0, 0], [1.16, 0.56, 0.08], [0, 0, 0], f);
    kit.box(GREEN, [0, 0.31, 0], [1.2, 0.06, 0.1], [0, 0, 0], f);
    // What is on the screen: the two teams' colours, the score, and a ticker along the bottom.
    const screen: [number, number, number, number, string, RGB][] = [
      [-0.32, 0.1, 0.4, 0.16, GREEN, [0.1, 0.6, 0.25]],
      [0.32, 0.1, 0.4, 0.16, WHITE, [0.7, 0.7, 0.7]],
      [-0.09, -0.06, 0.08, 0.14, '#fef08a', [0.85, 0.8, 0.35]],
      [0.09, -0.06, 0.08, 0.14, '#fef08a', [0.85, 0.8, 0.35]],
      [0, -0.06, 0.04, 0.03, '#fef08a', [0.85, 0.8, 0.35]],
      [0, -0.2, 1.04, 0.06, '#f97316', [0.75, 0.35, 0.08]],
    ];
    for (const [x, y, sw, sh, c, g] of screen) {
      kit.box(c, [x, y, 0.045], [sw, sh, 0.01], [0, 0, 0], f);
      const q = (dx: number, dy: number): V3 => {
        const v = new Vector3(x + dx, y + dy, 0.056).applyMatrix4(f);
        return [v.x, v.y, v.z];
      };
      glow.quad(q(-sw / 2, -sh / 2), q(sw / 2, -sh / 2), q(sw / 2, sh / 2), q(-sw / 2, sh / 2), scale(g, 0.9));
    }
  }

  /* The main gate: two green pylons under the stadium's sign, turnstiles between them, ticket booths either side. */
  {
    const zg = d / 2 - 0.42;
    for (const s of [-1, 1]) {
      kit.box(GREEN, [s * 0.72, 0.45, zg], [0.16, 0.9, 0.16]);
      kit.box(WHITE, [s * 0.72, 0.92, zg], [0.2, 0.05, 0.2]);
      // Ticket booth
      kit.box('#fef3c7', [s * 1.08, 0.2, zg + 0.05], [0.34, 0.32, 0.26]);
      kit.box(DARK, [s * 1.08, 0.24, zg + 0.181], [0.24, 0.1, 0.01]);
      kit.box(GREEN, [s * 1.08, 0.39, zg + 0.05], [0.42, 0.05, 0.34]);
    }
    kit.box(WHITE, [0, 0.76, zg], [1.6, 0.26, 0.09]);
    kit.box(GREEN, [0, 0.9, zg], [1.62, 0.04, 0.1]);
    kit.box(GREEN, [0, 0.62, zg], [1.62, 0.04, 0.1]);
    // The name on the sign, as a row of letters either side of a football.
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) kit.box(GREEN_DEEP, [s * (0.2 + i * 0.085), 0.76, zg + 0.05], [0.05, 0.1, 0.01]);
    }
    kit.shape(WHITE, unitCyl(12, 1), [0, 0.76, zg + 0.05], [0.085, 0.02, 0.085], [Math.PI / 2, 0, 0]);
    kit.shape(DARK, unitCyl(5, 1), [0, 0.76, zg + 0.062], [0.032, 0.01, 0.032], [Math.PI / 2, 0, 0]);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) {
      kit.box(STEEL, [x, 0.12, zg], [0.06, 0.2, 0.14]);
      kit.box(STEEL, [x + 0.07, 0.17, zg], [0.12, 0.015, 0.015]);
    }
    const sign = (dx: number, dy: number): V3 => [dx, 0.76 + dy, zg + 0.058];
    glow.quad(sign(-0.8, -0.13), sign(0.8, -0.13), sign(0.8, 0.13), sign(-0.8, 0.13), [0.35, 0.38, 0.32]);

    // Flags of Nigeria along the plaza.
    const flags = low ? [-1.32, 1.32] : [-1.62, -1.32, 1.32, 1.62];
    for (const x of flags) {
      const z = zg - 0.18;
      kit.post(STEEL, [x, 0.04, z], 0.012, 1.15, 6);
      for (let b = 0; b < 3; b++) kit.box(b === 1 ? WHITE : GREEN, [x + 0.04 + b * 0.07, 1.06, z], [0.07, 0.16, 0.01]);
    }
    // A few fans on the plaza, queueing for the turnstiles.
    if (!low) {
      for (let i = 0; i < 14; i++) {
        const x = (rand() - 0.5) * 1.3, z = zg + 0.12 + rand() * (d / 2 - zg - 0.18);
        kit.box(FANS[Math.floor(rand() * FANS.length)], [x, 0.1, z], [0.05, 0.1, 0.05]);
        kit.box('#5b3a24', [x, 0.175, z], [0.035, 0.035, 0.035]);
      }
    }
  }

  /* Parking out front: buses on one side, kekes on the other. */
  if (!low) {
    const lotX0 = 1.8, lotX1 = w / 2 - 0.62;
    const lz0 = d / 2 - 0.78, lz1 = d / 2 - 0.06;
    if (lotX1 - lotX0 > 0.5) {
      for (const s of [-1, 1]) {
        kit.flat(ASPHALT, s > 0 ? lotX0 : -lotX1, lz0, s > 0 ? lotX1 : -lotX0, lz1, 0.047);
        for (let x = lotX0; x <= lotX1 + 0.01; x += 0.32) kit.flat(LINE, s * x - 0.008, lz0 + 0.05, s * x + 0.008, lz0 + 0.3, 0.05);
      }
      // A yellow danfo and the team's coach, nose to the street.
      const bus = (x: number, body: string, stripe: string) => {
        const z = (lz0 + lz1) / 2;
        kit.box(body, [x, 0.17, z], [0.26, 0.22, 0.62]);
        kit.box(DARK, [x, 0.22, z + 0.02], [0.265, 0.07, 0.5]);
        kit.box(DARK, [x, 0.21, z + 0.311], [0.22, 0.08, 0.005]);
        kit.box(stripe, [x, 0.12, z], [0.265, 0.03, 0.62]);
        kit.box(body, [x, 0.29, z], [0.25, 0.02, 0.58]);
        for (const dz of [-0.2, 0.2]) kit.box(DARK, [x, 0.05, z + dz], [0.27, 0.09, 0.09]);
      };
      if (lotX1 - lotX0 > 0.7) {
        bus(-(lotX0 + 0.2), '#facc15', '#111827');
        bus(-(lotX0 + 0.55), WHITE, GREEN);
      } else bus(-(lotX0 + 0.25), '#facc15', '#111827');
      const keke = (x: number, z: number) => {
        kit.box('#facc15', [x, 0.1, z], [0.14, 0.11, 0.26]);
        kit.box(GREEN, [x, 0.07, z], [0.145, 0.025, 0.265]);
        kit.box('#18181b', [x, 0.23, z - 0.02], [0.15, 0.02, 0.22]);
        for (const dx of [-0.065, 0.065]) kit.box('#18181b', [x + dx, 0.18, z - 0.12], [0.015, 0.1, 0.015]);
        kit.box('#18181b', [x, 0.18, z + 0.09], [0.13, 0.1, 0.01]);
        kit.box(DARK, [x, 0.035, z], [0.16, 0.07, 0.06]);
      };
      const kz = (lz0 + lz1) / 2;
      for (let i = 0; i < 3; i++) {
        const x = lotX0 + 0.16 + i * 0.32;
        if (x < lotX1 - 0.05) keke(x, kz + (i % 2 ? 0.04 : -0.02));
      }
    }
  }

  return { parts: kit.build(), glow: glow.build(), bowl: o };
}

/* ---------- The model ---------- */

export function Stadium({ w, d }: { w: number; d: number }) {
  return <KitModel build={(low) => build(w, d, low)} deps={[w, d]} />;
}
