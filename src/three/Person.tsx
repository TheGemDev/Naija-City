// Our own low-poly person: a male or female body built from simple shapes, wearing whatever the
// `look` string says (game/wardrobe.ts). Joints are plain groups animated in code, so there is no
// model file to load and every garment can be swapped instantly.

import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { CanvasTexture, CapsuleGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, LatheGeometry, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, SphereGeometry, TubeGeometry, Vector2, Vector3, type BufferGeometry, type Group, type Mesh } from 'three';
import { decodeLook, GARMENT_BY_ID, HAIR_COLORS, isFullOutfit, SKINS, type Appearance, type Body, type Garment, type Pattern } from '../game/wardrobe';
import type { ActivityAnimation } from '../game/catalog';

export type Clip = 'idle' | 'walk' | 'sit' | 'lie' | 'ride' | 'clap' | 'wave' | 'stir' | 'type' | 'talk' | ActivityAnimation;

// Heights are from the floor; the whole person is about 1.75 tall.
const HIP_Y = 0.9;
const THIGH = 0.43;
const SHIN = 0.4;
const UPPER_ARM = 0.29;
const FOREARM = 0.25;
/** Torso height above the hips, where the neck starts. */
const NECK_Y = 0.55;
const HEAD_Y = 0.71;
/** The head turns about the top of the neck, not about its own middle. */
const NECK_PIVOT = 0.6;

/** Seated (thighs level, shins down), the soles are this far above the body's own origin. */
const SEATED_SOLE = HIP_Y - SHIN - 0.08;
/**
 * How far to lower a seated Person whose group stands at a seat's surface, `seatY` above the floor, so they rest
 * on it rather than hover over it. On a seat too low for their shins they stop when their feet reach the floor.
 */
export const seatDrop = (seatY: number) => Math.min(HIP_Y - 0.08, Math.max(0, seatY) + SEATED_SOLE);

/* ---------- Shared geometry and materials ---------- */

const materials = new Map<string, MeshStandardMaterial>();
function mat(color: string, rough = 0.78, metal = 0, double = false, pat?: Pat) {
  const k = `${color}|${rough}|${metal}|${double}|${pat ? pat.join(':') : ''}`;
  let m = materials.get(k);
  if (!m) {
    const options = { color: pat ? '#ffffff' : color, roughness: rough, metalness: metal, ...(double ? { side: DoubleSide } : {}), ...(pat ? { map: patternTexture(pat[0], color, pat[1]) } : {}) };
    materials.set(k, (m = new MeshStandardMaterial(options)));
  }
  return m;
}

/** Fabric prints are tiny canvas textures (cached), drawn in the garment's colour + accent. */
const textures = new Map<string, CanvasTexture>();
function patternTexture(pattern: Pattern, base: string, accent: string) {
  const k = `${pattern}|${base}|${accent}`;
  let t = textures.get(k);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = accent;
  const rnd = (() => { let n = 7; return () => ((n = (n * 16807) % 2147483647) / 2147483647); })();
  switch (pattern) {
    case 'stripes':
      for (let i = 0; i < 64; i += 16) x.fillRect(0, i, 64, 6);
      break;
    case 'pinstripe':
      for (let i = 4; i < 64; i += 10) x.fillRect(i, 0, 2, 64);
      break;
    case 'checks':
      x.globalAlpha = 0.55;
      for (let i = 0; i < 64; i += 32) { x.fillRect(i, 0, 12, 64); x.fillRect(0, i, 64, 12); }
      x.globalAlpha = 1;
      break;
    case 'dots':
      for (let i = 8; i < 64; i += 24) for (let j = 8; j < 64; j += 24) { x.beginPath(); x.arc(i, j, 5, 0, 7); x.fill(); }
      break;
    case 'camo':
      for (let i = 0; i < 14; i++) { x.globalAlpha = 0.8; x.beginPath(); x.ellipse(rnd() * 64, rnd() * 64, 6 + rnd() * 10, 4 + rnd() * 7, rnd() * 3, 0, 7); x.fill(); }
      x.globalAlpha = 1;
      break;
    case 'tiedye':
      for (let i = 1; i < 6; i++) { x.globalAlpha = 0.5; x.beginPath(); x.arc(32, 32, i * 6, 0, 7); x.lineWidth = 3; x.strokeStyle = accent; x.stroke(); }
      x.globalAlpha = 1;
      break;
    case 'kente':
      for (let i = 0; i < 64; i += 16) { x.fillStyle = accent; x.fillRect(i, 0, 6, 64); x.fillStyle = '#facc15'; x.fillRect(0, i + 8, 64, 4); }
      break;
    case 'ankara':
      x.fillStyle = accent;
      for (let i = 16; i < 80; i += 32) for (let j = 16; j < 80; j += 32) { x.beginPath(); x.arc(i - 8, j - 8, 9, 0, 7); x.fill(); }
      x.fillStyle = '#facc15';
      for (let i = 16; i < 80; i += 32) for (let j = 16; j < 80; j += 32) { x.beginPath(); x.arc(i - 8, j - 8, 3.5, 0, 7); x.fill(); x.fillRect(i, j, 8, 8); }
      break;
  }
  t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = SRGBColorSpace;
  textures.set(k, t);
  return t;
}
type Pat = readonly [Pattern, string] | undefined;
const patOf = (g?: Garment): Pat => (g?.pattern ? [g.pattern, g.accent ?? '#ffffff'] : undefined);

const geoms = new Map<string, BufferGeometry>();
function geo(key: string, make: () => BufferGeometry) {
  let g = geoms.get(key);
  if (!g) geoms.set(key, (g = make()));
  return g;
}
const capsule = (r: number, len: number) => geo(`cap:${r}:${len}`, () => new CapsuleGeometry(r, len, 4, 10));
/** A limb: rounded at both ends, thicker at the top. `len` is the straight part between the ends. */
const taper = (rTop: number, rBot: number, len: number) =>
  geo(`taper:${rTop}:${rBot}:${len}`, () => {
    const pts: Vector2[] = [];
    for (let i = 0; i <= 4; i++) {
      const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
      pts.push(new Vector2(Math.max(0.0001, rBot * Math.cos(a)), -len / 2 + rBot * Math.sin(a)));
    }
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      pts.push(new Vector2(Math.max(0.0001, rTop * Math.cos(a)), len / 2 + rTop * Math.sin(a)));
    }
    return new LatheGeometry(pts, 12);
  });
const sphere = (r: number) => geo(`sph:${r}`, () => new SphereGeometry(r, 14, 10));
/** Lathe outlines are written top-down or bottom-up; faces only point outwards when they go bottom-up. */
const lathe = (key: string, pts: [number, number][], seg = 14) =>
  geo(`lathe:${key}`, () => {
    const up = pts[0][1] <= pts[pts.length - 1][1] ? pts : [...pts].reverse();
    return new LatheGeometry(up.map(([r, y]) => new Vector2(r, y)), seg);
  });

// Torso outlines as (radius, height) from the hips up; flattened front-to-back when drawn.
const TORSO: Record<Body, [number, number][]> = {
  m: [[0, -0.04], [0.15, -0.035], [0.16, 0.04], [0.148, 0.17], [0.162, 0.3], [0.182, 0.4], [0.19, 0.45], [0.165, 0.5], [0.09, 0.545], [0, 0.55]],
  f: [[0, -0.04], [0.165, -0.035], [0.172, 0.04], [0.124, 0.19], [0.142, 0.29], [0.152, 0.36], [0.148, 0.43], [0.152, 0.46], [0.12, 0.51], [0.07, 0.54], [0, 0.545]],
};
const TORSO_DEPTH = 0.66;
/** A strip of the torso's own surface down the front, beside one arm (s = -1 left, 1 right), a hair proud of it. */
const sidePanel = (body: Body, s: number) =>
  geo(`side:${body}:${s}`, () => {
    const pts = TORSO[body].filter(([, y]) => y >= 0.04 && y <= 0.46).map(([r, y]) => new Vector2(r + 0.004, y));
    return new LatheGeometry(pts, 2, s * 0.74 - 0.08, 0.16);
  });

/** A slightly darker shade, for lips and shadows. */
const shade = (c: string, k: number) => '#' + new Color(c).multiplyScalar(k).getHexString();

/** Shorthand for a shadow-casting mesh. */
function M({ children, color, rough, metal, double, pat, ...rest }: { children?: ReactNode; color: string; rough?: number; metal?: number; double?: boolean; pat?: Pat } & ThreeElements['mesh']) {
  return (
    <mesh castShadow material={mat(color, rough, metal, double, pat)} {...rest}>
      {children}
    </mesh>
  );
}

/** Parts smaller than this (eyes, buttons, earrings) don't cast a shadow you could see, but each
 *  one would still cost a draw call in the shadow pass. */
const TINY = 0.05;

const SHORT_SLEEVES = new Set(['tee', 'polo', 'jersey', 'blouse', 'dress', 'senator']);
const LONG_BOTTOMS = new Set(['trousers', 'jeans', 'cargo', 'joggers']);
const SKIRTS = new Set(['skirt', 'pleated']);
/** Bags carried in the hand; the rest are worn on the body. */
const HAND_BAGS = new Set(['handbag', 'clutch', 'satchel', 'tote']);
/** Brass for clasps and buckles. */
const BUCKLE = '#d4af37';
/** What hangs below the hips: how far down it reaches, how wide it is there, and whether it is short enough to swing up with the thighs. */
const HEMS: Record<string, readonly [number, number, boolean]> = {
  senator: [0.3, 0.19, true],
  kaftan: [0.42, 0.2, true],
  dress: [0.45, 0.25, false],
  abaya: [0.84, 0.24, false],
  pleated: [0.28, 0.27, true],
  skirt: [0.34, 0.23, true],
  wrapper: [0.84, 0.2, false],
};

/* ---------- Animation ---------- */

