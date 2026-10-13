// Cars parked at home. Each one is drawn side-on as a few outlines (the body below its crease, the
// body above it, the cabin) and stretched across the car's width, narrower at the roof and rounded
// at the nose and tail. Lamps, grille, glass, bumpers and wheels are laid on top, and the lot is
// merged into one mesh per finish. Cars face +z and sit on y=0.

import { useMemo } from 'react';
import { BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three';
import { CAR_BY_ID, type CarDef } from '../game/cars';
import { audio } from '../game/audio';
import { useGame } from '../game/store';

/** A point on the side view: how far forward, how high. */
type Pt = [number, number];
type V3 = [number, number, number];
/** Half the car's width at a point on the side view. */
type Width = (z: number, y: number) => number;
type Part = 'paint' | 'roof' | 'glass' | 'dark' | 'trim' | 'chrome' | 'tyre' | 'rim' | 'head' | 'tail' | 'amber' | 'plate';

interface Look {
  len: number;
  width: number;
  /** Heights: under the sills, the crease along the flank, the bottom of the windows, the roof. */
  ride: number;
  waist: number;
  belt: number;
  roof: number;
  /** Heights of the bonnet's leading edge and the boot's trailing edge. */
  nose: number;
  tail: number;
  /** How much lower the roof is at the back than the front. */
  sag: number;
  /** Where the windscreen meets the bonnet, and the rear window the boot. No deck: the cabin runs to the tail. */
  cowl: number;
  deck?: number;
  /** How far the windscreen and rear window lean in. */
  rakeF: number;
  rakeR: number;
  /** How much narrower the roof is than the shoulders, and the nose and tail than the middle. */
  tumble: number;
  tuck: number;
  wheelR: number;
  axle: number;
  /** Side windows a side. */
  panes: 2 | 3;
  grille: 'bar' | 'slats' | 'upright' | 'slit' | 'spindle';
  lamps: 'square' | 'round' | 'twin' | 'slim';
  tails: 'square' | 'tall' | 'strip';
  bumper: 'chrome' | 'trim' | 'paint';
  wheels: 'cap' | 'alloy' | 'black';
  /** Chrome handles and window sills. */
  bright?: boolean;
  /** A rubbing strip along the crease. */
  strip?: boolean;
  /** Black plastic round the arches and along the sills. */
  cladding?: boolean;
  rails?: boolean;
  /** A spare wheel on the tailgate. */
  spare?: boolean;
  /** Indicators standing on the front wings. */
  pods?: boolean;
  pipes?: 'rear' | 'side';
  mascot?: 'star' | 'lady';
}

const SALOON: Look = {
  len: 3, width: 1.36, ride: 0.2, waist: 0.58, belt: 0.75, roof: 1.17, nose: 0.69, tail: 0.72, sag: 0.01,
  cowl: 0.52, deck: -0.88, rakeF: 0.36, rakeR: 0.3, tumble: 0.1, tuck: 0.09, wheelR: 0.24, axle: 0.93,
  panes: 2, grille: 'bar', lamps: 'square', tails: 'square', bumper: 'paint', wheels: 'alloy',
};

const OFFROADER: Look = {
  len: 3.1, width: 1.46, ride: 0.3, waist: 0.76, belt: 1, roof: 1.52, nose: 0.95, tail: 1, sag: 0.02,
  cowl: 0.58, rakeF: 0.3, rakeR: 0.1, tumble: 0.07, tuck: 0.06, wheelR: 0.3, axle: 0.98,
  panes: 3, grille: 'slats', lamps: 'square', tails: 'tall', bumper: 'trim', wheels: 'alloy', cladding: true, rails: true,
};

const ESTATE: Look = {
  ...SALOON, len: 2.9, width: 1.32, axle: 0.9, cowl: 0.5, deck: undefined, rakeR: 0.12, nose: 0.68, tail: 0.75,
  panes: 3, grille: 'slit', tails: 'tall', bumper: 'trim', wheels: 'cap', strip: true, rails: true,
};

const LOOKS: Record<string, Look> = {
  // Long, low boot and chrome bumpers.
  peugeot_504: { ...SALOON, len: 3.1, axle: 0.95, cowl: 0.55, deck: -0.85, rakeF: 0.3, rakeR: 0.28, nose: 0.68, tail: 0.64, roof: 1.16, bumper: 'chrome', wheels: 'cap', bright: true, strip: true },
  golf_3: ESTATE,
  // Upright and square, with the grille standing proud.
  benz_190e: { ...SALOON, cowl: 0.5, deck: -0.86, rakeF: 0.3, rakeR: 0.27, nose: 0.71, tail: 0.73, roof: 1.16, tuck: 0.07, grille: 'upright', bumper: 'trim', bright: true, strip: true, mascot: 'star' },
  // Fast screens and a short, high boot.
  corolla: { ...SALOON, cowl: 0.6, deck: -0.9, rakeF: 0.46, rakeR: 0.4, nose: 0.66, tail: 0.76, roof: 1.15, sag: 0.03, tumble: 0.12, grille: 'slit', lamps: 'slim', tails: 'strip' },
  prado: OFFROADER,
  // A box: flat glass, round lamps, spare on the back.
  g_wagon: { ...OFFROADER, len: 3, ride: 0.34, waist: 0.8, belt: 1.04, roof: 1.62, nose: 1, tail: 1.04, sag: 0, cowl: 0.5, rakeF: 0.1, rakeR: 0.04, tumble: 0.03, tuck: 0.025, wheelR: 0.31, axle: 0.94, lamps: 'round', tails: 'square', wheels: 'black', rails: false, spare: true, pods: true, pipes: 'side' },
  lexus_lx: { ...OFFROADER, len: 3.25, width: 1.5, waist: 0.78, belt: 1.02, roof: 1.55, nose: 0.98, tail: 1.02, cowl: 0.6, rakeF: 0.32, rakeR: 0.12, wheelR: 0.31, axle: 1.02, grille: 'spindle', lamps: 'slim', tails: 'strip', bumper: 'paint', cladding: false, bright: true },
  // Sleek: the roof falls away and nothing sticks out.
  range_autobiography: { ...OFFROADER, len: 3.25, width: 1.5, ride: 0.28, belt: 0.99, roof: 1.47, nose: 0.96, tail: 0.99, sag: 0.06, cowl: 0.6, rakeF: 0.4, rakeR: 0.22, tumble: 0.09, tuck: 0.07, wheelR: 0.31, axle: 1.02, lamps: 'slim', bumper: 'paint', cladding: false, rails: false },
  bentayga: { ...OFFROADER, len: 3.2, width: 1.5, ride: 0.28, belt: 0.99, roof: 1.46, nose: 0.95, tail: 0.99, sag: 0.05, rakeF: 0.38, rakeR: 0.26, tumble: 0.09, tuck: 0.08, wheelR: 0.31, axle: 1, grille: 'bar', lamps: 'twin', tails: 'square', bumper: 'paint', cladding: false, rails: false, bright: true, pipes: 'rear' },
  // A long, high bonnet behind a chrome temple of a grille.
  cullinan: { ...OFFROADER, len: 3.35, width: 1.52, waist: 0.8, belt: 1.05, roof: 1.6, nose: 1.03, tail: 1.05, sag: 0.01, cowl: 0.52, rakeF: 0.24, rakeR: 0.08, tumble: 0.06, tuck: 0.045, wheelR: 0.32, axle: 1.05, grille: 'upright', bumper: 'paint', cladding: false, rails: false, bright: true, mascot: 'lady', pipes: 'rear' },
};

const lookOf = (car: CarDef) =>
  LOOKS[car.id] ?? (car.bodyStyle === 'suv' || car.bodyStyle === 'luxury' ? OFFROADER : car.bodyStyle === 'wagon' ? ESTATE : SALOON);

const FINISH: Record<Part, { color?: string; roughness: number; metalness: number; emissive?: string; emissiveIntensity?: number }> = {
  paint: { roughness: 0.38, metalness: 0.2 },
  roof: { roughness: 0.38, metalness: 0.2 },
  glass: { color: '#3f5871', roughness: 0.25, metalness: 0.1 },
  dark: { color: '#14171c', roughness: 0.8, metalness: 0 },
  trim: { color: '#2d333b', roughness: 0.7, metalness: 0.1 },
  chrome: { color: '#eef2f6', roughness: 0.25, metalness: 0.1 },
  tyre: { color: '#17181b', roughness: 0.9, metalness: 0 },
  rim: { color: '#cfd6de', roughness: 0.3, metalness: 0.15 },
  head: { color: '#fff7d6', roughness: 0.3, metalness: 0, emissive: '#fde68a', emissiveIntensity: 0.6 },
  tail: { color: '#dc2626', roughness: 0.4, metalness: 0, emissive: '#b91c1c', emissiveIntensity: 0.5 },
  amber: { color: '#f59e0b', roughness: 0.4, metalness: 0, emissive: '#d97706', emissiveIntensity: 0.3 },
  plate: { color: '#f8fafc', roughness: 0.6, metalness: 0 },
};

const clamp = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const area = (poly: Pt[]) => poly.reduce((sum, [z, y], i) => sum + z * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y, 0) / 2;

/** The part of a convex outline in front of `z0`, or behind it. */
function cut(poly: Pt[], z0: number, front: boolean): Pt[] {
  const out: Pt[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const ina = front ? a[0] >= z0 : a[0] <= z0;
    const inb = front ? b[0] >= z0 : b[0] <= z0;
    if (ina) out.push(a);
    if (ina !== inb) out.push([z0, lerp(a[1], b[1], (z0 - a[0]) / (b[0] - a[0]))]);
  });
  return out;
}