// A pose is every joint angle as a plain number, so two poses can be cross-faded channel by channel.
// Limbs read the same on both sides: Fwd swings forward, Out lifts away from the body, Twist turns the
// limb outward about its own length. Elbows and knees only bend one way; a foot tips its toes down.
const CHANNELS = [
  'rootX', 'rootY', 'rootZ', 'hipsX', 'hipsY', 'hipsZ', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'headZ', 'breath',
  'armLFwd', 'armLOut', 'armLTwist', 'elbowL', 'armRFwd', 'armROut', 'armRTwist', 'elbowR',
  'legLFwd', 'legLOut', 'legLTwist', 'kneeL', 'footL', 'legRFwd', 'legROut', 'legRTwist', 'kneeR', 'footR',
] as const;
type Pose = Record<(typeof CHANNELS)[number], number>;
const newPose = () => Object.fromEntries(CHANNELS.map((c) => [c, 0])) as Pose;

type Rig = Record<'root' | 'hips' | 'skirt' | 'torso' | 'head' | 'armL' | 'armR' | 'elbowL' | 'elbowR' | 'legL' | 'legR' | 'kneeL' | 'kneeR' | 'footL' | 'footR', React.RefObject<Group>>;

/** Seconds to melt from one clip into the next. */
const FADE = 0.3;
const SHOULDER_Y = 0.45;
/** Shoulder to elbow, elbow to the middle of the hand, hip to ankle. */
const ARM_U = UPPER_ARM - 0.03;
const ARM_F = FOREARM + 0.015;
const LEG = THIGH + SHIN;

/** The pose being composed this frame; clips write straight into it. */
const P = newPose();
/** Whoever is being posed: half their shoulder width (so hands meet in the middle on anyone) and how far their clothes let them step. */
let SH = 0.2;
let STRIDE = 1;
/** Set once a clip has placed the feet itself. */
let planted = false;

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** How far the pelvis has to sink for both knees to bend this much (a few millimetres already shows). */
const dip = (knee: number) => -((THIGH * SHIN) / (2 * LEG)) * knee * knee;
/** 0 → 1 → 0 across part of a repeating cycle: up over `rise`, held until `fall`, down over `rise` again. */
const pulse = (u: number, rise: number, fall: number) => smooth(u / rise) * (1 - smooth((u - fall) / rise));

function armL(fwd: number, out: number, twist: number, elbow: number) {
  P.armLFwd = fwd; P.armLOut = out; P.armLTwist = twist; P.elbowL = elbow;
}
function armR(fwd: number, out: number, twist: number, elbow: number) {
  P.armRFwd = fwd; P.armROut = out; P.armRTwist = twist; P.elbowR = elbow;
}

/**
 * Puts a hand at a point in front of the body and works out the arm that gets it there: `x` out from
 * the middle towards that hand's side, `y` above the hips, `z` forward. `flare` swings the elbow out.
 */
function hand(side: -1 | 1, x: number, y: number, z: number, flare = 0.35) {
  // Solved for the +x arm; the channels read the same on both sides.
  let tx = x - SH;
  let ty = y - SHOULDER_Y;
  let tz = z;
  const len = Math.hypot(tx, ty, tz) || 1e-4;
  const d = Math.min(ARM_U + ARM_F - 0.004, Math.max(0.1, len));
  tx /= len; ty /= len; tz /= len;
  const elbow = Math.PI - Math.acos((ARM_U * ARM_U + ARM_F * ARM_F - d * d) / (2 * ARM_U * ARM_F));
  // With the upper arm hanging and the elbow bent this much, the hand sits `b` forward of straight down.
  const b = Math.atan2(ARM_F * Math.sin(elbow), ARM_U + ARM_F * Math.cos(elbow));
  const sy = -Math.cos(b);
  const sz = Math.sin(b);
  // The shortest turn from there to the target…
  const ax = sy * tz - sz * ty, ay = sz * tx, az = -sy * tx, aw = 1 + sy * ty + sz * tz;
  // …then a roll about the shoulder-to-hand line, which is what places the elbow.
  const fs = Math.sin(flare / 2), fw = Math.cos(flare / 2);
  const bx = tx * fs, by = ty * fs, bz = tz * fs;
  let qx = fw * ax + bx * aw + by * az - bz * ay;
  let qy = fw * ay - bx * az + by * aw + bz * ax;
  let qz = fw * az + bx * ay - by * ax + bz * aw;
  let qw = fw * aw - bx * ax - by * ay - bz * az;
  const n = (Math.hypot(qx, qy, qz, qw) || 1) * (qw < 0 ? -1 : 1);
  qx /= n; qy /= n; qz /= n; qw /= n;
  // Split that into a swing and a twist about the arm's own length, which is what the channels hold.
  const tn = Math.hypot(qy, qw) || 1;
  const twy = qy / tn, tww = qw / tn;
  const sx = qx * tww + qz * twy, szz = qz * tww - qx * twy;
  const sn = Math.hypot(sx, szz);
  const k = sn > 1e-6 ? (2 * Math.atan2(sn, tn)) / sn : 2;
  (side < 0 ? armL : armR)(-sx * k, szz * k, 2 * Math.atan2(twy, tww), elbow);
}

/**
 * Plants a foot `z` ahead of its hip, `up` off the floor and `x` out to its own side, wherever the pelvis
 * has moved to, and bends the leg to fit. `pitch` tips the toes down (heel off the floor).
 */
function foot(side: -1 | 1, z = 0, up = 0, pitch = 0, x = 0) {
  planted = true;
  const down = LEG + P.rootY - up;
  const fz = z - P.rootZ;
  const d = Math.min(LEG - 0.0005, Math.max(0.25, Math.hypot(fz, down)));
  const knee = Math.PI - Math.acos((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN));
  const fwd = Math.atan2(fz, down) + Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
  const out = Math.asin(Math.max(-0.6, Math.min(0.6, (x - side * P.rootX) / LEG)));
  if (side < 0) { P.legLFwd = fwd; P.legLOut = out; P.kneeL = knee; P.footL = pitch + fwd - knee; }
  else { P.legRFwd = fwd; P.legROut = out; P.kneeR = knee; P.footR = pitch + fwd - knee; }
}

/** Standing at ease: where every clip starts from. */
function rest() {
  for (const c of CHANNELS) P[c] = 0;
  armL(0.03, 0.09, -0.15, 0.2);
  armR(0.03, 0.09, -0.15, 0.2);
  P.legLTwist = P.legRTwist = 0.1;
  planted = false;
}

/** Thighs level, shins down, feet flat: the lower half of anything done sitting. */
function sitLegs() {
  P.rootX = P.rootY = P.rootZ = 0;
  P.hipsY = P.hipsZ = 0;
  P.legLFwd = P.legRFwd = Math.PI / 2;
  P.kneeL = P.kneeR = Math.PI / 2;
  P.legLOut = P.legROut = 0.07;
  P.footL = P.footR = 0;
}

/** Breathing, and the slow shift of weight from one leg to the other that anyone standing about does. */
function atEase(t: number, amount = 1) {
  // Holds on one leg, then eases across to the other.
  const w = Math.tanh(2.2 * Math.sin(t * 0.42)) * amount;
  const br = Math.sin(t * 1.7);
  P.rootX += w * 0.022;
  P.rootY -= Math.abs(w) * 0.001;
  P.hipsZ += w * 0.04;
  P.hipsY += w * 0.03;
  P.torsoZ -= w * 0.055;
  P.headZ += w * 0.02;
  P.breath = br * 0.012;
  P.torsoX += br * 0.006;
  // The idle leg relaxes: knee soft, heel a touch off the floor.
  foot(-1, 0.02 * Math.max(0, w), 0.014 * Math.max(0, w), 0.1 * Math.max(0, w));
  foot(1, 0.02 * Math.max(0, -w), 0.014 * Math.max(0, -w), 0.1 * Math.max(0, -w));
  return w;
}

/** How long a foot stays down in each stride, as a share of the stride. */
const STANCE = 0.56;

/** One foot through a stride (`u` from 0 at heel strike round to 1): rolls from heel to toe on the floor, then swings through. */
function stepFoot(side: -1 | 1, u: number, reach: number) {
  if (u < STANCE) {
    const s = u / STANCE;
    const land = 1 - smooth(s / 0.16);
    const push = smooth((s - 0.68) / 0.32);
    foot(side, reach * (1 - 2 * s), 0.01 * land + 0.06 * push, -0.28 * land + 0.55 * push);
  } else {
    const s = (u - STANCE) / (1 - STANCE);
    foot(side, reach * (2 * smooth(s) - 1), mix(0.06, 0.01, s) + 0.07 * Math.sin(Math.PI * s), mix(0.55, -0.28, smooth(s)));
  }
}

function walk(t: number) {
  // Long robes and wrappers shorten the step and quicken it.
  const u = (t * 1.5) / (0.55 + 0.45 * STRIDE);
  const a = u * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  const reach = 0.3 * STRIDE;
  // The pelvis sinks as each heel lands and rides up over the standing leg, swaying towards it.
  P.rootY = -0.005 - 0.0215 * STRIDE * STRIDE * (1 + Math.cos(2 * a));
  P.rootX = -s * 0.018;
  stepFoot(-1, u % 1, reach);
  stepFoot(1, (u + 0.5) % 1, reach);
  // Hips turn with the leading leg and dip on the swinging side; the shoulders answer the other way.
  P.hipsY = c * 0.13 * STRIDE;
  P.hipsZ = -s * 0.045;
  P.torsoX = 0.08;
  P.torsoY = -c * 0.24 * STRIDE;
  P.torsoZ = s * 0.06;
  P.headY = c * 0.09 * STRIDE;
  P.headZ = -s * 0.012;
  P.headX = -0.03;
  // Arms swing against the legs, a beat late, bending more at the front of the swing.
  const sw = Math.cos(a - 0.35) * (0.3 + 0.2 * STRIDE);
  armL(-sw, 0.1, -0.2, 0.3 + 0.35 * Math.max(0, -sw));
  armR(sw, 0.1, -0.2, 0.3 + 0.35 * Math.max(0, sw));
}

function idle(t: number) {
  atEase(t);
  const br = Math.sin(t * 1.7);
  P.headY = Math.sin(t * 0.37) * 0.22 + Math.sin(t * 0.83 + 1.3) * 0.07;
  P.headX = Math.sin(t * 0.53 + 2) * 0.04;
  P.armLFwd += br * 0.012;
  P.armRFwd -= br * 0.012;
  P.armLOut += br * 0.008;
  P.armROut += br * 0.008;
}

function sit(t: number) {
  const br = Math.sin(t * 1.6);
  P.breath = br * 0.012;
  P.torsoX = 0.03 + br * 0.006;
  P.headY = Math.sin(t * 0.33) * 0.2 + Math.sin(t * 0.71 + 1) * 0.06;
  P.headX = 0.03;
  // Hands resting on the thighs.
  hand(-1, 0.1, 0.13, 0.3, 0.5);
  hand(1, 0.1, 0.13, 0.3, 0.5);
}

/** Flat on the back (whoever draws the body lays it down). */
function lie(t: number) {
  P.breath = Math.sin(t * 1.2) * 0.016;
  P.headY = 0.1;
  armL(0, 0.2, 0.25, 0.18);
  armR(0, 0.2, 0.25, 0.18);
  P.legLOut = P.legROut = 0.07;
  P.legLTwist = P.legRTwist = 0.25;
  P.kneeL = P.kneeR = 0.06;
  P.footL = P.footR = 0.35;
  planted = true;
}

/** Astride a motorbike or a horse, hands forward on the bars or the reins. */
function ride(t: number) {
  P.torsoX = 0.16;
  P.headX = -0.12;
  P.headY = Math.sin(t * 0.5) * 0.08;
  hand(-1, 0.2, 0.2, 0.36, 0.3);
  hand(1, 0.2, 0.2, 0.36, 0.3);
  P.legLFwd = P.legRFwd = 1.15;
  P.legLOut = P.legROut = 0.32;
  P.kneeL = P.kneeR = 1.25;
  P.footL = P.footR = -0.1;
  planted = true;
}

function clap(t: number) {
  // Hands spring apart and snap back together about twice a second.
  const open = Math.abs(Math.sin(t * 7.2)) ** 1.3;
  P.rootY = dip(0.1 + 0.08 * (1 - open));
  atEase(t, 0.5);
  P.torsoX += 0.05;
  P.headX = 0.04 * (1 - open) - 0.02;
  P.headY = Math.sin(t * 0.6) * 0.15;
  const gap = 0.024 + open * 0.085;
  hand(-1, gap, 0.37, 0.27, 0.6);
  hand(1, gap, 0.35, 0.27, 0.6);
}

function wave(t: number) {
  atEase(t, 0.4);
  const s = Math.sin(t * 8.5);
  // Arm up and out to the side, forearm rocking from the elbow; the body leans a little into it.
  armL(0.3, 1.45, 1.45 + s * 0.08, 1.7 + s * 0.38);
  P.torsoZ += -0.045;
  P.headZ += 0.06;
  P.headY = -0.08;
  P.headX = -0.04;
}

function stir(t: number) {
  const c = Math.cos(t * 4.6), s = Math.sin(t * 4.6);
  P.torsoX = 0.13;
  P.torsoY = s * 0.03;
  P.headX = 0.22;
  P.breath = Math.sin(t * 1.7) * 0.01;
  // One hand steadies the pot, the other goes round in it.
  hand(-1, 0.19, 0.1, 0.3, 0.4);
  hand(1, 0.03 + c * 0.06, 0.16, 0.34 + s * 0.06, 0.5);
}

function typing(t: number) {
  // Looks up from the keys every so often.
  const up = smooth(Math.sin(t * 0.6) * 3 - 2);
  P.torsoX = 0.07;
  P.headX = 0.22 - up * 0.26;
  P.headY = up * Math.sin(t * 0.25) * 0.3;
  P.breath = Math.sin(t * 1.7) * 0.01;
  hand(-1, 0.1 + Math.sin(t * 1.9) * 0.025, 0.13 + Math.sin(t * 13) * 0.012 + Math.sin(t * 7.3) * 0.006, 0.33, 0.35);
  hand(1, 0.1 + Math.sin(t * 2.3 + 2) * 0.025, 0.13 + Math.sin(t * 11.3 + 1) * 0.012 + Math.sin(t * 6.1) * 0.006, 0.33, 0.35);
}

function talk(t: number) {
  const g = Math.sin(t * 2.6), h = Math.sin(t * 1.7 + 1);
  atEase(t, 0.7);
  P.torsoY = h * 0.06;
  P.torsoX += 0.02 + g * 0.012;
  P.headY = Math.sin(t * 0.9) * 0.28;
  P.headX = Math.sin(t * 2.6 + 0.5) * 0.05;
  P.headZ += h * 0.05;
  // Forearms up, hands making the point in turn.
  hand(-1, 0.16 + 0.06 * h, 0.24 + 0.14 * Math.max(0, g), 0.27 + 0.05 * g, 0.4);
  hand(1, 0.16 - 0.05 * h, 0.22 + 0.14 * Math.max(0, -g), 0.27 - 0.05 * g, 0.4);
}

function eat(t: number) {
  // A bite every couple of seconds: down to the plate, up to the mouth, hold, back.
  const u = (t / 2.6) % 1;
  const up = pulse(u, 0.3, 0.5);
  P.torsoX = 0.05 + up * 0.04;
  P.headX = 0.1 + up * 0.08 + (u > 0.75 ? Math.sin(t * 11) * 0.012 : 0);
  P.breath = Math.sin(t * 1.7) * 0.008;
  hand(-1, mix(0.1, 0.02, up), mix(0.13, 0.6, up), mix(0.3, 0.2, up), 0.5 + up * 0.4);
  hand(1, 0.13, 0.12, 0.28, 0.4);
}

function drink(t: number) {
  // Holds the cup at the chest and takes a sip now and then.
  const sip = pulse((t / 4.2) % 1, 0.18, 0.42);
  atEase(t, 0.6);
  P.headX = -0.16 * sip;
  P.headY = (1 - sip) * Math.sin(t * 0.4) * 0.2;
  hand(-1, mix(0.08, 0.02, sip), mix(0.36, 0.6, sip), mix(0.26, 0.2, sip), 0.5 + sip * 0.4);
}

function clean(t: number) {
  // Both hands on a broom, sweeping it across the floor with the whole upper body.
  const s = Math.sin(t * 3.4), c = Math.cos(t * 3.4);
  P.rootX = s * 0.02;
  P.rootY = dip(0.35);
  P.torsoX = 0.24;
  P.torsoY = s * 0.14;
  P.headX = 0.12;
  hand(-1, 0.06 - s * 0.1, 0.06 + Math.abs(c) * 0.03, 0.36, 0.5);
  hand(1, 0.02 + s * 0.07, 0.28, 0.24, 0.5);
}

function wash(t: number) {
  // Bent over a bowl or a sink, hands scrubbing against each other.
  const s = Math.sin(t * 6.5);
  P.rootY = dip(0.2);
  P.torsoX = 0.2;
  P.torsoY = s * 0.02;
  P.headX = 0.15;
  hand(-1, 0.06, 0.1 + s * 0.03, 0.32 + s * 0.045, 0.5);
  hand(1, 0.06, 0.1 - s * 0.03, 0.32 - s * 0.045, 0.5);
}

function exercise(t: number) {
  // Jogging on the spot: knees driving up in turn, arms pumping against them.
  const a = t * 9;
  const s = Math.sin(a);
  const l = Math.max(0, s) ** 1.3, r = Math.max(0, -s) ** 1.3;
  P.rootY = dip(0.45) * (1 - Math.abs(s));
  P.torsoX = 0.1;
  P.torsoY = s * 0.1;
  P.hipsY = -s * 0.06;
  P.headX = -0.05;
  P.headY = -s * 0.04;
  foot(-1, 0.1 * l, 0.2 * l, 0.5 * l);
  foot(1, 0.1 * r, 0.2 * r, 0.5 * r);
  armL(0.15 - 0.55 * s, 0.12, -0.3, 1.55 - 0.15 * s);
  armR(0.15 + 0.55 * s, 0.12, -0.3, 1.55 + 0.15 * s);
}

function dance(t: number) {
  // A two-step: the weight rocks across over two beats, the knees dip on every beat.
  const b = t * 1.75;
  const sway = Math.sin(Math.PI * b);
  const hit = Math.cos(2 * Math.PI * b);
  P.rootX = sway * 0.055;
  P.rootY = dip(0.42 + 0.2 * hit);
  P.hipsZ = sway * 0.07;
  P.hipsY = sway * 0.12;
  P.torsoX = 0.05 + 0.03 * hit;
  P.torsoY = -sway * 0.2;
  P.torsoZ = -sway * 0.16;
  P.headX = 0.03 * hit;
  P.headY = sway * 0.1;
  P.headZ = sway * 0.06;
  // The free foot comes off the floor between beats.
  const off = 0.5 - 0.5 * hit;
  foot(-1, 0, 0.035 * Math.max(0, sway) * off, 0.3 * Math.max(0, sway) * off, 0.04);
  foot(1, 0, 0.035 * Math.max(0, -sway) * off, 0.3 * Math.max(0, -sway) * off, 0.04);
  // Elbows out, fists pumping; the hand on the weighted side rides up.
  hand(-1, 0.2, 0.33 + 0.18 * Math.max(0, -sway) + 0.03 * hit, 0.22 + 0.04 * sway, 0.9);
  hand(1, 0.2, 0.33 + 0.18 * Math.max(0, sway) + 0.03 * hit, 0.22 - 0.04 * sway, 0.9);
}