const ONE = new Vector3(1, 1, 1);
const v = new Vector3();

/** Gathers triangles by finish. */
class Mesher {
  readonly parts = new Map<Part, number[]>();

  /** `corner` is how far from the middle the nose and tail start to round off: flat patches never straddle it. */
  constructor(private corner: number) {}

  private into(part: Part) {
    let out = this.parts.get(part);
    if (!out) this.parts.set(part, (out = []));
    return out;
  }

  /** A flat convex patch, wound to face `facing`. */
  face(part: Part, pts: V3[], facing: V3) {
    const out = this.into(part);
    for (let i = 1; i < pts.length - 1; i++) {
      const [a, b, c] = [pts[0], pts[i], pts[i + 1]];
      const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const [wx, wy, wz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const flip = (uy * wz - uz * wy) * facing[0] + (uz * wx - ux * wz) * facing[1] + (ux * wy - uy * wx) * facing[2] < 0;
      out.push(...a, ...(flip ? c : b), ...(flip ? b : c));
    }
  }

  private solid(part: Part, geo: BufferGeometry, at: V3, rot: V3) {
    const out = this.into(part);
    const m = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rot)), ONE);
    const flat = geo.toNonIndexed();
    const pos = flat.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
    geo.dispose();
    flat.dispose();
  }

  box(part: Part, at: V3, size: V3, rot: V3 = [0, 0, 0]) {
    this.solid(part, new BoxGeometry(...size), at, rot);
  }

  /** A disc or drum lying across the car (wheels) or along it (lamps, pipes). */
  drum(part: Part, at: V3, r: number, len: number, along: 'x' | 'z', seg = 12) {
    this.solid(part, new CylinderGeometry(r, r, len, seg), at, along === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  }

  /** A flat outline, drawn looking at the nose, pushed back from `z1` to `z0`. */
  slab(part: Part, outline: Pt[], z0: number, z1: number) {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    this.face(part, outline.map(([x, y]) => [x, y, z1]), [0, 0, z1 - z0]);
    outline.forEach(([x, y], i) => {
      const [nx, ny] = outline[(i + 1) % outline.length];
      this.face(part, [[x, y, z0], [x, y, z1], [nx, ny, z1], [nx, ny, z0]], [(x + nx) / 2 - cx, (y + ny) / 2 - cy, 0]);
    });
  }

  /** The middle of an outline and its two rounded ends, as separate pieces. */
  private pieces(poly: Pt[]) {
    const c = this.corner;
    return [cut(poly, c, true), cut(cut(poly, c, false), -c, true), cut(poly, -c, false)].filter((p) => p.length > 2 && Math.abs(area(p)) > 1e-6);
  }

  /** A side-view outline given the car's width. `whole` outlines may be hollowed (wheel arches) but must stay clear of the corners. */
  loft(part: Part, outline: Pt[], width: Width, whole = false) {
    for (const piece of whole ? [outline] : this.pieces(outline)) {
      const pts = area(piece) < 0 ? [...piece].reverse() : piece;
      const tris = whole
        ? ShapeUtils.triangulateShape(pts.map(([z, y]) => new Vector2(z, y)), [])
        : pts.slice(2).map((_, i) => [0, i + 1, i + 2]);
      for (const side of [1, -1]) {
        for (const tri of tris) this.face(part, tri.map((i): V3 => [side * width(...pts[i]), pts[i][1], pts[i][0]]), [side, 0, 0]);
      }
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        // Where two pieces meet there is nothing to see.
        if (p[0] === q[0] && Math.abs(p[0]) === this.corner) return;
        const [wp, wq] = [width(...p), width(...q)];
        this.face(part, [[-wp, p[1], p[0]], [wp, p[1], p[0]], [wq, q[1], q[0]], [-wq, q[1], q[0]]], [0, p[0] - q[0], q[1] - p[1]]);
      });
    }
  }

  /** A patch on both flanks, a hair proud of the surface under it. */
  flank(part: Part, width: Width, poly: Pt[], proud = 0.006) {
    for (const piece of this.pieces(poly)) {
      for (const side of [1, -1]) this.face(part, piece.map(([z, y]): V3 => [side * (width(z, y) + proud), y, z]), [side, 0, 0]);
    }
  }
}