function read(t: number) {
  // Book held open in both hands; one turns the page every few seconds.
  const flip = pulse((t / 6) % 1, 0.08, 0.12);
  P.torsoX = 0.06;
  P.headX = 0.3 + Math.sin(t * 0.7) * 0.02;
  P.headY = Math.sin(t * 0.9) * 0.06;
  P.breath = Math.sin(t * 1.6) * 0.01;
  hand(-1, 0.1, 0.3, 0.29, 0.3);
  hand(1, 0.1 - flip * 0.13, 0.3 + Math.sin(Math.PI * flip) * 0.04, 0.3, 0.3);
}

function pray(t: number) {
  // Dua: palms raised in front of the chest, head bowed.
  const br = Math.sin(t * 1.3);
  P.torsoX = 0.04 + br * 0.01;
  P.headX = 0.22 + br * 0.03;
  P.breath = br * 0.012;
  hand(-1, 0.07, 0.3 + br * 0.008, 0.33, 0.15);
  hand(1, 0.07, 0.3 + br * 0.008, 0.33, 0.15);
}

function perform(t: number) {
  // Busy with something at waist height (keys, a cue, a microphone), moving to it.
  const g = Math.sin(t * 3.2), h = Math.sin(t * 1.6);
  P.rootX = h * 0.012;
  P.rootY = dip(0.2 + 0.1 * Math.cos(t * 6.4));
  P.torsoX = 0.06;
  P.torsoY = h * 0.07;
  P.headX = 0.08 + Math.cos(t * 6.4) * 0.03;
  P.headY = -h * 0.08;
  hand(-1, 0.14 + 0.03 * h, 0.2 + 0.07 * g, 0.31, 0.45);
  hand(1, 0.14 - 0.03 * h, 0.2 - 0.07 * g, 0.31, 0.45);
}

const CLIPS: Record<Clip, (t: number) => void> = { idle, walk, sit, lie, ride, clap, wave, stir, type: typing, talk, eat, drink, clean, wash, exercise, dance, read, pray, perform };

/** Turns a limb by a swing (forward and out together, in no particular order) and then a twist about its own length. */
function limb(g: Group, fwd: number, out: number, twist: number, side: -1 | 1) {
  const x = -fwd, z = side * out;
  const a = Math.hypot(x, z);
  const k = a > 1e-6 ? Math.sin(a / 2) / a : 0.5;
  const sx = x * k, sz = z * k, sw = Math.cos(a / 2);
  const ty = Math.sin((side * twist) / 2), tw = Math.cos((side * twist) / 2);
  g.quaternion.set(sx * tw - sz * ty, sw * ty, sz * tw + sx * ty, sw * tw);
}

/** `armOut` holds a hanging arm that much further from the body, to clear a skirt or robe. */
function applyPose(r: Rig, p: Pose, armOut = 0) {
  // An arm that is raised or reaching forward is already clear of it.
  const clear = (fwd: number) => armOut * Math.max(0, 1 - Math.abs(fwd) / 0.6);
  r.root.current.position.set(p.rootX, p.rootY, p.rootZ);
  r.hips.current.rotation.set(p.hipsX, p.hipsY, p.hipsZ);
  r.torso.current.rotation.set(p.torsoX, p.torsoY, p.torsoZ);
  r.torso.current.scale.y = 1 + p.breath;
  r.head.current.rotation.set(p.headX, p.headY, p.headZ);
  limb(r.armL.current, p.armLFwd, p.armLOut + clear(p.armLFwd), p.armLTwist, -1);
  limb(r.armR.current, p.armRFwd, p.armROut + clear(p.armRFwd), p.armRTwist, 1);
  r.elbowL.current.rotation.x = -p.elbowL;
  r.elbowR.current.rotation.x = -p.elbowR;
  limb(r.legL.current, p.legLFwd, p.legLOut, p.legLTwist, -1);
  limb(r.legR.current, p.legRFwd, p.legROut, p.legRTwist, 1);
  r.kneeL.current.rotation.x = p.kneeL;
  r.kneeR.current.rotation.x = p.kneeR;
  r.footL.current.rotation.x = p.footL;
  r.footR.current.rotation.x = p.footR;
}

export function Person({ look, clipRef, seatedRef }: {
  look: string;
  clipRef: React.RefObject<Clip | null>;
  /** True while the body is on a seat: the legs sit, whatever the clip is doing up top. */
  seatedRef?: React.RefObject<boolean>;
}) {
  const a = useMemo(() => decodeLook(look), [look]);
  const rig: Rig = {
    root: useRef<Group>(null!),
    hips: useRef<Group>(null!),
    skirt: useRef<Group>(null!),
    torso: useRef<Group>(null!),
    head: useRef<Group>(null!),
    armL: useRef<Group>(null!),
    armR: useRef<Group>(null!),
    elbowL: useRef<Group>(null!),
    elbowR: useRef<Group>(null!),
    legL: useRef<Group>(null!),
    legR: useRef<Group>(null!),
    kneeL: useRef<Group>(null!),
    kneeR: useRef<Group>(null!),
    footL: useRef<Group>(null!),
    footR: useRef<Group>(null!),
  };
  const state = useRef<{ t: number; clip: Clip | null; seated: boolean; fade: number; from: Pose; now: Pose }>(null!);
  // Everyone starts at a different point in their clip, so a crowd never moves in step.
  if (!state.current) state.current = { t: Math.random() * 10, clip: null, seated: false, fade: 1, from: newPose(), now: newPose() };

  useFrame((_, dt) => {
    const st = state.current;
    const clip = clipRef.current ?? 'idle';
    const seated = clip === 'sit' || !!seatedRef?.current;
    const step = Math.min(dt, 0.1);
    st.t += step;
    SH = shoulderX;
    STRIDE = stride;
    rest();
    (CLIPS[clip] ?? idle)(st.t);
    if (seated) sitLegs();
    else if (!planted) {
      foot(-1);
      foot(1);
    }
    // A new clip cross-fades in from wherever the body had got to, so nothing snaps.
    if (clip !== st.clip || seated !== st.seated) {
      if (st.clip !== null) {
        Object.assign(st.from, st.now);
        st.fade = 0;
      }
      st.clip = clip;
      st.seated = seated;
    }
    st.fade = Math.min(1, st.fade + step / FADE);
    const k = smooth(st.fade);
    for (const c of CHANNELS) st.now[c] = st.from[c] + (P[c] - st.from[c]) * k;
    // Cloth gives way to the legs: a skirt swings forward only as far as both thighs do (so it lies
    // along them on a seat, and stays put on a walk) and opens out to cover whichever leg strays further.
    const sk = rig.skirt.current;
    let armOut = 0;
    if (hem) {
      const both = Math.max(0, Math.min(Math.PI / 2, st.now.legLFwd, st.now.legRFwd));
      const part = Math.max(Math.abs(st.now.legLFwd - both), Math.abs(st.now.legRFwd - both));
      const swing = hem[2] ? both : 0;
      sk.rotation.x = -swing;
      const drop = Math.min(hem[0], THIGH);
      sk.scale.z = Math.max(1, (drop * Math.sin(Math.min(part, 1.2)) + 0.115) / (hem[1] * 0.72)) * (1 - 0.3 * (swing / (Math.PI / 2)));
      const wide = Math.max(st.now.legLOut, st.now.legROut, 0) + Math.abs(st.now.hipsZ);
      sk.scale.x = Math.max(1, (hipX + drop * Math.sin(Math.min(wide, 1.2)) + 0.085) / hem[1]);
      // Hands hang where it flares out, so the arms are held just wide enough to clear it.
      const flare = (0.18 + (hem[1] - 0.18) * Math.min(1, 0.075 / hem[0])) * sk.scale.x;
      armOut = Math.min(0.3, Math.max(0, (flare + 0.04 - shoulderX) / (UPPER_ARM + FOREARM)));
    }
    applyPose(rig, st.now, armOut);
  });

  const f = a.body === 'f';
  const skin = SKINS[a.skin];
  const top = a.outfit.top ? GARMENT_BY_ID[a.outfit.top] : undefined;
  const full = isFullOutfit(a.outfit.top);
  const bottom = !full && a.outfit.bottom ? GARMENT_BY_ID[a.outfit.bottom] : undefined;
  const shoes = a.outfit.shoes ? GARMENT_BY_ID[a.outfit.shoes] : undefined;
  const topColor = top?.color ?? skin;
  const shoulderX = f ? 0.175 : 0.205;
  const hipX = f ? 0.088 : 0.085;
  const longBottom = bottom && LONG_BOTTOMS.has(bottom.shape);
  const thighColor = bottom && !SKIRTS.has(bottom.shape) && bottom.shape !== 'wrapper' ? bottom.color : skin;
  const topPat = patOf(top);
  const bagG = a.outfit.bag ? GARMENT_BY_ID[a.outfit.bag] : undefined;
  const botPat = bottom && !SKIRTS.has(bottom.shape) && bottom.shape !== 'wrapper' ? patOf(bottom) : undefined;
  const shinColor = longBottom ? bottom.color : skin;
  const legsHidden = top?.shape === 'abaya' || bottom?.shape === 'wrapper';
  const hem = HEMS[top?.shape ?? ''] ?? HEMS[bottom?.shape ?? ''];
  // A wrapper or an abaya only allows short steps; a long skirt or kaftan trims them a little.
  const stride = legsHidden ? 0.6 : top?.shape === 'dress' || top?.shape === 'kaftan' || (bottom && SKIRTS.has(bottom.shape)) ? 0.8 : 1;
  const sleeve = !top || top.shape === 'tank' ? 'none' : SHORT_SLEEVES.has(top.shape) ? 'short' : 'long';
  const pelvisColor = full ? topColor : bottom && bottom.shape !== 'wrapper' ? bottom.color : topColor;
  // Trousers are a little looser than skin.
  const legR = (base: number, covered: boolean) => base + (covered ? 0.006 : 0);

  useLayoutEffect(() => {
    rig.root.current.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.castShadow = m.geometry.boundingSphere!.radius * Math.max(m.scale.x, m.scale.y, m.scale.z) >= TINY;
    });
  }, [a]);

  return (
    <group ref={rig.root}>
      <group ref={rig.hips} position={[0, HIP_Y, 0]}>
        {/* Pelvis: hides the hip joints */}
        <M color={pelvisColor} geometry={sphere(0.16)} position={[0, 0.0, 0]} scale={[f ? 1.08 : 1, 0.62, 0.7]} />
        <group ref={rig.torso}>
          <Torso a={a} top={top} color={topColor} skin={skin} bag={bagG} />
          <group ref={rig.head} position={[0, NECK_PIVOT, 0]} rotation-order="YXZ">
            <group position={[0, HEAD_Y - NECK_PIVOT, 0]}>
              <Head a={a} skin={skin} />
            </group>
          </group>
          {/* Arms (pivot at the shoulder): they hang off the torso, so they follow it when it leans or turns. */}
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={side < 0 ? rig.armL : rig.armR} position={[side * shoulderX, SHOULDER_Y, 0]}>
              <M color={sleeve === 'long' ? topColor : skin} pat={sleeve === 'long' ? topPat : undefined} geometry={taper(f ? 0.05 : 0.058, f ? 0.04 : 0.046, UPPER_ARM - 0.06)} position={[0, -UPPER_ARM / 2 + 0.015, 0]} />
              {sleeve === 'short' && <M color={topColor} pat={topPat} geometry={taper(f ? 0.056 : 0.065, f ? 0.05 : 0.058, 0.07)} position={[0, -0.04, 0]} />}
              <group ref={side < 0 ? rig.elbowL : rig.elbowR} position={[0, -UPPER_ARM + 0.03, 0]}>
                <M color={sleeve === 'long' ? topColor : skin} pat={sleeve === 'long' ? topPat : undefined} geometry={taper(f ? 0.041 : 0.047, f ? 0.032 : 0.037, FOREARM - 0.05)} position={[0, -FOREARM / 2 + 0.01, 0]} />
                {/* Hand */}
                <M color={skin} geometry={sphere(0.045)} position={[0, -FOREARM - 0.015, 0.005]} scale={[0.72, 1.15, 0.95]} />
                {side < 0 && a.outfit.wrist && <Wrist g={GARMENT_BY_ID[a.outfit.wrist]} />}
                {side > 0 && bagG && HAND_BAGS.has(bagG.shape) && <HandBag g={bagG} />}
              </group>
            </group>
          ))}
        </group>
        <group ref={rig.skirt}>
          <SkirtOrRobe top={top} bottom={bottom} f={f} />
        </group>
        {bottom?.shape === 'cargo' && <CargoPockets color={bottom.color} f={f} />}
      </group>

      {/* Legs (pivot at the hip). Under an abaya or wrapper only the feet show, but the rig stays. */}
      {([-1, 1] as const).map((side) => (
        <group key={side} ref={side < 0 ? rig.legL : rig.legR} position={[side * hipX, HIP_Y, 0]}>
          {!legsHidden && (
            <M color={full ? skin : thighColor} pat={full ? undefined : botPat} geometry={taper(legR(f ? 0.088 : 0.085, !!bottom), legR(0.058, !!bottom), THIGH - 0.1)} position={[0, -THIGH / 2 + 0.02, 0]} />
          )}
          <group ref={side < 0 ? rig.kneeL : rig.kneeR} position={[0, -THIGH, 0]}>
            {!legsHidden && <M color={full ? skin : shinColor} pat={full ? undefined : longBottom ? botPat : undefined} geometry={taper(legR(0.058, !!longBottom), legR(0.04, !!longBottom), SHIN - 0.07)} position={[0, -SHIN / 2 + 0.01, 0]} />}
            {/* Ankle */}
            <group ref={side < 0 ? rig.footL : rig.footR} position={[0, -SHIN, 0]}>
              <group position={[0, SHIN, 0]}>
                <Shoe g={shoes} skin={skin} />
              </group>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

function Torso({ a, top, color, skin, bag }: { a: Appearance; top?: Garment; color: string; skin: string; bag?: Garment }) {
  const f = a.body === 'f';
  const shape = top?.shape;
  const accent = top?.accent ?? color;
  const front = (f ? 0.152 : 0.182) * TORSO_DEPTH;
  return (
    <group>
      <M color={color} pat={patOf(top)} geometry={lathe(a.body, TORSO[a.body])} scale={[1, 1, TORSO_DEPTH]} />
      {f && ([-1, 1] as const).map((s) => <M key={s} color={color} geometry={sphere(0.055)} position={[s * 0.052, 0.355, 0.045]} scale={[1, 0.85, 0.6]} />)}
      {/* Neck */}
      <M color={skin} geometry={capsule(f ? 0.043 : 0.05, 0.06)} position={[0, NECK_Y + 0.04, 0]} />
      {/* Open neckline on tops that have one */}
      {(shape === 'tee' || shape === 'tank' || shape === 'blouse' || shape === 'dress' || shape === 'jersey' || shape === 'polo' || shape === 'shirt') && (
        <M color={skin} geometry={sphere(0.05)} position={[0, NECK_Y - 0.035, 0.045]} scale={[1, 0.8, 0.5]} />
      )}
      {(shape === 'polo' || shape === 'shirt') && (
        <>
          {([-1, 1] as const).map((s) => (
            <M key={s} color={accent} position={[s * 0.04, NECK_Y - 0.015, 0.07]} rotation={[0.5, 0, s * 0.5]}>
              <boxGeometry args={[0.06, 0.012, 0.045]} />
            </M>
          ))}
        </>
      )}
      {shape === 'shirt' && (
        <M color={accent} position={[0, 0.27, front + 0.002]}>
          <boxGeometry args={[0.018, 0.4, 0.008]} />
        </M>
      )}
      {shape === 'jersey' && (
        <>
          {/* Club crest on the chest and a stripe down each side of the front */}
          <M color={accent} position={[0.06, 0.37, front - 0.012]}>
            <boxGeometry args={[0.042, 0.048, 0.02]} />
          </M>
          {([-1, 1] as const).map((s) => (
            <M key={s} color={accent} geometry={sidePanel(a.body, s)} scale={[1, 1, TORSO_DEPTH]} />
          ))}
        </>
      )}
      {shape === 'tank' && (
        // Wide scoop neck and bare shoulders
        <>
          <M color={skin} geometry={sphere(0.07)} position={[0, NECK_Y - 0.05, 0.04]} scale={[1.2, 0.8, 0.55]} />
          {([-1, 1] as const).map((s) => <M key={s} color={skin} geometry={sphere(0.05)} position={[s * 0.17, NECK_Y - 0.06, 0]} scale={[1, 0.7, 0.9]} />)}
        </>
      )}
      {shape === 'bomber' && (
        // Ribbed collar, cuffs and hem in the accent colour
        <>
          <M color={accent} geometry={lathe('bomber-hem', [[0.162, -0.03], [0.168, 0.04]])} scale={[1, 1, TORSO_DEPTH]} />
          <M color={accent} position={[0, NECK_Y - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.065, 0.016, 6, 16]} />
          </M>
          <M color={shade(color, 0.8)} position={[0, 0.26, front + 0.003]}>
            <boxGeometry args={[0.012, 0.4, 0.008]} />
          </M>
        </>
      )}
      {shape === 'senator' && (
        // Plain tunic with a stitched neckline and chest pocket
        <>
          <M color={accent} position={[0, 0.4, front + 0.002]}>
            <boxGeometry args={[0.014, 0.2, 0.008]} />
          </M>
          <M color={accent} position={[0.07, 0.34, front + 0.002]}>
            <boxGeometry args={[0.05, 0.05, 0.006]} />
          </M>
        </>
      )}
      {shape === 'hoodie' && (
        <>
          <M color={color} geometry={sphere(0.11)} position={[0, NECK_Y - 0.02, -0.08]} scale={[1.2, 0.7, 0.9]} />
          <M color={shade(color, 0.85)} position={[0, 0.17, front]}>
            <boxGeometry args={[0.2, 0.09, 0.02]} />
          </M>
        </>
      )}
      {shape === 'suit' && (
        <>
          {/* Shirt, tie and lapels down the front */}
          <M color={accent} position={[0, 0.39, front - 0.004]} rotation={[-0.15, 0, 0]}>
            <boxGeometry args={[0.08, 0.2, 0.01]} />
          </M>
          <M color="#7f1d1d" position={[0, 0.36, front + 0.005]} rotation={[-0.12, 0, 0]}>
            <boxGeometry args={[0.028, 0.18, 0.008]} />
          </M>
          {([-1, 1] as const).map((s) => (
            <M key={s} color={shade(color, 0.75)} position={[s * 0.055, 0.38, front + 0.002]} rotation={[-0.1, 0, s * 0.3]}>
              <boxGeometry args={[0.03, 0.22, 0.008]} />
            </M>
          ))}
        </>
      )}
      {(shape === 'kaftan' || shape === 'senator' || shape === 'agbada' || shape === 'abaya' || shape === 'dress') && top?.accent && (
        // Embroidered neckline
        <M color={accent} position={[0, NECK_Y - 0.02, 0.005]} rotation={[Math.PI / 2 - 0.25, 0, 0]} scale={[1, 0.75, 1]}>
          <torusGeometry args={[0.062, 0.012, 6, 18]} />
        </M>
      )}
      {shape === 'agbada' && (
        // The big flowing outer robe draped from the shoulders, open at the front.
        <>
          <M color={color} double geometry={lathe('agbada', [[0.26, -0.4], [0.25, -0.1], [0.24, 0.3], [0.24, 0.43], [0.13, 0.52]], 16)} scale={[1.12, 1, 0.72]} position={[0, 0, -0.005]} />
          {/* Embroidered chest panel */}
          <M color={accent} position={[0, 0.36, 0.175]}>
            <boxGeometry args={[0.13, 0.2, 0.006]} />
          </M>
          <M color={color} position={[0, 0.36, 0.179]}>
            <boxGeometry args={[0.07, 0.14, 0.006]} />
          </M>
        </>
      )}
      {a.outfit.neck && <Neck g={GARMENT_BY_ID[a.outfit.neck]} body={a.body} />}
      {bag && <BodyBag g={bag} f={f} />}
    </group>
  );
}

/** Long garments that hang below the hips. */
// Every skirt and robe is cut wider than the tops of the thighs, which would otherwise show through at the hips.
function SkirtOrRobe({ top, bottom, f }: { top?: Garment; bottom?: Garment; f: boolean }) {
  const robe = (key: string, color: string, pts: [number, number][]) => <M color={color} pat={patOf(color === top?.color ? top : bottom)} geometry={lathe(key, pts)} scale={[1, 1, 0.8]} />;
  // A wrapper hides the legs, so it is drawn even when a senator or kaftan hangs over the top of it.
  const wrapper = bottom?.shape === 'wrapper' && (
    <>
      {robe('wrapper', bottom.color, [[0.15, 0.08], [0.17, 0.0], [0.19, -0.5], [0.2, -0.84], [0.001, -0.84]])}
      {bottom.accent && <M color={bottom.accent} geometry={lathe('wrapper-band', [[0.176, -0.17], [0.18, -0.23]])} scale={[1, 1, 0.82]} />}
    </>
  );
  if (top?.shape === 'senator' || top?.shape === 'kaftan') {
    const tunic = top.shape === 'senator' ? robe('senator', top.color, [[0.16, 0.03], [0.186, -0.03], [0.19, -0.3], [0.001, -0.3]]) : robe('kaftan', top.color, [[0.16, 0.03], [0.186, -0.03], [0.2, -0.42], [0.001, -0.42]]);
    return (
      <>
        {tunic}
        {wrapper}
      </>
    );
  }
  if (top?.shape === 'dress') return robe('dress', top.color, [[0.125, 0.19], [0.166, 0.05], [0.187, -0.03], [0.205, -0.2], [0.25, -0.45], [0.001, -0.45]]);
  if (top?.shape === 'abaya') return robe('abaya', top.color, [[0.13, 0.12], [0.17, 0.0], [0.21, -0.5], [0.24, -0.84], [0.001, -0.84]]);
  if (bottom?.shape === 'pleated') return robe('pleated', bottom.color, [[f ? 0.15 : 0.14, 0.08], [0.172, 0.03], [0.19, -0.03], [0.27, -0.28], [0.001, -0.28]]);
  if (bottom?.shape === 'skirt') return robe('skirt', bottom.color, [[f ? 0.15 : 0.14, 0.08], [0.172, 0.03], [0.187, -0.03], [0.23, -0.34], [0.001, -0.34]]);
  return wrapper || null;
}

function Shoe({ g, skin }: { g?: Garment; skin: string }) {
  const y = -SHIN - 0.045;
  const foot = (color: string, r = 0.044, sx = 1.1) => <M color={color} geometry={capsule(r, 0.12)} position={[0, y, 0.045]} rotation={[Math.PI / 2, 0, 0]} scale={[sx, 1, 0.75]} />;
  if (!g) return foot(skin, 0.04);
  switch (g.shape) {
    case 'slippers':
      return (
        <>
          {foot(skin, 0.038)}
          <M color={g.color} position={[0, y - 0.03, 0.045]}>
            <boxGeometry args={[0.095, 0.018, 0.23]} />
          </M>
          <M color={g.color} geometry={capsule(0.03, 0.06)} position={[0, y + 0.01, 0.07]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.6]} />
        </>
      );
    case 'heels':
      return (
        <>
          {/* Foot tipped forward onto the toes, heel raised on a thin post */}
          <M color={g.color} geometry={capsule(0.036, 0.12)} position={[0, y + 0.015, 0.045]} rotation={[Math.PI / 2 + 0.3, 0, 0]} scale={[1, 1, 0.75]} />
          <M color={g.color} position={[0, y - 0.015, -0.03]}>
            <cylinderGeometry args={[0.012, 0.008, 0.06, 6]} />
          </M>
        </>
      );
    case 'boots':
      return (
        <>
          <M color={g.color} geometry={capsule(0.064, 0.08)} position={[0, y + 0.07, 0]} />
          {foot(g.color, 0.05, 1.12)}
        </>
      );
    case 'sneakers':
      return (
        <>
          {foot(g.color, 0.05, 1.15)}
          <M color={g.accent ?? '#ffffff'} position={[0, y - 0.03, 0.045]}>
            <boxGeometry args={[0.1, 0.022, 0.21]} />
          </M>
        </>
      );
    default:
      return foot(g.color, 0.045, 1.1);
  }
}

function Head({ a, skin }: { a: Appearance; skin: string }) {
  const f = a.body === 'f';
  const hairColor = HAIR_COLORS[a.hairColor];
  const head = a.outfit.head ? GARMENT_BY_ID[a.outfit.head] : undefined;
  const coversHair = head && (head.shape === 'hijab' || head.shape === 'turban' || head.shape === 'gele' || head.shape === 'durag' || head.shape === 'headtie');
  return (
    <group>
      {/* Skull and jaw */}
      <M color={skin} geometry={sphere(0.14)} scale={[0.92, 1.04, 1]} />
      <M color={skin} geometry={sphere(0.11)} position={[0, -0.055, 0.02]} scale={[f ? 0.86 : 0.95, 0.82, 0.95]} />
      {/* Eyes */}
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * 0.047, 0.012, 0.118]}>
          <M color="#f8fafc" geometry={sphere(0.022)} scale={[1, 0.85, 0.5]} rough={0.3} />
          <M color="#1c1917" geometry={sphere(0.013)} position={[0, 0, 0.009]} scale={[1, 1, 0.5]} rough={0.2} />
          {/* Brow */}
          <M color={hairColor} position={[0, 0.036, 0.004]} rotation={[0, 0, s * -0.12]}>
            <boxGeometry args={[0.042, f ? 0.007 : 0.011, 0.01]} />
          </M>
          {f && (
            <M color="#111827" position={[0, 0.014, 0.008]}>
              <boxGeometry args={[0.044, 0.005, 0.006]} />
            </M>
          )}
        </group>
      ))}
      {/* Nose */}
      <M color={skin} geometry={sphere(0.024)} position={[0, -0.025, 0.128]} scale={[1.05, 0.9, 0.85]} />
      {/* Lips */}
      <M color={f ? '#9f1239' : shade(skin, 0.7)} geometry={capsule(0.012, 0.035)} position={[0, -0.072, 0.11]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.6]} />
      {/* Ears */}
      {([-1, 1] as const).map((s) => (
        <M key={s} color={skin} geometry={sphere(0.03)} position={[s * 0.128, -0.005, 0]} scale={[0.45, 1, 0.75]} />
      ))}
      {f && !coversHair && ([-1, 1] as const).map((s) => <M key={s} color="#d4af37" geometry={sphere(0.012)} position={[s * 0.13, -0.04, 0.005]} metal={0.8} rough={0.3} />)}
      {!coversHair && <Hair style={a.hair} color={hairColor} skin={skin} capped={!!head} />}
      {head && <HeadWear g={head} />}
      {a.outfit.eyes && <Eyes g={GARMENT_BY_ID[a.outfit.eyes]} />}
    </group>
  );
}