const rect = (z0: number, z1: number, y0: number, y1: number): Pt[] => [[z0, y0], [z1, y0], [z1, y1], [z0, y1]];

function build(k: Look): [Part, BufferGeometry][] {
  const L = k.len / 2;
  const W = k.width / 2;
  const deck = k.deck ?? -L + 0.08;
  const arch = k.wheelR + 0.055;
  // The arches stop where they meet the sills, and from there the body rounds in to the nose and tail.
  const dip = Math.asin((k.wheelR - k.ride) / arch);
  const corner = k.axle + arch * Math.cos(dip);
  const m = new Mesher(corner);

  const ends = (z: number) => k.tuck * clamp((Math.abs(z) - corner) / (L - corner));
  const body: Width = (z, y) =>
    W - ends(z) - (y < k.waist ? 0.04 * clamp((k.waist - y) / (k.waist - k.ride)) : 0.03 * clamp((y - k.waist) / (k.belt - k.waist)));
  const cabin: Width = (z, y) => W - 0.07 - ends(z) - k.tumble * clamp((y - k.belt) / (k.roof - k.belt));

  /* ---------- Shell ---------- */

  const archPts = (axle: number): Pt[] =>
    Array.from({ length: 7 }, (_, i): Pt => {
      const a = Math.PI + dip - (i * (Math.PI + 2 * dip)) / 6;
      return [axle + arch * Math.cos(a), k.wheelR + arch * Math.sin(a)];
    });
  const rearArch = archPts(-k.axle);
  const frontArch = archPts(k.axle);
  rearArch[0] = [-corner, k.ride];
  frontArch[6] = [corner, k.ride];
  m.loft('paint', [[corner, k.waist], [-corner, k.waist], ...rearArch, ...frontArch], body, true);
  const chin: Pt[] = [[corner, k.ride], [L - 0.08, k.ride], [L, k.ride + 0.08], [L, k.waist], [corner, k.waist]];
  m.loft('paint', chin, body);
  m.loft('paint', chin.map(([z, y]): Pt => [-z, y]), body);

  const bonnetLip = L - 0.07;
  const bootLip = -L + 0.07;
  m.loft('paint', [[L, k.waist], [L, k.nose - 0.05], [bonnetLip, k.nose], [k.cowl, k.belt], [deck, k.belt], [bootLip, k.tail], [-L, k.tail - 0.05], [-L, k.waist]], body);
  const bonnetY = (z: number) => lerp(k.belt, k.nose, clamp((z - k.cowl) / (bonnetLip - k.cowl)));

  const roofFront = k.cowl - k.rakeF;
  const roofBack = deck + k.rakeR;
  const roofMid = (roofFront + roofBack) / 2;
  const roofY = (z: number) => (z > roofMid ? lerp(k.roof + 0.02, k.roof, clamp((z - roofMid) / (roofFront - roofMid))) : lerp(k.roof + 0.02, k.roof - k.sag, clamp((roofMid - z) / (roofMid - roofBack))));
  m.loft('roof', [[k.cowl, k.belt], [roofFront, k.roof], [roofMid, k.roof + 0.02], [roofBack, k.roof - k.sag], [deck, k.belt]], cabin);

  // What you see through the arches and under the sills.
  m.box('dark', [0, (k.ride + k.waist) / 2, 0], [2 * (W - 0.075), k.waist - k.ride - 0.03, 2 * corner]);

  /* ---------- Glass ---------- */

  const screen = (z0: number, z1: number, y1: number, dir: number) => {
    const [dz, dy] = [z1 - z0, y1 - k.belt];
    const out: V3 = [0, Math.abs(dz) / Math.hypot(dz, dy), (dir * dy) / Math.hypot(dz, dy)];
    const at = (t: number, side: number): V3 => {
      const [z, y] = [z0 + dz * t, k.belt + dy * t];
      return [side * (cabin(z, y) - 0.05), y + out[1] * 0.008, z + out[2] * 0.008];
    };
    m.face('glass', [at(0.1, -1), at(0.1, 1), at(0.9, 1), at(0.9, -1)], out);
  };
  screen(k.cowl, roofFront, k.roof, 1);
  screen(deck, roofBack, k.roof - k.sag, -1);

  const sill = k.belt + 0.035;
  const head = (z: number) => roofY(z) - 0.085;
  const frontEdge = (y: number) => lerp(k.cowl, roofFront, (y - k.belt) / (k.roof - k.belt)) - 0.06;
  const backEdge = (y: number) => lerp(deck, roofBack, (y - k.belt) / (k.roof - k.sag - k.belt)) + (k.panes === 2 ? 0.12 : 0.09);
  const pillarB = k.panes === 2 ? (k.cowl + deck) / 2 : lerp(k.cowl, deck, 0.38);
  const pillarC = k.panes === 2 ? deck + 0.12 : lerp(k.cowl, deck, 0.72);
  const frontHead = k.roof - 0.065;
  const backHead = k.roof - k.sag - 0.065;
  m.flank('glass', cabin, [[pillarB + 0.03, sill], [frontEdge(sill), sill], [frontEdge(frontHead), frontHead], [pillarB + 0.03, head(pillarB + 0.03)]], 0.008);
  if (k.panes === 3) {
    m.flank('glass', cabin, [[pillarC + 0.03, sill], [pillarB - 0.03, sill], [pillarB - 0.03, head(pillarB - 0.03)], [pillarC + 0.03, head(pillarC + 0.03)]], 0.008);
  }
  const last = (k.panes === 3 ? pillarC : pillarB) - 0.03;
  m.flank('glass', cabin, [[backEdge(sill), sill], [last, sill], [last, head(last)], [backEdge(backHead), backHead]], 0.008);

  /* ---------- Flanks ---------- */

  // Door shuts, stopping short of the arches.
  const archTop = (z: number) => {
    const d = Math.min(Math.abs(z - k.axle), Math.abs(z + k.axle));
    return d < arch ? k.wheelR + Math.sqrt(arch * arch - d * d) + 0.02 : k.ride + 0.03;
  };
  for (const z of [Math.min(k.cowl, k.axle - arch - 0.03), pillarB, pillarC]) {
    m.flank('dark', body, rect(z - 0.007, z + 0.007, k.waist, k.belt - 0.004), 0.004);
    if (archTop(z) < k.waist - 0.02) m.flank('dark', body, rect(z - 0.007, z + 0.007, archTop(z), k.waist), 0.004);
  }
  const bright: Part = k.bright ? 'chrome' : 'dark';
  for (const side of [1, -1]) {
    for (const z of [pillarB + 0.1, pillarC + 0.1]) m.box(bright, [side * (body(z, k.belt - 0.07) + 0.006), k.belt - 0.07, z], [0.022, 0.028, 0.11]);
  }
  if (k.bright) m.flank('chrome', body, rect(Math.max(deck, -corner) + 0.04, k.cowl, k.belt - 0.024, k.belt - 0.004), 0.005);
  const between: [number, number] = [-k.axle + arch + 0.03, k.axle - arch - 0.03];
  if (k.strip) m.flank('trim', body, rect(...between, k.waist - 0.022, k.waist + 0.022), 0.008);
  if (k.cladding) {
    m.flank('trim', body, rect(between[0] - 0.03, between[1] + 0.03, k.ride, k.ride + 0.1));
    for (const pts of [rearArch, frontArch]) {
      const axle = pts === rearArch ? -k.axle : k.axle;
      const flare = pts.map(([z, y]): Pt => [axle + ((z - axle) * (arch + 0.055)) / arch, k.wheelR + ((y - k.wheelR) * (arch + 0.055)) / arch]);
      for (let i = 0; i < 6; i++) m.flank('trim', body, [pts[i], pts[i + 1], flare[i + 1], flare[i]]);
    }
  }

  // Door mirrors.
  const mirrorZ = k.cowl - 0.1 - k.rakeF * 0.15;
  for (const side of [1, -1]) m.box('paint', [side * (cabin(mirrorZ, k.belt) + 0.07), k.belt + 0.06, mirrorZ], [0.14, 0.07, 0.06]);

  if (k.rails) {
    const [z0, z1] = [lerp(roofBack, roofFront, 0.08), lerp(roofBack, roofFront, 0.88)];
    for (const side of [1, -1]) {
      const x = side * (cabin(0, k.roof) - 0.09);
      m.box('trim', [x, k.roof + 0.045, (z0 + z1) / 2], [0.035, 0.03, z1 - z0]);
      for (const z of [z0, (z0 + z1) / 2, z1]) m.box('trim', [x, k.roof + 0.015, z], [0.035, 0.05, 0.06]);
    }
  }

  /* ---------- Nose ---------- */

  const half = W - k.tuck;
  const bumperY = k.ride + 0.15;
  const [bandLow, bandHigh] = [k.ride + 0.27, k.nose - 0.07];
  const [bandY, bandH] = [(bandLow + bandHigh) / 2, bandHigh - bandLow];
  // How far each kind of bumper stands out, for the plates.
  const stand = { chrome: 0.065, trim: 0.055, paint: 0.04 }[k.bumper];
  for (const end of [1, -1]) {
    if (k.bumper === 'chrome') m.box('chrome', [0, bumperY, end * (L + 0.02)], [2 * half + 0.06, 0.08, 0.09]);
    if (k.bumper === 'trim') m.box('trim', [0, bumperY, end * (L + 0.015)], [2 * half + 0.04, 0.13, 0.08]);
    if (k.bumper === 'paint') m.box('paint', [0, bumperY, end * (L + 0.01)], [2 * half + 0.02, 0.14, 0.06]);
  }
  if (k.bumper === 'paint') {
    if (k.grille !== 'spindle') m.box('dark', [0, bumperY - 0.01, L + 0.035], [half * 1.1, 0.07, 0.02]);
    m.box('dark', [0, k.ride + 0.07, -L - 0.01], [half * 1.3, 0.06, 0.05]);
  }

  // Lamps sit at the corners; `inner` is where the grille can start.
  let inner = half - 0.34;
  if (k.lamps === 'square') {
    const h = Math.min(0.13, bandH * 0.8);
    for (const side of [1, -1]) {
      m.box('head', [side * (half - 0.2), bandHigh - h / 2, L + 0.005], [0.22, h, 0.03]);
      m.box('amber', [side * (half - 0.055), bandHigh - h / 2, L + 0.005], [0.05, h, 0.03]);
    }
  } else if (k.lamps === 'slim') {
    for (const side of [1, -1]) m.box('head', [side * (half - 0.18), bandHigh - 0.03, L + 0.005], [0.3, 0.055, 0.03]);
    inner = half - 0.37;
  } else {
    const spots: [number, number][] = k.lamps === 'twin' ? [[half - 0.11, 0.07], [half - 0.26, 0.055]] : [[half - 0.13, 0.085]];
    for (const side of [1, -1]) {
      for (const [x, r] of spots) {
        m.drum('chrome', [side * x, bandHigh - 0.08, L + 0.005], r, 0.03, 'z');
        m.drum('head', [side * x, bandHigh - 0.08, L + 0.01], r * 0.78, 0.035, 'z');
      }
    }
    inner = k.lamps === 'twin' ? half - 0.36 : half - 0.26;
  }

  if (k.grille === 'bar') {
    m.box('chrome', [0, bandY, L + 0.004], [2 * inner, bandH * 0.92, 0.03]);
    m.box('dark', [0, bandY, L + 0.012], [2 * inner - 0.04, bandH * 0.92 - 0.04, 0.03]);
    m.box('chrome', [0, bandY, L + 0.02], [2 * inner - 0.04, 0.018, 0.03]);
  } else if (k.grille === 'slats') {
    m.box('dark', [0, bandY, L + 0.005], [2 * inner, bandH, 0.03]);
    for (const t of [0.2, 0.5, 0.8]) m.box('chrome', [0, lerp(bandLow, bandHigh, t), L + 0.012], [2 * inner, bandH * 0.12, 0.035]);
  } else if (k.grille === 'upright') {
    const w = Math.min(inner, k.mascot === 'lady' ? 0.3 : 0.22);
    const [y0, y1] = [bandLow - 0.05, k.nose + 0.01];
    m.box('chrome', [0, (y0 + y1) / 2, L + 0.02], [2 * w, y1 - y0, 0.07]);
    m.box('dark', [0, (y0 + y1) / 2 - 0.005, L + 0.028], [2 * w - 0.05, y1 - y0 - 0.05, 0.07]);
    for (const t of [-0.5, 0, 0.5]) m.box('chrome', [t * (w - 0.025), (y0 + y1) / 2 - 0.005, L + 0.034], [0.016, y1 - y0 - 0.05, 0.07]);
  } else if (k.grille === 'slit') {
    m.box('dark', [0, bandHigh - 0.03, L + 0.005], [2 * inner, 0.05, 0.03]);
  } else {
    // An hourglass from bonnet to chin.
    const [top, pinch, low] = [bandHigh + 0.02, bandLow + 0.02, k.ride + 0.07];
    m.slab('dark', [[-inner, top], [inner, top], [inner * 0.7, pinch], [-inner * 0.7, pinch]], L, L + 0.05);
    m.slab('dark', [[-inner * 0.7, pinch], [inner * 0.7, pinch], [inner * 1.05, low], [-inner * 1.05, low]], L, L + 0.05);
    for (const t of [0.25, 0.65]) m.box('chrome', [0, lerp(pinch, top, t), L + 0.05], [inner * lerp(1.4, 2, t) - 0.05, 0.028, 0.014]);
    for (const t of [0.25, 0.65]) m.box('chrome', [0, lerp(pinch, low, t), L + 0.05], [inner * lerp(1.4, 2.1, t) - 0.05, 0.028, 0.014]);
  }

  if (k.mascot === 'star') {
    m.box('chrome', [0, k.nose + 0.03, L - 0.03], [0.01, 0.04, 0.01]);
    m.drum('chrome', [0, k.nose + 0.07, L - 0.03], 0.032, 0.01, 'z', 8);
  }
  if (k.mascot === 'lady') m.box('chrome', [0, k.nose + 0.05, L - 0.01], [0.025, 0.08, 0.035], [0.3, 0, 0]);
  if (k.pods) for (const side of [1, -1]) m.box('amber', [side * (W - 0.16), bonnetY(L - 0.3) + 0.02, L - 0.3], [0.08, 0.045, 0.12]);

  /* ---------- Tail ---------- */

  const lampY = k.deck === undefined ? k.belt - 0.1 : k.tail - 0.13;
  if (k.tails === 'square') {
    for (const side of [1, -1]) m.box('tail', [side * (half - 0.14), lampY, -L - 0.005], [0.22, 0.11, 0.03]);
  } else if (k.tails === 'tall') {
    const h = Math.min(0.26, k.belt - k.waist);
    for (const side of [1, -1]) m.box('tail', [side * (half - 0.065), k.belt - 0.03 - h / 2, -L - 0.005], [0.09, h, 0.03]);
  } else {
    m.box('tail', [0, lampY + 0.02, -L - 0.005], [2 * half - 0.06, 0.045, 0.03]);
    for (const side of [1, -1]) m.box('tail', [side * (half - 0.11), lampY - 0.01, -L - 0.005], [0.16, 0.1, 0.03]);
  }
  if (k.spare) {
    m.drum('tyre', [0, k.belt - 0.04, -L - 0.075], 0.27, 0.13, 'z', 14);
    m.drum('chrome', [0, k.belt - 0.04, -L - 0.08], 0.2, 0.14, 'z', 14);
    m.drum('paint', [0, k.belt - 0.04, -L - 0.085], 0.15, 0.14, 'z', 14);
  }
  if (k.pipes === 'rear') for (const side of [1, -1]) m.drum('chrome', [side * half * 0.62, k.ride + 0.07, -L - 0.02], 0.04, 0.08, 'z', 8);
  if (k.pipes === 'side') for (const side of [1, -1]) m.drum('chrome', [side * (W - 0.06), k.ride - 0.01, -0.3], 0.035, 0.16, 'x', 8);

  // Number plates: on the bumper in front, above it behind.
  m.box('plate', [0, bumperY, L + stand + 0.004], [0.32, 0.1, 0.012]);
  m.box('dark', [0, bumperY, L + stand + 0.006], [0.2, 0.03, 0.012]);
  m.box('plate', [0, bumperY + 0.15, -L - 0.008], [0.32, 0.1, 0.02]);
  m.box('dark', [0, bumperY + 0.15, -L - 0.01], [0.2, 0.03, 0.02]);

  /* ---------- Wheels ---------- */

  const r = k.wheelR;
  for (const x of [W - 0.105, -W + 0.105]) {
    for (const z of [k.axle, -k.axle]) {
      m.drum('tyre', [x, r, z], r, 0.17, 'x', 14);
      if (k.wheels === 'cap') {
        m.drum('trim', [x, r, z], r * 0.7, 0.182, 'x');
        m.drum('chrome', [x, r, z], r * 0.5, 0.2, 'x');
        m.drum('trim', [x, r, z], r * 0.15, 0.21, 'x', 8);
      } else {
        m.drum(k.wheels === 'black' ? 'chrome' : 'rim', [x, r, z], r * 0.72, 0.182, 'x');
        m.drum('dark', [x, r, z], r * 0.6, 0.19, 'x');
        for (const turn of [0, 1, 2]) m.box(k.wheels === 'black' ? 'trim' : 'rim', [x, r, z], [0.2, r * 1.16, r * 0.16], [(turn * Math.PI) / 3, 0, 0]);
        m.drum('chrome', [x, r, z], r * 0.18, 0.21, 'x', 8);
      }
    }
  }

  return [...m.parts].map(([part, positions]) => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return [part, geo];
  });
}

export function CarModel({ carId, position = [3.2, 0, 11.2], rotation = [0, Math.PI / 2, 0] }: { carId: string; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const car: CarDef = CAR_BY_ID[carId] ?? CAR_BY_ID['peugeot_504'];
  const toast = useGame((s) => s.toast);
  const look = lookOf(car);
  const parts = useMemo(() => build(look), [look]);

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    audio.honk();
    toast(`📯 Beep beep! That's your ${car.name}. Open KD Autos to cruise.`);
  };

  return (
    <group position={position} rotation={rotation} onClick={handleClick}>
      {/* Subtle contact shadow */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[look.width - 0.1, look.len - 0.1]} />
        <meshBasicMaterial color="#000" transparent opacity={0.3} />
      </mesh>
      {parts.map(([part, geometry]) => (
        <mesh key={part} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial {...FINISH[part]} color={part === 'paint' ? car.color : part === 'roof' ? car.roofColor ?? car.color : FINISH[part].color} />
        </mesh>
      ))}
    </group>
  );
}