/** Upper half of a sphere, for scalps and caps. */
const dome = (r: number, cut = 0.5) => geo(`dome:${r}:${cut}`, () => new SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI * cut));

/** A cap of hair over the skull. `cut` is how far down it comes; it is tipped back so the hairline is high on the forehead and low on the nape. */
const scalp = (r: number, cut: number) => geo(`scalp:${r}:${cut}`, () => new SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI * cut));
const HAIRLINE = 0.6;

function Hair({ style, color, skin, capped }: { style: Appearance['hair']; color: string; skin: string; capped: boolean }) {
  // Always a little bigger than the skull all round, or the forehead cuts a jagged fringe into it.
  const cap = (r = 0.15, cut = 0.52, c = color) => <M color={c} geometry={scalp(r, cut)} scale={[0.92, 1.04, 1]} rotation={[-HAIRLINE, 0, 0]} rough={0.95} />;
  // Hair cut so short the scalp shows through it.
  const stubble = (k: number) => '#' + new Color(color).lerp(new Color(skin), k).getHexString();
  switch (style) {
    case 'bald':
      return null;
    case 'low':
      return cap(0.1465);
    case 'fade':
      return (
        <>
          {cap(0.146, 0.52, stubble(0.45))}
          {cap(0.151, 0.3)}
        </>
      );
    case 'cornrows':
      return (
        <>
          {cap(0.146, 0.52, stubble(0.4))}
          {/* Raised rows from the hairline over the crown to the nape */}
          {[-0.092, -0.048, 0, 0.048, 0.092].map((x) => (
            <M key={x} color={color} position={[x, 0, 0]} rotation={[0, -Math.PI / 2, HAIRLINE + 0.02]} rough={0.95}>
              <torusGeometry args={[0.147 * Math.sqrt(1 - (x / 0.136) ** 2), 0.01, 5, 14, Math.PI - 0.04]} />
            </M>
          ))}
        </>
      );
    case 'afro':
      if (capped) return cap();
      return (
        <>
          {cap()}
          <M color={color} geometry={sphere(0.17)} position={[0, 0.085, -0.045]} scale={[1.08, 0.98, 1]} rough={1} />
          {/* Curls breaking up the outline */}
          {Array.from({ length: 9 }, (_, i) => {
            const ang = (Math.PI * 2 * i) / 9 + 0.35;
            return <M key={i} color={color} geometry={sphere(0.062)} position={[Math.cos(ang) * 0.135, 0.1 + (i % 2) * 0.05, -0.045 + Math.sin(ang) * 0.125]} rough={1} />;
          })}
        </>
      );
    case 'curls':
      if (capped) return cap();
      // A short crop of tight curls, thickest on top
      return (
        <>
          {cap()}
          {Array.from({ length: 13 }, (_, i) => {
            const ring = i < 8 ? 0.085 : i < 12 ? 0.045 : 0;
            const ang = (Math.PI * 2 * i) / (i < 8 ? 8 : 4) + (i < 8 ? 0 : 0.4);
            return <M key={i} color={color} geometry={sphere(0.05)} position={[Math.cos(ang) * ring, 0.118 + (i < 8 ? 0 : i < 12 ? 0.028 : 0.04), -0.035 + Math.sin(ang) * ring]} rough={1} />;
          })}
        </>
      );
    case 'mohawk':
      if (capped) return cap(0.146, 0.52, stubble(0.5));
      // Shaved sides, with a crest from the hairline over the crown to the nape
      return (
        <>
          {cap(0.146, 0.52, stubble(0.5))}
          {Array.from({ length: 7 }, (_, i) => {
            const ang = HAIRLINE + 0.12 + (i * (Math.PI - 0.5)) / 6;
            return <M key={i} color={color} geometry={sphere(0.04)} position={[0, Math.sin(ang) * 0.158, Math.cos(ang) * 0.148]} scale={[0.7, 1.1, 1.15]} rotation={[Math.PI / 2 - ang, 0, 0]} rough={1} />;
          })}
        </>
      );
    case 'puffs':
      return (
        <>
          {cap()}
          {!capped && ([-1, 1] as const).map((s) => <M key={s} color={color} geometry={sphere(0.082)} position={[s * 0.125, 0.115, -0.03]} rough={1} />)}
        </>
      );
    case 'ponytail':
      return (
        <>
          {cap()}
          <M color={shade(color, 0.6)} position={[0, 0.07, -0.142]} rotation={[0.5, 0, 0]}>
            <torusGeometry args={[0.03, 0.008, 5, 12]} />
          </M>
          <M color={color} geometry={taper(0.034, 0.014, 0.2)} position={[0, -0.035, -0.158]} rotation={[0.22, 0, 0]} rough={0.95} />
        </>
      );
    case 'bun':
      return (
        <>
          {cap()}
          {!capped && (
            <>
              <M color={color} geometry={sphere(0.066)} position={[0, 0.15, -0.085]} scale={[1.1, 0.9, 1.1]} rough={0.95} />
              <M color={shade(color, 0.6)} position={[0, 0.118, -0.068]} rotation={[Math.PI / 2 - 0.55, 0, 0]}>
                <torusGeometry args={[0.04, 0.008, 5, 12]} />
              </M>
            </>
          )}
        </>
      );
    case 'dreads':
    case 'braids': {
      const braids = style === 'braids';
      const n = braids ? 13 : 11;
      return (
        <>
          {cap()}
          {Array.from({ length: n }, (_, i) => {
            const ang = Math.PI * (0.04 + (0.92 * i) / (n - 1));
            const x = Math.cos(ang) * 0.128;
            // Strands by the ears stop at the shoulders; the ones behind fall down the back.
            const behind = Math.sin(ang);
            const len = (braids ? 0.17 + 0.16 * behind : 0.11 + 0.08 * behind) + (i % 2) * 0.02;
            return <M key={i} color={color} geometry={capsule(braids ? 0.013 : 0.02, len)} position={[x * 1.03, 0.03 - len / 2, -behind * 0.128 - 0.012]} rotation={[-0.1 * behind, 0, x]} rough={0.95} />;
          })}
        </>
      );
    }
  }
}

function HeadWear({ g }: { g: Garment }) {
  const accent = g.accent ?? g.color;
  switch (g.shape) {
    case 'cap':
      return (
        <>
          <M color={g.color} geometry={dome(0.152)} position={[0, 0.04, -0.005]} />
          <M color={g.color} position={[0, 0.045, 0.15]} rotation={[0.12, 0, 0]}>
            <boxGeometry args={[0.18, 0.012, 0.11]} />
          </M>
        </>
      );
    case 'zanna':
      return (
        <>
          <M color={g.color} position={[0, 0.115, -0.005]}>
            <cylinderGeometry args={[0.128, 0.142, 0.12, 16]} />
          </M>
          <M color={accent} position={[0, 0.09, -0.005]}>
            <cylinderGeometry args={[0.144, 0.144, 0.025, 16]} />
          </M>
        </>
      );
    case 'fila':
      return (
        <M color={g.color} position={[0.03, 0.12, -0.01]} rotation={[0, 0, -0.35]}>
          <cylinderGeometry args={[0.1, 0.145, 0.14, 16]} />
        </M>
      );
    case 'beanie':
      return <M color={g.color} geometry={dome(0.155, 0.55)} position={[0, 0.02, -0.005]} rough={1} />;
    case 'gele':
      return (
        <>
          <M color={g.color} geometry={dome(0.152, 0.55)} position={[0, 0.03, -0.01]} />
          <M color={g.color} position={[0, 0.115, -0.03]} rotation={[-0.35, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.14, 0.1, 14]} />
          </M>
          {([-1, 1] as const).map((s) => (
            <M key={s} color={g.color} geometry={sphere(0.06)} position={[s * 0.12, 0.17, -0.04]} scale={[1.3, 0.35, 1]} rotation={[0, 0, s * -0.55]} />
          ))}
        </>
      );
    case 'hijab':
      return (
        <>
          {/* Wraps the head and frames the face (open at the front). */}
          <M color={g.color} double geometry={geo('hijab', () => new SphereGeometry(0.16, 18, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5))} position={[0, 0.0, -0.01]} scale={[0.95, 1.08, 1]} />
          <M color={g.color} geometry={lathe('hijab-drape', [[0.09, 0.02], [0.13, -0.08], [0.22, -0.2], [0.001, -0.2]])} position={[0, -0.09, -0.01]} scale={[1, 1, 0.8]} />
        </>
      );
    case 'turban':
      return (
        <>
          <M color={g.color} position={[0, 0.07, -0.005]}>
            <cylinderGeometry args={[0.155, 0.15, 0.13, 16]} />
          </M>
          <M color={g.color} geometry={dome(0.14)} position={[0, 0.13, -0.005]} />
          {/* The veil wrapped under the chin */}
          <M color={g.color} position={[0, -0.1, 0.02]} rotation={[Math.PI / 2 - 0.3, 0, 0]}>
            <torusGeometry args={[0.105, 0.03, 8, 16]} />
          </M>
        </>
      );
    case 'snapback':
      return (
        <>
          <M color={g.color} geometry={dome(0.152)} position={[0, 0.045, -0.005]} />
          <M color={accent} position={[0, 0.05, 0.16]} rotation={[0.02, 0, 0]}>
            <boxGeometry args={[0.2, 0.01, 0.12]} />
          </M>
        </>
      );
    case 'bucket':
      return (
        <>
          <M color={g.color} pat={patOf(g)} position={[0, 0.09, -0.005]}>
            <cylinderGeometry args={[0.13, 0.15, 0.1, 16]} />
          </M>
          <M color={g.color} pat={patOf(g)} position={[0, 0.045, -0.005]}>
            <cylinderGeometry args={[0.215, 0.215, 0.012, 20]} />
          </M>
        </>
      );
    case 'durag':
      return (
        <>
          <M color={g.color} geometry={dome(0.155, 0.6)} position={[0, 0.02, -0.01]} rough={0.3} />
          {([-1, 1] as const).map((s) => (
            <M key={s} color={g.color} position={[s * 0.03, -0.02, -0.17]} rotation={[0.2, 0, s * 0.2]}>
              <boxGeometry args={[0.03, 0.2, 0.008]} />
            </M>
          ))}
        </>
      );
    case 'headtie':
      return (
        <>
          <M color={g.color} pat={patOf(g)} geometry={dome(0.152, 0.5)} position={[0, 0.03, -0.01]} />
          <M color={g.color} pat={patOf(g)} geometry={sphere(0.06)} position={[0, 0.1, 0.1]} scale={[2, 0.8, 0.9]} />
        </>
      );
    default:
      return null;
  }
}

/** Handheld bags: hang from the right hand by their handles (a clutch is held in it). */
function HandBag({ g }: { g: Garment }) {
  const pat = patOf(g);
  const trim = shade(g.color, 0.7);
  if (g.shape === 'clutch') {
    return (
      <group position={[0.03, -FOREARM - 0.045, 0.05]}>
        <M color={g.color} pat={pat} rough={0.35}>
          <boxGeometry args={[0.032, 0.1, 0.2]} />
        </M>
        {/* Flap and clasp on the outside */}
        <M color={trim} rough={0.35} position={[0.004, 0.024, 0]}>
          <boxGeometry args={[0.032, 0.052, 0.202]} />
        </M>
        <M color={BUCKLE} rough={0.25} metal={0.85} position={[0.021, -0.004, 0]}>
          <boxGeometry args={[0.006, 0.02, 0.03]} />
        </M>
      </group>
    );
  }
  const satchel = g.shape === 'satchel';
  const tote = g.shape === 'tote';
  // Width (front to back), height and thickness of the bag, and how high its handles loop.
  const [w, h, d] = satchel ? [0.3, 0.2, 0.075] : tote ? [0.27, 0.23, 0.05] : [0.21, 0.14, 0.085];
  const loop = satchel ? 0.045 : tote ? 0.075 : 0.05;
  return (
    <group position={[0.03, -FOREARM - loop + 0.005, 0.01]}>
      {(satchel ? [0] : [-1, 1]).map((s) => (
        <M key={s} color={trim} position={[s * d * 0.3, -0.005, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[loop, 0.007, 5, 14, Math.PI]} />
        </M>
      ))}
      <M color={g.color} pat={pat} rough={0.45} position={[0, -h / 2, 0]}>
        <boxGeometry args={[d, h, w]} />
      </M>
      {tote ? (
        // Stitched rim round the open top
        <M color={trim} position={[0, -0.012, 0]}>
          <boxGeometry args={[d + 0.006, 0.024, w + 0.006]} />
        </M>
      ) : (
        // Flap over the top and down the outside, closed with a clasp or two buckled straps
        <>
          <M color={trim} rough={0.45} position={[0.004, -h * 0.26, 0]}>
            <boxGeometry args={[d + 0.004, h * 0.52 + 0.006, w + 0.006]} />
          </M>
          {(satchel ? [-1, 1] : [0]).map((s) => (
            <M key={s} color={BUCKLE} rough={0.25} metal={0.85} position={[d / 2 + 0.008, -h * 0.54, s * w * 0.27]}>
              <boxGeometry args={[0.006, 0.026, 0.026]} />
            </M>
          ))}
        </>
      )}
    </group>
  );
}

/** Bags worn on the body: a backpack, or a crossbody bag on a strap from the left shoulder to the right hip. */
function BodyBag({ g, f }: { g: Garment; f: boolean }) {
  const pat = patOf(g);
  const strap = shade(g.color, 0.7);
  switch (g.shape) {
    case 'backpack': {
      // How far the back and the chest stand out, so the pack sits on one and the straps clear the other.
      const back = f ? 0.094 : 0.107;
      const chest = f ? 0.09 : 0.108;
      return (
        <>
          <M color={g.color} pat={pat} geometry={capsule(0.1, 0.11)} position={[0, 0.31, -back - 0.05]} scale={[f ? 1 : 1.1, 1, 0.62]} />
          {/* Front pocket and the grab handle on top */}
          <M color={shade(g.color, 0.85)} geometry={capsule(0.07, 0.03)} position={[0, 0.25, -back - 0.1]} scale={[1.1, 1, 0.5]} />
          <M color={strap} position={[0, 0.465, -back - 0.04]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.028, 0.007, 5, 10, Math.PI]} />
          </M>
          {/* Each strap is a loop over the shoulder and back under the arm */}
          {([-1, 1] as const).map((s) => (
            <M key={s} color={strap} position={[s * (f ? 0.085 : 0.1), 0.4, 0]} rotation={[0, Math.PI / 2, 0]} scale={[chest / 0.14, 1, 2]}>
              <torusGeometry args={[0.14, 0.011, 6, 20]} />
            </M>
          ))}
        </>
      );
    }
    case 'crossbody': {
      const r = f ? 0.27 : 0.285;
      const depth = f ? 0.105 : 0.12;
      return (
        <>
          <group position={[f ? -0.03 : -0.02, 0.28, 0]} rotation={[0, 0, 1.03]}>
            <M color={strap} rotation={[Math.PI / 2, 0, 0]} scale={[1, depth / r, 2.2]}>
              <torusGeometry args={[r, 0.009, 6, 28]} />
            </M>
          </group>
          <group position={[f ? -0.105 : -0.11, 0.07, f ? 0.075 : 0.085]} rotation={[0, -0.5, 0]}>
            <M color={g.color} pat={pat} rough={0.45}>
              <boxGeometry args={[0.15, 0.11, 0.05]} />
            </M>
            <M color={strap} rough={0.45} position={[0, 0.026, 0.004]}>
              <boxGeometry args={[0.154, 0.062, 0.05]} />
            </M>
            <M color={BUCKLE} rough={0.25} metal={0.85} position={[0, -0.008, 0.031]}>
              <boxGeometry args={[0.024, 0.02, 0.006]} />
            </M>
          </group>
        </>
      );
    }
    default:
      return null;
  }
}

/** Side pockets on cargo pants. */
function CargoPockets({ color, f }: { color: string; f: boolean }) {
  return (
    <>
      {([-1, 1] as const).map((s) => (
        <M key={s} color={shade(color, 0.85)} position={[s * (f ? 0.11 : 0.105) * 1.35, -0.3, 0.02]}>
          <boxGeometry args={[0.03, 0.12, 0.1]} />
        </M>
      ))}
    </>
  );
}

const disc = (r: number) => geo(`disc:${r}`, () => new CylinderGeometry(r, r, 0.005, 16).rotateX(Math.PI / 2));
const TINTED = new Set(['shades', 'aviator', 'sport']);

function Eyes({ g }: { g?: Garment }) {
  if (!g) return null;
  const lens = TINTED.has(g.shape) ? '#0b0f19' : '#e0f2fe';
  const glass = { color: lens, rough: 0.1, metal: TINTED.has(g.shape) ? 0.3 : 0 };
  // Arms back to the ears, the same on every pair.
  const arms = ([-1, 1] as const).map((s) => (
    <M key={s} color={g.color} position={[s * 0.104, 0.01, -0.064]} rotation={[0, s * -0.37, 0]}>
      <boxGeometry args={[0.005, 0.008, 0.137]} />
    </M>
  ));
  if (g.shape === 'sport') {
    // One wraparound visor under a coloured brow
    return (
      <group position={[0, 0.012, 0.128]}>
        <M {...glass} position={[0, -0.002, 0.004]}>
          <boxGeometry args={[0.15, 0.036, 0.006]} />
        </M>
        {([-1, 1] as const).map((s) => (
          <M key={s} {...glass} position={[s * 0.088, -0.002, -0.008]} rotation={[0, s * -0.75, 0]}>
            <boxGeometry args={[0.04, 0.032, 0.006]} />
          </M>
        ))}
        <M color={g.color} position={[0, 0.019, 0.005]}>
          <boxGeometry args={[0.16, 0.009, 0.01]} />
        </M>
        {arms}
      </group>
    );
  }
  const round = g.shape === 'round' || g.shape === 'aviator';
  const r = g.shape === 'aviator' ? 0.031 : 0.027;
  return (
    <group position={[0, 0.012, 0.128]}>
      {([-1, 1] as const).map((s) =>
        round ? (
          // Round lens in a wire rim; aviators hang lower at the outside, like a teardrop
          <group key={s} position={[s * 0.047, g.shape === 'aviator' ? -0.004 : 0, 0.002]} rotation={[0, 0, g.shape === 'aviator' ? s * -0.25 : 0]} scale={g.shape === 'aviator' ? [1, 1.12, 1] : 1}>
            <M {...glass} geometry={disc(r)} />
            <M color={g.color} rough={0.3} metal={0.6}>
              <torusGeometry args={[r, 0.0035, 5, 18]} />
            </M>
          </group>
        ) : (
          <group key={s} position={[s * 0.047, 0, 0]}>
            <M {...glass}>
              <boxGeometry args={[0.058, g.shape === 'shades' ? 0.04 : 0.042, 0.006]} />
            </M>
            {/* Cat-eye frames sweep up to a point at the outer corners */}
            {g.shape === 'cateye' && (
              <M color={g.color} position={[s * 0.012, 0.022, 0.002]} rotation={[0, 0, s * 0.22]}>
                <boxGeometry args={[0.07, 0.012, 0.01]} />
              </M>
            )}
          </group>
        ),
      )}
      {/* The bridge: a brow bar on square frames, a wire (two on aviators) between round ones */}
      {round ? (
        (g.shape === 'aviator' ? [0.012, -0.002] : [0.004]).map((y) => (
          <M key={y} color={g.color} rough={0.3} metal={0.6} position={[0, y, 0.002]}>
            <boxGeometry args={[0.04, 0.004, 0.006]} />
          </M>
        ))
      ) : g.shape === 'cateye' ? (
        <M color={g.color} position={[0, 0.014, 0.002]}>
          <boxGeometry args={[0.04, 0.008, 0.008]} />
        </M>
      ) : (
        <M color={g.color} position={[0, 0.018, 0.002]}>
          <boxGeometry args={[0.2, 0.01, 0.01]} />
        </M>
      )}
      {arms}
    </group>
  );
}

/** The torso's radius at a height, read off its outline. */
function torsoRadius(body: Body, y: number) {
  const pts = TORSO[body];
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1];
    const [r1, y1] = pts[i];
    if (y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * Math.max(0, y - y0)) / (y1 - y0);
  }
  return 0;
}

/** A necklace lying on the body: round the back of the neck, over the shoulders and down the chest to `low`. */
const necklace = (body: Body, low: number, thick: number) =>
  geo(`necklace:${body}:${low}:${thick}`, () => {
    // Half the width of the loop where it crosses the shoulders, and how high the shoulders are there.
    const half = body === 'f' ? 0.068 : 0.076;
    const pts = TORSO[body];
    const j = pts.findIndex(([r], i) => i > 0 && pts[i - 1][0] >= half && r < half);
    const top = pts[j - 1][1] + ((pts[j][1] - pts[j - 1][1]) * (pts[j - 1][0] - half)) / (pts[j - 1][0] - pts[j][0]);
    const lift = thick * 0.5;
    const path: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const ang = -Math.PI / 2 + (Math.PI * i) / 12;
      const x = half * Math.sin(ang);
      const y = top + (low - top) * Math.cos(ang);
      const r = torsoRadius(body, y);
      path.push(new Vector3(x, y + lift * (1 - Math.cos(ang)), TORSO_DEPTH * Math.sqrt(Math.max(0, r * r - x * x)) + lift * Math.cos(ang)));
    }
    for (let i = 1; i < 8; i++) {
      const ang = (Math.PI * i) / 8;
      path.push(new Vector3(half * Math.cos(ang), top + lift, -TORSO_DEPTH * half * Math.sin(ang)));
    }
    return new TubeGeometry(new CatmullRomCurve3(path, true), 48, thick, 6, true);
  });

function Neck({ g, body }: { g?: Garment; body: Body }) {
  if (!g) return null;
  const gold = g.shape === 'chain';
  return <M color={g.color} rough={gold ? 0.25 : 0.6} metal={gold ? 0.85 : 0} geometry={gold ? necklace(body, 0.39, 0.007) : necklace(body, 0.43, 0.014)} />;
}

function Wrist({ g }: { g?: Garment }) {
  if (!g) return null;
  return (
    <M color={g.color} rough={0.25} metal={0.85} position={[0, -FOREARM + 0.035, 0]}>
      <cylinderGeometry args={[0.046, 0.046, 0.035, 12]} />
    </M>
  );
}
